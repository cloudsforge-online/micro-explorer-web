# micro-explorer-web

The Forge Network block explorer: blocks, transactions, addresses, token contracts and the state of
each chain, read from `micro-indexer`. It is a static SPA served by nginx — no Node, no toolchain
and no environment in the image — and it **states the head every confirmation depth was measured
against, and never says that anything is final**.

> **It holds no credential and it proxies nothing.** `micro-indexer` refuses an anonymous read
> (`indexer/src/server.ts:679-697`), and the tempting fix is a service token in this image behind an
> nginx `proxy_pass`. An image is built once and promoted, pushed to a registry and pulled by
> anything with read access; a credential inside one is a published credential. So this surface is
> honestly refused instead, on screen, with the line that decides it — and the fix belongs in
> `micro-indexer`. `.github/workflows/ci.yml` greps `nginx.conf` and the `Dockerfile` for both, and
> `test/routes.test.ts` asserts the absence of a proxy.

---

## ⚠ The finding this repository is built on top of

**A public block explorer cannot read `micro-indexer` today, and no amount of work in this
repository changes that.**

Every one of the nine domain routes opens with `await authorise(ctx, deps, SCOPE)`, and `authorise`
(`indexer/src/server.ts:679-697`) accepts exactly two principals:

| Caller | What happens | Where |
| --- | --- | --- |
| No token at all | `TokenError` → **401** | `indexer/src/server.ts:687`, mapped `:248-253` |
| A **service** token carrying `indexer:read` | served | `requireScope`, `indexer/src/server.ts:691`; scope at `:89` |
| A **user** token with the `admin` role | served | `isAdmin`, `indexer/src/server.ts:695` |
| Any other user token | `ForbiddenError` → **403** | `indexer/src/server.ts:695`, mapped `:254-258` |

So an anonymous visitor gets 401 on every route, and an ordinary signed-in customer gets 403.
**Signing in is not the remedy**, which is why nothing in this bundle offers it as one and why there
is no `ProtectedRoute` anywhere in it.

The service argues its case in its own header (`indexer/src/server.ts:14-20`): address ownership is
a fact `micro-wallet` holds, so the indexer refuses to be the place that guesses at it. That is
sound for `/addresses/...`. It is **not** an argument about blocks — a block, a transaction and a
chain's tip are public facts on a public chain — and the estate's own position is one line:
"A public chain whose explorer is paywalled is not a public chain"
(`docs/ecosystem/15-monetisation-model.md:50`).

**What this repository does instead.** It renders every address publicly, calls the real routes, and
when the service refuses it says *which* refusal happened, why, and where the decision is made — see
`Refused` in `src/components/states.tsx`. The two screens that call nothing (`/` and `/chains`) work
for everybody. An operator holding an admin session gets the whole surface today.

**What would close it**, in the order of preference this repository reached:

1. `micro-indexer` serves `/blocks`, `/transactions` and `/chains/.../status` unauthenticated, and
   keeps `/addresses` and `/tokens` behind `indexer:read`. Blocks are public; an activity feed keyed
   by address is the thing the header's argument is actually about.
2. A public read gateway holds the service token server-side. There is no such surface today and no
   token-injecting middleware in `deploy/gateway/dynamic/policy.yml`.

`test/indexer.test.ts` **pins the finding against the real source**, so the day it is fixed the suite
goes red and somebody has to come back and delete the refusal machinery. A finding recorded only in
prose is a finding that outlives its truth.

---

## Routes this app serves

Three files describe them and all three must agree: `src/lib/routes.ts` (the declaration),
`src/app.tsx` (what renders) and `nginx.conf` (what is served the shell at all).
`test/routes.test.ts` reads all three.

| Path | Calls the index? | What it shows |
| --- | --- | --- |
| `/` | **no** | Search. Sorts a paste into a height, a hash or an address using the service's own rules, and says which it thinks it is before you commit. |
| `/chains` | **no** | The ten `(chain, network)` scopes as links. |
| `/chains/:chain/:network` | yes | Walked head vs claimed tip, lag, required depth, alarm depth, providers, recorded reorgs. |
| `/blocks/:chain/:network/:height` | yes | One block, its depth **against the claimed tip**, and its transactions. |
| `/tx/:chain/:network/:hash` | yes ×2 | The record, and separately the confirmations verdict. |
| `/address/:chain/:network/:address` | yes ×2 | Token holdings (or the reason they are withheld) and paged movements. |
| `/tokens/:chain/:network/:address` | yes | Supply, cap, owner, mint authority, and the block it was observed at. |

**An unknown path answers 404, not 200.** nginx enumerates the routes above and everything else
falls through to `error_page 404 /index.html`, which serves the same bundle while keeping the 404
status. That matters more here than on most surfaces: a block explorer's addresses are pasted into
chat, cited in support tickets and linked from receipts, so a mistyped one must be distinguishable
from a real one by a machine as well as by a reader.

