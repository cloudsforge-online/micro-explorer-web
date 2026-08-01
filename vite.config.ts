import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

/**
 * There is deliberately no `define`, no `envPrefix` and no `.env` file in this repository.
 *
 * A build-time constant is an environment baked into an image, and an image with an environment
 * baked into it has to be rebuilt to be promoted — which means the artefact that reaches
 * production is not the artefact that passed CI. Every host this app talks to is resolved at
 * RUNTIME from `window.location.hostname` by `cloudsforgeHosts()`, so one image serves localhost,
 * staging, a preview deployment and production. `test/no-build-time-config.test.ts` fails the
 * build if `import.meta.env.VITE_` ever reappears, and the `rules` job in CI greps for it again
 * so deleting the test does not delete the rule.
 */
export default defineConfig({
  plugins: [react()],
  resolve: {
    // @cloudsforge/ui is a `link:` dependency, so its own node_modules holds a second copy of
    // React. Two copies means two dispatchers, and the shared bar would throw on its first
    // useState.
    dedupe: ['react', 'react-dom'],
  },
  optimizeDeps: {
    // The linked package is shipped as TypeScript source until it is published; pre-bundling it
    // would freeze a stale copy of a package that is edited in the same working tree.
    exclude: ['@cloudsforge/ui'],
  },
  build: {
    // Named chunks and a real manifest of hashes: the assets are immutable-cached by nginx, and
    // that is only safe when every rebuild produces a new filename.
    sourcemap: true,
  },
  // ════════════════════════════════════════════════════════════════════════════════════════════
  // 5189 IS A VITE PORT. IT IS NEITHER THE REGISTRY'S `explorer` ENTRY NOR THE INDEXER'S PORT,
  // AND ON THIS SURFACE ALL THREE ARE DIFFERENT NUMBERS.
  //
  // The registry's devPort names where this surface answers on localhost, and for `explorer` it
  // says **8080** (`ui/packages/ui/src/surfaces.ts:443`). 8080 is the port the nginx-unprivileged
  // image listens on — it is this bundle's own container port, not an API.
  //
  // The API this bundle reads is `micro-indexer`, which binds **4008**: `indexer/src/env.ts:295`
  // defaults `PORT` to 4008, `indexer/.env.example:9` sets it to 4008, and `indexer/Dockerfile:91`
  // exposes it. The registry has **no `indexer` entry at all**, so `cloudsforgeHosts()` cannot
  // name it — the closest key is `explorer`, and under `pnpm dev` that resolves 8080, where the
  // indexer is not.
  //
  // That is NOT papered over with a literal port here. A hard-coded host is a second, unversioned
  // copy of the registry and the copy is the one that goes stale — the same conclusion admin-web,
  // mint-web and trade-web each reached about their own entry. The README says
  // `PORT=8080 pnpm dev` for the indexer in one line, `test/hosts.test.ts` pins BOTH numbers so
  // whichever moves first fails and names the other, and the finding is reported to micro-ui.
  //
  // In production the bundle and the indexer share `explorer.<apex>`, `apiBase()` is `''`, and
  // every request is relative. See src/lib/hosts.ts.
  // ════════════════════════════════════════════════════════════════════════════════════════════
  server: { port: 5189 },
  preview: { port: 5189 },
})
