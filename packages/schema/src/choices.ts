// A choice stands wherever an item or value goes (design/model/choices.md), so the schema
// doesn't declare one per field. Before an entity is validated, each {choose} is replaced by
// its options, and each {chosen: key} read of a choice in the same entity by that choice's
// options, so every option is checked in the field it stands in. The choice itself is
// checked against the one Choice declaration.

type J = any
const isObj = (x: J) => typeof x === 'object' && x !== null && !Array.isArray(x)
export const isChoose = (x: J) => isObj(x) && isObj(x.choose) && Object.keys(x).length === 1
const isRead = (x: J) => isObj(x) && typeof x.chosen === 'string' && Object.keys(x).length === 1
const isGroup = (x: J) => isObj(x) && typeof x.name === 'string' && Array.isArray(x.of) && Object.keys(x).length === 2

const isFilter = (x: J) => isObj(x) && typeof x.kind === 'string' && Object.keys(x).every((k) => k === 'kind' || k === 'where')
const isRange = (x: J) => isObj(x) && Object.keys(x).length > 0 && Object.keys(x).every((k) => k === 'atLeast' || k === 'atMost')

// What an option stands for in the field: a named group for its items, spliced into a list; a
// range ("a number from 1 to 5") for a number. A filter ("a martial weapon") stands for what
// the choice's other options are, or for one id of its kind when they're all filters.
function standIns(option: J, siblings: J[]): J[][] {
  if (isGroup(option)) return [option.of]
  if (isRange(option)) return [[1]]
  if (isFilter(option)) {
    const other = siblings.find((o) => !isFilter(o) && !isRange(o))
    return other === undefined ? [[`${option.kind}:x`]] : standIns(other, [])
  }
  return [[option]]
}

/** Every {choose} in a value, with its JSON pointer. */
export function choicesIn(value: J, path = ''): { path: string; node: J }[] {
  if (Array.isArray(value)) return value.flatMap((v, i) => choicesIn(v, `${path}/${i}`))
  if (!isObj(value)) return []
  const own = isChoose(value) ? [{ path, node: value }] : []
  return [...own, ...Object.entries(value).flatMap(([k, v]) => choicesIn(v, `${path}/${k}`))]
}

/** Copies of a value with no choices left, between them using every option of every choice.
 *  Each is one item, or several where a named group stands in a list. */
export function expand(value: J): J[] {
  if (!JSON.stringify(value).includes('"choose"')) return [value]
  // A read of a pick stands for one of its options. A read of several picks does too where
  // it sits in a list, and is left as written elsewhere, since it may stand for the list.
  const options = new Map<string, J[]>()
  const several = new Set<string>()
  for (const { node } of choicesIn(value)) {
    if (node.choose.count !== undefined && node.choose.count !== 1) several.add(node.choose.key)
    const list = options.get(node.choose.key) ?? []
    for (const o of node.choose.from) if (!isGroup(o)) list.push(...standIns(o, node.choose.from).flat())
    options.set(node.choose.key, list)
  }
  // The versions of one node; a choice's are lists of items, to splice into a list.
  const versions = (x: J, inList = false): J[][] => {
    if (isChoose(x)) return x.choose.from.flatMap((o: J) => standIns(o, x.choose.from).flatMap((items) => combine(items.map((i) => versions(i))).map((v) => v.flat())))
    if (isRead(x) && options.get(x.chosen)?.length && (inList || !several.has(x.chosen))) return options.get(x.chosen)!.flatMap((o) => versions(o))
    if (Array.isArray(x)) return combine(x.map((i) => versions(i, true))).map((v) => [v.flat()])
    if (isObj(x)) {
      const keys = Object.keys(x)
      // A named group in a field that holds one item stands for each of its items in turn.
      return combine(keys.map((k) => versions(x[k]).flat())).map((v) => [Object.fromEntries(keys.map((k, i) => [k, v[i]]))])
    }
    return [[x]]
  }
  // Takes the i-th version of each part, or its first when it has fewer, so every version of
  // every part shows up in some copy without multiplying them.
  function combine<T>(parts: T[][]): T[][] {
    const n = Math.max(1, ...parts.map((p) => p.length))
    return Array.from({ length: n }, (_, i) => parts.map((p) => p[i] ?? p[0]))
  }
  return versions(value).map((v) => (v.length === 1 ? v[0] : v))
}

/** `candidate` names what a filter or choice is considering, so it only means something
 *  inside a `where`. */
export function pronounProblems(value: J): { path: string; message: string }[] {
  const out: { path: string; message: string }[] = []
  const walk = (x: J, path: string, inWhere: boolean) => {
    if (x === 'candidate' && !inWhere) out.push({ path, message: '`candidate` is what a filter or choice considers, so it belongs inside a `where`' })
    if (Array.isArray(x)) x.forEach((v, i) => walk(v, `${path}/${i}`, inWhere))
    else if (isObj(x)) for (const [k, v] of Object.entries(x)) walk(v, `${path}/${k}`, inWhere || k === 'where')
  }
  walk(value, '', false)
  return out
}
