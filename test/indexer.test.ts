/**
 * THE ROUTE TABLE, CHECKED AGAINST THE SERVICE THAT SERVES IT.
 *
 * Every client in this estate that was built against an imagined surface passed its own tests.
 * That is the whole problem: a test asserting "the client calls /v1/blocks/…" is a test that the
 * client agrees with itself. So this file does not assert paths in the abstract — it reads
 * `indexer/src/server.ts` from the sibling checkout and requires that each path and method this
 * bundle calls is registered there, found by SEARCHING that file for the symbol. Never at a line
 * number: micro-org#235 retired those estate-wide, and every pin in this file that once named a
 * position in a repository this one does not own has already gone stale at least once. The
 * incidents are recorded beside the checks that replaced them.
 *
 * ── Four things this file checks that a naive version would not ───────────────────────────────
 *
 * **1. WHOLE PATH SHAPES, NEVER PREFIXES AND NEVER A SEGMENT COUNT.** `micro-market`'s first guard
 * matched `path.startsWith(servedPrefix)` and judged **zero of two genuinely dead paths** as
 * unserved, because both began with a prefix the indexer really does serve
 * (`market/src/indexerclient.test.ts`). Its segment helper then collapsed
 * `/transactions/${scope}/${hash}/confirmations` to five segments — exactly the shape of a
 * DIFFERENT route — and reported it fine (`market/src/indexerclient.test.ts`). The
 * corrected `matches` is copied from that file rather than invented a third time, and the mutation
 * test below re-runs its whole dead list.
 *
 * **2. HOW each route authenticates, not merely whether.** `micro-trade-web` found that four
 * `micro-trade` routes authenticate through a helper (`ownedBot`) with no literal
 * `authenticate(ctx, deps)` in the handler, so a body grep declared them public and would have
 * produced a client sending no bearer. `micro-indexer` now has TWO helpers, `authoriseRead` and
 * `authorise`, and which one a handler calls is the whole difference between a public read and a
 * gated write. This file records the helper per route and pins both of them, so "it is public"
 * cannot decay into "nobody re-read the handler".
 *
 * **3. THE AUTHORITY CONTRACT, PINNED IN BOTH DIRECTIONS.** The seven reads are ANONYMOUS and this
 * app sends no bearer for one; the two writes, a presented-but-broken token, and an unscoped
 * service are all still refused. Both halves are asserted against the real source, because a
 * client that quietly starts depending on either is a client that breaks the day it is deployed
 * somewhere the assumption does not hold. A finding recorded only in prose is a finding that
 * outlives its truth — which is exactly what happened to the previous version of this block, and
 * why it was written as a test that would go red the day the service was fixed. It did.
 *
 * **4. WHICH HEAD EACH CONFIRMATION COUNT IS AGAINST.** `CONFIRMATIONS_AGAINST` in
 * `src/lib/indexer.ts` claims that `confirmation` counts against the walked head and that `block`,
 * `transaction` and `activity` count against `checkpoint.tipHeight`. That is the claim every
 * "vs claimed tip" label on the surface rests on, so it is checked against `indexer/src/reads.ts`
 * rather than trusted.
 *
 * ── What happens without the sibling ──────────────────────────────────────────────────────────
 *
 * The service is a private repository. `pnpm test` must pass for somebody who has cloned only this
 * one, so a missing checkout SKIPS the cross-repository half — and, because a skipped test is an
 * unmeasured one, CI is where absence becomes a failure: the `check` job checks micro-indexer out
 * and the workflow asserts the cross-check REALLY RAN by requiring the count in the output, then
 * bends one citation by a line and requires the suite to go red. Neither half can go quiet on its
 * own.
 */
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, it } from 'node:test'
import {
  CHAIN_IDS,
  CONFIRMATIONS_AGAINST,
  NETWORKS,
  PARTIAL_DETAIL_KEY,
  partialMarker,
  type PartialBlockReason,
} from '../src/lib/indexer.ts'

const here = (p: string) => fileURLToPath(new URL(`../${p}`, import.meta.url))

/** Where a micro-indexer checkout is, in the order CI and a developer's machine put it. */
const INDEXER_CANDIDATES = [
  process.env['CLOUDSFORGE_INDEXER_DIR'],
  here('../indexer'),
  here('.indexer'),
].filter((v): v is string => Boolean(v))

const indexerRoot = INDEXER_CANDIDATES.find((p) => existsSync(`${p}/src/server.ts`))

const client = readFileSync(here('src/lib/indexer.ts'), 'utf8')

/**
 * How one route decides who may call it. THREE states, not two.
 *
 * It was a pair — `authoriseRead` (anonymous is served) or `authorise` (a write, `indexer:write`)
 * — and that pair was a complete description of the service until `GET /custody/:chain/:network/
 * /total` arrived. That route is a READ that takes a token: `authorise(ctx, deps, READ_SCOPE)`.
 * A two-valued column would have had to call it a write, which is false and would have put it in
 * the "declined because it takes indexer:write" list under a reason that is not the reason.
 *
 * So the scope travels with the helper name. The checks below match on the whole value, so a
 * route that changed from `authorise:READ_SCOPE` to `authorise:WRITE_SCOPE` — a real change in
 * who can call it — cannot pass by still containing the word `authorise`.
 */
type Gate = 'authoriseRead' | 'authorise:READ_SCOPE' | 'authorise:WRITE_SCOPE'

/**
 * The surface this bundle uses, with the line each was read from and the GATE it opens with.
 *
 * `line` is the line in `DOMAIN` that REGISTERS the route; `handler` is the line the handler
 * function is declared at. Both are cited in the client, and both are checked, because a route can
 * be moved in the table without its handler moving and vice versa.
 *
 * `gate` was `READ_SCOPE | WRITE_SCOPE` until `micro-indexer` opened the reads. It became the
 * NAME OF THE HELPER, because that is where the difference lives: `authoriseRead` serves a caller
 * with no token, `authorise` refuses one. A column recording a scope could not have expressed
 * "there is no scope", which is the point.
 *
 * It now records the helper AND, for `authorise`, the scope — see `Gate`. Two values could not
 * express the route the service grew.
 */
const SURFACE: ReadonlyArray<{
  method: string
  path: string
  gate: Gate
}> = [
  { method: 'GET', path: '/chains/:chain/:network/status', gate: 'authoriseRead' },
  { method: 'GET', path: '/addresses/:chain/:network/:address/activity', gate: 'authoriseRead' },
  { method: 'GET', path: '/addresses/:chain/:network/:address/token-balances', gate: 'authoriseRead' },
  { method: 'GET', path: '/transactions/:chain/:network/:hash', gate: 'authoriseRead' },
  { method: 'GET', path: '/transactions/:chain/:network/:hash/confirmations', gate: 'authoriseRead' },
  { method: 'GET', path: '/tokens/:chain/:network/:address', gate: 'authoriseRead' },
  { method: 'GET', path: '/blocks/:chain/:network/:height', gate: 'authoriseRead' },
]

