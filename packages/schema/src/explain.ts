// Explains why a value fails the schema, for people and agents writing data.
//
// A plain validator reports every union branch's failure, which buries the one
// that matters. This walks the value and schema together and, at each union,
// follows the branch the value is evidently trying to be: the effect whose
// `type` matches, the outcome or atom whose key is present, the object form
// for an object. Only that branch's problems are reported.

import Schema from 'typebox/schema'

type Node = Record<string, any>
export interface Problem { path: string; message: string }

export function explainer(defs: Record<string, Node>, $schema: string) {
  const leafCache = new Map<Node, { Check(v: unknown): boolean }>()
  const leafCheck = (schema: Node, value: unknown) => {
    let v = leafCache.get(schema)
    if (!v) { v = Schema.Compile({ $schema, $defs: defs, ...schema } as any); leafCache.set(schema, v) }
    return v.Check(value)
  }
  const resolve = (s: Node): Node => {
    while (s.$ref) s = defs[s.$ref.replace('#/$defs/', '')]
    return s
  }
  const isObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)
  const typeOf = (v: unknown) => (Array.isArray(v) ? 'array' : v === null ? 'null' : typeof v)

  /** A union's branches, with any branch that is itself only a union opened up: a field
   *  that also takes a choice is a union of its own forms and the choice. */
  const flatten = (branches: Node[]): Node[] => branches.flatMap((b) => {
    const r = resolve(b)
    const inner = r.anyOf ?? r.oneOf
    return inner && Object.keys(r).every((k) => k === 'anyOf' || k === 'oneOf' || k === 'description') ? flatten(inner) : [b]
  })

  /** The branch a value is trying to be, or undefined if none is plausible. */
  function pickBranch(branches: Node[], value: unknown): Node | undefined {
    const resolved = branches.map(resolve)
    const fits = resolved.filter((b) => leafCheck(b, value))
    if (fits.length) return fits[0]
    if (!isObject(value)) {
      const sameType = resolved.filter((b) => b.type === typeOf(value) || (b.enum && typeof value === 'string')
        || (b.const !== undefined && typeof b.const === typeof value) || (b.type === 'integer' && typeof value === 'number'))
      return sameType.length === 1 ? sameType[0] : undefined
    }
    const objects = resolved.filter((b) => b.type === 'object')
    if (typeof value.type === 'string') {
      const byType = objects.find((b) => b.properties?.type?.const === value.type)
      if (byType) return byType
    }
    // Score by how well the keys line up: required keys present, no unknown keys.
    let best: Node | undefined
    let bestScore = -Infinity
    for (const b of objects) {
      const props = Object.keys(b.properties ?? {})
      const required: string[] = b.required ?? []
      if (required.length && !required.some((k) => k in value)) continue
      const known = Object.keys(value).filter((k) => props.includes(k) || b.patternProperties).length
      const score = known * 2 - (Object.keys(value).length - known) * 3 + required.filter((k) => k in value).length
      if (score > bestScore) { bestScore = score; best = b }
    }
    return best
  }

  function walk(schema: Node, value: unknown, path: string, out: Problem[]) {
    const s = resolve(schema)
    if (leafCheck(s, value)) return
    const branches: Node[] | undefined = (s.anyOf ?? s.oneOf) && flatten(s.anyOf ?? s.oneOf)
    if (branches) {
      const types = branches.map(resolve).map((b) => b.properties?.type?.const).filter((t) => typeof t === 'string')
      if (types.length > 1 && isObject(value) && typeof value.type === 'string' && !types.includes(value.type)) {
        out.push({ path: `${path}/type`, message: `unknown type "${value.type}"; expected one of ${types.join(', ')}` })
        return
      }
      const branch = pickBranch(branches, value)
      if (branch) return walk(branch, value, path, out)
      const forms = branches.map(resolve).map((b) =>
        b.properties?.type?.const ? `type "${b.properties.type.const}"`
        : b.type === 'object' && b.required?.length ? `{${b.required[0]}}`
        : b.enum ? b.enum.map((e: unknown) => JSON.stringify(e)).join(' | ')
        : b.const !== undefined ? JSON.stringify(b.const) : b.pattern ? `a string matching ${b.pattern}` : b.type ?? '?')
      out.push({ path, message: `doesn't match any allowed form (${[...new Set(forms)].slice(0, 12).join(', ')}${forms.length > 12 ? ', …' : ''})` })
      return
    }
    if (s.type === 'object' && isObject(value)) {
      for (const k of s.required ?? []) if (!(k in value)) out.push({ path, message: `missing required field "${k}"` })
      for (const [k, v] of Object.entries(value)) {
        const child = s.properties?.[k]
          ?? Object.entries(s.patternProperties ?? {}).find(([p]) => new RegExp(p, 'u').test(k))?.[1]
        if (child) walk(child, v, `${path}/${k}`, out)
        else if (s.additionalProperties === false) out.push({ path: `${path}/${k}`, message: `unexpected field "${k}"` })
        else if (isObject(s.additionalProperties)) walk(s.additionalProperties, v, `${path}/${k}`, out)
      }
      const n = Object.keys(value).length
      if (s.minProperties && n < s.minProperties) out.push({ path, message: `needs at least ${s.minProperties} fields` })
      return
    }
    if (s.type === 'array' && Array.isArray(value)) {
      if (s.minItems && value.length < s.minItems) out.push({ path, message: `needs at least ${s.minItems} items` })
      if (s.prefixItems) s.prefixItems.forEach((p: Node, i: number) => walk(p, value[i], `${path}/${i}`, out))
      else if (s.items) value.forEach((v, i) => walk(s.items, v, `${path}/${i}`, out))
      return
    }
    out.push({ path, message: describeLeaf(s, value) })
  }

  function describeLeaf(s: Node, value: unknown): string {
    const got = JSON.stringify(value)
    if (s.const !== undefined) return `expected ${JSON.stringify(s.const)}, got ${got}`
    if (s.enum) return `expected one of ${s.enum.map((e: unknown) => JSON.stringify(e)).join(', ')}; got ${got}`
    if (s.pattern && typeof value === 'string') return `${got} doesn't match ${s.description ? `${s.description} (${s.pattern})` : s.pattern}`
    if (s.type && s.type !== typeOf(value) && !(s.type === 'integer' && typeof value === 'number'))
      return `expected ${s.type}, got ${typeOf(value)}`
    if (s.type === 'integer') return `expected a whole number, got ${got}`
    if (s.minimum !== undefined || s.maximum !== undefined) return `${got} is outside ${s.minimum ?? '…'}–${s.maximum ?? '…'}`
    return `invalid value ${got}`
  }

  return (schema: Node, value: unknown): Problem[] => {
    const out: Problem[] = []
    walk(schema, value, '', out)
    return out.length ? out : [{ path: '', message: 'invalid' }]
  }
}
