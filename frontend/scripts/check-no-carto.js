import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const srcDir = path.resolve(__dirname, '../src');

function scanDir(dir) {
  const results = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...scanDir(fullPath));
    } else if (/\.(jsx?|tsx?|css|html|json)$/i.test(entry.name)) {
      results.push(fullPath);
    }
  }
  return results;
}

const files = scanDir(srcDir);
let violations = 0;

for (const file of files) {
  const content = fs.readFileSync(file, 'utf8');
  const lines = content.split('\n');
  lines.forEach((line, idx) => {
    if (/carto/i.test(line)) {
      console.error(`[CARTO_CHECK_FAIL] Forbidden 'carto' reference in ${path.relative(srcDir, file)}:${idx + 1}`);
      console.error(`  > ${line.trim()}`);
      violations++;
    }
  });
}

if (violations > 0) {
  console.error(`\nFailed: Found ${violations} forbidden 'carto' reference(s) in src.`);
  process.exit(1);
} else {
  console.log(`✓ Clean: Checked ${files.length} files in src. No 'carto' references found.`);
  process.exit(0);
}

