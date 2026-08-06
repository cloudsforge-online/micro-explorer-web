/**
 * One address: what moved, and what this index is willing to say it holds.
 *
 *   `GET /v1/addresses/:chain/:network/:address/activity`        `indexer/src/server.ts`
 *   `GET /v1/addresses/:chain/:network/:address/token-balances`  `indexer/src/server.ts`
 *
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 * A BALANCE IS WITHHELD RATHER THAN GUESSED, AND THE REASON IS ALWAYS SHOWN.
 *
 * `balances` and `balance` are ABSENT — not zero, not null — whenever the canonical chain this
 * service holds does not run unbroken from genesis to the height asked for
 * (`indexer/src/reads.ts`). The field that replaces them is `unavailable`, naming which of
 * four reasons applied. The service's own words: "an indexer that started following at the tip
 * knows nothing about what anybody held", and "a missing balance is missing, never zero, because
 * zero is what evicts a token-gated member" (`indexer/src/server.ts`).
 *
 * So this page renders the reason as a sentence and prints no number at all. A dash would be
 * kinder to the layout and would lose the only thing worth knowing.
 *
 * ── An orphaned movement is shown, and shown as orphaned ──────────────────────────────────────
 *
 * `activity` returns retracted rows with `status: 'orphaned'` and `confirmations: null`
 * (`indexer/src/reads.ts`). Hiding them would make a reorg invisible on the one page where
 * somebody is looking for their money; showing them unlabelled would be worse. They are listed,
 * badged, and their depth column says there is none to count.
 *
 * ── The depth column is against the CLAIMED TIP ───────────────────────────────────────────────
 *
 * `indexer/src/reads.ts` counts against `checkpoint.tipHeight`, not the walked
 * head. Labelled accordingly. The `confirmed` boolean the service computes from it
 * (`indexer/src/reads.ts`) inherits that, so this page shows the depth and does not repeat
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
    'The chain index is not answering.',
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
    'The chain index is not answering.',
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
        Everything this address has sent or received that the index has walked past, and what it
        holds in tokens. Where the address is a token contract rather than somebody&rsquo;s account,{' '}
        <Link to={linkTo.token(scope.chain, scope.network, address)}>
          ask the contract about its own supply and authorities
        </Link>{' '}
        instead.
      </p>

      <h2 className="ex-section__title">Tokens held</h2>
      <Holdings holdings={holdings} />

      <h2 className="ex-section__title">Money in and out</h2>
      <DepthNote>
Depths in this table are measured from the top of the chain as an upstream provider last
        reported it (<code className="cf-num">indexer/src/reads.ts</code>), not from the
        highest block read here. The{' '}
        <Link to={linkTo.chain(scope.chain, scope.network)}>chain page</Link> puts a number on the
        difference.
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
  if (holdings.state === 'loading') return <Loading label="Totting up token balances" />
  if (holdings.error) {
    if (holdings.error.code === 'bad_address') {
      return (
        <Missing
          title="That is not shaped like an address on this chain"
          hint="Ember and the other EVM chains write an address as 0x and 40 hex characters. Bitcoin, Solana and XRP get a length check and nothing more, because nothing in this estate can properly validate their formats and a half-right check would turn away good addresses."
          notice={holdings.error}
        />
      )
    }
    return <Failed notice={holdings.error} onRetry={holdings.reload} />
  }
  const h = holdings.data
  if (!h) return <Loading label="Totting up token balances" />

  // ── THE WITHHELD CASE. No number, and the reason as a sentence. ─────────────────────────────
  if (h.unavailable) {
    return (
      <div className="ex-withheld" role="status">
        <p className="ex-withheld__title">
          <span aria-hidden="true">⊘</span> No balance is being given for this address.
        </p>
        <p className="ex-withheld__why">{unavailableReason(h.unavailable)}</p>
        <dl className="ex-facts ex-facts--tight">
          <Fact label="Reason code">
            <code className="cf-num ex-code">{h.unavailable}</code>
          </Fact>
          <Fact label="History held">
            {h.coverage.fromHeight === null || h.coverage.toHeight === null ? (
              <span className="ex-absent">none</span>
            ) : (
              <span className="cf-num">
                {count(h.coverage.fromHeight)} – {count(h.coverage.toHeight)} ·{' '}
                {count(h.coverage.blocks)} blocks
              </span>
            )}
          </Fact>
          <Fact label="Read up to">
            {h.indexedHeight === null ? (
              <span className="ex-absent">no blocks read</span>
            ) : (
              <span className="cf-num">{count(h.indexedHeight)}</span>
            )}
          </Fact>
        </dl>
        <p className="ex-withheld__note">
Held back, which is not the same as nought. A balance built up from movements is only a
          balance when every movement is present, so a record with a hole in it yields no figure at
          all rather than a believable wrong one
          (<code className="cf-num">indexer/src/reads.ts</code>).
        </p>
      </div>
    )
  }

  const balances = h.balances ?? []
  return (
    <>
      <dl className="ex-facts ex-facts--tight">
        <Fact label="Correct as at block">
          <span className="cf-num">{count(h.atBlock)}</span>
        </Fact>
        <Fact label="History held">
          <span className="cf-num">
            {count(h.coverage.fromHeight)} – {count(h.coverage.toHeight)} ·{' '}
            {count(h.coverage.blocks)} blocks
          </span>
          <span className="ex-dim"> · continuous from the first block</span>
        </Fact>
      </dl>
      {balances.length === 0 ? (
        <p className="ex-absent">
This address holds none of the tokens seen moving on this chain. Here that genuinely means
          nought rather than unknown, because the record behind it runs without a break from the very
          first block (<code className="cf-num">indexer/src/reads.ts</code>).
        </p>
      ) : (
        <div className="ex-tablewrap">
          <table className="ex-table">
            <thead>
              <tr>
                <th scope="col">Contract</th>
                <th scope="col">Held, in the token&rsquo;s smallest unit</th>
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
Undivided figures. How far a token subdivides is a question for the contract, and nothing in
        this estate keeps a register of the answers, so the numbers are left as they came rather than
        divided by a guess. Assuming eighteen places is how a stablecoin with six ends up on screen a
        million times too small (<code className="cf-num">indexer/src/reads.ts</code>).
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
  if (activity.state === 'loading') return <Loading label="Gathering what moved" />
  if (activity.error) {
    if (activity.error.code === 'bad_address') {
      return (
        <Missing
          title="That is not shaped like an address on this chain"
          hint="Ember and the other EVM chains write an address as 0x and 40 hex characters."
          notice={activity.error}
        />
      )
    }
    return <Failed notice={activity.error} onRetry={activity.reload} />
  }
  const page = activity.data
  if (!page) return <Loading label="Gathering what moved" />

  if (activity.state === 'empty') {
    return (
      <Empty
        title="Nothing has moved through this address"
        hint="More precisely, nothing has moved within the stretch of chain this service has read. A service that began following at the top of the chain has no knowledge of anything that happened before it started."
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
              <th scope="col">Depth, from the provider&rsquo;s tip</th>
              <th scope="col">Standing</th>
              <th scope="col">Transaction</th>
              <th scope="col">First noticed</th>
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
← Back to the newest
          </button>
        )}
        {page.nextCursor && (
          <button type="button" className="cf-btn" onClick={() => onCursor(page.nextCursor)}>
Further back →
          </button>
        )}
      </nav>
      <Note>
An orphaned row is one the chain took back when it rewrote its own history. It stays on the
        page rather than disappearing from it: quietly dropping it would hide a rewrite on the one
        screen where somebody is looking for their money. It carries no depth because there is no
        longer anything honest to measure it against.
      </Note>
    </>
  )
}
