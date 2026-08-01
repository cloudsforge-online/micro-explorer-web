/**
 * One block.
 *
 * `GET /v1/blocks/:chain/:network/:height` — `indexer/src/server.ts:160`, handler at `:514`.
 *
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 * THE CONFIRMATION COUNT ON THIS PAGE IS AGAINST THE CLAIMED TIP, AND IT SAYS SO.
 *
 * `indexer/src/reads.ts:570` computes it as `confirmationsAt(tipHeight, record.height)` where
 * `tipHeight` is `checkpoint?.tipHeight` (`indexer/src/reads.ts:559`) — what a provider last
 * claimed, not what this service has walked. `indexer/src/reads.ts:24-27` reserves the walked head
 * for the two DECISION reads (`confirmation` and `tokenBalances`) and says why: counting against
 * blocks nobody here has looked at over-reports depth.
 *
 * So this page renders the number with `head="claimed-tip"`, which `Depth` labels, and it never
 * uses the word "final". The chain page is where the size of that gap can be read.
 *
 * ── There is no orphaned block here, and that is worth knowing before looking for one ──────────
 *
 * `blockAtHeight` filters `status <> 'orphaned'` (`indexer/src/store.ts:195`), so a height whose
 * block was retracted by a reorg is a **404 `block_not_found`** — "no such block on the canonical
 * chain" (`indexer/src/server.ts:524`) — rather than a 200 with an orphaned badge. The 404 screen
 * says that, because "we have never seen this height" and "the block we saw here is gone" look
 * identical from outside and mean different things.
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 */
import { useCallback } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Failed, Loading, Missing, Refused } from '../components/states.tsx'
import { Depth, DepthNote, Fact, Note } from '../components/tone.tsx'
import { useSession } from '../lib/auth.tsx'
import { count, timestamp } from '../lib/format.ts'
import { CONFIRMATIONS_AGAINST, getBlock, type BlockView } from '../lib/indexer.ts'
import { useResource } from '../lib/resource.ts'
import { linkTo } from '../lib/routes.ts'
import { parseScope, scopeLabel } from '../lib/scope.ts'
import { UnknownScope } from './unknown-scope.tsx'

