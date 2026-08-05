/**
 * THE DEFAULT NETWORK DIFFERS BETWEEN THE TWO HOSTNAMES.
 *
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 * THE ASSERTION THAT MATTERS IS AN INEQUALITY, AND THAT IS THE WHOLE DESIGN OF THIS FILE.
 *
 * The defect it exists for was `useState<Network>('testnet')` in `src/pages/search.tsx`: one
 * literal, both deployments, so the MAINNET explorer looked every paste up on testnet. A test
 * asserting "a network is selected" passes in the broken world and the fixed one alike. So does
 * one asserting "the default is testnet" — that was true, and it was the bug. Sixteen issues in
 * this estate's tracker share that shape.
 *
 * What cannot pass in the broken world is: mount the same bundle on the two REAL hostnames, and
 * require the answers to DIFFER — then require each to be the specific right one. Both halves.
 * The inequality alone would accept mainnet and testnet swapped, which is the same defect wearing
 * the other hat.
 *
 * ── The hostnames are the real ones and are written out whole ─────────────────────────────────
 *
 * `contracts` `4283686` is the reason. The repair for #136 first named
 * `explorer.testnet.cloudsforge.online` — testnet as an apex PREFIX, two labels deep — which
 * Cloudflare Universal SSL's single-label wildcard does not cover, so the host resolved to
 * nothing. The test guarding it matched `/testnet/` and passed on the dead host and the live one
 * alike. This file therefore matches no patterns: it writes both hostnames out in full, and
 * `test/hosts.test.ts` already pins the registry that composes them.
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, it } from 'node:test'
import { createElement as h } from 'react'

import { withScreen, type Routes } from './dom.ts'
import * as fx from './fixtures.ts'
import { App } from '../src/app.tsx'
import { CHAIN_IDS } from '../src/lib/indexer.ts'
import { networkForHost, siblingExplorerOrigin } from '../src/lib/network.ts'

const at = (p: string) => fileURLToPath(new URL(`../${p}`, import.meta.url))

/** The two addresses this bundle is really served from. Written out, never matched. */
const MAINNET_HOST = 'explorer.cloudsforge.online'
const TESTNET_HOST = 'explorer-testnet.cloudsforge.online'

/**
 * One status per chain, with only `ember` served on whichever network was asked for.
 *
 * The scope comes off the request path rather than out of a constant, so a page that asked about
 * the wrong network gets an answer describing the network it asked about — and the assertion below
 * is then about what the page SENT, which is doc 22 §3.1's second permitted subject. A stub that
 * answered `ember/mainnet` no matter what was asked would make a wrong request indistinguishable
 * from a right one.
 */
const statusRoutes: Routes = {
  'GET /v1/chains/': (wire) => {
    const [, , , chain = '', network = ''] = wire.path.split('/')
    return {
      body: fx.chainStatus({
        chain,
        network,
        ...(chain === 'ember'
          ? { indexedHeight: 912, tipHeight: 915, providers: [] }
          : { indexedHeight: null, tipHeight: null, lagBlocks: null, providers: [] }),
      }),
    }
  },
}

