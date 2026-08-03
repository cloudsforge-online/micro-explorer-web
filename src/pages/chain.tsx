/**
 * One chain's state: how far this index has walked, how far behind it is, and every reorg it has
 * recorded.
 *
 * `GET /v1/chains/:chain/:network/status` — `indexer/src/server.ts:164`, handler at `:426`.
 *
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 * THE TWO HEIGHTS ARE RENDERED SIDE BY SIDE, ALWAYS, AND NEITHER IS CALLED "THE HEIGHT".
 *
 * `indexedHeight` is the highest canonical block this service has walked and would have detected a
 * reorg in. `tipHeight` is what a provider last claimed. `indexer/src/reads.ts:24-27` says the
 * difference in one sentence: "Counting against blocks nobody here has looked at over-reports
 * depth, and over-reporting depth credits early."
 *
 * This is the only page in the app that can show `lagBlocks`, which is exactly that difference
 * (`indexer/src/reads.ts:315-316`), and it is null rather than zero when no tip has ever been
 * observed — "a lag of zero would be a lie, not a default" (`indexer/src/reads.ts:86`).
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 */
import { useCallback } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Failed, Loading, Missing } from '../components/states.tsx'
import { Fact, Note, StateBadge } from '../components/tone.tsx'
import { chainTone, count, providerTone, since, timestamp } from '../lib/format.ts'
import { getChainStatus, type ChainStatus } from '../lib/indexer.ts'
import { useResource } from '../lib/resource.ts'
import { linkTo } from '../lib/routes.ts'
import { parseScope, scopeLabel } from '../lib/scope.ts'
import { UnknownScope } from './unknown-scope.tsx'

