/**
 * The `micro-indexer` surface, as this app is allowed to use it.
 *
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 * EVERY ROUTE BELOW WAS READ OUT OF `indexer/src/server.ts`, ONE AT A TIME, AND CARRIES THE LINE
 * IT WAS READ FROM.
 *
 * Not inferred from a sibling client, and not copied from `@cloudsforge/sdk`. Eight clients in
 * this estate were built against a surface somebody imagined; one made every on-chain escrow
 * activation fail with a false diagnosis, and one made every ForgeMint project page read "not yet
 * indexed" permanently. `micro-indexer`'s own route table says so in its header
 * (`indexer/src/server.ts:148-162`) and asks to be parsed rather than paraphrased.
 *
 * The table is `DOMAIN` at `indexer/src/server.ts:163-174`, one entry per line. Both spellings of
 * every path are mounted, because `PREFIXES` is `['/v1', '']` (`indexer/src/server.ts:144`) and
 * `buildRoutes` loops over it (`indexer/src/server.ts:416-420`). This client uses the `/v1` form
 * throughout: it is the estate convention, and the service's own comment at `:137-143` says the
 * bare form exists for the operator runbooks rather than for new callers.
 *
 * | Method | Path                                                | Authenticates              | Verified at               |
 * | ------ | --------------------------------------------------- | -------------------------- | ------------------------- |
 * | GET    | /v1/chains/:chain/:network/status                     | authoriseRead :427         | indexer/src/server.ts:164 |
 * | GET    | /v1/addresses/:chain/:network/:address/activity       | authoriseRead :439         | indexer/src/server.ts:165 |
 * | GET    | /v1/addresses/:chain/:network/:address/token-balances | authoriseRead :506         | indexer/src/server.ts:166 |
 * | GET    | /v1/transactions/:chain/:network/:hash                 | authoriseRead :455         | indexer/src/server.ts:167 |
 * | GET    | /v1/transactions/:chain/:network/:hash/confirmations   | authoriseRead :480         | indexer/src/server.ts:168 |
 * | GET    | /v1/tokens/:chain/:network/:address                    | authoriseRead :536         | indexer/src/server.ts:169 |
 * | GET    | /v1/blocks/:chain/:network/:height                     | authoriseRead :599         | indexer/src/server.ts:171 |
 *
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 * THE READS ARE ANONYMOUS, AND THIS CLIENT SENDS NO BEARER FOR ONE.
 *
 * `authoriseRead` (`indexer/src/server.ts:792-801`) reads the `authorization` header and, when
 * there is none, **returns `null` and lets the handler run** (`indexer/src/server.ts:794`). Every
 * one of the seven routes above opens with `await authoriseRead(ctx, deps)`, so a browser holding
 * no credential at all is served. The service's reasoning is in the doc comment above it
 * (`indexer/src/server.ts:763-791`): every read answers with a chain fact anyone can obtain by
 * running a Hearth node, this service stores nothing linking an address to a person, and the check
 * that used to sit there was "a lock on a public library".
 *
 * This surface used to be built the other way round. All nine handlers called
 * `authorise(ctx, deps, READ_SCOPE)`, which accepts only a service principal carrying
 * `indexer:read` or a user the token says is an admin — so an anonymous visitor got 401 and an
 * ordinary customer got 403, and the public block explorer rendered nothing to the public.
 * `docs/ecosystem/15-monetisation-model.md:50` states the rule that broke: "A public chain whose
 * explorer is paywalled is not a public chain." That was reported, `micro-indexer` fixed it, and
 * every apology this bundle used to render has been **deleted** rather than left standing — a
 * surface that explains a restriction which no longer exists is worse than one that never had it.
 *
 * ── So every read below passes `auth: false`, and that is load-bearing ─────────────────────────
 *
 * `src/lib/api.ts` attaches a bearer whenever it happens to hold an access token. On a public read
 * that would be actively harmful, because **a token that IS presented is still verified**: a
 * service principal without `indexer:read` is a 403 (`indexer/src/server.ts:796-799`) and a broken
 * or expired one is a 401. An operator whose access token had expired would therefore get a 401 on
 * a page that needs no session at all — the explorer would depend on a credential to show public
 * data, which is the same defect arriving from the client's side. `auth: false` is how this bundle
 * states that it needs nothing: it is not an optimisation, it is the contract.
 *
 * `test/indexer.test.ts` pins BOTH halves against the real source — that the seven reads are
 * anonymous, and that the three things still refused are still refused — so a re-gate upstream, or
 * a bearer creeping back in here, turns the suite red.
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 *
 * ── Three routes are declined: one read that takes a token, and two writes ─────────────────────
 *
 *   * `GET /v1/custody/:chain/:network/total` (`indexer/src/server.ts:170`) is the ONLY domain
 *     read on this service that requires one, and it is declined for a reason the other two do
 *     not share. It returns Σ confirmed native balance over the estate's custody set — the number
 *     `micro-ledger` reconciles its own books against. The rule that opened the seven reads is
 *     "what they return is already public: anyone may obtain it by running a Hearth node", and
 *     every one of them answers about a block, a hash or an address THE CALLER ALREADY NAMED.
 *     This one answers about a set only the platform knows, across addresses the caller cannot
 *     enumerate, so it is not covered by that rule and serving it anonymously would publish the
 *     treasury's size to anyone who can reach the port (`indexer/src/server.ts:556-581`). It
 *     therefore calls `authorise(ctx, deps, READ_SCOPE)` (`indexer/src/server.ts:583`), and a
 *     public block explorer holds no service token — nor has this surface any use for the number.
 *   * `POST /v1/watch/:chain/:network/:address` (`indexer/src/server.ts:172`) calls
 *     `authorise(ctx, deps, WRITE_SCOPE)` (`indexer/src/server.ts:616`, scope at `:100`). "Watch
 *     this address" is an operator or a service decision about what this deployment indexes; a
 *     browser does not get to enlarge a shared work queue.
 *   * `POST /v1/backfills/:chain/:network` (`indexer/src/server.ts:173`) takes `indexer:write` too
 *     (`indexer/src/server.ts:638`) and enqueues a range walk. Same reason, with a cost attached:
 *     a backfill is provider calls, which is money.
 *
 * Neither was relaxed, and this app must not start depending on either. `authorise`
 * (`indexer/src/server.ts:803-821`) is the write gate and is unchanged: no token is a 401
 * (`:811`), a service without the scope is a 403 (`:814`), and a user is refused unless `isAdmin`
 * (`:819`).
 *
 * `/livez`, `/readyz` and `/metrics` (`indexer/src/server.ts:382`, `:392`, `:399`) are the platform
 * probes and are not wrapped here either.
 *
 * ── Amounts are strings, and nothing here parses one with Number ───────────────────────────────
 *
 * `reads.ts` puts every amount on the wire as a decimal string and says why in its header
 * (`indexer/src/reads.ts:8-10`): `JSON.stringify` cannot serialise a `bigint` at all, and
 * `Number(amount)` silently loses the low digits of any 18-decimal value above about 9 ETH. This
 * file types them as `string` and `src/lib/format.ts` never converts one.
 */
