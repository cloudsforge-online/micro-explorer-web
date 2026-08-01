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
 * produced a client sending no bearer. `micro-indexer` is the mirror image: every handler calls
 * `authorise(ctx, deps, SCOPE)` and the SCOPE is the thing that differs. This file records the
 * scope per route and pins the helper itself, so "it authenticates" cannot decay into "something
 * called authorise once".
 *
 * **3. THE AUTHORITY FINDING, PINNED SO IT GOES RED WHEN IT IS FIXED.** There is no anonymous read
 * path on this service, which is why this repository looks the way it does. That is asserted
 * against the real source: if `authorise` ever grows an anonymous branch, or a domain route stops
 * calling it, this suite fails and somebody has to come back and delete the refusal machinery.
 * A finding recorded only in prose is a finding that outlives its truth.
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
 * The surface this bundle uses, with the line each was read from and the scope it takes.
 *
 * `line` is the line in `DOMAIN` that REGISTERS the route; `handler` is the line the handler
 * function is declared at. Both are cited in the client, and both are checked, because a route can
 * be moved in the table without its handler moving and vice versa.
 */
const SURFACE: ReadonlyArray<{
  method: string
  path: string
  line: number
  handler: number
  scope: 'READ_SCOPE' | 'WRITE_SCOPE'
}> = [
  { method: 'GET', path: '/chains/:chain/:network/status', line: 154, handler: 384, scope: 'READ_SCOPE' },
  { method: 'GET', path: '/addresses/:chain/:network/:address/activity', line: 155, handler: 396, scope: 'READ_SCOPE' },
  { method: 'GET', path: '/addresses/:chain/:network/:address/token-balances', line: 156, handler: 463, scope: 'READ_SCOPE' },
  { method: 'GET', path: '/transactions/:chain/:network/:hash', line: 157, handler: 412, scope: 'READ_SCOPE' },
  { method: 'GET', path: '/transactions/:chain/:network/:hash/confirmations', line: 158, handler: 437, scope: 'READ_SCOPE' },
  { method: 'GET', path: '/tokens/:chain/:network/:address', line: 159, handler: 493, scope: 'READ_SCOPE' },
  { method: 'GET', path: '/blocks/:chain/:network/:height', line: 160, handler: 514, scope: 'READ_SCOPE' },
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
  scope: 'READ_SCOPE' | 'WRITE_SCOPE'
  why: string
}> = [
  {
    method: 'POST',
    path: '/watch/:chain/:network/:address',
    line: 161,
    handler: 531,
    scope: 'WRITE_SCOPE',
    why: 'indexer:write — enlarging what a shared deployment indexes is not a browser decision',
  },
  {
    method: 'POST',
    path: '/backfills/:chain/:network',
    line: 162,
    handler: 553,
    scope: 'WRITE_SCOPE',
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
    // And the loop that mounts them, at :374-378.
    assert.match(lines[373] ?? '', /for \(const prefix of PREFIXES\)/)
    assert.match(lines[374] ?? '', /for \(const \[method, path, handler\] of DOMAIN\)/)
    assert.match(lines[375] ?? '', /built\.push\(route\(method, `\$\{prefix\}\$\{path\}`, handler\)\)/)
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

  it('every route this app calls authenticates, and with the scope this app believes', () => {
    for (const route of [...SURFACE, ...DECLINED]) {
      const body = bodyOf(route.handler)
      assert.match(
        body,
        /^async function \w+\(ctx: RequestContext, deps: ServerDeps\)/,
        `indexer/src/server.ts:${route.handler} is not a handler declaration: ${lines[route.handler - 1]}`,
      )
      assert.match(
        body,
        new RegExp(`authorise\\(ctx, deps, ${route.scope}\\)`),
        `${route.method} ${route.path}: this app believes it takes ${route.scope}, and the handler does not ask for it`,
      )
    }
  })

  /* ────────────────────────────────────────────────────────────────────────────────────────────
   * THE AUTHORITY FINDING.
   *
   * This whole repository is shaped by there being no anonymous read path. These four tests are
   * what make that a checked fact rather than a paragraph — and they go RED the day it is fixed,
   * which is the correct outcome: somebody then has to come back and delete the refusal machinery
   * instead of leaving a surface that apologises for a restriction that no longer exists.
   * ──────────────────────────────────────────────────────────────────────────────────────────── */

  it('NOT ONE domain route is anonymous: all nine call authorise', () => {
    const handlers = [...SURFACE, ...DECLINED]
    assert.equal(handlers.length, 9, 'the surface table no longer covers all nine domain routes')
    for (const route of handlers) {
      assert.match(
        bodyOf(route.handler),
        /await authorise\(ctx, deps,/,
        `${route.method} ${route.path} no longer authorises — the explorer may now be public, and this repository needs rewriting`,
      )
    }
  })

  it('authorise accepts a scoped SERVICE or an ADMIN user, and nothing else', () => {
    const at = server.indexOf('async function authorise(')
    assert.ok(at > 0, 'authorise is gone from indexer/src/server.ts')
    const fn = server.slice(at, at + 1200)
    assert.match(fn, /if \(!token\) throw new TokenError\(/, 'a missing token is no longer a 401')
    assert.match(fn, /requireScope\(principal, scope\)/, 'a service principal is no longer scoped')
    assert.match(fn, /if \(!isAdmin\(principal\)\) throw new ForbiddenError\(scope\)/, 'the admin gate moved')
    // The absence that matters: no branch returns before a principal has been established.
    assert.doesNotMatch(
      fn,
      /anonymous|allowPublic|skipAuth/i,
      'authorise has grown something that looks like an anonymous path — read it, then rewrite this repository',
    )
  })

  it('the read scope is the string this repository shows people', () => {
    // `Refused` and the shell notice both print `indexer:read` on screen. A scope renamed upstream
    // would make this surface tell an operator to ask for something that does not exist.
    assert.match(server, /export const READ_SCOPE = 'indexer:read'/)
    assert.match(server, /export const WRITE_SCOPE = 'indexer:write'/)
  })

  it('the citation this surface prints in its refusal panel is the right range', () => {
    // `indexer/src/server.ts:679-697` appears verbatim in src/components/states.tsx and in the
    // shell, where a reader is invited to go and check it. It has to be authorise.
    assert.match(lines[678] ?? '', /^async function authorise\(/, `:679 is: ${lines[678]}`)
    assert.match(lines[696] ?? '', /^\}/, `:697 is: ${lines[696]}`)
    const cited = lines.slice(678, 697).join('\n')
    assert.match(cited, /isAdmin\(principal\)/)
    assert.match(cited, /requireScope\(principal, scope\)/)
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
    assert.match(readsLines[569] ?? '', /confirmationsAt\(tipHeight, record\.height\)/, `:570 is: ${readsLines[569]}`)
    assert.match(readsLines[417] ?? '', /confirmationsAt\(tipHeight, record\.blockHeight\)/, `:418 is: ${readsLines[417]}`)
    assert.match(readsLines[355] ?? '', /confirmationsAt\(tipHeight, item\.blockHeight\)/, `:356 is: ${readsLines[355]}`)
    // …and that `tipHeight` in each really is the checkpoint's, not the head's.
    assert.match(readsLines[344] ?? '', /checkpoint\?\.tipHeight \?\? null/, `:345 is: ${readsLines[344]}`)
    assert.match(readsLines[398] ?? '', /checkpoint\?\.tipHeight \?\? null/, `:399 is: ${readsLines[398]}`)
    assert.match(readsLines[558] ?? '', /checkpoint\?\.tipHeight \?\? null/, `:559 is: ${readsLines[558]}`)
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
