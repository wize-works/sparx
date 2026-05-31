// Codemod: migrate Button/Badge/Tag from the old single-axis `variant` API to
// the multi-axis color × variant × size × shape API (docs/35 §6).
//
// AST-located (TypeScript compiler API), applied by text-splicing so existing
// formatting is preserved. Component-aware: the same old `variant` value maps
// differently for Button vs Badge/Tag. Anything it can't safely resolve
// (variant={expr}, unknown values) is reported, never guessed.
//
//   node scripts/migrate-variants.mjs            # dry-run, prints a summary
//   node scripts/migrate-variants.mjs --write    # apply edits

import ts from 'typescript';
import { readFileSync, writeFileSync } from 'node:fs';
import { globSync } from 'node:fs';
import { join } from 'node:path';

const WRITE = process.argv.includes('--write');
const ROOTS = ['apps/dashboard', 'apps/web', 'apps/storefront'];
const SKIP = [/app[\\/]showcase[\\/]/, /node_modules/, /[\\/]e2e[\\/]/, /\.test\./, /\.spec\./];

// value → replacement attribute text ('' means remove the attribute)
const BUTTON_VARIANT = {
  primary: '',
  secondary: 'variant="outline"',
  outline: 'variant="outline"',
  soft: 'color="primary" variant="soft"',
  ghost: 'variant="ghost"',
  link: 'color="primary" variant="link"',
  danger: 'color="danger"',
  warning: 'color="warning"',
  module: 'color="module"',
  'module-outline': 'color="module" variant="outline"',
};
const BUTTON_SIZE = {
  'icon-sm': 'shape="square" size="sm"',
  'icon-md': 'shape="square" size="md"',
  'icon-lg': 'shape="square" size="lg"',
};
const CHIP_VARIANT = {
  default: '',
  secondary: 'variant="outline"',
  primary: 'color="primary"',
  success: 'color="success"',
  warning: 'color="warning"',
  danger: 'color="danger"',
  module: 'color="module"',
  soft: 'color="primary"',
  outline: 'variant="outline"',
};

const TARGETS = {
  Button: { variant: BUTTON_VARIANT, size: BUTTON_SIZE },
  Badge: { variant: CHIP_VARIANT },
  Tag: { variant: CHIP_VARIANT },
};

// Values that are already valid in the NEW API — leave untouched, don't report.
const ALREADY_NEW = new Set([
  // treatments
  'solid',
  // sizes
  'xs',
  'sm',
  'md',
  'lg',
  'xl',
]);

function collectFiles() {
  const files = [];
  for (const root of ROOTS) {
    let matches = [];
    try {
      matches = globSync(`${root}/**/*.tsx`);
    } catch {
      matches = [];
    }
    for (const f of matches) {
      const norm = f.replace(/\\/g, '/');
      if (!SKIP.some((re) => re.test(f))) files.push(norm);
    }
  }
  return files;
}

const report = { changed: 0, edits: 0, manual: [] };

for (const file of collectFiles()) {
  const src = readFileSync(file, 'utf8');
  const sf = ts.createSourceFile(file, src, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const edits = [];

  const visit = (node) => {
    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
      const tag = node.tagName.getText(sf);
      const map = TARGETS[tag];
      if (map) {
        for (const attr of node.attributes.properties) {
          if (!ts.isJsxAttribute(attr)) continue;
          const name = attr.name.getText(sf);
          const table = map[name];
          if (!table) continue;
          const init = attr.initializer;
          if (!init || !ts.isStringLiteral(init)) {
            if (init && ts.isJsxExpression(init)) {
              report.manual.push(`${file}: <${tag} ${name}={…}> — expression, migrate by hand`);
            }
            continue;
          }
          const value = init.text;
          if (!(value in table)) {
            if (!ALREADY_NEW.has(value)) {
              report.manual.push(`${file}: <${tag} ${name}="${value}"> — unmapped, check by hand`);
            }
            continue;
          }
          const replacement = table[value];
          const start = attr.getStart(sf);
          const end = attr.getEnd();
          if (replacement === '') {
            // eat one preceding space so we don't leave a double space
            const from = src[start - 1] === ' ' ? start - 1 : start;
            edits.push({ start: from, end, text: '' });
          } else {
            edits.push({ start, end, text: replacement });
          }
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);

  if (edits.length === 0) continue;
  report.changed += 1;
  report.edits += edits.length;

  if (WRITE) {
    edits.sort((a, b) => b.start - a.start);
    let out = src;
    for (const e of edits) out = out.slice(0, e.start) + e.text + out.slice(e.end);
    writeFileSync(file, out, 'utf8');
  } else {
    console.log(`${file}: ${edits.length} edit(s)`);
  }
}

console.log(
  `\n${WRITE ? 'Applied' : 'Would apply'} ${report.edits} edit(s) across ${report.changed} file(s).`
);
if (report.manual.length) {
  console.log(`\n${report.manual.length} item(s) need manual review:`);
  for (const m of report.manual) console.log('  - ' + m);
}
