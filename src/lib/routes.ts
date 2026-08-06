/**
 * The route table, as data, in one place.
 *
 * Three files describe this app's addresses and all three have to agree:
 *
 *   1. `src/lib/routes.ts` — this file, from which the sub-navigation is derived,
 *   2. `src/app.tsx`       — which component renders at each path,
 *   3. `nginx.conf`        — which addresses are served the app shell at all.
 *
 * The third is the one that bites, and it bites late. nginx enumerates the real routes and 404s
 * everything else ON PURPOSE, so that a wrong address answers 404 rather than 200 — an app that
 * answers 200 for every address serves its "page not found" screen as a success, which crawlers
 * index and monitors call healthy, and a deploy that drops a route looks exactly like a deploy
 * that did not.
 *
 * That matters more here than on most surfaces. A block explorer's addresses are the things people
 * paste into chat, cite in a support ticket and link from a receipt. `/tx/ember/testnet/<hash>`
 * answering 200 with an empty page for a typo'd hash would make a mistyped link indistinguishable
 * from a real one.
 *
 * The price of that honesty is this list, in triplicate, so `test/routes.test.ts` reads
 * `nginx.conf` and `app.tsx` and fails the build when either has drifted. "Remember to update
 * nginx.conf" is not a mechanism; a test is.
 *
 * This module deliberately imports nothing — not React, not the router — so the test that reads it
 * does not have to boot a browser to find out what the routes are.
 */

export interface AppRoute {
  /** The top-level path segment, without a leading slash. `''` is the index route. */
  readonly path: string
  /** The sub-navigation label, or null for a route that is reachable but not offered. */
  readonly label: string | null
  /** True when the route owns everything beneath it (`/blocks/ember/testnet/1`). */
  readonly wildcard: boolean
  /**
   * True when the route renders without a session.
   *
   * **Every route on this surface is public, and every one of them works that way.** The seven
   * `micro-indexer` reads behind these pages are anonymous — `authoriseRead` returns `null` for a
   * caller with no token and lets the handler run (`indexer/src/server.ts`) — and this
   * bundle attaches no bearer to any of them.
   *
   * This column read differently until recently, and the history is worth one sentence: every read
   * used to require `indexer:read` or an admin, so a route could be public and still show nothing.
   * Gating them would have been a lie twice over. It would be a worse one now, because the pages
   * answer: a gate would make a browser prove who it is before showing facts anyone can read off a
   * public chain. There is no `ProtectedRoute` in this repository, and `test/routes.test.ts`
   * asserts its absence so that adding one is a decision somebody has to argue for.
   */
  readonly public: boolean
}

export const ROUTES: readonly AppRoute[] = [
  // The index is a search box and nothing else, and it makes NO API call — not because a call
  // would be refused, but because there is no question to ask until somebody types one. Sorting a
  // paste into a height, a hash or an address is work this bundle can do on its own.
  { path: '', label: 'Search', wildcard: false, public: true },
  // `/chains` is the ten scopes as links (five chains from `indexer/src/chains.ts`, two
  // networks from the same file), and `/chains/:chain/:network` is the status page for one of them.
  { path: 'chains', label: 'Chains', wildcard: true, public: true },
  // The four record pages. Each needs an identifier to mean anything, so each is reachable and
  // deliberately NOT offered in the navigation — `label: null`. Offering `/blocks` with no height
  // would be a navigation entry that always lands on a 404.
  { path: 'blocks', label: null, wildcard: true, public: true },
  { path: 'tx', label: null, wildcard: true, public: true },
  { path: 'address', label: null, wildcard: true, public: true },
  { path: 'tokens', label: null, wildcard: true, public: true },
]

/** What the sub-navigation renders, with the leading slash a `NavLink` wants. */
export const NAV: ReadonlyArray<{ to: string; label: string }> = ROUTES.filter(
  (route): route is AppRoute & { label: string } => route.label !== null,
).map((route) => ({ to: `/${route.path}`, label: route.label }))