## What it talks to

`micro-indexer`, and nothing else except Nimbus for the session. Every route below was read out of
`indexer/src/server.ts` one at a time; `test/indexer.test.ts` reads that file from a sibling checkout
and fails if any line is off by one, and CI bends one citation and requires the suite to go red.

| Method | Path | Authorises with | Registered at | Handler |
| --- | --- | --- | --- | --- |
| `GET` | `/v1/chains/:chain/:network/status` | `READ_SCOPE` | `indexer/src/server.ts:154` | `:384` |
| `GET` | `/v1/addresses/:chain/:network/:address/activity` | `READ_SCOPE` | `indexer/src/server.ts:155` | `:396` |
| `GET` | `/v1/addresses/:chain/:network/:address/token-balances` | `READ_SCOPE` | `indexer/src/server.ts:156` | `:463` |
| `GET` | `/v1/transactions/:chain/:network/:hash` | `READ_SCOPE` | `indexer/src/server.ts:157` | `:412` |
| `GET` | `/v1/transactions/:chain/:network/:hash/confirmations` | `READ_SCOPE` | `indexer/src/server.ts:158` | `:437` |
| `GET` | `/v1/tokens/:chain/:network/:address` | `READ_SCOPE` | `indexer/src/server.ts:159` | `:493` |
| `GET` | `/v1/blocks/:chain/:network/:height` | `READ_SCOPE` | `indexer/src/server.ts:160` | `:514` |

**There is no unauthenticated route** — that is the finding above, and it is the answer to the
question this table would normally answer. Every handler calls `authorise` directly; there is no
helper spelling of it on this service, unlike `micro-trade`, where four routes authenticate through
`ownedBot` and a handler-body grep for `authenticate(` declares them public.

**Declined, both writes:**

| Method | Path | Why not | Registered at |
| --- | --- | --- | --- |
| `POST` | `/v1/watch/:chain/:network/:address` | `indexer:write`. Enlarging what a shared deployment indexes is not a browser's decision. | `indexer/src/server.ts:161` |
| `POST` | `/v1/backfills/:chain/:network` | `indexer:write`. Enqueues a range walk, with a cost attached. | `indexer/src/server.ts:162` |

`/livez`, `/readyz` and `/metrics` (`indexer/src/server.ts:340`, `:350`, `:357`) are platform probes
and are not wrapped.

**Both spellings of every path are mounted** — `PREFIXES` is `['/v1', '']`
(`indexer/src/server.ts:134`) and `buildRoutes` loops over it (`:374-378`). This client uses `/v1`
throughout, because the bare form exists for the operator runbooks (`indexer/src/server.ts:130-133`).

**No `Idempotency-Key` anywhere.** `micro-indexer` reads no such header, and this bundle makes no
writes. Copying `micro-trade-web`'s client here would send one nothing reads; copying this one to
`micro-trade` would fail every write with a 400 (`trade/src/server.ts:840-848`).

## Reorg honesty — the thing this surface exists to get right

`micro-indexer` counts confirmations **two different ways**, and `indexer/src/reads.ts:18-30` scopes
which is which. The two reads that were added as *decision inputs* count against the stored
canonical **head** — "what this service has actually walked and would have detected a reorg in".
The three *record* reads count against `checkpoint.tipHeight` — "what a provider last claimed".

| Read | Counted against | Line |
| --- | --- | --- |
| `confirmation` | walked head (`record.headHeight`) | `indexer/src/reads.ts:442-445` |
| `block` | claimed tip (`checkpoint.tipHeight`) | `indexer/src/reads.ts:570`, tip at `:559` |
| `transaction` | claimed tip | `indexer/src/reads.ts:415-418`, tip at `:399` |
| `activity` | claimed tip | `indexer/src/reads.ts:353-356`, tip at `:345` |

So **the same block honestly has two depths**, differing by the current lag, and a count against the
claimed tip can exceed the number of blocks anybody here has looked at. `indexer/src/reads.ts:24-27`
says why that matters: "over-reporting depth credits early".

This app therefore:

1. renders every count through `<Depth head={…}>`, which has **no default head** — a depth with no
   head named cannot be rendered at all;
2. carries `NOT_FINAL` on every page that prints one (`test/render.test.ts` requires it), and the
   word "final" appears nowhere in the bundle;
3. takes a **verdict** only from `/confirmations`, which is the one counted against the walked head,
   and shows all four inputs `confirmed` was computed from (`indexer/src/reads.ts:463-468`) rather
   than only the answer;
4. shows `indexedHeight` and `tipHeight` side by side on the chain page, and never one without the
   other.

Three more facts this surface renders rather than smooths over:

