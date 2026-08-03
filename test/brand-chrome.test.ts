/**
 * A frontend ships its own browser chrome, or it ships none at all.
 *
 * FOUR FINISHED FRONTENDS SHIPPED WITH NO FAVICON AT ALL and went green in CI, because nothing
 * anywhere asserted that a page has an icon (18-build-status.md §3.3e). The checks below are the
 * template's, kept in both directions and unweakened.
 *
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 * ── THIS SURFACE HAS NO MARK, AND THAT IS A DECISION RATHER THAN A GAP ────────────────────────
 *
 * `explorer` carries `markId: null` in the registry (`ui/packages/ui/src/surfaces.ts:526`) and
 * `brand/assets/explorer/` deliberately holds favicons and an og card ONLY.
 * `brand/plan.ts:50-62` gives the reason: a status page is Beacon with its internals removed and
 * an explorer is part of Forge Network, so "neither should claim a mark of its own" — but each is
 * served from its own subdomain, and "a browser tab and a shared link inherit nothing".
 *
 * So the absence is asserted, in both directions: nothing in public/ is a mark, nothing in src
 * renders one, and no chrome here is designed around one. A test that only checked for presence
 * would let a mark be generated for this surface later without anybody noticing that a decision
 * had been reversed.
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 *
 * ── And the icons must reach the IMAGE, not only the repository ────────────────────────────────
 *
 * The last two tests are the ones that matter most. The web template's Dockerfile once did not
 * copy `public/`, so every frontend cut from it built an image whose `dist/` had no icons — while
 * a test exactly like this one passed, because it reads the SOURCE tree. That is fixed upstream
 * (`micro-web-template/Dockerfile:39`, read for this repository rather than taken on a sibling's
 * word), so the tests below are a guard rather than a correction. They are still worth their
 * lines: reading a Dockerfile is not evidence that an image serves a file, which is why the second
 * of them requires CI to CURL the running container.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const at = (p: string) => fileURLToPath(new URL(`../${p}`, import.meta.url))
const HTML = readFileSync(at('index.html'), 'utf8')

/** The sizes a browser and an install prompt actually ask for. */
const REQUIRED_ICONS = ['favicon-32x32.png', 'favicon-192x192.png']

/** The card a chat client, a search result and a social post render. */
const OG_CARD = 'og-1200x630.png'

const BRAND = '../brand/assets/explorer'

test('the icons a browser asks for are present in public/', () => {
  const missing = REQUIRED_ICONS.filter((f) => !existsSync(at(`public/${f}`)))
  assert.deepEqual(
    missing,
    [],
    `public/ is missing ${missing.join(', ')} — copy them from micro-brand's assets/explorer/`,
  )
})

test('index.html links every icon it ships, and ships every icon it links', () => {
  // Both directions. A link to a file that is not there is a 404 in every tab; a file nobody links
  // is dead weight that looks like it is working.
  for (const f of REQUIRED_ICONS) {
    assert.ok(HTML.includes(f), `index.html does not link /${f}`)
  }
  for (const m of HTML.matchAll(/href="\/(favicon[^"]*)"/g)) {
    assert.ok(existsSync(at(`public/${m[1]}`)), `index.html links /${m[1]}, which is not in public/`)
  }
})

test('the icons are this surface’s own, byte for byte', () => {
  // The template ships the company marks so that a freshly cut frontend is never iconless. Leaving
  // them in place passes every check above and puts the wrong brand in the tab.
  for (const icon of [...REQUIRED_ICONS, 'favicon-512x512.png', OG_CARD]) {
    const source = at(`${BRAND}/${icon}`)
    if (!existsSync(source)) continue
    assert.deepEqual(
      readFileSync(at(`public/${icon}`)),
      readFileSync(source),
      `public/${icon} is not the byte-identical copy from brand/assets/explorer/`,
    )
  }
})