/**
 * Routes the indexer serves that this bundle deliberately does NOT call, each with the reason.
 *
 * Enumerated rather than ignored, so the "knows about everything the service serves" check below
 * can be exact in both directions: a route this app has never heard of should make somebody look,
 * and a route it has decided against should not.
 */
const DECLINED: ReadonlyArray<{
  method: string
  path: string
  gate: Gate
  why: string
}> = [
  {
    method: 'GET',
    path: '/custody/:chain/:network/total',
    gate: 'authorise:READ_SCOPE',
    why:
      'indexer:read, and the ONLY domain GET on this service that takes a token. It answers Σ ' +
      'confirmed native balance over the estate’s custody set — the number micro-ledger ' +
      'reconciles its own books against. Every other read answers about a block, a hash or an ' +
      'address the caller already named, and naming it is what makes the answer public; this one ' +
      'answers about a SET only the platform knows, so serving it anonymously would publish the ' +
      'treasury’s size to anyone who can reach the port (indexer/src/server.ts). A public ' +
      'block explorer has no business holding a service token, and nothing on this surface has a ' +
      'use for the number.',
  },
  {
    method: 'GET',
    path: '/custody/:chain/:network/addresses/:address',
    gate: 'authorise:READ_SCOPE',
    why:
      'indexer:read, and the SECOND domain GET that takes a token. It answers one named ' +
      'custody address’s observed balance at the same measurement depth — same confirmation ' +
      'depth, same block hash — that the aggregate above is taken at, so micro-ledger can break a ' +
      'failed reconciliation down to the address that moved rather than re-deriving a number the ' +
      'two sides measured differently (indexer/src/server.ts). It is gated for the aggregate’s ' +
      'reason and not for the caller-named-it reason: the ADDRESS is named, but it is named out ' +
      'of the estate’s custody set, so answering at all confirms membership of that set — which ' +
      'is the fact the total is protecting. A public block explorer holds no service token, and ' +
      'the balance of an address this surface can already read anonymously through ' +
      'token-balances is not what this route is for.',
  },
  {
    method: 'POST',
    path: '/watch/:chain/:network/:address',
    gate: 'authorise:WRITE_SCOPE',
    why: 'indexer:write — enlarging what a shared deployment indexes is not a browser decision',
  },
  {
    method: 'POST',
    path: '/backfills/:chain/:network',
    gate: 'authorise:WRITE_SCOPE',
    why: 'indexer:write — enqueues a range walk, with a cost attached',
  },
]

/** Both spellings of every route, because `PREFIXES` mounts each twice. */
const BOTH_SPELLINGS = [...SURFACE, ...DECLINED].flatMap((r) => [r.path, `/v1${r.path}`])

/**
 * Does a requested path match a served pattern? Same segment count, and every segment agrees.
 *
 * **Segment counts, never prefixes**, and copied verbatim from
 * `market/src/indexerclient.test.ts` rather than written again. The version that shipped
 * first there matched by prefix and passed both of the dead paths it existed to catch.
 */
function matches(requested: string, pattern: string): boolean {
  const asked = requested.split('/')
  const serves = pattern.split('/')
  if (asked.length !== serves.length) return false
  return serves.every((segment, index) => {
    const mine = asked[index] ?? ''
    return segment.startsWith(':') ? mine.length > 0 : segment === mine
  })
}

/**
 * `${...}` is exactly ONE segment.
 *
 * So a helper standing for two — a `${scope}` holding `chain/network` — produces a path one segment
 * short of every pattern and is refused rather than guessed at. `market/src/indexerclient.test.ts`
 * records why that is deliberate: a checker that accepts a path whose shape it cannot see would
 * have passed the defect it exists to catch.
 */
const placeholder = (path: string): string => path.replace(/\$\{[^}]*\}/g, 'x')

