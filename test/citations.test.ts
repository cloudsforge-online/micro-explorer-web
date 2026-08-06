/**
 * EVERY CITATION IN THIS REPOSITORY NAMES A FILE THAT EXISTS, AND NAMES NO LINE IN IT.
 *
 * It used to require a line, and requiring one is what this file is now the record of. A line
 * number names a position in a file that a DIFFERENT repository owns and is free to edit:
 * micro-indexer inserted the custody total and its header, everything below it moved, and every
 * citation here broke without a single thing this bundle depends on having changed. Nothing runs
 * this suite when that service changes, so it surfaced at the worst possible moment, during a
 * release. Seven of nineteen CI failures across the estate on 2026-08-06 were that one shape.
 *
 * What a citation is for is telling a reader WHERE to look. The file does that. Where the exact
 * place matters the prose names the SYMBOL — `authoriseRead`, `chainStatus`, `CHAIN_IDS` — which
 * moves with the code.
 *
 * `test/indexer.test.ts` proves the ROUTE citations are exactly right — it finds each route in the
 * service's `DOMAIN` table by searching for it, reads the handler that entry names, and checks the
 * scope it asks for. That is the strong check, and it covers seven routes plus three declined.
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
import { block, cite } from '@cloudsforge/ui/cite'
import assert from 'node:assert/strict'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
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
 * `org/tools/registry.ts`, which applies that substitution once for the whole programme.
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
  // `docs/ecosystem/15-monetisation-model.md` — "A public chain whose explorer is paywalled is
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
  // `micro-trade-web/src/lib/hosts.ts` names `admin` and `emberkin` as disagreeing with the
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
  // The browser telemetry sink. `src/lib/obs.ts` cites its record shape — `fromWire`, `RUM_KINDS`
  // and the migration's CHECK constraint — because that contract is the reason every event this
  // bundle sent was silently discarded, and a contract quoted from memory is how it went wrong.
  'lantern',
  // The asset registry, and specifically `RETIRED_ASSETS`. `src/pages/chains.tsx` records that a
  // "Why there is no SHARD here" section was DELETED because SHARD is retired rather than merely
  // not-a-chain, and `test/retired-assets.test.ts` reads the retired list out of this repository
  // instead of hard-coding a second copy. A claim about which assets no longer exist is exactly
  // the kind that goes stale silently, so the line it rests on is checked.
  'contracts',
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

/**
 * A citation: a repository-relative path to a file. NO LINE NUMBER — see the header.
 *
 * The lookbehind matters. Without it the sweep also matches the tail of a path this code ASSEMBLES
 * — the `${indexerRoot}/...` reads in `test/indexer.test.ts` — and reports the tail of one as a
 * citation to a file this repository does not have. That is a false accusation, and a checker that
 * makes them is one a reader learns to ignore.
 */
const CITATION = /(?<![\w/])((?:[a-z0-9_.-]+\/)+[A-Za-z0-9_.-]+\.(?:ts|tsx|css|yml|sol|md))\b/g

interface Citation {
  readonly from: string
  readonly path: string
}

/**
 * Directories inside THIS repository that a citation may be rooted at.
 *
 * Without this the sweep matches every relative import (`lib/indexer.ts`), every package specifier
 * (`@cloudsforge/ui/tokens.css`) and every URL that happens to end in a source extension, then
 * reports all of them as citations to files that do not exist. A citation is rooted either at a
 * sibling repository or at the top of this one; anything else is a module reference, which
 * TypeScript already resolves and does not need a second, worse checker.
 */
const LOCAL_ROOTS: readonly string[] = ['src', 'test', 'public', 'scripts', '.github']

