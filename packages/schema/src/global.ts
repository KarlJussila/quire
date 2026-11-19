// Forms that stand in any field, added to the JSON Schema document here so no field
// declares them (design/model/choices.md, predicates.md "Ids, groups, and filters"):
//
// - every field takes a choice ({choose}), a read of a pick ({chosen}), or prose for what
//   isn't encoded yet ({prose: {text, gap}});
// - every id takes `this` (the entity the rule is on) or `candidate` (the one a
//   filter is considering), a group id, or a {kind, where} filter of its kinds;
// - in a test, every id also takes a list, any of which passes.
//
// What a group, filter, or list means follows from where it stands: in a test, any
// one of them; in what a rule gives or applies, every one; in a choice, one picked.
// The checker still puts each candidate of a choice in its place (choices.ts).

import { CharacterDecls } from './character.ts'

type Node = Record<string, any>

const KEY = '[a-z0-9][a-z0-9/_+-]*(@[0-9]{4})?'
const isObj = (x: unknown): x is Node => !!x && typeof x === 'object' && !Array.isArray(x)

// Saved documents: their fields hold answers and facts, not rules.
const DOCUMENTS = ['Manifest', ...Object.keys(CharacterDecls)]
// Defs whose fields are about the document, not rules, and the forms themselves.
const SKIP = new Set(['Choice', 'Chosen', 'StandIn', 'Prose', 'Text', 'Source', 'Gap', ...DOCUMENTS])
// Fields that name or identify a thing rather than hold a value.
const FIXED = new Set(['id', 'key', 'name'])

/** The kinds an id field takes, or undefined if it isn't an id field. */
function idKinds(s: Node, all: string[]): string[] | undefined {
  if (s.type !== 'string' || typeof s.pattern !== 'string' || !s.pattern.endsWith(`:${KEY}$`)) return undefined
  const m = /^\^\(([a-z|-]+)\):/.exec(s.pattern)
  return m ? m[1].split('|') : all
}

// A list's items are the parts of a rule: its effects, outcomes, activities, costs,
// recoveries, granted features. Each can carry `when` (only if) and `key` (a name other
// rules point at it by), so no kind of part declares them. Tests and numbers are not
// parts: a list of tests is `all` or `any`, a list of numbers a `sum`.
const NOT_PARTS = new Set(['Predicate', 'Value', 'Who', 'Patch', 'PatchValue', 'Choice', 'Chosen', 'Text', 'Source', 'Gap', ...DOCUMENTS])

export function withPartFields(defs: Record<string, Node>): Record<string, Node> {
  const out: Record<string, Node> = { ...defs }
  const parts = new Set<string>()
  const fields = { when: { $ref: '#/$defs/Predicate' }, key: { type: 'string', pattern: '^[a-z0-9][a-z0-9-]*$' } }
  // Adds the fields to every object form of a part, looking through unions.
  const asPart = (s: Node): Node => {
    if (s.$ref) { parts.add(s.$ref.replace('#/$defs/', '')); return s }
    if (s.anyOf) return { ...s, anyOf: s.anyOf.map(asPart) }
    if (s.type === 'object' && s.properties && !s.properties.choose) return { ...s, properties: { ...fields, ...s.properties } }
    return s
  }
  const walk = (s: unknown): any => {
    if (Array.isArray(s)) return s.map(walk)
    if (!isObj(s)) return s
    return Object.fromEntries(Object.entries(s).map(([k, v]) => [k, k === 'items' && isObj(v) ? asPart(walk(v)) : walk(v)]))
  }
  for (const [name, def] of Object.entries(defs)) if (!NOT_PARTS.has(name)) out[name] = walk(def)
  for (const name of parts) if (!NOT_PARTS.has(name)) out[name] = asPart({ anyOf: [out[name]] }).anyOf[0]
  return out
}

// A number in a rule can be computed: any number field of the rule grammar also takes a
// Value's readers and arithmetic, as `$multiply` by your level would. A plain number still
// meets the field's own limits. Stored data (a stat block's AC, a spell's level) stays plain.
export function withComputedNumbers(defs: Record<string, Node>, rules: Set<string>): Record<string, Node> {
  const out: Record<string, Node> = { ...defs }
  out.Computed = { anyOf: defs.Value.anyOf.filter((b: Node) => b.type === 'object' || b.$ref),
    description: 'A number worked out in play: a path such as "levels.total" or "modifiers.ability:wis", or arithmetic on them' }
  const isNumber = (s: Node) => s.type === 'number' || s.type === 'integer'
  const slot = (s: Node): Node => (isNumber(s) ? { anyOf: [s, { $ref: '#/$defs/Computed' }] } : walk(s))
  const walk = (s: unknown): any => {
    if (Array.isArray(s)) return s.map(walk)
    if (!isObj(s)) return s
    return Object.fromEntries(Object.entries(s).map(([k, v]) =>
      [k, k === 'properties' && isObj(v) ? Object.fromEntries(Object.entries(v).map(([p, ps]) => [p, slot(ps)]))
        : k === 'items' && isObj(v) ? slot(v)
        : k === 'prefixItems' && Array.isArray(v) ? v.map(slot) : walk(v)]))
  }
  for (const name of rules) if (name !== 'Value') out[name] = walk(defs[name])
  // Value's own fields too: `divide`'s `by`
  out.Value = { ...defs.Value, anyOf: defs.Value.anyOf.map((b: Node) => (b.type === 'object' ? walk(b) : b)) }
  return out
}