import { api, noticeFor, type ErrorNotice } from './api.ts'

/* ══════════════════════════════ scope ══════════════════════════════ */

/**
 * The chains this service CAN be asked about, as `indexer/src/chains.ts:50` declares them.
 *
 * **Being on this list is not being indexed, and this bundle must never let the two read as the
 * same thing.** `INDEXER_CHAINS` decides what a deployment actually walks (`indexer/src/env.ts:324`)
 * and both live estates set it to exactly one scope — `ember:mainnet` and `ember:testnet`
 * respectively. Every other scope answers 200 with `indexedHeight: null` and no providers. Use
 * `isServed` below to tell them apart; nothing may offer a chain on the strength of this constant
 * alone.
 *
 * `ltc` IS ON IT and used not to be. Litecoin's spec carries `family: 'bitcoin'` and the indexer
 * selects a worker by family (`indexer/src/index.ts:113-118`), so it needs no worker of its own —
 * the drift test in `test/indexer.test.ts` had been red for exactly this since micro-contracts
 * `7ec2117` added LTC, and a chain the service serves was missing from the client that reads it.
 *
 * Restated here rather than imported, because a browser bundle must not depend on a service's
 * source tree; `test/indexer.test.ts` reads the real list and fails if this one drifts.
 */
export const CHAIN_IDS = ['ember', 'eth', 'btc', 'sol', 'xrp', 'ltc'] as const
export type ChainId = (typeof CHAIN_IDS)[number]

/** `indexer/src/chains.ts:43`. */
export const NETWORKS = ['mainnet', 'testnet'] as const
export type Network = (typeof NETWORKS)[number]

export function isChainId(value: string): value is ChainId {
  return (CHAIN_IDS as readonly string[]).includes(value)
}

export function isNetwork(value: string): value is Network {
  return (NETWORKS as readonly string[]).includes(value)
}

