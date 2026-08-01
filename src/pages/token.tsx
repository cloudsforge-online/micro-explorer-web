/**
 * A token contract's supply and authorities, as the contract itself reports them.
 *
 * `GET /v1/tokens/:chain/:network/:address` — `indexer/src/server.ts:159`, handler at `:493`.
 *
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 * THREE FAILURES, THREE MEANINGS, THREE SCREENS.
 *
 * This route exists because `micro-mint` could not tell them apart, and every ForgeMint project
 * page rendered its supply and authorities as unknown, permanently
 * (`indexer/src/server.ts:144-147`). The handler's own comment sets out the split
 * (`indexer/src/server.ts:478-492`):
 *
 *   **404 `token_not_found`** — this service asked the chain and there is no contract answering
 *   `totalSupply()` at that address, at the block it has walked. A REAL answer. A contract
 *   deployed above the walked head reads as this, and that is honest.
 *
 *   **404 `not_found`** — the router's. This bundle asked for a path the service does not serve.
 *   Entirely different, and a defect here rather than a fact about any chain.
 *
 *   **501 / 503** — `TokenStateUnavailableError` (`indexer/src/tokenstate.ts:136-157`). The
 *   observation could not be MADE. `family_not_supported` is 501 because no amount of waiting will
 *   change it; the other four are 503 because a provider, a head or a follower is behind
 *   (`indexer/src/server.ts:274-283`). **Never rendered as "no token here".**
 *
 * ── The observation is as at a block, and the block is named ──────────────────────────────────
 *
 * `observedAtBlock` is the stored canonical head the call was made at, and `observedAtBlockHash` is
 * the hash this service walked at that height "and proved the node still serves"
 * (`indexer/src/tokenstate.ts:126-129`). `tipHeight` sits beside it "for staleness, never read
 * against" (`:130-131`). All three are shown, because a supply figure with no block attached is a
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

/** The five faults `observe` can raise (`indexer/src/tokenstate.ts:136-141`). */
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
    'The chain index could not be reached.',
    [scope?.chain, scope?.network, address],
  )

  if (!scope) return <UnknownScope chain={params['chain']} network={params['network']} />

  if (resource.state === 'loading') return <Loading label="Asking the chain about this contract" />
  if (resource.error) {
    const code = resource.error.code ?? ''

    // ── COULD NOT ASK. Never "there is no token here". ────────────────────────────────────────
    if (FAULTS.has(code)) {
      return (
        <div className="ex-page">
          <header className="ex-page__head">
            <h1 className="ex-page__title">The chain could not be asked</h1>
          </header>
          <p className="ex-page__hash">
            <code className="cf-num ex-hex">{address}</code>
          </p>
          <div className="ex-withheld" role="alert">
            <p className="ex-withheld__title">
              <span aria-hidden="true">▲</span> This is not an answer about the contract.
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
                    ? ' — permanent for this build'
                    : ' — try again once the index has caught up'}
                </span>
              </Fact>
            </dl>
            <p className="ex-withheld__note">
              &ldquo;I could not ask the chain&rdquo; and &ldquo;there is no token at that
              address&rdquo; are different answers, and a consumer that cannot tell them apart
              renders the second when it means the first
              (<code className="cf-num">indexer/src/server.ts:274-283</code>). This page does not.
            </p>
          </div>
          {resource.error.status !== 501 && (
            <div className="ex-stepper">
              <button type="button" className="cf-btn" onClick={resource.reload}>
                Ask again
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
          title="That is not an address for this chain"
          hint="A contract address is an address, and it is normalised exactly as one — so the EIP-55 checksum form every wallet displays is accepted. This one is not a 20-byte hex address at all."
          notice={resource.error}
        />
      )
    }
    if (code === 'token_not_found') {
      return (
        <Missing
          title="No token at that address"
          hint={
            'This index asked the chain and found no contract answering totalSupply() there, at ' +
            'the block it has walked. A contract deployed above that block reads the same way — ' +
            'which is honest rather than wrong. The chain page shows how far it has walked.'
          }
          notice={resource.error}
        />
      )
    }
    if (resource.error.status === 404) {
      return (
        <Missing
          title="Not answered"
          hint="The chain index does not serve the path this page asked for."
          notice={resource.error}
        />
      )
    }
    return <Failed notice={resource.error} onRetry={resource.reload} />
  }

  const token = resource.data
  if (!token) return <Loading label="Asking the chain about this contract" />

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
          See what has moved in and out of this address
        </Link>
        {' · '}
        <Link className="cf-num" to={linkTo.chain(token.chain, token.network)}>
          {token.chain}/{token.network}
        </Link>
      </p>

      {token.halted && (
        <Note tone="warn">
          This index has stopped vouching for this chain after a reorg past the alarm depth. The
          observation below was still made at a block it walked, but the chain it walked may not be
          the chain that now exists.
        </Note>
      )}

      <h2 className="ex-section__title">Supply</h2>
      <dl className="ex-facts">
        <Fact label="Total supply (smallest units)">
          {token.totalSupply === null ? (
            <span className="ex-absent">the contract does not report one</span>
          ) : (
            <span className="cf-num">{units(token.totalSupply)}</span>
          )}
        </Fact>
        <Fact label="Cap (smallest units)">
          {token.cap === null ? (
            <span className="ex-absent">uncapped, or the contract implements no cap</span>
          ) : (
            <span className="cf-num">{units(token.cap)}</span>
          )}
        </Fact>
        <Fact label="Decimals">
          {token.decimals === null ? (
            <span className="ex-absent">the contract does not report one</span>
          ) : (
            <span className="cf-num">{count(token.decimals)}</span>
          )}
        </Fact>
      </dl>
      <Note>
        Both figures are the contract&rsquo;s own smallest units and are printed undivided. Null
        means the contract does not implement the method, which is a different statement from zero —
        an uncapped token and a token with a cap of nought are not the same token.
      </Note>

      <h2 className="ex-section__title">Authorities</h2>
      <dl className="ex-facts">
        <Fact label="Owner">
          {token.owner === null ? (
            <span className="ex-absent">the contract implements no owner()</span>
          ) : (
            <Link className="cf-num ex-hex" to={linkTo.address(token.chain, token.network, token.owner)}>
              {token.owner}
            </Link>
          )}
        </Fact>
        <Fact label="Can the supply still grow?">
          {token.mintAuthority === null ? (
            <span className="ex-absent">this index cannot tell from the contract</span>
          ) : token.mintAuthority ? (
            <strong>Yes — something can still mint.</strong>
          ) : (
            'No — nothing can increase the supply.'
          )}
        </Fact>
        <Fact label="Paused">
          {token.paused === null ? (
            <span className="ex-absent">the contract implements no pause</span>
          ) : token.paused ? (
            <strong>Yes — transfers are paused.</strong>
          ) : (
            'No'
          )}
        </Fact>
      </dl>
      <Note tone="warn">
        &ldquo;This index cannot tell&rdquo; is not the same as &ldquo;no&rdquo;. A null mint
        authority means the contract did not answer a question this index knows how to ask — it is
        not evidence that the supply is fixed, and nothing on this page should be read as that
        assurance.
      </Note>

      <h2 className="ex-section__title">When this was true</h2>
      <dl className="ex-facts">
        <Fact label="Observed at block">
          <Link className="cf-num" to={linkTo.block(token.chain, token.network, token.observedAtBlock)}>
            {count(token.observedAtBlock)}
          </Link>
        </Fact>
        <Fact label="Block hash proved at that height">
          <code className="cf-num ex-hex">{token.observedAtBlockHash}</code>
        </Fact>
        <Fact label="Tip a provider claimed">
          {token.tipHeight === null ? (
            <span className="ex-absent">none observed</span>
          ) : (
            <span className="cf-num">{count(token.tipHeight)}</span>
          )}
        </Fact>
      </dl>
      <Note>
        The whole answer is as at the block above — the stored canonical head, not the claimed tip.
        The tip is shown so staleness can be judged, and is never what the observation was made
        against (<code className="cf-num">indexer/src/tokenstate.ts:126-131</code>).
      </Note>
    </div>
  )
}
