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
 * ── AND SINCE micro-indexer#7, "NOT RECORDED" IS RENDERED APART FROM "NOTHING HAPPENED" ───────
 *
 * The panel above was built for a balance the service refused to state. This page had no equivalent
 * for a HISTORY the service cannot state, because until micro-org #253 there was no such thing: the
 * indexer wrote `address_activity` for every address a block touched. It no longer does. A
 * deployment running `INDEXER_WATCHED_ADDRESSES_ONLY` records the row only for addresses it was
 * watching, marks the blocks it walked that way (`indexer/src/btcsource.ts`), and answers about
 * anybody else with `incomplete: { reason: 'address_not_watched' }` beside an empty `items`
 * (`indexer/src/reads.ts`).
 *
 * Before this change that answer rendered as **"Nothing has moved through this address"** — the
 * empty state, complete with its reassuring second sentence. A visitor was told their address was
 * empty when the truth was that this estate had never written it down. Every part of that screen
 * was working: the request succeeded, the shape was right, no test failed, and the page was
 * confidently wrong. It is the same class of defect as a withheld balance rendered as nought, and
 * it is worse in one respect — a nought at least looks like a number somebody computed, whereas
 * "nothing has moved" reads as a search that was carried out.
 *
 * So the marker gets a screen of its own and the empty state is checked for it FIRST. Two further
 * consequences, both of which cost a page that only handled the empty case:
 *
 *   1. **It can arrive with rows on it.** `fromHeight` is where the record narrows, and movements
 *      below that height were recorded for everybody. Such a page has real rows and a truncated
 *      history at once, so the notice is rendered above the table as well.
 *   2. **The holdings panel is derived from the same rows** — `tokenBalancesAt`
 *      (`indexer/src/store.ts`) sums `address_activity` — and its read carries no marker of its
 *      own, so an unwatched address gets `balances: []` with `unavailable` absent and this page
 *      used to call that "genuinely means nought rather than unknown". It is not nought, it is the
 *      same silence, and the activity read is the only thing on this screen that knows. The two
 *      resources are therefore no longer independent: what activity learned is passed to holdings.
 *      Reported to micro-indexer; the honest fix is a marker on that read, which is theirs to add.
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
import {
  activityTone,
  count,
  timestamp,
  units,
  unavailableReason,
  unrecordedReason,
} from '../lib/format.ts'
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

  // The activity read is the only one of the two that carries the marker, and both panels on this
  // page are built out of the same rows — see the header. Null while the read is in flight, which
  // is correct: the holdings panel is behind its own `Loading` until then and has nothing to
  // qualify yet.
  const unrecorded = activity.data?.incomplete ?? null

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
      <Holdings holdings={holdings} unrecorded={unrecorded} />

      <h2 className="ex-section__title">Money in and out</h2>
      <DepthNote>
Depths in this table are measured from the top of the chain as an upstream provider last
        reported it, not from the highest block read here. The{' '}
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

/** The marker off the activity read, or its absence. `undefined` is not a state this page renders. */
type Unrecorded = NonNullable<ActivityPage['incomplete']> | null

/**
 * THE ONE PANEL ON THIS PAGE THAT SAYS "WE DID NOT WRITE THIS DOWN".
 *
 * Deliberately not `Empty`. `src/components/states.tsx` defines that state as "the query answered,
 * with nothing. Nothing is wrong; there is something to DO" — every word of which is false here.
 * Something IS wrong, from the reader's point of view, and there is nothing whatever they can do
 * about it. Reusing the component would have made the two indistinguishable on screen, which is the
 * defect this exists to end rather than a shortcut around it.
 *
 * It borrows the withheld-balance panel's markup instead, and that is the argument rather than a
 * convenience: the two are the same statement about two different fields. A reader who has learned
 * what `ex-withheld` looks like above has already learned what it means here.
 */
