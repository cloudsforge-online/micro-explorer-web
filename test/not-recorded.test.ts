/**
 * "NOT RECORDED" MUST NOT RENDER AS "NOTHING HAPPENED".
 *
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 * micro-indexer#7 (micro-org #253) narrowed what a deployment writes down. A node walking a chain
 * for the estate's own custody set now records an `address_activity` row only for an address it
 * was asked to watch, stamps every block it walked that way `detail.partial =
 * 'watched-addresses-only'` (`indexer/src/btcsource.ts`), and answers an activity read about
 * anybody else with an empty `items` and `incomplete: { reason: 'address_not_watched' }`
 * (`indexer/src/reads.ts`).
 *
 * This bundle did not know about the marker, so it rendered that answer through the empty state:
 * **"Nothing has moved through this address"**, with a second sentence reassuring the reader about
 * how far back the record goes. Nothing failed. The request succeeded, the shape was right, the
 * suite was green, and a visitor was told their address was empty when the truth was that this
 * estate had never written it down. That is the defect these scenarios exist for — and note that
 * no test in this repository could have caught it, because every fixture was a response from a
 * deployment that recorded everybody.
 *
 * ── WHY THESE ARE HERE AND NOT IN `test/journeys.test.ts` ─────────────────────────────────────
 *
 * That file is doc 22's catalogue, and its own meta-tests bind the set of scenarios in it to the
 * set of `BJ-*` ids doc 22 assigns to this surface — exactly once each, in both directions. There
 * is no id for this, because doc 22 was written when an empty page had one meaning. Inventing one
 * would be claiming a coverage row the ecosystem document does not have; hanging these off a
 * neighbouring id (BJ-NET-19 is the closest, and it is about two reads failing independently)
 * would bury them under a name that does not describe them. So they are their own file, and the
 * day doc 22 grows a row for this they can move under it with the ids attached.
 *
 * ── WHAT EACH SCENARIO ASSERTS, AND THE ONE IT MUST NEVER STOP ASSERTING ──────────────────────
 *
 * Every one of these is doc 22 §3.1's first kind: what a human can see, relative to what the API
 * returned in the SAME run. None of them asserts that the service marks anything — that is the
 * indexer's own test, and `test/indexer.test.ts` is where this repository checks the agreement.
 *
 * The load-bearing assertion is negative: the empty state's sentence must NOT be on the page. A
 * positive check that the notice rendered would pass just as happily if the page showed BOTH,
 * which is the failure mode a careless fix produces — a caveat stacked on top of a confident
 * denial, leaving the reader to decide which of two contradictory paragraphs to believe.
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { createElement as h } from 'react'

import { withScreen, type Routes } from './dom.ts'
import * as fx from './fixtures.ts'
import { App } from '../src/app.tsx'
import {
  PARTIAL_DETAIL_KEY,
  type ActivityPage,
  type ActivityView,
  type BlockView,
} from '../src/lib/indexer.ts'

/** The testnet hostname, so the origin and the scope agree — see `test/journeys.test.ts`. */
const ORIGIN = 'https://explorer-testnet.cloudsforge.online'
const SCOPE = 'ember/testnet'

const app = (path: string, routes: Routes, body: Parameters<typeof withScreen>[2]) =>
  withScreen(h(App), { url: `${ORIGIN}${path}`, routes }, body)

/** The sentence the page must not reach for. Quoted from `src/pages/address.tsx`'s `Empty`. */
const NOTHING_MOVED = /Nothing has moved through this address/i

/**
 * An activity page, typed against the client's own declaration.
 *
 * Typed rather than cast, which is the whole reason `test/fixtures.ts` exists: a fixture that was
 * a bare object literal could go on describing a shape the service stopped sending, and every
 * scenario built on it would keep passing against a response nothing produces.
 */
function activity(over: Partial<ActivityPage> = {}): ActivityPage {
  return {
    chain: 'ember',
    network: 'testnet',
    address: fx.ADDRESS,
    tipHeight: 915,
    requiredConfirmations: 6,
    items: [],
    nextCursor: null,
    ...over,
  }
}

/**
 * One movement, below the height the record narrows at — the case where the marker arrives WITH
 * history. Typed as `ActivityView` for the reason above, and the height is deliberately well below
 * `fromHeight` in every scenario that uses it, because that is the only way such a row can exist.
 */
const movement: ActivityView = {
  id: 'act-1',
  address: fx.ADDRESS,
  direction: 'in',
  assetCode: 'CFG',
  assetKind: 'native',
  tokenAddress: null,
  amount: '1000000000000000000',
  amountFormatted: '1.0',
  txHash: fx.HASH,
  txUrn: `urn:cf:tx:ember:testnet:${fx.HASH}`,
  explorerUrl: null,
  logIndex: null,
  blockHeight: 41,
  blockHash: `0x${'cd'.repeat(32)}`,
  status: 'included',
  confirmations: 874,
  confirmed: true,
  firstSeenAt: '2026-07-01T09:00:00.000Z',
  confirmedAt: '2026-07-01T09:01:00.000Z',
  reorgedAt: null,
}

