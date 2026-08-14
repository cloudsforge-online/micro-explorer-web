/**
 * The network the reader is VIEWING — in-app network context (micro-org#459 stage 3).
 *
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 * HOW THIS COEXISTS WITH `network.ts`, WHICH FORBIDS EXACTLY THE OBVIOUS IMPLEMENTATION
 *
 * `network.ts` carries this surface's scar tissue: a stored network default once made the MAINNET
 * explorer look up every pasted hash on a halted testnet scope and tell readers their real
 * transactions did not exist — found by the owner, using the product. Its rule, enforced by
 * `test/network.test.ts`, is that the network is derived from the hostname and NOTHING IS STORED.
 *
 * The owner has decided the product should switch networks in place, and reaffirmed it with the
 * concern on the table. This module is the reconciliation, and every line of its shape is one of
 * the invariant's reasons kept:
 *
 *   - **Nothing is persisted.** Module state, in memory, per tab. A reload, a new tab, a link
 *     followed from anywhere — all land on the hostname's own network, exactly as before, unless
 *     the link ITSELF says otherwise (see `fromLink()` below). The defect class the invariant
 *     closed was a WRONG DEFAULT SURVIVING; an in-memory choice made by a click on this page load
 *     cannot survive anything, and a choice spelled out in the address the reader followed is not
 *     a default at all.
 *   - **The default IS `deploymentNetwork()`.** Until the reader touches the switcher, this
 *     module is invisible and every answer is the hostname's.
 *   - **The viewed network is always on screen.** The bar's switcher shows the selection, and
 *     `TestnetBand` follows the VIEWED network — testnet data under a mainnet address bar wears
 *     the amber band, which is the honesty the address bar can no longer carry alone.
 *
 * ── THE CROSS-ESTATE READ IS ANONYMOUS, DELIBERATELY ──────────────────────────────────────────
 *
 * Viewing the other network fetches from the other estate's API, where this page's bearer means
 * nothing (separate identities until #459 stage 2) and would force a CORS preflight besides. So
 * `viewedApiOrigin()` callers drop the authorization header for cross-estate requests: the other
 * network is read as a stranger, which for a public explorer is every reader anyway.
 */

import { currentNetwork, networkFromQuery, networkOrigin } from '@cloudsforge/ui'
import { keepNetworkInTheAddressBar } from '@cloudsforge/ui/network-view'
import type { Network } from './indexer.ts'
import { deploymentNetwork } from './network.ts'

/**
 * The choice a link arrived carrying, read ONCE, at load.
 *
 *     "if you select testnet and switch product you are back to mainnet"
 *
 * Every surface is its own origin, so the module state below stops at the hostname and a link
 * from Forge Hub to a block on this explorer could not bring the reader's network with it. `?net=`
 * is the one channel that survives a cross-origin navigation without being storage — and it has to
 * survive the combined view's retirement redirect too, which it does: `explorer-testnet.<apex>`
 * 302s to `explorer.<apex>` preserving path and query.
 *
 * This does not weaken the invariant `network.ts` enforces, and the distinction is the whole
 * argument. What that invariant closed was a stored default OUTLIVING the reader's intent — a
 * scope chosen weeks ago silently deciding that a pasted mainnet hash does not exist. A parameter
 * in the address the reader just followed is the opposite: it is present, visible, scoped to this
 * one navigation, and written back nowhere. Navigate in-app and it is gone.
 *
 * Normalised through the same rule as `setViewedNetwork`: `?net=mainnet` on a mainnet page is
 * agreement, not an override, and recording it as one would send this surface's own reads out to
 * an absolute origin for no reason.
 *
 * Off-registry it answers null, and the check is `currentNetwork()` rather than
 * `deploymentNetwork()` deliberately. Localhost has no sibling estate — `NetworkSwitcher` hides
 * itself there, so no CLICK can produce an override — but a link can, and `deploymentNetwork()`
 * reads a development host as mainnet, so `?net=testnet` would have looked like a real choice and
 * pointed a dev bundle at the live testnet indexer.
 */
function fromLink(): Network | null {
  if (currentNetwork() === null) return null
  const asked = networkFromQuery()
  if (asked === null) return null
  return asked === deploymentNetwork() ? null : asked
}

let viewed: Network | null = fromLink()

/**
 * The address bar says what the reader is viewing, and keeps saying it.
 *
 *     "if we have testnet selected and we refresh the page it goes to mainnet"
 *
 * It did, and precisely because of the property the header above defends: the choice was module
 * memory, and a reload discards module memory. `keepNetworkInTheAddressBar` writes `?net=` in
 * place on every change — see it for why a reload reproducing what is on screen is the opposite of
 * the stored default `network.ts` exists to forbid, not a softening of it. Nothing is stored: no
 * `localStorage`, no cookie, no preference. A pasted hash on a fresh mainnet address is still
 * looked up on mainnet, which is the whole of that scar.
 */
const syncAddressBar = keepNetworkInTheAddressBar(() => viewed)
syncAddressBar()

/** The network the reader is viewing: their in-tab choice, or the hostname's network. */
export function viewedNetwork(): Network {
  return viewed ?? deploymentNetwork()
}

/** Record the reader's choice. Choosing the hostname's own network clears the override. */
export function setViewedNetwork(network: Network): void {
  viewed = network === deploymentNetwork() ? null : network
  syncAddressBar()
}

/**
 * The API origin for the viewed network: '' for the deployment's own (requests stay relative —
 * the contract `resolveApiBase` keeps), the sibling estate's origin otherwise.
 */
export function viewedApiOrigin(): string {
  if (viewed === null) return ''
  return networkOrigin(viewed === 'testnet' ? 'testnet' : 'mainnet')
}