test('THE BRAND SET REALLY CONTAINS NO MARK, so shipping none is following it rather than missing it', () => {
  // The assertion that makes the decision checkable. If micro-brand ever generates a mark for this
  // surface, this fails and somebody has to decide deliberately whether to wire it — rather than a
  // mark sitting unused in a directory, or being copied in without anybody noticing that
  // `markId: null` said not to.
  if (!existsSync(at(BRAND))) return // the sibling is not checked out; CI has it.
  const files = readdirSync(at(BRAND)).filter((f) => f.endsWith('.png') || f.endsWith('.svg'))
  const marks = files.filter((f) => /mark|wordmark|logo/i.test(f))
  assert.deepEqual(
    marks,
    [],
    `brand/assets/explorer/ now holds ${marks.join(', ')}. explorer carries markId: null in the ` +
      'registry (surfaces.ts:526) and brand/plan.ts:50-62 says why. Read both before wiring it.',
  )
  // And it holds what a separate hostname does need.
  for (const needed of [...REQUIRED_ICONS, OG_CARD]) {
    assert.ok(files.includes(needed), `brand/assets/explorer/ no longer holds ${needed}`)
  }
})

test('nothing in this bundle renders a mark or a wordmark of its own', () => {
  const src = readdirSync(at('src'), { recursive: true, encoding: 'utf8' })
    .filter((f) => f.endsWith('.tsx') || f.endsWith('.ts') || f.endsWith('.css'))
    .map((f) => readFileSync(at(`src/${f}`), 'utf8'))
    .join('\n')
    // Comments stripped: this repository EXPLAINS why it has no mark, in several files.
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
  assert.doesNotMatch(src, /mark-explorer/, 'this surface has no asset-forge mark id')
  assert.doesNotMatch(src, /<Wordmark|cf-logo__word/, 'this surface renders no wordmark')
})

test('the og card is shipped, because this surface’s links are shared outward', () => {
  // A block explorer's links are pasted into chat and support tickets constantly, which is the
  // exact argument brand/plan.ts:50-62 makes for giving a public child surface a card.
  assert.ok(existsSync(at(`public/${OG_CARD}`)), `public/${OG_CARD} is missing`)
  assert.match(HTML, /property="og:image"/, 'index.html declares no og:image')
  assert.match(HTML, /property="og:title"/, 'index.html declares no og:title')
  assert.match(HTML, /property="og:description"/, 'index.html declares no og:description')
})

test('the og:image is a RELATIVE path, so the card resolves against whichever origin served it', () => {
  // An absolute one would be a hostname baked into the bundle — the exact thing this repository
  // has no build-time configuration in order to avoid.
  const m = /property="og:image"\s+content="([^"]+)"/.exec(HTML)
  assert.ok(m, 'no og:image content')
  assert.ok(m[1]?.startsWith('/'), `og:image is ${m[1]}, which is not a relative path`)
  assert.ok(existsSync(at(`public${m[1]}`)), `og:image points at ${m[1]}, which is not in public/`)
})

test('the og metadata is declared ONCE', () => {
  // foresight-web/index.html declares og:type, og:title and og:description twice. The second set
  // silently wins in every crawler and the first is dead text that nobody edits. Reported there.
  for (const property of ['og:type', 'og:title', 'og:description', 'og:image']) {
    const count = [...HTML.matchAll(new RegExp(`property="${property}"`, 'g'))].length
    assert.equal(count, 1, `${property} is declared ${count} times`)
  }
})

test('the shared card claims no finality', () => {
  // A social card is read WITHOUT the surrounding page, which makes it the easiest place on the
  // whole surface to imply certainty by accident. It is also the copy a crawler indexes.
  const description = /property="og:description"\s+content="([^"]+)"/.exec(HTML)?.[1] ?? ''
  assert.ok(description.length > 0, 'no og:description')
  assert.doesNotMatch(
    description,
    /\b(final|finalised|finalized|irreversible|guaranteed|confirmed for ?ever)\b/i,
    'the shared card claims finality',
  )
})

test('index.html does NOT tell crawlers to stay away', () => {
  // The mirror of admin-web's assertion, and the reason this file differs from that one. A noindex
  // here would suppress the reference pages this surface exists to have read —
  // docs/ecosystem/15-monetisation-model.md:50: "A public chain whose explorer is paywalled is not
  // a public chain."
  assert.doesNotMatch(HTML, /name="robots"[^>]*noindex/)
})

