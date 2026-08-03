/**
 * EVERY `path:line` IN THIS REPOSITORY NAMES A LINE THAT EXISTS.
 *
 * `test/indexer.test.ts` proves the ROUTE citations are exactly right — it reads the line each
 * route is registered at and matches its `DOMAIN` entry, then reads each handler and checks the
 * scope it asks for. That is the strong check, and it covers seven routes plus two declined ones.
 * This repository carries hundreds of other citations: into `indexer/src/reads.ts`,
 * `indexer/src/tokenstate.ts`, `indexer/src/store.ts`, `indexer/src/chains.ts`, `identity`,
 * `ui/packages/ui/src/surfaces.ts`, `brand/plan.ts` and `market/src/indexerclient.test.ts`.
 *
 * A citation is the estate's unit of evidence and it decays silently. Three of the four sources
 * this programme inherited had drifted, and the README template says why it matters in one line:
 * "A claim nobody can check is worse than no claim, because it is believed."
 *
 * This file is the cheap, total check under the strong, narrow one. It cannot tell whether a
 * citation means what the sentence around it says — no mechanical check can — but it catches the
 * failure that actually happens, which is a file growing or shrinking under a line number nobody
 * re-read. When a sibling is not checked out, the citations into it are REPORTED as unchecked
 * rather than passed over in silence, so a green run never implies more than it measured.
 */
import assert from 'node:assert/strict'
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { extname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, it } from 'node:test'

const here = fileURLToPath(new URL('..', import.meta.url))

/**
 * Every sibling repository a citation in this repository reaches into.
 *
 * Enumerated rather than globbed, because a citation into a repository nobody listed here would
 * otherwise be silently treated as "not checked out" and never verified at all — the exact shape of
 * failure this file exists to catch.
 *
 * The estate checks each `cloudsforge-<name>` out as `<name>`, while the prose cites some of them
 * by their GitHub name, `micro-<name>`. Both spellings resolve to the same directory; see
 * `org/tools/registry.ts:8-11`, which applies that substitution once for the whole programme.
 */
const SIBLINGS: readonly string[] = [
  // The service this bundle is a client of. 268 citations, and `test/indexer.test.ts` checks the
  // route ones exactly rather than merely for existence.
  'indexer',
  'ui',
  // The corrected shape guard `test/indexer.test.ts` copies its `matches` from, and the
  // measurement of the collapsed-scope defect.
  'market',
  'brand',
  'identity',
  // `docs/ecosystem/15-monetisation-model.md:50` — "A public chain whose explorer is paywalled is
  // not a public chain", the estate's own position on the finding this repository is built around.
  // Worth checking rather than quoting from memory.
  'docs',
  'web-template',
  // Two citations, both about `Idempotency-Key`: micro-trade requires one on every mutation and
  // micro-indexer reads none, so the two clients look alike and are not interchangeable. That is
  // the kind of claim worth verifying rather than remembering.
  'trade',
  'org',
  // ── The devPort table, and the reason it is cited across five repositories ──────────────────
  //
  // `micro-trade-web/src/lib/hosts.ts:16-17` names `admin` and `emberkin` as disagreeing with the
  // registry, in the present tense. Both were corrected in micro-ui afterwards. Copying that
  // sentence into a new repository would have carried a FIXED defect forward as a live one —
  // which is the exact failure this whole sweep exists to catch, arriving by the route it always
  // arrives by: a claim inherited rather than re-read.
  //
  // So the corrected version cites the service each number was read from, and each of those
  // repositories is listed here and checked out in CI. A table of five numbers that nothing
  // verifies is how the sentence it replaces went wrong in the first place.
  'trade-web',
  'admin-api',
  'emberkin',
  'mint',
  // Cited by the template's api.ts, for the shape of the estate's error envelope. Not checked out
  // in CI, so these two are the ones the run reports as UNCHECKED — which is the honest answer
  // rather than a silent pass.
  'hub-api',
  'service-template',
]

// NOTE: `mint-web` is named in prose throughout this repository — the ten invented tokens, the
// flat `/auth/me` fallback — and is deliberately NOT listed above, because nothing here cites a
// LINE in it. Listing a repository that carries no citation would put it in the UNCHECKED notice
// for ever, which trains a reader to skim that notice — and the whole point of printing it is that
// somebody reads it.

/** Where a sibling is checked out. `micro-trade` and `trade` are the same directory. */
function siblingRoot(name: string): string | undefined {
  const bare = name.startsWith('micro-') ? name.slice('micro-'.length) : name
  if (!SIBLINGS.includes(bare)) return undefined
  if (bare === 'indexer') return process.env['CLOUDSFORGE_INDEXER_DIR'] ?? join(here, '../indexer')
  return join(here, `../${bare}`)
}

const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx', '.css', '.md', '.yml', '.html'])

function sourceFiles(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name === '.git') continue
    const full = join(dir, entry.name)
    if (entry.isDirectory()) out.push(...sourceFiles(full))
    else if (SOURCE_EXTENSIONS.has(extname(entry.name))) out.push(full)
  }
  return out
}

/** A citation: a repository-relative path, a colon, and one line number or a range. */
const CITATION = /\b((?:[a-z0-9_.-]+\/)+[A-Za-z0-9_.-]+\.(?:ts|tsx|css|yml|sol|md))\/?:(\d+)(?:-(\d+))?/g

