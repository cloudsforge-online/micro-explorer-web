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
import { deploymentNetwork, siblingExplorer } from '../lib/network.ts'
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
 */
const ABOUT: Readonly<Record<string, string>> = {
  ember: 'EMBER — the Forge Network chain, proof of work',
  eth: 'ETH — Ethereum',
  btc: 'BTC — Bitcoin',
  sol: 'SOL — Solana',
  xrp: 'XRP — the XRP Ledger',
  ltc: 'LTC — Litecoin',
}

export function ChainsPage() {
  const network = deploymentNetwork()
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
        This explorer serves the <strong>{network}</strong> network, and this page is every chain it
        can be asked about on it — which of them this deployment has actually walked, how far, and
        how far that leaves it behind the tip a provider last claimed.
      </p>

      {resource.state === 'loading' && <Loading label="Reading every chain" />}
      {resource.error && <Failed notice={resource.error} onRetry={resource.reload} />}

      {resource.data && (
        <>
          <h2 className="ex-section__title">Indexed here</h2>
          {served.length === 0 ? (
            <p className="ex-page__lede ex-absent">
              This deployment is not indexing any chain right now. Nothing below can be looked up
              until it is, and the explorer will not pretend otherwise.
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
              <h2 className="ex-section__title">Not supported by this deployment</h2>
              <p className="ex-page__lede">
                {/*
                  Said once, as a fact about the deployment, rather than once per card as a
                  disappointment. These are not offered anywhere on this surface: there is no tab
                  for them, and the search box will not send a paste to one.
                */}
                No index has been configured for{' '}
                {absent.map((offer, i) => (
                  <span key={offer.chain}>
                    {i > 0 && (i === absent.length - 1 ? ' or ' : ', ')}
                    <code className="cf-num">{offer.chain}</code>
                  </span>
                ))}{' '}
                on {network}, so this explorer cannot show a block, a transaction or an address on
                any of them. They are listed because the chain index knows the chains exist, not
                because anything here can answer about one.
              </p>
              <Note>
                <strong>Deposits are a different service and are not affected by this.</strong>{' '}
                Custody issues deposit addresses for several of the chains above, so it is possible
                to deposit an asset this explorer cannot display. The deposit is credited by the
                chain index the wallet reads, not by this page; a chain missing here means the
                public explorer has no view of it, not that funds are lost.
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
                The chain index did not answer for{' '}
                {unreachable.map((offer, i) => (
                  <span key={offer.chain}>
                    {i > 0 && ', '}
                    <code className="cf-num">{offer.chain}</code>
                  </span>
                ))}
                . That is this service failing to reply, not a statement about those chains.
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
          The {network === 'mainnet' ? 'testnet' : 'mainnet'} network is a different deployment with
          its own index, on its own hostname:{' '}
          {/* A real anchor, not a router Link: it is a different origin. */}
          <a href={`${sibling}/chains`}>{sibling.replace('https://', '')}</a>. This one never shows
          it, because the two indexes share nothing and a row from the wrong one is a number that
          means nothing here.
        </p>
      )}

      <Note>
        &ldquo;Walked&rdquo; and &ldquo;claimed&rdquo; are different questions and this page never
        collapses them. The first is the highest canonical block this index has actually read and
        would have detected a reorg in; the second is what a provider said the tip was. A depth
        counted against the second can exceed the number of blocks anybody here has looked at, by
        exactly the lag shown (<code className="cf-num">indexer/src/reads.ts</code>).
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
        Configured, but no block has been walked yet.{' '}
        {status.tipHeight === null
          ? 'No tip has been observed for it either.'
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
      {status.halted && (
        <>
          {' '}
          <span className="ex-absent">
            · halted{status.haltReason ? `: ${status.haltReason}` : ''}
          </span>
        </>
      )}
    </p>
  )
}
