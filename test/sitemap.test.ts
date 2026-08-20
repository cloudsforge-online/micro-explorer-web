/**
 * The sitemap and robots.txt nginx serves for this surface.
 *
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 * WHY THE BODIES ARE IN nginx.conf AT ALL
 *
 * A sitemap must carry ABSOLUTE URLs — the spec requires it and a crawler discards a relative
 * `<loc>` — and nothing built in this repository may name a hostname, because one image is served
 * from localhost, from a preview deployment and from BOTH production estates.
 * `test/no-build-time-config.test.ts` is the rule; this is the one document that cannot obey it
 * and be useful at the same time.
 *
 * nginx is the component that can. It has `$host` on every request, so the addresses are composed
 * per request and the artefact stays environment-free.
 *
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 * AND WHY THIS SURFACE DOES NOT USE `sitemapXml()` FROM THE DESIGN SYSTEM
 *
 * THE SHARED GENERATOR IS FOR THE APEX. It composes each sibling surface as `<subdomain>.$host`,
 * which is right on the marketing site, where `$host` IS the apex. Here `$host` is already
 * `explorer.<apex>`, so the same call would emit `network.explorer.<apex>` — the two-label shape
 * `@cloudsforge/ui/surfaces.ts` records at length as unreachable, because the edge's Universal SSL
 * is a one-label wildcard and every two-label name fails the handshake. It is the same dead shape
 * `4283686` had to delete from the contract package's explorer-URL builder, so emitting one here
 * would be re-creating a defect this repository exists downstream of.
 *
 * So this surface publishes ITS OWN public routes, derived from the same `ROUTES` table the
 * navigation, the router and nginx's enumerated locations all come from — and `robots.txt`, which
 * has no such problem, IS generated from the design system and compared byte for byte.
 *
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 * AND WHY EITHER NEEDS A TEST
 *
 * A body pasted into a config file is a copy, and this estate has been bitten by exactly one of
 * those: `site/index.html`'s title drifted from its application's, the suite stayed green, and
 * every search result carried a sentence the owner had asked to have removed until somebody opened
 * the served HTML rather than the page. The block is therefore treated as GENERATED OUTPUT that
 * happens to live in a config file.
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, it } from 'node:test'
import { ENV_LABELS } from '@cloudsforge/ui'
import { BASE, NAV, NON_INDEX_PATHS, ROUTES } from '../src/lib/routes.ts'

const nginx = readFileSync(new URL('../nginx.conf', import.meta.url), 'utf8')

/** nginx.conf with its comments removed, so an absence assertion cannot read a gravestone. */
const directivesOf = (conf: string): string =>
  conf
    .split('\n')
    .filter((line) => !/^\s*#/.test(line))
    .join('\n')

/**
 * Every address of this surface a crawler should be handed, derived rather than restated.
 *
 * `NAV` is the routes that carry a navigation label, which on this surface is exactly the set that
 * is a destination without an identifier: the search box at `/` and the scope list at `/chains`.
 * The four routes deliberately outside it carry `label: null` for the same reason they are absent
 * here — `/blocks/<chain>/<network>/<height>` and its three siblings are UNBOUNDED families of
 * addresses, one per block, transaction or account, minted by the chain and growing every few
 * seconds. A static list of them in a config file would be a second opinion about what exists,
 * stale before the file is saved, so they are left to be discovered from `/`, which is the box
 * that resolves a paste into one of them.
 */
const PUBLIC_PATHS: readonly string[] = NAV.map((entry) => entry.to)

/** The single-quoted body of a `return 200 '…';` inside an exact-match location. */
function servedBody(path: string): string {
  // The caller names a PUBLIC path (`${BASE}/sitemap.xml`) since wave 3h — nginx's locations
  // carry the mount, and this is the function that reads them.
  const block = new RegExp(`location = ${path.replace('.', '\\.')} \\{([\\s\\S]*?)\\n    \\}`).exec(
    nginx,
  )
  assert.ok(block, `nginx.conf has no exact-match location for ${path}`)
  // Anchored to a `return` at the start of its own line: `/robots.txt` also carries a CONDITIONAL
  // `if ($cf_env) { return 200 '…'; }` above it, and a regex that took the first match would read
  // the non-mainnet body and report the mainnet one as drifted.
  const body = /\n {8}return 200 '([\s\S]*?)';/.exec(block[1] ?? '')
  assert.ok(body, `the ${path} location does not return an unconditional literal body`)
  return body[1] ?? ''
}

describe('the sitemap nginx serves', () => {
  it('names no hostname — every address is composed from $host', () => {
    /*
     * THE ASSERTION THAT KEEPS THE ARTEFACT ENVIRONMENT-FREE, and the reason a document with
     * absolute URLs in it is allowed here at all. A single literal apex would make the image wrong
     * on the testnet estate and on a preview deployment, silently, in the one document a crawler
     * treats as authoritative — and on this surface the two estates are the whole point.
     */
    const xml = servedBody(`${BASE}/sitemap.xml`)
    assert.ok(!xml.includes('cloudsforge.online'), 'the sitemap names the production apex')
    assert.ok(!xml.includes('localhost'), 'the sitemap names localhost')
    const locs = [...xml.matchAll(/<loc>([^<]*)<\/loc>/g)].map((m) => m[1] ?? '')
    assert.ok(locs.length > 0, 'the sitemap lists nothing at all')
    for (const loc of locs) {
      // No subdomain is composed here, unlike the apex's sitemap: `$host` IS this surface.
      assert.match(loc, /^\$scheme:\/\/\$host(\/|$)/, `a <loc> is not composed: ${loc}`)
    }
  })

  it('lists every route this surface offers, so a crawler is not left to guess', () => {
    const xml = servedBody(`${BASE}/sitemap.xml`)
    for (const path of PUBLIC_PATHS) {
      const address = path === '/' ? '$scheme://$host' : `$scheme://$host${path}`
      assert.ok(xml.includes(`<loc>${address}</loc>`), `${path} is missing from the sitemap`)
    }
  })

  it('lists nothing else, and in particular not one block, transaction or address', () => {
    // The other direction, and the one that matters most on this surface. A sitemap that named a
    // single `/tx/…` would be promising a crawler that one transaction is a page of this site
    // worth revisiting, out of a set that grows for as long as the chain runs.
    const xml = servedBody(`${BASE}/sitemap.xml`)
    const listed = [...xml.matchAll(/<loc>\$scheme:\/\/\$host([^<]*)<\/loc>/g)].map((m) =>
      m[1] === '' ? '/' : (m[1] ?? ''),
    )
    assert.deepEqual([...listed].sort(), [...PUBLIC_PATHS].sort())
    for (const family of ['/blocks', '/tx', '/address', '/tokens']) {
      assert.ok(!xml.includes(family), `the sitemap lists ${family}, an unbounded family`)
    }
  })

  it('lists no individual scope either, because which ones exist is a per-deployment fact', () => {
    // `/chains/<chain>/<network>` is BOUNDED, unlike the four above, so the reason it is out is a
    // different one: `src/pages/chains.tsx` measures the offer from the index's own `/status`
    // rather than assuming it from a constant, because the two estates index one scope each.
    // Enumerating scopes here would put that assumption back, in the document a crawler trusts.
    const xml = servedBody(`${BASE}/sitemap.xml`)
    assert.ok(!/\$host\/chains\/[^<]/.test(xml), 'the sitemap names an individual chain scope')
  })

  it('is a well-formed urlset in the only schema crawlers implement', () => {
    const xml = servedBody(`${BASE}/sitemap.xml`)
    assert.match(xml, /^<\?xml version="1\.0" encoding="UTF-8"\?>\n/)
    assert.match(xml, /<urlset xmlns="http:\/\/www\.sitemaps\.org\/schemas\/sitemap\/0\.9">/)
    assert.match(xml, /<\/urlset>$/)
  })

  it('is served as XML, because a sitemap sent as text/html is a sitemap nobody reads', () => {
    // `types { }` as well as `default_type`: without emptying the table for this location, nginx
    // maps the `.xml` in the URI to `text/xml` from its own mime types and `default_type` never
    // applies.
    assert.match(
      nginx,
      /location = \/explorer\/sitemap\.xml \{[\s\S]*?types \{ \}[\s\S]*?default_type application\/xml;/,
    )
  })

  it('is derived from the route table rather than typed a fifth time', () => {
    // `src/lib/routes.ts` already decides the router, the navigation and nginx's enumerated
    // locations. This asserts the derivation above is real: a route added with a label appears
    // here, and the four that are not destinations stay out.
    assert.deepEqual(PUBLIC_PATHS, ['/', '/chains'])
    for (const path of ['blocks', 'tx', 'address', 'tokens']) {
      assert.equal(
        ROUTES.find((r) => r.path === path)?.label,
        null,
        `${path} has acquired a navigation label; decide deliberately whether it belongs in the sitemap`,
      )
    }
    // And the two halves really are the same table: every labelled non-index route is listed.
    assert.deepEqual(
      NON_INDEX_PATHS.filter((p) => ROUTES.find((r) => r.path === p)?.label !== null),
      ['chains'],
    )
  })
})

describe('an environment that is not mainnet', () => {
  /**
   * The `map` that decides it, and the alternation of labels inside it.
   *
   * The testnet estate carries test EMBER and a faucet. Indexed beside the real one, its pages are
   * transaction records that look exactly like the record of a payment somebody is trying to
   * confirm — and a reader who searches a hash and lands on the wrong estate is told it does not
   * exist. That is the failure this whole surface was corrected for in `27cfb6f`, arriving by a
   * third route: not a wrong default and not a wrong link, but a search result.
   */
  function alternation(): string[] {
    const map = /map \$host \$cf_env \{[\s\S]*?~\^[^\n]*?\(\?:([^)]*)\)\\\./.exec(nginx)
    assert.ok(map, 'the $cf_env map is missing from nginx.conf')
    return (map[1] ?? '').split('|')
  }

  it('recognises exactly the labels the registry reserves', () => {
    /*
     * ENV_LABELS is the estate's single list — `deploy/scripts/check-apex-prefix.py` reads the
     * same export, and so does `splitEnvLabel`, which is what `src/lib/network.ts` derives this
     * deployment's NETWORK from. An alternation here that had drifted from it would either miss an
     * environment (and index it) or refuse a surface (and de-index a real one), and both fail
     * silently.
     */
    assert.deepEqual(alternation().sort(), [...ENV_LABELS].sort())
  })

  it('refuses every crawler and serves no sitemap', () => {
    // Both halves matter and neither is sufficient: robots.txt stops the fetch, and a sitemap that
    // still answered would be an invitation contradicting the instruction beside it.
    // ── THE robots.txt HALF IS GONE, AND ITS ABSENCE IS THE ASSERTION NOW ────────────────────
    //
    // A crawler reads robots.txt at the ORIGIN ROOT and nowhere else, so a folder has none:
    // `/explorer/robots.txt` is a file nothing fetches, and `/robots.txt` on this origin belongs
    // to micro-site, whose copy decides whether this surface is indexed. Serving one here would
    // be a SECOND document at an address another container already owns.
    //
    // Read against DIRECTIVES, not the raw file: the comment recording the removal names the
    // directive it removed, and a raw grep finds its own gravestone.
    assert.doesNotMatch(directivesOf(nginx), /location\s*=\s*\/robots\.txt/)
    assert.match(nginx, /location = \/explorer\/sitemap\.xml \{[\s\S]*?if \(\$cf_env\) \{ return 404; \}/)
  })

  it('matches a suffixed subdomain as well as a bare environment apex', () => {
    // The environment is a SUFFIX on the first label now (`explorer-testnet.`) and was an apex
    // prefix (`testnet.`) before. `src/lib/network.ts` resolves both — deliberately, because a
    // bundle served on an old hostname must still report the right network — so this must match
    // both or the two halves of the same deployment disagree about which estate they are.
    const map = /map \$host \$cf_env \{[\s\S]*?\n\}/.exec(nginx)
    assert.ok(map, 'the $cf_env map is missing')
    assert.match(map[0], /\(\?:\[\^\.\]\+-\)\?/, 'the map does not allow a suffixed subdomain')
  })
})

describe('robots.txt', () => {
  // ── THESE TWO TESTS WERE ABOUT A DOCUMENT THIS SURFACE NO LONGER SERVES ───────────────────
  //
  // Both asserted the SHAPE of a robots.txt emitted from this container: that it was byte-equal
  // to what `robotsTxt()` generates, and that its `Sitemap:` line was absolute. Since wave 3h
  // there is no robots.txt here to have a shape. A crawler reads it at the ORIGIN ROOT and
  // nowhere else, so a folder has none, and `/robots.txt` on this origin is micro-site's.
  //
  // Replaced by one assertion rather than deleted, because "this surface serves no robots.txt"
  // is the fact worth holding — the day somebody adds the block back, believing a folder needs
  // its own, this goes red. The shape of the apex's copy is asserted in micro-site, which is the
  // repository that owns it, and the announcement of THIS surface's sitemap lives there too.
  it('serves no robots.txt of its own, because a folder has none', () => {
    assert.doesNotMatch(directivesOf(nginx), /location\s*=\s*\/robots\.txt/)
    assert.doesNotMatch(directivesOf(nginx), /User-agent:/)
  })

  it('is not a static file, which an exact-match location would have shadowed', () => {
    /*
     * `location = /robots.txt` wins over the `location /` prefix that serves the static tree, so a
     * file in `public/` would be deployed, unreachable, and edited by the next reader to no effect
     * — the worst of the three states, worse than either serving it or not having it.
     */
    for (const name of ['robots.txt', 'sitemap.xml']) {
      let present = true
      try {
        readFileSync(new URL(`../public/${name}`, import.meta.url))
      } catch {
        present = false
      }
      assert.equal(present, false, `public/${name} exists, and nginx will never serve it`)
    }
  })
})

describe('the security headers on the documents this file adds', () => {
  it('are repeated in both new locations, because add_header does not accumulate', () => {
    // A location that declares ANY add_header inherits NONE from the server level. Both blocks set
    // Cache-Control, so both have to restate the three security headers or ship without them.
    // ONE DOCUMENT, NOT TWO. `/robots.txt` was in this list and its location no longer exists:
    // a crawler reads robots.txt at the ORIGIN ROOT and nowhere else, so a folder has none and
    // micro-site's is the copy that decides whether this surface is indexed.
    for (const path of [`${BASE}/sitemap.xml`]) {
      const block = new RegExp(
        `location = ${path.replace('.', '\\.')} \\{([\\s\\S]*?)\\n    \\}`,
      ).exec(nginx)
      assert.ok(block, `no location for ${path}`)
      const body = block[1] ?? ''
      assert.match(body, /X-Content-Type-Options "nosniff"/)
      assert.match(body, /X-Frame-Options "SAMEORIGIN"/)
      assert.match(body, /Referrer-Policy "strict-origin-when-cross-origin"/)
    }
  })

  it('are repeated in /assets/ too, which is the location that serves the code', () => {
    const block = new RegExp(`location ${BASE}/assets/ \\{([\\s\\S]*?)\\n    \\}`).exec(nginx)
    assert.ok(block, `no ${BASE}/assets/ location`)
    assert.match(block[1] ?? '', /X-Content-Type-Options "nosniff"/)
  })
})