interface Citation {
  readonly from: string
  readonly path: string
  readonly first: number
  readonly last: number
}

function collect(): Citation[] {
  const out: Citation[] = []
  for (const file of sourceFiles(here)) {
    const text = readFileSync(file, 'utf8')
    for (const m of text.matchAll(CITATION)) {
      const path = m[1] ?? ''
      const first = Number(m[2])
      out.push({ from: relative(here, file), path, first, last: m[3] ? Number(m[3]) : first })
    }
  }
  return out
}

/** Resolve a citation's path to a file on disk, or null when its repository is not checked out. */
function resolve(path: string): string | null {
  const [head, ...rest] = path.split('/')
  const root = siblingRoot(head ?? '')
  if (root === undefined) {
    // Not a sibling: a path inside THIS repository.
    const local = join(here, path)
    return existsSync(local) ? local : null
  }
  if (!existsSync(root)) return null
  const full = join(root, rest.join('/'))
  return existsSync(full) ? full : null
}

const CITATIONS = collect()

describe('every citation names a line that exists', () => {
  it('finds citations at all, so this cannot pass on an empty sweep', () => {
    // A regex that stopped matching would make this whole file a no-op that reads as a guarantee.
    assert.ok(CITATIONS.length >= 150, `found only ${CITATIONS.length} citations`)
  })

  it('cites more than one repository, because a client that only cites itself proves nothing', () => {
    const repos = new Set(CITATIONS.map((c) => c.path.split('/')[0]))
    assert.ok(repos.size >= 3, `citations reach only ${[...repos].join(', ')}`)
  })

  it('names a file that exists, wherever the repository is checked out', () => {
    const missing = CITATIONS.filter((c) => {
      const root = siblingRoot(c.path.split('/')[0] ?? '')
      // A sibling that is not checked out is UNCHECKED, not broken. Reported below.
      if (root !== undefined && !existsSync(root)) return false
      return resolve(c.path) === null
    })
    assert.deepEqual(
      missing.map((c) => `${c.from} cites ${c.path}, which does not exist`),
      [],
    )
  })

  it('names a line INSIDE that file', () => {
    const broken: string[] = []
    for (const c of CITATIONS) {
      const file = resolve(c.path)
      if (file === null) continue
      if (!statSync(file).isFile()) continue
      const lines = readFileSync(file, 'utf8').split('\n').length
      if (c.first < 1 || c.last > lines || c.last < c.first) {
        broken.push(`${c.from} cites ${c.path}:${c.first}-${c.last}, but that file has ${lines} lines`)
      }
    }
    assert.deepEqual(broken, [])
  })

  it('the registry citations land on the line that carries the named key, not merely a line', () => {
    // THE SWEEP ABOVE ONLY PROVES A LINE EXISTS, and that is not enough: when micro-ui's explorer
    // entry gained a long comment, this repository's citations to surfaces.ts:443/:444/:446 all
    // resolved to lines INSIDE that comment — real lines, wrong lines — and the suite stayed
    // green. A citation that resolves but points at prose reads as verified while verifying
    // nothing, which is worse than a citation that fails.
    //
    // So the surfaces.ts citations are checked for CONTENT: each must land on the line that
    // declares the key its sentence is about. The map is maintained by hand, which is the point —
    // moving the registry means updating a claim somebody can check.
    const root = siblingRoot('ui')
    if (root === undefined || !existsSync(root)) {
      console.log('UNCHECKED: the surfaces.ts content pins — micro-ui is not checked out')
      return
    }
    const lines = readFileSync(join(root, 'packages/ui/src/surfaces.ts'), 'utf8').split('\n')
    const PINS: ReadonlyArray<{ line: number; mustContain: string; claimedBy: string }> = [
      { line: 523, mustContain: 'devPort: 4008', claimedBy: 'src/lib/hosts.ts, vite.config.ts, test/hosts.test.ts' },
      { line: 524, mustContain: "accent: '#d6412f'", claimedBy: 'src/lib/hosts.ts' },
      { line: 526, mustContain: 'markId: null', claimedBy: 'src/components/shell.tsx, test/brand-chrome.test.ts' },
      { line: 528, mustContain: 'inSwitcher: false', claimedBy: 'src/components/shell.tsx' },
    ]
    for (const pin of PINS) {
      const text = lines[pin.line - 1] ?? ''
      assert.ok(
        text.includes(pin.mustContain),
        `surfaces.ts:${pin.line} is cited by ${pin.claimedBy} as "${pin.mustContain}" but reads: ${text.trim()}`,
      )
    }
  })

  it('reports which repositories were NOT available, rather than passing quietly', () => {
    // Not a failure: `pnpm test` has to work for somebody who cloned only this repository. But an
    // unmeasured citation must never look like a verified one, so the absence is printed and the
    // CI job that has every sibling checked out is where it becomes fatal.
    const absent = SIBLINGS.filter((name) => {
      const root = siblingRoot(name)
      return root === undefined || !existsSync(root)
    })
    if (absent.length > 0) {
      console.log(`UNCHECKED: citations into ${absent.join(', ')} — those repositories are not checked out`)
    }
    assert.ok(true)
  })
})
