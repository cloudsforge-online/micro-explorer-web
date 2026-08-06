/**
 * The index: a search box, over the chains this deployment can actually answer about.
 *
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 * TWO DEFECTS THE OWNER FOUND HERE BY USING THE PRODUCT, NOT BY ANY TEST
 *
 * **1. The network was a literal, and it was the wrong one.** This file opened with
 * `useState<Network>('testnet')`. The same bundle serves both estates, so the front page of
 * `explorer.<apex>` — the MAINNET explorer — sent every pasted hash, height and address
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
 * `/^\d{1,15}$/` for a height (`indexer/src/server.ts`), `EVM_HASH`
 * (`indexer/src/server.ts`) and `EVM_ADDRESS` (`indexer/src/server.ts`). Sending somebody
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
        Look up any block, transaction or address on the chains CloudsForge follows, and see what a
        contract reports about its own supply and authorities. Depth is always printed with the head
        it was measured against, so you can tell a number this service has verified for itself from
        one it took on a provider&rsquo;s word.
      </p>
      <p className="ex-page__lede">
        Ember, the Forge Network chain, runs an execution engine built here from the ground up and
        held to the vectors the Ethereum project publishes — state transitions, the virtual machine,
        transaction encoding, the trie and RLP, all passing at Shanghai. Anything you read on these
        pages you can reproduce against your own node.
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
          <span className="ex-field__label">Paste a block height, a transaction hash or an address</span>
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
        {resource.state === 'loading' && <>Finding out which chains this deployment follows…</>}
        {resource.error && (
          <>
            The chain index is not answering, so this page cannot tell you which chains it follows.
            Searching stays switched off until it does — offering a lookup that would fail is worse
            than saying nothing.
          </>
        )}
        {resource.data && servedChains.length === 0 && (
          <>
            No chain is being followed here, so there is nothing to search. The index told us that
            about itself; this page is working correctly and has nothing to offer.
          </>
        )}
        {resource.data && servedChains.length > 0 && (
          <>
            You are on <strong>{network}</strong>, and the chains walked here are{' '}
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
                searched. <Link to="/chains">The chains page</Link> sets out where each one stands.
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
              Reads as a block height, and will be fetched from{' '}
              <code className="cf-num">
                {chain}/{network}
              </code>
              .
            </>
          )}
          {guess.kind === 'hash' && (
            <>
              Thirty-two bytes, so it will be treated as a transaction hash on{' '}
              <code className="cf-num">
                {chain}/{network}
              </code>
              .
            </>
          )}
          {guess.kind === 'address' && (
            <>
              Twenty bytes, so it will be treated as an account address on{' '}
              <code className="cf-num">
                {chain}/{network}
              </code>
              {/* A router Link, not an anchor: an anchor here would take the full-page-load path
                  for an address this bundle already owns. */}
. Where the address belongs to a token contract, you can also{' '}
              <Link to={linkTo.token(chain, network, guess.value)}>ask it for its supply and
              authorities</Link>.
            </>
          )}
          {guess.kind === 'unknown' && (
            <>
              This matches none of the three forms the box can classify: a plain decimal height of
              up to fifteen digits, a <code className="cf-num">0x</code> hash of 64 hex characters,
              or a <code className="cf-num">0x</code> address of 40. Bitcoin, Solana and XRP write
              their addresses in base58 or bech32, which nothing in this estate can recognise by
              shape, so go to the address page and put one straight in the path.
            </>
          )}
        </p>
      )}

      {sibling && (
        <Note>
          After the {other} network? It runs as its own deployment with its own index, at{' '}
          {/* A real anchor: a different origin, which a router Link cannot reach. */}
          <a href={sibling}>{sibling.replace('https://', '')}</a>. Nothing here reads it, and whatever
          you type into this box stays on this side.
        </Note>
      )}

      <h2 className="ex-section__title">How to read a depth on this site</h2>
      <ul className="ex-plainlist">
        <li>
          <strong>On a block, or in a transaction&rsquo;s record,</strong> the count is measured
          from the tip an upstream provider last reported (<code className="cf-num">
            indexer/src/reads.ts
          </code>
          ). That figure can sit above the highest block anybody here has actually read.
        </li>
        <li>
          <strong>At the top of a transaction,</strong> the verdict is counted from the highest
          block this service has walked itself (<code className="cf-num">
            indexer/src/reads.ts
          </code>
          ). It is the smaller number, and the one to weigh before acting on money.
        </li>
        <li>
          <strong>Token holdings for an address</strong> are held back altogether, with the reason
          named, whenever the record behind them has a hole in it
          (<code className="cf-num">indexer/src/reads.ts</code>). Adding up part of the
          movements would produce a figure that looks like a balance and is not one.
        </li>
      </ul>
    </div>
  )
}