- **A reverted transaction gathers depth exactly like one that worked**
  (`indexer/src/reads.ts:458-462`), so the status sits beside the depth at the same weight.
- **An orphaned movement is listed and badged**, never hidden. Hiding it would make a reorg
  invisible on the one screen where somebody is looking for their money.
- **A withheld balance is a panel, not a dash.** `balances` is *absent* rather than zero when the
  coverage cannot support it (`indexer/src/reads.ts:225-259`), and the reason is the value of the
  answer — "a missing balance is missing, never zero, because zero is what evicts a token-gated
  member" (`indexer/src/server.ts:460-461`).

A block page never shows an orphaned block: `blockAtHeight` filters `status <> 'orphaned'`
(`indexer/src/store.ts:195`), so a retracted height is a 404 `block_not_found`
(`indexer/src/server.ts:524`).

## The two meanings of 404

`micro-indexer` distinguishes them **by the error CODE, never by the status**
(`indexer/src/server.ts:426-436`). `micro-market` merged them and reported "the on-chain escrow is
not confirmed yet" for every activation; `micro-mint` merged them the other way and rendered "not yet
indexed" on every project page, permanently. Both passed all their own tests.

| Code | Means | This app renders |
| --- | --- | --- |
| `transaction_not_found`, `block_not_found`, `token_not_found` | this index asked and the answer is no | `Missing` — an answer, in the quiet style |
| `unknown_chain`, `unknown_network` | this estate does not run that scope | the scope page, naming the ten real ones |
| `bad_height`, `bad_hash`, `bad_address`, `bad_limit`, `bad_contract`, `bad_block` | malformed, **400** | `Missing`, saying what shape the service accepts |
| `not_found` | **the router's** — this bundle asked for a path the service does not serve | `Missing`, worded as *our* defect and saying so |

And the 501/503 family from `TokenStateUnavailableError` (`indexer/src/tokenstate.ts:136-157`) is
never rendered as "there is no token here". `family_not_supported` is 501 because waiting will not
change it; the other four are 503 (`indexer/src/server.ts:274-283`).

## Configuration

**There is none, and that is the point.** No `.env`, no `define`, no `envPrefix`, no `VITE_`
anything. Every host is resolved at runtime from `window.location.hostname` by `cloudsforgeHosts()`,
so one image serves localhost, a preview deployment, staging and production. An artefact with an
environment frozen into it has to be rebuilt to be promoted, which means the thing that reaches
production is not the thing that passed CI. `test/no-build-time-config.test.ts` and a `rules` job in
CI both enforce it.

The one build **argument** is `RELEASE`, stamped into a meta tag `src/lib/obs.ts` reads. It
identifies the artefact; it does not configure it.

### The devPort disagreement, reported rather than papered over

| | Value | Read from |
| --- | --- | --- |
| Registry `explorer` devPort | **8080** | `ui/packages/ui/src/surfaces.ts:443` |
| The port `micro-indexer` binds | **4008** | `indexer/src/env.ts:295`, `indexer/.env.example:9`, `indexer/Dockerfile:91` |
| This app's Vite dev server | 5189 | `vite.config.ts` — neither of the above |

8080 is this bundle's own container port (nginx-unprivileged listens on it), not a port any API
answers on. The registry has **no `indexer` entry at all** — `CloudsForgeHosts` is
`Record<SurfaceKey, string>` (`ui/packages/ui/src/index.tsx:121`) — so `explorer` is the only key
this bundle can ask for, and in production it is the right one because the SPA and the indexer share
`explorer.<apex>`.

It is **not** fixed with a literal port here: a hard-coded host is a second, unversioned copy of the
registry, and the copy is the one that goes stale. `test/hosts.test.ts` pins **both** numbers, so
whichever moves first fails and names the other. To run the two together locally:

```bash
PORT=8080 pnpm --dir ../indexer dev      # the indexer, on the port the registry names
pnpm dev                                  # this bundle, on 5189
```

### How many of these there really are

`micro-trade-web/src/lib/hosts.ts:16-17` lists three earlier instances in the present tense. **Two
of the three have since been corrected upstream**, so that sentence was re-read rather than copied
forward — carrying a fixed defect into a new repository as a live one is the same failure this
estate keeps finding in its own documents.

| Surface | Registry devPort | The service binds | |
| --- | --- | --- | --- |
| `admin` | 4014 (`ui/packages/ui/src/surfaces.ts:276`) | 4014 (`admin-api/src/env.ts:167`) | **agrees** — it said 3002 |
| `emberkin` | 4100 (`ui/packages/ui/src/surfaces.ts:412`) | 4100 (`emberkin/src/env.ts:121`) | **agrees** — it said 3014 |
| `create` | 4004 (`ui/packages/ui/src/surfaces.ts:219`) | 4000 (`mint/src/env.ts:251`) | still disagrees |
| `trade` | 4006 (`ui/packages/ui/src/surfaces.ts:206`) | 4000 (`trade/src/env.ts:166`) | still disagrees |
| `explorer` | 8080 (`ui/packages/ui/src/surfaces.ts:443`) | 4008 (`indexer/src/env.ts:295`) | still disagrees |

