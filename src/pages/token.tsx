/**
 * A token contract's supply and authorities, as the contract itself reports them.
 *
 * `GET /v1/tokens/:chain/:network/:address` — `indexer/src/server.ts`, handler `tokenObservation`.
 *
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 * THREE FAILURES, THREE MEANINGS, THREE SCREENS.
 *
 * This route exists because `micro-mint` could not tell them apart, and every ForgeMint project
 * page rendered its supply and authorities as unknown, permanently
 * (`indexer/src/server.ts`). The handler's own comment sets out the split
 * (`indexer/src/server.ts`):
 *
 *   **404 `token_not_found`** — this service asked the chain and there is no contract answering
 *   `totalSupply()` at that address, at the block it has walked. A REAL answer. A contract
 *   deployed above the walked head reads as this, and that is honest.
 *
 *   **404 `not_found`** — the router's. This bundle asked for a path the service does not serve.
 *   Entirely different, and a defect here rather than a fact about any chain.
 *
 *   **501 / 503** — `TokenStateUnavailableError` (`indexer/src/tokenstate.ts`). The
 *   observation could not be MADE. `family_not_supported` is 501 because no amount of waiting will
 *   change it; the other four are 503 because a provider, a head or a follower is behind
 *   (`indexer/src/server.ts`). **Never rendered as "no token here".**
 *
 * ── The observation is as at a block, and the block is named ──────────────────────────────────
 *
 * `observedAtBlock` is the stored canonical head the call was made at, and `observedAtBlockHash` is
 * the hash this service walked at that height "and proved the node still serves"
 * (`indexer/src/tokenstate.ts`). `tipHeight` sits beside it "for staleness, never read
 * against". All three are shown, because a supply figure with no block attached is a
 * number with no time attached.
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 */
import { useCallback } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Failed, Loading, Missing } from '../components/states.tsx'
import { Fact, Note } from '../components/tone.tsx'
import { count, tokenFaultReason, units } from '../lib/format.ts'
import { getToken, type TokenObservation } from '../lib/indexer.ts'
import { useResource } from '../lib/resource.ts'
import { linkTo } from '../lib/routes.ts'
import { parseScope } from '../lib/scope.ts'
import { UnknownScope } from './unknown-scope.tsx'

/** The five faults `observe` can raise (`indexer/src/tokenstate.ts`). */
const FAULTS = new Set([
  'family_not_supported',
  'chain_not_followed',
  'nothing_indexed',
  'head_diverged',
  'rpc_unavailable',
])