/**
 * The unit every route is scoped by.
 *
 * `indexer/src/chains.ts:106-114` says there is no function in that repository that takes a chain
 * without a network, and `indexer/src/chains.ts:12-19` says why: XRP has no network binding today,
 * so the same seed and the same address exist on testnet and mainnet and a signed Payment is
 * submittable on either. Every address in this app carries both segments for the same reason.
 */
export interface Scope {
  readonly chain: ChainId
  readonly network: Network
}

/* ══════════════════════════════ what comes back ══════════════════════════════ */

/** `indexer/src/reads.ts:60-72`. */
export interface ProviderView {
  readonly provider: string
  readonly host: string
  readonly state: 'healthy' | 'degraded' | 'down'
  readonly consecutiveFailures: number
  readonly totalRequests: number
  readonly totalFailures: number
  readonly latencyMs: number | null
  readonly lastOkAt: string | null
  readonly lastFailureAt: string | null
  readonly lastError: string | null
  readonly rateLimitedUntil: string | null
}

/** One recorded reorg, as `status` reports it (`indexer/src/reads.ts:91-100`, `:326-335`). */
export interface ReorgView {
  readonly id: string
  readonly detectedAt: string
  readonly depth: number
  readonly commonAncestorHeight: number
  /** True when the depth crossed the alarm threshold and the chain was halted. */
  readonly alarming: boolean
  readonly orphanedBlocks: number
  readonly orphanedTransactions: number
  readonly orphanedActivity: number
}

/**
 * The state of one chain, as `status` builds it (`indexer/src/reads.ts:74-101`, `:288-337`).
 *
 * **`indexedHeight` and `tipHeight` are different numbers and the difference is the whole point.**
 * `indexedHeight` is the highest canonical block this service has walked and would have detected a
 * reorg in; `tipHeight` is what a provider last claimed. `indexer/src/reads.ts:24-27` says counting
 * against the second "over-reports depth, and over-reporting depth credits early". This app renders
 * both, always, and never one without the other.
 */
export interface ChainStatus {
  readonly chain: string
  readonly network: string
  readonly family: string
  readonly asset: string
  readonly chainId: number | null
  readonly requiredConfirmations: number
  readonly reorgAlarmDepth: number
  readonly tipHeight: number | null
  readonly tipSeenAt: string | null
  readonly indexedHeight: number | null
  readonly indexedHash: string | null
  /** Null when no tip has ever been observed — "a lag of zero would be a lie, not a default." */
  readonly lagBlocks: number | null
  /** True once an alarming reorg has made this service stop vouching for the chain. */
  readonly halted: boolean
  readonly haltReason: string | null
  readonly providers: readonly ProviderView[]
  readonly recentReorgs: readonly ReorgView[]
}

/** One movement in or out of an address (`indexer/src/reads.ts:103-130`). */
export interface ActivityView {
  readonly id: string
  readonly address: string
  readonly direction: 'in' | 'out'
  readonly assetCode: string
  readonly assetKind: 'native' | 'token'
  readonly tokenAddress: string | null
  /** Smallest units, decimal string. */
  readonly amount: string
  /**
   * Formatted only for the NATIVE asset, and null for a token — deliberately.
   *
   * `indexer/src/reads.ts:374-381`: a token's decimals is a call to the contract and a fact a token
   * registry owns, "so it is left unformatted rather than guessed at eighteen — which is how a
   * six-decimal stablecoin gets displayed a million times too small". This app renders the raw
   * units and says they are raw; it does not divide by anything.
   */
  readonly amountFormatted: string | null
  readonly txHash: string
  readonly txUrn: string
  readonly explorerUrl: string | null
  readonly logIndex: number | null
  readonly blockHeight: number
  readonly blockHash: string
  /**
   * `indexer/src/reads.ts:118-124`. **Three values, not two** — `conflicted` is reachable on a
   * UTXO family and means the coins behind this movement were spent by a different canonical
   * transaction, so unlike `orphaned` it can never be re-mined. This union said `included |
   * orphaned` until `micro-indexer` widened it, which made every conflicted movement render as
   * an orphaned one; `activityTone` in `src/lib/format.ts` is where the difference is drawn.
   */
  readonly status: 'included' | 'orphaned' | 'conflicted'
  /** Counted against `tipHeight`, NOT against the walked head. See `CONFIRMATIONS_AGAINST`. */
  readonly confirmations: number | null
  readonly confirmed: boolean
  readonly firstSeenAt: string
  readonly confirmedAt: string | null
  readonly reorgedAt: string | null
}

/** `indexer/src/reads.ts:132-140`. */
export interface ActivityPage {
  readonly chain: string
  readonly network: string
  readonly address: string
  readonly tipHeight: number | null
  readonly requiredConfirmations: number
  readonly items: readonly ActivityView[]
  readonly nextCursor: string | null
}

