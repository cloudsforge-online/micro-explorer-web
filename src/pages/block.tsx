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
 * ── A BLOCK CAN NOW SAY WHAT WAS NOT STORED FOR IT, AND THIS PAGE READS THAT RATHER THAN
 *    LEAVING IT IN THE HEADER DUMP ────────────────────────────────────────────────────────────
 *
 * micro-indexer#7 (micro-org #253) began stamping `detail.partial` on blocks walked for a narrowed
 * address set (`indexer/src/btcsource.ts`). `detail` is already rendered verbatim at the foot of
 * this page, so before this change the marker WAS on screen — as a row reading `partial` /
 * `watched-addresses-only`, between whatever else the node happened to put in the header, in a
 * table whose own note says it shows fields "this page cannot make sense of". A field that decides
 * whether the transaction list below is the whole block is not a header curiosity, and a reader who
 * could work out what that row meant would not have needed the page.
 *
 * So it is read, worded, and put where the consequence is — above the transaction list, which is
 * the thing it qualifies. It stays in the verbatim table as well: that table's promise is that
 * nothing is renamed or dropped, and quietly removing a field once the page understands it would
 * break the one property it has.
 *
 * ── THE VERBATIM HEADER WAS FOUR FIELDS LONG, AND THE COPY ABOVE IT SAID IT WAS EVERYTHING ─────
 *
 * micro-org#395. This page has always rendered `detail` generically — `Object.entries`, no field
 * list, nothing curated — and still showed a reader of Hearth mainnet genesis exactly four rows:
 * `miner`, `gasUsed`, `gasLimit`, `difficulty`. The narrowing was a service away, in
 * `indexer/src/evm.ts`, which reduced the header to those four keys before it reached a database.
 * `stateRoot` was never stored, so no rendering of what this page was given could have shown it.
 *
 * That is worth saying here because it is the failure mode a reviewer of THIS file would have
 * looked for and not found: the promise was broken upstream of the code that makes it. Two things
 * change on this side of it.
 *
 * The copy now claims what this page can actually vouch for — every field THE CHAIN INDEX HOLDS,
 * rather than every field the node sent, which is a claim about somebody else's storage. A block
 * walked before micro-indexer's migration 10 re-walks it still has four fields in it, and a note
 * promising the node's whole header would be false again for exactly the reader who checks.
 *
 * And the rows are SORTED into the order a node lists a header in (`headerFields`), because
 * `blocks.detail` is a jsonb column and jsonb sorts keys by length: served as stored, the table
 * reads `hash, miner, nonce, number, size, gasUsed…`, which cannot be laid beside `curl` output by
 * eye. Sorting adds and removes nothing, and `test/render.test.ts` holds it to that.
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
import { count, partialBlockReason, timestamp } from '../lib/format.ts'
import {
  CONFIRMATIONS_AGAINST,
  getBlock,
  headerFields,
  partialMarker,
  type BlockView,
} from '../lib/indexer.ts'
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

  const partial = partialMarker(block.detail)

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
        it, and that report can run ahead of the highest block read here. The{' '}
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

      {/* Above the list, because it is a statement about the list. The withheld-balance panel's
          markup, for the same reason the address page reuses it: this is the same kind of sentence
          — what is not here and why — and a reader who has met it once should recognise it. */}
      {partial !== null && (
        <div className="ex-withheld" role="status">
          <p className="ex-withheld__title">
            <span aria-hidden="true">⊘</span> Not everything about this block was written down here.
          </p>
          <p className="ex-withheld__why">{partialBlockReason(partial)}</p>
          <dl className="ex-facts ex-facts--tight">
            <Fact label="What the block itself says was left out">
              <code className="cf-num ex-code">{partial}</code>
            </Fact>
          </dl>
        </div>
      )}

      {block.transactionHashes.length === 0 ? (
        <p className="ex-absent">
Not one transaction from this block has been stored here.
          {block.txCount > 0 && (
            <>
              {' '}
The block&rsquo;s own header claims {count(block.txCount)}. The header has been read and the
              contents have not, which is why the two figures disagree — one is counted from the
              transactions stored here, the other is what the chain itself declared in the header.
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
Every field the chain index holds for this block, shown word for word, with nothing renamed,
            nothing reinterpreted and nothing left out. A field this page cannot make sense of is
            still a field you can hold up against your own node and compare. They are listed in the
            order a node lists them, which is not the order they are stored in.
          </Note>
          <div className="ex-tablewrap">
            <table className="ex-table">
              <tbody>
                {headerFields(block.detail).map(([key, value]) => (
                  <tr key={key}>
                    <th scope="row">{key}</th>
                    <td className="cf-num ex-hex ex-hex--wrap">
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
