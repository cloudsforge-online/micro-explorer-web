/**
 * Every chain, on THIS deployment's network, sorted into the ones it serves and the ones it does
 * not.
 *
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 * WHAT THIS PAGE USED TO DO, AND THE TWO DEFECTS THE OWNER FOUND BY USING IT
 *
 * It listed ten cards — five chains times two networks — and rendered whatever each one answered.
 * Nine of them said "Not walked by this deployment", because both live estates run exactly one
 * scope: `INDEXER_CHAINS=ember:mainnet` on the mainnet host and `ember:testnet` on the testnet one,
 * read off the running containers rather than off a manifest. A list in which nine of ten entries
 * are apologies is a list that presents nine things that do not work as though they might.
 *
 * So the sorting is the fix. What this deployment serves is stated first, as a fact; what it does
 * not is stated once, plainly, as "not supported here" rather than ten times as a per-card
 * disappointment. The reader learns the shape of the estate in one line instead of by opening
 * every card to find out.
 *
 * **It is measured, not configured.** `isServed` reads each scope's own `/status`
 * (`src/lib/indexer.ts`), so the day a second chain is indexed this page shows it with no edit
 * here — and until then it cannot claim one that is not.
 *
 * ── AND THE OTHER NETWORK IS NOT SHOWN AT ALL ─────────────────────────────────────────────────
 *
 * The network comes from the hostname (`src/lib/network.ts`) and this page renders only that one.
 * That is not tidiness. `ember:testnet` on the MAINNET indexer answers with 87 blocks,
 * `tipHeight: 0` and `halted: true` — leftovers in the same database from when that estate was
 * pointed at testnet — so a mainnet page rendering a testnet row showed a plausible-looking scope
 * whose numbers mean nothing. The other network lives on its own hostname, which is how #136 was
 * settled in `contracts` `4283686`, and it is linked as one.
 *
 * ── THERE IS NO SHARD SECTION HERE ANY MORE, AND ITS REMOVAL IS THE POINT ─────────────────────
 *
 * This page carried a heading, "Why there is no SHARD here", explaining that SHARD "is a
 * CloudsForge balance rather than a chain". Every word of that was written while it was true and
 * none of it is now: SHARD is RETIRED (`contracts/packages/chain/src/index.ts`,
 * `RETIRED_ASSETS`), migrated to EMBER, and `IssuableAssetCode` excludes it. A live product
 * telling a reader that a retired asset is one of their balances is not stale copy on a platform
 * holding real money — it is the same class of defect as `mint` charging SHARD after retirement,
 * which broke Forge Create for every user because the shipped wallet spent an asset the shipped
 * ledger refused.
 *
 * Nothing replaces it. Explaining why a retired asset is absent keeps the asset in front of the
 * reader, which is the thing that must stop. `test/retired-assets.test.ts` now fails if any
 * retired code reaches a rendered surface again — and it reads the retired list out of
 * `contracts` rather than hard-coding one, so retiring a second asset arms the same guard.
 *
 * **Sparks are untouched and must stay that way.** A Spark is 10⁻⁶ EMBER, a display denomination
 * and not an asset code. It has nothing to do with SHARD beyond a resemblance, and deleting it as
 * though it did would break the one unit small EMBER amounts are legible in.
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 */
import { useCallback } from 'react'
import { Link } from 'react-router-dom'
import { Failed, Loading } from '../components/states.tsx'
import { Note, StateBadge } from '../components/tone.tsx'
import { chainTone, count } from '../lib/format.ts'
import {
  getChainOffers,
  isServed,
  type ChainOffer,
  type ChainStatus,
} from '../lib/indexer.ts'
import { siblingExplorer } from '../lib/network.ts'
import { viewedNetwork } from '../lib/viewed.ts'
import { useResource } from '../lib/resource.ts'
import { linkTo } from '../lib/routes.ts'

