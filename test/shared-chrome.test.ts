/**
 * THE SHARED CHROME RENDERS HERE, AND ITS HOOKS ACTUALLY RUN.
 *
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 * WHY A TEST WHOSE SUBJECT IS ANOTHER REPOSITORY'S COMPONENT
 *
 * It is not asserting what `@cloudsforge/ui` draws — micro-ui owns that. It is asserting a fact
 * about THIS repository's test process: that `@cloudsforge/ui` and this app end up sharing ONE
 * React. They do not by default. `link:../ui/packages/ui` symlinks the design system's working
 * tree, that tree has its own `react` (a devDependency it genuinely needs to test itself), and
 * Node resolves a bare specifier from the importing file's REALPATH — so the design system's
 * components reach the second copy, share no dispatcher with ours, and the first hook they call
 * throws `Cannot read properties of null (reading 'useState')`.
 *
 * `--import @cloudsforge/ui/test-loader` in the `test` script is what collapses the two. This file
 * is what notices when it stops. Delete the flag and these tests are the first to go red.
 *
 * Publishing `dist` did NOT make that unnecessary, though eight repositories predicted it would:
 * `dist/index.js` has the same realpath as `ui/packages/ui/src/index.tsx`, so it finds the same
 * second copy. What
 * publishing `dist` did fix was the OTHER workaround — the classic JSX transform, and the
 * `globalThis.React` that used to sit in `test/dom.ts`.
 *
 * ── Why it clicks rather than only mounting ───────────────────────────────────────────────────
 *
 * A mount that does not throw is weak evidence: `CloudsForgeLogo` renders perfectly well with two
 * Reacts in the process, because it calls no hook — that was measured. The dropdowns are the ones
 * that break, so each is OPENED, which requires `useState` to hold a value across a re-render and
 * `useId` to have produced the id `aria-controls` names. A second dispatcher cannot fake that.
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  AccountMenu,
  CloudsForgeBar,
  HUB_MINE_PATH,
  NOT_PAID_CLAUSE,
  ProductSwitcher,
} from '@cloudsforge/ui'
import { createElement as h } from 'react'
import { App } from '../src/app.tsx'
import { PRODUCT, hosts } from '../src/lib/hosts.ts'
import * as fx from './fixtures.ts'
import { withScreen, type Routes, type Screen } from './dom.ts'

/**
 * `allowEmpty` because the subject is a strip of chrome, not a page: the bar's own text is well
 * under the 40 characters `assertMounted` requires of a mounted app. Every test below then asserts
 * on named elements instead, which is a stricter check than the length heuristic it waives.
 */
const CHROME = { allowEmpty: true } as const

/** The dropdown triggers, which is how they are found without hard-coding this surface's label. */
const triggers = (s: Screen): Element[] => [...s.document.querySelectorAll('[aria-haspopup="menu"]')]

test('the company bar renders, signed out', async () => {
  await withScreen(h(CloudsForgeBar, { current: PRODUCT, account: { signedIn: false } }), CHROME, async (s) => {
    assert.ok(s.document.querySelector('[role="banner"]'), 'CloudsForgeBar rendered no banner')
    s.byRole('link', 'CloudsForge home')
    s.byRole('button', 'Sign in')
    assert.equal(triggers(s).length, 1, 'signed out, the switcher is the only dropdown')
    s.clean('the bar, signed out')
  })
})

test('the product switcher opens, which means its useState held', async () => {
  await withScreen(h(CloudsForgeBar, { current: PRODUCT, account: { signedIn: false } }), CHROME, async (s) => {
    const trigger = triggers(s)[0] as Element
    assert.equal(trigger.getAttribute('aria-expanded'), 'false')
    assert.equal(s.document.querySelector('[role="menu"]'), null, 'the menu is closed to begin with')

    await s.click(trigger)

    assert.equal(trigger.getAttribute('aria-expanded'), 'true', 'the click did not reach state')
    const menu = s.document.querySelector('[role="menu"][aria-label="CloudsForge products"]')
    assert.ok(menu, 'the switcher opened no menu')
    assert.ok(
      menu.querySelectorAll('[role="menuitem"]').length > 1,
      'an open switcher with fewer than two products is not a switcher',
    )
    // `aria-controls` names the menu by an id from `useId`, which is the other hook in play.
    assert.equal(menu.getAttribute('id'), trigger.getAttribute('aria-controls'))
    s.clean('opening the product switcher')
  })
})

test('the account menu opens for a signed-in viewer, and offers sign out', async () => {
  const account = { signedIn: true, handle: 'ada' }
  await withScreen(h(CloudsForgeBar, { current: PRODUCT, account }), CHROME, async (s) => {
    const trigger = triggers(s)[1] as Element
    assert.match(s.textOf(trigger), /ada/, 'the second dropdown is not the account menu')

    await s.click(trigger)

    const menu = s.document.querySelector('[role="menu"][aria-label="Account"]')
    assert.ok(menu, 'the account menu opened nothing')
    assert.match(s.textOf(menu), /Sign out/)
    s.clean('opening the account menu')
  })
})

