// The creature paths loaded rules compute (design/model/roles-and-values.md, "Paths"). A
// `resource` effect computes its pool: `pools.<key>.max` and `.current`, and each field it
// declares (`die`, `dc`); an activity's `uses` is a pool by the activity's key. A `change` on the creature that gives a field its starting value (`$base`)
// or sets it outright (`$replace`, or a plain value) computes that field: a rule computing `sanity` makes `sanity` readable.
// Each is a list of segments; `*` is any key (`$where: true`, or an entry picked in play).
// A `proficiency` effect computes `proficiencies.<what it is in>`: how many times the proficiency bonus counts.
// Class levels (`levels.class:wizard`, `levels.total`) are the engine's own: it counts a
// character's stored `classes` before any rule runs, since they decide which features it has.

type O = Record<string, unknown>
const plain = (v: unknown): v is O => !!v && typeof v === 'object' && !Array.isArray(v)

function writes(set: unknown, segs: string[], out: string[][]) {
  if (!plain(set)) { if (set !== undefined && set !== true) out.push(segs); return }
  if ('$base' in set) out.push(segs)
  if ('$replace' in set) { out.push(segs); return }
  const { $where, $at, ...rest } = set
  const here = $where !== undefined || $at !== undefined
    ? [...segs, $where === undefined && typeof $at === 'string' ? $at : '*'] : segs
  if (here !== segs && ('$base' in rest || '$replace' in rest)) out.push(here)
  for (const [k, v] of Object.entries(rest)) if (!k.startsWith('$')) writes(v, [...here, k], out)
}

export function suppliedPaths(entities: Iterable<unknown>): string[][] {
  const out: string[][] = [['levels', '*']]
  const walk = (x: unknown) => {
    if (Array.isArray(x)) { x.forEach(walk); return }
    if (!plain(x)) return
    if (x.type === 'resource' && typeof x.key === 'string')
      for (const f of ['max', 'current', ...Object.keys(x).filter((k) => !['type', 'key', 'recover', 'when', 'group'].includes(k))])
        out.push(['pools', x.key, f])
    if (typeof x.key === 'string' && plain(x.uses)) out.push(['pools', x.key, 'max'], ['pools', x.key, 'current'])
    if (x.type === 'change' && x.of === undefined) writes(x.set, [], out)
    if (x.type === 'proficiency') out.push(['proficiencies', '*'])
    Object.values(x).forEach(walk)
  }
  for (const e of entities) walk(e)
  return out
}

/** Whether a path (role stripped) is one of the computed ones. A pick segment matches any key. */
export const supplies = (computed: string[][], path: string) => {
  const segs = path.split('.')
  return computed.some((c) => c.length === segs.length && c.every((s, i) => s === '*' || s === segs[i] || segs[i] === '*' || segs[i].startsWith('{')))
}
