/**
 * The four states, and the rule that a screen whose QUESTION changes must re-ask it.
 *
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 * THE DEFECT THE SECOND HALF OF THIS FILE PINS.
 *
 * `useResource` as the web template writes it re-runs its effect on `[nonce]` alone. `load` is
 * excluded on purpose — most callers recreate it every render and including it would make the
 * effect a render loop — and that is correct for a screen with one fixed question, which is every
 * screen the template was written for.
 *
 * It is wrong for a screen whose question changes. On this surface the question is a PATH
 * PARAMETER: `/backtests/:id` and `/bots/:id` reuse the same component when a customer moves from
 * one run to another, and with `[nonce]` as the only dependency the second address would render
 * the FIRST run's report — its return, its drawdown, its fee — under the new id in the address
 * bar. That is a page telling somebody a modelled number that belongs to a different run.
 *
 * The hook now takes the VALUES the question depends on. These tests assert that every page whose
 * question can change passes them, and that the pages whose question cannot do not pretend to.
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, it } from 'node:test'
import { resourceState } from '../src/lib/resource.ts'

const read = (file: string): string => readFileSync(new URL(`../${file}`, import.meta.url), 'utf8')

const notice = { message: 'boom', requestId: 'req-1', code: undefined, status: 500 }
/**
 * A 401 — which on this surface is now an ordinary failure and nothing more.
 *
 * There used to be a fifth state, `refused`, entered on 401 OR 403, because every `micro-indexer`
 * read demanded `indexer:read` or an admin. The reads are anonymous (`indexer/src/server.ts:792-801`)
 * and this bundle presents no credential, so an auth status can only mean the service was re-gated
 * or something in front of it injected one. Neither is a thing a reader can act on, and both are
 * exactly what `failed` says: a message, and a request id to quote.
 */
const authStatus = { message: 'nope', requestId: 'req-1', code: 'unauthenticated', status: 401 }

describe('the four states are four, and never collapse into each other', () => {
  it('is loading before anything has arrived', () => {
    assert.equal(resourceState({ loading: true, error: null, count: null }), 'loading')
  })

  it('is ok when there is something', () => {
    assert.equal(resourceState({ loading: false, error: null, count: 3 }), 'ok')
  })

  it('is empty when the query answered with nothing', () => {
    assert.equal(resourceState({ loading: false, error: null, count: 0 }), 'empty')
  })

  it('is failed when the query did not answer', () => {
    assert.equal(resourceState({ loading: false, error: notice, count: null }), 'failed')
  })

  it('an auth status is a failure like any other, with no state of its own', () => {
    assert.equal(resourceState({ loading: false, error: authStatus, count: null }), 'failed')
    assert.equal(
      resourceState({ loading: false, error: { ...authStatus, status: 403 }, count: null }),
      'failed',
    )
  })

  it('reports FAILURE rather than EMPTY when both could apply', () => {
    // A request that threw has told us nothing about whether data exists. Reporting "nothing
    // here" for a timeout is how an outage reads as a quiet week.
    assert.equal(resourceState({ loading: false, error: notice, count: 0 }), 'failed')
  })

  it('reports FAILURE rather than LOADING when both could apply', () => {
    assert.equal(resourceState({ loading: true, error: notice, count: null }), 'failed')
  })

  it('a failure outranks both loading and empty, whatever its status', () => {
    // A request that threw has told us nothing, so neither a spinner nor "no results" may hide it.
    assert.equal(resourceState({ loading: true, error: authStatus, count: 0 }), 'failed')
  })

  it('stays loading on a null count even when loading is false', () => {
    // No data and no error is a request that has not resolved. Calling it empty would render
    // "nothing here" for a request still in flight.
    assert.equal(resourceState({ loading: false, error: null, count: null }), 'loading')
  })
})

