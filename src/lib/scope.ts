/**
 * The `(chain, network)` pair, read out of a URL and refused when it is not one.
 *
 * `micro-indexer` answers **404 `unknown_chain`** or **404 `unknown_network`** for a scope it does
 * not run, not a 400, and it explains why (`indexer/src/server.ts:580-586`): the path names a
 * resource that does not exist, and a caller asking for `/chains/doge/mainnet/status` "has not made
 * a malformed request, it has asked for a chain this estate does not run".
 *
 * This module makes the same judgement in the browser, one round trip earlier, so a mistyped chain
 * renders a page that names the five real ones rather than a refusal panel that talks about
 * authority. It is NOT a second copy of an authorisation decision — the request is always sent when
 * the scope is valid, and the service is always the one that answers.
 *
 * The service lower-cases both segments before validating (`indexer/src/server.ts:578-579`), so
 * `/chains/EMBER/Testnet/status` is a real address there; this does the same, so a link somebody
 * typed in capitals resolves here too.
 */
import { isChainId, isNetwork, type Scope } from './indexer.ts'

export function parseScope(chain: string | undefined, network: string | undefined): Scope | null {
  const c = (chain ?? '').toLowerCase()
  const n = (network ?? '').toLowerCase()
  if (!isChainId(c) || !isNetwork(n)) return null
  return { chain: c, network: n }
}

/** `ember:testnet` — the spelling `indexer/src/chains.ts:117-119` uses for a scope in one string. */
export function scopeLabel(scope: Scope): string {
  return `${scope.chain}:${scope.network}`
}