export function ChainPage() {
  const params = useParams()
  const scope = parseScope(params['chain'], params['network'])

  const load = useCallback(
    (signal: AbortSignal) => {
      if (!scope) return Promise.reject(new Error('no scope'))
      return getChainStatus(scope, signal)
    },
    // The VALUES, not the closure — see the note on `useResource`'s `deps` parameter.
    [scope?.chain, scope?.network],
  )
  const resource = useResource<ChainStatus>(
    load,
    // A status answer is never "empty": a chain with nothing indexed is a status worth reading, so
    // the count is 1 whenever there is a body at all.
    () => 1,
    'The chain index could not be reached.',
    [scope?.chain, scope?.network],
  )

  if (!scope) return <UnknownScope chain={params['chain']} network={params['network']} />

  if (resource.state === 'loading') return <Loading label={`Reading ${scopeLabel(scope)}`} />
  if (resource.error) {
    // `unknown_chain` and `unknown_network` are 404s that mean "this estate does not run that",
    // which is a fact rather than a fault (`indexer/src/server.ts:667-670`).
    if (resource.error.code === 'unknown_chain' || resource.error.code === 'unknown_network') {
      return <UnknownScope chain={params['chain']} network={params['network']} />
    }
    if (resource.error.status === 404) {
      return (
        <Missing
          title="No such chain here"
          hint="This index does not serve that scope."
          notice={resource.error}
        />
      )
    }
    return <Failed notice={resource.error} onRetry={resource.reload} />
  }
  const status = resource.data
  if (!status) return <Loading label={`Reading ${scopeLabel(scope)}`} />

  const tone = chainTone(status)
  const seen = since(status.tipSeenAt)

  return (
    <div className="ex-page">
      <header className="ex-page__head">
        <h1 className="ex-page__title">
          {status.chain}/{status.network}
        </h1>
        <StateBadge tone={tone} />
      </header>

      {status.halted && (
        <Note tone="warn">
          <strong>This index has stopped vouching for this chain.</strong> A reorg past the alarm
          depth of {count(status.reorgAlarmDepth)} was detected, so holdings questions are refused
          outright rather than answered from a history it cannot stand behind
          (<code className="cf-num">indexer/src/reads.ts:538-541</code>).
          {status.haltReason ? ` The recorded reason: ${status.haltReason}` : ''}
        </Note>
      )}

      <h2 className="ex-section__title">Where this index has got to</h2>
      <dl className="ex-facts">
        <Fact label="Walked to (canonical head)">
          {status.indexedHeight === null ? (
            <span className="ex-absent">nothing walked on this chain yet</span>
          ) : (
            <Link className="cf-num" to={linkTo.block(status.chain, status.network, status.indexedHeight)}>
              {count(status.indexedHeight)}
            </Link>
          )}
        </Fact>
        <Fact label="Hash at that height">
          {status.indexedHash ? (
            <code className="cf-num ex-hex">{status.indexedHash}</code>
          ) : (
            <span className="ex-absent">—</span>
          )}
        </Fact>
        <Fact label="Tip a provider last claimed">
          {status.tipHeight === null ? (
            <span className="ex-absent">no tip has ever been observed</span>
          ) : (
            <span className="cf-num">{count(status.tipHeight)}</span>
          )}
        </Fact>
        <Fact label="Tip seen">
          {status.tipSeenAt ? (
            <>
              {timestamp(status.tipSeenAt)}
              {seen ? <span className="ex-dim"> · {seen}</span> : null}
            </>
          ) : (
            <span className="ex-absent">never</span>
          )}
        </Fact>
        <Fact label="Behind the claimed tip by">
          {status.lagBlocks === null ? (
            <span className="ex-absent">unknown — no tip has ever been observed</span>
          ) : (
            <span className="cf-num">{count(status.lagBlocks)} blocks</span>
          )}
        </Fact>
      </dl>
      <Note>
        Those two heights are different questions. The first is what this service has actually
        walked; the second is what a provider said. A confirmation count taken against the second —
        which is what a block or a transaction record on this explorer carries — can be larger than
        the number of blocks anybody here has looked at, by exactly the lag above
        (<code className="cf-num">indexer/src/reads.ts:24-27</code>).
      </Note>

      <h2 className="ex-section__title">What this chain calls confirmed</h2>
      <dl className="ex-facts">
        <Fact label="Confirmations required">
          <span className="cf-num">{count(status.requiredConfirmations)}</span>
        </Fact>
        <Fact label="Reorg alarm depth">
          <span className="cf-num">{count(status.reorgAlarmDepth)}</span>
        </Fact>
        <Fact label="Family">{status.family}</Fact>
        <Fact label="Asset">{status.asset}</Fact>
        <Fact label="Declared chain id">
          {status.chainId === null ? (
            <span className="ex-absent">this family publishes none</span>
          ) : (
            <span className="cf-num">{count(status.chainId)}</span>
          )}
        </Fact>
      </dl>
      <Note>
        Both numbers come from <code className="cf-num">@cloudsforge/contracts-chain</code> and
        travel with the answer rather than being held by any consumer — the package is exact-pinned
        precisely because four services disagreeing about a depth is money credited at the wrong one
        (<code className="cf-num">indexer/src/chains.ts:1-10</code>).
      </Note>

      <h2 className="ex-section__title">Providers</h2>
      {status.providers.length === 0 ? (
        <p className="ex-absent">
          No provider health has been recorded for this scope. A configured chain with no provider
          is a service that reports healthy and indexes nothing, which this estate treats as a
          configuration error (<code className="cf-num">indexer/src/env.ts:18-21</code>).
        </p>
      ) : (
        <div className="ex-tablewrap">
          <table className="ex-table">
            <thead>
              <tr>
                <th scope="col">Provider</th>
                <th scope="col">State</th>
                <th scope="col">Latency</th>
                <th scope="col">Failures</th>
                <th scope="col">Last OK</th>
                <th scope="col">Last error</th>
              </tr>
            </thead>
            <tbody>
              {status.providers.map((p) => (
                <tr key={`${p.provider}-${p.host}`}>
                  <th scope="row">
                    {p.provider}
                    <span className="ex-dim"> · {p.host}</span>
                  </th>
                  <td>
                    <StateBadge tone={providerTone(p.state)} />
                  </td>
                  <td className="cf-num">{p.latencyMs === null ? '—' : `${count(p.latencyMs)} ms`}</td>
                  <td className="cf-num">
                    {count(p.totalFailures)} of {count(p.totalRequests)}
                    {p.consecutiveFailures > 0 ? ` · ${count(p.consecutiveFailures)} in a row` : ''}
                  </td>
                  <td>{p.lastOkAt ? timestamp(p.lastOkAt) : <span className="ex-absent">never</span>}</td>
                  <td>
                    {p.lastError ?? <span className="ex-absent">—</span>}
                    {p.rateLimitedUntil && (
                      <span className="ex-dim"> · rate limited until {timestamp(p.rateLimitedUntil)}</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <h2 className="ex-section__title">Reorgs this index has recorded</h2>
      {status.recentReorgs.length === 0 ? (
        <p className="ex-absent">
          None recorded. That is not a claim that none happened — it is the five most recent this
          service has detected (<code className="cf-num">indexer/src/reads.ts:299</code>), and a
          service that has walked nothing has detected nothing.
        </p>
      ) : (
        <div className="ex-tablewrap">
          <table className="ex-table">
            <thead>
              <tr>
                <th scope="col">Detected</th>
                <th scope="col">Depth</th>
                <th scope="col">Common ancestor</th>
                <th scope="col">Retracted</th>
                <th scope="col">Alarming</th>
              </tr>
            </thead>
            <tbody>
              {status.recentReorgs.map((r) => (
                <tr key={r.id}>
                  <th scope="row">{timestamp(r.detectedAt)}</th>
                  <td className="cf-num">{count(r.depth)}</td>
                  <td>
                    <Link
                      className="cf-num"
                      to={linkTo.block(status.chain, status.network, r.commonAncestorHeight)}
                    >
                      {count(r.commonAncestorHeight)}
                    </Link>
                  </td>
                  <td className="cf-num">
                    {count(r.orphanedBlocks)} blocks · {count(r.orphanedTransactions)} transactions ·{' '}
                    {count(r.orphanedActivity)} movements
                  </td>
                  <td>
                    {r.alarming ? (
                      <StateBadge
                        tone={{
                          word: 'Alarming',
                          glyph: '⊘',
                          tone: 'bad',
                          meaning: 'Past the alarm depth: this service stopped vouching for the chain',
                        }}
                      />
                    ) : (
                      <StateBadge
                        tone={{
                          word: 'Recorded',
                          glyph: '·',
                          tone: 'idle',
                          meaning: 'Within the alarm depth: recorded, and the chain kept following',
                        }}
                      />
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Note>
        A reorg retracts blocks, transactions and movements together, in one statement
        (<code className="cf-num">indexer/src/reads.ts:28-30</code>), so a read taken during one
        sees all of it or none of it. That is why the counts above move as a set.
      </Note>
    </div>
  )
}
