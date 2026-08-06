/**
 * A CHAIN THE BACKEND CANNOT SERVE IS NEVER OFFERED BY THE UI.
 *
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 * "THE CHAIN LIST RENDERS" IS THE TEST THAT WAS ALREADY PASSING.
 *
 * The defect the owner found by using the product: the explorer offered five chains and exactly
 * one worked. Every other one rendered "Not walked by this deployment" — after the reader had
 * picked it, typed a hash and pressed the button. The chain list rendered throughout. It rendered
 * correctly. A test asserting it rendered would have been green on every day this was broken, and
 * that pattern is behind sixteen issues in this estate's tracker.
 *
 * So what is asserted here is a RELATION between two things observed in the same run: what
 * `/status` said this deployment serves, and what the UI put in front of the reader. The stub
 * decides which chains are served, and the UI's offer must equal it — not be a superset of it, and
 * not be a fixed list. Change the stub and the expectation moves with it; hard-code a chain list
 * in the bundle and this goes red no matter which list it is.
 *
 * ── Where the seam really is ──────────────────────────────────────────────────────────────────
 *
 * This tier stubs the indexer, so it proves the bundle obeys what the index tells it, not that the
 * index tells the truth. The tier that intercepts nothing is `beacon`'s browser journey against
 * the live estate; this one is what makes a regression here cheap to catch before it gets there.
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { createElement as h } from 'react'

import { withScreen, type Routes } from './dom.ts'
import * as fx from './fixtures.ts'
import { App } from '../src/app.tsx'
import { CHAIN_IDS, isServed, type ChainId } from '../src/lib/indexer.ts'

const HOST = 'https://explorer.cloudsforge.online'

/**
 * `/status` answering for every chain, with `served` the ones this pretend deployment indexes.
 *
 * The unserved shape is the real one, read off the live service today:
 * `{"chain":"btc","network":"mainnet",…,"tipHeight":null,"indexedHeight":null,"providers":[]}` —
 * a **200**, not a 404, because the scope is real and this replica has simply never walked it
 * (`indexer/src/reads.ts`). A stub that answered 404 would be testing a branch the service
 * does not take.
 */
const routesFor = (served: readonly ChainId[]): Routes => ({
  'GET /v1/chains/': (wire) => {
    const [, , , chain = '', network = ''] = wire.path.split('/')
    const on = served.includes(chain as ChainId)
    return {
      body: fx.chainStatus({
        chain,
        network,
        ...(on
          ? { indexedHeight: 912, tipHeight: 915, lagBlocks: 3, providers: [] }
          : { indexedHeight: null, tipHeight: null, lagBlocks: null, providers: [] }),
      }),
    }
  },
})

/** The chain ids the search form's selector actually offers. */
const offered = (doc: Document): string[] =>
  [...doc.querySelectorAll('select option')].map((o) => (o.textContent ?? '').trim())

describe('isServed separates a configured chain from an offered one', () => {
  it('a scope with no height and no provider is not served', () => {
    assert.equal(
      isServed(fx.chainStatus({ indexedHeight: null, tipHeight: null, providers: [] })),
      false,
    )
  })

  it('a configured chain that has not got a block yet IS served', () => {
    // The half `indexedHeight` alone would get wrong: a scope named in INDEXER_CHAINS whose node
    // is still starting is a real, supported chain, and hiding it would be the honest fix
    // over-applied.
    assert.equal(
      isServed(
        fx.chainStatus({
          indexedHeight: null,
          providers: [
            {
              provider: 'hearth-seed',
              host: 'host.docker.internal',
              state: 'healthy',
              consecutiveFailures: 0,
              totalRequests: 1,
              totalFailures: 0,
              latencyMs: 3,
              lastOkAt: null,
              lastFailureAt: null,
              lastError: null,
              rateLimitedUntil: null,
            },
          ],
        }),
      ),
      true,
    )
  })
})

describe('the UI offers exactly what the index says it serves', () => {
  it('ONE served chain: the selector offers one, and names the rest as unsupported', async () => {
    // This is the live shape. Both estates run a single scope — `INDEXER_CHAINS=ember:mainnet` and
    // `ember:testnet` — read off the running containers.
    await withScreen(h(App), { url: `${HOST}/`, routes: routesFor(['ember']) }, async (s) => {
      await s.settle(20)

      assert.deepEqual(offered(s.document), ['ember'], 'the selector offered a chain that is not indexed')

      // Not offered, but not hidden either: the reader is told which chains this deployment cannot
      // answer about, once, plainly. Silence would leave them wondering where Bitcoin went.
      const text = s.text()
      for (const chain of CHAIN_IDS.filter((c) => c !== 'ember')) {
        assert.match(text, new RegExp(`\\b${chain}\\b`), `${chain} is not accounted for anywhere`)
      }
      assert.match(text, /not supported here/i)
      s.clean('one served chain')
    })
  })

  it('THE OFFER MOVES WITH THE INDEX: two served chains, two offered', async () => {
    // The assertion that a hard-coded list cannot satisfy. Nothing in the bundle knows `btc` is
    // indexed here — the service said so in this run, and the UI has to have read it.
    await withScreen(h(App), { url: `${HOST}/`, routes: routesFor(['ember', 'btc']) }, async (s) => {
      await s.settle(20)
      assert.deepEqual(offered(s.document).sort(), ['btc', 'ember'])
      s.clean('two served chains')
    })
  })

  it('NO served chain: nothing is offered and nothing is searchable', async () => {
    await withScreen(h(App), { url: `${HOST}/`, routes: routesFor([]) }, async (s) => {
      await s.settle(20)
      const box = s.allByRole('textbox')[0]
      assert.ok(box, 'the search box vanished')
      await s.type(box, '1234')
      const button = s.byRole('button', 'Look it up')
      assert.ok(
        button.hasAttribute('disabled'),
        'a lookup was offered on a deployment that indexes nothing',
      )
      assert.match(s.text(), /not indexing any chain/i)
      s.clean('no served chain')
    })
  })

  it('the chains page separates what is indexed from what is not supported', async () => {
    await withScreen(h(App), { url: `${HOST}/chains`, routes: routesFor(['ember']) }, async (s) => {
      await s.settle(20)
      s.before(/Indexed here/, /Not supported by this deployment/, 'what works comes first')
      // The tension the owner has to be able to see: custody hands out deposit addresses for
      // chains this explorer cannot display, so a user can deposit an asset and then fail to find
      // it here. Absence of a page must not read as absence of funds.
      assert.match(s.text(), /deposit/i, 'nothing tells a depositor why their chain is missing')
      s.clean('chains page')
    })
  })

  it('a scope the service failed to answer is neither served nor unsupported', async () => {
    // Three outcomes, three sentences. Reporting an outage as a policy is how a temporary failure
    // becomes a permanent-sounding claim.
    await withScreen(
      h(App),
      {
        url: `${HOST}/chains`,
        routes: {
          'GET /v1/chains/': (wire) => {
            const chain = wire.path.split('/')[3] ?? ''
            if (chain === 'btc') return { status: 503, body: fx.error('unavailable', 'no') }
            return {
              body: fx.chainStatus({
                chain,
                network: 'mainnet',
                ...(chain === 'ember'
                  ? {}
                  : { indexedHeight: null, tipHeight: null, lagBlocks: null, providers: [] }),
              }),
            }
          },
        },
      },
      async (s) => {
        await s.settle(20)
        assert.match(s.text(), /Could not be read/)
        assert.match(s.text(), /not a statement about those chains/)
        s.clean('one scope failed', /503/)
      },
    )
  })
})
