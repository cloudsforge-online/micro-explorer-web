/**
 * One address: what moved, and what this index is willing to say it holds.
 *
 *   `GET /v1/addresses/:chain/:network/:address/activity`        `indexer/src/server.ts:155` (:396)
 *   `GET /v1/addresses/:chain/:network/:address/token-balances`  `indexer/src/server.ts:156` (:463)
 *
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 * A BALANCE IS WITHHELD RATHER THAN GUESSED, AND THE REASON IS ALWAYS SHOWN.
 *
 * `balances` and `balance` are ABSENT — not zero, not null — whenever the canonical chain this
 * service holds does not run unbroken from genesis to the height asked for
 * (`indexer/src/reads.ts:225-259`). The field that replaces them is `unavailable`, naming which of
 * four reasons applied. The service's own words: "an indexer that started following at the tip
 * knows nothing about what anybody held", and "a missing balance is missing, never zero, because
 * zero is what evicts a token-gated member" (`indexer/src/server.ts:460-461`).
 *
 * So this page renders the reason as a sentence and prints no number at all. A dash would be
 * kinder to the layout and would lose the only thing worth knowing.
 *
 * ── An orphaned movement is shown, and shown as orphaned ──────────────────────────────────────
 *
 * `activity` returns retracted rows with `status: 'orphaned'` and `confirmations: null`
 * (`indexer/src/reads.ts:353-356`). Hiding them would make a reorg invisible on the one page where
 * somebody is looking for their money; showing them unlabelled would be worse. They are listed,
 * badged, and their depth column says there is none to count.
 *
 * ── The depth column is against the CLAIMED TIP ───────────────────────────────────────────────
 *
 * `indexer/src/reads.ts:353-356` counts against `checkpoint.tipHeight` (`:345`), not the walked
 * head. Labelled accordingly. The `confirmed` boolean the service computes from it
 * (`indexer/src/reads.ts:381-382`) inherits that, so this page shows the depth and does not repeat
 * the boolean as a verdict — the transaction's own confirmations route is where a verdict lives.
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 */
import { useCallback, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Empty, Failed, Loading, Missing } from '../components/states.tsx'
import { Depth, DepthNote, Fact, Note, StateBadge } from '../components/tone.tsx'
import { activityTone, count, timestamp, units, unavailableReason } from '../lib/format.ts'
import {
  CONFIRMATIONS_AGAINST,
  getAddressActivity,
  getTokenBalances,
  type ActivityPage,
  type TokenBalancesView,
} from '../lib/indexer.ts'
import { useResource } from '../lib/resource.ts'
import { linkTo } from '../lib/routes.ts'
import { parseScope } from '../lib/scope.ts'
import { UnknownScope } from './unknown-scope.tsx'

export function AddressPage() {
  const params = useParams()
  const scope = parseScope(params['chain'], params['network'])
  const address = params['address'] ?? ''
  // The cursor is state rather than a URL parameter on purpose: it is an opaque token this app
  // must not construct, and putting it in an address would invite somebody to edit one.
  const [cursor, setCursor] = useState<string | null>(null)

  const loadActivity = useCallback(
    (signal: AbortSignal) => {
      if (!scope) return Promise.reject(new Error('no scope'))
      return getAddressActivity(scope, address, { limit: 50, cursor }, signal)
    },
    [scope?.chain, scope?.network, address, cursor],
  )
  const activity = useResource<ActivityPage>(
    loadActivity,
    (page) => page.items.length,
    'The chain index could not be reached.',
    [scope?.chain, scope?.network, address, cursor],
  )

  const loadHoldings = useCallback(
    (signal: AbortSignal) => {
      if (!scope) return Promise.reject(new Error('no scope'))
      return getTokenBalances(scope, address, {}, signal)
    },
    [scope?.chain, scope?.network, address],
  )
  const holdings = useResource<TokenBalancesView>(
    loadHoldings,
    () => 1,
    'The chain index could not be reached.',
    [scope?.chain, scope?.network, address],
  )

  if (!scope) return <UnknownScope chain={params['chain']} network={params['network']} />

  return (
    <div className="ex-page">
      <header className="ex-page__head">
        <h1 className="ex-page__title">Address</h1>
        <p className="ex-page__id">
          <Link className="cf-num" to={linkTo.chain(scope.chain, scope.network)}>
            {scope.chain}/{scope.network}
          </Link>
        </p>
      </header>
      <p className="ex-page__hash">
        <code className="cf-num ex-hex">{address}</code>
      </p>
      <p className="ex-page__lede">
        If this address is a contract,{' '}
        <Link to={linkTo.token(scope.chain, scope.network, address)}>
          read its supply and authorities
        </Link>{' '}
        instead.
      </p>

      <h2 className="ex-section__title">Token holdings</h2>
      <Holdings holdings={holdings} />

      <h2 className="ex-section__title">Movements</h2>
      <DepthNote>
        Every depth in this table is counted against the tip a provider last claimed
        (<code className="cf-num">indexer/src/reads.ts:353-356</code>), not against the highest
        block this index has walked. The{' '}
        <Link to={linkTo.chain(scope.chain, scope.network)}>chain page</Link> shows the gap between
        the two.
      </DepthNote>
      <Activity
        activity={activity}
        onCursor={setCursor}
        cursor={cursor}
      />
    </div>
  )
}

