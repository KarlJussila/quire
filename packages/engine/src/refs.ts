// Finding the ids an entity refers to. Every string in a value position that
// is a well-formed id of a known kind is a reference, and so is every object
// key that is one (a creature's `abilities` map is keyed by ability ids).
// The entity's own id, its name and text, its gap markers, its source, and its
// `supersedes` list are not references.

import { EntityKinds } from '@quire/schema'

const KINDS = Object.keys(EntityKinds)
const ID = new RegExp(`^(${KINDS.join('|')}):[a-z0-9][a-z0-9/_+-]*(@[0-9]{4})?$`)
const SKIP_AT_ROOT = new Set(['id', 'name', 'text', 'gaps', 'source', 'supersedes'])

/** Kinds whose entities are vocabulary: a reference to a missing one is an error. */
const CONTENT = new Set(['class', 'subclass', 'feature', 'feat', 'species', 'background', 'spell', 'creature',
  'item', 'vehicle', 'standing', 'rule', 'deity', 'state', 'condition', 'table'])
export const vocabularyKinds = () => new Set(KINDS.filter((k) => !CONTENT.has(k)))

export const kindOf = (id: string) => id.slice(0, id.indexOf(':'))

/** The entity ids a reference can mean. A pinned reference names one version
 * (`@2014` names the untagged entity); an untagged one either edition. */
export const candidates = (ref: string): string[] =>
  ref.endsWith('@2014') ? [ref.slice(0, -5)] : /@[0-9]{4}$/.test(ref) ? [ref] : [ref, `${ref}@2024`]

// Lists of parts name exactly the entity they list: they build an entity rather
// than refer to something, so an untagged id there is the untagged entity. An
// entry is a part, as is a granted feat and a choice's option; a choice's
// filter, count, and chosen values are ordinary references.
const PARTS = /^\/(?:(?:levels\/\d+|features|firstClass|multiclass\/features)\/\d+(?:\/feat|\/choose\/from\/\d+)?|replaces(?:\/\d+)?)$/
export const isPart = (path: string) => PARTS.test(path)
export const isId = (s: string) => ID.test(s)

export interface Reference { ref: string; path: string }

export function references(entity: object): Reference[] {
  const out: Reference[] = []
  const walk = (node: unknown, path: string, root: boolean) => {
    if (typeof node === 'string') { if (ID.test(node)) out.push({ ref: node, path }); return }
    if (Array.isArray(node)) { node.forEach((v, i) => walk(v, `${path}/${i}`, false)); return }
    if (node && typeof node === 'object')
      for (const [k, v] of Object.entries(node)) {
        if (root && SKIP_AT_ROOT.has(k)) continue
        if (ID.test(k)) out.push({ ref: k, path: `${path}/${k}` })
        walk(v, `${path}/${k}`, false)
      }
  }
  walk(entity, '', true)
  return out
}

/** A copy of the entity with every reference passed through `map`. */
export function rewriteReferences(entity: object, map: (id: string) => string): object {
  const walk = (node: unknown, root: boolean): unknown => {
    if (typeof node === 'string') return ID.test(node) ? map(node) : node
    if (Array.isArray(node)) return node.map((v) => walk(v, false))
    if (node && typeof node === 'object')
      return Object.fromEntries(Object.entries(node).map(([k, v]) =>
        root && SKIP_AT_ROOT.has(k) ? [k, v] : [ID.test(k) ? map(k) : k, walk(v, false)]))
    return node
  }
  return walk(entity, true) as object
}
