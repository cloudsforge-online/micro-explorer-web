/**
 * The @cloudsforge/ui 1.1 layer, as this surface wires it: the scheme attribute, the consent gate,
 * the shared skip link, and the per-address head.
 *
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 * THE ASSERTION THIS FILE EXISTS FOR IS THE ABSENCE OF A SCRIPT TAG
 *
 * `@cloudsforge/ui/consent` will only load Google Analytics from one call site — `grantConsent()`,
 * reached only from the Accept button in `CookieBanner`. That guarantee is worth exactly as much
 * as the guarantee that nobody pastes the stock snippet into `index.html`, where it would fetch a
 * third-party script and set `_ga` before any banner had been drawn. Under ePrivacy Art. 5(3) that
 * is a violation on load that a banner underneath it does not cure.
 *
 * It matters more on a block explorer than on most surfaces. The addresses here ARE the reader's
 * data: a page view reported with `/tx/<chain>/<network>/<hash>` attached tells a third party which
 * transaction a given browser looked up, before that browser was asked.
 *
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 * AND THE SECOND ONE IS THAT THE TWO COPIES OF THE DESCRIPTION AGREE
 *
 * `index.html` carries a static description — that is what a link-preview fetcher gets, because the
 * ones used by chat clients generally do not execute JavaScript — and `DocumentMeta` writes one at
 * runtime, which is what a browser and the crawlers that do execute JavaScript see. Two copies of
 * one sentence is exactly the shape `site` drifted in: its shell and its application disagreed
 * about the home page's own description for as long as it took somebody to open the served HTML.
 * So the runtime copy is a constant and this file compares the static one against it.
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, it } from 'node:test'
import { surface } from '@cloudsforge/ui/surfaces'
import { surfaceMeta } from '@cloudsforge/ui/seo'
import { ANALYTICS_META_NAME, CONSENT_STORAGE_KEY } from '@cloudsforge/ui/consent'
import { PRODUCT, SURFACE_DESCRIPTION } from '../src/lib/hosts.ts'
import { NAV } from '../src/lib/routes.ts'

const read = (file: string): string => readFileSync(new URL(`../${file}`, import.meta.url), 'utf8')

const html = read('index.html')
const shell = read('src/components/shell.tsx')
const main = read('src/main.tsx')
const styles = read('src/styles.css')

/** A file with its comments removed — every one of these quotes what it forbids. */
const rendered = (source: string): string =>
  source
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')

const metaContent = (name: string): string | null =>
  new RegExp(`<meta\\s+name="${name}"\\s+content="([^"]*)"\\s*/>`).exec(html)?.[1] ?? null

describe('the scheme attribute', () => {
  it('is on <html>, statically, beside the other two', () => {
    // Statically, and for the same reason the other two are: a page that paints before the
    // attribute lands flashes one palette and then changes to the other.
    //
    // Read off the COMMENT-STRIPPED document. The block above the doctype explains what those
    // attributes are and names `<html>` while doing it, so a scan of the raw text finds the
    // explanation first and reports the real tag as missing.
    const tag = /<html[^>]*>/.exec(rendered(html))?.[0] ?? ''
    assert.match(tag, /data-cf-product="network"/)
    assert.match(tag, /data-cf-substrate="warm"/)
    assert.match(tag, /data-cf-scheme="auto"/)
  })

  it('declares color-scheme with the spelling the standard uses, and both values', () => {
    // `colour-scheme` was here. It is correct English and it is not a registered meta name, so no
    // browser has ever read it — which on this surface meant the chain `<select>` and the paste
    // box on the front page were drawn with light chrome on a dark page.
    assert.equal(metaContent('colour-scheme'), null, 'the inert British spelling is back')
    assert.equal(metaContent('color-scheme'), 'dark light')
  })

  it('is not contradicted from the stylesheet, which is where it used to be', () => {
    /*
     * `body { color-scheme: dark }` was declared in src/styles.css and had to go. `color-scheme`
     * is INHERITED, so a declaration on `body` beats the inherited one from `<html>` for the body
     * and everything under it — the whole page. A reader on a light system would have got the
     * light palette with every native control still drawn dark.
     */
    assert.doesNotMatch(rendered(styles), /color-scheme\s*:/, 'src/styles.css sets color-scheme')
  })
})

