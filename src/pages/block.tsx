/**
 * One block.
 *
 * `GET /v1/blocks/:chain/:network/:height` — `indexer/src/server.ts`, handler `blockByHeight`.
 *
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 * THE CONFIRMATION COUNT ON THIS PAGE IS AGAINST THE CLAIMED TIP, AND IT SAYS SO.
 *
 * `indexer/src/reads.ts` computes it as `confirmationsAt(tipHeight, record.height)` where
 * `tipHeight` is `checkpoint?.tipHeight` (`indexer/src/reads.ts`) — what a provider last
 * claimed, not what this service has walked. `indexer/src/reads.ts` reserves the walked head
 * for the two DECISION reads (`confirmation` and `tokenBalances`) and says why: counting against
 * blocks nobody here has looked at over-reports depth.
 *
 * So this page renders the number with `head="claimed-tip"`, which `Depth` labels, and it never
 * uses the word "final". The chain page is where the size of that gap can be read.
 *
 * ── There is no orphaned block here, and that is worth knowing before looking for one ──────────
 *
 * `blockAtHeight` filters `status <> 'orphaned'` (`indexer/src/store.ts`), so a height whose
 * block was retracted by a reorg is a **404 `block_not_found`** — "no such block on the canonical
 * chain" (`indexer/src/server.ts`) — rather than a 200 with an orphaned badge. The 404 screen
 * says that, because "we have never seen this height" and "the block we saw here is gone" look
 * identical from outside and mean different things.
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 */
import { useCallback } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Failed, Loading, Missing } from '../components/states.tsx'
import { Depth, DepthNote, Fact, Note } from '../components/tone.tsx'
import { count, timestamp } from '../lib/format.ts'
import { CONFIRMATIONS_AGAINST, getBlock, type BlockView } from '../lib/indexer.ts'
import { useResource } from '../lib/resource.ts'
import { linkTo } from '../lib/routes.ts'
import { parseScope } from '../lib/scope.ts'
import { UnknownScope } from './unknown-scope.tsx'

export function BlockPage() {
  const params = useParams()
  const scope = parseScope(params['chain'], params['network'])
  const height = params['height'] ?? ''

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
    'The chain index is not answering.',
    [scope?.chain, scope?.network, height],
  )

  if (!scope) return <UnknownScope chain={params['chain']} network={params['network']} />

  if (resource.state === 'loading') return <Loading label={`Fetching block ${height}`} />
  if (resource.error) {
    if (resource.error.code === 'unknown_chain' || resource.error.code === 'unknown_network') {
      return <UnknownScope chain={params['chain']} network={params['network']} />
    }
    if (resource.error.code === 'bad_height') {
      return (
        <Missing
          title="That is not a block height"
          hint="A height is a whole number, zero or above, of up to fifteen digits. Anything else is turned away before a database is asked about it."
          notice={resource.error}
        />
      )
    }
    if (resource.error.status === 404) {
      return (
        <Missing
          title={`Nothing stands at height ${height} on the accepted chain`}
          hint={
            'Two situations read alike here: this service may not have got that far yet, or the ' +
            'block that once sat there may have been taken back when the chain rewrote itself. ' +
            'Only the accepted chain is served from this address. Compare the height against how ' +
            'far the chain page says the walk has reached, and you will know which of the two it is.'
          }
          notice={resource.error}
        />
      )
    }
    return <Failed notice={resource.error} onRetry={resource.reload} />
  }
  const block = resource.data
  if (!block) return <Loading label={`Fetching block ${height}`} />

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
The depth below is measured from the top of the chain as an upstream provider last reported
        it (<code className="cf-num">indexer/src/reads.ts</code>), and that report can run
        ahead of the highest block read here. The{' '}
        <Link to={linkTo.chain(block.chain, block.network)}>chain page</Link> puts a number on the
        difference.
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
        <Fact label="Mined at">{timestamp(block.blockTime)}</Fact>
        <Fact label="Standing">{block.status}</Fact>
        <Fact label="Transactions it carries">
          <span className="cf-num">{count(block.txCount)}</span>
        </Fact>
        {block.reorgDepth !== null && (
          <Fact label="Depth of the rewrite recorded here">
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
Not one transaction from this block has been stored here.
          {block.txCount > 0 && (
            <>
              {' '}
The block&rsquo;s own header claims {count(block.txCount)}. The header has been read and the
              contents have not, which is why the two figures disagree — one is counted from stored
              rows (<code className="cf-num">indexer/src/store.ts</code>) and the other is what
              the chain itself declared (<code className="cf-num">txCount</code>).
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
          <h2 className="ex-section__title">The header, exactly as the node gave it</h2>
          <Note>
Kept and shown word for word, with nothing renamed and nothing reinterpreted. A field this
            page cannot make sense of is still a field you can hold up against your own node and
            compare.
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
