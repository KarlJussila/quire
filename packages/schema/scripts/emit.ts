// Writes generated/quire.schema.json, for editors and other tools.

import { writeFileSync, mkdirSync } from 'node:fs'
import { jsonSchema } from '../src/index.ts'

const out = new URL('../generated/', import.meta.url)
mkdirSync(out, { recursive: true })
writeFileSync(new URL('quire.schema.json', out), JSON.stringify(jsonSchema(), null, 2) + '\n')
console.log('wrote generated/quire.schema.json')
