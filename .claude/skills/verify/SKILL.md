---
name: verify
description: Build micro-explorer-web and drive it in a headless browser against a stub micro-indexer, to observe that panels render and that no Authorization header reaches the chain index.
---

# Verifying micro-explorer-web

This is a static SPA with **no environment in the image**. Everything it talks to is resolved in
the browser from `window.location`, so the only way to drive it is to serve the built bundle and
the stub API **on one origin**.

## The origin trap — read this first

`cloudsforgeHosts()` resolves `explorer` to `http://localhost:8080` in development
(`ui/packages/ui/src/surfaces.ts:443`), and `resolveApiBase` returns `''` only when the page origin
matches (`src/lib/hosts.ts:108-120`).

* Serve on **port 8080**, and load the page from **`http://localhost:8080`**, not `127.0.0.1`.
* `127.0.0.1` is a *different origin* from `localhost`. Every `/v1` call then goes cross-origin,
  CORS blocks it, and the app renders "Cannot reach the server" — which looks exactly like a
  broken change and is not one.

## Recipe

1. `pnpm build` → `dist/`.
2. Run one Node server on `127.0.0.1:8080` that serves `dist/` (SPA fallback to `index.html`) and
   answers `/v1/*` with stub JSON, **appending every request's `authorization` header to a log**.
   That log is the evidence for the no-bearer property; nothing else observes it.
3. Drive with headless Chrome:

   ```
   "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
     --headless=new --disable-gpu --no-sandbox --user-data-dir=<tmp> \
     --virtual-time-budget=6000 --window-size=1400,2600 --hide-scrollbars \
     --screenshot=<png> --dump-dom "http://localhost:8080/<route>"
   ```

   `--virtual-time-budget` is what lets the SPA's fetches settle before the DOM is dumped.
   **Chrome does not always exit after `--dump-dom`** — background it and kill it on a timer, or
   the run hangs.

## Routes worth driving

`/`, `/chains` (ten status calls), `/chains/ember/testnet`, `/blocks/ember/testnet/:h`,
`/tx/ember/testnet/:hash` (two calls), `/address/ember/testnet/:addr` (two calls),
`/tokens/ember/testnet/:addr`. Seven distinct indexer routes across them.

## Probes that matter here

Make the stub switchable (a mode file it re-reads per request):

* **session** — inject `localStorage.setItem('cf.accessToken', …)` into the shell, then confirm the
  request log still shows `authorization: null`. This is the property the repository exists on.
* **401 / 403** — must render `Failed` (message + request id), never a refusal panel, and with a
  session present must fire **zero** `cf:auth-expired` events and leave the tokens in storage.
* **router `not_found` vs `block_not_found` / `token_not_found`** — different screens; the first is
  worded as this bundle's own defect.
