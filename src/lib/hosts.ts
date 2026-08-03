/**
 * Where this app talks to, resolved at runtime.
 *
 * `cloudsforgeHosts()` reads `window.location.hostname` on every call, so one image serves
 * localhost, a preview deployment and production. Nothing here reads a build-time constant; see
 * the note in vite.config.ts and `test/no-build-time-config.test.ts`.
 *
 * ── The API this bundle reads is not the surface this bundle IS ────────────────────────────────
 *
 * Every other frontend in the estate is a client of a service that shares its hostname: trade-web
 * calls `trade`, mint-web calls `mint`. This one calls `micro-indexer`, and the surface registry
 * has **no `indexer` entry** (`ui/packages/ui/src/surfaces.ts` declares `SurfaceKey` at `:23-38`
 * and `indexer` is not among them). `CloudsForgeHosts` is `Record<SurfaceKey, string>`
 * (`ui/packages/ui/src/index.tsx:121`), so there is no key to ask for.
 *
 * The registry key that exists is `explorer` (`ui/packages/ui/src/surfaces.ts:504-529`), and the
 * production arrangement it describes is the right one: nginx serves this bundle at
 * `explorer.<apex>` and the indexer serves `/v1/...` behind the same hostname, exactly as
 * `trade.<apex>` is shared. So `apiBase()` is `''` in production and every request is relative.
 *
 * ── The dev port disagreement, reported and then fixed upstream ────────────────────────────────
 *
 * The registry now gives `explorer` **devPort 4008** (`ui/packages/ui/src/surfaces.ts:523`) — the
 * port `micro-indexer` binds (`indexer/src/env.ts:364`, `indexer/.env.example:9`,
 * `indexer/Dockerfile:91`). It used to say 8080, which is this bundle's OWN container port
 * (`Dockerfile:67`, `nginx.conf:29`): the registry told a frontend to ask itself for chain data,
 * and under `pnpm dev` an indexer started from its own example environment was never consulted.
 * This repository reported it rather than papering over it with a literal, micro-ui corrected it
 * and pinned the value against the service, and the pins in test/hosts.test.ts flipped with it.
 */
import { cloudsforgeHosts, type CloudsForgeHosts, type SurfaceKey } from '@cloudsforge/ui'

/**
 * The surface this application IS.
 *
 * `ui/packages/ui/src/surfaces.ts:504-529` registers `explorer` as a `service` with
 * `inSwitcher: false`, subdomain `explorer`, accent `#d6412f`, glyph `▦` and **`markId: null`**.
 * The null is a decision rather than a gap: `brand/plan.ts:50-62` explains that an explorer is
 * part of Forge Network and must not claim a mark of its own, and `brand/assets/explorer/`
 * therefore holds favicons and an og card and nothing else. Nothing in this bundle renders a mark
 * or a wordmark, and no chrome here is designed around one.
 */
export const PRODUCT: SurfaceKey = 'explorer'

/**
 * The accent block this page's `<html>` names.
 *
 * `explorer` has **no `[data-cf-product='explorer']` block** in `ui/packages/ui/src/tokens.css`;
 * `network`'s is at `:340-345` and carries `#d6412f`, which is the exact accent the registry gives
 * `explorer` (`ui/packages/ui/src/surfaces.ts:524`). So `network` is the correct selector and it
 * is set statically in index.html.
 *
 * That the explorer has no block of its own is worth stating, because tokens.css says at `:389-396`
 * that "every key an app may set is declared" — precisely so a surface cannot fall through to the
 * company ember in silence, which is what `admin` did. `status` was given an explicit block on
 * that rule and `explorer` was not. Reported to micro-ui; `test/brand-chrome.test.ts` asserts the
 * selector this page names really exists, which is the check that catches the fall-through either
 * way.
 */
export const ACCENT_SURFACE = 'network'

/** The name reported to the observability ingest and shown in error copy. */
export const APP_NAME = 'explorer-web'

/**
 * The base URL for the API this app reads, which is `micro-indexer`.
 *
 * In production the SPA and the indexer are the same origin — nginx serves the bundle, the service
 * serves `/v1` behind `explorer.<apex>` — so the base is the empty string and requests stay
 * relative. Under `pnpm dev` the page is on Vite's port while the service is on the registry's dev
 * port for this surface, so the base is absolute and the request goes cross-origin.
 *
 * The difference is derived by COMPARING ORIGINS rather than by a `DEV` flag, because a flag is a
 * build-time constant and this repository has none: an image built for production and opened on
 * localhost would then point at a host that is not there.
 */
export function resolveApiBase(
  pageOrigin: string,
  hosts: CloudsForgeHosts,
  key: SurfaceKey,
): string {
  const own = hosts[key]
  // With no page origin there is nothing for a relative URL to resolve against, so the absolute
  // form is the only correct answer.
  if (!pageOrigin) return own
  // A surface may carry a basePath (the wallet is a path inside Hub), so compare ORIGINS rather
  // than whole URLs — otherwise every such surface would look cross-origin to itself.
  return new URL(own).origin === pageOrigin ? '' : own
}

/** The same four names `cloudsforgeHosts()` treats as development. Kept in step by test. */
export function isLocal(hostname: string): boolean {
  return (
    hostname === '' ||
    hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    hostname.endsWith('.local')
  )
}

/**
 * Whether this bundle is being served from an address the surface registry knows.
 *
 * `cloudsforgeHosts()` derives the apex by stripping a KNOWN subdomain prefix. Served from an
 * unknown name, the whole name becomes the apex, and every CloudsForge URL derived from it — the
 * indexer, the account portal, Lantern — resolves one level too deep. The app still renders,
 * because a block explorer is a public reference surface and nothing here is a security boundary;
 * but it says so, once, in the shell.
 */
export function isRegisteredPlacement(
  pageOrigin: string,
  hostname: string,
  hosts: CloudsForgeHosts,
): boolean {
  if (isLocal(hostname)) return true
  if (!pageOrigin) return true
  try {
    return new URL(hosts[PRODUCT]).origin === pageOrigin
  } catch {
    return false
  }
}

/** Every CloudsForge base URL, for the current environment. */
export function hosts(): CloudsForgeHosts {
  return cloudsforgeHosts()
}

/** This app's API base, resolved now. Call it per request; never cache it in a module constant. */
export function apiBase(): string {
  const origin = typeof window === 'undefined' ? '' : window.location.origin
  return resolveApiBase(origin, cloudsforgeHosts(), PRODUCT)
}

/** The page origin, or a stable placeholder when there is no document (tests, prerender). */
export function pageOrigin(): string {
  return typeof window === 'undefined' ? 'http://localhost' : window.location.origin
}

/** Whether the current address is one the registry knows. Read by the shell. */
export function placementIsKnown(): boolean {
  if (typeof window === 'undefined') return true
  return isRegisteredPlacement(window.location.origin, window.location.hostname, cloudsforgeHosts())
}
