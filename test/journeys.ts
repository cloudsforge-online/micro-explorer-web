/**
 * This surface's slice of `docs/ecosystem/22-browser-journeys.md`, as data.
 *
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 * WHY THE CATALOGUE IS DATA AND NOT JUST A LIST OF `it(...)` TITLES
 *
 * Doc 22 §3.2 makes the layer boundary mechanical rather than advisory: every scenario declares
 * one `asserts` kind, and any scenario whose outcome depends on a SERVER-SIDE rule must carry
 * `ownedBy` — "a path, resolvable by grep, in the service that enforces the rule". A meta-test
 * reads these and fails the suite when one is missing.
 *
 * The second reason is doc 22 §8: a scenario that exists and cannot run is a gap somebody can
 * close, and an absent scenario is a gap nobody can see.
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 *
 * Doc 22 §6.14 (Group N) covers three surfaces: the marketing site, the faucet and the explorer.
 * BJ-NET-01 through BJ-NET-10 belong to `network-site`, which is not this repository, so they are
 * not listed here — claiming them would be claiming coverage this repository cannot provide.
 */

export type Asserts = 'presentation' | 'client-request' | 'navigation'
export type Tier = 'T1' | 'T2' | 'T3'

export interface Scenario {
  readonly id: string
  readonly what: string
  readonly asserts: Asserts
  readonly tier: Tier
  readonly gate?: boolean
  readonly ownedBy?: { readonly path: string; readonly grep: string }
  readonly blocked?: string
}

export const SCENARIOS: readonly Scenario[] = [
  /* ── 6.14 Group N — the explorer half ─────────────────────────────────────────────────────── */
  {
    id: 'BJ-NET-11',
    what: 'the index offers a search box and makes no API call at all — there is no question yet',
    asserts: 'client-request',
    tier: 'T1',
  },
  {
    id: 'BJ-NET-12',
    what: 'a height, a hash and an address each route to the right two-segment scope path',
    asserts: 'navigation',
    tier: 'T2',
  },
  {
    id: 'BJ-NET-13',
    what: 'a scope the estate does not run renders the unknown-scope screen naming the chains and networks, not a generic not-found',
    asserts: 'navigation',
    tier: 'T2',
  },
  {
    id: 'BJ-NET-14',
    what: 'the chains page renders one row per scope with the state its own index reports',
    asserts: 'presentation',
    tier: 'T2',
    gate: true,
  },
  {
    id: 'BJ-NET-15',
    what: 'two reads, never crossed over: the record supplies the facts, the confirmations answer supplies the verdict, and the word "final" appears nowhere',
    asserts: 'presentation',
    tier: 'T1',
    gate: true,
  },
  {
    id: 'BJ-NET-16',
    what: 'a 404 transaction_not_found and a 200 with confirmed:false are two different screens, separated by the error CODE and never by the status',
    asserts: 'presentation',
    tier: 'T1',
    gate: true,
    ownedBy: { path: 'indexer/src/server.ts', grep: 'transaction_not_found' },
  },
  {
    id: 'BJ-NET-17',
    what: 'a reverted transaction at full depth shows the status beside the depth at the same weight, and the verdict names which of the four inputs failed',
    asserts: 'presentation',
    tier: 'T1',
    gate: true,
  },
  {
    id: 'BJ-NET-18',
    what: 'each reorg renders with its depth, and a chain behind its tip states the lag rather than implying it is current',
    asserts: 'presentation',
    tier: 'T2',
  },
  {
    id: 'BJ-NET-19',
    what: 'activity and token balances are two reads; one failing does not blank the other',
    asserts: 'presentation',
    tier: 'T1',
  },
  {
    id: 'BJ-NET-20',
    what: 'supply and authorities are as the contract reports them, not as an order record claims',
    asserts: 'presentation',
    tier: 'T2',
  },
  {
    id: 'BJ-NET-21',
    what: 'the block page renders height, hash and the transactions in it, from the response',
    asserts: 'presentation',
    tier: 'T2',
  },

  /* ── 6.19 Group S — the page-level hazards ────────────────────────────────────────────────── */
  //
  // This surface appears in NO row of §6.19's form table, and correctly: it commits nothing. Every
  // route it calls is a read. So no `BJ-ADV-<n>-H<n>` id belongs here, and inventing one would be
  // claiming coverage of a hazard that cannot arise.
  {
    id: 'BJ-ADV-22',
    what: 'degraded not down: the page paints inside its deadline with the slow read marked pending',
    asserts: 'presentation',
    tier: 'T1',
    gate: true,
  },
  {
    id: 'BJ-ADV-23',
    what: 'every failure state renders the request id to quote to support',
    asserts: 'presentation',
    tier: 'T1',
    gate: true,
  },

  /* ── 6.20 Group T — accessibility ─────────────────────────────────────────────────────────── */
  {
    id: 'BJ-A11Y-01',
    what: 'axe on every route of this surface: zero serious or critical violations',
    asserts: 'presentation',
    tier: 'T2',
    gate: true,
    blocked:
      'axe-core is not installed anywhere in the estate, and doc 22 §1 records that as true of ' +
      'all fifteen bundles. Doc 22 §7.2 makes the axe sweep estate-wide by construction ("Any PR ' +
      'in ui — every surface’s T1 axe set"), so it belongs to the shared design system rather ' +
      'than to one repository. BJ-A11Y-10 and -12 need no engine and are run.',
  },
  {
    id: 'BJ-A11Y-03',
    what: 'a degraded panel is still announced, and a failure is not colour-only',
    asserts: 'presentation',
    tier: 'T1',
    gate: true,
  },
  {
    id: 'BJ-A11Y-10',
    what: 'colour is never the only channel: every state badge carries a word as well',
    asserts: 'presentation',
    tier: 'T1',
  },
  {
    id: 'BJ-A11Y-12',
    what: 'one main landmark, a reachable skip link, and a heading order with no level skipped',
    asserts: 'presentation',
    tier: 'T1',
  },

  /* ── 5.1 the universal per-surface property ───────────────────────────────────────────────── */
  {
    id: 'BJ-EXPLORER-404',
    what: 'an address this surface does not own renders the not-found screen UNDER a 404',
    asserts: 'navigation',
    tier: 'T2',
  },
]

/** Every id doc 22 assigns to this surface. Doc 22 §5 keys it `explorer`. */
export const DOC22_IDS: readonly string[] = [
  'BJ-NET-11',
  'BJ-NET-12',
  'BJ-NET-13',
  'BJ-NET-14',
  'BJ-NET-15',
  'BJ-NET-16',
  'BJ-NET-17',
  'BJ-NET-18',
  'BJ-NET-19',
  'BJ-NET-20',
  'BJ-NET-21',
  'BJ-ADV-22',
  'BJ-ADV-23',
  'BJ-A11Y-01',
  'BJ-A11Y-03',
  'BJ-A11Y-10',
  'BJ-A11Y-12',
  'BJ-EXPLORER-404',
]
