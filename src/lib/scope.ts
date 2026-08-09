/**
 * The `(chain, network)` pair, read out of a URL and refused when it is not one.
 *
 * `micro-indexer` answers **404 `unknown_chain`** or **404 `unknown_network`** for a scope it does
 * not run, not a 400, and it explains why (`indexer/src/server.ts`): the path names a
 * resource that does not exist, and a caller asking for `/chains/bnb/mainnet/status` "has not made
 * a malformed request, it has asked for a chain this estate does not run".
 *
 * This module makes the same judgement in the browser, one round trip earlier, so a mistyped chain
 * renders a page that names the real ones rather than a generic failure. It is NOT a second copy of
 * any decision the service makes about the ANSWER — the request is always sent when the scope is
 * valid, and the service is always the one that answers.
 *
 * **The quoted example is `bnb` and used to be `doge`.** micro-contracts `c0e7c77` added Dogecoin
 * to the union and the indexer moved its own example on the same grounds (`indexer/src/server.ts`):
 * a slug that is in the union but has no provider is not an unknown chain, it is a known one
 * nothing follows, and this module must go on letting it through so the service can say so. A chain
 * refused here is refused before any request is made, which is exactly why the list it is refused
 * against has to be the service's own — see `CHAIN_IDS` in `src/lib/indexer.ts`, and the drift test
 * that keeps it there.
 *
 * The service lower-cases both segments before validating (`indexer/src/server.ts`), so
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

/** `ember:testnet` — the spelling `indexer/src/chains.ts` uses for a scope in one string. */
export function scopeLabel(scope: Scope): string {
  return `${scope.chain}:${scope.network}`
}