/** `entities`: the defs that are whole entities, which no field holds. */
export function withGlobalForms(defs: Record<string, Node>, kinds: string[], entities: Set<string>): Record<string, Node> {
  const out: Record<string, Node> = { ...defs }
  const ref = (name: string) => ({ $ref: `#/$defs/${name}` })
  // One def per set of kinds, shared by every id field of those kinds.
  const idDef = (s: Node, ks: string[], test: boolean) => {
    const label = ks === kinds ? 'any kind' : ks.join(', ')
    const name = `${test ? 'Ids' : 'Id'} (${label})`
    if (!out[name]) {
      const filter = `Filter (${label})`
      out[filter] ??= { type: 'object', required: ['kind'], additionalProperties: false,
        description: 'Every entity of this kind that matches `where`; what that means follows from where it stands',
        properties: { kind: { enum: ks }, where: ref('Predicate') } }
      const one = [s, ...(ks.includes('group') ? [] : [ref('GroupId')]), ref('Pronoun'), ref(filter), ref('StandIn')]
      out[name] = test ? { anyOf: [ref(`Id (${label})`), { type: 'array', minItems: 1, items: ref(`Id (${label})`) }] } : { anyOf: one }
      if (test) idDef(s, ks, false)
    }
    return ref(name)
  }
  // A field holding a def takes a choice through the def itself, below.
  const field = (s: Node): Node => s.$ref || (s.anyOf && s.anyOf.some((b: Node) => b.$ref === '#/$defs/StandIn'))
    ? s : { anyOf: [s, ref('StandIn')] }

  // `test`: the fields of a test, where an id also takes a list.
  function walk(s: unknown, test = false): any {
    if (Array.isArray(s)) return s.map((x) => walk(x, test))
    if (!isObj(s)) return s
    const ks = idKinds(s, kinds)
    if (ks) return idDef(s, ks, test)
    const o: Node = {}
    for (const [k, v] of Object.entries(s)) {
      if (k === 'properties' && isObj(v))
        o[k] = Object.fromEntries(Object.entries(v).map(([p, ps]) =>
          [p, FIXED.has(p) || (p === 'type' && ps.const !== undefined) ? ps : field(walk(ps, test))]))
      else if ((k === 'items' || k === 'additionalProperties') && isObj(v)) o[k] = field(walk(v))
      else if (k === 'patternProperties' && isObj(v)) o[k] = Object.fromEntries(Object.entries(v).map(([p, ps]) => [p, field(walk(ps))]))
      else if (k === 'prefixItems' && Array.isArray(v)) o[k] = v.map((x) => field(walk(x)))
      else if (k === 'anyOf' || k === 'oneOf' || k === 'allOf') o[k] = walk(v, test)
      else o[k] = v
    }
    return o
  }
  for (const [name, def] of Object.entries(defs)) {
    if (SKIP.has(name)) continue
    // A test's own fields, the atoms of a Predicate, take lists of ids.
    const body = name === 'Predicate'
      ? { ...def, anyOf: def.anyOf.map((atom: Node) => walk(atom, true)) }
      : walk(def)
    out[name] = entities.has(name) ? body : { anyOf: [body, ref('StandIn')] }
  }
  out.StandIn = { anyOf: [ref('Choice'), ref('Chosen'), ref('Prose')], description: 'A choice, a read of a pick, or prose for what isn\'t encoded yet; any field takes one' }
  out.Prose = { type: 'object', required: ['prose'], additionalProperties: false,
    description: 'What a rule does or tests, in words, where the grammar can\'t say it yet: "while you have a hand free". `gap` names what\'s missing',
    properties: { prose: { type: 'object', required: ['text'], additionalProperties: false,
      properties: { text: { type: 'string' }, gap: ref('Gap') } } } }
  out.GroupId = { type: 'string', pattern: `^group:${KEY}$`, description: 'Any of the group\'s members' }
  out.Pronoun = { enum: ['this', 'candidate'], description: '`this`: the entity the rule is on; `candidate`: what a filter or choice is considering' }
  return out
}
