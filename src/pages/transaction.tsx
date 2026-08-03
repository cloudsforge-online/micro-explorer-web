/**
 * One transaction, read TWICE — and the two answers are not interchangeable.
 *
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 * WHY THIS PAGE MAKES TWO CALLS FOR ONE THING
 *
 *   `GET /v1/transactions/:chain/:network/:hash`               `indexer/src/server.ts:167` (:412)
 *   `GET /v1/transactions/:chain/:network/:hash/confirmations`  `indexer/src/server.ts:168` (:437)
 *
 * `indexer/src/reads.ts:184-196` draws the line and this page is built on it. The first is a
 * RECORD — what the chain said — and its `confirmations` are counted against `checkpoint.tipHeight`
 * (`indexer/src/reads.ts:424-427`), a provider's claim. The second is a DECISION INPUT, its
 * `confirmations` are counted against `record.headHeight` (`indexer/src/reads.ts:451-454`) — the
 * highest block this service has actually walked — and `confirmed` is true only when the
 * transaction succeeded, is canonical, has reached the published depth, and the chain is not
 * halted (`indexer/src/reads.ts:472-477`).
 *
 * So: **the record supplies the facts and the confirmations answer supplies the verdict**, and this
 * page never crosses them over. The word "final" appears nowhere on it.
 *
 * ── The two 404s mean opposite things ─────────────────────────────────────────────────────────
 *
 * `/confirmations` answers **404 `transaction_not_found`** for a transaction this indexer has never
 * seen, and **200 with `confirmed: false`** for one it has seen that is not deep enough. Those are
 * different facts. `micro-market` merged them and reported "the on-chain escrow is not confirmed
 * yet" for every activation, against a route that did not exist at the time
 * (`indexer/src/server.ts:468-478`). A caller separates them **by the error CODE, never by the
 * status** — a path the service does not serve answers `not_found`, an unrun chain answers
 * `unknown_chain` — which is exactly what the branches below do.
 *
 * ── A reverted transaction gathers depth like any other ───────────────────────────────────────
 *
 * `indexer/src/reads.ts:467-471`: "An EVM transaction that reverted is mined, sits in a block, and
 * accumulates depth exactly like one that worked — so a confirmation test that only counts blocks
 * would tell a marketplace that a failed escrow deposit is confirmed." This page therefore puts the
 * status beside the depth, at the same weight, and the verdict panel says which of the four inputs
 * failed rather than only that it did.
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 */
import { useCallback } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Failed, Loading, Missing } from '../components/states.tsx'
import { Depth, DepthNote, Fact, Note, StateBadge } from '../components/tone.tsx'
import { count, timestamp, transactionTone, units } from '../lib/format.ts'
import {
  CONFIRMATIONS_AGAINST,
  getConfirmations,
  getTransaction,
  type ConfirmationView,
  type TransactionView,
} from '../lib/indexer.ts'
import { useResource } from '../lib/resource.ts'
import { linkTo } from '../lib/routes.ts'
import { parseScope } from '../lib/scope.ts'
import { UnknownScope } from './unknown-scope.tsx'