test('ProductSwitcher and AccountMenu also render standing alone', async () => {
  // Named directly, not only through the bar: these are the two components measured to throw
  // without deduplication, and a test that reached them only via a parent would stop covering
  // them the day the bar stopped composing them.
  await withScreen(h(ProductSwitcher, { current: PRODUCT }), CHROME, async (s) => {
    assert.equal(triggers(s).length, 1)
    s.clean('ProductSwitcher alone')
  })
  await withScreen(h(AccountMenu, { account: { signedIn: false } }), CHROME, async (s) => {
    s.byRole('button', 'Sign in')
    s.clean('AccountMenu alone')
  })
})

/* ══════════════════════════════════════════════════════════════════════════════════════════════
   BROWSER MINING, FROM THE BAR

   The owner's report was that starting a browser miner is "hidden deep in mining page, it should be
   easily found near the account on all pages". It lives in the shared chrome now, so it is on every
   address this deployment serves, and this file is where that is asserted because this file is
   where the shared chrome's presence in a real document already is.

   ── Why this one MOUNTS THE APP when the four above mount the bar ─────────────────────────────

   The four above are about a component reaching one React; their subject is `@cloudsforge/ui`, so
   naming it directly is the point. This one's subject is `src/components/shell.tsx` — whether THIS
   repository hands the bar the prop — and a bar constructed here would answer that question by
   assuming it. A shell that passes `mining` and a shell that dropped it render the same bar in
   isolation.

   What this surface renders is the `elsewhere` state, which is a LINK. The miner is a WebSocket and
   two Web Workers on `hub.<apex>`, a different origin, so nothing in this bundle can start, observe
   or stop a session; pressing the session itself is micro-hub-web's to assert.
   ══════════════════════════════════════════════════════════════════════════════════════════════ */

/**
 * A registered address, and the TESTNET one.
 *
 * `hosts()` derives every estate URL from the hostname the bundle was served from, so the origin is
 * an input to the assertion below rather than scenery: served from a name the registry does not
 * know, the shell raises its unregistered notice and `hosts().hub` resolves one level too deep.
 * `test/journeys.test.ts` runs on the same hostname and gives the longer reason.
 */
const ORIGIN = 'https://explorer-testnet.cloudsforge.online'

/** The index asks which chains this deployment serves before it offers any; nothing else. */
const chainOffers: Routes = {
  'GET /v1/chains/': (wire) => {
    const [, , , chain = '', network = ''] = wire.path.split('/')
    return { body: fx.chainStatus({ chain, network }) }
  },
}

test('the bar offers browser mining, beside the account, on an ordinary address', async () => {
  await withScreen(h(App), { url: `${ORIGIN}/`, routes: chainOffers }, async (s) => {
    await s.settle(20)

    const bar = s.document.querySelector('.cf-bar')
    assert.ok(bar, 'this surface no longer renders the company bar')
    const found = [...bar.querySelectorAll('.cf-mine')]
    assert.equal(found.length, 1, `expected one mining control in the bar, found ${found.length}`)
    const mine = found[0] as Element

    // An anchor, not an onClick — the same rule the cross-network notice in `src/components/
    // shell.tsx` follows. A destination the router cannot reach cannot be a handler: a handler
    // cannot be middle-clicked, copied out of a support ticket or crawled, and is invisible to
    // every check that reads links.
    assert.equal(mine.tagName, 'A', 'the mining control is not a link')
    // Composed by the registry, never written out. This bundle is served from two hostnames, one
    // per network, and from localhost; a literal would be right on one of them.
    assert.equal(
      mine.getAttribute('href'),
      `${hosts().hub}${HUB_MINE_PATH}`,
      'the mining control does not point at Forge Hub’s mining address',
    )

    // Beside the account, asserted as TAB ORDER rather than as a CSS neighbour: a stylesheet can
    // move a box, but only document order moves this, and document order is what a reader who
    // never touches a mouse actually has. Signed out, the account control is the Sign in button.
    const order = s.tabbables()
    const account = s.byRole('button', 'Sign in')
    assert.equal(
      order.indexOf(account) - order.indexOf(mine),
      1,
      'the mining control is no longer immediately before the account in the tab order',
    )

    // And it promises nothing the pool does not pay. `pool/src/payouts.ts` derives
    // `payoutsImplemented` and it is false today, so a figure here would be a claim about money on
    // a surface whose whole job is reporting what a chain actually recorded.
    const described = s.document.getElementById(mine.getAttribute('aria-describedby') ?? '')
    assert.ok(described, 'the mining control carries no description for a screen reader')
    assert.ok(
      (described.textContent ?? '').includes(NOT_PAID_CLAUSE),
      'the mining control does not carry the not-paid clause',
    )
    assert.doesNotMatch(
      `${mine.textContent ?? ''} ${described.textContent ?? ''}`,
      /[$€£]|\d/,
      'the mining control shows a figure, and nothing is paid',
    )

    s.clean('the bar’s mining control')
  })
})