/**
 * What each chain is, in one line.
 *
 * The asset codes come from `indexer/src/chains.ts` and the families from
 * `@cloudsforge/contracts-chain` via `familyOf` (`indexer/src/chains.ts`). Written out here
 * rather than fetched because a list of six names should not require a round trip, and
 * `test/indexer.test.ts` checks the chain ids against the real source.
 *
 * `ltc` was missing from this record and from `CHAIN_IDS`, so Litecoin rendered as the bare string
 * `ltc` with no description at all. That is the drift the chain-id test had been red about.
 *
 * `etc` and `doge` arrived together and would have rendered the same way. **Each is one line and
 * neither says "supported".** They cannot: this record only supplies the description on a card the
 * sorting above has already put under `served` or `absent` from that scope's own `/status`, and
 * `INDEXER_CHAINS` follows neither of these two on any deployment — so both appear under the
 * heading for chains this deployment does not walk, exactly as BTC and XRP do today. Naming a chain
 * is not offering it, and the day that stops being true on this page it will be because a
 * deployment started walking one, which is the only thing that should make it true.
 */
const ABOUT: Readonly<Record<string, string>> = {
  ember: 'EMBER — the Forge Network chain, secured by proof of work',
  eth: 'ETH — Ethereum',
  etc: 'ETC — Ethereum Classic',
  btc: 'BTC — Bitcoin',
  sol: 'SOL — Solana',
  xrp: 'XRP — the XRP Ledger',
  ltc: 'LTC — Litecoin',
  doge: 'DOGE — Dogecoin',
}

export function ChainsPage() {
  // The VIEWED network (micro-org#459 stage 3): the reader's in-tab choice, or the hostname's.
  const network = viewedNetwork()
  const sibling = siblingExplorer(network === 'mainnet' ? 'testnet' : 'mainnet')

  const load = useCallback(
    (signal: AbortSignal): Promise<readonly ChainOffer[]> => getChainOffers(network, signal),
    [network],
  )

  // The count is the whole chain list whether or not any of them answered, so this resource is
  // never `empty`: a chain whose call failed is an entry with a reason on it, not a missing row.
  const resource = useResource<readonly ChainOffer[]>(
    load,
    (offers) => offers.length,
    'The chain index could not be reached.',
  )

  const served = (resource.data ?? []).filter((o) => o.status !== null && isServed(o.status))
  const absent = (resource.data ?? []).filter((o) => o.status !== null && !isServed(o.status))
  const unreachable = (resource.data ?? []).filter((o) => o.error !== null)

  return (
    <div className="ex-page">
      <header className="ex-page__head">
        <h1 className="ex-page__title">Chains</h1>
      </header>
      <p className="ex-page__lede">
        You are on the <strong>{network}</strong> network. Below is every chain that can be named in
        an address here, sorted by whether this deployment has actually read any of it: how many
        blocks it has walked through itself, and how far short of the tip an upstream provider
        reports that leaves it.
      </p>
      <p className="ex-page__lede">
        Ember is the chain CloudsForge runs. Its execution engine was written here and is checked
        against the vectors the Ethereum project publishes for state transitions, the virtual
        machine, transaction encoding, the trie and RLP, passing all of them at Shanghai — so a
        contract that behaves a certain way on Ethereum behaves that way here, and you can verify
        that yourself rather than take it on trust. Its coin is mined with proof of work, and the
        Forge Network site will do that in a browser tab, paying a key that is generated in the page
        and never sent anywhere.
      </p>

      {resource.state === 'loading' && <Loading label="Asking each chain where it stands" />}
      {resource.error && <Failed notice={resource.error} onRetry={resource.reload} />}

      {resource.data && (
        <>
          <h2 className="ex-section__title">Walked by this deployment</h2>
          {served.length === 0 ? (
            <p className="ex-page__lede ex-absent">
              Not one chain is being read here at the moment, so nothing listed below can be looked
              up. That is what the index says about itself, and this page passes it on rather than
              dressing it up.
            </p>
          ) : (
            <ul className="ex-scopes">
              {served.map((offer) => (
                <li key={offer.chain} className="ex-scope">
                  <h3 className="ex-scope__name">{ABOUT[offer.chain] ?? offer.chain}</h3>
                  <div className="ex-scope__net">
                    <Link className="ex-scope__link" to={linkTo.chain(offer.chain, network)}>
                      <code className="cf-num">
                        {offer.chain}/{network}
                      </code>
                    </Link>
                    {offer.status && <ScopeLine status={offer.status} />}
                  </div>
                </li>
              ))}
            </ul>
          )}

          {absent.length > 0 && (
            <>
              <h2 className="ex-section__title">Not available on this deployment</h2>
              <p className="ex-page__lede">
                {/*
                  Said once, as a fact about the deployment, rather than once per card as a
                  disappointment. These are not offered anywhere on this surface: there is no tab
                  for them, and the search box will not send a paste to one.
                */}
                Nothing has been set up to read{' '}
                {absent.map((offer, i) => (
                  <span key={offer.chain}>
                    {i > 0 && (i === absent.length - 1 ? ' or ' : ', ')}
                    <code className="cf-num">{offer.chain}</code>
                  </span>
                ))}{' '}
                on {network}. No block, transaction or address on any of them can be shown to you
                here. They appear in this list because the software recognises the names, which is
                not the same as being able to answer a question about one.
              </p>
              <Note>
                <strong>Paying money in is handled elsewhere and is unaffected.</strong> CloudsForge
                custody hands out deposit addresses on several of the chains above, so you can quite
                properly deposit an asset that this page cannot draw. Your wallet credits the deposit
                from its own reading of the chain. A chain missing from this list means the public
                explorer has no window onto it — nothing more.
              </Note>
            </>
          )}

          {unreachable.length > 0 && (
            <>
              <h2 className="ex-section__title">Could not be read</h2>
              <p className="ex-page__lede ex-absent">
                {/*
                  A third outcome, kept apart from both others on purpose. The service was asked and
                  did not answer, which says nothing at all about the chain — folding it into
                  "not supported" would report an outage as a policy.
                */}
                No answer came back about{' '}
                {unreachable.map((offer, i) => (
                  <span key={offer.chain}>
                    {i > 0 && ', '}
                    <code className="cf-num">{offer.chain}</code>
                  </span>
                ))}
                . That is our own service falling silent, and says nothing whatever about those
                chains.
                {unreachable[0]?.error?.requestId && (
                  <>
                    {' '}
                    <code className="cf-num wt-reqid">{unreachable[0].error?.requestId}</code>
                  </>
                )}
              </p>
            </>
          )}
        </>
      )}

      {sibling && (
        <p className="ex-page__lede">
          The {network === 'mainnet' ? 'testnet' : 'mainnet'} network runs as a separate deployment
          with a separate index, under a hostname of its own:{' '}
          {/* A real anchor, not a router Link: it is a different origin. */}
          <a href={`${sibling}/chains`}>{sibling.replace('https://', '')}</a>. It is never mixed into this page: the two indexes have
          nothing in common, and a height borrowed from the wrong one is a figure that means
          nothing.
        </p>
      )}

      <Note>
Two different questions sit behind those numbers and this page keeps them apart. One is the
        highest block this service has read for itself and would have spotted a rewrite in. The other
        is whatever an upstream provider last said the top of the chain was. A depth taken from the
        second can be larger than the total number of blocks anybody here has examined, by precisely
        the gap shown.
      </Note>
    </div>
  )
}

