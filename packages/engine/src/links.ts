// Checks that what a rule reaches into another entity is there: a `change`
// whose `of` names an entity must patch something that entity has, a named
// value `{value, from}` must be one the entity stores in `values`, an
// activity named by key must exist, a read of a value off a picked entity
// `{chosen, value, from}` must be one every candidate stores, a `suppress` of a rule's or state's effects must
// name keys those effects carry, and a trigger's `match` must read fields
// its event declares, as must an `emits` entry's fields. Schema validation and reference
// resolution can't see these: the id exists, but the activity key or value
// name inside it doesn't.

import { patchMisses } from './patch.ts'

type O = Record<string, unknown>
const plain = (v: unknown): v is O => !!v && typeof v === 'object' && !Array.isArray(v)
const SKIP_AT_ROOT = new Set(['id', 'name', 'text', 'gaps', 'source', 'supersedes'])
const isId = (s: string) => s.includes(':')

/** The activities an entity defines: its `activities` lists, a stat block's
 *  `activity`, and the variants its changes add, keyed. */
export function activitiesOf(entity: unknown): O[] {
  const out: O[] = []
  const walk = (node: unknown) => {
    if (Array.isArray(node)) { node.forEach(walk); return }
    if (!plain(node)) return
    if (Array.isArray(node.activities)) out.push(...node.activities.filter((a): a is O => plain(a) && typeof a.key === 'string'))
    if (plain(node.activity) && typeof node.activity.key === 'string') out.push(node.activity)
    if (node.type === 'change' && typeof node.variant === 'string') out.push({ key: node.variant })
    Object.values(node).forEach(walk)
  }
  walk(entity)
  return out
}

/** Problems with what `entity`'s rules reach into. `version` gives the entity a
 *  reference means to this one: its own edition's, when that's loaded.
 *  `keys` holds every activity key defined anywhere. */
