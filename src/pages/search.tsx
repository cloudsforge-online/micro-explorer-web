/**
 * The index: a search box, over the chains this deployment can actually answer about.
 *
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 * TWO DEFECTS THE OWNER FOUND HERE BY USING THE PRODUCT, NOT BY ANY TEST
 *
 * **1. The network was a literal, and it was the wrong one.** This file opened with
 * `useState<Network>('testnet')`. The same bundle serves both estates, so the front page of
 * `explorer.cloudsforge.online` — the MAINNET explorer — sent every pasted hash, height and address
 * to `ember/testnet`. On that deployment testnet is not indexed at all; what its database still
 * holds is 87 blocks from a previous configuration, answering `halted: true` and `tipHeight: 0`.
 * So the default lookup for a real mainnet transaction resolved against a halted scope and came
 * back "does not exist" — the failure that reads as "my funds are gone", and the same one tracker
 * #136 recorded from the linking side.
 *
 * The network is now `deploymentNetwork()`, derived from the hostname through the surface
 * registry's `splitEnvLabel` (`src/lib/network.ts`), and it is **not a control**. It was a
 * `<select>` and it should never have been one: on a deployment that indexes one network, offering
 * the other is offering a wrong answer with a dropdown in front of it. Which network you are on is
 * a property of the address you are at — that is the whole mechanism `4283686` settled #136 with —
 * so it is rendered as a fact and the other network is a link to the other hostname.
 *
 * **2. The chain selector offered five chains and one worked.** Both live estates run exactly one
 * scope. The other chains answered "Not walked by this deployment" — but only AFTER the reader had
 * chosen one, typed a hash and pressed the button. The selector now lists what `/status` says this
 * deployment serves (`isServed`, `src/lib/indexer.ts`), and says plainly which chains are not
 * supported here rather than offering them and apologising later.
 *
 * ── SO THE FRONT PAGE NOW FETCHES, AND THE OLD REASON FOR NOT FETCHING IS GONE ─────────────────
 *
 * This file used to say it asked the chain index nothing, "because there is no question yet". That
 * was right about the paste and wrong about the page: which chains can be searched at all IS a
 * question, it has to be asked before the reader commits, and answering it from a constant would
 * be a build-time copy of a per-deployment fact. The box renders immediately and does not wait —
 * the request narrows the offer when it lands, and until then the page says it is still asking.
 *
 * ── The classification is still the SERVICE's rules, not this app's ───────────────────────────
 *
 * `guessKind` in `src/lib/routes.ts` uses the same three shapes the indexer validates against:
 * `/^\d{1,15}$/` for a height (`indexer/src/server.ts:602`), `EVM_HASH`
 * (`indexer/src/server.ts:675`) and `EVM_ADDRESS` (`indexer/src/server.ts:674`). Sending somebody
 * to a page the service would answer 400 for would be this app inventing a surface again.
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 */
import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Note } from '../components/tone.tsx'
import {
  getChainOffers,
  isServed,
  type ChainId,
  type ChainOffer,
} from '../lib/indexer.ts'
import { deploymentNetwork, siblingExplorer } from '../lib/network.ts'
import { useResource } from '../lib/resource.ts'
import { guessKind, linkTo } from '../lib/routes.ts'

