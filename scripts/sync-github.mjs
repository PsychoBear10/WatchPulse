import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const targetDir = path.join(rootDir, 'github');

const DIRECTORIES = ['.github', 'build', 'electron', 'scripts', 'src', 'tests'];
const ROOT_FILES = [
  'CHANGELOG.docx',
  'changelog.json',
  'index.html',
  'LICENSE',
  'package.json',
  'package-lock.json',
  'postcss.config.js',
  'README.md',
  'tailwind.config.js',
  'tsconfig.electron.json',
  'tsconfig.json',
  'vite.config.ts'
];

function getFolderSize(dir) {
  let total = 0;
  if (!fs.existsSync(dir)) return 0;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      total += getFolderSize(fullPath);
    } else {
      total += fs.statSync(fullPath).size;
    }
  }
  return total;
}

export function syncGithubFolder() {
  const pkg = JSON.parse(fs.readFileSync(path.join(rootDir, 'package.json'), 'utf-8'));
  console.log(`Syncing WatchPulse v${pkg.version} to clean github/ folder...`);

  if (fs.existsSync(targetDir)) {
    fs.rmSync(targetDir, { recursive: true, force: true });
  }
  fs.mkdirSync(targetDir, { recursive: true });

  for (const dir of DIRECTORIES) {
    const src = path.join(rootDir, dir);
    const dest = path.join(targetDir, dir);
    if (fs.existsSync(src)) {
      fs.cpSync(src, dest, { recursive: true });
    }
  }

  for (const file of ROOT_FILES) {
    const src = path.join(rootDir, file);
    const dest = path.join(targetDir, file);
    if (fs.existsSync(src)) {
      fs.copyFileSync(src, dest);
    }
  }

  // Write dedicated .gitignore for github upload
  const gitignoreContent = `# Dependencies
node_modules/
.pnp
.pnp.js

# Build Outputs
dist/
dist-electron/
release/
build/*.exe
build/*.zip

# Temporary & Test files
.tmp-tests/
coverage/
*.log
npm-debug.log*
yarn-debug.log*
yarn-error.log*

# Environment and local files
.env
.env.local
.env.*.local

# OS Generated
.DS_Store
Thumbs.db
ehthumbs.db
[Dd]esktop.ini
`;

  fs.writeFileSync(path.join(targetDir, '.gitignore'), gitignoreContent, 'utf-8');

  const sizeMb = (getFolderSize(targetDir) / (1024 * 1024)).toFixed(2);
  console.log(`Successfully synced github/ folder (${sizeMb} MB) ready for drag-and-drop to GitHub.`);
}

syncGithubFolder();
