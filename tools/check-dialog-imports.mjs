import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const SRC_DIR = 'src';
const files = [];

const walk = (dir) => {
  for (const entry of readdirSync(dir)) {
    const fullPath = join(dir, entry);
    const stats = statSync(fullPath);
    if (stats.isDirectory()) {
      walk(fullPath);
      continue;
    }
    if (fullPath.endsWith('.tsx')) {
      files.push(fullPath);
    }
  }
};

walk(SRC_DIR);

const invalidFiles = [];

for (const filePath of files) {
  const source = readFileSync(filePath, 'utf8');
  if (!source.includes('<Dialog')) continue;

  const hasUiDialogImport =
    /from\s+['"]@\/components\/ui\/dialog['"]/.test(source) &&
    /\bDialog\b/.test(source.split(/from\s+['"]@\/components\/ui\/dialog['"]/)[0] || source);

  const hasDialogPrimitiveUsage = /DialogPrimitive/.test(source);

  if (!hasUiDialogImport && !hasDialogPrimitiveUsage) {
    invalidFiles.push(filePath);
  }
}

if (invalidFiles.length > 0) {
  console.error('Found <Dialog usage without proper import in:');
  invalidFiles.forEach((file) => console.error(`- ${file}`));
  process.exit(1);
}

console.log('Dialog import check passed.');
