/**
 * The ten scopes, each with the state its own index reports.
 *
 * Five chains (`indexer/src/chains.ts:41`) times two networks (`indexer/src/chains.ts:43`), and
 * one `GET /v1/chains/:chain/:network/status` per scope — `indexer/src/server.ts:154`, handler at
 * `:384`, anonymous (`authoriseRead`, `indexer/src/server.ts:727-736`).
 *
 * ── This page used to fetch nothing, and the reason it gave is no longer true ──────────────────
 *
 * It said: "ten status calls that all refuse would be ten identical panels, and the standing notice
 * in the shell has already said it once." Every read on `micro-indexer` required `indexer:read` or
 * an admin at the time, so that was correct and it is now false. The reads are anonymous, the
 * notice is deleted, and a list of ten links that cannot say which of them this deployment actually
 * walks is a list that makes the reader open all ten to find out.
 *
 * ── What a scope answers when it is NOT followed ──────────────────────────────────────────────
 *
 * A 200, not a 404. `status` is assembled from a checkpoint row that may not exist
 * (`indexer/src/reads.ts:288-311`), so an unfollowed scope answers with `indexedHeight: null` and
 * `tipHeight: null` rather than an error — the scope is real, this replica has simply never walked
 * it. `INDEXER_CHAINS` decides which ones it does (`indexer/src/env.ts:289-291`), and a scope that
 * is configured with no provider is called out upstream as "a service that reports healthy and
 * indexes nothing" (`indexer/src/env.ts:18-21`). Both cases are rendered as what they are, and
 * neither as a zero.
 *
 * ── Ten requests, and one failure does not take the page down ─────────────────────────────────
 *
 * They are issued together and settled independently. A scope whose call failed says so in its own
 * card and carries its request id; the other nine still render. A `Promise.all` that rejected would
 * have let one unreachable scope blank a page with nine good answers on it.
 */
import { useCallback } from 'react'
import { Link } from 'react-router-dom'
import { Failed, Loading } from '../components/states.tsx'
import { Note, StateBadge } from '../components/tone.tsx'
import { noticeFor, type ErrorNotice } from '../lib/api.ts'
import { chainTone, count } from '../lib/format.ts'
import {
  CHAIN_IDS,
  NETWORKS,
  getChainStatus,
  type ChainStatus,
  type Scope,
} from '../lib/indexer.ts'
import { useResource } from '../lib/resource.ts'
import { linkTo } from '../lib/routes.ts'

/**
 * What each chain is, in one line.
 *
 * The asset codes come from `indexer/src/chains.ts:45-51` and the families from
 * `@cloudsforge/contracts-chain` via `familyOf` (`indexer/src/chains.ts:65-67`). Written out here
 * rather than fetched because a list of five names should not require a round trip, and
 * `test/indexer.test.ts` checks the chain ids against the real source.
 */
const ABOUT: Readonly<Record<string, string>> = {
  ember: 'EMBER — the Forge Network chain, proof of work',
  eth: 'ETH — Ethereum',
  btc: 'BTC — Bitcoin',
  sol: 'SOL — Solana',
  xrp: 'XRP — the XRP Ledger',
}

/** One scope's answer, or the reason there is not one. Never both, and never neither. */
interface ScopeAnswer {
  readonly scope: Scope
  readonly status: ChainStatus | null
  readonly error: ErrorNotice | null
}

const SCOPES: readonly Scope[] = CHAIN_IDS.flatMap((chain) =>
  NETWORKS.map((network): Scope => ({ chain, network })),
)