test('public/ holds no stray brand asset that nothing links', () => {
  // A file nobody links is dead weight that looks like it is working, and this is how an old
  // product's mark survives a rebrand in one repository.
  const linked = new Set([...HTML.matchAll(/(?:href|content)="\/([^"]+\.png)"/g)].map((m) => m[1]))
  const stray = readdirSync(at('public')).filter((f) => f.endsWith('.png') && !linked.has(f))
  assert.deepEqual(stray, [], `public/ holds ${stray.join(', ')}, which index.html does not link`)
})

test('the accent and substrate are declared on <html>, before React can paint', () => {
  // Set by React, the page paints the default ember and then changes colour.
  assert.match(HTML, /data-cf-product="network"/)
  assert.match(HTML, /data-cf-substrate="warm"/)
})

test('the accent selector this page names really exists, and "explorer" would NOT have', () => {
  // ══════════════════════════════════════════════════════════════════════════════════════════
  // THE CHECK THAT WOULD HAVE CAUGHT ADMIN'S, MADE SHARP FOR THIS SURFACE.
  //
  // A `data-cf-product` with no matching block is not an error anywhere: the page inherits the
  // company ember and nothing says so. platform/apps/admin/index.html did that for as long as
  // nobody looked, and tokens.css says at :389-396 that "every key an app may set is declared"
  // precisely to stop it.
  //
  // `explorer` is the key that is still missing one. Setting the obvious value here would have
  // reproduced admin's bug exactly. `network` is correct because it carries the same accent the
  // registry gives this surface — asserted below rather than assumed. Reported to micro-ui.
  // ══════════════════════════════════════════════════════════════════════════════════════════
  const tokens = at('../ui/packages/ui/src/tokens.css')
  if (!existsSync(tokens)) return // the sibling design system is not checked out; CI has it.
  const css = readFileSync(tokens, 'utf8')
  assert.match(css, /\[data-cf-product='network'\]/, 'the selector this page names has gone')
  // The absence, so the day micro-ui adds an explorer block this fails and index.html is corrected.
  assert.doesNotMatch(
    css,
    /\[data-cf-product='explorer'\]/,
    "tokens.css now has an explorer block; index.html should name it rather than network's",
  )
  // And they really are the same colour, which is the whole reason network is the right stand-in.
  const surfaces = at('../ui/packages/ui/src/surfaces.ts')
  if (!existsSync(surfaces)) return
  // 1600, not 400: the registry entry gained a long comment explaining why its devPort names the
  // indexer's port rather than this bundle's own, and the accent fell outside the window. The
  // window is how far the search looks, not what it asserts — the equality below is unchanged.
  const entry = /key: 'explorer',[\s\S]{0,1600}?accent: '(#[0-9a-fA-F]{6})'/.exec(
    readFileSync(surfaces, 'utf8'),
  )
  assert.ok(entry, 'the explorer entry has gone from the surface registry')
  const network = /\[data-cf-product='network'\] \{\s*--cf-accent: (#[0-9a-fA-F]{6});/.exec(css)
  assert.ok(network, "network's accent block has gone")
  assert.equal(
    entry[1],
    network[1],
    `the registry gives explorer ${entry[1]} and network's block is ${network[1]}; they must agree ` +
      'for index.html to be allowed to borrow it',
  )
})

test('the Dockerfile copies public/ into the build context', () => {
  // Without it Vite has no publicDir to copy into dist, and the image ships with no icons at all
  // while this very test passes, because it reads the SOURCE tree. That is how four frontends
  // shipped iconless. Fixed in the template at micro-web-template/Dockerfile:39; pinned here so it
  // cannot be lost again, and backed by the container probe in ci.yml, which is the only check that
  // could have caught it in the first place.
  const dockerfile = readFileSync(at('Dockerfile'), 'utf8')
  assert.match(
    dockerfile,
    /^COPY public \.\/public$/m,
    'the Dockerfile does not copy public/, so the built image will have no favicon',
  )
})

test('the template really does carry that line, rather than a sibling saying so', () => {
  const template = at('../web-template/Dockerfile')
  if (!existsSync(template)) return // not checked out; CI has it.
  const lines = readFileSync(template, 'utf8').split('\n')
  assert.equal(
    (lines[38] ?? '').trim(),
    'COPY public ./public',
    `micro-web-template/Dockerfile:39 is: ${lines[38]}`,
  )
})

test('CI probes the running container for the icons AND the card', () => {
  // The test above reads a file; only a request to the image proves the artefact serves them.
  const ci = readFileSync(at('.github/workflows/ci.yml'), 'utf8')
  for (const asset of [...REQUIRED_ICONS, 'favicon-512x512.png', OG_CARD]) {
    assert.ok(ci.includes(asset), `ci.yml does not probe /${asset} against the image`)
  }
})