describe('analytics: the measurement ID, and never the tag', () => {
  it('carries the ID as a meta tag, under the name the consent module reads', () => {
    const id = metaContent(ANALYTICS_META_NAME)
    assert.ok(id, `index.html has no <meta name="${ANALYTICS_META_NAME}">`)
    // The same shape check `analyticsId()` applies, so a placeholder nobody substituted fails here
    // rather than silently disabling measurement in production.
    assert.match(id, /^G-[A-Z0-9]{4,20}$/i)
  })

  it('loads no third-party script from the shell, and does not even name the host', () => {
    // Asserted on the RAW file rather than the rendered one: the point is that a grep over this
    // document returns nothing, so the absence is checkable rather than asserted. The domain is
    // assembled here so this test does not defeat its own check.
    const tagHost = `googletag${'manager'}.com`
    assert.ok(!html.includes(tagHost), 'index.html names the tag host')
    assert.ok(!html.includes('gtag'), 'index.html mentions gtag')
    /*
     * Exactly one `<script>` in the document, and its `src` is a path on this origin — the app's
     * own module entry, which Vite rewrites to a hashed bundle. Anything with a scheme or a
     * protocol-relative `//` in it is a third party, and there is no third party this document is
     * allowed to fetch before a reader has answered the banner.
     */
    const scripts = [...rendered(html).matchAll(/<script[^>]*\ssrc="([^"]*)"/g)].map(
      (m) => m[1] ?? '',
    )
    assert.deepEqual(scripts, ['/src/main.tsx'])
    for (const src of scripts) {
      assert.match(src, /^\//, `index.html fetches ${src}, which is not on this origin`)
      assert.ok(!src.startsWith('//'), `index.html fetches ${src}, which is protocol-relative`)
    }
  })

  it('primes the denied default before React mounts and before the session hand-off', () => {
    const source = rendered(main)
    assert.match(source, /import \{ initAnalytics \} from '@cloudsforge\/ui\/consent'/)
    const primed = source.indexOf('initAnalytics()')
    const boot = source.indexOf('bootstrapSession()')
    const render = source.indexOf('createRoot(')
    assert.ok(primed > 0, 'main.tsx never calls initAnalytics()')
    assert.ok(primed < boot, 'initAnalytics() runs after the session hand-off')
    assert.ok(primed < render, 'initAnalytics() runs after the first render')
  })

  it('renders the banner last in the document, so it is last in the tab order', () => {
    const source = rendered(shell)
    assert.match(source, /<CookieBanner \/>/)
    assert.ok(
      source.indexOf('<CookieBanner />') > source.indexOf('</MainRegion>'),
      'the banner is rendered before the main region, so it is reached before the page is',
    )
  })
})

describe('nothing else is persisted, which is the property this surface turns on', () => {
  it('the consent record is the only key this bundle may write', () => {
    /*
     * ══════════════════════════════════════════════════════════════════════════════════════════
     * THE HAZARD THE 1.1 WORK HAD TO NOT UNDO.
     *
     * `src/lib/network.ts` derives the network from the HOSTNAME and stores nothing, deliberately:
     * "a persisted network selection is how somebody checks the wrong chain and concludes their
     * funds are missing, and the cheapest defence against it is having nowhere to persist one".
     * `CookieBanner` brought the first `localStorage` key this shell has ever had, and this asserts
     * it is the consent record and nothing else — that adopting a consent banner did not quietly
     * open a drawer for a network, a chain or a search term to be put in.
     *
     * `test/network.test.ts` holds the other half: that module reads no storage at all.
     * ══════════════════════════════════════════════════════════════════════════════════════════
     */
    assert.equal(CONSENT_STORAGE_KEY, 'cf.consent.analytics')
    const source = rendered(shell)
    for (const store of ['localStorage', 'sessionStorage', 'document.cookie', 'indexedDB']) {
      assert.ok(!source.includes(store), `the shell reaches for ${store}`)
    }
  })

  it('the network is still a fact read off the address, not a control', () => {
    // Asserted from the shell as well as from search.tsx, because the shell is the layout route:
    // a selector added here would appear on every page at once.
    const source = rendered(shell)
    assert.match(source, /deploymentNetwork\(\)/, 'the shell no longer derives the network')
    assert.ok(!/<select/.test(source), 'the shell renders a selector')
    assert.ok(!/onChange/.test(source), 'the shell renders a control that changes something')
  })
})