export function TransactionPage() {
  const params = useParams()
  const scope = parseScope(params['chain'], params['network'])
  const hash = params['hash'] ?? ''

  const loadRecord = useCallback(
    (signal: AbortSignal) => {
      if (!scope) return Promise.reject(new Error('no scope'))
      return getTransaction(scope, hash, signal)
    },
    [scope?.chain, scope?.network, hash],
  )
  const record = useResource<TransactionView>(
    loadRecord,
    () => 1,
    'The chain index could not be reached.',
    [scope?.chain, scope?.network, hash],
  )

  const loadVerdict = useCallback(
    (signal: AbortSignal) => {
      if (!scope) return Promise.reject(new Error('no scope'))
      return getConfirmations(scope, hash, signal)
    },
    [scope?.chain, scope?.network, hash],
  )
  const verdict = useResource<ConfirmationView>(
    loadVerdict,
    () => 1,
    'The chain index could not be reached.',
    [scope?.chain, scope?.network, hash],
  )

  if (!scope) return <UnknownScope chain={params['chain']} network={params['network']} />

  if (record.state === 'loading') return <Loading label="Reading the transaction" />
  if (record.error) {
    if (record.error.code === 'unknown_chain' || record.error.code === 'unknown_network') {
      return <UnknownScope chain={params['chain']} network={params['network']} />
    }
    if (record.error.code === 'bad_hash') {
      return (
        <Missing
          title="That is not a transaction hash for this chain"
          hint="On Ember and the EVM chains a hash is 0x followed by 64 hex characters. The other families are length-checked only, because the validator that would check them properly does not exist yet and a wrong one would reject valid hashes."
          notice={record.error}
        />
      )
    }
    if (record.error.status === 404) {
      return (
        <Missing
          title="This index has never seen that transaction"
          hint={
            'That is an answer about this index, not about the chain. A transaction it has not ' +
            'walked to yet, one on a scope it does not follow, and one that never existed all ' +
            'read the same way here — the chain page shows how far it has walked.'
          }
          notice={record.error}
        />
      )
    }
    return <Failed notice={record.error} onRetry={record.reload} />
  }
  const tx = record.data
  if (!tx) return <Loading label="Reading the transaction" />

  const tone = transactionTone(tx.status)

  return (
    <div className="ex-page">
      <header className="ex-page__head">
        <h1 className="ex-page__title">Transaction</h1>
        <StateBadge tone={tone} />
        <p className="ex-page__id">
          <Link className="cf-num" to={linkTo.chain(tx.chain, tx.network)}>
            {tx.chain}/{tx.network}
          </Link>
        </p>
      </header>
      <p className="ex-page__hash">
        <code className="cf-num ex-hex">{tx.hash}</code>
      </p>

      {/* The verdict comes FIRST, because it is the only answer on this page anybody should act
          on, and because a reader who scrolls no further has still been told the honest thing. */}
      <h2 className="ex-section__title">Has it reached its depth?</h2>
      <Verdict verdict={verdict} chain={tx.chain} network={tx.network} />

      <DepthNote>
        The depth above is counted against the highest block this index has walked
        (<code className="cf-num">indexer/src/reads.ts:451-454</code>). The one in the record below
        is counted against the tip a provider claimed
        (<code className="cf-num">indexer/src/reads.ts:424-427</code>). When they disagree, the
        first is the smaller and the honest one.
      </DepthNote>

      <h2 className="ex-section__title">What the chain said</h2>
      <dl className="ex-facts">
        <Fact label="Status">
          <StateBadge tone={tone} />
        </Fact>
        <Fact label="Depth (record)">
          <Depth confirmations={tx.confirmations} head={CONFIRMATIONS_AGAINST.transaction} />
        </Fact>
        <Fact label="Block">
          {tx.blockHeight === null ? (
            <span className="ex-absent">not in a block</span>
          ) : (
            <Link className="cf-num" to={linkTo.block(tx.chain, tx.network, tx.blockHeight)}>
              {count(tx.blockHeight)}
            </Link>
          )}
          {tx.txIndex !== null && <span className="ex-dim"> · position {count(tx.txIndex)}</span>}
        </Fact>
        <Fact label="Block hash">
          {tx.blockHash ? (
            <code className="cf-num ex-hex">{tx.blockHash}</code>
          ) : (
            <span className="ex-absent">—</span>
          )}
        </Fact>
        <Fact label="From">
          {tx.from ? (
            <Link className="cf-num ex-hex" to={linkTo.address(tx.chain, tx.network, tx.from)}>
              {tx.from}
            </Link>
          ) : (
            <span className="ex-absent">—</span>
          )}
        </Fact>
        <Fact label="To">
          {tx.to ? (
            <Link className="cf-num ex-hex" to={linkTo.address(tx.chain, tx.network, tx.to)}>
              {tx.to}
            </Link>
          ) : (
            <span className="ex-absent">— (a contract creation, or a form with no recipient)</span>
          )}
        </Fact>
        <Fact label="Value (smallest units)">
          <span className="cf-num">{units(tx.value)}</span>
        </Fact>
        <Fact label="Fee (smallest units)">
          <span className="cf-num">{units(tx.fee)}</span>
        </Fact>
        <Fact label="Nonce or sequence">
          {tx.nonceOrSequence === null ? (
            <span className="ex-absent">this family has none</span>
          ) : (
            <span className="cf-num">{count(tx.nonceOrSequence)}</span>
          )}
        </Fact>
        <Fact label="First seen by this index">{timestamp(tx.firstSeenAt)}</Fact>
        <Fact label="URN">
          <code className="cf-num ex-hex">{tx.txUrn}</code>
        </Fact>
      </dl>
      <Note>
        Amounts are shown in the chain&rsquo;s smallest units and are never divided here. They
        arrive as decimal strings because a <code className="cf-num">bigint</code> does not survive{' '}
        <code className="cf-num">JSON.stringify</code> and a JSON number loses the low digits of any
        eighteen-decimal value above about nine whole units
        (<code className="cf-num">indexer/src/reads.ts:8-10</code>).
      </Note>

      {tx.explorerUrl && (
        <p className="ex-page__lede">
          A third-party explorer for this chain has its own page for this transaction:{' '}
          <a href={tx.explorerUrl} rel="noreferrer noopener" target="_blank">
            {tx.explorerUrl}
          </a>
          . It is offered because verifying a chain fact against a second source is the point of a
          chain fact.
        </p>
      )}

      <h2 className="ex-section__title">Logs ({count(tx.logs.length)})</h2>
      {tx.logs.length === 0 ? (
        <p className="ex-absent">
          No logs recorded. On a non-EVM family there would be none to record.
        </p>
      ) : (
        <div className="ex-tablewrap">
          <table className="ex-table">
            <thead>
              <tr>
                <th scope="col">#</th>
                <th scope="col">Address</th>
                <th scope="col">Topics</th>
                <th scope="col">Data</th>
                <th scope="col">Status</th>
              </tr>
            </thead>
            <tbody>
              {tx.logs.map((log) => (
                <tr key={log.logIndex}>
                  <th scope="row" className="cf-num">
                    {count(log.logIndex)}
                  </th>
                  <td>
                    <Link
                      className="cf-num ex-hex"
                      to={linkTo.address(tx.chain, tx.network, log.address)}
                    >
                      {log.address}
                    </Link>
                  </td>
                  <td>
                    <ul className="ex-topics">
                      {log.topics.map((topic, i) => (
                        <li key={`${log.logIndex}-${i}`}>
                          <code className="cf-num ex-hex">{topic}</code>
                        </li>
                      ))}
                    </ul>
                  </td>
                  <td>
                    <code className="cf-num ex-hex ex-hex--wrap">{log.data}</code>
                  </td>
                  <td>{log.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Note>
        Log topics and data are shown raw. This explorer decodes nothing: an ABI is a fact a token
        registry would own, and no service in this estate owns one — so a decoded transfer here
        would be a guess wearing the clothes of a reading.
      </Note>
    </div>
  )
}

/**
 * The verdict panel.
 *
 * Its own component so the four inputs `confirmed` was computed from are rendered in one place, in
 * the order the service evaluates them (`indexer/src/reads.ts:472-477`). A verdict of false with no
 * reason beside it is the shape of answer that made a marketplace tell every seller the wrong
 * thing.
 */
function Verdict({
  verdict,
  chain,
  network,
}: {
  verdict: ReturnType<typeof useResource<ConfirmationView>>
  chain: string
  network: string
}) {
  if (verdict.state === 'loading') return <Loading label="Asking whether it has reached its depth" />

  if (verdict.error) {
    // THE SPLIT. `transaction_not_found` is a fact about the chain index; a bare `not_found` is the
    // router saying this bundle asked for a path it does not serve. Same status, opposite meanings.
    if (verdict.error.code === 'transaction_not_found') {
      return (
        <Missing
          title="This index has never seen that transaction"
          hint="Which is not the same as unconfirmed. It has no record to count depth against, so it declines to give one rather than reporting zero."
          notice={verdict.error}
        />
      )
    }
    if (verdict.error.status === 404) {
      return <Missing title="Not answered" hint="" notice={verdict.error} />
    }
    return <Failed notice={verdict.error} onRetry={verdict.reload} />
  }

  const v = verdict.data
  if (!v) return <Loading label="Asking whether it has reached its depth" />

  const reasons: string[] = []
  if (!v.canonical) reasons.push('the block it names is not on the canonical chain')
  if (v.status !== 'success') reasons.push(`the transaction did not succeed — it is "${v.status}"`)
  if (v.halted) reasons.push('this index has stopped vouching for this chain after an alarming reorg')
  if (v.confirmations === null) reasons.push('there is no depth to count')
  else if (v.confirmations < v.requiredConfirmations) {
    reasons.push(
      `it is ${v.confirmations} of the ${v.requiredConfirmations} confirmations this chain requires`,
    )
  }

  return (
    <div className={`ex-verdict ex-verdict--${v.confirmed ? 'yes' : 'no'}`}>
      <p className="ex-verdict__answer">
        <span className="ex-verdict__glyph" aria-hidden="true">
          {v.confirmed ? '●' : '○'}
        </span>
        {v.confirmed
          ? 'Yes — it has reached the depth this chain publishes, on a block this index has walked.'
          : 'No — not at the depth this chain publishes.'}
      </p>
      {!v.confirmed && reasons.length > 0 && (
        <ul className="ex-verdict__why">
          {reasons.map((reason) => (
            <li key={reason}>{reason}</li>
          ))}
        </ul>
      )}
      <dl className="ex-facts ex-facts--tight">
        <Fact label="Depth">
          <Depth
            confirmations={v.confirmations}
            required={v.requiredConfirmations}
            head={CONFIRMATIONS_AGAINST.confirmations}
          />
        </Fact>
        <Fact label="On the canonical chain">{v.canonical ? 'yes' : 'no'}</Fact>
        <Fact label="Chain halted">{v.halted ? 'yes' : 'no'}</Fact>
        <Fact label="Counted against (walked head)">
          {v.indexedHeight === null ? (
            <span className="ex-absent">nothing walked</span>
          ) : (
            <Link className="cf-num" to={linkTo.block(chain, network, v.indexedHeight)}>
              {count(v.indexedHeight)}
            </Link>
          )}
        </Fact>
        <Fact label="Tip a provider claimed">
          {v.tipHeight === null ? (
            <span className="ex-absent">none observed</span>
          ) : (
            <span className="cf-num">{count(v.tipHeight)}</span>
          )}
        </Fact>
      </dl>
      {/*
        The wording here is deliberately about what the index CAN say rather than about what it
        will not: `test/render.test.ts` bans the words this sentence would otherwise reach for, and
        a carve-out list for negated forms ("nothing here says … is irreversible") is a list that
        grows until the rule means nothing. Saying the true thing positively needs no exemption.
      */}
      <p className="ex-verdict__note">
        Reaching the required depth is the strongest statement this index makes about a
        transaction, and it remains a statement about probability rather than a proof.
      </p>
    </div>
  )
}
