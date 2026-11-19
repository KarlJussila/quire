// Validates JSON files against the schema and prints every problem.
// Usage: node scripts/validate.ts <file-or-dir>...
// A file may hold one entity or an array of entities. Exits 1 on any problem.

import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { checkEntity } from '../src/index.ts'

const files = (path: string): string[] =>
  statSync(path).isDirectory()
    ? readdirSync(path).flatMap((f) => files(join(path, f)))
    : path.endsWith('.json') ? [path] : []

let bad = 0
let count = 0
for (const file of process.argv.slice(2).flatMap(files)) {
  let data: unknown
  try { data = JSON.parse(readFileSync(file, 'utf8')) } catch (e) {
    console.log(`${file}: not valid JSON: ${(e as Error).message}`); bad++; continue
  }
  for (const entity of Array.isArray(data) ? data : [data]) {
    count++
    const problems = checkEntity(entity)
    if (!problems.length) continue
    bad++
    console.log(`${file} ${(entity as { id?: string }).id ?? '(no id)'}:`)
    for (const p of problems.slice(0, 12)) console.log(`  ${p.path || '/'}: ${p.message}`)
    if (problems.length > 12) console.log(`  … ${problems.length - 12} more`)
  }
}
console.log(`${count} entities, ${bad} with problems`)
process.exit(bad ? 1 : 0)