export function SearchPage() {
  const navigate = useNavigate()
  const network = deploymentNetwork()
  const other = network === 'mainnet' ? 'testnet' : 'mainnet'
  const sibling = siblingExplorer(other)

  const load = useCallback(
    (signal: AbortSignal): Promise<readonly ChainOffer[]> => getChainOffers(network, signal),
    [network],
  )
  const resource = useResource<readonly ChainOffer[]>(
    load,
    (offers) => offers.length,
    'The chain index could not be reached.',
  )

  const servedChains: readonly ChainId[] = (resource.data ?? [])
    .filter((o) => o.status !== null && isServed(o.status))
    .map((o) => o.chain)
  const absentChains: readonly ChainId[] = (resource.data ?? [])
    .filter((o) => o.status !== null && !isServed(o.status))
    .map((o) => o.chain)

  const [chain, setChain] = useState<ChainId>('ember')
  const [term, setTerm] = useState('')

  // Once the offer lands, a chain that is not on it must not stay selected. `ember` is the initial
  // value because it is the one chain either estate has ever indexed, but a deployment that
  // indexed something else would otherwise hold a dead selection until the reader noticed.
  useEffect(() => {
    if (servedChains.length === 0) return
    if (!servedChains.includes(chain)) setChain(servedChains[0] as ChainId)
  }, [servedChains, chain])

  const guess = guessKind(term)
  // Nothing is submittable until the index has said it can answer about the selected chain. A
  // button that navigates to a scope this deployment does not serve is the original defect with a
  // shorter path to it.
  const searchable = servedChains.includes(chain)

  const submit = (event: React.FormEvent) => {
    event.preventDefault()
    if (!searchable) return
    if (guess.kind === 'height') navigate(linkTo.block(chain, network, guess.value))
    else if (guess.kind === 'hash') navigate(linkTo.transaction(chain, network, guess.value))
    else if (guess.kind === 'address') navigate(linkTo.address(chain, network, guess.value))
  }

  return (
    <div className="ex-page">
      <header className="ex-page__head">
        <h1 className="ex-page__title">Network Explorer</h1>
      </header>
      <p className="ex-page__lede">
        Blocks, transactions, addresses and the state of each chain, read from the CloudsForge chain
        index. Every page says how deep a thing is and what that depth was measured against; none of
        them says a thing is final.
      </p>

      <form className="ex-search" onSubmit={submit}>
        <div className="ex-search__scope">
          <label className="ex-field">
            <span className="ex-field__label">Chain</span>
            <select
              className="cf-select cf-select--mono"
              value={chain}
              disabled={servedChains.length === 0}
              onChange={(e) => setChain(e.target.value as ChainId)}
            >
              {/* Only what this deployment serves. Until the answer lands there is one entry, the
                  currently selected chain, so the control never offers a scope on the strength of
                  a client-side list. */}
              {(servedChains.length > 0 ? servedChains : [chain]).map((id) => (
                <option key={id} value={id}>
                  {id}
                </option>
              ))}
            </select>
          </label>
          {/*
            THE NETWORK IS NOT A CONTROL. It is read from the hostname and stated. A dropdown here
            let a reader on the mainnet explorer select a network that deployment has never indexed,
            and be told their transaction does not exist.
          */}
          <p className="ex-field">
            <span className="ex-field__label">Network</span>
            <strong className="cf-num" data-cf-network={network}>
              {network}
            </strong>
          </p>
        </div>
        <label className="ex-field ex-field--grow">
          <span className="ex-field__label">Block height, transaction hash, or address</span>
          <input
            className="cf-input cf-input--mono"
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            placeholder="1234567 · 0x… (64 hex) · 0x… (40 hex)"
            spellCheck={false}
            autoComplete="off"
          />
        </label>
        <button
          type="submit"
          className="cf-btn cf-btn--ember"
          disabled={guess.kind === 'unknown' || !searchable}
        >
          Look it up
        </button>
      </form>

      {/* What this deployment can and cannot answer, said BEFORE the reader commits rather than
          after. `role="status"` so it is announced when it narrows. */}
      <p className="ex-guess" role="status">
        {resource.state === 'loading' && <>Asking the chain index which chains it serves…</>}
        {resource.error && (
          <>
            The chain index could not be reached, so this page cannot say which chains it serves.
            Nothing here is searchable until it answers.
          </>
        )}
        {resource.data && servedChains.length === 0 && (
          <>
            This deployment is not indexing any chain, so there is nothing to look up. That is the
            index reporting its own configuration, not a failure of this page.
          </>
        )}
        {resource.data && servedChains.length > 0 && (
          <>
            This explorer serves <strong>{network}</strong> and indexes{' '}
            {servedChains.map((id, i) => (
              <span key={id}>
                {i > 0 && (i === servedChains.length - 1 ? ' and ' : ', ')}
                <code className="cf-num">{id}</code>
              </span>
            ))}
            .{' '}
            {absentChains.length > 0 && (
              <>
                {absentChains.map((id, i) => (
                  <span key={id}>
                    {i > 0 && (i === absentChains.length - 1 ? ' and ' : ', ')}
                    <code className="cf-num">{id}</code>
                  </span>
                ))}{' '}
                {absentChains.length === 1 ? 'is' : 'are'} not supported here and cannot be
                searched. <Link to="/chains">The chains page</Link> says what each one answers.
              </>
            )}
          </>
        )}
      </p>

      {/*
        The classification is shown BEFORE the reader commits, because the three shapes are easy to
        confuse by eye — a 40-hex address and a 64-hex hash differ only in length — and being told
        "this looks like an address" is what catches a truncated paste.
      */}
      {term.trim().length > 0 && (
        <p className="ex-guess" role="status">
          {guess.kind === 'height' && (
            <>
              That is a block height. It will be read on{' '}
              <code className="cf-num">
                {chain}/{network}
              </code>
              .
            </>
          )}
          {guess.kind === 'hash' && (
            <>
              That is a 32-byte hash, so it will be looked up as a transaction on{' '}
              <code className="cf-num">
                {chain}/{network}
              </code>
              .
            </>
          )}
          {guess.kind === 'address' && (
            <>
              That is a 20-byte address. Its activity will be read on{' '}
              <code className="cf-num">
                {chain}/{network}
              </code>
              {/* A router Link, not an anchor: an anchor here would take the full-page-load path
                  for an address this bundle already owns. */}
              . If it is a contract,{' '}
              <Link to={linkTo.token(chain, network, guess.value)}>read it as a token</Link> instead.
            </>
          )}
          {guess.kind === 'unknown' && (
            <>
              That is not one of the three shapes this explorer can recognise: a decimal height of
              up to fifteen digits, a <code className="cf-num">0x</code> hash of 64 hex characters,
              or a <code className="cf-num">0x</code> address of 40. Bitcoin, Solana and XRP
              addresses are base58 or bech32 and are not checked by shape anywhere in this estate
              yet, so paste one into the address page directly.
            </>
          )}
        </p>
      )}

      {sibling && (
        <Note>
          Looking for the {other} network? It is a separate deployment with its own index, at{' '}
          {/* A real anchor: a different origin, which a router Link cannot reach. */}
          <a href={sibling}>{sibling.replace('https://', '')}</a>. Nothing on this page reads it,
          and no selection you make here follows you there.
        </Note>
      )}

      <h2 className="ex-section__title">What each page will and will not tell you</h2>
      <ul className="ex-plainlist">
        <li>
          <strong>A block or a transaction record</strong> carries a confirmation count measured
          against the tip a provider last claimed (<code className="cf-num">
            indexer/src/reads.ts:579
          </code>
          , <code className="cf-num">:415-418</code>), which can be ahead of what this index has
          actually walked.
        </li>
        <li>
          <strong>The confirmations page of a transaction</strong> is the only answer counted
          against the block this index has walked (<code className="cf-num">
            indexer/src/reads.ts:451-454
          </code>
          ), and it is the only one this explorer will describe as a depth worth acting on.
        </li>
        <li>
          <strong>An address&rsquo;s token holdings</strong> may be withheld entirely rather than
          shown as zero, and the reason is always given
          (<code className="cf-num">indexer/src/reads.ts:231-265</code>). A balance derived from
          movements is only a balance if the movements are all of them.
        </li>
      </ul>
    </div>
  )
}
