// Applying one patch body to an entity. A scalar replaces the field; $replace
// replaces it whole; $append, $prepend, and $remove edit a list; $add,
// $subtract, $multiply, $atLeast, and $atMost edit a number; $base gives one a starting value; $delete removes the field;
// $where edits the elements of a list, or the entries of a map, that match a pattern
// (`true`: every one); $at edits the map entry at a key; a plain object recurses
// into the field, or, on a list of keyed objects, into the elements it names by
// key. Patch files, optional rules' overrides, and the `change` effect all use
// this grammar. Returns a new entity; the input is not changed.

type Json = unknown
type O = Record<string, Json>

const plain = (v: Json): v is O => !!v && typeof v === 'object' && !Array.isArray(v)
const isOp = (v: Json, op: string): v is O => plain(v) && op in v

/** Whether a value matches a pattern, read as in `match`: a value equals the field
 *  or is in it when the field is a list; a list of values is any of them; an object
 *  matches field by field; {atLeast, atMost} compares a number; `true` is "is set". */
export function fitsPattern(value: Json, pattern: Json): boolean {
  if (Array.isArray(pattern)) return pattern.some((p) => fitsPattern(value, p))
  if (pattern === true) return value !== undefined && value !== false
  if (plain(pattern) && ('atLeast' in pattern || 'atMost' in pattern) && typeof value === 'number')
    return (pattern.atLeast === undefined || value >= (pattern.atLeast as number))
      && (pattern.atMost === undefined || value <= (pattern.atMost as number))
  if (plain(pattern)) return Array.isArray(value) ? value.some((v) => fitsPattern(v, pattern))
    : plain(value) && Object.entries(pattern).every(([k, p]) => fitsPattern(value[k], p))
  if (Array.isArray(value)) return value.some((v) => fitsPattern(v, pattern))
  return value === pattern
}

/** Adds two values: numbers add, time spans in the same unit add, anything else becomes a sum.
 *  {amount, upTo} adds without raising the number past `upTo`, or lowering one already above it. */
function add(current: Json, by: Json): Json {
  if (plain(by) && 'upTo' in by) {
    const sum = add(current, by.amount)
    if (typeof sum === 'number' && typeof current === 'number' && typeof by.upTo === 'number') return Math.max(current, Math.min(sum, by.upTo))
    return { min: [sum, { max: [current ?? 0, by.upTo] }] }
  }
  if (current === undefined) return by
  if (typeof current === 'number' && typeof by === 'number') return current + by
  if (plain(current) && plain(by) && 'unit' in by && current.unit === by.unit)
    return { ...current, amount: add(current.amount, by.amount) }
  return { sum: [current, by] }
}

