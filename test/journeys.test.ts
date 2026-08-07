/**
 * The browser journeys of `docs/ecosystem/22-browser-journeys.md`, tiers 1 and 2, for this surface.
 *
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 * THE ONE RULE. Doc 22 §3: **a browser scenario may never assert a business rule.**
 *
 * A game client once withheld four SKUs from its UI while the payment routes stayed live and
 * chargeable (14 §11); a client-side test of the hidden catalogue would have passed, green,
 * against the defect. So every scenario below asserts one of exactly three things (§3.1): what a
 * human can see relative to what the API returned in the SAME run, what the client SENT, or where
 * the browser ended up.
 *
 * ── The scenario this surface exists for, and it is BJ-NET-16 ──────────────────────────────────
 *
 * `/confirmations` answers 404 `transaction_not_found` for a transaction this indexer has never
 * seen, and 200 with `confirmed: false` for one it has seen that is not deep enough. Those are
 * different facts about somebody's money. `micro-market` merged them and reported "the on-chain
 * escrow is not confirmed yet" for every activation. A caller separates them BY THE ERROR CODE,
 * never by the status, and this scenario asserts the two screens are different — not that the
 * service answers either way, which is `indexer/src/server.ts`'s test and is cited in `ownedBy`.
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, it } from 'node:test'
import { createElement as h } from 'react'

import { withScreen, type Routes } from './dom.ts'
import * as fx from './fixtures.ts'
import { DOC22_IDS, SCENARIOS } from './journeys.ts'
import { App } from '../src/app.tsx'
import { NOT_FINAL } from '../src/lib/format.ts'
import { CHAIN_IDS, NETWORKS } from '../src/lib/indexer.ts'
import { ROUTES } from '../src/lib/routes.ts'

/**
 * THE ORIGIN AND THE SCOPE HAVE TO AGREE, AND UNTIL NOW THEY DID NOT.
 *
 * These scenarios ran at `explorer.cloudsforge.online` — the MAINNET hostname — against a scope of
 * `ember/testnet`, and every one of them passed. That combination was the defect the owner found
 * by using the product: the front page's network was the literal `'testnet'` regardless of where
 * the bundle was served, so the mainnet explorer looked every paste up on a network its index has
 * never walked. The suite could not see it, because the suite had made the same assumption.
 *
 * The network now comes from the hostname (`src/lib/network.ts`), so a mismatched pair is a red
 * test rather than a silent agreement. These scenarios run on the TESTNET hostname, which is what
 * makes `ember/testnet` the right scope for them; `test/network.test.ts` is where both hostnames
 * are driven and required to disagree.
 */
const ORIGIN = 'https://explorer-testnet.cloudsforge.online'
const at = (p: string) => fileURLToPath(new URL(`../${p}`, import.meta.url))
const SCOPE = 'ember/testnet'

/**
 * The front page asks which chains this deployment serves before it offers any. Supplied to every
 * scenario that starts at `/`, with only `ember` served — the live shape, both estates.
 */
const chainOffers: Routes = {
  'GET /v1/chains/': (wire) => {
    const [, , , chain = '', network = ''] = wire.path.split('/')
    return {
      body: fx.chainStatus({
        chain,
        network,
        ...(chain === 'ember' ? {} : { indexedHeight: null, tipHeight: null, lagBlocks: null }),
      }),
    }
  },
}

/**
 * Every scenario mounts the whole `App`.
 *
 * This surface's addresses ARE the subject of half its scenarios — a two-segment scope in every
 * path, an unknown-scope screen distinct from a not-found screen, and a search box that routes
 * three different inputs three different ways. Mounting a page directly would supply the scope by
 * hand and assert nothing about the addressing.
 */
const app = (path: string, routes: Routes, body: Parameters<typeof withScreen>[2]) =>
  withScreen(h(App), { url: `${ORIGIN}${path}`, routes }, body)

const txRoutes = (over: Routes = {}): Routes => ({
  [`GET /v1/transactions/${SCOPE}/${fx.HASH}/confirmations`]: { body: fx.confirmation() },
  [`GET /v1/transactions/${SCOPE}/${fx.HASH}`]: { body: fx.transaction() },
  ...over,
})

/* ══════════════════════════════════════════════════════════════════════════════════════════════
   6.14 Group N — the explorer
   ══════════════════════════════════════════════════════════════════════════════════════════ */