describe('the network is derived from the hostname', () => {
  it('THE TWO HOSTNAMES DISAGREE, and each is the right one', () => {
    const mainnet = networkForHost(MAINNET_HOST)
    const testnet = networkForHost(TESTNET_HOST)
    assert.notEqual(
      mainnet,
      testnet,
      'both hostnames resolved to the same network: the deployment cannot tell itself apart',
    )
    assert.equal(mainnet, 'mainnet', `${MAINNET_HOST} must serve mainnet`)
    assert.equal(testnet, 'testnet', `${TESTNET_HOST} must serve testnet`)
  })

  it('the older two-label form still resolves, and a dead lookalike does not become mainnet', () => {
    // `explorer.testnet.cloudsforge.online` is the host `4283686` had to delete: Universal SSL
    // covers one label, so it answers nothing. It must not be READ as mainnet if anybody ever
    // lands on it, because that is the direction where a testnet reader is shown real money.
    assert.equal(networkForHost('explorer.testnet.cloudsforge.online'), 'testnet')
  })

  it('a surface merely NAMED with testnet in it is not the testnet environment', () => {
    // The substring check this rejects. `splitEnvLabel` requires the head to be a known registry
    // subdomain, so an apex this estate does not own cannot claim to be an environment of it.
    assert.equal(networkForHost('testnet-marketing.example.com'), 'mainnet')
    assert.equal(networkForHost('mytestnetsite.com'), 'mainnet')
  })

  it('development is testnet, because testnet is the only scope a local stack indexes', () => {
    // `indexer/.env.example:39` is `INDEXER_CHAINS=ember:testnet` and `DEEP_LINK_PATH` is
    // `/blocks/ember/testnet/1`. Defaulting a developer to mainnet puts a dead scope on the
    // front page of every `pnpm dev`.
    for (const host of ['localhost', '127.0.0.1', 'macbook.local', '']) {
      assert.equal(networkForHost(host), 'testnet', `${host || '(empty)'} is a development address`)
    }
  })

  it('the sibling explorer is composed the one way the estate serves, or not at all', () => {
    assert.equal(siblingExplorerOrigin(MAINNET_HOST, 'testnet'), `https://${TESTNET_HOST}`)
    assert.equal(siblingExplorerOrigin(TESTNET_HOST, 'mainnet'), `https://${MAINNET_HOST}`)
    // Null rather than an invented hostname. An offered address a reader trusts and which resolves
    // to nothing is worse than no address: that is exactly what `explorer.testnet.…` was.
    assert.equal(siblingExplorerOrigin('localhost', 'mainnet'), null)
    assert.equal(siblingExplorerOrigin('preview-deploy.example.com', 'mainnet'), null)
  })

  it('NOTHING IS PERSISTED, so a selection cannot follow a reader across environments', () => {
    // A stored preference overriding the host is how somebody visits testnet, picks a chain, opens
    // the mainnet explorer later and is quietly shown the testnet one. The cheapest defence is
    // having nowhere to store it, and this asserts there is nowhere.
    // Comments stripped first, by the same helper `test/render.test.ts` uses: the module's own
    // header explains why it stores nothing, and a scan of the raw text would match the
    // explanation and fail a correct file.
    const source = readFileSync(at('src/lib/network.ts'), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '')
    for (const store of ['localStorage', 'sessionStorage', 'cookie', 'indexedDB']) {
      assert.doesNotMatch(
        source,
        new RegExp(`\\b${store}\\b`),
        `src/lib/network.ts reads ${store}; the network must come from the hostname alone`,
      )
    }
  })
})

