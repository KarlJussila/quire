// Prints the English rendering of entities next to their book text.
// Usage: node scripts/render.ts [--text] <id-or-prefix>... -- <bundle-dir>...
// An argument ending in ":" or "/" is a prefix: "condition:" renders every condition.

import { load, resolve } from '@quire/engine'
import { renderer } from '../src/index.ts'

const args = process.argv.slice(2)
const sep = args.indexOf('--')
const showText = args.includes('--text')
const wanted = args.slice(0, sep).filter((a) => a !== '--text')
const catalog = load(args.slice(sep + 1))
const name = (id: string) => (resolve(catalog, id)?.entity.name as string | undefined) ?? id.slice(id.indexOf(':') + 1).replace(/@.*/, '').replace(/-/g, ' ')
const r = renderer(name)
const matches = (id: string) => wanted.some((w) => (/[:/]$/.test(w) ? id.startsWith(w) : id === w))
for (const [id, { entity }] of [...catalog.entries].filter(([id]) => matches(id)).sort()) {
  console.log(`## ${entity.name} (${id})`)
  if (showText) console.log(`BOOK: ${(entity.text as { plain?: string } | undefined)?.plain ?? '(no text)'}\n`)
  // One entity the renderer can't read shouldn't hide the rest of the corpus
  try { for (const line of r.entity(entity)) console.log(line) } catch (e) { console.log(`[render error: ${(e as Error).message}]`); process.exitCode = 1 }
  console.log()
}