describe('BJ-NET — the explorer', () => {
  it('BJ-NET-11 T1: the index offers a search box, and asks only which chains it can serve', async () => {
    await app('/', chainOffers, async (s) => {
      await s.settle(20)
      const box = s.allByRole('textbox')[0]
      assert.ok(box, 'the index has no search box')
      // ── THIS SCENARIO USED TO ASSERT THE PAGE FETCHED NOTHING AT ALL ────────────────────────
      //
      // The reasoning was that there is no question until somebody types one. That is right about
      // the PASTE and wrong about the PAGE: which chains can be searched at all is a question, it
      // has to be answered before the reader commits, and it is a property of the deployment
      // rather than of the bundle. The old version of this surface offered five chains and served
      // one — the reader found out only after choosing, typing and pressing the button.
      //
      // So the assertion is now about WHICH requests, not whether. Nothing may be fetched except
      // the chain offer: no block, no transaction, no address, because none of those has been
      // asked for.
      const paths = s.api.wire.map((w) => `${w.method} ${w.path}`)
      assert.ok(paths.length > 0, 'the index did not ask which chains it serves')
      for (const p of paths) {
        assert.match(p, /^GET \/v1\/chains\/[a-z]+\/testnet\/status$/, `the index also asked: ${p}`)
      }
      s.clean('BJ-NET-11')
    })
  })

  it('BJ-NET-12 T2: a height, a hash and an address route to three different scope paths', async () => {
    const cases: ReadonlyArray<{ typed: string; expect: RegExp; name: string }> = [
      { typed: '900', expect: new RegExp(`/v1/blocks/${SCOPE}/900`), name: 'a height' },
      { typed: fx.HASH, expect: new RegExp(`/v1/transactions/${SCOPE}/`), name: 'a hash' },
      { typed: fx.ADDRESS, expect: new RegExp(`/v1/addresses/${SCOPE}/`), name: 'an address' },
    ]
    for (const c of cases) {
      await app(
        '/',
        {
          // The chain offer, first: nothing is submittable until the index has said it serves the
          // selected chain, which is what stops a lookup being sent to a scope this deployment
          // cannot answer about.
          ...chainOffers,
          // Deliberately broad: what is asserted is WHICH address the browser went to, and every
          // one of them answers with something the page can render.
          'GET /v1/blocks': {
            body: {
              chain: 'ember',
              network: 'testnet',
              height: 900,
              hash: `0x${'cd'.repeat(32)}`,
              parentHash: `0x${'ba'.repeat(32)}`,
              blockTime: '2026-08-01T09:00:00.000Z',
              status: 'canonical',
              reorgDepth: null,
              txCount: 0,
              confirmations: 12,
              detail: {},
              transactionHashes: [],
            },
          },
          [`GET /v1/transactions/${SCOPE}/${fx.HASH}/confirmations`]: { body: fx.confirmation() },
          [`GET /v1/transactions`]: { body: fx.transaction() },
          [`GET /v1/addresses/${SCOPE}/${fx.ADDRESS}/token-balances`]: {
            body: {
              chain: 'ember',
              network: 'testnet',
              address: fx.ADDRESS,
              atBlock: 912,
              indexedHeight: 912,
              tipHeight: 915,
              halted: false,
              coverage: { fromHeight: 0, toHeight: 912, blocks: 913, complete: true },
              balances: [],
              unavailable: null,
            },
          },
          'GET /v1/addresses': {
            body: {
              chain: 'ember',
              network: 'testnet',
              address: fx.ADDRESS,
              tipHeight: 915,
              requiredConfirmations: 6,
              items: [],
              nextCursor: null,
            },
          },
        },
        async (s) => {
          await s.settle(20)
          const box = s.allByRole('textbox')[0] as Element
          await s.type(box, c.typed)
          const go = s.allByRole('button').find((el) => /search|go|look/i.test(s.textOf(el)))
          assert.ok(go, 'the search form has no commit control')
          await s.click(go)
          await s.settle(40)
          assert.ok(
            s.api.wire.some((w) => c.expect.test(w.path)),
            `${c.name} did not route to a ${String(c.expect)} address; it asked for ` +
              `${JSON.stringify(s.api.wire.map((w) => w.path))}`,
          )
          // And every address carries the scope as TWO path segments. `indexer` reads chain and
          // network separately; a single `ember-testnet` segment would be a 404 nobody could
          // diagnose from the address bar.
          //
          // The chain-offer probes are excluded from the SCOPE check and checked separately: they
          // sweep every chain by design, so they carry `/eth/testnet/` and `/btc/testnet/` rather
          // than the selected one. What must hold for them is the NETWORK segment — a probe on the
          // wrong network is the defect this whole surface was changed for.
          const record = s.api.wire.filter((w) => !w.path.startsWith('/v1/chains/'))
          assert.ok(record.length > 0, 'no record read was made at all')
          for (const w of record) {
            assert.ok(
              w.path.includes(`/${SCOPE}/`),
              `${w.path} does not carry the scope as two segments`,
            )
          }
          for (const w of s.api.wire.filter((w) => w.path.startsWith('/v1/chains/'))) {
            assert.match(w.path, /^\/v1\/chains\/[a-z]+\/testnet\/status$/, `${w.path} is off-network`)
          }
        },
      )
    }
  })

  it('BJ-NET-13 T2: an unrun scope gets the unknown-scope screen, naming the chains and networks', async () => {
    await app('/chains/doge/mainnet', {}, async (s) => {
      await s.settle(20)
      // Not a generic not-found. That is what turns a typo into a fix: the reader is told what
      // this estate does run, so they can pick one.
      for (const chain of CHAIN_IDS) {
        assert.ok(s.text().includes(chain), `the unknown-scope screen does not name ${chain}`)
      }
      for (const network of NETWORKS) {
        assert.ok(s.text().includes(network), `the unknown-scope screen does not name ${network}`)
      }
      // And it asked nothing: a chain this estate does not run is knowable from the address.
      assert.deepEqual(
        s.api.wire.map((w) => w.path),
        [],
        'the page asked the indexer about a chain the bundle already knows it does not run',
      )
    })
  })

  it('BJ-NET-14 ★ T2: one row per scope with the state its own index reports', async () => {
    await app(
      '/chains',
      {
        'GET /v1/chains': (w) => {
          const [, , , chain = '', network = ''] = w.path.split('/')
          return {
            body: fx.chainStatus({
              chain,
              network,
              ...(chain === 'eth'
                ? { halted: true, haltReason: 'a reorg past the alarm depth' }
                : {}),
            }),
          }
        },
      },
      async (s) => {
        await s.settle(20)
        // Presentation relative to what the API returned in this same run: each scope's own
        // state, not a summary this page composed.
        assert.ok(s.text().includes('ember'), 'the ember scope has no row')
        assert.ok(s.text().includes('eth'), 'the eth scope has no row')
        assert.match(
          s.text(),
          /halt/i,
          'a halted chain is rendered as if it were vouching for itself. A service that has ' +
            'stopped vouching is the one fact a reader of this page needs.',
        )
      },
    )
  })

  it('BJ-NET-15 ★ T1: the record supplies the facts, the confirmations answer supplies the verdict', async () => {
    await app(`/tx/${SCOPE}/${fx.HASH}`, txRoutes(), async (s) => {
      await s.settle(30)
      // Both reads happened. One of them is not a substitute for the other.
      assert.ok(s.api.wire.some((w) => w.path === `/v1/transactions/${SCOPE}/${fx.HASH}`))
      assert.ok(
        s.api.wire.some((w) => w.path === `/v1/transactions/${SCOPE}/${fx.HASH}/confirmations`),
        'the page took the verdict from the record, which counts against a provider’s CLAIM ' +
          'rather than against the head this service has walked',
      )
      // The facts are on the page.
      assert.ok(s.text().includes(fx.transaction().hash.slice(0, 10)))
      // And the page makes no claim of finality.
      //
      // TWO THINGS HAD TO BE GOT RIGHT HERE AND THE FIRST ATTEMPT GOT NEITHER.
      //
      // The naive form — "the word `final` appears nowhere on the page" — FAILS ON CORRECT CODE,
      // because `NOT_FINAL` is the one sentence this app renders instead of the word and it
      // contains it: "it never says a thing is final". A guard that fails on correct code is a
      // guard somebody deletes.
      //
      // The second attempt compared the page against the imported `NOT_FINAL`, which CANNOT FAIL:
      // rewriting the constant to "this transaction is final and cannot be reversed" rewrote the
      // page and the expectation together, and the assertion stayed green against a page that now
      // claimed finality outright. That is the estate's own recurring defect — a client asserting
      // it posts to the URL it was written to post to — reproduced in a test written to catch it.
      //
      // So the sentence is SPELLED OUT here, once, and the module's constant is required to equal
      // it. Changing the copy now fails in this file, which is where a change to a load-bearing
      // sentence should have to be argued for.
      const DENIES_FINALITY =
        'A depth measures how unlikely a reversal has become. It is not a proof that one cannot ' +
        'happen, so every count here names the block it was measured from.'
      assert.equal(
        NOT_FINAL,
        DENIES_FINALITY,
        'src/lib/format.ts:NOT_FINAL changed. It is the one sentence this bundle uses instead of ' +
          'the word "final"; changing it is a decision, not a refactor.',
      )
      assert.ok(s.text().includes(DENIES_FINALITY), 'the depth disclaimer is not on the page')
      const outside = s.text().split(DENIES_FINALITY).join(' ')
      assert.doesNotMatch(
        outside,
        /\bfinal(ised|ized|ity)?\b/i,
        'the page claimed finality outside the one sentence that denies it. Depth is a ' +
          'probability, not a proof.',
      )
    })
  })

  it('BJ-NET-16 ★ T1: a never-seen transaction and an unconfirmed one are two different screens', async () => {
    const said = async (reply: Routes[string]): Promise<string> => {
      let captured = ''
      await app(
        `/tx/${SCOPE}/${fx.HASH}`,
        txRoutes({ [`GET /v1/transactions/${SCOPE}/${fx.HASH}/confirmations`]: reply }),
        async (s) => {
          await s.settle(30)
          captured = s.text()
        },
      )
      return captured
    }

    const neverSeen = await said({
      status: 404,
      body: fx.error('transaction_not_found', 'this service has never seen that transaction'),
      requestId: 'req-404',
    })
    const notDeepEnough = await said({ body: fx.confirmation({ confirmed: false, confirmations: 2 }) })

    assert.notEqual(
      neverSeen,
      notDeepEnough,
      'a transaction this indexer has never seen and one that is two blocks deep render the ' +
        'same screen. That merge is what made micro-market report "escrow not confirmed" for ' +
        'every activation.',
    )
    // …and the difference is SPECIFIC, not merely textual. The never-seen screen says this index
    // has no record, and says in as many words that it is not the same as unconfirmed. A branch
    // that fell through to the generic 404 would still produce "different text" and would have
    // lost exactly the sentence that matters, so `notEqual` alone is not enough.
    assert.match(neverSeen, /no record of that transaction here/i)
    assert.match(neverSeen, /a different thing from not yet deep enough/i)
    assert.match(
      neverSeen,
      /nothing to measure a depth against/i,
      'the never-seen screen reported a depth of zero. Zero is a count; this is an absence.',
    )
    // The unconfirmed one says how deep it is, which is the fact a caller can act on.
    assert.match(notDeepEnough, /sits 2 blocks deep, and this chain is credited at 6/i)
    // And the never-seen one claims no depth at all.
    assert.doesNotMatch(neverSeen, /2 of the 6|2 confirmations/i)
  })

  it('BJ-NET-17 ★ T1: a reverted transaction at full depth shows status beside depth', async () => {
    await app(
      `/tx/${SCOPE}/${fx.HASH}`,
      txRoutes({
        [`GET /v1/transactions/${SCOPE}/${fx.HASH}`]: { body: fx.transaction({ status: 'reverted' }) },
        [`GET /v1/transactions/${SCOPE}/${fx.HASH}/confirmations`]: {
          body: fx.confirmation({ status: 'reverted', confirmed: false, confirmations: 40 }),
        },
      }),
      async (s) => {
        await s.settle(30)
        // A reverted transaction is mined, sits in a block, and accumulates depth exactly like one
        // that worked. A confirmation test that only counted blocks would tell a marketplace that
        // a failed escrow deposit is confirmed.
        assert.match(s.text(), /revert/i, 'the revert is not on the page')
        assert.ok(s.text().includes('40'), 'the depth is not on the page')
        // The verdict is negative even at forty blocks, and the page says which input failed.
        assert.doesNotMatch(
          s.text(),
          /confirmed[^a-z]*yes|is confirmed\b/i,
          'a reverted transaction at depth was reported as confirmed',
        )
      },
    )
  })

  it('BJ-NET-18 T2: a chain behind its tip states the lag, and each reorg carries its depth', async () => {
    await app(
      `/chains/${SCOPE}`,
      {
        [`GET /v1/chains/${SCOPE}/status`]: {
          body: fx.chainStatus({
            indexedHeight: 800,
            tipHeight: 915,
            lagBlocks: 115,
            recentReorgs: [
              {
                id: 'reorg-1',
                detectedAt: '2026-08-02T09:00:00.000Z',
                depth: 4,
                commonAncestorHeight: 890,
                alarming: false,
                orphanedBlocks: 4,
                orphanedTransactions: 11,
                orphanedActivity: 3,
              },
            ],
          }),
        },
      },
      async (s) => {
        await s.settle(20)
        // A lag of 115 blocks is the difference between what a provider claims and what this
        // service has walked, and a page that rendered the tip alone would imply it is current.
        assert.ok(s.text().includes('115'), 'the lag is not stated')
        assert.match(s.text(), /reorg/i, 'the reorgs are not rendered')
        assert.ok(s.text().includes('4'), 'a reorg is rendered without its depth')
      },
    )
  })

  it('BJ-NET-19 T1: activity and balances are two reads, and one failing does not blank the other', async () => {
    await app(
      `/address/${SCOPE}/${fx.ADDRESS}`,
      {
        [`GET /v1/addresses/${SCOPE}/${fx.ADDRESS}/activity`]: {
          body: {
            chain: 'ember',
            network: 'testnet',
            address: fx.ADDRESS,
            tipHeight: 915,
            requiredConfirmations: 6,
            items: [],
            nextCursor: null,
          },
        },
        [`GET /v1/addresses/${SCOPE}/${fx.ADDRESS}/token-balances`]: {
          status: 503,
          body: fx.error('rpc_unavailable', 'the token index did not answer'),
          requestId: 'req-tokens-503',
        },
      },
      async (s) => {
        await s.settle(30)
        // The activity half rendered even though the balances half failed.
        assert.ok(s.text().includes(fx.ADDRESS.slice(0, 10)), 'the address page did not paint')
        assert.match(s.text(), /did not answer|unavailable|could not/i, 'the failure is silent')
        // A missing balance is missing, never zero. A zero here is a claim about somebody's money.
        assert.doesNotMatch(
          s.text(),
          /balance[^a-z]{0,20}\b0\b/i,
          'an unavailable balance was rendered as zero',
        )
      },
    )
  })

  it('BJ-NET-20 T2: supply and authorities are the contract’s, not an order record’s', async () => {
    await app(
      `/tokens/${SCOPE}/${fx.ADDRESS}`,
      {
        [`GET /v1/tokens/${SCOPE}/${fx.ADDRESS}`]: {
          body: {
            chain: 'ember',
            network: 'testnet',
            contractAddress: fx.ADDRESS,
            name: 'Test Token',
            symbol: 'TT',
            decimals: 18,
            totalSupply: '1000000000000000000000',
            cap: null,
            owner: null,
            mintAuthority: false,
            paused: false,
            observedAtBlock: 912,
            observedAtBlockHash: `0x${'ef'.repeat(32)}`,
            tipHeight: 915,
            halted: false,
          },
        },
      },
      async (s) => {
        await s.settle(20)
        assert.ok(s.text().includes('Test Token'), 'the token did not render')
        // Every figure carries where it was observed. A supply with no height beside it is a
        // supply a reader will quote as current for ever.
        assert.ok(
          s.text().includes('912') || /observed/i.test(s.text()),
          'the supply is rendered with no observation point',
        )
        // And the mint authority is the CONTRACT's answer, rendered as an answer rather than
        // inferred from an absence.
        assert.match(s.text(), /mint/i, 'the authorities are not rendered')
      },
    )
  })

  it('BJ-NET-21 T2: the block page renders height, hash and the transactions in it', async () => {
    await app(
      `/blocks/${SCOPE}/900`,
      {
        [`GET /v1/blocks/${SCOPE}/900`]: {
          body: {
            chain: 'ember',
            network: 'testnet',
            height: 900,
            hash: `0x${'cd'.repeat(32)}`,
            parentHash: `0x${'ba'.repeat(32)}`,
            blockTime: '2026-08-01T09:00:00.000Z',
            status: 'canonical',
            reorgDepth: null,
            txCount: 1,
            confirmations: 12,
            detail: {},
            transactionHashes: [fx.HASH],
          },
        },
      },
      async (s) => {
        await s.settle(20)
        assert.ok(s.text().includes('900'), 'the height is not on the page')
        assert.ok(s.text().includes('0xcdcdcdcd'), 'the block hash is not on the page')
        assert.ok(
          s.text().includes(fx.HASH.slice(0, 10)),
          'the transactions in the block are not rendered',
        )
      },
    )
  })
})

