/**
 * THE ROUTE TABLE, CHECKED AGAINST THE SERVICE THAT SERVES IT.
 *
 * Every client in this estate that was built against an imagined surface passed its own tests.
 * That is the whole problem: a test asserting "the client calls /v1/blocks/…" is a test that the
 * client agrees with itself. So this file does not assert paths in the abstract — it reads
 * `indexer/src/server.ts` from the sibling checkout and requires that each path and method this
 * bundle calls is registered there, at the line the citation names.
 *
 * ── Four things this file checks that a naive version would not ───────────────────────────────
 *
 * **1. WHOLE PATH SHAPES, NEVER PREFIXES AND NEVER A SEGMENT COUNT.** `micro-market`'s first guard
 * matched `path.startsWith(servedPrefix)` and judged **zero of two genuinely dead paths** as
 * unserved, because both began with a prefix the indexer really does serve
 * (`market/src/indexerclient.test.ts:229-239`). Its segment helper then collapsed
 * `/transactions/${scope}/${hash}/confirmations` to five segments — exactly the shape of a
 * DIFFERENT route — and reported it fine (`market/src/indexerclient.test.ts:328-341`). The
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
import { CHAIN_IDS, CONFIRMATIONS_AGAINST, NETWORKS } from '../src/lib/indexer.ts'

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
 * The surface this bundle uses, with the line each was read from and the GATE it opens with.
 *
 * `line` is the line in `DOMAIN` that REGISTERS the route; `handler` is the line the handler
 * function is declared at. Both are cited in the client, and both are checked, because a route can
 * be moved in the table without its handler moving and vice versa.
 *
 * `gate` was `READ_SCOPE | WRITE_SCOPE` until `micro-indexer` opened the reads. It is now the
 * NAME OF THE HELPER, because that is where the difference lives: `authoriseRead` serves a caller
 * with no token, `authorise` refuses one. A column recording a scope could not have expressed
 * "there is no scope", which is the point.
 */
const SURFACE: ReadonlyArray<{
  method: string
  path: string
  line: number
  handler: number
  gate: 'authoriseRead' | 'authorise'
}> = [
  { method: 'GET', path: '/chains/:chain/:network/status', line: 154, handler: 403, gate: 'authoriseRead' },
  { method: 'GET', path: '/addresses/:chain/:network/:address/activity', line: 155, handler: 415, gate: 'authoriseRead' },
  { method: 'GET', path: '/addresses/:chain/:network/:address/token-balances', line: 156, handler: 482, gate: 'authoriseRead' },
  { method: 'GET', path: '/transactions/:chain/:network/:hash', line: 157, handler: 431, gate: 'authoriseRead' },
  { method: 'GET', path: '/transactions/:chain/:network/:hash/confirmations', line: 158, handler: 456, gate: 'authoriseRead' },
  { method: 'GET', path: '/tokens/:chain/:network/:address', line: 159, handler: 512, gate: 'authoriseRead' },
  { method: 'GET', path: '/blocks/:chain/:network/:height', line: 160, handler: 533, gate: 'authoriseRead' },
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
  line: number
  handler: number
  gate: 'authoriseRead' | 'authorise'
  why: string
}> = [
  {
    method: 'POST',
    path: '/watch/:chain/:network/:address',
    line: 161,
    handler: 550,
    gate: 'authorise',
    why: 'indexer:write — enlarging what a shared deployment indexes is not a browser decision',
  },
  {
    method: 'POST',
    path: '/backfills/:chain/:network',
    line: 162,
    handler: 572,
    gate: 'authorise',
    why: 'indexer:write — enqueues a range walk, with a cost attached',
  },
]

/** Both spellings of every route, because `PREFIXES` mounts each twice. */
const BOTH_SPELLINGS = [...SURFACE, ...DECLINED].flatMap((r) => [r.path, `/v1${r.path}`])