export function TokenPage() {
  const params = useParams()
  const scope = parseScope(params['chain'], params['network'])
  const address = params['address'] ?? ''

  const load = useCallback(
    (signal: AbortSignal) => {
      if (!scope) return Promise.reject(new Error('no scope'))
      return getToken(scope, address, signal)
    },
    [scope?.chain, scope?.network, address],
  )
  const resource = useResource<TokenObservation>(
    load,
    () => 1,
    'The chain index is not answering.',
    [scope?.chain, scope?.network, address],
  )

  if (!scope) return <UnknownScope chain={params['chain']} network={params['network']} />

  if (resource.state === 'loading') return <Loading label="Putting the questions to the contract" />
  if (resource.error) {
    const code = resource.error.code ?? ''

    // ── COULD NOT ASK. Never "there is no token here". ────────────────────────────────────────
    if (FAULTS.has(code)) {
      return (
        <div className="ex-page">
          <header className="ex-page__head">
            <h1 className="ex-page__title">The contract could not be reached</h1>
          </header>
          <p className="ex-page__hash">
            <code className="cf-num ex-hex">{address}</code>
          </p>
          <div className="ex-withheld" role="alert">
            <p className="ex-withheld__title">
              <span aria-hidden="true">▲</span> Nothing below is a statement about this contract.
            </p>
            <p className="ex-withheld__why">{tokenFaultReason(code)}</p>
            <dl className="ex-facts ex-facts--tight">
              <Fact label="Reason code">
                <code className="cf-num ex-code">{code}</code>
              </Fact>
              <Fact label="Answered with">
                <span className="cf-num">{count(resource.error.status ?? null)}</span>
                <span className="ex-dim">
                  {resource.error.status === 501
                    ? ' — this build will never be able to answer'
                    : ' — worth another go once the reading catches up'}
                </span>
              </Fact>
            </dl>
            <p className="ex-withheld__note">
&ldquo;The question could not be put&rdquo; and &ldquo;the answer is no&rdquo; are separate
              outcomes, and software that runs them together ends up telling people a token does not
              exist when the truth is that nobody managed to look. This page keeps them apart.
            </p>
          </div>
          {resource.error.status !== 501 && (
            <div className="ex-stepper">
              <button type="button" className="cf-btn" onClick={resource.reload}>
Try the contract again
              </button>
            </div>
          )}
        </div>
      )
    }

    if (code === 'unknown_chain' || code === 'unknown_network') {
      return <UnknownScope chain={params['chain']} network={params['network']} />
    }
    if (code === 'bad_address') {
      return (
        <Missing
          title="That is not shaped like an address on this chain"
          hint="A contract lives at an ordinary address and is treated as one, so the mixed-case checksum form your wallet shows is perfectly welcome. What you gave is not twenty bytes of hex in any form."
          notice={resource.error}
        />
      )
    }
    if (code === 'token_not_found') {
      return (
        <Missing
          title="Nothing answers as a token there"
          hint={
            'The question was put to the chain, at the highest block read here, and no contract ' +
            'at that address replied to a request for its total supply. A contract deployed in a ' +
            'more recent block than this service has reached gives exactly the same answer. The ' +
            'chain page shows how far the reading has got.'
          }
          notice={resource.error}
        />
      )
    }
    if (resource.error.status === 404) {
      return (
        <Missing
          title="No answer came back"
          hint="This page requested an address the chain index does not serve, which is a fault on our side rather than anything to do with your contract."
          notice={resource.error}
        />
      )
    }
    return <Failed notice={resource.error} onRetry={resource.reload} />
  }

  const token = resource.data
  if (!token) return <Loading label="Putting the questions to the contract" />

  return (
    <div className="ex-page">
      <header className="ex-page__head">
        <h1 className="ex-page__title">{token.name ?? 'Token'}</h1>
        {token.symbol && <p className="ex-page__id">{token.symbol}</p>}
      </header>
      <p className="ex-page__hash">
        <code className="cf-num ex-hex">{token.contractAddress}</code>
      </p>
      <p className="ex-page__lede">
        <Link to={linkTo.address(token.chain, token.network, token.contractAddress)}>
          Everything that has moved through this address
        </Link>
        {' · '}
        <Link className="cf-num" to={linkTo.chain(token.chain, token.network)}>
          {token.chain}/{token.network}
        </Link>
      </p>

      {token.halted && (
        <Note tone="warn">
A rewrite deeper than the alarm threshold has stopped this service standing behind this
          chain. What follows was still measured at a block it read, but the sequence of blocks it
          read may no longer be the sequence the network agrees on.
        </Note>
      )}

      <h2 className="ex-section__title">How many exist</h2>
      <dl className="ex-facts">
        <Fact label="In existence, in the smallest unit">
          {token.totalSupply === null ? (
            <span className="ex-absent">the contract will not say</span>
          ) : (
            <span className="cf-num">{units(token.totalSupply)}</span>
          )}
        </Fact>
        <Fact label="Ceiling, in the smallest unit">
          {token.cap === null ? (
            <span className="ex-absent">no ceiling, or none that this contract implements</span>
          ) : (
            <span className="cf-num">{units(token.cap)}</span>
          )}
        </Fact>
        <Fact label="Decimal places">
          {token.decimals === null ? (
            <span className="ex-absent">the contract will not say</span>
          ) : (
            <span className="cf-num">{count(token.decimals)}</span>
          )}
        </Fact>
      </dl>
      <Note>
Both figures come from the contract in its own smallest unit and are printed undivided. Where
        a line says the contract will not say, the method it would have answered does not exist —
        which is not the same as nought. A token with no ceiling and a token whose ceiling is zero
        are very different things.
      </Note>

      <h2 className="ex-section__title">Who can do what to it</h2>
      <dl className="ex-facts">
        <Fact label="Owner">
          {token.owner === null ? (
            <span className="ex-absent">this contract has no owner role at all</span>
          ) : (
            <Link className="cf-num ex-hex" to={linkTo.address(token.chain, token.network, token.owner)}>
              {token.owner}
            </Link>
          )}
        </Fact>
        <Fact label="Can more be created?">
          {token.mintAuthority === null ? (
            <span className="ex-absent">the contract did not answer the question</span>
          ) : token.mintAuthority ? (
            <strong>Yes — a key exists that can issue more.</strong>
          ) : (
            'No — the number in existence cannot go up.'
          )}
        </Fact>
        <Fact label="Are transfers frozen?">
          {token.paused === null ? (
            <span className="ex-absent">this contract has no freeze switch</span>
          ) : token.paused ? (
            <strong>Yes — nobody can move this token right now.</strong>
          ) : (
            'No — it is moving freely between holders.'
          )}
        </Fact>
      </dl>
      <Note tone="warn">
&ldquo;The contract did not answer&rdquo; is a gap in what we know, not a no. Where the
        minting line reads that way, a question this service knows how to ask went unanswered. Treat
        it as unknown. Nothing on this page is grounds for concluding that the supply is beyond
        anyone's reach.
      </Note>

      <h2 className="ex-section__title">The moment this was true</h2>
      <dl className="ex-facts">
        <Fact label="Measured at block">
          <Link className="cf-num" to={linkTo.block(token.chain, token.network, token.observedAtBlock)}>
            {count(token.observedAtBlock)}
          </Link>
        </Fact>
        <Fact label="Hash proved at that height">
          <code className="cf-num ex-hex">{token.observedAtBlockHash}</code>
        </Fact>
        <Fact label="Top of the chain, per the provider">
          {token.tipHeight === null ? (
            <span className="ex-absent">none reported</span>
          ) : (
            <span className="cf-num">{count(token.tipHeight)}</span>
          )}
        </Fact>
      </dl>
      <Note>
Everything above was true at that block, which is the highest one this service has read for
        itself rather than a provider's report of where the chain ends. The provider's figure sits
        beside it only so you can judge how out of date the reading might be.
      </Note>
    </div>
  )
}