Three live, not seven. `test/hosts.test.ts` pins every number in that table, so the day another is
fixed this README fails rather than becoming the next stale inherited claim. Reported to micro-ui.

## Brand

`explorer` carries **`markId: null`** in the registry (`ui/packages/ui/src/surfaces.ts:446`), and
`brand/assets/explorer/` deliberately holds favicons and an og card only. `brand/plan.ts:50-62` gives
the reason: an explorer is part of Forge Network and "neither should claim a mark of its own" — but
each is served from its own subdomain, and "a browser tab and a shared link inherit nothing".

**There is no mark and no wordmark, and that is a decision, not a gap.** Nothing here renders one and
no chrome is designed around one. `test/brand-chrome.test.ts` asserts the absence in *both*
directions, so a mark appearing in `brand/assets/explorer/` later fails the build and forces a
decision rather than being copied in by reflex.

`index.html` sets `data-cf-product="network"`, not `"explorer"`, and that was checked rather than
assumed: **tokens.css has no `[data-cf-product='explorer']` block.** `network`'s is at
`ui/packages/ui/src/tokens.css:340-345` and carries `#d6412f`, the exact accent the registry gives
this surface. Naming the obvious key would have fallen through to the company ember in silence,
which is what `platform/apps/admin/index.html` did — and tokens.css says at `:389-396` that "every
key an app may set is declared" precisely to stop it. Reported to micro-ui; `explorer` is the key
that is still missing a block.

## Running it

```bash
pnpm install                 # resolves @cloudsforge/ui through link:../ui/packages/ui
pnpm dev                     # http://localhost:5189
pnpm typecheck
pnpm test
pnpm build
```

The suite runs with **no database, no browser and no network**. The cross-repository half of
`test/indexer.test.ts`, `test/tokens.test.ts`, `test/brand-chrome.test.ts`, `test/auth.test.ts` and
`test/citations.test.ts` skips itself when the sibling is not checked out, so `pnpm test` passes for
somebody who cloned only this repository — and **CI makes every one of those absences fatal**, then
mutates each check to prove it can fail. A skipped test is an unmeasured one.

With the siblings present (the estate's usual layout, `../indexer`, `../ui`, `../brand`,
`../identity`, `../web-template`, `../market`, `../docs`) the whole suite runs:

```bash
CLOUDSFORGE_INDEXER_DIR=../indexer CLOUDSFORGE_UI_DIR=../ui pnpm test
```

The image:

```bash
docker build -t explorer-web --build-context uipkg=../ui .
docker run --rm -p 8080:8080 explorer-web
```

## Known gaps

- **The authority gap is the headline one**, and it is recorded above and pinned by
  `test/indexer.test.ts`. Until `micro-indexer` opens a read path, this surface explains itself
  rather than showing blocks to the public.
- **Nothing is decoded.** Log topics and data are shown raw. An ABI is a fact a token registry would
  own, and no service in this estate owns one — `micro-market`'s `tokenFacts` is the same gap seen
  from the other side (`market/src/indexerclient.test.ts:289-292`). A decoded transfer here would be
  a guess wearing the clothes of a reading.
- **There is no "latest blocks" list.** `micro-indexer` serves a block by height and nothing that
  enumerates them, so a list would have to be assembled by walking down from `indexedHeight` — N
  requests to render one screen. The chain page links to the head instead, and the block page has a
  previous/next stepper.
- **A token's decimals are not applied to an activity amount.** The service returns
  `amountFormatted: null` for a token on purpose (`indexer/src/reads.ts:365-372`), so raw units are
  shown and labelled as raw. Scaling them would need the same token registry.
- **Non-EVM addresses and hashes are length-checked only**, upstream and here
  (`indexer/src/server.ts:610-616`), so the search box cannot classify a Bitcoin, Solana or XRP
  address by shape. It says so rather than guessing.
- **The CI file is bespoke and should not be.** `check:` and `image:` exist only because
  `@cloudsforge/ui` is unpublished; the day it is published they are replaced by a call to
  `micro-org`'s `web-ci.yml`. See the header of `.github/workflows/ci.yml`.

## The one temporary thing

`@cloudsforge/ui` is consumed as `link:../ui/packages/ui` because it is not published yet. When it
is, `package.json` becomes `"^1.0.0"`, the Dockerfile's `uipkg` build context goes, and the second
checkout in `ci.yml` goes with it. Nothing else in this repository changes.