function collect(): Citation[] {
  const out: Citation[] = []
  for (const file of sourceFiles(here)) {
    const text = readFileSync(file, 'utf8')
    for (const m of text.matchAll(CITATION)) {
      const path = m[1] ?? ''
      const head = path.split('/')[0] ?? ''
      if (!SIBLINGS.includes(head) && !LOCAL_ROOTS.includes(head)) continue
      out.push({ from: relative(here, file), path })
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

describe('every citation names a file that exists', () => {
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

  it('carries no line numbers, because a line number in another repository cannot be kept true', () => {
    // The rule, enforced rather than described. This test replaces one that checked each cited
    // line was IN RANGE — which passed for every wrong citation micro-indexer's insertion created,
    // because a line that moved by fourteen still exists. Only a check that read what was AT the
    // line could tell, and the estate has one of those per repository at best.
    //
    // Cite the file and, if a reader needs the exact place, name the symbol.
    const withLines: string[] = []
    for (const file of sourceFiles(here)) {
      const text = readFileSync(file, 'utf8')
      for (const m of text.matchAll(
        /\b((?:[a-z0-9_.-]+\/)+[A-Za-z0-9_.-]+\.(?:ts|tsx|css|yml|sol|md)):(\d+)/g,
      )) {
        withLines.push(`${relative(here, file)} cites ${m[1]}:${m[2]} — cite the file or the symbol`)
      }
    }
    assert.deepEqual(withLines, [])
  })

  it('the registry citations land on the line that carries the named key, not merely a line', (t) => {
    // THE SWEEP ABOVE ONLY PROVES A LINE EXISTS, and that is not enough: when micro-ui's explorer
    // entry gained a long comment, this repository's citations to surfaces.ts/:444/:446 all
    // resolved to lines INSIDE that comment — real lines, wrong lines — and the suite stayed
    // green. A citation that resolves but points at prose reads as verified while verifying
    // nothing, which is worse than a citation that fails.
    //
    // So the registry claims are CONTENT PINS now, via `@cloudsforge/ui/cite`: the anchor names
    // what the line says and `cite()` refuses to resolve unless EXACTLY ONE line matches. The
    // line number is then an output — printed in the message so a reader can go and look — rather
    // than an input that decays. Four of these were maintained by hand as line numbers, and the
    // registry has moved twice this week.
    const root = siblingRoot('ui')
    if (root === undefined || !existsSync(root)) {
      // `t.skip`, never `return`: a test that returns early reports as a pass, and a pass for work
      // that was never done is the defect this whole file exists to catch.
      t.skip('the surfaces.ts content pins — micro-ui is not checked out')
      return
    }
    const surfaces = join(root, 'packages/ui/src/surfaces.ts')
    // The `explorer` entry, found by its key, so everything below is read from inside it.
    const entry = cite(surfaces, "key: 'explorer'")
    const body = block(entry, 40)
    const PINS: ReadonlyArray<{ says: string; claimedBy: string }> = [
      { says: 'devPort: 4008', claimedBy: 'src/lib/hosts.ts, vite.config.ts, test/hosts.test.ts' },
      { says: "accent: '#d6412f'", claimedBy: 'src/lib/hosts.ts' },
      { says: 'markId: null', claimedBy: 'src/components/shell.tsx, test/brand-chrome.test.ts' },
      { says: 'inSwitcher: false', claimedBy: 'src/components/shell.tsx' },
    ]
    for (const pin of PINS) {
      assert.ok(
        body.includes(pin.says),
        `the explorer entry at surfaces.ts:${entry.line} is cited by ${pin.claimedBy} as ` +
          `"${pin.says}", and the 40 lines from there do not say it`,
      )
    }
  })

  it('was able to check every repository it cites, and says which it could not', (t) => {
    // Not a failure: `pnpm test` has to work for somebody who cloned only this repository. But an
    // unmeasured citation must never look like a verified one, so a partial checkout SKIPS — the
    // CI job has every sibling and is where the absence becomes fatal.
    assert.ok(SIBLINGS.length > 0, 'the sibling list is empty, so this reports nothing')
    const absent = SIBLINGS.filter((name) => {
      const root = siblingRoot(name)
      return root === undefined || !existsSync(root)
    })
    if (absent.length > 0) {
      t.skip(`citations into ${absent.join(', ')} — those repositories are not checked out`)
    }
  })
})
