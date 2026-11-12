import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as esbuild from 'esbuild';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const outDir = path.join(rootDir, '.tmp-tests');

fs.mkdirSync(outDir, { recursive: true });
const outFile = path.join(outDir, 'core.test.cjs');

try {
  esbuild.buildSync({
    entryPoints: [path.join(rootDir, 'tests', 'core.test.ts')],
    bundle: true,
    platform: 'node',
    format: 'cjs',
    outfile: outFile,
    sourcemap: 'inline',
  });

  const result = spawnSync(process.execPath, ['--test', outFile], {
    stdio: 'inherit',
  });

  process.exitCode = result.status ?? 1;
} finally {
  fs.rmSync(outDir, { recursive: true, force: true });
}