describe('the skip link, which used to be half a pattern', () => {
  it('is the shared one, and the local anchor and its rule are both gone', () => {
    // The local `.ex-skip` pointed at `#main`, and `<main id="main">` carried no `tabIndex={-1}`.
    // A `<main>` is not focusable by default, so following the link scrolled the page, left focus
    // on the link, and sent the next Tab back into the company bar.
    const source = rendered(shell)
    assert.match(source, /<SkipLink>/)
    assert.ok(!source.includes('ex-skip'), 'the local skip anchor is still rendered')
    // Comment-stripped: the rule's gravestone in that file names the class it deleted, which is
    // the note a reader needs and would otherwise fail this check.
    assert.ok(!rendered(styles).includes('.ex-skip'), 'src/styles.css still declares .ex-skip')
  })

  it('targets a main region that is focusable, which is the half that was missing', () => {
    const source = rendered(shell)
    assert.match(source, /<MainRegion className="ex-main">/)
    assert.ok(!/<main\b/.test(source), 'the shell still writes its own <main>')
  })

  it('is the first focusable thing in the document', () => {
    const source = rendered(shell)
    assert.ok(
      source.indexOf('<SkipLink>') < source.indexOf('<CloudsForgeBar'),
      'the company bar is reached before the skip link',
    )
  })
})

describe('the per-address head', () => {
  it('uses the REGISTRY key, which is not the accent key', () => {
    /*
     * `index.html` names `data-cf-product="network"` because tokens.css has no `explorer` accent
     * block to name (`src/lib/hosts.ts`). The REGISTRY, by contrast, has a real `explorer` row
     * carrying this surface's own name and blurb, and that is the row a title comes from. Two
     * different questions; answering both with one constant would put "Forge Network" in the tab.
     */
    assert.equal(PRODUCT, 'explorer')
    assert.equal(surface(PRODUCT).name, 'Network Explorer')
    assert.match(rendered(shell), /surfaceMeta\(PRODUCT, \{/)
  })

  it('titles the front door with the surface name, which is what index.html says too', () => {
    // The index route's `ROUTES` label is `Search`, and that label's job is a tab in the section
    // navigation. As a `<title>` it would make the front door read `Search — Network Explorer`,
    // disagreeing with the static tag a link-preview fetcher gets.
    const staticTitle = /<title>([^<]*)<\/title>/.exec(html)?.[1] ?? ''
    assert.equal(staticTitle, surface(PRODUCT).name)
    assert.equal(surfaceMeta(PRODUCT, { path: '/' }).title, staticTitle)
  })

  it('titles a section from the route table rather than a fifth hand-typed list', () => {
    const chains = NAV.find((entry) => entry.to === '/chains')
    assert.ok(chains, '/chains has left the navigation')
    assert.equal(
      surfaceMeta(PRODUCT, { title: chains.label, path: '/chains' }).title,
      'Chains — Network Explorer',
    )
    assert.match(rendered(shell), /ROUTES\.find\(/, 'the title is not read off the route table')
  })

  it('says the same sentence in both copies of the description', () => {
    const staticDescription = metaContent('description')
    assert.equal(
      staticDescription,
      SURFACE_DESCRIPTION,
      'index.html and the runtime head disagree about what this surface is',
    )
    assert.equal(surfaceMeta(PRODUCT, { description: SURFACE_DESCRIPTION }).description, staticDescription)
  })

  it('and the sentence is the one that declines to over-claim', () => {
    // The registry blurb — "Blocks, transactions and addresses" — describes a block explorer. What
    // distinguishes THIS one is what it refuses to say, and that has to survive into the one line
    // a reader sees before they arrive.
    assert.match(SURFACE_DESCRIPTION, /measured against/)
    assert.notEqual(
      SURFACE_DESCRIPTION,
      surfaceMeta(PRODUCT).description,
      'the description fell back to the composed registry blurb',
    )
  })

  it('is applied by the shell on every navigation, not by each page', () => {
    // The failure mode of a per-page hook is the page that forgets, and on this surface that is
    // worse than a wrong title: an `og:url` left over from the previous address is a shared link
    // that opens something other than what the sharer was looking at.
    const source = rendered(shell)
    assert.match(source, /useLocation\(\)/)
    assert.match(source, /applyHead\(/)
    assert.match(source, /\}, \[pathname\]\)/, 'the head effect is not keyed on the address')
  })

  it('marks no route noindex, because every route here is public', () => {
    // Read off the registry rather than decided: `explorer` is `servesUi: true` and not
    // `adminOnly`, and `src/app.tsx` has no gate. A `noindex` here would contradict robots.txt.
    assert.equal(surfaceMeta(PRODUCT, { path: '/chains' }).robots, 'index, follow, max-image-preview:large')
  })
})
