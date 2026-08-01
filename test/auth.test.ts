/**
 * The session: what `/auth/me` really answers, and why a session does not unlock this surface.
 *
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 * THE `/auth/me` SHAPE, RE-READ FOR THIS REPOSITORY.
 *
 * Identity answers `{ user: {...}, session: {...}, organisations: [...] }` — the profile is NESTED
 * under `user`. The route is `identity/src/server.ts:891-903` and the body is built by
 * `toPublicUser` at `identity/src/users.ts:52-63`.
 *
 * The estate got this wrong at the root: the web template declared `interface Me { handle?, roles? }`
 * and read both off the TOP level. Four frontends inherited it, `roles` was then always null,
 * `isAdmin` in the shared bar was always false, and the switcher hid every `adminOnly` entry from
 * every signed-in operator.
 *
 * On this surface the consequence is now a missing switcher entry and nothing more, which is a
 * change worth writing down. `roles` used to decide whether a standing notice told the reader the
 * chain index would refuse them, because it served an admin and nobody else. It serves everybody
 * (`authoriseRead`, `indexer/src/server.ts:708-717`), the notice is deleted, and `roles` now
 * reaches the shared company bar and stops there.
 *
 * This file follows `micro-web-template/src/lib/auth.tsx:26` (the nested declaration) and `:98-99`
 * (the nested reads). It accepts ONLY the nested shape, and the template's own comment gives the
 * reason: "Tolerating the flat one as a fallback would encode a response identity does not send,
 * and the next reader would not be able to tell which is real." micro-mint-web keeps a flat
 * fallback for a rollback path; both were read, and the template's argument is the stronger one for
 * a repository being written now. The absence is PINNED below, so the choice is a decision.
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 */
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, it } from 'node:test'
import { readReader } from '../src/lib/auth.tsx'

const at = (p: string) => fileURLToPath(new URL(`../${p}`, import.meta.url))
const read = (p: string): string => readFileSync(at(p), 'utf8')

