// Second codemod pass: the computed/typed cases the first pass left for review.
//
// For Badge/Tag ONLY, a computed `variant={expr}` virtually always carries a
// status COLOR (the old conflated axis). Since the new `color` prop is an open
// string, renaming the prop — and retyping `BadgeProps['variant']` /
// `TagProps['variant']` annotations to `['color']` — is type-correct and keeps
// rendering: known colors resolve, legacy non-colors (default/outline/secondary)
// fall back to neutral. Button computed cases are NOT touched (treatment vs
// color is ambiguous there) — those are fixed by hand.
//
//   node scripts/migrate-variants-expr.mjs            # dry-run
//   node scripts/migrate-variants-expr.mjs --write

import ts from 'typescript';
import { readFileSync, writeFileSync, globSync } from 'node:fs';

const WRITE = process.argv.includes('--write');
const ROOTS = ['apps/dashboard', 'apps/web', 'apps/storefront'];
const SKIP = [/app[\\/]showcase[\\/]/, /node_modules/, /[\\/]e2e[\\/]/, /\.test\./, /\.spec\./];
const CHIP = new Set(['Badge', 'Tag']);

function files() {
  const out = [];
  for (const root of ROOTS) {
    let m = [];
    try {
      m = globSync(`${root}/**/*.tsx`);
    } catch {
      m = [];
    }
    for (const f of m) if (!SKIP.some((re) => re.test(f))) out.push(f.replace(/\\/g, '/'));
  }
  return out;
}

let changedFiles = 0;
let renameCount = 0;
let retypeCount = 0;

for (const file of files()) {
  let src = readFileSync(file, 'utf8');

  // 1) Retype annotations (plain text — these reference the prop type by name).
  const before = src;
  src = src
    .replace(/BadgeProps\['variant'\]/g, "BadgeProps['color']")
    .replace(/BadgeProps\["variant"\]/g, 'BadgeProps["color"]')
    .replace(/TagProps\['variant'\]/g, "TagProps['color']")
    .replace(/TagProps\["variant"\]/g, 'TagProps["color"]');
  if (src !== before) retypeCount += 1;

  // 2) Rename Badge/Tag computed `variant={…}` attribute name → `color`.
  const sf = ts.createSourceFile(file, src, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const edits = [];
  const visit = (node) => {
    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
      if (CHIP.has(node.tagName.getText(sf))) {
        for (const attr of node.attributes.properties) {
          if (!ts.isJsxAttribute(attr)) continue;
          if (attr.name.getText(sf) !== 'variant') continue;
          const init = attr.initializer;
          if (init && ts.isJsxExpression(init)) {
            // rename just the name token
            edits.push({ start: attr.name.getStart(sf), end: attr.name.getEnd(), text: 'color' });
          }
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);

  if (edits.length) {
    renameCount += edits.length;
    edits.sort((a, b) => b.start - a.start);
    for (const e of edits) src = src.slice(0, e.start) + e.text + src.slice(e.end);
  }

  if (src !== readFileSync(file, 'utf8')) {
    changedFiles += 1;
    if (WRITE) writeFileSync(file, src, 'utf8');
    else console.log(`${file}: ${edits.length} rename(s)${src !== before ? ' + retype' : ''}`);
  }
}

console.log(
  `\n${WRITE ? 'Applied' : 'Would apply'}: ${renameCount} prop rename(s), ${retypeCount} retype(s) across ${changedFiles} file(s).`
);
