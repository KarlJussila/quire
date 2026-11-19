// The schema as one plain JSON Schema document (draft 2020-12). Entities are
// dispatched on their id's kind prefix, so one compiled validator checks
// every kind.

import { Declarations } from './index.ts'
import { EntityKinds } from './kinds.ts'
import { withGlobalForms, withPartFields, withComputedNumbers } from './global.ts'
import { CoreDecls } from './core.ts'

/** Strips TypeBox's internal keys and points every $ref at #/$defs. */
function plain(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(plain)
  if (node === null || typeof node !== 'object') return node
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(node)) {
    if (k.startsWith('~')) continue
    out[k] = k === '$ref' && typeof v === 'string' && !v.startsWith('#') ? `#/$defs/${v}` : plain(v)
  }
  return out
}

/** `declared`: without the forms every field takes (global.ts), which are resolved before
 *  rules run; the static types are generated from that. A list item's `when` and `key` stay. */
export function jsonSchema({ declared = false } = {}) {
  const own = withComputedNumbers(withPartFields(Object.fromEntries(Object.entries(Declarations).map(([k, v]) => [k, plain(v)])) as Record<string, any>),
    new Set(Object.keys(CoreDecls)))
  const $defs = declared ? own : withGlobalForms(own, Object.keys(EntityKinds), new Set(Object.values(EntityKinds)))
  const kinds = Object.entries(EntityKinds)
  return {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    $id: 'https://quire.local/schema/quire.schema.json',
    title: 'Quire entity',
    type: 'object',
    required: ['id'],
    properties: {
      id: { type: 'string', pattern: `^(${kinds.map(([k]) => k).join('|')}):` },
    },
    allOf: kinds.map(([kind, name]) => ({
      if: { properties: { id: { pattern: `^${kind}:` } } },
      then: { $ref: `#/$defs/${name}` },
    })),
    $defs,
  }
}
