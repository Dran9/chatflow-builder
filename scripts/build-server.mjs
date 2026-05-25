import * as esbuild from 'esbuild'
import { rm } from 'fs/promises'

await rm('dist-server', { recursive: true, force: true })

await esbuild.build({
  entryPoints: ['server/index.ts'],
  bundle: true,
  platform: 'node',
  target: 'node20',
  outdir: 'dist-server',
  format: 'esm',
  packages: 'external',
  sourcemap: false,
  minify: false,
})

console.log('✓ Server compiled to dist-server/')
