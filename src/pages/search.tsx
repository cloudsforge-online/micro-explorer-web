/**
 * The index: a search box, and no API call at all.
 *
 * ── Why the front page asks the chain index nothing ───────────────────────────────────────────
 *
 * Because there is no question yet. Sorting a paste into a height, a hash or an address is work
 * this app can do correctly and entirely on its own, and a page that fetched something in order to
 * look busy would be spending a round trip to show a reader what they already typed.
 *
 * It used to say something else, and the difference is worth recording: every `micro-indexer` route
 * required an authority this bundle could not hold, so a front page that fetched anything would
 * have greeted every visitor with a refusal before they asked a question. That is fixed
 * (`authoriseRead`, `indexer/src/server.ts:708-717`) and the refusal machinery is deleted — the
 * front page still fetches nothing, now for the plain reason rather than the defensive one.
 *
 * ── The classification is the SERVICE's rules, not this app's ─────────────────────────────────
 *
 * `guessKind` in `src/lib/routes.ts` uses the same three shapes the indexer validates against:
 * `/^\d{1,15}$/` for a height (`indexer/src/server.ts:518`), `EVM_HASH`
 * (`indexer/src/server.ts:591`) and `EVM_ADDRESS` (`indexer/src/server.ts:590`). Sending somebody
 * to a page the service would answer 400 for would be this app inventing a surface again.
 *
 * A paste it cannot classify is `unknown`, and the page says which three shapes it knows rather
 * than guessing at the nearest one. The non-EVM families are length-checked only upstream
 * (`indexer/src/server.ts:610-616`), because "the family that would validate them is not built yet
 * and a wrong validator would reject valid addresses" — so on those chains a paste that is not a
 * height cannot be classified here either, and the page offers both destinations instead of
 * choosing.
 */
import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { CHAIN_IDS, NETWORKS, type ChainId, type Network } from '../lib/indexer.ts'
import { guessKind, linkTo } from '../lib/routes.ts'

export function SearchPage() {
  const navigate = useNavigate()
  const [chain, setChain] = useState<ChainId>('ember')
  const [network, setNetwork] = useState<Network>('testnet')
  const [term, setTerm] = useState('')

  const guess = guessKind(term)

  const submit = (event: React.FormEvent) => {
    event.preventDefault()
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
              className="ex-select"
              value={chain}
              onChange={(e) => setChain(e.target.value as ChainId)}
            >
              {CHAIN_IDS.map((id) => (
                <option key={id} value={id}>
                  {id}
                </option>
              ))}
            </select>
          </label>
          <label className="ex-field">
            <span className="ex-field__label">Network</span>
            <select
              className="ex-select"
              value={network}
              onChange={(e) => setNetwork(e.target.value as Network)}
            >
              {NETWORKS.map((id) => (
                <option key={id} value={id}>
                  {id}
                </option>
              ))}
            </select>
          </label>
        </div>
        <label className="ex-field ex-field--grow">
          <span className="ex-field__label">Block height, transaction hash, or address</span>
          <input
            className="ex-input"
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            placeholder="1234567 · 0x… (64 hex) · 0x… (40 hex)"
            spellCheck={false}
            autoComplete="off"
          />
        </label>
        <button type="submit" className="cf-btn cf-btn--ember" disabled={guess.kind === 'unknown'}>
          Look it up
        </button>
      </form>

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

      <h2 className="ex-section__title">What each page will and will not tell you</h2>
      <ul className="ex-plainlist">
        <li>
          <strong>A block or a transaction record</strong> carries a confirmation count measured
          against the tip a provider last claimed (<code className="cf-num">
            indexer/src/reads.ts:570
          </code>
          , <code className="cf-num">:415-418</code>), which can be ahead of what this index has
          actually walked.
        </li>
        <li>
          <strong>The confirmations page of a transaction</strong> is the only answer counted
          against the block this index has walked (<code className="cf-num">
            indexer/src/reads.ts:442-445
          </code>
          ), and it is the only one this explorer will describe as a depth worth acting on.
        </li>
        <li>
          <strong>An address&rsquo;s token holdings</strong> may be withheld entirely rather than
          shown as zero, and the reason is always given
          (<code className="cf-num">indexer/src/reads.ts:225-259</code>). A balance derived from
          movements is only a balance if the movements are all of them.
        </li>
      </ul>
    </div>
  )
}