/** One log entry on a transaction (`indexer/src/reads.ts:160-166`). */
export interface LogView {
  readonly logIndex: number
  readonly address: string
  readonly topics: readonly string[]
  readonly data: string
  readonly status: string
}

/**
 * A transaction as the chain reported it (`indexer/src/reads.ts:142-167`).
 *
 * **A record, not a decision.** `indexer/src/reads.ts:184-196` draws the line: this shape answers
 * "what did the chain say", and `ConfirmationView` answers "may I act on it". The two are fetched
 * together on the transaction page and only the second is allowed to say `confirmed`.
 */
export interface TransactionView {
  readonly chain: string
  readonly network: string
  readonly hash: string
  readonly txUrn: string
  readonly explorerUrl: string | null
  readonly blockHash: string | null
  readonly blockHeight: number | null
  readonly txIndex: number | null
  readonly from: string | null
  readonly to: string | null
  readonly value: string
  readonly fee: string | null
  readonly status: string
  readonly nonceOrSequence: number | null
  /** Counted against `tipHeight`, NOT against the walked head. See `CONFIRMATIONS_AGAINST`. */
  readonly confirmations: number | null
  readonly detail: Record<string, unknown>
  readonly firstSeenAt: string
  readonly logs: readonly LogView[]
}

/**
 * A block (`indexer/src/reads.ts:169-182`).
 *
 * `status` cannot be `orphaned` here: `blockAtHeight` filters `status <> 'orphaned'`
 * (`indexer/src/store.ts:200`), so a height whose block was reorged away is a 404
 * `block_not_found` — "no such block on the canonical chain" (`indexer/src/server.ts:608`).
 * That is worth knowing before rendering an "orphaned" badge that can never appear.
 */
export interface BlockView {
  readonly chain: string
  readonly network: string
  readonly height: number
  readonly hash: string
  readonly parentHash: string
  readonly blockTime: string
  readonly status: string
  readonly reorgDepth: number | null
  readonly txCount: number
  /** Counted against `tipHeight`, NOT against the walked head. See `CONFIRMATIONS_AGAINST`. */
  readonly confirmations: number | null
  readonly detail: Record<string, unknown>
  readonly transactionHashes: readonly string[]
}

/**
 * Whether a transaction has reached its depth — the ONLY answer in this API that may be acted on.
 *
 * `indexer/src/reads.ts:198-223`. Everything `confirmed` was computed from travels with it, so no
 * caller has to reconstruct the depth policy or notice that `status` was `failed`. This app renders
 * every one of those inputs beside the verdict rather than only the verdict.
 */
export interface ConfirmationView {
  readonly chain: string
  readonly network: string
  readonly hash: string
  readonly txUrn: string
  readonly explorerUrl: string | null
  readonly status: string
  readonly blockHash: string | null
  readonly blockHeight: number | null
  /** True while the block this transaction names is still on the canonical chain. */
  readonly canonical: boolean
  /** Null whenever there is nothing honest to count: pending, dropped, or reorged away. */
  readonly confirmations: number | null
  readonly requiredConfirmations: number
  /** Succeeded, canonical, deep enough, and the chain is not halted. Nothing less. */
  readonly confirmed: boolean
  /** The highest canonical block this service has WALKED. This is what the count is against. */
  readonly indexedHeight: number | null
  /** What a provider last claimed. Reported for lag, never counted against. */
  readonly tipHeight: number | null
  readonly halted: boolean
}

/** `indexer/src/reads.ts:225-229`. Smallest units; a uint256 does not survive a JSON number. */
export interface TokenBalance {
  readonly contract: string
  readonly balance: string
}

/** `indexer/src/reads.ts:241-247`. True only for an unbroken range `[0, atBlock]`. */
export interface CoverageView {
  readonly fromHeight: number | null
  readonly toHeight: number | null
  readonly blocks: number
  readonly complete: boolean
}

/**
 * What this service's own record says an address holds, and the evidence that it is a balance.
 *
 * `indexer/src/reads.ts:231-265`. **`balances` and `balance` are ABSENT rather than zero** whenever
 * the answer may not be believed, and `unavailable` names which of the four reasons applied
 * (`indexer/src/reads.ts:264`). A missing balance is missing: "zero is what evicts a token-gated
 * member" (`indexer/src/server.ts:502-503`). This app renders the reason and never a nought.
 */
