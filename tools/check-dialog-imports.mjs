import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const SRC_DIR = 'src';

const collectTsxFiles = (dir) => {
  const output = [];
  for (const entry of readdirSync(dir)) {
    const fullPath = join(dir, entry);
    const stats = statSync(fullPath);
    if (stats.isDirectory()) {
      output.push(...collectTsxFiles(fullPath));
      continue;
    }
    if (fullPath.endsWith('.tsx')) {
      output.push(fullPath);
    }
  }
  return output;
};

const files = collectTsxFiles(SRC_DIR);
const invalidFiles = [];

for (const filePath of files) {
  const source = readFileSync(filePath, 'utf8');
  if (!source.includes('<Dialog')) continue;

  const dialogImports = [...source.matchAll(/import\s+\{([\s\S]*?)\}\s+from\s+['"]@\/components\/ui\/dialog['"]/g)]
    .map((match) => match[1] ?? '')
    .join(',');

  const hasDialogNamedImport = /(^|\W)Dialog(\W|$)/.test(dialogImports);
  const hasDialogPrimitiveUsage = source.includes('DialogPrimitive');

  if (!hasDialogNamedImport && !hasDialogPrimitiveUsage) {
    invalidFiles.push(filePath);
  }
}

if (invalidFiles.length > 0) {
  console.error('Found <Dialog usage without proper Dialog import in:');
  invalidFiles.forEach((filePath) => console.error(`- ${filePath}`));
  process.exit(1);
}

console.log('Dialog import check passed.');
