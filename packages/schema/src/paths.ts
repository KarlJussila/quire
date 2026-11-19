// The paths an entity reads ("modifiers.ability:wis", "target.hp.max"), and whether a stored
// field holds one (design/model/roles-and-values.md, "What a path can read"). A path is a string
// standing where the schema takes a Path, so the walk follows the schema: "up" in a field of its
// own is a word, not a path. Nothing lists the facts a rule may read; a path no stored field
// holds is one some rule must compute, and the loader lists those.

type Node = Record<string, any>

const ROLE = /^(self|this|target|source|subject|actor|candidate)\./
const isObj = (x: unknown): x is Node => !!x && typeof x === 'object' && !Array.isArray(x)

export function pathReader(defs: Record<string, Node>) {
  const memo = new Map<Node, Node[]>()
  // The concrete shapes a schema allows, looking through refs and unions.
  const alts = (s: Node | undefined): Node[] => {
    if (!s) return []
    let r = memo.get(s)
    if (!r) {
      memo.set(s, (r = []))
      r.push(...(s.$ref ? alts(defs[s.$ref.replace('#/$defs/', '')]) : s.anyOf || s.oneOf ? (s.anyOf ?? s.oneOf).flatMap(alts) : [s]))
    }
    return r
  }
  const pathString = alts(defs.Path).find((b) => b.type === 'string')!
  const PATH = new RegExp(pathString.pattern)
  // A patch body's values aren't typed by the schema; there a dotted string of a path's shape is
  // one, as no id, dice string, or word has a dot.
  // (A choice can stand in a patch value as in any field, and is walked as the choice it is.)
  const standIn = new Set(alts(defs.StandIn))
  const patchValue = new Set(alts(defs.PatchValue).filter((b) => !standIn.has(b)))
  const loose = (x: unknown, out: Set<string>) => {
    if (typeof x === 'string') { if (x.includes('.') && PATH.test(x)) out.add(x) }
    else if (Array.isArray(x)) x.forEach((y) => loose(y, out))
    else if (isObj(x)) Object.values(x).forEach((y) => loose(y, out))
  }
  const property = (b: Node, k: string): Node | undefined => b.properties?.[k]
    ?? Object.entries(b.patternProperties ?? {}).find(([re]) => new RegExp(re).test(k))?.[1]
    ?? (isObj(b.additionalProperties) ? b.additionalProperties : undefined)
  // Whether an object can be this shape: its keys allowed, its required keys and constants there.
  const fits = (o: Node, b: Node) => b.type === 'object'
    && (b.required ?? []).every((k: string) => k in o)
    && Object.entries(o).every(([k, v]) => {
      const p = property(b, k)
      return p ? p.const === undefined || p.const === v : b.additionalProperties !== false
    })

  function walk(x: unknown, s: Node | undefined, out: Set<string>) {
    // A choice's candidates stand in its place; a named group's items are the place's items, and a
    // range's bounds ({atLeast?, atMost?}: "up to your ki points") are values of the place.
    if (isObj(x) && isObj(x.choose)) {
      for (const c of Array.isArray(x.choose.from) ? x.choose.from : [])
        if (isObj(c) && Array.isArray(c.of)) c.of.forEach((y: unknown) => { walk(y, s, out); for (const b of alts(s)) walk(y, b.items, out) })
        else if (isObj(c) && Object.keys(c).length && Object.keys(c).every((k) => k === 'atLeast' || k === 'atMost')) Object.values(c).forEach((y) => walk(y, s, out))
        else walk(c, s, out)
      return
    }
    for (const b of alts(s)) {
      if (patchValue.has(b)) { loose(x, out); return }
      if (typeof x === 'string') { if (b === pathString && PATH.test(x)) out.add(x) }
      else if (Array.isArray(x)) { if (b.type === 'array') x.forEach((y, i) => walk(y, b.prefixItems?.[i] ?? b.items, out)) }
      else if (isObj(x) && fits(x, b)) for (const [k, v] of Object.entries(x)) walk(v, property(b, k), out)
    }
  }

  return {
    /** Every path the value reads, held to the named declaration's schema. */
    pathsIn(value: unknown, declaration: string): Set<string> {
      const out = new Set<string>()
      walk(value, defs[declaration], out)
      return out
    },
    /** Whether one of the declarations stores a field at the path. A segment in braces,
     *  a pick, is any key of a map. */
    stored(path: string, declarations: string[]): boolean {
      const at = (s: Node | undefined, segs: string[]): boolean => !segs.length
        || alts(s).some((b) => b.type === 'object' && at(segs[0].startsWith('{')
          ? Object.values(b.patternProperties ?? {})[0] ?? (isObj(b.additionalProperties) ? b.additionalProperties : undefined)
          : property(b, segs[0]), segs.slice(1)))
      const segs = path.replace(ROLE, '').split('.')
      return declarations.some((d) => at(defs[d], segs))
    },
  }
}
