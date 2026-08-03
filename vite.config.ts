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
  // Three numbers, all different, and each names a different thing.
  //
  // The registry's devPort for `explorer` is **4008** (`ui/packages/ui/src/surfaces.ts:523`) —
  // where `micro-indexer`, the API this bundle reads, answers on localhost
  // (`indexer/src/env.ts:295`). It briefly said 8080, this bundle's own container port, which
  // made the app ask itself for chain data; micro-ui corrected it and pinned it to the service.
  //
  // 8080 is the nginx-unprivileged container port (`nginx.conf:29`) — a fact about the IMAGE.
  // And the number below is Vite's dev-server port, a fact about development. Confusing any two
  // of these is how five registry entries came to be wrong.
  server: { port: 5189 },
  preview: { port: 5189 },
})
