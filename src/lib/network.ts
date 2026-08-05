/**
 * WHICH NETWORK THIS DEPLOYMENT IS, DERIVED FROM THE HOSTNAME AND FROM NOTHING ELSE.
 *
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 * THE DEFECT THIS FILE EXISTS FOR, FOUND BY THE OWNER USING THE PRODUCT
 *
 * `src/pages/search.tsx` opened with `useState<Network>('testnet')`. That literal was the default
 * on BOTH deployments, so the front page of `explorer.<apex>` — the MAINNET explorer —
 * looked up every pasted hash, height and address on `ember/testnet`.
 *
 * It is worse than a wrong label, and the measurement is the reason. The mainnet estate runs
 * `INDEXER_CHAINS=ember:mainnet` (`deploy/compose/env/chain.mainnet.env`), so its index has never
 * walked testnet — but its DATABASE still holds 87 blocks of it from a previous configuration, and
 * that scope answers `halted: true`, `tipHeight: 0`,
 * `haltReason: "reorg deeper than 256 blocks below height 87"`. Measured against the live service,
 * not inferred. So a reader pasting a real mainnet transaction into the mainnet explorer was sent
 * to a halted scope holding 87 stale blocks and told the transaction did not exist.
 *
 * That is the same failure as tracker #136 — "a testnet transaction links to the mainnet explorer,
 * which then said it did not exist" — arriving from the other side. micro-contracts fixed that one
 * in `4283686` by making the URL BUILDER network-aware, per hostname:
 * `explorer.<apex>` for mainnet and `explorer-testnet.<apex>` for testnet.
 * This file is the receiving half of the same mechanism, and it must agree with it: the hostname
 * that was linked to decides the network, so a link built correctly cannot be landed on wrongly.
 *
 * ── THE RESOLUTION IS `splitEnvLabel`, NOT A SUBSTRING MATCH ──────────────────────────────────
 *
 * `hostname.includes('testnet')` would be the obvious version and it is wrong twice. It would read
 * a surface merely NAMED with testnet in it as the testnet environment, and it would read
 * `explorer.testnet.<apex>` — the two-label shape Cloudflare Universal SSL's one-label
 * wildcard does not cover, and the exact dead host `4283686` had to remove — as live. The registry
 * owns this: `splitEnvLabel` (`ui/packages/ui/src/surfaces.ts:1101`) requires the tail to be a
 * KNOWN environment label AND the head to be a KNOWN registry subdomain, and returns null for
 * anything else rather than guessing.
 *
 * ── NOTHING IS STORED, SO NOTHING CAN LEAK ACROSS ENVIRONMENTS ────────────────────────────────
 *
 * There is no localStorage key, no cookie and no preference behind any of this. A reader who
 * visits the testnet explorer, picks a chain, and later opens the mainnet one gets mainnet: the
 * answer is recomputed from `window.location.hostname` on every call, exactly as
 * `src/lib/hosts.ts` recomputes the API base. A persisted network selection is how somebody checks
 * the wrong chain and concludes their funds are missing, and the cheapest defence against it is
 * having nowhere to persist one. `test/network.test.ts` asserts that this module reads no storage.
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 */
import { KNOWN_SUBS, splitEnvLabel } from '@cloudsforge/ui'
import { PRODUCT, isLocal } from './hosts.ts'
import type { Network } from './indexer.ts'

/**
 * Which network each environment label means.
 *
 * Only `mainnet` is real money. `staging`, `preview` and `dev` are environments this estate may
 * stand up around the test chain, and reading any of them as mainnet would be the defect in its
 * worst direction: a non-production surface presenting itself as the one holding real balances.
 * An unrecognised label is not in this table and is handled as an unregistered placement below.
 */
const NETWORK_FOR_ENV: Readonly<Record<string, Network>> = Object.freeze({
  mainnet: 'mainnet',
  testnet: 'testnet',
  staging: 'testnet',
  preview: 'testnet',
  dev: 'testnet',
})

/**
 * The apex a hostname hangs off, by the same rule `cloudsforgeHosts()` uses
 * (`ui/packages/ui/src/index.tsx:206-221`): strip the first label when it names an environment or
 * a known subdomain, and otherwise treat the whole name as its own apex rather than guessing.
 */
function apexOf(hostname: string): string {
  const parts = hostname.split('.')
  if (parts.length <= 2) return hostname
  const first = parts[0] ?? ''
  if (splitEnvLabel(first) || KNOWN_SUBS.has(first)) return parts.slice(1).join('.')
  return hostname
}

