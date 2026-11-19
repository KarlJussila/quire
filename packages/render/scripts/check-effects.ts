// Checks transcribed effects before they're written into the bundles: each
// entity must stay valid with them, every id they name must exist, what they
// reach into must be there (a patched activity, a named value), and the
// English rendering is printed under the book text for comparison.
// Input lines are {id, source?, effects?, features?, ...}; with `source`, that file's
// copy is checked and its text shown, not the copy that wins in the catalog. Usage:
//   node scripts/check-effects.ts <results.jsonl> -- <bundle-dir>...

import { readFileSync } from 'node:fs'
import { load, reachProblems, references, resolve } from '@quire/engine'
import { checkEntity } from '@quire/schema'
import { renderer } from '../src/index.ts'

const args = process.argv.slice(2)
const sep = args.indexOf('--')
const catalog = load(args.slice(sep + 1))
const name = (id: string) => (resolve(catalog, id)?.entity.name as string | undefined) ?? id.slice(id.indexOf(':') + 1).replace(/@.*/, '').replace(/-/g, ' ')
const r = renderer(name)

let bad = 0
const results = readFileSync(args[0], 'utf8').split('\n').filter((l) => l.trim())
for (const [n, line] of results.entries()) {
  const problems: string[] = []
  let result: { id?: string; effects?: unknown }
  try { result = JSON.parse(line) } catch (e) { console.log(`## line ${n + 1}\nPROBLEM: not JSON: ${(e as Error).message}\n`); bad++; continue }
  const entry = result.id ? catalog.entries.get(result.id) : undefined
  console.log(`## ${result.id ?? `line ${n + 1}`}`)
  if (!entry) { console.log(`PROBLEM: no entity with this id\n`); bad++; continue }
  const { id: _id, notes: _notes, source, ...fields } = result as Record<string, unknown>
  const base = source ? JSON.parse(readFileSync(source as string, 'utf8')) : entry.entity
  if (source) console.log(`(the copy in ${source})`)
  const entity = { ...base, ...fields }
  for (const p of checkEntity(entity)) problems.push(`${p.path}: ${p.message}`)
  for (const ref of references(fields)) if (!resolve(catalog, ref.ref, ref.path)) problems.push(`${ref.path}: ${ref.ref} doesn't exist`)
  if (!problems.length) for (const p of reachProblems(catalog, entity)) problems.push(`${p.path}: ${p.message}`)
  console.log(`BOOK: ${(base.text as { plain?: string } | undefined)?.plain ?? '(no text)'}\n`)
  if (!problems.length) {
    try { for (const l of r.entity(entity)) console.log(`ENGLISH: ${l}`) } catch (e) { problems.push(`rendering failed: ${(e as Error).message}`) }
  }
  for (const p of problems) console.log(`PROBLEM: ${p}`)
  if (problems.length) bad++
  console.log()
}
console.log(`${results.length} results, ${bad} with problems`)
process.exit(bad ? 1 : 0)