function NotRecorded({ marker }: { marker: NonNullable<ActivityPage['incomplete']> }) {
  return (
    <div className="ex-withheld" role="status">
      <p className="ex-withheld__title">
        <span aria-hidden="true">⊘</span> This address is not one this service keeps a record of.
      </p>
      <p className="ex-withheld__why">{unrecordedReason(marker.reason)}</p>
      <dl className="ex-facts ex-facts--tight">
        <Fact label="Reason code">
          <code className="cf-num ex-code">{marker.reason}</code>
        </Fact>
        <Fact label="Recorded for every address below block">
          <span className="cf-num">{count(marker.fromHeight)}</span>
        </Fact>
      </dl>
      <p className="ex-withheld__note">
Anything shown here happened below that height, when every address was written down. From it
        upwards this page can tell you nothing about this address, and an empty table would have told
        you something — that nothing had happened — which is a different answer and one nobody here
        is in a position to give.
      </p>
    </div>
  )
}

function Holdings({
  holdings,
  unrecorded,
}: {
  holdings: ReturnType<typeof useResource<TokenBalancesView>>
  unrecorded: Unrecorded
}) {
  if (holdings.state === 'loading') return <Loading label="Totting up token balances" />
  if (holdings.error) {
    if (holdings.error.code === 'bad_address') {
      // THE HINT NAMES THE FAMILIES AND DELIBERATELY NOT THEIR MEMBERS. It used to read "Bitcoin,
      // Solana and XRP", which was a hand-typed roll-call of the asset union as it stood; it was
      // already short of Litecoin, and micro-contracts `c0e7c77` put Dogecoin on the same side of
      // the same line. A sentence about families does not go stale when a family gains a member,
      // and the set of families has not changed since this surface was built.
      return (
        <Missing
          title="That is not shaped like an address on this chain"
          hint="Ember and the other EVM chains write an address as 0x and 40 hex characters. Every other family — Bitcoin and the chains built to its shape, Solana, XRP — gets a length check and nothing more, because nothing in this estate can properly validate their formats and a half-right check would turn away good addresses."
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
          all rather than a believable wrong one.
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
        // ── "NOUGHT" AND "NOT WRITTEN DOWN" LOOK IDENTICAL FROM THIS READ, SO IT IS NOT ASKED
        //    ALONE. `tokenBalancesAt` (`indexer/src/store.ts`) sums `address_activity` rows, and
        //    this route carries no marker saying whether they were recorded for this address — the
        //    `unavailable` union covers coverage, halts and negatives and has nothing for it. Its
        //    coverage check therefore passes on a narrowed record, because the BLOCKS are all
        //    there; only the address rows are missing. So the confident sentence is spent only when
        //    the activity read has said the record is this address's, and withheld when it has not.
        unrecorded ? (
          <p className="ex-absent">
No token balance can be worked out for this address. It is built from the same movements the
            table below is, and those were never written down here — so nought would be an
            arithmetic result rather than a holding.
          </p>
        ) : (
          <p className="ex-absent">
This address holds none of the tokens seen moving on this chain. Here that genuinely means
            nought rather than unknown, because the record behind it runs without a break from the
            very first block.
          </p>
        )
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
        million times too small.
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

  // BEFORE the empty branch, and the order is the whole fix. `useResource` calls this page empty
  // because `items.length` is zero, which is true and which is not what happened. The empty screen
  // below says nothing has moved; this one says nobody looked. Checking them the other way round
  // is what shipped, and it is why an unwatched address was told it was an empty one.
  if (page.incomplete) {
    return (
      <>
        <NotRecorded marker={page.incomplete} />
        {page.items.length > 0 ? (
          <ActivityTable page={page} onCursor={onCursor} cursor={cursor} />
        ) : (
          cursor && (
            <nav className="ex-stepper" aria-label="Pages">
              <button type="button" className="cf-btn" onClick={() => onCursor(null)}>
← Back to the newest
              </button>
            </nav>
          )
        )}
      </>
    )
  }

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

  return <ActivityTable page={page} onCursor={onCursor} cursor={cursor} />
}

/**
 * The rows, the stepper and the orphan note.
 *
 * Split out of `Activity` because it is reached from two places that mean different things: a page
 * that IS this address's record, and a page that is only the part of it written before the record
 * narrowed. The second renders `NotRecorded` above these same rows rather than instead of them —
 * they are real movements and hiding them would be a second wrong answer in the other direction.
 */
function ActivityTable({
  page,
  onCursor,
  cursor,
}: {
  page: ActivityPage
  onCursor: (cursor: string | null) => void
  cursor: string | null
}) {
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