export interface TokenBalancesView {
  readonly chain: string
  readonly network: string
  readonly address: string
  readonly atBlock: number | null
  readonly indexedHeight: number | null
  readonly tipHeight: number | null
  readonly halted: boolean
  readonly coverage: CoverageView
  readonly balances?: readonly TokenBalance[]
  readonly balance?: string
  readonly unavailable?: 'nothing_indexed' | 'coverage_incomplete' | 'chain_halted' | 'negative'
}

/**
 * A token's supply and authorities, as the contract itself reports them
 * (`indexer/src/tokenstate.ts:110-134`).
 *
 * Every field is nullable because a contract that does not implement a method is a real answer.
 * `observedAtBlock` is the STORED CANONICAL HEAD the call was made at — not the tip — and
 * `tipHeight` is reported beside it "for staleness, never read against"
 * (`indexer/src/tokenstate.ts:126-131`).
 */
export interface TokenObservation {
  readonly chain: string
  readonly network: string
  readonly contractAddress: string
  readonly name: string | null
  readonly symbol: string | null
  readonly decimals: number | null
  readonly totalSupply: string | null
  /** The hard cap where the contract has one. Null means uncapped OR not implemented. */
  readonly cap: string | null
  readonly owner: string | null
  readonly mintAuthority: boolean | null
  readonly paused: boolean | null
  readonly observedAtBlock: number
  readonly observedAtBlockHash: string
  readonly tipHeight: number | null
  readonly halted: boolean
}

/* ══════════════════════════════ reorg honesty ══════════════════════════════ */

/**
 * WHICH HEAD EACH CONFIRMATION COUNT IS MEASURED AGAINST.
 *
 * This is the single most important thing in this file and it is not uniform across the API.
 * `indexer/src/reads.ts:18-30` scopes the rule: `confirmation` and `tokenBalances` were added as
 * DECISION INPUTS for `micro-market`'s escrow gate and `micro-community`'s token gate, and rule 1
 * of that block is that they count against "the stored canonical HEAD, never against
 * `checkpoints.tip_height`", because "the tip is what a provider last claimed; the head is what
 * this service has actually walked".
 *
 * The three RECORD reads predate that rule and were not brought under it:
 *
 *   * `block`        — `confirmationsAt(tipHeight, record.height)` (`indexer/src/reads.ts:579`)
 *   * `transaction`  — `confirmationsAt(tipHeight, record.blockHeight)` (`indexer/src/reads.ts:424-427`)
 *   * `activity`     — `confirmationsAt(tipHeight, item.blockHeight)` (`indexer/src/reads.ts:362-365`)
 *
 * where `tipHeight` in all three is `checkpoint?.tipHeight` — the provider's claim
 * (`indexer/src/reads.ts:351`, `:408`, `:568`). So a block page's "confirmations" can be larger
 * than the number of blocks this service has actually looked at, by exactly the current lag.
 *
 * That is not a bug in this client and it is not this repository's to fix. It IS something a
 * reader must not be allowed to mistake for finality, so this app:
 *
 *   1. labels every one of those three counts as measured against the CLAIMED TIP;
 *   2. renders `lagBlocks` from `/status` beside them wherever it can;
 *   3. never prints the word "final", and never says "confirmed" off a record read;
 *   4. on the transaction page fetches `/confirmations` as well, and takes the verdict ONLY from
 *      there, because that one is counted against the walked head.
 *
 * Reported to micro-indexer. `test/indexer.test.ts` pins both spellings against the real source, so
 * the day the record reads move onto the head this constant goes red and the copy gets corrected
 * rather than quietly becoming over-cautious.
 */
export const CONFIRMATIONS_AGAINST = {
  /** `indexer/src/reads.ts:451-454` — `record.headHeight`, the block this service walked. */
  confirmations: 'walked-head',
  /** `indexer/src/reads.ts:579` — `checkpoint.tipHeight`, a provider's claim. */
  block: 'claimed-tip',
  /** `indexer/src/reads.ts:424-427` — `checkpoint.tipHeight`, a provider's claim. */
  transaction: 'claimed-tip',
  /** `indexer/src/reads.ts:362-365` — `checkpoint.tipHeight`, a provider's claim. */
  activity: 'claimed-tip',
} as const

export type HeadKind = (typeof CONFIRMATIONS_AGAINST)[keyof typeof CONFIRMATIONS_AGAINST]

/* ══════════════════════════════ the calls ══════════════════════════════ */

