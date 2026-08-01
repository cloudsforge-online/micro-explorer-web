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
 * On THIS surface the consequence is larger than a missing switcher entry. `roles` is what decides
 * whether the standing notice is shown, because the chain index serves an admin and refuses
 * everybody else (`indexer/src/server.ts:695`). A flat read would make `roles` always empty, so an
 * operator who CAN read the index would be told, on every page, that they cannot.
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
import { readReader, servedByIndexer } from '../src/lib/auth.tsx'

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

describe('whether the chain index will serve this reader', () => {
  it('is the admin role, which is the predicate the SERVICE uses', () => {
    assert.equal(servedByIndexer({ handle: 'ada', roles: ['admin'] }), true)
    assert.equal(servedByIndexer({ handle: 'ada', roles: ['support', 'billing'] }), false)
    assert.equal(servedByIndexer({ handle: null, roles: [] }), false)
  })

  it('is used to WORD a refusal and never to withhold a request', () => {
    // A client that pre-empts an authorisation decision is a client that will eventually disagree
    // with it. Every panel sends its request and lets the service answer; this predicate only
    // decides which sentence the standing notice uses.
    const source = read('src/lib/auth.tsx')
    assert.match(source, /never to decide whether to send a request/)
    for (const page of ['chain', 'block', 'transaction', 'address', 'token']) {
      assert.doesNotMatch(
        read(`src/pages/${page}.tsx`),
        /servedByIndexer|if \(!served\)/,
        `${page}.tsx decides for itself whether the service would answer`,
      )
    }
  })
})

describe('there is no gate, and the reason is read off the service', () => {
  it('exports no ProtectedRoute', () => {
    // Stripped of comments: this file NAMES the thing it refuses in order to explain the refusal.
    const source = read('src/lib/auth.tsx').replace(/\/\*[\s\S]*?\*\//g, '')
    assert.doesNotMatch(source, /ProtectedRoute/)
  })

  it('states the finding with a citation somebody can go and check', () => {
    assert.match(read('src/lib/auth.tsx'), /indexer\/src\/server\.ts:679-697/)
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
