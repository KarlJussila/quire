// Checks every {match} pattern against the stored fields of the kind it filters,
// and every `change` effect's `set` against the kind it changes. A match in the
// `where` of a {kind, where} filter names the candidate's own fields, and one
// elsewhere the creature in question's, so a misspelled field is caught here
// rather than silently matching nothing; a
// change's fields, a spell patch's on a cast or spell-access, and a summon's changes
// to its creature are caught the same way rather than silently changing nothing. A trigger's match tests the
// event's payload instead, which only the loaded vocabulary declares.

import type { Problem } from './explain.ts'

type Node = Record<string, any>

export function matchChecker(defs: Record<string, Node>, kinds: Record<string, string>) {
  const resolve = (s: Node | undefined): Node | undefined => {
    while (s?.$ref) s = defs[s.$ref.replace('#/$defs/', '')]
    return s
  }
  // The object shapes a field can hold, looking through unions and lists.
  const shapes = (s: Node | undefined): Node[] => {
    s = resolve(s)
    if (!s) return []
    if (s.anyOf || s.oneOf || s.allOf) return (s.anyOf ?? s.oneOf ?? s.allOf).flatMap(shapes)
    if (s.type === 'array') return shapes(s.items)
    return s.type === 'object' && (s.properties || s.patternProperties) ? [s] : []
  }
  // A field of an object shape: a declared property, or a key a map's pattern allows (a pool's `values`).
  const property = (s: Node, k: string): Node | undefined => s.properties?.[k]
    ?? Object.entries(s.patternProperties ?? {}).find(([re]) => new RegExp(re).test(k))?.[1]
  // A nested pattern, as opposed to a value: {chosen}, {choose}, and {atLeast, atMost} are values.
  const nested = (v: unknown): v is Record<string, unknown> =>
    !!v && typeof v === 'object' && !Array.isArray(v) && !['chosen', 'choose', 'atLeast', 'atMost', 'kind'].some((k) => k in v)

  function fields(within: Node[], pattern: Record<string, unknown>, path: string, out: Problem[]) {
    for (const [k, v] of Object.entries(pattern)) {
      const field = within.map((s) => property(s, k)).filter(Boolean) as Node[]
      if (!field.length) { out.push({ path: `${path}/${k}`, message: `there is no field "${k}" to match here` }); continue }
      for (const x of Array.isArray(v) ? v : [v]) if (nested(x)) fields(field.flatMap(shapes), x, `${path}/${k}`, out)
    }
  }

  const isList = (s: Node | undefined): boolean => {
    s = resolve(s)
    if (!s) return false
    if (s.anyOf || s.oneOf || s.allOf) return (s.anyOf ?? s.oneOf ?? s.allOf).some(isList)
    return s.type === 'array'
  }
  const plain = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)

  // A patch body: each key a field of `within`. A plain object recurses, or, on a
  // list, names elements by key; `$where` and `$remove` are patterns on the
  // list's elements, and `$where`'s other keys edit the elements it picks.
  function patch(within: Node[], body: Record<string, unknown>, path: string, out: Problem[]) {
    for (const [k, v] of Object.entries(body)) {
      const field = within.map((s) => property(s, k)).filter(Boolean) as Node[]
      if (!field.length) { out.push({ path: `${path}/${k}`, message: `there is no field "${k}" to change here` }); continue }
      value(field, v, `${path}/${k}`, out)
    }
  }
  function value(field: Node[], v: unknown, path: string, out: Problem[]) {
    if (!plain(v)) return
    const items = field.flatMap(shapes)
    if (plain(v.$remove)) { fields(items, v.$remove, `${path}/$remove`, out); return }
    if (plain(v.$where)) {
      fields(items, v.$where, `${path}/$where`, out)
      const { $where: _, ...rest } = v
      patch(items, rest, path, out)
      return
    }
    if (Object.keys(v).some((k) => k.startsWith('$'))) return
    if (field.some(isList)) {
      for (const [k, sub] of Object.entries(v)) if (plain(sub)) patch(items, sub, `${path}/${k}`, out)
    } else patch(items, v, path, out)
  }

  function walk(v: unknown, path: string, kind: string | undefined, out: Problem[], self?: string) {
    if (Array.isArray(v)) { v.forEach((x, i) => walk(x, `${path}/${i}`, kind, out)); return }
    if (!v || typeof v !== 'object') return
    const o = v as Record<string, unknown>
    // A {kind, where} filter: its `where` tests candidates of that kind. An object pool's candidates are items.
    const filter = 'where' in o ? (typeof o.kind === 'string' ? o.kind : o.pool === 'object' ? 'item' : undefined) : undefined
    if (o.type === 'change' && plain(o.set)) {
      // Without `of`, a creature's fields, which a rule may compute; `event`, the event's, which its vocabulary declares.
      const of = o.of === 'this' ? self : o.of === 'event' ? undefined : typeof o.of === 'string' ? o.of.split(':')[0] : plain(o.of) ? o.of.kind as string : undefined
      const def = of && kinds[of]
      if (def) patch(shapes(defs[def]), o.set, `${path}/set`, out)
    }
    // A summon's changes to the creature's stat block.
    if (plain(o.summon) && plain(o.summon.set) && kinds.creature) patch(shapes(defs[kinds.creature]), o.summon.set, `${path}/summon/set`, out)
    // A spell patch for one way of casting: a cast outcome's or a spell-access effect's `set`.
    const spellPatch = o.type === 'spell-access' ? o.set : plain(o.cast) ? o.cast.set : undefined
    if (plain(spellPatch) && kinds.spell) patch(shapes(defs[kinds.spell]), spellPatch, `${path}${o.type === 'spell-access' ? '' : '/cast'}/set`, out)
    for (const [k, x] of Object.entries(o)) {
      const at = `${path}/${k}`
      // A trigger's match tests its event's payload, which the loader checks (links.ts).
      // An item test's match reads how the item is carried: the fields a saved character keeps on it.
      if (k === 'match' && nested(x) && 'has' in o) { fields(shapes(defs.InventoryEntry), x, at, out); continue }
      if (k === 'match' && nested(x) && typeof o.event !== 'string') {
        const def = kinds[kind ?? 'creature']
        if (def) fields(shapes(defs[def]), x, at, out)
      } else walk(x, at, filter && k === 'where' ? filter : kind, out, self)
    }
  }
  return (entity: unknown): Problem[] => {
    const out: Problem[] = []
    const id = plain(entity) && typeof entity.id === 'string' ? entity.id : ''
    walk(entity, '', undefined, out, id.split(':')[0])
    return out
  }
}