/** Every path nginx has to serve the shell for, excluding the index. */
export const NON_INDEX_PATHS: readonly string[] = ROUTES.filter((r) => r.path !== '').map(
  (r) => r.path,
)

/**
 * A route this app owns, deep enough to prove the SPA fallback works.
 *
 * Passed to CI as the deep-link probe. It must be a REAL address — a probe against a path the app
 * does not own proves only that the 404 page renders, which is the opposite of what the check is
 * for. A block page is the right choice: it is the deepest shape this app serves, four segments,
 * and `ember`/`testnet` is the scope the local compose stack actually runs.
 */
export const DEEP_LINK_PATH = '/blocks/ember/testnet/1'

/* ══════════════════════════════ building the addresses ══════════════════════════════ */

/**
 * The app's own URLs, built in one place.
 *
 * Every segment is encoded, and the scope is always written out as two segments. That is the same
 * discipline `src/lib/indexer.ts` applies to the API paths and for the same reason recorded in
 * `market/src/indexerclient.test.ts`: a helper that stands for `chain/network` hides a
 * segment, and a path one segment short of the route it means can silently match a different one.
 */
export const linkTo = {
  chain: (chain: string, network: string): string =>
    `/chains/${encodeURIComponent(chain)}/${encodeURIComponent(network)}`,
  block: (chain: string, network: string, height: number | string): string =>
    `/blocks/${encodeURIComponent(chain)}/${encodeURIComponent(network)}/${encodeURIComponent(String(height))}`,
  transaction: (chain: string, network: string, hash: string): string =>
    `/tx/${encodeURIComponent(chain)}/${encodeURIComponent(network)}/${encodeURIComponent(hash)}`,
  address: (chain: string, network: string, address: string): string =>
    `/address/${encodeURIComponent(chain)}/${encodeURIComponent(network)}/${encodeURIComponent(address)}`,
  token: (chain: string, network: string, address: string): string =>
    `/tokens/${encodeURIComponent(chain)}/${encodeURIComponent(network)}/${encodeURIComponent(address)}`,
} as const

/* ══════════════════════════════ what a reader pasted ══════════════════════════════ */

export type Guess =
  | { kind: 'height'; value: string }
  | { kind: 'hash'; value: string }
  | { kind: 'address'; value: string }
  | { kind: 'unknown'; value: string }

/**
 * What a pasted string most likely is.
 *
 * The rules are the SERVICE's, not this app's, so a guess that sends somebody to a page the
 * indexer would reject cannot happen quietly:
 *
 *   * a run of digits is a height — `indexer/src/server.ts` accepts `/^\d{1,15}$/` and answers
 *     **400 `bad_height`** for anything else;
 *   * `0x` + 64 hex is a hash — `EVM_HASH` at `indexer/src/server.ts`;
 *   * `0x` + 40 hex is an address — `EVM_ADDRESS` at `indexer/src/server.ts`.
 *
 * **Case is preserved.** The service lower-cases an EVM address itself
 * (`indexer/src/server.ts`) precisely so the EIP-55 checksum form every wallet and every
 * explorer displays does not silently return an empty page; lower-casing here as well would work
 * but would put a second copy of that rule in a bundle, and the non-EVM families are
 * case-significant (`indexer/src/server.ts`). So the paste goes to the service as typed.
 *
 * Anything else is `unknown` — an honest answer, and the search page says which three shapes it
 * knows rather than picking the nearest one and being wrong.
 */
export function guessKind(raw: string): Guess {
  const value = raw.trim()
  if (/^\d{1,15}$/.test(value)) return { kind: 'height', value }
  if (/^0x[0-9a-fA-F]{64}$/.test(value)) return { kind: 'hash', value }
  if (/^0x[0-9a-fA-F]{40}$/.test(value)) return { kind: 'address', value }
  return { kind: 'unknown', value }
}