/**
 * Each path is written out SEGMENT BY SEGMENT, with no helper standing for `chain/network`.
 *
 * `micro-market`'s guard learned this the expensive way and wrote it down
 * (`market/src/indexerclient.test.ts:251-259`): a `${scope}` holding `chain/network` is ONE
 * template segment, so `/transactions/${scope}/${hash}/confirmations` collapses to five segments —
 * which is exactly the shape of `/transactions/:chain/:network/:hash`, a DIFFERENT route. The
 * checker then matched it against the wrong pattern and reported it fine. A shape check can only
 * judge the shape it is shown, and a helper hides one.
 */
const seg = (value: string): string => encodeURIComponent(value)

/**
 * Every call in this file goes through here, and here is the ONLY place `auth` is decided.
 *
 * `auth: false` is written once rather than seven times, because seven copies of a flag is six
 * chances to forget it and the failure is silent: `src/lib/api.ts` attaches a bearer whenever it
 * holds one, the indexer verifies whatever it is handed, and an expired token turns a public page
 * into a 401. One helper makes "this bundle presents no credential" a property of the module
 * instead of a habit — `test/indexer.test.ts` asserts that nothing here reaches `api()` directly.
 *
 * It is not a convenience wrapper for anything else: no headers, no method, no body. The seven
 * routes are GETs and `micro-indexer` reads exactly one request header on a domain route.
 */
function publicRead<T>(path: string, opts: { query?: RequestQuery; signal?: AbortSignal } = {}) {
  return api<T>(path, {
    auth: false,
    ...(opts.query ? { query: opts.query } : {}),
    ...(opts.signal ? { signal: opts.signal } : {}),
  })
}

type RequestQuery = Record<string, string | number | boolean | undefined | null>

/**
 * `GET /v1/chains/:chain/:network/status` — `indexer/src/server.ts:164`.
 *
 * Authenticates: `authoriseRead(ctx, deps)` at `indexer/src/server.ts:427`. Anonymous is served
 * (`indexer/src/server.ts:794`), and this call presents nothing.
 *
 * A chain this estate does not run is a **404 `unknown_chain`** rather than a 400, and the service
 * says why (`indexer/src/server.ts:664-667`): the path names a resource that does not exist, and a
 * caller asking for `/chains/doge/mainnet/status` "has not made a malformed request, it has asked
 * for a chain this estate does not run".
 */
export function getChainStatus(scope: Scope, signal?: AbortSignal): Promise<ChainStatus> {
  return publicRead<ChainStatus>(`/v1/chains/${seg(scope.chain)}/${seg(scope.network)}/status`, {
    ...(signal ? { signal } : {}),
  })
}

/**
 * WHETHER THIS DEPLOYMENT CAN ACTUALLY ANSWER ABOUT A SCOPE.
 *
 * ── The defect, found by the owner using the product ──────────────────────────────────────────
 *
 * The explorer offered every chain in `CHAIN_IDS` on both networks — a chain selector on the front
 * page, ten cards on `/chains` — and exactly one of those scopes has ever been walked. The rest
 * rendered "Not walked by this deployment", which is an honest sentence in a dishonest place: the
 * reader had already chosen the chain, typed the hash and pressed the button before anything told
 * them the answer could not exist. An offer is a claim, and a selector is an offer.
 *
 * ── Why this is measured rather than configured ───────────────────────────────────────────────
 *
 * The obvious repair is a constant listing the chains that work. It would be wrong within a day.
 * What a deployment indexes is `INDEXER_CHAINS` on the container (`indexer/src/env.ts:324`), and
 * the two live estates set it differently from each other; a literal in a browser bundle would be
 * a build-time copy of a runtime fact, and the day somebody indexes a second chain the UI would
 * still hide it. So this is read from `/status`, which every deployment answers for itself.
 *
 * ── Both halves of the test, and neither alone ────────────────────────────────────────────────
 *
 * `indexedHeight !== null` is "this replica has walked blocks here". `providers.length > 0` is
 * "this replica is configured to walk here and has not got a block yet" — a scope named in
 * `INDEXER_CHAINS` whose node is starting up, which is a real state and must not read as
 * unsupported. `indexedHeight` alone would hide a freshly configured chain; `providers` alone
 * would MISS one, because provider health rows survive a configuration change: `ember:testnet` on
 * the mainnet indexer still carries a provider row and 87 stale blocks from when that estate was
 * pointed at testnet. Requiring either, and rendering `halted` separately, is what tells those
 * apart.
 */
export function isServed(status: ChainStatus): boolean {
  return status.indexedHeight !== null || status.providers.length > 0
}

/** One chain's answer to "can you serve me", or the reason there is not one. */
export interface ChainOffer {
  readonly chain: ChainId
  readonly status: ChainStatus | null
  readonly error: ErrorNotice | null
}

