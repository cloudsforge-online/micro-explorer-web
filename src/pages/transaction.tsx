/**
 * One transaction, read TWICE — and the two answers are not interchangeable.
 *
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 * WHY THIS PAGE MAKES TWO CALLS FOR ONE THING
 *
 *   `GET /v1/transactions/:chain/:network/:hash`               `indexer/src/server.ts`
 *   `GET /v1/transactions/:chain/:network/:hash/confirmations`  `indexer/src/server.ts`
 *
 * `indexer/src/reads.ts` draws the line and this page is built on it. The first is a
 * RECORD — what the chain said — and its `confirmations` are counted against `checkpoint.tipHeight`
 * (`indexer/src/reads.ts`), a provider's claim. The second is a DECISION INPUT, its
 * `confirmations` are counted against `record.headHeight` (`indexer/src/reads.ts`) — the
 * highest block this service has actually walked — and `confirmed` is true only when the
 * transaction succeeded, is canonical, has reached the published depth, and the chain is not
 * halted (`indexer/src/reads.ts`).
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
 * (`indexer/src/server.ts`). A caller separates them **by the error CODE, never by the
 * status** — a path the service does not serve answers `not_found`, an unrun chain answers
 * `unknown_chain` — which is exactly what the branches below do.
 *
 * ── A reverted transaction gathers depth like any other ───────────────────────────────────────
 *
 * `indexer/src/reads.ts`: "An EVM transaction that reverted is mined, sits in a block, and
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
    'The chain index is not answering.',
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
    'The chain index is not answering.',
    [scope?.chain, scope?.network, hash],
  )

  if (!scope) return <UnknownScope chain={params['chain']} network={params['network']} />

  if (record.state === 'loading') return <Loading label="Fetching the transaction" />
  if (record.error) {
    if (record.error.code === 'unknown_chain' || record.error.code === 'unknown_network') {
      return <UnknownScope chain={params['chain']} network={params['network']} />
    }
    if (record.error.code === 'bad_hash') {
      return (
        <Missing
          title="That is not shaped like a hash on this chain"
          hint="Ember and the other EVM chains write a hash as 0x and 64 hex characters. Other chain families get a length check and nothing more: nothing here can properly validate their formats, and a half-right check would turn away perfectly good hashes."
          notice={record.error}
        />
      )
    }
    if (record.error.status === 404) {
      return (
        <Missing
          title="No record of that transaction here"
          hint={
            'This says what CloudsForge holds, not what the chain holds. One that this service ' +
            'has yet to reach, one on a chain it does not follow, and one that was never ' +
            'broadcast at all are indistinguishable from where you are standing. The chain page ' +
            'shows how far the reading has got, which narrows it down.'
          }
          notice={record.error}
        />
      )
    }
    return <Failed notice={record.error} onRetry={record.reload} />
  }
  const tx = record.data
  if (!tx) return <Loading label="Fetching the transaction" />

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
      <h2 className="ex-section__title">Is it deep enough to act on?</h2>
      <Verdict verdict={verdict} chain={tx.chain} network={tx.network} />

      <DepthNote>
The depth above is measured from the highest block this service has read for itself
        (<code className="cf-num">indexer/src/reads.ts</code>); the one further down is
        measured from a provider's report of where the chain ends
        (<code className="cf-num">indexer/src/reads.ts</code>). Where they part company, the
        first is the smaller figure and the one to trust.
      </DepthNote>

      <h2 className="ex-section__title">What the chain recorded</h2>
      <dl className="ex-facts">
        <Fact label="Outcome">
          <StateBadge tone={tone} />
        </Fact>
        <Fact label="Depth, from the provider&rsquo;s tip">
          <Depth confirmations={tx.confirmations} head={CONFIRMATIONS_AGAINST.transaction} />
        </Fact>
        <Fact label="Block">
          {tx.blockHeight === null ? (
            <span className="ex-absent">not in a block yet</span>
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
            <span className="ex-absent">nobody — this either creates a contract or has no recipient by design</span>
          )}
        </Fact>
        <Fact label="Value (smallest units)">
          <span className="cf-num">{units(tx.value)}</span>
        </Fact>
        <Fact label="Fee (smallest units)">
          <span className="cf-num">{units(tx.fee)}</span>
        </Fact>
        <Fact label="Sender&rsquo;s counter, or nonce">
          {tx.nonceOrSequence === null ? (
            <span className="ex-absent">chains of this kind keep no such counter</span>
          ) : (
            <span className="cf-num">{count(tx.nonceOrSequence)}</span>
          )}
        </Fact>
        <Fact label="First noticed here">{timestamp(tx.firstSeenAt)}</Fact>
        <Fact label="URN">
          <code className="cf-num ex-hex">{tx.txUrn}</code>
        </Fact>
      </dl>
      <Note>
Amounts stay in the chain's smallest unit and are never divided on this page. They travel as
        text rather than as numbers, because JSON cannot carry an integer that large: past roughly
        nine whole coins, an eighteen-decimal amount starts losing its last digits
        (<code className="cf-num">indexer/src/reads.ts</code>).
      </Note>

      {tx.explorerUrl && (
        <p className="ex-page__lede">
An explorer run by somebody else covers this chain too, and has its own page for this
          transaction:{' '}
          <a href={tx.explorerUrl} rel="noreferrer noopener" target="_blank">
            {tx.explorerUrl}
          </a>
. It is put here on purpose: a fact recorded on a public chain is worth
          having precisely because you can check it somewhere other than with us.
        </p>
      )}

      <h2 className="ex-section__title">Logs ({count(tx.logs.length)})</h2>
      {tx.logs.length === 0 ? (
        <p className="ex-absent">
No logs stored for this one. Chains outside the EVM family do not produce them at all.
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
Topics and data are printed exactly as they came off the chain. Turning them into readable
        names needs a contract's interface description, and nothing in this estate keeps a register
        of those, so nothing here is decoded. A guess dressed up as a translation would be worse than
        the hex.
      </Note>
    </div>
  )
}

/**
 * The verdict panel.
 *
 * Its own component so the four inputs `confirmed` was computed from are rendered in one place, in
 * the order the service evaluates them (`indexer/src/reads.ts`). A verdict of false with no
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
  if (verdict.state === 'loading') return <Loading label="Working out how deep it is" />

  if (verdict.error) {
    // THE SPLIT. `transaction_not_found` is a fact about the chain index; a bare `not_found` is the
    // router saying this bundle asked for a path it does not serve. Same status, opposite meanings.
    if (verdict.error.code === 'transaction_not_found') {
      return (
        <Missing
          title="No record of that transaction here"
          hint="Which is a different thing from not yet deep enough. With no record, there is nothing to measure a depth against, so none is offered — reporting nought would be a claim about the chain that nobody here is in a position to make."
          notice={verdict.error}
        />
      )
    }
    if (verdict.error.status === 404) {
      return <Missing title="No answer came back" hint="" notice={verdict.error} />
    }
    return <Failed notice={verdict.error} onRetry={verdict.reload} />
  }

  const v = verdict.data
  if (!v) return <Loading label="Working out how deep it is" />

  const reasons: string[] = []
  if (!v.canonical) reasons.push('the block holding it is no longer part of the accepted chain')
  if (v.status !== 'success') reasons.push(`it did not succeed on chain — the outcome was "${v.status}"`)
  if (v.halted) reasons.push('a rewrite past the alarm threshold stopped this service standing behind the chain')
  if (v.confirmations === null) reasons.push('there is nothing honest to measure a depth against')
  else if (v.confirmations < v.requiredConfirmations) {
    reasons.push(
      `it sits ${v.confirmations} blocks deep, and this chain is credited at ${v.requiredConfirmations}`,
    )
  }

  return (
    <div className={`ex-verdict ex-verdict--${v.confirmed ? 'yes' : 'no'}`}>
      <p className="ex-verdict__answer">
        <span className="ex-verdict__glyph" aria-hidden="true">
          {v.confirmed ? '●' : '○'}
        </span>
        {v.confirmed
          ? 'Yes. It is as deep as this chain asks for, in a block this service has read itself.'
          : 'Not yet, by the depth this chain asks for.'}
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
        <Fact label="Still on the accepted chain">{v.canonical ? 'yes' : 'no'}</Fact>
        <Fact label="Reading of this chain stopped">{v.halted ? 'yes' : 'no'}</Fact>
        <Fact label="Measured from block">
          {v.indexedHeight === null ? (
            <span className="ex-absent">none read</span>
          ) : (
            <Link className="cf-num" to={linkTo.block(chain, network, v.indexedHeight)}>
              {count(v.indexedHeight)}
            </Link>
          )}
        </Fact>
        <Fact label="Top of the chain, per the provider">
          {v.tipHeight === null ? (
            <span className="ex-absent">none reported</span>
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
Passing that depth is as much as this service will ever say for a transaction, and it stays a
        statement about how unlikely a reversal has become rather than a proof that one cannot
        happen.
      </p>
    </div>
  )
}