export function BlockPage() {
  const params = useParams()
  const scope = parseScope(params['chain'], params['network'])
  const height = params['height'] ?? ''
  const { status: sessionStatus } = useSession()

  const load = useCallback(
    (signal: AbortSignal) => {
      if (!scope) return Promise.reject(new Error('no scope'))
      return getBlock(scope, height, signal)
    },
    [scope?.chain, scope?.network, height],
  )
  const resource = useResource<BlockView>(
    load,
    () => 1,
    'The chain index could not be reached.',
    [scope?.chain, scope?.network, height],
  )

  if (!scope) return <UnknownScope chain={params['chain']} network={params['network']} />

  if (resource.state === 'loading') return <Loading label={`Reading block ${height}`} />
  if (resource.state === 'refused' && resource.error) {
    return (
      <Refused
        notice={resource.error}
        signedIn={sessionStatus === 'signedIn'}
        what={`block ${height} on ${scopeLabel(scope)}`}
      />
    )
  }
  if (resource.error) {
    if (resource.error.code === 'unknown_chain' || resource.error.code === 'unknown_network') {
      return <UnknownScope chain={params['chain']} network={params['network']} />
    }
    if (resource.error.code === 'bad_height') {
      return (
        <Missing
          title="That is not a block height"
          hint="A height is a non-negative integer of up to fifteen digits. The chain index refuses anything else outright rather than querying for it."
          notice={resource.error}
        />
      )
    }
    if (resource.error.status === 404) {
      return (
        <Missing
          title={`No block at height ${height} on the canonical chain`}
          hint={
            'Either this index has not walked that far yet, or the block that was there has been ' +
            'retracted by a reorg. This route serves the canonical chain only, so the two answer ' +
            'the same way — the chain page shows how far it has walked, which tells you which.'
          }
          notice={resource.error}
        />
      )
    }
    return <Failed notice={resource.error} onRetry={resource.reload} />
  }
  const block = resource.data
  if (!block) return <Loading label={`Reading block ${height}`} />

  return (
    <div className="ex-page">
      <header className="ex-page__head">
        <h1 className="ex-page__title">Block {count(block.height)}</h1>
        <p className="ex-page__id">
          <Link className="cf-num" to={linkTo.chain(block.chain, block.network)}>
            {block.chain}/{block.network}
          </Link>
        </p>
      </header>

      <DepthNote>
        This block&rsquo;s depth is counted against the tip a provider last claimed
        (<code className="cf-num">indexer/src/reads.ts:570</code>), which can be ahead of the
        highest block this index has actually walked. The{' '}
        <Link to={linkTo.chain(block.chain, block.network)}>chain page</Link> shows the gap.
      </DepthNote>

      <dl className="ex-facts">
        <Fact label="Depth">
          <Depth confirmations={block.confirmations} head={CONFIRMATIONS_AGAINST.block} />
        </Fact>
        <Fact label="Hash">
          <code className="cf-num ex-hex">{block.hash}</code>
        </Fact>
        <Fact label="Parent">
          <Link
            className="cf-num ex-hex"
            to={linkTo.block(block.chain, block.network, block.height - 1)}
            title={block.parentHash}
          >
            {block.parentHash}
          </Link>
        </Fact>
        <Fact label="Mined">{timestamp(block.blockTime)}</Fact>
        <Fact label="Status">{block.status}</Fact>
        <Fact label="Transactions">
          <span className="cf-num">{count(block.txCount)}</span>
        </Fact>
        {block.reorgDepth !== null && (
          <Fact label="Reorg depth recorded on this block">
            <span className="cf-num">{count(block.reorgDepth)}</span>
          </Fact>
        )}
      </dl>

      <nav className="ex-stepper" aria-label="Adjacent blocks">
        {block.height > 0 && (
          <Link className="cf-btn" to={linkTo.block(block.chain, block.network, block.height - 1)}>
            ← {count(block.height - 1)}
          </Link>
        )}
        <Link className="cf-btn" to={linkTo.block(block.chain, block.network, block.height + 1)}>
          {count(block.height + 1)} →
        </Link>
      </nav>

      <h2 className="ex-section__title">
        Transactions in this block ({count(block.transactionHashes.length)})
      </h2>
      {block.transactionHashes.length === 0 ? (
        <p className="ex-absent">
          This index holds no transaction rows for this block.
          {block.txCount > 0 && (
            <>
              {' '}
              The block header says it carries {count(block.txCount)}, so this is a block whose
              header has been walked and whose bodies have not — the two counts come from different
              places (<code className="cf-num">indexer/src/store.ts:1283-1287</code> lists the rows;{' '}
              <code className="cf-num">txCount</code> is the header&rsquo;s own figure).
            </>
          )}
        </p>
      ) : (
        <ul className="ex-hashlist">
          {block.transactionHashes.map((hash) => (
            <li key={hash}>
              <Link
                className="cf-num ex-hex"
                to={linkTo.transaction(block.chain, block.network, hash)}
              >
                {hash}
              </Link>
            </li>
          ))}
        </ul>
      )}

      {Object.keys(block.detail).length > 0 && (
        <>
          <h2 className="ex-section__title">What the node said</h2>
          <Note>
            The header fields this index stored verbatim. They are rendered as received, without
            being renamed or reinterpreted: a value this page does not understand is still a value
            somebody can check against their own node.
          </Note>
          <div className="ex-tablewrap">
            <table className="ex-table">
              <tbody>
                {Object.entries(block.detail).map(([key, value]) => (
                  <tr key={key}>
                    <th scope="row">{key}</th>
                    <td className="cf-num ex-hex">
                      {typeof value === 'string' || typeof value === 'number'
                        ? String(value)
                        : JSON.stringify(value)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}