/* ══════════════════════════════════════════════════════════════════════════════════════════════
   6.19 Group S — the page-level hazards
   ══════════════════════════════════════════════════════════════════════════════════════════ */

describe('BJ-ADV — the page-level hazards', () => {
  it('BJ-ADV-22 ★ T1: the transaction page paints while one of its two reads is slow', async () => {
    await app(
      `/tx/${SCOPE}/${fx.HASH}`,
      txRoutes({
        [`GET /v1/transactions/${SCOPE}/${fx.HASH}/confirmations`]: {
          body: fx.confirmation(),
          delayMs: 40,
        },
      }),
      async (s) => {
        await s.settle(10)
        // The record half is on screen with the verdict half still in flight, and the verdict is
        // marked pending rather than assumed either way.
        assert.ok(s.text().length > 40, 'the page did not paint while a read was in flight')
        await s.settle(80)
        assert.ok(s.text().includes(fx.HASH.slice(0, 10)), 'the slow read never landed')
      },
    )
  })

  it('BJ-ADV-23 ★ T1: every failure state offers a request id', async () => {
    const cases: ReadonlyArray<{ name: string; path: string; routes: Routes }> = [
      {
        name: 'the transaction read',
        path: `/tx/${SCOPE}/${fx.HASH}`,
        routes: txRoutes({
          [`GET /v1/transactions/${SCOPE}/${fx.HASH}`]: {
            status: 500,
            body: fx.error('internal', 'it broke'),
            requestId: 'req-a',
          },
        }),
      },
      {
        name: 'the chains read',
        path: '/chains',
        routes: {
          'GET /v1/chains': { status: 500, body: fx.error('internal', 'it broke'), requestId: 'req-b' },
        },
      },
      {
        name: 'the chain status read',
        path: `/chains/${SCOPE}`,
        routes: {
          [`GET /v1/chains/${SCOPE}/status`]: {
            status: 500,
            body: fx.error('internal', 'it broke'),
            requestId: 'req-c',
          },
        },
      },
    ]
    for (const c of cases) {
      await app(c.path, c.routes, async (s) => {
        await s.settle(30)
        assert.match(s.text(), /req-[abc]/, `${c.name} failed without the request id to quote`)
      })
    }
  })
})

