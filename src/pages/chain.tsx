/**
 * One chain's state: how far this index has walked, how far behind it is, and every reorg it has
 * recorded.
 *
 * `GET /v1/chains/:chain/:network/status` — `indexer/src/server.ts`, handler `chainStatus`.
 *
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 * THE TWO HEIGHTS ARE RENDERED SIDE BY SIDE, ALWAYS, AND NEITHER IS CALLED "THE HEIGHT".
 *
 * `indexedHeight` is the highest canonical block this service has walked and would have detected a
 * reorg in. `tipHeight` is what a provider last claimed. `indexer/src/reads.ts` says the
 * difference in one sentence: "Counting against blocks nobody here has looked at over-reports
 * depth, and over-reporting depth credits early."
 *
 * This is the only page in the app that can show `lagBlocks`, which is exactly that difference
 * (`indexer/src/reads.ts`), and it is null rather than zero when no tip has ever been
 * observed — "a lag of zero would be a lie, not a default" (`indexer/src/reads.ts`).
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
    'The chain index is not answering.',
    [scope?.chain, scope?.network],
  )

  if (!scope) return <UnknownScope chain={params['chain']} network={params['network']} />

  if (resource.state === 'loading') return <Loading label={`Asking ${scopeLabel(scope)} where it stands`} />
  if (resource.error) {
    // `unknown_chain` and `unknown_network` are 404s that mean "this estate does not run that",
    // which is a fact rather than a fault (`indexer/src/server.ts`).
    if (resource.error.code === 'unknown_chain' || resource.error.code === 'unknown_network') {
      return <UnknownScope chain={params['chain']} network={params['network']} />
    }
    if (resource.error.status === 404) {
      return (
        <Missing
          title="Nothing here follows that chain"
          hint="The combination of chain and network in this address is not one this deployment reads."
          notice={resource.error}
        />
      )
    }
    return <Failed notice={resource.error} onRetry={resource.reload} />
  }
  const status = resource.data
  if (!status) return <Loading label={`Asking ${scopeLabel(scope)} where it stands`} />

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
          <strong>This service will no longer stand behind what it holds for this chain.</strong> A
          rewrite deeper than its alarm threshold of {count(status.reorgAlarmDepth)} blocks was
          detected. Rather than serve balances out of a history it can no longer defend, it turns
          those questions away
          (<code className="cf-num">indexer/src/reads.ts</code>).
          {status.haltReason ? ` The recorded reason: ${status.haltReason}` : ''}
        </Note>
      )}

      <h2 className="ex-section__title">How much of it has been read</h2>
      <dl className="ex-facts">
        <Fact label="Read up to (canonical head)">
          {status.indexedHeight === null ? (
            <span className="ex-absent">not a single block read on this chain</span>
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
        <Fact label="Top of the chain, per the provider">
          {status.tipHeight === null ? (
            <span className="ex-absent">no provider has ever reported one</span>
          ) : (
            <span className="cf-num">{count(status.tipHeight)}</span>
          )}
        </Fact>
        <Fact label="Last heard from a provider">
          {status.tipSeenAt ? (
            <>
              {timestamp(status.tipSeenAt)}
              {seen ? <span className="ex-dim"> · {seen}</span> : null}
            </>
          ) : (
            <span className="ex-absent">never</span>
          )}
        </Fact>
        <Fact label="Short of that by">
          {status.lagBlocks === null ? (
            <span className="ex-absent">unknowable — no provider has reported a top</span>
          ) : (
            <span className="cf-num">{count(status.lagBlocks)} blocks</span>
          )}
        </Fact>
      </dl>
      <Note>
The two heights answer different questions. One is what this service has read for itself; the
        other is a provider's report. Depths printed on a block, or in the body of a transaction, are
        taken from the provider's figure, so they can exceed the number of blocks examined here by
        precisely the shortfall above
        (<code className="cf-num">indexer/src/reads.ts</code>).
      </Note>

      <h2 className="ex-section__title">What counts as settled on this chain</h2>
      <dl className="ex-facts">
        <Fact label="Depth before CloudsForge credits">
          <span className="cf-num">{count(status.requiredConfirmations)}</span>
        </Fact>
        <Fact label="Rewrite depth that raises the alarm">
          <span className="cf-num">{count(status.reorgAlarmDepth)}</span>
        </Fact>
        <Fact label="Family">{status.family}</Fact>
        <Fact label="Asset">{status.asset}</Fact>
        <Fact label="Chain id">
          {status.chainId === null ? (
            <span className="ex-absent">chains of this kind do not have one</span>
          ) : (
            <span className="cf-num">{count(status.chainId)}</span>
          )}
        </Fact>
      </dl>
      <Note>
Those depths are published once, in <code className="cf-num">@cloudsforge/contracts-chain</code>,
        and ride along with every answer instead of being remembered separately by each service. The
        package version is pinned exactly, because four services holding four opinions about how deep
        is deep enough means somebody's money is credited on the wrong one
        (<code className="cf-num">indexer/src/chains.ts</code>).
      </Note>

      <h2 className="ex-section__title">Providers</h2>
      {status.providers.length === 0 ? (
        <p className="ex-absent">
Nothing has been recorded about any provider for this chain. A chain that is switched on with
          nowhere to read it from is a service that looks healthy and does no work, which CloudsForge
          treats as a misconfiguration rather than a state to live with
          (<code className="cf-num">indexer/src/env.ts</code>).
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

      <h2 className="ex-section__title">Rewrites of history, or reorgs, seen here</h2>
      {status.recentReorgs.length === 0 ? (
        <p className="ex-absent">
Nothing on file. Read that as the five most recent this service has spotted for itself
          (<code className="cf-num">indexer/src/reads.ts</code>) rather than as a statement that
          the chain has never been rewritten — a service that has read nothing has spotted nothing.
        </p>
      ) : (
        <div className="ex-tablewrap">
          <table className="ex-table">
            <thead>
              <tr>
                <th scope="col">Detected</th>
                <th scope="col">Depth</th>
                <th scope="col">Last block both agreed on</th>
                <th scope="col">Taken back</th>
                <th scope="col">Past the alarm</th>
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
                          meaning: 'Deeper than the alarm threshold, so this service stopped standing behind the chain',
                        }}
                      />
                    ) : (
                      <StateBadge
                        tone={{
                          word: 'Recorded',
                          glyph: '·',
                          tone: 'idle',
                          meaning: 'Shallower than the alarm threshold, so it was noted and the walk carried on',
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
A reorg is a chain rewriting its own recent history. When one happens, the blocks, the transactions in them and the balance movements
        they carried are withdrawn in a single database statement
        (<code className="cf-num">indexer/src/reads.ts</code>). Anyone reading mid-rewrite
        therefore sees the whole of it or none of it, which is why those three counts always move
        together.
      </Note>
    </div>
  )
}