describe('reading the profile out of /auth/me', () => {
  it('reads the handle and the roles from under `user`', () => {
    const body = {
      user: { id: 'u1', handle: 'ada', roles: ['admin', 'support'] },
      session: { id: 's1', amr: ['pwd'] },
      organisations: [],
    }
    assert.deepEqual(readReader(body), { handle: 'ada', roles: ['admin', 'support'] })
  })

  it('reads NOTHING from the top level, which is where the estate got it wrong', () => {
    // The flat shape identity does not send. Accepting it would encode a response that does not
    // exist, and the next reader could not tell which was real.
    const flat = { handle: 'ada', roles: ['admin'] }
    assert.deepEqual(readReader(flat), { handle: null, roles: [] })
  })

  it('survives every shape a broken or absent answer can take', () => {
    for (const body of [null, undefined, 'nope', 42, {}, { user: null }, { user: 'ada' }]) {
      assert.deepEqual(readReader(body), { handle: null, roles: [] }, JSON.stringify(body))
    }
  })

  it('drops a non-string role rather than rendering one', () => {
    // `roles` decides whether this surface tells somebody the index will refuse them, so a
    // malformed entry must not become a truthy value in that decision.
    const body = { user: { handle: 'ada', roles: ['admin', 7, null, 'support'] } }
    assert.deepEqual(readReader(body).roles, ['admin', 'support'])
  })

  it('treats an empty handle as no handle', () => {
    assert.equal(readReader({ user: { handle: '', roles: [] } }).handle, null)
  })

  it('has no flat fallback anywhere in the source, and says why', () => {
    const source = read('src/lib/auth.tsx')
    assert.doesNotMatch(source, /body as \{ handle/, 'a flat fallback has appeared')
    assert.doesNotMatch(source, /\?\?\s*\(body as/, 'a flat fallback has appeared')
    assert.match(source, /identity\/src\/server\.ts:891-903/, 'the citation for the shape has gone')
    assert.match(source, /identity\/src\/users\.ts:52-63/, 'the citation for the body has gone')
  })
})

/* ══════════════════════════════════════════════════════════════════════════════════════════════
 * THE SESSION DECIDES NOTHING ON THIS SURFACE, AND THAT IS THE ASSERTION.
 *
 * There used to be a `servedByIndexer(reader)` predicate here — "would the chain index serve this
 * reader" — answered by the `admin` role, because `authorise` accepted a user principal only when
 * `isAdmin`. Its one caller was a standing notice that used it to choose between two wordings of
 * the same apology. The reads are anonymous now (`indexer/src/server.ts:708-717`), the notice is
 * deleted, and the predicate went with it.
 *
 * What replaces it is stronger than a test on a helper: NOTHING in this bundle consults the
 * session before, during or after a request to the chain index. A client that predicts an
 * authorisation decision is a client that will eventually disagree with the service making it, and
 * on a public surface it is also how a page quietly starts requiring an account.
 * ══════════════════════════════════════════════════════════════════════════════════════════════ */

describe('nothing consults the session to decide what to render or send', () => {
  it('exports no predicate about who the index would serve', () => {
    const source = read('src/lib/auth.tsx').replace(/\/\*[\s\S]*?\*\//g, '')
    assert.doesNotMatch(source, /export function servedByIndexer/, 'the predicate is back')
    assert.doesNotMatch(source, /served:/, 'the Session shape carries a served flag again')
  })

  it('no page reads the session at all', () => {
    // Stronger than the old assertion, which only banned two spellings. A page that imports
    // `useSession` has a branch that can depend on it, and every one of these pages renders chain
    // facts that are public.
    for (const page of ['chain', 'block', 'transaction', 'address', 'token', 'chains', 'search']) {
      assert.doesNotMatch(
        read(`src/pages/${page}.tsx`),
        /useSession|servedByIndexer|if \(!served\)/,
        `${page}.tsx consults the session; nothing it renders may depend on one`,
      )
    }
  })

  it('the shell reads it for the company bar and for nothing else', () => {
    // The one legitimate consumer, and it is narrowed to exactly the three fields the bar takes.
    const source = read('src/components/shell.tsx').replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
    assert.match(source, /const \{ account, signIn, signOut \} = useSession\(\)/)
    assert.doesNotMatch(source, /!served|servedByIndexer/, 'the shell branches on who the index serves')
    assert.doesNotMatch(source, /indexer:read/, 'the shell tells a reader to acquire a scope again')
  })
})

describe('there is no gate, and the reason is read off the service', () => {
  it('exports no ProtectedRoute', () => {
    // Stripped of comments: this file NAMES the thing it refuses in order to explain the refusal.
    const source = read('src/lib/auth.tsx').replace(/\/\*[\s\S]*?\*\//g, '')
    assert.doesNotMatch(source, /ProtectedRoute/)
  })

  it('states the reason with a citation somebody can go and check', () => {
    // The citation moved when the finding did. `:708-717` is `authoriseRead`, and the range is
    // pinned against the real source in test/indexer.test.ts rather than only spelled here.
    assert.match(read('src/lib/auth.tsx'), /indexer\/src\/server\.ts:727-736/)
    assert.doesNotMatch(
      read('src/lib/auth.tsx'),
      /indexer\/src\/server\.ts:698-716/,
      'the old authorise range is back; it is now the doc comment, not the function',
    )
  })
})

describe('the template this file follows really says what it is quoted as saying', () => {
  it('declares the nested shape at micro-web-template/src/lib/auth.tsx:26', () => {
    const template = at('../web-template/src/lib/auth.tsx')
    if (!existsSync(template)) return // not checked out; CI has it.
    const lines = readFileSync(template, 'utf8').split('\n')
    assert.equal((lines[25] ?? '').trim(), 'interface Me {', `:26 is: ${lines[25]}`)
    assert.equal((lines[26] ?? '').trim(), 'user?: {', `:27 is: ${lines[26]}`)
  })

  it('reads it nested at :98-99', () => {
    const template = at('../web-template/src/lib/auth.tsx')
    if (!existsSync(template)) return
    const lines = readFileSync(template, 'utf8').split('\n')
    assert.match(lines[97] ?? '', /me\?\.user\?\.handle/, `:98 is: ${lines[97]}`)
    assert.match(lines[98] ?? '', /me\?\.user\?\.roles/, `:99 is: ${lines[98]}`)
  })
})

describe('identity really does nest it', () => {
  it('at identity/src/server.ts:891-903', () => {
    const identity = at('../identity/src/server.ts')
    if (!existsSync(identity)) return // not checked out; CI has it.
    const lines = readFileSync(identity, 'utf8').split('\n')
    assert.match(lines[890] ?? '', /define\('GET', '\/auth\/me'/, `:891 is: ${lines[890]}`)
    const body = lines.slice(890, 903).join('\n')
    assert.match(body, /user: toPublicUser\(user\)/, 'the profile is no longer nested under `user`')
  })

  it('and toPublicUser is where the roles come from, at identity/src/users.ts:52-63', () => {
    const users = at('../identity/src/users.ts')
    if (!existsSync(users)) return
    const lines = readFileSync(users, 'utf8').split('\n')
    assert.match(lines[51] ?? '', /export function toPublicUser/, `:52 is: ${lines[51]}`)
    assert.match(lines.slice(51, 63).join('\n'), /roles: row\.roles/, 'roles left the public user')
  })
})
