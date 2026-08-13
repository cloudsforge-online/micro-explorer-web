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
 *     followed from anywhere — all land on the hostname's own network, exactly as before. The
 *     defect class the invariant closed was a WRONG DEFAULT SURVIVING; an in-memory choice made
 *     by a click on this page load cannot survive anything.
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

import { networkOrigin } from '@cloudsforge/ui'
import type { Network } from './indexer.ts'
import { deploymentNetwork } from './network.ts'

let viewed: Network | null = null

/** The network the reader is viewing: their in-tab choice, or the hostname's network. */
export function viewedNetwork(): Network {
  return viewed ?? deploymentNetwork()
}

/** Record the reader's choice. Choosing the hostname's own network clears the override. */
export function setViewedNetwork(network: Network): void {
  viewed = network === deploymentNetwork() ? null : network
}

/**
 * The API origin for the viewed network: '' for the deployment's own (requests stay relative —
 * the contract `resolveApiBase` keeps), the sibling estate's origin otherwise.
 */
export function viewedApiOrigin(): string {
  if (viewed === null) return ''
  return networkOrigin(viewed === 'testnet' ? 'testnet' : 'mainnet')
}
