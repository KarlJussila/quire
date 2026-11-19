// Fails if generated/ is out of date with the schema source.

import { readFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'

const files = ['generated/quire.schema.json', 'generated/types.ts']
const before = files.map((f) => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8'))
execFileSync('node', ['scripts/emit.ts'], { cwd: new URL('..', import.meta.url) })
execFileSync('node', ['scripts/types.ts'], { cwd: new URL('..', import.meta.url) })
const stale = files.filter((f, i) => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8') !== before[i])
if (stale.length) {
  console.error(`regenerated stale files: ${stale.join(', ')} (commit them)`)
  process.exit(1)
}