/**
 * Ask every chain, on ONE network, whether this deployment serves it.
 *
 * Settled independently rather than through `Promise.all`, so one unreachable scope cannot blank a
 * page that has five good answers on it. A scope whose call failed is neither served nor
 * unsupported — the service was asked and did not answer, which says nothing about the chain — and
 * it comes back carrying its notice so the caller can say that rather than guess.
 *
 * The network is a parameter and never a default. This function has no opinion about which network
 * a page is on; `src/lib/network.ts` owns that, and it derives it from the hostname.
 */
export async function getChainOffers(
  network: Network,
  signal?: AbortSignal,
): Promise<readonly ChainOffer[]> {
  return Promise.all(
    CHAIN_IDS.map((chain) =>
      getChainStatus({ chain, network }, signal).then(
        (status): ChainOffer => ({ chain, status, error: null }),
        (err: unknown): ChainOffer => {
          // An abort is the component going away, not a failure, and re-throwing lets
          // `useResource`'s abort guard swallow it rather than painting six refusals.
          if (signal?.aborted) throw err
          return { chain, status: null, error: noticeFor(err, 'The chain index could not be reached.') }
        },
      ),
    ),
  )
}

/**
 * `GET /v1/blocks/:chain/:network/:height` — `indexer/src/server.ts:171`.
 *
 * Authenticates: `authoriseRead(ctx, deps)` at `indexer/src/server.ts:599`. Anonymous is served.
 *
 * The height is validated as `/^\d{1,15}$/` before any query runs, and anything else is a **400
 * `bad_height`** (`indexer/src/server.ts:602-603`). A height off the canonical chain — including
 * one whose block was orphaned, because `blockAtHeight` filters those out
 * (`indexer/src/store.ts:200`) — is a **404 `block_not_found`** (`indexer/src/server.ts:608`).
 */
export function getBlock(
  scope: Scope,
  height: string,
  signal?: AbortSignal,
): Promise<BlockView> {
  return publicRead<BlockView>(
    `/v1/blocks/${seg(scope.chain)}/${seg(scope.network)}/${seg(height)}`,
    { ...(signal ? { signal } : {}) },
  )
}

/**
 * `GET /v1/transactions/:chain/:network/:hash` — `indexer/src/server.ts:167`.
 *
 * Authenticates: `authoriseRead(ctx, deps)` at `indexer/src/server.ts:455`. Anonymous is served.
 *
 * A hash this indexer has never seen is a **404 `transaction_not_found`**
 * (`indexer/src/server.ts:461`). On an EVM or Ember chain the hash must match
 * `/^0x[0-9a-fA-F]{64}$/` or it is a **400 `bad_hash`** (`indexer/src/server.ts:706-709`); on the
 * other families it is length-checked only, because "the family that would validate them is not
 * built yet and a wrong validator would reject valid addresses"
 * (`indexer/src/server.ts:694-696`).
 */
export function getTransaction(
  scope: Scope,
  hash: string,
  signal?: AbortSignal,
): Promise<TransactionView> {
  return publicRead<TransactionView>(
    `/v1/transactions/${seg(scope.chain)}/${seg(scope.network)}/${seg(hash)}`,
    { ...(signal ? { signal } : {}) },
  )
}

/**
 * `GET /v1/transactions/:chain/:network/:hash/confirmations` — `indexer/src/server.ts:168`.
 *
 * Authenticates: `authoriseRead(ctx, deps)` at `indexer/src/server.ts:480`. Anonymous is served.
 *
 * **THE 404 HERE IS A GENUINE ANSWER AND MUST NOT BE COLLAPSED INTO "not confirmed yet".** The
 * handler's own comment (`indexer/src/server.ts:468-478`) records what happened when it was: a
 * transaction this indexer has never seen answers 404 `transaction_not_found`; one it has seen and
 * that has not reached its depth answers **200 with `confirmed: false`**. `micro-market` reported
 * "the on-chain escrow is not confirmed yet" for every activation because a route-level 404 and a
 * negative answer had been merged.
 *
 * A caller distinguishes them **by the error CODE, never by the status**: a path this service does
 * not serve answers `not_found`, an unrun chain answers `unknown_chain`, and this route answers
 * `transaction_not_found`. `src/pages/transaction.tsx` branches on the code for exactly that
 * reason.
 */
export function getConfirmations(
  scope: Scope,
  hash: string,
  signal?: AbortSignal,
): Promise<ConfirmationView> {
  return publicRead<ConfirmationView>(
    `/v1/transactions/${seg(scope.chain)}/${seg(scope.network)}/${seg(hash)}/confirmations`,
    { ...(signal ? { signal } : {}) },
  )
}