/** A holdings answer that is believable and empty — the shape that used to say "genuinely nought". */
const emptyHoldings = {
  chain: 'ember',
  network: 'testnet',
  address: fx.ADDRESS,
  atBlock: 912,
  indexedHeight: 912,
  tipHeight: 915,
  halted: false,
  coverage: { fromHeight: 0, toHeight: 912, blocks: 913, complete: true },
  balances: [],
}

const addressRoutes = (page: ActivityPage, holdings: unknown = emptyHoldings): Routes => ({
  [`GET /v1/addresses/${SCOPE}/${fx.ADDRESS}/activity`]: { body: page },
  [`GET /v1/addresses/${SCOPE}/${fx.ADDRESS}/token-balances`]: { body: holdings },
})

describe('an address this deployment never watched', () => {
  it('is not told that nothing has moved through it', async () => {
    await app(
      `/address/${SCOPE}/${fx.ADDRESS}`,
      addressRoutes(
        activity({ incomplete: { reason: 'address_not_watched', fromHeight: 120 } }),
      ),
      async (s) => {
        await s.settle(30)
        // THE ASSERTION THIS FILE EXISTS FOR. Everything else here is supporting evidence.
        assert.doesNotMatch(
          s.text(),
          NOTHING_MOVED,
          'an unwatched address was told its history is empty — the defect micro-org #253 created',
        )
        // …and the true answer took its place, rather than the section rendering as nothing at
        // all, which would be a different way of saying the same false thing.
        assert.match(
          s.text(),
          /not one this service keeps a record of/i,
          'the page says neither "nothing moved" nor "this was not recorded"',
        )
        // The reason code and the height are both on the page, because a reader who wants to ask
        // somebody about this needs the words the service used, not a paraphrase of them.
        assert.match(s.text(), /address_not_watched/, 'the reason code is not shown')
        assert.match(s.text(), /120/, 'the height the record narrows at is not shown')
        s.clean('unwatched address')
      },
    )
  })

  it('is announced, so a screen reader is not left with a silently changed region', async () => {
    await app(
      `/address/${SCOPE}/${fx.ADDRESS}`,
      addressRoutes(
        activity({ incomplete: { reason: 'address_not_watched', fromHeight: 120 } }),
      ),
      async (s) => {
        await s.settle(30)
        // Doc 22 BJ-A11Y-03's rule applied to a state this surface grew afterwards: the notice
        // replaces a region that was there a moment ago, and a replacement nobody announces is a
        // reader being shown a different answer without being told the answer changed.
        const statuses = s.allByRole('status').map((el) => s.textOf(el))
        assert.ok(
          statuses.some((t) => /not one this service keeps a record of/i.test(t)),
          `the notice is not in a live region; the ones present were: ${statuses.join(' | ')}`,
        )
      },
    )
  })

  it('keeps the movements recorded before the record narrowed, and still says it narrowed', async () => {
    // The case a fix written only for the empty state gets wrong. `fromHeight` is where the record
    // narrows; anything below it was written down for everybody, so this page has REAL rows and a
    // truncated history at the same time. Rendering the rows alone would present a partial history
    // as a complete one, which is the original defect with a table in front of it.
    await app(
      `/address/${SCOPE}/${fx.ADDRESS}`,
      addressRoutes(
        activity({
          items: [movement],
          incomplete: { reason: 'address_not_watched', fromHeight: 120 },
        }),
      ),
      async (s) => {
        await s.settle(30)
        assert.match(s.text(), /not one this service keeps a record of/i, 'the notice is missing')
        assert.match(s.text(), /received/i, 'the movements below the narrowing were dropped')
        assert.doesNotMatch(s.text(), NOTHING_MOVED)
        // The notice comes FIRST. A caveat below a table is a caveat read after the reader has
        // already decided what the table means.
        s.before(
          /not one this service keeps a record of/i,
          /Direction/,
          'the notice is below the rows it qualifies',
        )
      },
    )
  })

  it('does not let the holdings panel call an empty balance list a nought', async () => {
    // `tokenBalancesAt` (`indexer/src/store.ts`) sums the same `address_activity` rows, so this
    // read inherits the silence — but its `unavailable` union has no member for it, and its
    // coverage check passes because the BLOCKS are all there. Nothing upstream can tell this panel
    // anything is wrong, which is why `src/pages/address.tsx` passes it what the activity read
    // learned. Reported to micro-indexer; `test/indexer.test.ts` goes red when they fix it.
    await app(
      `/address/${SCOPE}/${fx.ADDRESS}`,
      addressRoutes(
        activity({ incomplete: { reason: 'address_not_watched', fromHeight: 120 } }),
      ),
      async (s) => {
        await s.settle(30)
        assert.doesNotMatch(
          s.text(),
          /genuinely means nought rather than unknown/i,
          'the holdings panel claimed an unrecorded address holds nothing',
        )
        assert.match(
          s.text(),
          /never written down here/i,
          'the holdings panel says nothing at all about why it has no figure',
        )
      },
    )
  })
})