/**
 * Does a requested path match a served pattern? Same segment count, and every segment agrees.
 *
 * **Segment counts, never prefixes**, and copied verbatim from
 * `market/src/indexerclient.test.ts:241-249` rather than written again. The version that shipped
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
 * short of every pattern and is refused rather than guessed at. `market/src/indexerclient.test.ts:251-259`
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

  it('cites a line for every route, in the doc comment as well as here', () => {
    for (const route of [...SURFACE, ...DECLINED]) {
      assert.ok(
        client.includes(`indexer/src/server.ts:${route.line}`),
        `${route.method} ${route.path} has no table citation in src/lib/indexer.ts`,
      )
    }
  })

  it('writes every scope segment out, with no helper standing for chain/network', () => {
    // The defect `market/src/indexerclient.test.ts:328-341` measures: a four-segment
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
    // Copied from `market/src/indexerclient.test.ts:309-319`, plus this repository's own
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
    // every segment out. Same measurement as market/src/indexerclient.test.ts:336-345.
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

describe('the cited lines are the lines that register the routes', () => {
  if (indexerRoot === undefined) {
    // NOT a silent pass. It says which check did not run, and CI makes the absence fatal.
    it('SKIPPED: no micro-indexer checkout — CI checks one out and requires this to run', () => {
      assert.ok(true)
    })
    return
  }

  const server = readFileSync(`${indexerRoot}/src/server.ts`, 'utf8')
  const lines = server.split('\n')
  const reads = readFileSync(`${indexerRoot}/src/reads.ts`, 'utf8')
  const chains = readFileSync(`${indexerRoot}/src/chains.ts`, 'utf8')
  const env = readFileSync(`${indexerRoot}/src/env.ts`, 'utf8')

  it('reads a server with a route table in it, so this cannot pass on an empty file', () => {
    const entries = lines.filter((l) => /^\s{2}\['(GET|POST)',/.test(l))
    assert.equal(entries.length, 9, `expected the indexer's nine DOMAIN entries, found ${entries.length}`)
  })

  for (const route of [...SURFACE, ...DECLINED]) {
    it(`${route.method} ${route.path} is registered at indexer/src/server.ts:${route.line}`, () => {
      // 1-indexed citation, 0-indexed array.
      const line = lines[route.line - 1] ?? ''
      assert.match(
        line,
        new RegExp(`\\['${route.method}',\\s*'${route.path.replace(/[/:]/g, '\\$&')}'`),
        `indexer/src/server.ts:${route.line} is:\n  ${line.trim()}`,
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
    // `market/src/indexerclient.test.ts:29-32` records that a previous reader believed the
    // opposite and wrote it down.
    assert.match(server, /const PREFIXES: readonly string\[\] = \['\/v1', ''\]/)
    // Line 134, as the client cites.
    assert.match(lines[133] ?? '', /\['\/v1', ''\]/, `indexer/src/server.ts:134 is: ${lines[133]}`)
    // And the loop that mounts them, at :393-378.
    assert.match(lines[392] ?? '', /for \(const prefix of PREFIXES\)/)
    assert.match(lines[393] ?? '', /for \(const \[method, path, handler\] of DOMAIN\)/)
    assert.match(lines[394] ?? '', /built\.push\(route\(method, `\$\{prefix\}\$\{path\}`, handler\)\)/)
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
  const bodyOf = (line: number): string => {
    const start = line - 1
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
      const body = bodyOf(route.handler)
      assert.match(
        body,
        /^async function \w+\(ctx: RequestContext, deps: ServerDeps\)/,
        `indexer/src/server.ts:${route.handler} is not a handler declaration: ${lines[route.handler - 1]}`,
      )
      if (route.gate === 'authoriseRead') {
        assert.match(
          body,
          /await authoriseRead\(ctx, deps\)/,
          `${route.method} ${route.path}: this app believes it is an anonymous read, and the handler does not call authoriseRead`,
        )
        // …and NOT the write gate. `authoriseRead` is a substring-free name here on purpose: a
        // handler calling `authorise(ctx, deps, READ_SCOPE)` would satisfy a sloppier check by
        // containing the word, and would 401 every visitor to this explorer.
        assert.doesNotMatch(
          body,
          /await authorise\(ctx, deps,/,
          `${route.method} ${route.path} has been RE-GATED — this app calls it with no bearer and would now get a 401`,
        )
      } else {
        assert.match(
          body,
          /await authorise\(ctx, deps, WRITE_SCOPE\)/,
          `${route.method} ${route.path}: this app declines it because it takes indexer:write, and the handler no longer asks for it`,
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
        bodyOf(route.handler),
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

  it('…and the nine handlers are exactly seven anonymous reads and two gated writes', () => {
    // Counted off the SERVICE rather than off the table above, so a route that changed gate
    // without anybody updating this file is a failure rather than an agreement with ourselves.
    const handlers = [...SURFACE, ...DECLINED]
    assert.equal(handlers.length, 9, 'the tables no longer cover all nine domain routes')
    const anonymous = handlers.filter((r) => /await authoriseRead\(ctx, deps\)/.test(bodyOf(r.handler)))
    const gated = handlers.filter((r) => /await authorise\(ctx, deps, WRITE_SCOPE\)/.test(bodyOf(r.handler)))
    assert.deepEqual(
      anonymous.map((r) => `${r.method} ${r.path}`).sort(),
      SURFACE.map((r) => `${r.method} ${r.path}`).sort(),
      'the set of anonymous routes upstream is not the set this app calls without a bearer',
    )
    assert.deepEqual(
      gated.map((r) => `${r.method} ${r.path}`).sort(),
      DECLINED.map((r) => `${r.method} ${r.path}`).sort(),
      'the set of write-gated routes upstream is not the set this app declines',
    )
    assert.equal(anonymous.length + gated.length, 9, 'a handler is neither, so somebody must read it')
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

  it('the three cited line ranges are the functions this repository says they are', () => {
    // `:727-717`, `:738-737` and `:698-707` appear verbatim across src/lib/indexer.ts,
    // src/lib/auth.tsx, src/app.tsx and four more files, where a reader is invited to go and check
    // them. A range that has drifted onto the wrong function is a citation that reads as verified.
    assert.match(lines[726] ?? '', /^async function authoriseRead\(/, `:727 is: ${lines[726]}`)
    assert.match(lines[735] ?? '', /^\}/, `:736 is: ${lines[735]}`)
    assert.match(lines[737] ?? '', /^async function authorise\(/, `:738 is: ${lines[737]}`)
    assert.match(lines[755] ?? '', /^\}/, `:756 is: ${lines[755]}`)
    // …and the doc comment the reasoning lives in.
    assert.match(lines[697] ?? '', /^\/\*\*/, `:698 is: ${lines[697]}`)
    assert.match(lines[725] ?? '', /^\s+\*\//, `:726 is: ${lines[725]}`)
    assert.match(
      lines.slice(697, 726).join('\n'),
      /Reads are ANONYMOUS, because what they return is already public/,
      'the doc comment at :698-707 is no longer the one explaining the anonymous reads',
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
    // `indexer/src/reads.ts:442-445`.
    const cited = readsLines.slice(441, 445).join('\n')
    assert.match(cited, /confirmationsAt\(record\.headHeight, record\.blockHeight\)/, cited)
  })

  it('block, transaction and activity count against the CLAIMED TIP, as it claims', () => {
    assert.equal(CONFIRMATIONS_AGAINST.block, 'claimed-tip')
    assert.equal(CONFIRMATIONS_AGAINST.transaction, 'claimed-tip')
    assert.equal(CONFIRMATIONS_AGAINST.activity, 'claimed-tip')
    // Each cited line, individually — this is the claim every "vs claimed tip" label rests on.
    assert.match(readsLines[569] ?? '', /confirmationsAt\(tipHeight, record\.height\)/, `:589 is: ${readsLines[569]}`)
    assert.match(readsLines[417] ?? '', /confirmationsAt\(tipHeight, record\.blockHeight\)/, `:437 is: ${readsLines[417]}`)
    assert.match(readsLines[355] ?? '', /confirmationsAt\(tipHeight, item\.blockHeight\)/, `:375 is: ${readsLines[355]}`)
    // …and that `tipHeight` in each really is the checkpoint's, not the head's.
    assert.match(readsLines[344] ?? '', /checkpoint\?\.tipHeight \?\? null/, `:364 is: ${readsLines[344]}`)
    assert.match(readsLines[398] ?? '', /checkpoint\?\.tipHeight \?\? null/, `:418 is: ${readsLines[398]}`)
    assert.match(readsLines[558] ?? '', /checkpoint\?\.tipHeight \?\? null/, `:578 is: ${readsLines[558]}`)
  })

  it('the rule that scopes the two is where this repository cites it', () => {
    // `indexer/src/reads.ts:18-30`, quoted on this surface and in four comments here.
    const cited = readsLines.slice(17, 30).join('\n')
    assert.match(cited, /Confirmations are counted against the stored canonical HEAD/)
    assert.match(cited, /never against/)
    assert.match(cited, /`confirmation` and `tokenBalances`/)
  })

  it('a balance is still WITHHELD rather than zeroed, with a reason', () => {
    // The whole of src/pages/address.tsx's holdings panel depends on this staying true.
    for (const reason of ['nothing_indexed', 'coverage_incomplete', 'chain_halted', 'negative']) {
      assert.match(reads, new RegExp(`unavailable: '${reason}'`), `${reason} is no longer returned`)
    }
    assert.match(reads, /A missing balance is missing, never zero/)
  })

  /* ────────────────────────────────────────────────────────────────────────────────────────────
   * FACTS THIS BUNDLE RESTATES RATHER THAN IMPORTS.
   * ──────────────────────────────────────────────────────────────────────────────────────────── */

  it('the five chain ids are the five the service runs', () => {
    const declared = /export const CHAIN_IDS: readonly ChainId\[\] = Object\.freeze\(\[([^\]]*)\]\)/.exec(chains)
    assert.ok(declared, 'CHAIN_IDS is gone from indexer/src/chains.ts')
    const upstream = (declared[1] ?? '').split(',').map((s) => s.trim().replace(/'/g, '')).filter(Boolean)
    assert.deepEqual([...CHAIN_IDS], upstream)
    // Cited at :41.
    assert.match(chains.split('\n')[40] ?? '', /CHAIN_IDS/)
  })

  it('the two networks are the two the service runs', () => {
    const declared = /export const NETWORKS: readonly Network\[\] = Object\.freeze\(\[([^\]]*)\]\)/.exec(chains)
    assert.ok(declared, 'NETWORKS is gone from indexer/src/chains.ts')
    const upstream = (declared[1] ?? '').split(',').map((s) => s.trim().replace(/'/g, '')).filter(Boolean)
    assert.deepEqual([...NETWORKS], upstream)
    assert.match(chains.split('\n')[42] ?? '', /NETWORKS/)
  })

  it('SHARD is still absent, which is why this app offers no such chain', () => {
    assert.doesNotMatch(chains, /export type ChainId = [^\n]*'shard'/)
  })

  it('the indexer still binds 4008, which the README and the hosts note both state', () => {
    // Half of the devPort disagreement. The other half — the registry's 8080 — is pinned in
    // test/hosts.test.ts, so whichever moves first fails and names the other.
    assert.match(env, /port\(source, 'PORT', 4008\)/, 'the indexer no longer defaults PORT to 4008')
    assert.match(env.split('\n')[294] ?? '', /4008/, `indexer/src/env.ts:295 is: ${env.split('\n')[294]}`)
  })
})