/** Every request path this client sends, read out of its source with the prose stripped. */
export function requestedPaths(source: string): readonly string[] {
  // COMMENTS STRIPPED FIRST. This file and the client both quote dead paths in prose, and a
  // checker that cannot tell a request from a sentence about one is not a checker.
  const code = source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((line) => !/^\s*(\/\/|\*)/.test(line))
    .join('\n')
  return [...code.matchAll(/`(\/v1\/[^`]*)`/g)].map((m) => m[1] ?? '').filter((p) => p.length > 1)
}

describe('the client calls only routes it has cited', () => {
  it('sends the seven request paths this surface table names, and no others', () => {
    const paths = requestedPaths(client)
    assert.equal(paths.length, 7, `expected seven request paths, found: ${paths.join(', ')}`)

    const unserved = paths.filter((p) => !BOTH_SPELLINGS.some((r) => matches(placeholder(p), r)))
    assert.deepEqual(
      unserved,
      [],
      `these paths are not whole route shapes micro-indexer serves: ${unserved.join(', ')}`,
    )
  })

  it('asks for each of the seven exactly once, so a page cannot be reading the wrong one', () => {
    const shapes = requestedPaths(client).map(placeholder).sort()
    assert.deepEqual(shapes, [
      '/v1/addresses/x/x/x/activity',
      '/v1/addresses/x/x/x/token-balances',
      '/v1/blocks/x/x/x',
      '/v1/chains/x/x/status',
      '/v1/tokens/x/x/x',
      '/v1/transactions/x/x/x',
      '/v1/transactions/x/x/x/confirmations',
    ])
  })

  it('names every route in its own table, and says which file it read them from', () => {
    // It used to require the client to repeat a LINE NUMBER for each route, which made three
    // copies of one fact — the service, the tables here and the client's prose — of which two live
    // in a repository that never sees micro-indexer change. The METHOD and the PATH are what this
    // client actually depends on; the checks further down prove they are really served.
    for (const route of [...SURFACE, ...DECLINED]) {
      assert.ok(
        client.includes(route.path.startsWith('/v1') ? route.path : `/v1${route.path}`),
        `${route.method} ${route.path} is not written down in src/lib/indexer.ts`,
      )
    }
    assert.ok(
      client.includes('indexer/src/server.ts'),
      'src/lib/indexer.ts no longer says which service source its surface was read from',
    )
  })

  it('writes every scope segment out, with no helper standing for chain/network', () => {
    // The defect `market/src/indexerclient.test.ts` measures: a four-segment
    // `/transactions/${scope}/${hash}/confirmations` matches `/transactions/:chain/:network/:hash`,
    // a DIFFERENT route, so a shape check reports it fine. Asserted positively: every path this
    // client sends carries `seg(scope.chain)/${seg(scope.network)` adjacently.
    const code = client.replace(/\/\*[\s\S]*?\*\//g, '')
    assert.doesNotMatch(code, /\$\{seg\(scope\)\}/, 'a helper stands for the whole scope')
    const pairs = [...code.matchAll(/\$\{seg\(scope\.chain\)\}\/\$\{seg\(scope\.network\)\}/g)]
    assert.equal(pairs.length, 7, `expected seven two-segment scopes, found ${pairs.length}`)
  })
})

describe('the shape check can say no', () => {
  it('refuses every dead path this estate has actually shipped, including served PREFIXES', () => {
    // Copied from `market/src/indexerclient.test.ts`, plus this repository's own
    // near-misses. The first entry is the exact path `micro-mint` shipped, and it BEGINS with
    // `/v1/chains/`, which the indexer really does serve. A prefix test calls it fine.
    const dead = [
      '/v1/chains/${chain}/${network}/transactions/${hash}',
      '/v1/chains/${chain}/transactions/${hash}/escrow',
      '/v1/tokens/${urn}/facts',
      '/v1/receipts/${chain}/${network}/${hash}',
      '/v1/transactions/${chain}/${network}/${hash}/confirmations/latest',
      // Plausible shapes for an explorer that this service does not serve. Naming them is the
      // point: the temptation on this surface is to invent `/blocks/.../latest`.
      '/v1/blocks/${chain}/${network}/latest/transactions',
      '/v1/addresses/${chain}/${network}/${address}',
      '/v1/chains/${chain}/${network}/blocks',
    ]
    for (const path of dead) {
      assert.equal(
        BOTH_SPELLINGS.some((r) => matches(placeholder(path), r)),
        false,
        `${path} is not served by micro-indexer, but this check accepted it`,
      )
    }
  })

  it('and it is not simply refusing everything', () => {
    for (const route of BOTH_SPELLINGS) {
      assert.ok(matches(route, route), route)
    }
    assert.ok(
      matches(
        '/v1/transactions/ember/testnet/0xabc/confirmations',
        '/v1/transactions/:chain/:network/:hash/confirmations',
      ),
    )
  })

  it('the collapsed-scope form matches a DIFFERENT route, which is why it is banned', () => {
    // Measured rather than asserted in prose, because it is the strongest argument for writing
    // every segment out. Same measurement as market/src/indexerclient.test.ts.
    assert.equal(
      BOTH_SPELLINGS.some((r) =>
        matches(placeholder('/v1/transactions/${scope}/${hash}/confirmations'), r),
      ),
      true,
      'the scope form was expected to match a DIFFERENT route — if it no longer does, rewrite this note',
    )
    assert.equal(placeholder('/v1/transactions/${scope}/${hash}/confirmations').split('/').length, 6)
    assert.equal(
      placeholder('/v1/transactions/${chain}/${network}/${hash}/confirmations').split('/').length,
      7,
    )
  })
})

/*
 * ── THE NAME OF THIS SUITE WAS THE LAST LINE-NUMBER CITATION IN THIS FILE (micro-org#235) ──────
 *
 * It was called "the cited lines are the lines that register the routes", and it earned that name:
 * `SURFACE` and `DECLINED` each carried a `line` and a `handler` line number per route, and the
 * body sliced `indexer/src/server.ts` at them. Every one of those pins has since been replaced by
 * a search — `domainEntry` finds the DOMAIN entry and yields the handler NAME, the PREFIXES loop
 * is found and read three consecutive lines forward, the two helpers are located by declaration,
 * the reads paragraph by its heading, the port by its expression — and each replacement carries
 * the incident that forced it. Nothing under this name has cited a line for some time.
 *
 * The name did, and a name is where a reader looks first. micro-org#235 retired line-anchored
 * cross-repository citations across this estate because they rot; a heading that still promises
 * them tells the next person that pinning positions in `micro-indexer` is how this file works, and
 * "line 45 of the TAP output" is the form the failure arrived in. Renamed 2026-08-09 to say what
 * the suite actually does: it reads a FILE and looks for SYMBOLS in it.
 */
describe('micro-indexer registers these routes, found in indexer/src/server.ts by symbol', () => {
  if (indexerRoot === undefined) {
    // NOT a silent pass, and no longer a LOUD one either. This used to be a green test named
    // "SKIPPED", which still counted towards `pass` and towards the number a reader compares
    // between runs. `t.skip()` puts it in the `skipped` column, where an unmeasured check belongs.
    // CI checks micro-indexer out and makes the absence fatal.
    it('no micro-indexer checkout — CI checks one out and requires this to run', (t) => {
      t.skip('micro-indexer is not checked out')
    })
    return
  }

  const server = readFileSync(`${indexerRoot}/src/server.ts`, 'utf8')
  const lines = server.split('\n')
  const reads = readFileSync(`${indexerRoot}/src/reads.ts`, 'utf8')
  const chains = readFileSync(`${indexerRoot}/src/chains.ts`, 'utf8')
  const env = readFileSync(`${indexerRoot}/src/env.ts`, 'utf8')
  // Read through `existsSync` rather than straight, unlike the four above. Those four are as old as
  // the service; `btcsource.ts` arrived with micro-indexer#7 and holds one small vocabulary this
  // bundle depends on, so it is the file most likely to be renamed or folded into another. A throw
  // here would happen while the describe body runs and would take the WHOLE suite down with a
  // filesystem stack trace, which is the least legible way for a cross-repository check to fail.
  // Empty instead, and the first test below says plainly that the file is gone.
  const btcsourcePath = `${indexerRoot}/src/btcsource.ts`
  const btcsource = existsSync(btcsourcePath) ? readFileSync(btcsourcePath, 'utf8') : ''

  it('reads a server with a route table in it, so this cannot pass on an empty file', () => {
    // TWO things, and NO NUMBER WRITTEN HERE.
    //
    // The first is what the name says: a table with entries in it, so nothing below can pass by
    // reading an empty or renamed file.
    //
    // The second is that the tables above account for every one of them — and it is the LENGTH OF
    // THOSE TABLES, not a literal. A literal here is a third copy of a fact micro-indexer owns:
    // it said TEN, `micro-indexer` ed9db36 added `GET /custody/:chain/:network/addresses/:address`
    // and this repository went red for an edit that touched nothing it calls, alongside
    // micro-network-site, which had the same number written down. Bumping it to ELEVEN would buy
    // one release. Reading it from SURFACE and DECLINED means the only way to satisfy this check
    // is to have READ the new route and put it in one of them with its reason — which is the
    // thing actually worth requiring, and is what the both-directions check below then verifies
    // against the service.
    const entries = lines.filter((l) => /^\s{2}\['(GET|POST)',/.test(l))
    assert.ok(entries.length > 0, 'indexer/src/server.ts has no DOMAIN entries in it at all')
    const known = [...SURFACE, ...DECLINED]
    assert.equal(
      entries.length,
      known.length,
      `micro-indexer registers ${entries.length} DOMAIN entries; the tables here cover ${known.length}`,
    )
  })

  /**
   * The `DOMAIN` entry for a route, found by SEARCHING for it rather than by citing a line — and
   * it yields the HANDLER NAME, which is what every gate check below is anchored on.
   *
   * The tables above used to carry two line numbers per route, one for the entry and one for the
   * handler, and those line numbers are why this repository kept turning red for edits made in a
   * different one: `micro-indexer` f9344de inserted the custody total and its header, everything
   * below it moved, and every citation here pointed somewhere else while the routes themselves
   * were untouched. Nothing runs this suite when that service changes, so it surfaced at a release.
   *
   * Searching costs one pass over a file already in memory and cannot go stale. Reading the
   * handler NAME out of the entry is also strictly stronger than a second line number: it proves
   * the route and the handler this bundle reasons about are the pair the service actually wired
   * together, which two independently-maintained line numbers never did.
   */
  const domainEntry = (method: string, path: string): string | null => {
    const re = new RegExp(`^\\s{2}\\['${method}',\\s*'${path.replace(/[/:]/g, '\\$&')}',\\s*(\\w+)\\]`)
    for (const l of lines) {
      const m = re.exec(l)
      if (m?.[1]) return m[1]
    }
    return null
  }

  for (const route of [...SURFACE, ...DECLINED]) {
    it(`${route.method} ${route.path} is registered in indexer/src/server.ts`, () => {
      assert.ok(
        domainEntry(route.method, route.path) !== null,
        `${route.method} ${route.path} is not in micro-indexer's DOMAIN table at all`,
      )
    })
  }

  it('this bundle calls nothing the indexer does not serve, and knows about everything it does', () => {
    // Both directions. A route the service grew that neither table has heard of is not a failure of
    // the app, but it IS the moment somebody should look — citations are only trustworthy while
    // somebody is re-reading them.
    const registered = lines
      .map((l) => /^\s{2}\['([A-Z]+)',\s*'([^']+)'/.exec(l))
      .filter((m): m is RegExpExecArray => m !== null)
      .map((m) => `${m[1]} ${m[2]}`)
    const known = [...SURFACE, ...DECLINED].map((r) => `${r.method} ${r.path}`)
    assert.deepEqual(
      registered.filter((r) => !known.includes(r)),
      [],
      'micro-indexer serves a route this app has never read. Read it, then add or decline it here.',
    )
  })

  it('BOTH spellings really are mounted, which is what makes the /v1 form safe', () => {
    // The client uses `/v1` throughout. That is only correct while PREFIXES contains it — and
    // `market/src/indexerclient.test.ts` records that a previous reader believed the
    // opposite and wrote it down.
    assert.match(server, /const PREFIXES: readonly string\[\] = \['\/v1', ''\]/)
    // And the loop that mounts them — the three statements found and read IN ORDER rather than at
    // lines 416, 417 and 418. Consecutive is the property that matters: a `for` over PREFIXES that
    // did not contain the push would mount nothing, while all three lines still existed somewhere
    // in the file and three independent line pins would all pass.
    const at = lines.findIndex((l) => /for \(const prefix of PREFIXES\)/.test(l))
    assert.ok(at >= 0, 'buildRoutes no longer loops over PREFIXES; the /v1 form is not mounted')
    assert.match(lines[at + 1] ?? '', /for \(const \[method, path, handler\] of DOMAIN\)/)
    assert.match(lines[at + 2] ?? '', /built\.push\(route\(method, `\$\{prefix\}\$\{path\}`, handler\)\)/)
  })

  /**
   * A handler body: from its `async function <name>` to the next blank-line-then-`async function`,
   * or to the end of the handler section.
   *
   * Bounded by the NEXT handler declaration rather than by a brace count, because a brace counter
   * over TypeScript with template literals in it is a parser, and a wrong parser here would read
   * the next handler's `authorise` call as this one's — which is exactly the failure
   * `micro-trade-web` documents its own `bodyOf` guarding against.
   */
  const bodyOf = (method: string, path: string): string => {
    const handler = domainEntry(method, path)
    assert.ok(handler, `${method} ${path} is not in micro-indexer's DOMAIN table`)
    const start = lines.findIndex((l) => new RegExp(`^async function ${handler}\\(`).test(l))
    assert.ok(start >= 0, `${handler} is declared nowhere in indexer/src/server.ts`)
    let end = lines.length
    for (let i = start + 1; i < lines.length; i++) {
      if (/^async function /.test(lines[i] ?? '') || /^\/\* -+ parameters/.test(lines[i] ?? '')) {
        end = i
        break
      }
    }
    return lines.slice(start, end).join('\n')
  }

  it('every route this app calls opens with the gate this app believes, and no other', () => {
    for (const route of [...SURFACE, ...DECLINED]) {
      const body = bodyOf(route.method, route.path)
      assert.match(
        body,
        /^async function \w+\(ctx: RequestContext, deps: ServerDeps\)/,
        `${route.method} ${route.path}: what DOMAIN names as its handler is not a handler declaration`,
      )
      if (route.gate === 'authoriseRead') {
        assert.match(
          body,
          /await authoriseRead\(ctx, deps\)/,
          `${route.method} ${route.path}: this app believes it is an anonymous read, and the handler does not call authoriseRead`,
        )
        // …and NOT a scoped gate. `authoriseRead` is a substring-free name here on purpose: a
        // handler calling `authorise(ctx, deps, READ_SCOPE)` would satisfy a sloppier check by
        // containing the word, and would 401 every visitor to this explorer. That is not
        // hypothetical any more — `custodyTotal` is exactly such a handler.
        assert.doesNotMatch(
          body,
          /await authorise\(ctx, deps,/,
          `${route.method} ${route.path} has been RE-GATED — this app calls it with no bearer and would now get a 401`,
        )
      } else {
        // The WHOLE value, scope included. A route moving between the two scopes changes who may
        // call it, and a check that only looked for `authorise(` would not notice.
        const scope = route.gate.slice('authorise:'.length)
        assert.match(
          body,
          new RegExp(`await authorise\\(ctx, deps, ${scope}\\)`),
          `${route.method} ${route.path}: this app declines it because it takes ${scope}, and the handler no longer asks for it`,
        )
      }
    }
  })

  /* ────────────────────────────────────────────────────────────────────────────────────────────
   * THE AUTHORITY CONTRACT.
   *
   * The previous version of this block asserted the opposite — that NOT ONE domain route was
   * anonymous — and carried a note saying it would go red the day that was fixed, "which is the
   * correct outcome: somebody then has to come back and delete the refusal machinery instead of
   * leaving a surface that apologises for a restriction that no longer exists". `micro-indexer`
   * commit d013dd4 made the seven reads anonymous, this went red, and the machinery is deleted.
   *
   * These tests are the replacement, written to the same standard rather than deleted, and they
   * are load-bearing in BOTH directions:
   *
   *   * if a read is re-gated, this app is sending no bearer and every panel 401s. RED.
   *   * if this app starts sending one, an expired token turns a public page into a refusal. RED.
   *   * if the WRITE gate is relaxed, or a broken token is silently downgraded to anonymous, this
   *     app has not changed but its picture of the service has. RED — because a client that has
   *     stopped understanding what it talks to is one edit away from depending on the difference.
   * ──────────────────────────────────────────────────────────────────────────────────────────── */

  it('all seven reads are ANONYMOUS: authoriseRead serves a caller with no token', () => {
    const reads = SURFACE
    assert.equal(reads.length, 7, 'the surface table no longer covers all seven read routes')
    for (const route of reads) {
      assert.match(
        bodyOf(route.method, route.path),
        /await authoriseRead\(ctx, deps\)/,
        `${route.method} ${route.path} no longer reaches authoriseRead — a public explorer cannot read it`,
      )
    }

    // The helper itself, and the branch that is the whole contract: no token, no principal, and
    // the handler runs anyway. Asserted on the SOURCE of the function rather than on its name,
    // because a function called `authoriseRead` that threw would pass every check above.
    const at = server.indexOf('async function authoriseRead(')
    assert.ok(at > 0, 'authoriseRead is gone from indexer/src/server.ts')
    const fn = server.slice(at, server.indexOf('\nasync function authorise(', at))
    assert.match(
      fn,
      /const token = bearerFrom\(headerOf\(ctx\.req, 'authorization'\)\)\n\s*if \(!token\) return null/,
      'authoriseRead no longer returns null for a caller with no token — the reads have been re-gated',
    )
    assert.doesNotMatch(fn, /throw new TokenError/, 'authoriseRead has grown a missing-token throw')
  })

  it('…and the domain handlers are exactly seven anonymous reads, two reads that take a token and two gated writes', () => {
    // Counted off the SERVICE rather than off the table above, so a route that changed gate
    // without anybody updating this file is a failure rather than an agreement with ourselves.
    //
    // It was "nine handlers … seven anonymous and two gated writes", and that sentence was a
    // complete description of the service until the custody total arrived. Note what the old
    // arithmetic would have done with it: `gated` matched only WRITE_SCOPE, so a READ_SCOPE
    // handler would have landed in NEITHER bucket and the final `anonymous + gated === 9` is what
    // would have caught it. That line is why the third bucket is named here rather than folded in.
    //
    // The custody total then stopped being the ONLY read that takes a token — `micro-indexer`
    // ed9db36 added the per-address balance beside it, gated the same way — so the bucket is
    // sized off the tables rather than pinned at one. What each bucket must equal is the
    // corresponding table; the totals are consequences of that and are not written down twice.
    const handlers = [...SURFACE, ...DECLINED]
    const bodies = new Map(handlers.map((r) => [r, bodyOf(r.method, r.path)] as const))
    const anonymous = handlers.filter((r) => /await authoriseRead\(ctx, deps\)/.test(bodies.get(r) ?? ''))
    const readScoped = handlers.filter((r) => /await authorise\(ctx, deps, READ_SCOPE\)/.test(bodies.get(r) ?? ''))
    const gated = handlers.filter((r) => /await authorise\(ctx, deps, WRITE_SCOPE\)/.test(bodies.get(r) ?? ''))
    assert.deepEqual(
      anonymous.map((r) => `${r.method} ${r.path}`).sort(),
      SURFACE.map((r) => `${r.method} ${r.path}`).sort(),
      'the set of anonymous routes upstream is not the set this app calls without a bearer',
    )
    assert.deepEqual(
      [...readScoped, ...gated].map((r) => `${r.method} ${r.path}`).sort(),
      DECLINED.map((r) => `${r.method} ${r.path}`).sort(),
      'the set of token-taking routes upstream is not the set this app declines',
    )
    // Each route in exactly one bucket, and every route in one.
    assert.deepEqual(
      handlers
        .filter((r) => [anonymous, readScoped, gated].filter((b) => b.includes(r)).length !== 1)
        .map((r) => `${r.method} ${r.path}`),
      [],
      'a handler opens with two gates or with none, so somebody must read it',
    )
    assert.equal(anonymous.length, SURFACE.length)
    assert.equal(readScoped.length + gated.length, DECLINED.length)
    assert.equal(gated.length, 2, `${gated.length} routes take indexer:write upstream, not two`)
  })

  it('the three things still refused are still refused, and this app depends on none of them', () => {
    // Named individually because each is a different promise, and because this app must not start
    // relying on any of them by accident — `test/api.test.ts` asserts the client side.
    const at = server.indexOf('async function authorise(')
    assert.ok(at > 0, 'authorise is gone from indexer/src/server.ts — the WRITES are now open')
    const fn = server.slice(at, at + 1200)

    // 1. A missing token on a WRITE is a 401.
    assert.match(fn, /if \(!token\) throw new TokenError\(/, 'a missing token on a write is no longer a 401')
    // 2. A SERVICE without the scope is a 403 — on writes here, and on reads in authoriseRead.
    assert.match(fn, /requireScope\(principal, scope\)/, 'a service principal is no longer scoped on writes')
    const readFn = server.slice(
      server.indexOf('async function authoriseRead('),
      server.indexOf('\nasync function authorise('),
    )
    assert.match(
      readFn,
      /if \(principal\.kind === 'service'\) \{\n\s*requireScope\(principal, READ_SCOPE\)/,
      'a service that presents a credential without indexer:read is no longer refused on a read',
    )
    // 3. A token that IS presented is still verified rather than ignored.
    assert.match(
      readFn,
      /const principal = await deps\.verifier\.principal\(token\)/,
      'a presented token is no longer verified on a read — a broken one would now get a silent 200',
    )
    assert.match(fn, /if \(!isAdmin\(principal\)\) throw new ForbiddenError\(scope\)/, 'the admin gate on writes moved')
  })

  it('the two scope strings are still the strings this repository names', () => {
    // Nothing prints `indexer:read` on screen any more — that went with the refusal panel — but
    // `src/lib/indexer.ts` explains the write refusal in terms of both, and a scope renamed
    // upstream would make that explanation describe an authority nobody can be granted.
    assert.match(server, /export const READ_SCOPE = 'indexer:read'/)
    assert.match(server, /export const WRITE_SCOPE = 'indexer:write'/)
    assert.match(client, /indexer:write/, 'the client no longer names the scope the writes take')
  })

  it('the two authorisation helpers are the functions this repository says they are', () => {
    // These two used to be cited as `:792-801` and `:763-791`, and those ranges appeared verbatim
    // across src/lib/indexer.ts, src/lib/auth.tsx, src/app.tsx and four more files, inviting a
    // reader to go and check them.
    //
    // They were `:727-736` and `:698-726` before `micro-indexer` f9344de inserted the custody
    // total and its header above them. Every one of those citations still named a line that
    // EXISTED, so the repository-wide existence sweep stayed green and only this check could tell
    // — and it could only tell AFTER somebody happened to run it, which for a sibling service is
    // during a release. That is the entire argument for citing the FILE and the SYMBOL: the symbol
    // moves with the code, so there is nothing left to go stale.
    const readAt = lines.findIndex((l) => /^async function authoriseRead\(/.test(l))
    assert.ok(readAt >= 0, 'authoriseRead is gone from indexer/src/server.ts')
    const gateAt = lines.findIndex((l) => /^async function authorise\(/.test(l))
    assert.ok(gateAt >= 0, 'authorise is gone from indexer/src/server.ts')
    assert.ok(gateAt > readAt, 'authoriseRead no longer precedes authorise; the citations describe an order')
    // …and the doc comment the reasoning lives in, which must sit above the ANONYMOUS one rather
    // than merely somewhere in the file. `lines.slice(0, readAt)` is everything before it, so the
    // last occurrence is the header of that function.
    const above = lines.slice(0, readAt).join('\n')
    const sentence = /Reads are ANONYMOUS, because what they return is already public/
    assert.match(above, sentence, 'the doc comment explaining the anonymous reads is no longer above authoriseRead')
    assert.doesNotMatch(
      lines.slice(readAt).join('\n'),
      sentence,
      'that explanation now appears below authoriseRead too; the citation would be ambiguous',
    )
  })

  it('the client sends no bearer on any read, and says so where a reader will look', () => {
    // The client side of the same contract. `publicRead` is the single place `auth` is decided,
    // and nothing in the module may reach `api()` around it — six copies of a flag is six chances
    // to forget one, and the failure is a 401 on a page that needs no session.
    const code = client
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .split('\n')
      .filter((line) => !/^\s*(\/\/|\*)/.test(line))
      .join('\n')
    assert.match(code, /function publicRead<T>/, 'the single-decision read helper is gone')
    assert.match(code, /auth: false/, 'publicRead no longer suppresses the bearer')
    assert.equal(
      [...code.matchAll(/\bauth: false\b/g)].length,
      1,
      'auth: false is written more than once, so one of them can be forgotten',
    )
    // Exactly ONE reference to the generic client in the whole module, and it is the one inside
    // `publicRead`. Anything else — an exported call that reached for `api()` directly — would
    // carry a bearer, so it is counted rather than trusted to a reviewer's eye.
    const calls = [...code.matchAll(/\bapi</g)]
    assert.equal(
      calls.length,
      1,
      `this module reaches the generic client ${calls.length} times; only publicRead may`,
    )
    const helper = code.indexOf('function publicRead<T>')
    assert.ok(helper > 0)
    // The helper's body: from its declaration to the next top-level closing brace.
    const helperEnd = code.indexOf('\n}\n', helper)
    assert.ok(helperEnd > helper, 'publicRead has no closing brace, so this bound means nothing')
    const where = calls[0]?.index ?? -1
    assert.ok(
      where > helper && where < helperEnd,
      'the one api() call is outside publicRead, so a read is issued with a bearer attached',
    )
    assert.equal(
      [...code.matchAll(/\breturn publicRead</g)].length,
      7,
      'the seven reads no longer all go through publicRead',
    )
  })

  /* ────────────────────────────────────────────────────────────────────────────────────────────
   * WHICH HEAD EACH DEPTH IS AGAINST.
   * ──────────────────────────────────────────────────────────────────────────────────────────── */

  const readsLines = reads.split('\n')

  it('confirmation counts against the WALKED HEAD, as CONFIRMATIONS_AGAINST claims', () => {
    assert.equal(CONFIRMATIONS_AGAINST.confirmations, 'walked-head')
    // Searched for, not sliced out of lines 452 to 455. The claim is that this expression is in
    // `indexer/src/reads.ts` EXACTLY ONCE — one read counts against the walked head — and a slice
    // could only ever say it was at a position micro-indexer is free to change.
    const walked = [...reads.matchAll(/confirmationsAt\(record\.headHeight, record\.blockHeight\)/g)]
    assert.equal(walked.length, 1, `expected one count against the walked head, found ${walked.length}`)
  })

  it('block, transaction and activity count against the CLAIMED TIP, as it claims', () => {
    assert.equal(CONFIRMATIONS_AGAINST.block, 'claimed-tip')
    assert.equal(CONFIRMATIONS_AGAINST.transaction, 'claimed-tip')
    assert.equal(CONFIRMATIONS_AGAINST.activity, 'claimed-tip')
    // Each of the three, found rather than cited — this is the claim every "vs claimed tip" label
    // on this surface rests on. The three used to be lines 579, 427 and 365 of a file micro-indexer
    // edits freely; when it inserted the custody total, all three moved and this went red for a
    // change that touched none of them.
    for (const expr of [
      /confirmationsAt\(tipHeight, record\.height\)/,
      /confirmationsAt\(tipHeight, record\.blockHeight\)/,
      /confirmationsAt\(tipHeight, item\.blockHeight\)/,
    ]) {
      assert.match(reads, expr, `indexer/src/reads.ts no longer counts against the claimed tip with ${expr.source}`)
    }
    // …and that `tipHeight` really is the checkpoint's everywhere, not the head's. Asserted over
    // EVERY assignment in the file rather than at three cited lines: a read re-pointed at the
    // walked head would make the "vs claimed tip" label on that panel a lie, and a line pin can
    // only ever notice it at the three positions somebody happened to write down.
    const assignments = [...reads.matchAll(/const tipHeight = ([^\n]+)/g)].map((m) => (m[1] ?? '').trim())
    assert.ok(assignments.length >= 3, `expected at least three tipHeight reads, found ${assignments.length}`)
    assert.deepEqual(
      [...new Set(assignments)],
      ['checkpoint?.tipHeight ?? null'],
      'a tipHeight in indexer/src/reads.ts no longer comes from the checkpoint',
    )
  })

  it('the rule that scopes the two is where this repository cites it', () => {
    // `indexer/src/reads.ts`, quoted on this surface and in four comments here.
    //
    // FOUND, not sliced out of lines 18 to 30. What is worth checking is that the three sentences
    // sit in ONE paragraph — the second rule is what makes the first safe, and a reader sent to
    // the first must land on both — so the paragraph is located by its heading rather than by a
    // position micro-indexer is free to move. Every other line pin in this file that named a
    // position in that service has already gone stale once, this one had simply not been reached
    // yet, and micro-org #235 records the pattern estate-wide.
    const from = readsLines.findIndex((l) =>
      /## Two reads that exist because a consumer was blocked/.test(l),
    )
    assert.ok(from >= 0, 'indexer/src/reads.ts no longer has the section that scopes the two reads')
    const to = readsLines.findIndex((l, i) => i > from && l.trim() === '*/')
    assert.ok(to > from, 'that section is not inside a doc comment any more; the bound means nothing')
    const cited = readsLines.slice(from, to).join('\n')
    assert.match(cited, /Confirmations are counted against the stored canonical HEAD/)
    assert.match(cited, /never against/)
    assert.match(cited, /`confirmation` and `tokenBalances`/)
  })

  it('a balance is still WITHHELD rather than zeroed, with a reason', () => {
    // The whole of src/pages/address.tsx's holdings panel depends on this staying true. FIVE since
    // `micro-indexer` `976c03b` — `address_not_watched` is the one that is not about blocks, and it
    // has its own test below.
    for (const reason of [
      'nothing_indexed',
      'coverage_incomplete',
      'chain_halted',
      'negative',
      'address_not_watched',
    ]) {
      assert.match(reads, new RegExp(`unavailable: '${reason}'`), `${reason} is no longer returned`)
    }
    assert.match(reads, /A missing balance is missing, never zero/)
  })

  /* ────────────────────────────────────────────────────────────────────────────────────────────
   * "NOT RECORDED" IS NOT "NOTHING HAPPENED".
   *
   * micro-indexer#7 (micro-org #253) narrowed what `address_activity` holds: a deployment walking
   * a chain for its own custody set now writes a row only for an address it was asked to watch, and
   * stamps every block walked that way `detail.partial = 'watched-addresses-only'`. An activity read
   * for an address that was never watched therefore comes back with NO ROWS and a marker saying so,
   * rather than with rows.
   *
   * Before this bundle knew about the marker it rendered that answer as "Nothing has moved through
   * this address" — an assertion about the chain, made from a fact about this deployment's
   * configuration, and the one failure mode a block explorer must not have. `src/pages/address.tsx`
   * carries the whole reasoning.
   *
   * These checks are here rather than beside the render tests because the thing that can rot is not
   * the rendering, it is the AGREEMENT: the marker is three strings and a number, restated in
   * `src/lib/indexer.ts` because this repository does not import the service's types. If micro-
   * indexer renames the reason, moves the detail key or adds a third `PartialBlockReason`, nothing
   * in this bundle breaks — it silently goes back to showing the empty state, which is the defect
   * again with no symptom. So the agreement is measured against the service's own source.
   * ──────────────────────────────────────────────────────────────────────────────────────────── */

  it('an unwatched address still comes back MARKED, not merely empty', () => {
    // The producing side, found in `activity()` rather than cited: the marker is attached exactly
    // when the address is not watched AND some block below the tip was walked in the narrow mode.
    // Both halves matter — an unconditional marker would put the caveat on every address on a
    // fully-walked chain, and no marker at all is the defect.
    assert.match(
      reads,
      /reason: 'address_not_watched' as const/,
      'indexer/src/reads.ts no longer marks an unwatched address; this bundle would show its empty state again',
    )
    // RE-POINTED 2026-08-09, not relaxed. This read `fromHeight: partialFrom` and went red on
    // `micro-indexer` `976c03b`, which moved the decision out of `activity`'s body and into the
    // shared `notWatchedFromHeight` function so the holdings read could ask the same question; the
    // local it assigns to is now `narrowFrom`. NOTHING ABOUT THE MARKER CHANGED. What the pin was
    // really asserting is that the marker carries a height and that the height is a computed value
    // rather than a literal, so that is what it says now — `\w+` is any local, and the check below
    // is the one that pins WHICH computation, by symbol. A local name is a private detail of a
    // function in a repository this one does not own, which is the same class of thing as a line
    // number and rots the same way.
    assert.match(
      reads,
      /incomplete: \{ reason: 'address_not_watched' as const, fromHeight: \w+ \}/,
      'the marker no longer carries a computed fromHeight, which src/pages/address.tsx prints as the height it holds from',
    )
    // …and the height comes from the function BOTH reads decide on, cited by symbol. This is the
    // stronger half of the pin the local name was standing in for: it is what makes the number on
    // the activity notice and the number on the holdings panel the same number.
    assert.match(
      reads,
      /async function notWatchedFromHeight\(/,
      'indexer/src/reads.ts no longer decides "were this address\'s rows written" in one place',
    )
    // …and that it is still OPTIONAL on the view type, which is what makes an unmarked empty page
    // safe to keep calling "nothing happened".
    assert.match(
      reads,
      /readonly incomplete\?: \{\n\s*readonly reason: 'address_not_watched'\n\s*readonly fromHeight: number/,
      'ActivityPageView.incomplete has changed shape; src/lib/indexer.ts restates it and would now be wrong',
    )
  })

  it('the reason string this bundle prints is the reason string the service sends', () => {
    // Restated, not imported — so the one string that carries the meaning is compared directly.
    // `unrecordedReason` in `src/lib/format.ts` switches on it and has a default branch that prints
    // an unrecognised reason verbatim, so a RENAME degrades to an honest sentence rather than to
    // silence; this test is what makes somebody come and write the good sentence for the new name.
    const format = readFileSync(here('src/lib/format.ts'), 'utf8')
    assert.match(client, /'address_not_watched'/, 'src/lib/indexer.ts no longer names the reason')
    assert.match(format, /case 'address_not_watched':/, 'src/lib/format.ts no longer words the reason')
  })

  it('the block-level marker is the key and the two values micro-indexer stamps', () => {
    assert.ok(btcsource.length > 0, `indexer/src/btcsource.ts is gone from ${indexerRoot}`)
    // The KEY. `partialMarker` in `src/lib/indexer.ts` reads `detail[PARTIAL_DETAIL_KEY]` off a
    // block's verbatim detail object, and a key renamed upstream turns that reader into one that
    // finds nothing — on every block, forever, with no error anywhere.
    assert.match(
      btcsource,
      new RegExp(`export const PARTIAL_DETAIL_KEY = '${PARTIAL_DETAIL_KEY}'`),
      `micro-indexer no longer stamps the detail key this bundle reads (${PARTIAL_DETAIL_KEY})`,
    )
    // The VALUES, both of them, in the union rather than merely somewhere in the file. `src/pages/
    // block.tsx` words each one; a third that nobody worded would fall to the default branch of
    // `partialBlockReason` and print its own code, which is honest and worse than a sentence.
    const union = /export type PartialBlockReason = ([^\n]+)/.exec(btcsource)
    assert.ok(union, 'PartialBlockReason is gone from indexer/src/btcsource.ts')
    const upstream = (union[1] ?? '')
      .split('|')
      .map((s) => s.trim().replace(/'/g, ''))
      .filter(Boolean)
    const worded: readonly PartialBlockReason[] = ['transactions-not-fetched', 'watched-addresses-only']
    assert.deepEqual(
      upstream,
      [...worded],
      'micro-indexer stamps a partial-block reason this bundle has no sentence for',
    )
    const format = readFileSync(here('src/lib/format.ts'), 'utf8')
    for (const reason of upstream) {
      assert.match(format, new RegExp(`case '${reason}':`), `src/lib/format.ts does not word ${reason}`)
    }
  })

  it('a whole block is stamped null, so ABSENCE of the key cannot mean "complete"', () => {
    // The service writes `partial: null` explicitly for a block it walked in full, and says in
    // `indexer/src/btcsource.ts` that absence means "written by a build older than this", not
    // "complete". `partialMarker` therefore returns null for BOTH — which is the right call for a
    // reader and worth writing down, because it is the one place this bundle knowingly declines to
    // pass a distinction on. Only the bitcoin-family walker stamps the key at all today; treating
    // absence as a caveat would put one on every EMBER block on both live estates, permanently.
    assert.match(
      btcsource,
      /\[PARTIAL_DETAIL_KEY\]: reason/,
      'markPartial no longer writes the key unconditionally, so null and absent have merged upstream',
    )
    assert.equal(partialMarker({}), null)
    assert.equal(partialMarker({ [PARTIAL_DETAIL_KEY]: null }), null)
    assert.equal(partialMarker({ [PARTIAL_DETAIL_KEY]: 'watched-addresses-only' }), 'watched-addresses-only')
    // An unrecognised future value survives to the screen rather than being dropped by a narrowing
    // cast — the reader is told there is something, and told this page does not know what.
    assert.equal(partialMarker({ [PARTIAL_DETAIL_KEY]: 'some-future-reason' }), 'some-future-reason')
  })

  it('token balances now carry the SAME marker, from the same predicate, and the workaround is gone', () => {
    // ── THIS TEST WAS INVERTED ON 2026-08-09, AND THAT IS WHAT IT WAS BUILT TO DO. ──────────────
    //
    // It used to assert the ABSENCE of a marker on this read, with a note recording the gap:
    // `tokenBalancesAt` sums `address_activity`, the same table the narrowed walk stopped writing
    // rows into, so an unwatched address got `balances: []` while the `unavailable` union had no
    // member for "nobody wrote this address down". `src/pages/address.tsx` covered it by threading
    // the ACTIVITY read's marker into the holdings panel, and this assertion existed to go red the
    // day the honest fix landed upstream — "so somebody comes back and deletes the workaround
    // instead of leaving two mechanisms where one would do".
    //
    // `micro-indexer` `976c03b` (micro-org#281) landed it. So the workaround is deleted and the
    // assertion is turned round rather than dropped: the same fact is still measured against the
    // service's own source, in the direction that is now true. An assertion that simply went away
    // would leave this bundle's holdings panel depending on a field with nothing watching it.
    assert.match(
      reads,
      /unavailable: 'address_not_watched'/,
      'the holdings read no longer refuses for an unwatched address; src/pages/address.tsx would call an empty list nought again',
    )
    assert.match(
      reads,
      /notWatchedFromHeight: \w+/,
      'the holdings refusal no longer carries the height, which src/pages/address.tsx prints beside it',
    )
    assert.match(
      reads,
      /readonly notWatchedFromHeight\?: number/,
      'TokenBalancesView.notWatchedFromHeight has changed shape; src/lib/indexer.ts restates it and would now be wrong',
    )
    // ONE PREDICATE, TWO READS. This is the property the client now leans on and the reason the
    // thread between the panels could be cut: a visitor holding both answers at once sees them
    // agree because upstream asks the question once, not because this component reconciles them.
    // Counted rather than eyeballed — a second, independent implementation of "is this address
    // watched" is exactly the drift this file exists to catch.
    // The CALL sites, not the word: the declaration spreads its parameters over several lines and
    // does not match this, while both callers pass the executor positionally — `exec` on the
    // activity read, the REPEATABLE READ transaction `tx` on the holdings one, which is itself
    // worth seeing, since the holdings marker and the sum it replaces must describe one snapshot.
    const decided = [...reads.matchAll(/notWatchedFromHeight\(\w+, scope, address\)/g)]
    assert.equal(
      decided.length,
      2,
      `expected the activity and holdings reads to share one decision, found ${decided.length} calls`,
    )
    // …and this bundle restates the fifth reason and words it. `unavailableReason` has a default
    // branch, so a MISSING sentence degrades to an honest one rather than to silence — which is
    // precisely why the presence of the good sentence has to be asserted somewhere.
    assert.match(client, /'address_not_watched'/, 'src/lib/indexer.ts no longer names the reason')
    assert.match(
      readFileSync(here('src/lib/format.ts'), 'utf8'),
      /case 'address_not_watched':\n\s*return 'This deployment writes down what moved only for the addresses it was asked to watch, and this address is not one of them\. A balance/,
      'src/lib/format.ts has no sentence for a balance withheld because the address was never watched',
    )
    // The workaround itself: gone, and asserted gone. Two mechanisms for one fact is the state this
    // whole exchange existed to leave behind, and the weaker of the two is the one that lived here.
    assert.doesNotMatch(
      readFileSync(here('src/pages/address.tsx'), 'utf8'),
      /unrecorded=\{/,
      'the activity read is being threaded into the holdings panel again; the holdings read carries its own marker now',
    )
  })

  /* ────────────────────────────────────────────────────────────────────────────────────────────
   * FACTS THIS BUNDLE RESTATES RATHER THAN IMPORTS.
   * ──────────────────────────────────────────────────────────────────────────────────────────── */

  it('the chain ids are the ones the service runs', () => {
    // THIS TEST HAD BEEN RED, AND IT WAS RIGHT. micro-contracts `7ec2117` added LTC and the
    // indexer picked it up — Litecoin's spec carries `family: 'bitcoin'` and the worker is chosen
    // by family, so it needed no worker of its own — while this bundle's list still had five. A
    // chain the service serves was invisible in the client that reads it. The drift detector
    // worked; nothing had acted on it.
    const declared = /export const CHAIN_IDS: readonly ChainId\[\] = Object\.freeze\(\[([^\]]*)\]\)/.exec(chains)
    assert.ok(declared, 'CHAIN_IDS is gone from indexer/src/chains.ts')
    const upstream = (declared[1] ?? '').split(',').map((s) => s.trim().replace(/'/g, '')).filter(Boolean)
    assert.deepEqual([...CHAIN_IDS], upstream)
  })

  it('the two networks are the two the service runs', () => {
    const declared = /export const NETWORKS: readonly Network\[\] = Object\.freeze\(\[([^\]]*)\]\)/.exec(chains)
    assert.ok(declared, 'NETWORKS is gone from indexer/src/chains.ts')
    const upstream = (declared[1] ?? '').split(',').map((s) => s.trim().replace(/'/g, '')).filter(Boolean)
    assert.deepEqual([...NETWORKS], upstream)
  })

  it('BEING ON THE CHAIN LIST IS NOT BEING INDEXED, and the client must not conflate them', () => {
    // The defect the owner found by using the product: the explorer offered five chains and one
    // worked. `CHAIN_IDS` is what the service CAN be asked about; `INDEXER_CHAINS` is what a
    // deployment walks, and both live estates set it to a single scope. So the client carries a
    // predicate that reads the difference off `/status` rather than assuming the two are the same
    // list — see `isServed` and `test/served-chains.test.ts`.
    assert.match(env, /INDEXER_CHAINS/, 'the deployment no longer chooses which chains it follows')
    assert.match(
      client,
      /export function isServed/,
      'the client lost the predicate that separates an offered chain from an indexed one',
    )
  })

  it('shard is still not a chain slug upstream', () => {
    // SHARD is RETIRED (`contracts/packages/chain/src/index.ts`), not merely absent from the
    // chain list, and this bundle no longer explains its absence anywhere a reader can see —
    // `test/retired-assets.test.ts` is what keeps it out. This assertion stays only as the
    // upstream half: an indexer that started accepting the slug would be advertising an endpoint
    // for an asset that does not exist.
    assert.doesNotMatch(chains, /export type ChainId = [^\n]*'shard'/)
  })

  it('the indexer still binds 4008, which the README and the hosts note both state', () => {
    // Both halves now AGREE: micro-ui corrected the registry's `explorer` devPort from 8080 to
    // 4008, which is the number this file reads out of the service. test/hosts.test.ts pins the
    // registry side, so whichever moves first fails and names the other.
    // ONE assertion, on the expression. There used to be a second one requiring 4008 to appear at
    // line 364 of `indexer/src/env.ts`, and it is the reason this suite was red: micro-indexer
    // moved the line to 363, the default was unchanged, and nothing in this repository was wrong.
    // A line number is a claim about a position in a file this repository does not own; the
    // expression is the claim actually worth making.
    assert.match(env, /port\(source, 'PORT', 4008\)/, 'the indexer no longer defaults PORT to 4008')
  })
})