describe('an address the deployment DOES watch, on the same narrowed deployment', () => {
  it('still gets the plain empty state, because for it the answer really is nothing', async () => {
    // The other half of the contract, and the reason the marker is checked rather than the
    // deployment. A page that showed the caveat whenever `items` was empty would put a hole in
    // every genuinely empty address on every chain — a true statement made false by being said
    // about the wrong thing, and the sort of over-correction that gets reverted wholesale.
    await app(
      `/address/${SCOPE}/${fx.ADDRESS}`,
      addressRoutes(activity()),
      async (s) => {
        await s.settle(30)
        assert.match(s.text(), NOTHING_MOVED, 'a genuinely empty address lost its empty state')
        assert.doesNotMatch(
          s.text(),
          /not one this service keeps a record of/i,
          'an address the service DID answer about was told it was not recorded',
        )
      },
    )
  })
})

describe('a block walked for a narrowed address set', () => {
  const block = (detail: Record<string, unknown>): BlockView => ({
    chain: 'ember',
    network: 'testnet',
    height: 900,
    hash: `0x${'cd'.repeat(32)}`,
    parentHash: `0x${'ba'.repeat(32)}`,
    blockTime: '2026-08-01T09:00:00.000Z',
    status: 'canonical',
    reorgDepth: null,
    txCount: 1,
    confirmations: 15,
    detail,
    transactionHashes: [fx.HASH],
  })

  it('says what was left out, in words, above the list it qualifies', async () => {
    // The marker was ALREADY on this page before the fix — as a row in the verbatim `detail` dump
    // at the foot, reading `partial` / `watched-addresses-only`, in a table whose own note says it
    // holds fields the page cannot make sense of. On screen and useless is not the same as shown.
    await app(
      `/blocks/${SCOPE}/900`,
      { [`GET /v1/blocks/${SCOPE}/900`]: { body: block({ [PARTIAL_DETAIL_KEY]: 'watched-addresses-only' }) } },
      async (s) => {
        await s.settle(30)
        assert.match(
          s.text(),
          /Not everything about this block was written down here/i,
          'the block page renders the partial marker only as a raw detail row',
        )
        assert.match(s.text(), /watched-addresses-only/, 'the raw marker is no longer quoted')
        // Before the LIST, not before the section heading — the caveat belongs inside the section
        // it qualifies, and putting it above the heading would detach it from the thing it is
        // about. What matters is that no hash is read before it. `fx.HASH` is the one in this
        // block, and the verbatim `detail` table at the foot is the other place the marker
        // appears, which is why the ORDER is asserted rather than mere presence.
        s.before(
          /Not everything about this block was written down here/i,
          fx.HASH,
          'the caveat sits below the transactions it is about',
        )
      },
    )
  })

  it('a marker this bundle has never heard of survives to the screen rather than being dropped', async () => {
    // `partialMarker` returns the raw string instead of narrowing to `PartialBlockReason`, and
    // `partialBlockReason` has a default branch. The alternative — a narrowing cast — means a
    // reason micro-indexer adds tomorrow renders as a complete block, silently, on the page where
    // completeness is the question being asked.
    await app(
      `/blocks/${SCOPE}/900`,
      { [`GET /v1/blocks/${SCOPE}/900`]: { body: block({ [PARTIAL_DETAIL_KEY]: 'receipts-not-fetched' }) } },
      async (s) => {
        await s.settle(30)
        assert.match(s.text(), /Not everything about this block was written down here/i)
        assert.match(s.text(), /receipts-not-fetched/, 'an unrecognised marker was swallowed')
        assert.match(
          s.text(),
          /does not recognise/i,
          'the page pretended to understand a marker it has no sentence for',
        )
      },
    )
  })

  it('a block stamped null carries no caveat, because null means it was walked in full', async () => {
    // `markPartial` writes the key with a null for a whole block (`indexer/src/btcsource.ts`), so
    // `partial: null` and no key at all must both render clean. Absence is deliberately treated the
    // same: only the bitcoin-family walker stamps the key, and treating absence as a caveat would
    // put one on every EMBER block on both live estates, permanently, for nothing.
    for (const detail of [{ [PARTIAL_DETAIL_KEY]: null }, {}]) {
      await app(
        `/blocks/${SCOPE}/900`,
        { [`GET /v1/blocks/${SCOPE}/900`]: { body: block(detail) } },
        async (s) => {
          await s.settle(30)
          assert.doesNotMatch(
            s.text(),
            /Not everything about this block was written down here/i,
            `a complete block was given a caveat (detail: ${JSON.stringify(detail)})`,
          )
        },
      )
    }
  })
})