export function ChainsPage() {
  const load = useCallback(
    (signal: AbortSignal): Promise<readonly ScopeAnswer[]> =>
      Promise.all(
        SCOPES.map((scope) =>
          getChainStatus(scope, signal).then(
            (status): ScopeAnswer => ({ scope, status, error: null }),
            (err: unknown): ScopeAnswer => {
              // An abort is this component going away and must not be rendered as a failure, so it
              // is re-thrown for `useResource`'s abort guard to swallow. Absorbing it here would
              // paint ten "could not be read" cards on a page nobody is looking at.
              if (signal.aborted) throw err
              return {
                scope,
                status: null,
                error: noticeFor(err, 'The chain index could not be reached.'),
              }
            },
          ),
        ),
      ),
    [],
  )

  // Ten is the count whether or not any of them answered, so this resource is never `empty`: a
  // scope that failed is a card with a reason on it, not a missing row.
  const resource = useResource<readonly ScopeAnswer[]>(
    load,
    (answers) => answers.length,
    'The chain index could not be reached.',
  )

  return (
    <div className="ex-page">
      <header className="ex-page__head">
        <h1 className="ex-page__title">Chains</h1>
      </header>
      <p className="ex-page__lede">
        Every <code className="cf-num">(chain, network)</code> pair this index can be asked about,
        with how far it has walked each one and how far that leaves it behind the tip a provider
        last claimed.
      </p>

      {resource.state === 'loading' && <Loading label="Reading every chain" />}
      {resource.error && <Failed notice={resource.error} onRetry={resource.reload} />}

      {resource.data && (
        <ul className="ex-scopes">
          {CHAIN_IDS.map((chain) => (
            <li key={chain} className="ex-scope">
              <h2 className="ex-scope__name">{ABOUT[chain] ?? chain}</h2>
              {NETWORKS.map((network) => (
                <div key={network} className="ex-scope__net">
                  <Link className="ex-scope__link" to={linkTo.chain(chain, network)}>
                    <code className="cf-num">
                      {chain}/{network}
                    </code>
                  </Link>
                  <ScopeLine
                    answer={resource.data?.find(
                      (a) => a.scope.chain === chain && a.scope.network === network,
                    )}
                  />
                </div>
              ))}
            </li>
          ))}
        </ul>
      )}

      <Note>
        &ldquo;Walked&rdquo; and &ldquo;claimed&rdquo; are different questions and this page never
        collapses them. The first is the highest canonical block this index has actually read and
        would have detected a reorg in; the second is what a provider said the tip was. A depth
        counted against the second can exceed the number of blocks anybody here has looked at, by
        exactly the lag shown (<code className="cf-num">indexer/src/reads.ts:24-27</code>).
      </Note>

      <h2 className="ex-section__title">Why there is no SHARD here</h2>
      <p className="ex-page__lede">
        SHARD is a CloudsForge balance rather than a chain. `micro-indexer` leaves it out of its
        chain list on purpose (<code className="cf-num">indexer/src/chains.ts:35-37</code>): it
        exists in the estate&rsquo;s asset record only so that record is total, it never exists on a
        chain, and an indexer that accepted it &ldquo;would be advertising an endpoint that can only
        ever answer empty&rdquo;.
      </p>
    </div>
  )
}

/**
 * One scope's line: walked, claimed, and the gap — or the reason there is no answer.
 *
 * Three outcomes, three sentences. "Not walked" is not "zero", and a scope whose call failed is
 * neither: the service was asked and did not answer, which says nothing about the chain.
 */
function ScopeLine({ answer }: { answer: ScopeAnswer | undefined }) {
  if (!answer) return null

  if (answer.error) {
    return (
      <p className="ex-scope__state ex-absent">
        This scope could not be read.
        {answer.error.requestId && (
          <>
            {' '}
            <code className="cf-num wt-reqid">{answer.error.requestId}</code>
          </>
        )}
      </p>
    )
  }

  const status = answer.status
  if (!status) return null

  if (status.indexedHeight === null) {
    return (
      <p className="ex-scope__state ex-absent">
        Not walked by this deployment.{' '}
        {status.tipHeight === null
          ? 'No tip has ever been observed for it either.'
          : `A provider has claimed a tip of ${count(status.tipHeight)}.`}
      </p>
    )
  }

  return (
    <p className="ex-scope__state">
      <StateBadge tone={chainTone(status)} /> <span className="ex-dim">walked to</span>{' '}
      <span className="cf-num">{count(status.indexedHeight)}</span>
      {status.tipHeight !== null && (
        <>
          {' '}
          <span className="ex-dim">· claimed tip</span>{' '}
          <span className="cf-num">{count(status.tipHeight)}</span>
        </>
      )}
      {status.lagBlocks !== null && (
        <>
          {' '}
          <span className="ex-dim">· behind by</span>{' '}
          <span className="cf-num">{count(status.lagBlocks)}</span>
        </>
      )}
    </p>
  )
}