export function linkProblems(entity: O, version: (ref: string) => O | undefined, keys: Set<string>,
  members: (group: string) => O[] = () => []): { path: string; message: string }[] {
  const out: { path: string; message: string }[] = []
  const target = (ref: string) => (ref === 'this' ? entity : version(ref))
  const walk = (node: unknown, path: string, root: boolean) => {
    if (Array.isArray(node)) { node.forEach((v, i) => walk(v, `${path}/${i}`, false)); return }
    if (!plain(node)) return
    if (node.type === 'change' && plain(node.set)) {
      // `of` an entity, or an activity picked by its entity and key: {all: [{activity: id}, {match: {key}}]}.
      const where = plain(node.of) && node.of.kind === 'activity' && plain(node.of.where) ? node.of.where : undefined
      const parts = where ? (Array.isArray(where.all) ? where.all : [where]).filter(plain) : []
      const owner = parts.find((p) => typeof p.activity === 'string' && isId(p.activity))?.activity as string | undefined
      const key = parts.map((p) => plain(p.match) ? p.match.key : undefined).find((k) => typeof k === 'string') as string | undefined
      // An item made from a base takes the fields it doesn't set from that base, which may be a choice: Mithral Armor's.
      const fromBase = node.of === 'this' && entity.base !== undefined
      const t = fromBase ? undefined : typeof node.of === 'string' ? target(node.of) : owner && key ? target(owner) : undefined
      const reached = typeof node.of === 'string' ? t : t && activitiesOf(t).find((a) => a.key === key)
      if (t && !reached) out.push({ path: `${path}/of`, message: `${t.id} has no activity "${key}"` })
      if (reached) for (const m of patchMisses(reached, node.set as O)) out.push({ path: `${path}/set${m}`, message: `reaches nothing on ${t!.id}` })
    }
    // A change of the event in progress names fields the event its `when` tests carries
    if (node.type === 'change' && node.of === 'event' && plain(node.set) && plain(node.when)) {
      const tests = (Array.isArray(node.when.all) ? node.when.all : [node.when]).filter(plain)
      for (const ev of tests.flatMap((t: O) => ([] as unknown[]).concat(t.event ?? []))) {
        const e = typeof ev === 'string' ? version(ev) : undefined
        for (const f of Object.keys(node.set)) if (e && Array.isArray(e.payload) && !e.payload.includes(f))
          out.push({ path: `${path}/set/${f}`, message: `${e.id} carries no field "${f}"` })
      }
    }
    // A trigger's or event test's `match`, and an `emits` entry's `fields`, name fields its event declares in `payload`
    for (const k of ['match', 'fields'] as const)
      if (plain(node[k]) && (typeof node.event === 'string' || Array.isArray(node.event)))
        for (const ev of ([] as unknown[]).concat(node.event)) {
          const e = typeof ev === 'string' ? version(ev) : undefined
          const payload = e && Array.isArray(e.payload) ? e.payload : []
          for (const f of Object.keys(node[k] as O)) if (e && !payload.includes(f))
            out.push({ path: `${path}/${k}/${f}`, message: `${e.id} carries no field "${f}"` })
        }
    // A suppress of some of a rule's or state's effects names them by keys those effects carry
    if (node.type === 'suppress' && Array.isArray(node.effects)) {
      const rules = [...(Array.isArray(node.rule) ? node.rule : []), ...(Array.isArray(node.state) ? node.state : [])].map((r) => (typeof r === 'string' ? version(r) : undefined)).filter((r): r is O => !!r)
      const has = new Set(rules.flatMap((r) => (Array.isArray(r.effects) ? r.effects : []).filter(plain).map((e) => e.key)))
      for (const k of node.effects) if (rules.length && !has.has(k))
        out.push({ path: `${path}/effects`, message: `${rules.map((r) => r.id).join(', ')} has no effect with the key "${k}"` })
    }
    if (typeof node.activity === 'string' && !isId(node.activity) && !keys.has(node.activity))
      out.push({ path: `${path}/activity`, message: `no activity has the key "${node.activity}"` })
    if (typeof node.value === 'string' && Object.keys(node).every((k) => k === 'value' || k === 'from')) {
      const t = target(typeof node.from === 'string' ? node.from : 'this')
      if (t && !(plain(t.values) && node.value in t.values))
        out.push({ path, message: `${t.id} stores no value "${node.value}"` })
    }
    if (typeof node.chosen === 'string' && typeof node.value === 'string' && Object.keys(node).every((k) => ['chosen', 'value', 'from'].includes(k))) {
      const holder = target(typeof node.from === 'string' ? node.from : 'this')
      const choice = holder && choiceIn(holder, node.chosen)
      if (holder && !choice) out.push({ path, message: `${holder.id} has no choice "${node.chosen}"` })
      // A candidate without the value leaves the field out (a cone's breath has no width),
      // so the read is wrong only when no candidate stores it.
      const offered = choice ? candidatesOf(choice, version, members) : []
      if (offered.length && !offered.some((c) => plain(c.values) && (node.value as string) in c.values))
        out.push({ path, message: `no candidate for "${node.chosen}" stores a value "${node.value}"` })
    }
    // An `emits` entry's fields are Values and ids, not references to activities
    for (const [k, v] of Object.entries(node)) if (!(root && SKIP_AT_ROOT.has(k)) && !(k === 'fields' && 'at' in node)) walk(v, `${path}/${k}`, false)
  }
  walk(entity, '', true)
  return out
}

/** The choice with this key in an entity. */
function choiceIn(entity: O, key: string): O | undefined {
  let found: O | undefined
  const walk = (node: unknown) => {
    if (found) return
    if (Array.isArray(node)) { node.forEach(walk); return }
    if (!plain(node)) return
    if (plain(node.choose) && node.choose.key === key) { found = node.choose; return }
    Object.values(node).forEach(walk)
  }
  walk(entity)
  return found
}

/** The entities a choice offers: its ids, and the members of its groups and of filters on a group. */
function candidatesOf(choice: O, version: (ref: string) => O | undefined, members: (group: string) => O[]): O[] {
  return (choice.from as unknown[]).flatMap((o) => {
    if (typeof o === 'string') return o.startsWith('group:') ? members(o) : [version(o)].filter((e): e is O => !!e)
    if (plain(o) && typeof o.kind === 'string' && plain(o.where) && typeof o.where.group === 'string')
      return members(o.where.group).filter((e) => String(e.id).startsWith(`${o.kind}:`))
    return []
  })
}
