import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as esbuild from 'esbuild';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const outDir = path.join(rootDir, '.tmp-chaos');

fs.mkdirSync(outDir, { recursive: true });
const outFile = path.join(outDir, 'stress-user-chaos.cjs');

try {
  esbuild.buildSync({
    entryPoints: [path.join(rootDir, 'scripts', 'stress-user-chaos.ts')],
    bundle: true,
    platform: 'node',
    format: 'cjs',
    outfile: outFile,
    sourcemap: 'inline',
  });

  const result = spawnSync(process.execPath, [outFile], {
    stdio: 'inherit',
  });

  process.exitCode = result.status ?? 1;
} finally {
  fs.rmSync(outDir, { recursive: true, force: true });
}