/**
 * `GET /v1/addresses/:chain/:network/:address/activity` — `indexer/src/server.ts:165`.
 *
 * Authenticates: `authoriseRead(ctx, deps)` at `indexer/src/server.ts:439`. Anonymous is served —
 * which matters most here, because this is the route the old gate had the strongest argument for.
 * The service's answer is that it stores nothing linking an address to a person: ownership is a
 * fact `micro-wallet` holds, deliberately (`indexer/src/server.ts:768-771`).
 *
 * `limit` must be an integer in 1..200 or it is a **400 `bad_limit`**
 * (`indexer/src/server.ts:751-758`); the default is 50 (`indexer/src/server.ts:111`). `cursor` is
 * passed straight through and comes back as `nextCursor`.
 *
 * An EVM address is lower-cased before the query (`indexer/src/server.ts:685-692`) precisely so a
 * caller pasting the EIP-55 checksum form — "which is what every wallet and every block explorer
 * displays" — does not silently receive an empty page. This app pastes exactly that form, so the
 * normalisation is load-bearing for this surface in particular.
 */
export function getAddressActivity(
  scope: Scope,
  address: string,
  options: { limit?: number; cursor?: string | null } = {},
  signal?: AbortSignal,
): Promise<ActivityPage> {
  return publicRead<ActivityPage>(
    `/v1/addresses/${seg(scope.chain)}/${seg(scope.network)}/${seg(address)}/activity`,
    {
      query: {
        ...(options.limit === undefined ? {} : { limit: options.limit }),
        ...(options.cursor ? { cursor: options.cursor } : {}),
      },
      ...(signal ? { signal } : {}),
    },
  )
}

/**
 * `GET /v1/addresses/:chain/:network/:address/token-balances` — `indexer/src/server.ts:166`.
 *
 * Authenticates: `authoriseRead(ctx, deps)` at `indexer/src/server.ts:506`. Anonymous is served.
 *
 * Takes an optional `contract` filter, normalised exactly as an address is
 * (`indexer/src/server.ts:725-739`), and an optional `block` bound; absent means "as at the head
 * this service has walked" (`indexer/src/server.ts:741-749`). Both are **400** when malformed.
 *
 * The answer withholds `balances` entirely when the coverage cannot support one. See
 * `TokenBalancesView`.
 */
export function getTokenBalances(
  scope: Scope,
  address: string,
  options: { contract?: string | null; block?: number | null } = {},
  signal?: AbortSignal,
): Promise<TokenBalancesView> {
  return publicRead<TokenBalancesView>(
    `/v1/addresses/${seg(scope.chain)}/${seg(scope.network)}/${seg(address)}/token-balances`,
    {
      query: {
        ...(options.contract ? { contract: options.contract } : {}),
        ...(options.block === undefined || options.block === null ? {} : { block: options.block }),
      },
      ...(signal ? { signal } : {}),
    },
  )
}

/**
 * `GET /v1/tokens/:chain/:network/:address` — `indexer/src/server.ts:169`.
 *
 * Authenticates: `authoriseRead(ctx, deps)` at `indexer/src/server.ts:536`. Anonymous is served.
 *
 * **Three different failures, three different meanings, and this app renders three different
 * screens.** The handler's comment (`indexer/src/server.ts:520-534`) is explicit:
 *
 *   * **404 `token_not_found`** — this service asked the chain and there is no contract answering
 *     `totalSupply()` at that address, at the block it has walked. A fresh deployment above the
 *     head reads as this, and that is honest.
 *   * **404 `not_found`** — the router's. The caller asked for a path this service does not serve.
 *     Entirely different, and `micro-mint` conflated the two: every ForgeMint project page rendered
 *     "not yet indexed" permanently (`indexer/src/server.ts:154-157`).
 *   * **501 / 503 with their own codes** — `TokenStateUnavailableError`
 *     (`indexer/src/tokenstate.ts:136-157`). `family_not_supported` is **501**, because no amount
 *     of waiting will change it; `chain_not_followed`, `nothing_indexed`, `head_diverged` and
 *     `rpc_unavailable` are **503**, because it is a provider, a head or a follower that is behind
 *     (`indexer/src/server.ts:304-325`).
 */
export function getToken(
  scope: Scope,
  address: string,
  signal?: AbortSignal,
): Promise<TokenObservation> {
  return publicRead<TokenObservation>(
    `/v1/tokens/${seg(scope.chain)}/${seg(scope.network)}/${seg(address)}`,
    { ...(signal ? { signal } : {}) },
  )
}