/**
 * The network a hostname denotes.
 *
 * Four cases, and each one is a decision rather than a fallthrough:
 *
 *   1. **A development address** — localhost and friends — is `testnet`. That is not a guess: the
 *      repository's own `indexer/.env.example:39` is `INDEXER_CHAINS=ember:testnet` and
 *      `DEEP_LINK_PATH` in `src/lib/routes.ts` is `/blocks/ember/testnet/1`, so testnet is the
 *      only scope a local stack has ever indexed. Defaulting a developer to mainnet would put a
 *      dead scope on the front page of every `pnpm dev`.
 *   2. **A labelled hostname** — `explorer-testnet.<apex>`, or the older `explorer.testnet.<apex>`
 *      two-label form which `splitEnvLabel` still resolves — takes the label's network.
 *   3. **An unlabelled CloudsForge hostname** — `explorer.<apex>` — is `mainnet`. The estate serves
 *      mainnet unadorned and every other environment suffixed; `contracts/packages/chain/src/
 *      index.ts:219-222` writes exactly that pair.
 *   4. **An address the registry does not know** is `mainnet`, and the shell already says so out
 *      loud (`isRegisteredPlacement`, `src/lib/hosts.ts:110`). Mainnet is the right answer here
 *      because it is the one that cannot silently under-report: a reader on an unknown host asking
 *      about mainnet and being told a scope is not indexed has learned something true, whereas one
 *      shown testnet data under a mainnet-looking name has been misinformed.
 */
export function networkForHost(hostname: string): Network {
  if (isLocal(hostname)) return 'testnet'
  const parts = hostname.split('.')
  // `parts.length > 2` for the same reason `cloudsforgeHosts()` requires it: a two-label hostname
  // IS an apex and has no first label to spend on an environment.
  if (parts.length <= 2) return 'mainnet'
  const first = parts[0] ?? ''

  // The single-label scheme, which is what the estate serves: `explorer-testnet.<apex>`.
  const env = splitEnvLabel(first)
  if (env) return NETWORK_FOR_ENV[env.env] ?? 'mainnet'

  // The OLDER TWO-LABEL FORM, `explorer.testnet.<apex>`, resolved for the same reason
  // `cloudsforgeHosts()` still resolves it (`ui/packages/ui/src/index.tsx:199-204`): nothing was
  // taken away when the names moved, so a bundle served on an old hostname must still be correct.
  // It matters more here than there. That host answers nothing today — Universal SSL's wildcard
  // covers one label — but reading it as MAINNET would be the dangerous direction: a reader who
  // reached a testnet-shaped address would be shown the network holding real money.
  if (KNOWN_SUBS.has(first) && parts.length > 3) {
    const second = parts[1] ?? ''
    if (second in NETWORK_FOR_ENV) return NETWORK_FOR_ENV[second] ?? 'mainnet'
  }

  return 'mainnet'
}

/**
 * The network this page is serving, resolved now.
 *
 * Call it; never cache it in a module constant. `src/lib/hosts.ts` carries the same instruction
 * for `apiBase()` and the same reason applies: one image serves localhost, a preview and
 * production, and a value frozen at import is a build-time constant with extra steps.
 */
export function deploymentNetwork(): Network {
  return networkForHost(typeof window === 'undefined' ? '' : window.location.hostname)
}

/**
 * The origin of the sibling explorer — the one serving the OTHER network — or null when there is
 * not one to point at.
 *
 * Null on a development address and on an unregistered placement, because inventing a hostname is
 * how `explorer.testnet.<apex>` got shipped: it looked composed correctly, it resolved
 * to nothing, and the link was worse than no link because a reader trusts an offered address.
 * Composed the one way the estate serves: mainnet unadorned, every other environment suffixed with
 * a single hyphen so it stays inside Universal SSL's one-label wildcard.
 */
export function siblingExplorerOrigin(hostname: string, network: Network): string | null {
  if (isLocal(hostname)) return null
  const parts = hostname.split('.')
  if (parts.length <= 2) return null
  const first = parts[0] ?? ''
  const split = splitEnvLabel(first)
  const subdomain = split ? split.subdomain : first
  if (subdomain !== PRODUCT) return null
  const apex = apexOf(hostname)
  const label = network === 'mainnet' ? PRODUCT : `${PRODUCT}-testnet`
  return `https://${label}.${apex}`
}

/** The sibling explorer for the network this page is NOT, resolved now. */
export function siblingExplorer(network: Network): string | null {
  if (typeof window === 'undefined') return null
  return siblingExplorerOrigin(window.location.hostname, network)
}