/* ══════════════════════════════════════════════════════════════════════════════════════════════
   6.20 Group T — accessibility
   ══════════════════════════════════════════════════════════════════════════════════════════ */

describe('BJ-A11Y — accessibility', () => {
  it('BJ-A11Y-03 ★ T1: a failure is announced and is not colour-only', async () => {
    await app(
      `/chains/${SCOPE}`,
      {
        [`GET /v1/chains/${SCOPE}/status`]: {
          status: 500,
          body: fx.error('internal', 'the index did not answer'),
          requestId: 'req-a11y',
        },
      },
      async (s) => {
        await s.settle(30)
        const alert = s.document.querySelector('[role="alert"]')
        assert.ok(alert, 'the failure is not a live region, so it is never announced')
        assert.ok(s.textOf(alert).length > 20, 'the failure has no sentence in it')
        assert.match(s.textOf(alert), /the index did not answer/i)
      },
    )
  })

  it('BJ-A11Y-10 T1: every state badge carries a word', async () => {
    await app(`/tx/${SCOPE}/${fx.HASH}`, txRoutes(), async (s) => {
      await s.settle(30)
      const badges = [...s.document.querySelectorAll('[class*="badge" i], [class*="ex-state" i], [class*="chip" i]')]
      assert.ok(badges.length > 0, 'the page renders no state badges at all')
      for (const badge of badges) {
        if (badge.getAttribute('aria-hidden') === 'true') continue
        assert.ok(
          s.textOf(badge).length > 0,
          `a badge rendered with no text: ${badge.outerHTML.slice(0, 120)}`,
        )
      }
    })
  })

  it('BJ-A11Y-12 T1: one main landmark, a reachable skip link, no skipped heading level', async () => {
    await app('/', {}, async (s) => {
      await s.settle(20)
      assert.equal(s.allByRole('main').length, 1)
      const skip = s.document.querySelector('a[href^="#"]')
      assert.ok(skip, 'no skip link')
      assert.ok(s.document.getElementById((skip.getAttribute('href') ?? '#').slice(1)))
      assert.equal(s.tabbables()[0], skip, 'the skip link is not first in the tab order')

      const levels = s.allByRole('heading').map((el) => Number(el.tagName.slice(1)))
      assert.equal(levels.filter((l) => l === 1).length, 1, 'a page has exactly one h1')
      let previous = 0
      for (const level of levels) {
        assert.ok(previous === 0 || level <= previous + 1, `heading order skips h${previous} → h${level}`)
        previous = level
      }
    })
  })
})