describe('the same bundle, mounted on both real hostnames', () => {
  /** What the front page asked the chain index about, as scopes. */
  const scopesAsked = (paths: readonly string[]): string[] =>
    paths
      .map((p) => p.split('/'))
      .filter((seg) => seg[2] === 'chains')
      .map((seg) => `${seg[3]}/${seg[4]}`)

  it('THE FRONT PAGE LOOKS UP A DIFFERENT NETWORK ON EACH, and says which', async () => {
    const seen: Record<string, { text: string; scopes: string[] }> = {}

    for (const host of [MAINNET_HOST, TESTNET_HOST]) {
      await withScreen(h(App), { url: `https://${host}/`, routes: statusRoutes }, async (s) => {
        await s.settle(20)
        seen[host] = {
          text: s.text(),
          scopes: scopesAsked(s.api.wire.map((w) => w.path)),
        }
        s.clean(host)
      })
    }

    const main = seen[MAINNET_HOST]
    const test = seen[TESTNET_HOST]
    assert.ok(main && test, 'one of the two hostnames rendered nothing')

    // 1. What went over the wire differs, and each is right. Six chains on ONE network, never on
    //    the other — the mainnet explorer must not ask about testnet at all.
    assert.notDeepEqual(main.scopes, test.scopes, 'both hostnames queried the same scopes')
    assert.deepEqual(
      [...new Set(main.scopes.map((s) => s.split('/')[1]))],
      ['mainnet'],
      `${MAINNET_HOST} queried a network that is not mainnet: ${main.scopes.join(' ')}`,
    )
    assert.deepEqual(
      [...new Set(test.scopes.map((s) => s.split('/')[1]))],
      ['testnet'],
      `${TESTNET_HOST} queried a network that is not testnet: ${test.scopes.join(' ')}`,
    )
    assert.equal(new Set(main.scopes).size, CHAIN_IDS.length, 'not every chain was asked about')

    // 2. And the reader can SEE it. The right default fixes the common case; the visible label is
    //    what fixes the confused one, and a page can have the first without the second.
    assert.match(main.text, /Network mainnet/, 'the mainnet explorer does not say it is mainnet')
    assert.match(test.text, /Network testnet/, 'the testnet explorer does not say it is testnet')
  })

  it('a cross-network address is named as one BEFORE the page below denies it exists', async () => {
    // #136 from the receiving side: a link built by the old, network-blind builder lands a testnet
    // hash on the mainnet explorer, whose index has never walked that scope. The page renders a
    // truthful "not found", which reads as "my money is gone".
    await withScreen(
      h(App),
      {
        url: `https://${MAINNET_HOST}/tx/ember/testnet/${fx.HASH}`,
        routes: {
          [`GET /v1/transactions/ember/testnet/${fx.HASH}/confirmations`]: {
            status: 404,
            body: fx.error('transaction_not_found', 'no such transaction'),
          },
          [`GET /v1/transactions/ember/testnet/${fx.HASH}`]: {
            status: 404,
            body: fx.error('transaction_not_found', 'no such transaction'),
          },
        },
      },
      async (s) => {
        await s.settle(20)
        const alert = s.allByRole('alert').map((el) => s.textOf(el)).join(' ')
        assert.match(alert, /names the testnet network/, 'nothing warned about the wrong network')
        assert.match(alert, /serves mainnet/)
        const link = s.byRole('link', 'Open it on the testnet explorer')
        assert.equal(
          link.getAttribute('href'),
          `https://${TESTNET_HOST}/tx/ember/testnet/${fx.HASH}`,
          'the escape hatch does not point at the deployment that can answer',
        )
        // Document order: the warning has to precede the denial, or it is an explanation of a
        // conclusion the reader has already drawn. The denial is the transaction page's own
        // `transaction_not_found` screen (`src/pages/transaction.tsx:315-322`).
        assert.match(s.text(), /has never seen that transaction/, 'the denial did not render')
        s.before(
          /names the testnet network/,
          /has never seen that transaction/,
          'the warning must come first',
        )
      },
    )
  })

  it('the mainnet explorer never renders a testnet row on its own chains page', async () => {
    // `ember:testnet` on the MAINNET indexer answers with 87 blocks, tipHeight 0 and halted:true —
    // leftovers in the same database from when that estate was pointed at testnet. Measured
    // against the live service. A page that rendered it showed a plausible scope whose numbers
    // mean nothing.
    await withScreen(
      h(App),
      { url: `https://${MAINNET_HOST}/chains`, routes: statusRoutes },
      async (s) => {
        await s.settle(20)
        const asked = scopesAsked(s.api.wire.map((w) => w.path))
        assert.ok(asked.length > 0, 'the chains page asked nothing')
        for (const scope of asked) {
          assert.doesNotMatch(scope, /testnet/, `the mainnet chains page asked about ${scope}`)
        }
        assert.doesNotMatch(
          s.text(),
          /ember\/testnet/,
          'the mainnet chains page rendered a testnet scope',
        )
        s.clean('chains on mainnet')
      },
    )
  })
})