describe('a screen whose question can change re-asks it', () => {
  /** Every `useResource(...)` call in a page, as source text. */
  function calls(page: string): string[] {
    const source = read(`src/pages/${page}.tsx`)
    const out: string[] = []
    // `useResource<T>(`, the INVOCATION — not `ReturnType<typeof useResource<T>>`, which is a type
    // annotation on a sub-component's props and carries no dependency array at all. The template's
    // matcher is `useResource[<(]`, which catches both; this surface splits its pages into a page
    // and its panels, so the looser form reported four phantom call sites with no deps and would
    // have failed a correct file.
    for (const m of source.matchAll(/useResource<[^>]*>\(/g)) {
      const at = m.index
      const next = source.indexOf('\n\n', at)
      out.push(source.slice(at, next === -1 ? undefined : next))
    }
    return out
  }

  /**
   * Every page on this surface reads its subject out of the ADDRESS, so every one of them can have
   * its question changed without unmounting.
   *
   * That is not a theoretical risk here. `/blocks/ember/testnet/1` links straight to
   * `/blocks/ember/testnet/2`, and the transaction page links to another transaction's; React
   * Router keeps the same component mounted across both. A read that did not re-run would show
   * block 1's hash and depth under a heading that says block 2 — which on a block explorer is not
   * a stale panel, it is a wrong answer about the chain, rendered confidently.
   *
   * `search` is absent because it calls nothing at all — there is no question to ask until somebody
   * types one — and `chains` is absent because its question never changes: it asks for the same ten
   * scopes every time, so it takes no dependencies and is checked separately below.
   */
  const PARAMETERISED = ['chain', 'block', 'transaction', 'address', 'token']

  for (const page of PARAMETERISED) {
    it(`${page}.tsx re-asks when the address changes`, () => {
      const found = calls(page)
      assert.ok(found.length > 0, `${page} does not call useResource`)
      for (const call of found) {
        assert.match(
          call,
          /scope\?\.chain, scope\?\.network/,
          `a read in ${page}.tsx does not re-run when the scope changes`,
        )
      }
    })
  }

  it('the front page asks ONE question, and it is not about the paste', () => {
    // ── THIS ASSERTED THAT `search.tsx` FETCHED NOTHING AT ALL, AND THAT WAS THE DEFECT ────────
    //
    // The reasoning held for the PASTE — classifying a height, a hash or an address is work this
    // bundle does on its own, and a round trip to tell a reader what they typed is waste. It did
    // not hold for the PAGE. Which chains can be searched at all is a question, it must be
    // answered before the reader commits, and it is a property of the deployment: both estates run
    // one scope, so the selector was offering five chains and serving one.
    //
    // So the rule is now "exactly one read, and it is the chain offer" rather than "no read". The
    // half worth keeping is kept: nothing here fetches a block, a transaction or an address before
    // one is asked for.
    const found = calls('search')
    assert.equal(found.length, 1, 'search.tsx no longer makes exactly one read')
    const source = read('src/pages/search.tsx')
    assert.match(source, /getChainOffers\(network, signal\)/, 'the front page stopped asking')
    for (const forbidden of ['getBlock', 'getTransaction', 'getAddressActivity', 'getToken']) {
      assert.doesNotMatch(
        source,
        new RegExp(`\\b${forbidden}\\(`),
        `search.tsx fetches ${forbidden} before anybody has asked for one`,
      )
    }
  })

  it('chains.tsx re-asks when the DEPLOYMENT NETWORK changes, and on nothing else', () => {
    // Its subject is the chain list on one network, not an address parameter. The network is
    // derived from the hostname, so within a page load it never changes — but it is threaded as a
    // dependency rather than closed over, because a value that "cannot change" and is captured
    // anyway is the arrangement that silently stops re-running the day it can.
    const found = calls('chains')
    assert.equal(found.length, 1, 'chains.tsx no longer makes exactly one read')
    assert.doesNotMatch(found[0] ?? '', /scope\?\.chain/, 'chains.tsx has grown an address parameter')
    // …and it really does read the index, so this is not passing on a page that fetches nothing.
    assert.match(read('src/pages/chains.tsx'), /getChainOffers\(network, signal\)/)
  })

  it('no page passes `load` itself as a dependency', () => {
    // It is recreated every render by every caller here, so it would make the effect a render
    // loop — which is why the hook takes values rather than the closure.
    for (const page of PARAMETERISED) {
      for (const call of calls(page)) {
        assert.doesNotMatch(call, /,\s*\[load\]/, `${page} passes load as a dependency`)
      }
    }
  })

  it('the hook threads the dependencies into the effect rather than accepting and ignoring them', () => {
    // A parameter that is taken and dropped is worse than none: every call site then reads as
    // though it re-fetches.
    const source = read('src/lib/resource.ts')
    assert.match(source, /\}, \[nonce, \.\.\.deps\]\)/)
  })

  it('the hook still aborts the in-flight request when the question changes', () => {
    // The cleanup is what stops a slow answer to the old question landing after the new one.
    const source = read('src/lib/resource.ts')
    assert.match(source, /return \(\) => controller\.abort\(\)/)
  })
})
