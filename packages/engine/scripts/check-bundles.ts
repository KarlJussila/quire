// Loads bundle directories into one catalog and prints what the loader found.
// Usage: node scripts/check-bundles.ts [--all] <bundle-dir>...
// Exits 1 if there are any errors. --all lists every finding, not just a sample.

import { load, type Finding } from '../src/index.ts'

const args = process.argv.slice(2)
const all = args.includes('--all')
const dirs = args.filter((a) => a !== '--all')
const started = performance.now()
const catalog = load(dirs)
const ms = performance.now() - started

const byCode = new Map<string, Finding[]>()
for (const f of catalog.findings) byCode.set(f.code, [...(byCode.get(f.code) ?? []), f])
for (const [code, list] of [...byCode].sort((a, b) => b[1].length - a[1].length)) {
  console.log(`${list[0].severity} ${code}: ${list.length}`)
  for (const f of all ? list : list.slice(0, 3))
    console.log(`  ${[f.bundle, f.file, f.id].filter(Boolean).join(' ')}: ${f.message}`)
}
const entities = [...catalog.bundles.values()].reduce((n, b) => n + b.entities.length, 0)
console.log(`${catalog.bundles.size} bundles, ${entities} valid entities, ${catalog.entries.size} after collapse, ${(ms / 1000).toFixed(1)} s`)
process.exit(catalog.findings.some((f) => f.severity === 'error') ? 1 : 0)