function Holdings({ holdings }: { holdings: ReturnType<typeof useResource<TokenBalancesView>> }) {
  if (holdings.state === 'loading') return <Loading label="Reading holdings" />
  if (holdings.error) {
    if (holdings.error.code === 'bad_address') {
      return (
        <Missing
          title="That is not an address for this chain"
          hint="On Ember and the EVM chains an address is 0x followed by 40 hex characters. Bitcoin, Solana and XRP addresses are checked for a plausible length only, because the validator that would check them properly does not exist in this estate yet."
          notice={holdings.error}
        />
      )
    }
    return <Failed notice={holdings.error} onRetry={holdings.reload} />
  }
  const h = holdings.data
  if (!h) return <Loading label="Reading holdings" />

  // ── THE WITHHELD CASE. No number, and the reason as a sentence. ─────────────────────────────
  if (h.unavailable) {
    return (
      <div className="ex-withheld" role="status">
        <p className="ex-withheld__title">
          <span aria-hidden="true">⊘</span> This index will not state a balance for this address.
        </p>
        <p className="ex-withheld__why">{unavailableReason(h.unavailable)}</p>
        <dl className="ex-facts ex-facts--tight">
          <Fact label="Reason code">
            <code className="cf-num ex-code">{h.unavailable}</code>
          </Fact>
          <Fact label="Coverage held">
            {h.coverage.fromHeight === null || h.coverage.toHeight === null ? (
              <span className="ex-absent">none</span>
            ) : (
              <span className="cf-num">
                {count(h.coverage.fromHeight)} – {count(h.coverage.toHeight)} ·{' '}
                {count(h.coverage.blocks)} blocks
              </span>
            )}
          </Fact>
          <Fact label="Walked head">
            {h.indexedHeight === null ? (
              <span className="ex-absent">nothing walked</span>
            ) : (
              <span className="cf-num">{count(h.indexedHeight)}</span>
            )}
          </Fact>
        </dl>
        <p className="ex-withheld__note">
          Withheld, not zero. A balance derived from movements is only a balance if the movements
          are all of them, so an incomplete record produces no number at all rather than a plausible
          one (<code className="cf-num">indexer/src/reads.ts:225-234</code>).
        </p>
      </div>
    )
  }

  const balances = h.balances ?? []
  return (
    <>
      <dl className="ex-facts ex-facts--tight">
        <Fact label="As at block">
          <span className="cf-num">{count(h.atBlock)}</span>
        </Fact>
        <Fact label="Coverage">
          <span className="cf-num">
            {count(h.coverage.fromHeight)} – {count(h.coverage.toHeight)} ·{' '}
            {count(h.coverage.blocks)} blocks
          </span>
          <span className="ex-dim"> · unbroken from genesis</span>
        </Fact>
      </dl>
      {balances.length === 0 ? (
        <p className="ex-absent">
          This address holds none of the tokens this index has seen move — and here that IS a
          balance of zero rather than an absence, because the coverage runs unbroken from the
          genesis block (<code className="cf-num">indexer/src/reads.ts:546-548</code>).
        </p>
      ) : (
        <div className="ex-tablewrap">
          <table className="ex-table">
            <thead>
              <tr>
                <th scope="col">Contract</th>
                <th scope="col">Balance (smallest units)</th>
              </tr>
            </thead>
            <tbody>
              {balances.map((b) => (
                <tr key={b.contract}>
                  <th scope="row">
                    <Link
                      className="cf-num ex-hex"
                      to={linkTo.token(h.chain, h.network, b.contract)}
                    >
                      {b.contract}
                    </Link>
                  </th>
                  <td className="cf-num">{units(b.balance)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Note>
        These are raw units. This index does not know a token&rsquo;s decimals — that is a call to
        the contract and a fact a token registry would own — so it declines to scale them rather
        than assuming eighteen, "which is how a six-decimal stablecoin gets displayed a million
        times too small" (<code className="cf-num">indexer/src/reads.ts:365-372</code>).
      </Note>
    </>
  )
}

function Activity({
  activity,
  onCursor,
  cursor,
}: {
  activity: ReturnType<typeof useResource<ActivityPage>>
  onCursor: (cursor: string | null) => void
  cursor: string | null
}) {
  if (activity.state === 'loading') return <Loading label="Reading movements" />
  if (activity.error) {
    if (activity.error.code === 'bad_address') {
      return (
        <Missing
          title="That is not an address for this chain"
          hint="On Ember and the EVM chains an address is 0x followed by 40 hex characters."
          notice={activity.error}
        />
      )
    }
    return <Failed notice={activity.error} onRetry={activity.reload} />
  }
  const page = activity.data
  if (!page) return <Loading label="Reading movements" />

  if (activity.state === 'empty') {
    return (
      <Empty
        title="No movement recorded for this address"
        hint="That is a statement about what this index has walked, not about the chain. An index that started following at the tip has never seen anything that happened before it."
        {...(cursor
          ? {
              action: (
                <button type="button" className="cf-btn" onClick={() => onCursor(null)}>
                  Back to the first page
                </button>
              ),
            }
          : {})}
      />
    )
  }

  return (
    <>
      <div className="ex-tablewrap">
        <table className="ex-table">
          <thead>
            <tr>
              <th scope="col">Direction</th>
              <th scope="col">Amount</th>
              <th scope="col">Asset</th>
              <th scope="col">Block</th>
              <th scope="col">Depth (vs claimed tip)</th>
              <th scope="col">On chain</th>
              <th scope="col">Transaction</th>
              <th scope="col">First seen</th>
            </tr>
          </thead>
          <tbody>
            {page.items.map((item) => (
              <tr key={item.id} className={item.status === 'orphaned' ? 'is-orphaned' : undefined}>
                <th scope="row">{item.direction === 'in' ? 'received' : 'sent'}</th>
                <td className="cf-num">
                  {/* The service formats the native asset and refuses to format a token's. Both
                      answers are rendered as given; nothing here divides. */}
                  {item.amountFormatted ?? units(item.amount)}
                  {item.amountFormatted === null && <span className="ex-dim"> raw units</span>}
                </td>
                <td>
                  {item.assetCode}
                  {item.tokenAddress && (
                    <>
                      {' '}
                      <Link
                        className="cf-num ex-hex"
                        to={linkTo.token(page.chain, page.network, item.tokenAddress)}
                        title={item.tokenAddress}
                      >
                        {item.tokenAddress.slice(0, 10)}…
                      </Link>
                    </>
                  )}
                </td>
                <td>
                  <Link className="cf-num" to={linkTo.block(page.chain, page.network, item.blockHeight)}>
                    {count(item.blockHeight)}
                  </Link>
                </td>
                <td>
                  <Depth
                    confirmations={item.confirmations}
                    required={page.requiredConfirmations}
                    head={CONFIRMATIONS_AGAINST.activity}
                  />
                </td>
                <td>
                  <StateBadge tone={activityTone(item.status)} />
                </td>
                <td>
                  <Link
                    className="cf-num ex-hex"
                    to={linkTo.transaction(page.chain, page.network, item.txHash)}
                    title={item.txHash}
                  >
                    {item.txHash.slice(0, 10)}…
                  </Link>
                </td>
                <td>{timestamp(item.firstSeenAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <nav className="ex-stepper" aria-label="Pages">
        {cursor && (
          <button type="button" className="cf-btn" onClick={() => onCursor(null)}>
            ← First page
          </button>
        )}
        {page.nextCursor && (
          <button type="button" className="cf-btn" onClick={() => onCursor(page.nextCursor)}>
            Older →
          </button>
        )}
      </nav>
      <Note>
        An orphaned movement is one a reorg retracted. It is listed rather than hidden, because a
        page that quietly dropped it would make a reorg invisible on the one screen where somebody
        is looking for their money — and it carries no depth, because there is none honest to count.
      </Note>
    </>
  )
}