/* ══════════════════════════════════════════════════════════════════════════════════════════════
   5.1 — the universal per-surface property
   ══════════════════════════════════════════════════════════════════════════════════════════ */

describe('BJ-EXPLORER-404 — an unowned address answers 404', () => {
  const directives = readFileSync(at('nginx.conf'), 'utf8')
    .split('\n')
    .filter((line) => !/^\s*#/.test(line))
    .join('\n')

  it('BJ-EXPLORER-404 T2: nginx serves the shell through error_page 404, never try_files', () => {
    assert.match(directives, /error_page\s+404\s+\/index\.html/)
    assert.doesNotMatch(directives, /try_files\s+\$uri\s+(\$uri\/\s+)?\/index\.html/)
  })

  it('BJ-EXPLORER-404 T2: the not-found screen renders inside the shell', async () => {
    await app('/nothing-here', {}, async (s) => {
      assert.match(s.text(), /not found|nothing at this address|no page|does not exist/i)
      assert.ok(s.allByRole('link').length > 0, 'the not-found screen strands the reader')
      assert.ok(!ROUTES.map((r) => r.path).includes('nothing-here'))
    })
  })
})

/* ══════════════════════════════════════════════════════════════════════════════════════════════
   The meta-test. Doc 22 §3.2.
   ══════════════════════════════════════════════════════════════════════════════════════════ */

describe('the catalogue and this file agree', () => {
  it('every id doc 22 assigns to this surface is accounted for exactly once', () => {
    const ids = SCENARIOS.map((s) => s.id)
    assert.deepEqual([...new Set(ids)].sort(), [...ids].sort(), 'an id appears twice')
    assert.deepEqual([...ids].sort(), [...DOC22_IDS].sort())
  })

  it('a scenario whose outcome depends on a server rule carries an ownedBy path', () => {
    const REFUSAL = /\b(refus|denie|denial|reject|transaction_not_found|403|409|4xx)\w*/i
    for (const s of SCENARIOS) {
      if (s.blocked) continue
      if (!REFUSAL.test(s.what)) continue
      assert.ok(
        s.ownedBy,
        `${s.id} turns on a server-side refusal and names no test that owns it. Doc 22 §3.2.`,
      )
      assert.match(s.ownedBy.path, /^[a-z-]+\/src\/[\w./-]+\.ts$/)
    }
  })

  it('no scenario is marked implemented without a test named for it', () => {
    const source = readFileSync(at('test/journeys.test.ts'), 'utf8')
    for (const s of SCENARIOS) {
      if (s.blocked) continue
      assert.ok(
        new RegExp(`it\\('${s.id}[ ★]`).test(source),
        `${s.id} is in the catalogue as implemented and has no test named for it`,
      )
    }
  })

  it('every blocked scenario names its blocker and no blocker is a shrug', () => {
    for (const s of SCENARIOS) {
      if (!s.blocked) continue
      assert.ok(s.blocked.length > 60, `${s.id}'s blocker is too short to be a reason`)
      assert.ok(
        /doc 22|§|does not exist|no UI|tier 3|micro-beacon|not installed/i.test(s.blocked),
        `${s.id}'s blocker does not name a fact about the estate: ${s.blocked}`,
      )
    }
  })

  it('nothing here is tier 3 and implemented — tier 3 lives in micro-beacon', () => {
    for (const s of SCENARIOS) {
      if (s.tier !== 'T3') continue
      assert.ok(s.blocked, `${s.id} is tier 3 and not blocked; doc 22 §4 puts tier 3 in beacon`)
    }
  })
})