/**
 * One served scope's line: walked, claimed, and the gap.
 *
 * This renders only for a scope `isServed` accepted, so "not walked" is no longer one of its
 * outcomes — a configured chain that has not got a block yet still has no `indexedHeight`, and it
 * says so here rather than being sorted into the unsupported list where it does not belong.
 */
function ScopeLine({ status }: { status: ChainStatus }) {
  if (status.indexedHeight === null) {
    return (
      <p className="ex-scope__state ex-absent">
        Set up, but not a single block read so far.{' '}
        {status.tipHeight === null
          ? 'No upstream provider has reported a tip for it either.'
          : `An upstream provider puts the top of the chain at ${count(status.tipHeight)}.`}
      </p>
    )
  }

  return (
    <p className="ex-scope__state">
      <StateBadge tone={chainTone(status)} /> <span className="ex-dim">read up to</span>{' '}
      <span className="cf-num">{count(status.indexedHeight)}</span>
      {status.tipHeight !== null && (
        <>
          {' '}
          <span className="ex-dim">· provider reports</span>{' '}
          <span className="cf-num">{count(status.tipHeight)}</span>
        </>
      )}
      {status.lagBlocks !== null && (
        <>
          {' '}
          <span className="ex-dim">· short by</span>{' '}
          <span className="cf-num">{count(status.lagBlocks)}</span>
        </>
      )}
      {status.halted && (
        <>
          {' '}
          <span className="ex-absent">
            · stopped{status.haltReason ? `: ${status.haltReason}` : ''}
          </span>
        </>
      )}
    </p>
  )
}