function edit(current: Json, change: Json): Json {
  if (!plain(change)) return change
  if ('$where' in change) {
    const { $where: where, ...rest } = change
    const hit = (el: Json) => (where === true ? el !== undefined : plain(el) && fitsPattern(el, where))
    if (Array.isArray(current)) return current.map((el) => (hit(el) ? edit(el, rest) : el))
    return plain(current) ? Object.fromEntries(Object.entries(current).map(([k, el]) => [k, hit(el) ? edit(el, rest) : el])) : current
  }
  // A key that is a pick is known only in play.
  if ('$at' in change) {
    const { $at: at, ...rest } = change
    return typeof at === 'string' ? { ...(plain(current) ? current : {}), [at]: edit(plain(current) ? current[at] : undefined, rest) } : current
  }
  if ('$replace' in change) return change.$replace
  if ('$append' in change) return [...(Array.isArray(current) ? current : []), ...(change.$append as Json[])]
  if ('$prepend' in change) return [...(change.$prepend as Json[]), ...(Array.isArray(current) ? current : [])]
  if ('$remove' in change) return Array.isArray(current) ? current.filter((el) => !fitsPattern(el, change.$remove)) : current
  if ('$base' in change) return current === undefined ? change.$base : typeof current === 'number' && typeof change.$base === 'number' ? Math.max(current, change.$base) : current
  if ('$add' in change) return add(current, change.$add)
  if ('$subtract' in change) return typeof current === 'number' && typeof change.$subtract === 'number' ? current - change.$subtract : add(current, { times: change.$subtract, by: -1 })
  if ('$multiply' in change) return typeof current === 'number' ? current * (change.$multiply as number) : { times: current ?? 0, by: change.$multiply }
  if ('$atLeast' in change) return typeof current === 'number' && typeof change.$atLeast === 'number' ? Math.max(current, change.$atLeast) : current === undefined ? change.$atLeast : { max: [current, change.$atLeast] }
  if ('$atMost' in change) return typeof current === 'number' && typeof change.$atMost === 'number' ? Math.min(current, change.$atMost) : current === undefined ? change.$atMost : { min: [current, change.$atMost] }
  if (Array.isArray(current))
    return current.map((el) => {
      // An element is named by its `key`, or by its choice's key: {choose: {key}} takes the patch on the choice.
      const obj = plain(el) ? el : undefined
      const choice = obj && plain(obj.choose) ? obj.choose : undefined
      const k = choice ? choice.key : obj?.key
      const sub = typeof k === 'string' ? change[k] : undefined
      if (!plain(sub)) return el
      return choice ? { ...obj, choose: applyPatch(choice, sub) } : applyPatch(obj!, sub)
    })
  return applyPatch(plain(current) ? current : {}, change)
}

export function applyPatch(target: O, body: O): O {
  const out: O = { ...target }
  for (const [key, change] of Object.entries(body)) {
    if (isOp(change, '$delete')) delete out[key]
    else out[key] = edit(out[key], change)
  }
  return out
}

/** The places where a patch body reaches nothing on `target`: a `$where` or
 *  `$remove` no element matches, a keyed element the list doesn't have, or a
 *  `$delete` of a field that isn't there. Each is a path into the body. */
export function patchMisses(target: Json, body: O, path = ''): string[] {
  const out: string[] = []
  const at = plain(target) ? target : {}
  for (const [key, change] of Object.entries(body)) {
    const p = `${path}/${key}`
    if (isOp(change, '$delete')) { if (!(key in at)) out.push(p) }
    else out.push(...editMisses(at[key], change, p))
  }
  return out
}

function editMisses(current: Json, change: Json, path: string): string[] {
  if (!plain(change)) return []
  if ('$at' in change) return []
  if ('$where' in change) {
    const { $where: where, ...rest } = change
    if (where === true) return []
    const hits = Array.isArray(current) ? current.filter((el) => plain(el) && fitsPattern(el, where))
      : plain(current) ? Object.values(current).filter((el) => plain(el) && fitsPattern(el, where)) : []
    if (!hits.length) return [`${path}/$where`]
    // A miss counts only if the patch misses in every element it picked.
    const [first, ...others] = hits.map((el) => editMisses(el, rest, path))
    return first.filter((m) => others.every((o) => o.includes(m)))
  }
  if (['$replace', '$append', '$prepend', '$base'].some((op) => op in change)) return []
  // Arithmetic edits what's there: a named value the entity doesn't store is a miss.
  if (['$add', '$subtract', '$multiply', '$atLeast', '$atMost'].some((op) => op in change)) return current === undefined ? [path] : []
  if ('$remove' in change)
    return Array.isArray(current) && current.some((el) => fitsPattern(el, change.$remove)) ? [] : [`${path}/$remove`]
  if (Array.isArray(current))
    return Object.entries(change).flatMap(([k, sub]) => {
      const el = current.find((e) => plain(e) && (plain(e.choose) ? e.choose.key : e.key) === k) as O | undefined
      if (!el) return [`${path}/${k}`]
      return plain(sub) ? patchMisses(plain(el.choose) ? el.choose : el, sub, `${path}/${k}`) : [`${path}/${k}`]
    })
  return patchMisses(current, change, path)
}
