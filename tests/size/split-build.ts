// Builds the production bundle a second time into node_modules/.cache/size-dist with MapLibre split
// into its own chunk, so size-limit can budget "app JS excluding MapLibre" separately from MapLibre
// itself (docs/contracts.md: app <= 400 KB gz, MapLibre ~ 250 KB gz). The real `pnpm build` output in
// dist/ is untouched; this build exists only to be measured. Run via `pnpm size`.
import { build } from 'vite';

await build({
  configFile: new URL('../../vite.config.ts', import.meta.url).pathname,
  logLevel: 'warn',
  build: {
    outDir: 'node_modules/.cache/size-dist',
    emptyOutDir: true,
    chunkSizeWarningLimit: 2000,
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [{ name: 'maplibre', test: /node_modules[\\/](\.pnpm[\\/])?maplibre-gl/ }],
        },
      },
    },
  },
});
