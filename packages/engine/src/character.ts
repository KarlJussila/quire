// Working out a character (design/model/character.md): from the saved file and the loaded
// content, which entities it has gained, and what each of its fields comes to once every
// `change` effect has applied.
//
// The engine knows no content. It counts class levels, finds what the character gained by
// following `features`, `levels`, and the picks, and applies whatever those entities and the
// loaded rules say. Whatever it can't evaluate yet is not guessed at: the effect is left out
// and listed in `unevaluated`, so the list shows what the engine has still to learn.

import { resolve, matches, type Catalog, type Entity } from './load.ts'
import { fitsPattern, applyPatch } from './patch.ts'

type O = Record<string, unknown>
const plain = (v: unknown): v is O => !!v && typeof v === 'object' && !Array.isArray(v)
const list = (v: unknown): unknown[] => (v === undefined ? [] : Array.isArray(v) ? v : [v])

/** What a choice was answered with (packages/schema/src/character.ts, Pick). */
type Picked = string | number | (string | number)[] | Record<string, number>
type Picks = Record<string, Record<string, Picked>>
interface Place { chosen?: Picks }

export interface Character extends O, Place {
  abilities: Record<string, number>
  species?: { species: string } & Place
  background?: { background: string } & Place
  firstClass?: string
  classes: Record<string, ({ hp: 'max' | number } & Place)[]>
  states?: ({ state: string; level?: number } & Place)[]
}

export interface Gained {
  id: string
  /** What gave it: the species, the class and level, the feature that offered it. */
  from: string
  entity: Entity
  picks: Record<string, Picked>
  /** For an item, and for a rule applied to one: the item as the character carries it, and the item itself (`this`). */
  carried?: O
  item?: Entity
  /** For a feature gained from a class's or subclass's levels: that class, whose level a class-level table reads. */
  class?: string
  /** While a rule is being worked out: the roll it is tested against, and the key a `$at` over a kind is at. */
  event?: O
  at?: string
  /** The entry of a map a `$where: true` change is at, by its path: its own fields read in braces. */
  entry?: string
}

export interface Note { id: string; message: string }

/** What a roll adds to its die, from every rule that applies to it. */
export interface Roll {
  /** The ability the roll uses: the one asked for, or a better one a rule lets stand in for it. */
  ability?: string
  /** The numbers added, in all. */
  total: number
  /** Each rule's part: a number, or dice ("1d4"). */
  parts: { id: string; amount: number | string }[]
  /** Rules that change this roll only under a condition of play the sheet can't know. */
  conditional: Note[]
}

/** An attack the character can make: what it adds to the d20, and the damage it deals. */
export interface Attack {
  /** The entity that gives the attack (a rule, for a weapon's), the activity's key, and the item it is made with. */
  id: string
  key: string
  item?: string
  name: string
  range: string
  /** The ability used: the best of those the attack may use. */
  ability?: string
  toHit: Roll
  damage: { amount: number | string; bonus: Roll; type: unknown }[]
}

export interface Defenses {
  resist: string[]
  immune: string[]
  vulnerable: string[]
  /** Defenses that hold only under a condition of play the sheet can't know. */
  conditional: Note[]
}

/** A spell the character has, and how: always prepared, picked to be prepared, known, or cast innately. */
export interface SpellHeld {
  spell: string
  how: string
  /** The entity that gives it. */
  from: string
  ability?: string
  /** False when it doesn't count against the number prepared or known. */
  counts?: boolean
}

export interface WorkedOut {
  /** Levels per class, under the class's id with and without its edition, and `total`. */
  levels: Record<string, number>
  gained: Gained[]
  /** A field with every effect applied, by its path: "modifiers.ability:int". */
  read(path: string): unknown
  /** What a roll adds to its die: `roll({roll: "roll:save", ability: "ability:wis"})`. The fields are the
   *  roll event's (`roll`, `ability`, `skill`), and every loaded rule that changes such a roll's total applies. */
  roll(fields: O): Roll
  /** Every attack the character's items, rules, and features give it. */
  attacks(): Attack[]
  /** Every activity the character has, each as its other rules change it. */
  activities(): { from: Gained; activity: O }[]
  /** Each carried item, with how it is carried and its own pools (charges). */
  items(): { id: string; name: string; carried: O; pools: Record<string, { max: unknown; spent: number; current: unknown }> }[]
  /** Every spell the character has from its `spell-access` effects, picked or given outright. */
  spells(): SpellHeld[]
  /** What the character resists, is immune to, and is vulnerable to: damage types and conditions by id, or "all". */
  defenses(): Defenses
  /** How the character sees: each `see` effect that applies, with its range worked out. Darkvision and the other
   *  named senses are here through their rules, beside a feature's own (Devil's Sight). */
  sight(): (O & { id: string })[]
  /** Rules that were left out because the engine can't evaluate part of them yet.
   *  A rule is listed once a read reaches it, so the list grows as fields are read. */
  unevaluated: Note[]
  /** Choices offered and not answered, and picks stored where nothing offers them. */
  picks: Note[]
}

/** Something the engine can't evaluate yet. Whatever needed it is left out and reported. */
class Unknown extends Error {}

interface Write {
  segs: string[]
  at?: string
  /** For a change to the entries of a map that match a pattern: the pattern. */
  where?: O
  op: '$base' | '$add' | '$multiply' | '$atLeast' | '$atMost' | '$replace'
  operand: unknown
  negate?: true
  holder: Gained
  /** For an activity's pool: the activity's own `when`, read only for which option of a pick it is. */
  option?: unknown
  when: unknown
}

const DICE = /^\d*d\d+([+-]\d+)?$/
const PATH = /^[a-z][A-Za-z]*(\.|$)/
const ROLES = ['this', 'target', 'source', 'subject', 'actor', 'candidate']
const untagged = (id: string) => id.replace(/@\d{4}$/, '')

export function workOut(catalog: Catalog, character: Character): WorkedOut {
  const unevaluated: Note[] = []
  const picks: Note[] = []
  const gained: Gained[] = []
  const skip = (id: string, message: string) => {
    if (!unevaluated.some((n) => n.id === id && n.message === message)) unevaluated.push({ id, message })
  }

  // Levels: counted from the stored classes before any rule runs, since they decide
  // which features the character has.
  const levels: Record<string, number> = { total: 0 }
  for (const [id, taken] of Object.entries(character.classes)) {
    levels[id] = levels[untagged(id)] = taken.length
    levels.total += taken.length
  }

  /** The groups an entity is in, each with the groups that one is a kind of: light armor is armor. */
  const groupsOf = (e: Entity): Set<string> => {
    const out = new Set<string>()
    const add = (g: unknown) => {
      if (typeof g !== 'string' || out.has(g)) return
      out.add(g)
      list(resolve(catalog, g)?.entity.isA).forEach(add)
    }
    list(e.group).forEach(add)
    return out
  }

  /** Whether an entity passes a filter's `where`, by its own stored fields and groups. */
  /** A pattern with each bound that is a value worked out for the holder: "of a level you have spell slots for". */
  const bounded = (pattern: unknown, holder: Gained | undefined): unknown => {
    if (!plain(pattern)) return pattern
    // A pick stands in for itself: "from the spell list you chose"
    const key = plain(pattern.choose) ? pattern.choose.key : typeof pattern.chosen === 'string' && Object.keys(pattern).length === 1 ? pattern.chosen : undefined
    if (typeof key === 'string' && holder) {
      if (holder.picks[key] === undefined) throw new Unknown(`the pick "${key}", which isn't answered`)
      return holder.picks[key]
    }
    return Object.fromEntries(Object.entries(pattern).map(([k, v]) => [k,
      (k === 'atLeast' || k === 'atMost') && typeof v !== 'number' && holder ? number(v, holder) : bounded(v, holder)]))
  }
  const candidateFits = (e: Entity, where: unknown, holder?: Gained): boolean => {
    if (!plain(where)) throw new Unknown(`the filter ${JSON.stringify(where)}`)
    if (Array.isArray(where.all)) return where.all.every((w) => candidateFits(e, w, holder))
    if (Array.isArray(where.any)) return where.any.some((w) => candidateFits(e, w, holder))
    if ('not' in where) return !candidateFits(e, where.not, holder)
    if ('group' in where && where.for === undefined) return list(where.group).some((g) => groupsOf(e).has(g as string))
    if (plain(where.match)) return fitsPattern(e, bounded(where.match, holder) as O)
    if ('is' in where && typeof where.is === 'string') return matches(where.is, e.id)
    // One of the picks of another choice: a Wizard prepares from the spells in the spellbook
    if (plain(where.is) && typeof where.is.chosen === 'string' && holder) {
      const from = holder.picks[where.is.chosen]
      return (plain(from) ? Object.keys(from) : list(from)).some((id) => typeof id === 'string' && (matches(id, e.id) || matches(e.id, id)))
    }
    // Held in a pool of something carried: a spell in the spellbook
    if (typeof where.stored === 'string') {
      const key = where.stored
      return ((character.inventory as O[] | undefined) ?? []).some((c) => list(plain(c.holds) ? c.holds[key] : undefined)
        .some((h) => { const id = plain(h) ? h.id : h; return typeof id === 'string' && (matches(id, e.id) || matches(e.id, id)) }))
    }
    // A test of the character about the candidate: "a skill you are proficient in", "a spell you have".
    for (const k of ['proficient', 'has'])
      if (where[k] === 'candidate' && holder) return test({ ...where, [k]: e.id }, holder)
    // A test of the character and not of the candidate: "a form with a Fly Speed, from level 8".
    if ('compare' in where && holder) return test(where, holder)
    throw new Unknown(`a filter by {${Object.keys(where).join(', ')}}`)
  }

  // What the character has gained -------------------------------------------------------

  /** Every choice the character was offered, checked once everything is gained: answered, with the right number of picks, each one an option. */
  const asked: { g: Gained; choose: O; when?: unknown }[] = []
  const used = new Map<Place, Set<string>>()
  const picksFor = (place: Place, id: string): Record<string, Picked> => {
    const key = Object.keys(place.chosen ?? {}).find((k) => k === id || matches(k, id) || matches(id, k))
    if (key === undefined) return {}
    used.set(place, (used.get(place) ?? new Set()).add(key))
    return place.chosen![key]
  }

  const gain = (ref: string, place: Place, from: string, preset: Record<string, Picked> = {}, cls?: string) => {
    const entity = resolve(catalog, ref)?.entity
    if (!entity) { skip(ref, `isn't in the loaded bundles (from ${from})`); return }
    const mine: Gained = { id: entity.id, from, entity, picks: { ...preset, ...picksFor(place, entity.id) }, ...cls && { class: cls } }
    gained.push(mine)
    // A subspecies has everything its parent has, less the parent's features it replaces.
    if (entity.id.startsWith('species:') && typeof entity.parent === 'string') {
      const before = gained.length
      gain(entity.parent, place, entity.id)
      const replaced = list(entity.replaces) as string[]
      for (let i = gained.length - 1; i >= before; i--) if (replaced.some((r) => matches(r, gained[i].id))) gained.splice(i, 1)
    }
    // A subclass gives its features by the level of its class, each with the picks made at that level.
    if (entity.id.startsWith('subclass:') && typeof entity.class === 'string') {
      const taken = Object.entries(character.classes).find(([c]) => matches(entity.class as string, c))?.[1] ?? []
      taken.forEach((level, i) => {
        for (const f of list((entity.levels as O | undefined)?.[String(i + 1)])) gain(f as string, level, `${entity.id} level ${i + 1}`, {}, entity.class as string)
      })
    }
    for (const part of list(entity.features)) {
      if (typeof part === 'string') gain(part, place, entity.id, {}, cls)
      else if (plain(part) && typeof part.feat === 'string') gain(part.feat, place, entity.id, (part.chosen ?? {}) as Record<string, Picked>, cls)
      else if (plain(part) && plain(part.choose)) {
        const answer = mine.picks[part.choose.key as string]
        asked.push({ g: mine, choose: part.choose })
        for (const picked of plain(answer) ? Object.keys(answer) : list(answer))
          if (typeof picked === 'string' && picked.includes(':')) gain(picked, place, entity.id, {}, cls)
      } else skip(entity.id, `a part of \`features\` the engine doesn't read yet: ${JSON.stringify(part).slice(0, 80)}`)
    }
  }

  if (character.species) gain(character.species.species, character.species, 'species')
  if (character.background) gain(character.background.background, character.background, 'background')
  for (const [id, taken] of Object.entries(character.classes)) {
    const cls = resolve(catalog, id)?.entity
    if (!cls) { skip(id, "isn't in the loaded bundles"); continue }
    gained.push({ id: cls.id, from: 'classes', entity: cls, picks: {} })
    if (character.firstClass && matches(character.firstClass, cls.id))
      for (const f of list(cls.firstClass)) gain(f as string, taken[0], `${cls.id} as the first class`, {}, cls.id)
    // A class taken after the first gives what its multiclass entry lists instead of its starting proficiencies.
    else if (character.firstClass)
      for (const f of list((cls.multiclass as O | undefined)?.features)) gain(f as string, taken[0], `${cls.id} as a later class`, {}, cls.id)
    taken.forEach((level, i) => {
      for (const f of list((cls.levels as O | undefined)?.[String(i + 1)])) gain(f as string, level, `${cls.id} level ${i + 1}`, {}, cls.id)
    })
  }
  for (const s of character.states ?? []) gain(s.state, s, 'states')

  // Items: each with its base item's fields, groups, and rules under its own (a magic armor's armor).
  // What is inside a container isn't applied.
  /** A magic item made from a base item is also that item: a +1 longsword is a longsword. */
  const kinds = new Map<string, string[]>()
  const itemOf = (ref: string, chosen: Record<string, Picked>): Entity | undefined => {
    const entity = resolve(catalog, ref)?.entity
    if (!entity) return undefined
    const b = entity.base
    const baseRef = typeof b === 'string' ? b : plain(b) && typeof b.item === 'string' ? b.item : plain(b) && plain(b.choose) ? chosen[b.choose.key as string] : undefined
    const base = typeof baseRef === 'string' ? itemOf(baseRef, chosen) : undefined
    if (!base) return entity
    kinds.set(entity.id, [entity.id, ...(kinds.get(base.id) ?? [base.id])])
    return { ...base, ...entity, group: [...list(base.group), ...list(entity.group)],
      effects: [...list(base.effects), ...list(entity.effects)], activities: [...list(base.activities), ...list(entity.activities)] }
  }
  const inventory = ((character.inventory as (O & Place)[] | undefined) ?? [])
  for (const carried of inventory) {
    const mine = picksFor(carried, carried.item as string)
    const item = itemOf(carried.item as string, mine)
    if (!item) { skip(carried.item as string, "isn't in the loaded bundles (from inventory)"); continue }
    gained.push({ id: item.id, from: 'inventory', entity: item, picks: mine, carried, item })
  }
  // A weapon one of the character's own activities creates is on the sheet as one carried: a Warlock's pact weapon.
  for (const g of [...gained]) {
    if (g.from === 'inventory') continue
    for (const a of list(g.entity.activities))
      for (const o of list(plain(a) ? a.outcomes : undefined)) {
        const ref = plain(o) && plain(o.create) ? o.create.item : undefined
        const item = typeof ref === 'string' ? itemOf(ref, {}) : undefined
        if (item?.weapon === undefined || gained.some((x) => x.from === 'inventory' && x.id === item.id)) continue
        gained.push({ id: item.id, from: 'inventory', entity: item, picks: {}, carried: { item: item.id } as O & Place, item })
      }
  }

  // Rules: every loaded rule that isn't optional, or that the character has turned on. A rule
  // belongs to the editions of the bundles that ship it, so it applies when one of them has
  // the edition in use, or when none has an edition (the shared rules, and most homebrew).
  const on = Object.keys((character.rules as O | undefined) ?? {})
  for (const { entity, bundles } of catalog.entries.values()) {
    if (!entity.id.startsWith('rule:')) continue
    if (entity.optional && !on.some((r) => matches(r, entity.id))) continue
    const editions = bundles.map((b) => catalog.bundles.get(b)?.manifest.edition).filter((e) => e !== undefined)
    if (editions.length && !editions.includes(catalog.prefer)) continue
    // A rule for objects applies to each item its `where` picks, written as that item's own rules are.
    const to = entity.appliesTo as O | undefined
    if (to?.pool === 'object') {
      for (const g of gained.filter((g) => g.from === 'inventory'))
        if (to.where === undefined || candidateFits(g.entity, to.where)) gained.push({ id: entity.id, from: `rules, for ${g.id}`, entity, picks: {}, carried: g.carried, item: g.item })
      continue
    }
    gained.push({ id: entity.id, from: 'rules', entity, picks: picksFor(character, entity.id) })
  }

  for (const place of [character as Place, character.species, character.background, ...Object.values(character.classes).flat(), ...(character.states ?? []), ...inventory])
    for (const key of Object.keys(place?.chosen ?? {}))
      if (!used.get(place!)?.has(key)) picks.push({ id: key, message: 'has picks stored where the character never gained it' })

  /** An entity's effects. Where it offers a choice among sets of effects, the sets that were picked. */
  const sorted = new Map<Gained, O[]>()
  const effectsOf = (g: Gained): O[] => {
    const known = sorted.get(g)
    if (known) return known
    const out: O[] = []
    const add = (effects: unknown) => {
      for (const e of list(effects)) {
        if (!plain(e)) continue
        // A zone around the character that takes it in gives it the zone's effects, with itself as their source.
        if (e.type === 'zone' && e.to === undefined && plain(e.zone) && e.zone.anchor === 'self' && plain(e.zone.affects) && e.zone.affects.includeSelf === true) {
          for (const inner of list(e.zone.effects)) {
            if (!plain(inner)) continue
            const own = JSON.parse(JSON.stringify(inner).replaceAll('"source.', '"self.')) as O
            const whens = [e.when, own.when].filter((w) => w !== undefined)
            add([{ ...own, ...whens.length && { when: whens.length === 1 ? whens[0] : { all: whens } } }])
          }
        }
        if (e.type !== undefined || !plain(e.choose)) { out.push(e); continue }
        const answer = g.picks[e.choose.key as string]
        asked.push({ g, choose: e.choose })
        if (answer === undefined) continue
        for (const option of list(e.choose.from)) if (plain(option) && list(answer).includes(option.name as string)) add(option.of)
      }
    }
    add(g.entity.effects)
    sorted.set(g, out)
    return out
  }

  // A change to items is applied to each carried item it fits, for this character only: Medium Armor
  // Master's armor loses its Stealth disadvantage. One with a `when` is left out, since nothing is worked out yet.
  for (const h of [...gained])
    for (const effect of list(h.entity.effects)) {
      if (!plain(effect) || effect.type !== 'change' || effect.to !== undefined || !plain(effect.of) || effect.of.kind !== 'item') continue
      if (effect.when !== undefined) { skip(h.id, 'its change to items has a `when`'); continue }
      for (const g of gained) {
        if (g.from !== 'inventory' || !g.item) continue
        try {
          if (effect.of.where !== undefined && !candidateFits(g.item, effect.of.where, h)) continue
          g.item = g.entity = applyPatch(g.item, effect.set as O) as Entity
        } catch (e) {
          if (!(e instanceof Unknown)) throw e
          skip(h.id, `its change to items needs ${e.message}`)
        }
      }
    }

  // The changes those entities make to the character's own fields ------------------------

  const writes: Write[] = []
  /** What a pick names as a key, once for each time it was picked. */
  /** The loaded entities of a kind, one version of each: the edition in use where both are loaded. */
  const ofKind = (kind: string): Entity[] => [...catalog.entries.values()].map((e) => e.entity)
    .filter((e) => e.id.startsWith(`${kind}:`) && resolve(catalog, untagged(e.id))?.entity === e)
  const keysOf = (at: unknown, holder: Gained): string[] | undefined => {
    if (typeof at === 'string') return [at]
    // A filter: every entity of the kind, as "each ability"
    if (plain(at) && typeof at.kind === 'string') {
      const picked = ofKind(at.kind).filter((e) => at.where === undefined || candidateFits(e, at.where))
      return picked.map((e) => untagged(e.id))
    }
    const key = plain(at) ? (plain(at.choose) ? at.choose.key : at.chosen) : undefined
    // `from` is the entity the choice is on, where it isn't this one; `value` reads a named value off each pick:
    // the damage type of the Draconic Ancestry chosen.
    const chooser = plain(at) && typeof at.from === 'string' ? gained.find((g) => matches(at.from as string, g.id)) : holder
    const answer = typeof key === 'string' ? chooser?.picks[key] : undefined
    if (answer === undefined) return undefined
    const ids = plain(answer) ? Object.entries(answer).flatMap(([k, n]) => Array<string>(n).fill(k)) : list(answer).map(String)
    if (plain(at) && typeof at.value === 'string') {
      const name = at.value
      return ids.flatMap((id) => { const v = (resolve(catalog, id)?.entity.values as O | undefined)?.[name]; return typeof v === 'string' ? [untagged(v)] : [] })
    }
    return ids.map(untagged)
  }
  const flatten = (set: unknown, segs: string[], holder: Gained, when: unknown, outer: { at?: string; where?: O } = {}) => {
    if (!plain(set)) { writes.push({ segs, op: '$replace', operand: set, holder, when, ...outer }); return }
    let heres = [segs]
    const where = plain(set.$where) ? { where: set.$where } : {}
    if ('$where' in set) heres = [[...segs, '*']]
    if ('$at' in set) {
      const keys = keysOf(set.$at, holder)
      if (plain(set.$at) && plain(set.$at.choose)) asked.push({ g: holder, choose: set.$at.choose })
      if (!keys) return
      heres = keys.map((k) => [...segs, k])
    }
    const at = '$at' in set && plain(set.$at) && typeof set.$at.kind === 'string'
    for (const here of heres)
      for (const [k, v] of Object.entries(set)) {
        if (k === '$where' || k === '$at') continue
        const key = { ...outer, ...(at ? { at: here[here.length - 1] } : {}), ...where }
        if (k === '$subtract') writes.push({ segs: here, op: '$add', operand: v, negate: true, holder, when, ...key })
        else if (k === '$base' || k === '$add' || k === '$multiply' || k === '$atLeast' || k === '$atMost' || k === '$replace')
          writes.push({ segs: here, op: k, operand: v, holder, when, ...key })
        else if (k.startsWith('$')) skip(holder.id, `the operator ${k} on \`${here.join('.')}\``)
        else flatten(v, [...here, k], holder, when, key)
      }
  }
  for (const holder of gained)
    for (const effect of effectsOf(holder)) {
      if (!plain(effect) || effect.to !== undefined) continue
      if (effect.type === 'change' && effect.of === undefined) flatten(effect.set, [], holder, effect.when)
      // A pool: its maximum and whatever else it declares, under `pools` by its key. What is left of it is worked out
      // from what the saved character has spent. An item's own pools (its charges) aren't worked out yet.
      if (effect.type === 'resource' && typeof effect.key === 'string' && holder.from !== 'inventory') {
        const at = ['pools', effect.key]
        writes.push({ segs: [...at, 'max'], op: '$base', operand: effect.max ?? 'unlimited', holder, when: effect.when })
        for (const f of ['die', 'dc']) if (effect[f] !== undefined) writes.push({ segs: [...at, f], op: '$base', operand: effect[f], holder, when: effect.when })
        for (const [k, v] of Object.entries((effect.values as O | undefined) ?? {})) writes.push({ segs: [...at, 'values', k], op: '$base', operand: v, holder, when: effect.when })
      }
      // A speed or a sense an effect gives is a starting value for that field: the best one applies.
      if (effect.type === 'speed' && typeof effect.mode === 'string')
        writes.push({ segs: ['speeds', effect.mode, 'speed'], op: '$base', operand: effect.speed, holder, when: effect.when })
      if (effect.type === 'sense' && typeof effect.sense === 'string')
        writes.push({ segs: ['senses', effect.sense, 'range'], op: '$base', operand: effect.range, holder, when: effect.when })
      // A spell given with its own uses has a pool named after the spell, as an activity's uses are named after
      // its key. Two sources of the same free spell add up.
      if (effect.type === 'spell-access' && plain(effect.uses) && effect.uses.max !== undefined)
        for (const entry of list(effect.spells)) {
          let ids: string[] | undefined
          try { ids = keysOf(entry, holder) } catch (e) { if (!(e instanceof Unknown)) throw e }
          for (const id of ids ?? []) if (id.startsWith('spell:'))
            writes.push({ segs: ['pools', id.slice('spell:'.length), 'max'], op: '$add', operand: effect.uses.max, holder, when: effect.when })
        }
      // Proficiency is a number under `proficiencies`, by what it is in: how many times the proficiency
      // bonus counts (half, once, or twice for expertise). The highest applies.
      if (effect.type === 'proficiency') {
        const times = ({ proficient: 1, expertise: 2, half: 0.5 } as Record<string, number>)[(effect.level as string | undefined) ?? 'proficient']
        if (times === undefined) { skip(holder.id, `a proficiency at the level "${effect.level}"`); continue }
        for (const entry of list(effect.in)) {
          let keys: string[] | undefined
          try { keys = keysOf(entry, holder) } catch (e) { if (!(e instanceof Unknown)) throw e; skip(holder.id, `its proficiency needs ${e.message}`); continue }
          if (plain(entry) && plain(entry.choose)) asked.push({ g: holder, choose: entry.choose, when: effect.when })
          if (!keys) continue
          for (const k of keys) writes.push({ segs: ['proficiencies', untagged(k)], op: '$atLeast', operand: times, holder, when: effect.when })
        }
      }
    }

  // An activity with its own uses is a pool by the activity's key.
  for (const holder of gained)
    if (holder.from !== 'inventory')
      for (const a of list(holder.entity.activities))
        if (plain(a) && typeof a.key === 'string' && plain(a.uses))
          writes.push({ segs: ['pools', a.key, 'max'], op: '$base', operand: a.uses.max, holder, when: undefined, option: a.when })

  // Each class level gives a Hit Die of the class's size, and each size is its own pool: a fighter 3 / wizard 2 has
  // 3d10 and 2d6.
  for (const holder of gained) {
    if (holder.from !== 'classes') continue
    const sides = typeof holder.entity.hitDie === 'string' ? resolve(catalog, holder.entity.hitDie)?.entity.sides : undefined
    const levels = Object.entries(character.classes).find(([c]) => matches(c, holder.id) || matches(holder.id, c))?.[1].length
    if (typeof sides !== 'number' || !levels) continue
    writes.push({ segs: ['pools', `hit-dice-d${sides}`, 'max'], op: '$add', operand: levels, holder, when: undefined })
    writes.push({ segs: ['pools', `hit-dice-d${sides}`, 'die'], op: '$base', operand: `d${sides}`, holder, when: undefined })
  }

  // Reading a field -----------------------------------------------------------------------

  // A field nothing else stores is read from the species, and then from the species it is a kind of.
  const lineage: Entity[] = []
  for (let at = character.species?.species as unknown; typeof at === 'string' && lineage.length < 4; at = lineage[lineage.length - 1]?.parent) {
    const e = resolve(catalog, at)?.entity
    if (!e) break
    lineage.push(e)
  }
  const stored = (segs: string[]): unknown => {
    for (const from of [character, ...lineage]) {
      let at: unknown = from
      for (const s of segs) at = plain(at) ? at[s] : Array.isArray(at) ? at[Number(s)] : undefined
      // A species with several sizes offers a choice of one, answered under the species as `size`.
      if (segs.length === 1 && segs[0] === 'size' && Array.isArray(at)) {
        const g = gained.find((x) => x.entity === from)
        if (g && !asked.some((q) => q.g === g && q.choose.key === 'size')) asked.push({ g, choose: { key: 'size', name: 'Size', from: at } })
        const pick = g?.picks.size
        if (typeof pick === 'string' && at.some((x) => typeof x === 'string' && matches(x, pick))) return pick
      }
      if (at !== undefined) return at
    }
    return undefined
  }

  const memo = new Map<string, unknown>()
  const reading = new Set<string>()

  const number = (v: unknown, holder: Gained): number => {
    const n = value(v, holder)
    if (n === undefined && typeof v === 'string') return 0 // a path that reads nothing counts as 0, as a missing field does for `$add`
    if (typeof n !== 'number') throw new Unknown(`a number from ${JSON.stringify(v).slice(0, 60)}`)
    return n
  }

  /** The paths a path with `*` segments stands for: one for every entry there is. */
  const expand = (path: string): string[] => {
    const segs = path.split('.')
    const star = segs.indexOf('*')
    if (star < 0) return [path]
    const at = read(segs.slice(0, star).join('.'))
    const keys = Array.isArray(at) ? at.map((_, i) => String(i)) : plain(at) ? Object.keys(at) : []
    return keys.flatMap((k) => expand([...segs.slice(0, star), k, ...segs.slice(star + 1)].join('.')))
  }
  /** The numbers a `sum`, `max`, or `min` works on: its list, or its one value worked out for every entry its `*` path reads. */
  const each = (arg: unknown, holder: Gained): number[] => {
    if (Array.isArray(arg)) return arg.map((x) => number(x, holder))
    const text = JSON.stringify(arg)
    const star = /"([^"]*\.\*[^"]*)"/.exec(text)?.[1]
    if (!star) return [number(arg, holder)]
    return expand(star).map((p) => number(JSON.parse(text.replaceAll(JSON.stringify(star), JSON.stringify(p))), holder))
  }

  /** The pools an item has of its own, by key: the most each holds, what this carried item has spent, and what is left. */
  const itemPools = (g: Gained): Record<string, { max: unknown; spent: number; current: unknown }> => {
    const out: Record<string, { max: unknown; spent: number; current: unknown }> = {}
    for (const effect of list(g.item?.effects)) {
      if (!plain(effect) || effect.type !== 'resource' || typeof effect.key !== 'string') continue
      const max = effect.max === undefined ? 'unlimited' : value(effect.max, g)
      const spent = (g.carried?.spent as Record<string, number> | undefined)?.[effect.key] ?? 0
      out[effect.key] = { max, spent, current: typeof max === 'number' ? Math.max(0, max - spent) : max }
    }
    return out
  }

  function value(v: unknown, holder: Gained): unknown {
    if (typeof v === 'number' || typeof v === 'boolean') return v
    if (typeof v === 'string' && v.startsWith('this.')) {
      // An item's own pool: its charges, and what is left of them after what the carried item has spent.
      const pool = /^this\.pools\.([^.]+)\.(max|current|spent)$/.exec(v)
      if (pool && holder.item) {
        const of = itemPools(holder)[pool[1]]
        if (!of) throw new Unknown(`\`${v}\`, a pool ${holder.item.id} doesn't have`)
        return of[pool[2] as 'max' | 'current' | 'spent']
      }
      // A field of the entity the rule is on (for a rule applied to an item, the item). One that holds a value is worked out.
      let at: unknown = holder.item ?? holder.entity
      for (const s of v.split('.').slice(1)) at = plain(at) ? at[s] : undefined
      if (at === undefined) throw new Unknown(`\`${v}\`, which ${(holder.item ?? holder.entity).id} doesn't have`)
      return typeof at === 'number' ? at : value(at, holder)
    }
    if (typeof v === 'string' && v.includes('{')) {
      // A segment in braces is a pick, a field of the roll being tested, or the key a `$at` is at
      let missing = false
      const path = v.replace(/\{([a-z0-9.-]+)\}/g, (_m, name: string) => {
        const field = name.split('.').reduce<unknown>((at, s) => (plain(at) ? at[s] : undefined), holder.event)
        const key = holder.picks[name] ?? field ?? (name === 'at' ? holder.at : undefined)
          ?? (holder.entry !== undefined ? read(`${holder.entry}.${name}`) : undefined)
        if (typeof key !== 'string') { missing = true; return '' }
        return untagged(key)
      })
      return missing ? undefined : read(path)
    }
    if (typeof v === 'string') return DICE.test(v) || v === 'unlimited' || !PATH.test(v) ? v : read(v)
    if (!plain(v)) throw new Unknown(`the value ${JSON.stringify(v)}`)
    if (typeof v.kind === 'string') return v // a filter, kept as written: the spells a class prepares from
    if ('sum' in v && Array.isArray(v.sum)) {
      // Dice stay dice, with the numbers added up after them: "1d6+3"
      const parts = v.sum.map((x) => value(x, holder) ?? 0)
      const n = parts.filter((x) => typeof x === 'number').reduce<number>((a, x) => a + x, 0)
      const dice = parts.filter((x) => typeof x === 'string' && DICE.test(x))
      if (dice.length + parts.filter((x) => typeof x === 'number').length !== parts.length) throw new Unknown(`a sum of ${JSON.stringify(v.sum).slice(0, 60)}`)
      return dice.length ? dice.join('+') + (n ? (n > 0 ? '+' : '') + n : '') : n
    }
    if ('sum' in v) return each(v.sum, holder).reduce<number>((a, x) => a + x, 0)
    if (plain(v.dice)) {
      const die = value(v.dice.die, holder)
      const plus = v.dice.plus === undefined ? 0 : number(v.dice.plus, holder)
      return `${number(v.dice.count, holder)}d${String(die).replace(/^d/, '')}${plus ? (plus > 0 ? '+' : '') + plus : ''}`
    }
    if ('max' in v) return Math.max(...each(v.max, holder))
    if ('min' in v) return Math.min(...each(v.min, holder))
    if ('times' in v) return number(v.times, holder) * number(v.by, holder)
    if ('divide' in v) {
      const q = number(v.divide, holder) / (v.by as number)
      return v.round === 'up' ? Math.ceil(q) : Math.floor(q)
    }
    if ('byLevel' in v) {
      const level = typeof v.of === 'string' ? levels[untagged(v.of)] ?? 0 : levels.total
      const step = Object.keys(v.byLevel as O).map(Number).filter((l) => l <= level).sort((a, b) => b - a)[0]
      if (step === undefined) throw new Unknown(`a value by level, below its first level`)
      return value((v.byLevel as O)[String(step)], holder)
    }
    if ('if' in v) return value(test(v.if, holder) ? v.then : v.else, holder)
    // How many carried things a filter picks: the weapons held, the items attuned.
    if (plain(v.count) && v.count.pool === 'object') {
      const fits = (g: Gained, w: unknown): boolean => {
        if (w === undefined) return true
        if (!plain(w)) throw new Unknown(`the filter ${JSON.stringify(w)}`)
        if (Array.isArray(w.all)) return w.all.every((x) => fits(g, x))
        if (Array.isArray(w.any)) return w.any.some((x) => fits(g, x))
        if ('not' in w) return !fits(g, w.not)
        // "one you hold": the fields the saved character keeps on it
        if (w.creature === 'self' && plain(w.where) && w.where.has === 'candidate') return w.where.match === undefined || fitsPattern(g.carried, w.where.match)
        return candidateFits(g.item!, w, holder)
      }
      return gained.filter((g) => g.from === 'inventory' && g.item && fits(g, (v.count as O).where)).length
    }
    if (plain(v.bonus)) {
      // What the rules add to a roll with these fields. A skill with no ability named uses its own.
      const fields: O = Object.fromEntries(Object.entries(v.bonus).map(([k, x]) => {
        const name = typeof x === 'string' ? /^\{([a-z0-9-]+)\}$/.exec(x)?.[1] : undefined
        return [k, name === undefined ? x : holder.picks[name] ?? holder.event?.[name] ?? (name === 'at' ? holder.at : undefined)]
      }))
      if (fields.ability === undefined && typeof fields.skill === 'string') fields.ability = resolve(catalog, fields.skill)?.entity.ability
      return roll(fields).total
    }
    if (typeof v.table === 'string') {
      // A table's column at a level: the level `by` gives, or the level in the class the rule came from.
      const id = v.table.startsWith('table:') ? v.table : value(v.table, holder)
      const table = typeof id === 'string' ? resolve(catalog, id)?.entity : undefined
      if (!table) throw new Unknown(`the table ${v.table}, which isn't loaded`)
      const level = v.by !== undefined ? number(v.by, holder) : table.axis === 'character-level' ? levels.total
        : holder.class ? levels[untagged(holder.class)] ?? 0 : undefined
      if (level === undefined) throw new Unknown(`the level ${v.table} is read at`)
      const row = (table.rows as { level: number; cells: O }[]).filter((r) => r.level <= level).sort((a, b) => b.level - a.level)[0]
      // Below a table's first row, or in a column a row leaves out, there is nothing: no slots of that level yet.
      return row?.cells[(v.column as string | undefined) ?? Object.keys(row.cells)[0]] ?? 0
    }
    if ('chosen' in v && v.value === undefined && v.from === undefined) {
      const answer = holder.picks[v.chosen as string]
      if (answer === undefined) throw new Unknown(`the pick "${v.chosen}", which isn't answered`)
      return answer
    }
    throw new Unknown(`the value {${Object.keys(v).join(', ')}}`)
  }

  /** A test of the character. An `any` or `all` is settled by the parts that can be evaluated when they decide it. */
  /** A field as a test on an entity's own effect sees it: without that entity's changes to the field, so
   *  "if you already have this proficiency" doesn't count the proficiency the entity itself gives. */
  const without = (path: string, holder: Gained): unknown =>
    writes.some((w) => w.holder === holder && w.segs.join('.') === path) ? read(path, holder) : read(path)
  function test(p: unknown, holder: Gained): boolean {
    if (!plain(p)) throw new Unknown(`the test ${JSON.stringify(p)}`)
    if ('all' in p || 'any' in p) {
      const all = 'all' in p
      let unknown: Unknown | undefined
      for (const part of list(all ? p.all : p.any)) {
        try { if (test(part, holder) !== all) return !all } catch (e) { if (!(e instanceof Unknown)) throw e; unknown = e }
      }
      if (unknown) throw unknown
      return all
    }
    if ('not' in p) return !test(p.not, holder)
    if ('compare' in p) {
      if (p.equals !== undefined) return value(p.compare, holder) === p.equals
      const own = typeof p.compare === 'string' && PATH.test(p.compare) && !p.compare.includes('{') ? without(p.compare, holder) : undefined
      const n = typeof own === 'number' ? own : number(p.compare, holder)
      return (p.atLeast === undefined || n >= number(p.atLeast, holder)) && (p.atMost === undefined || n <= number(p.atMost, holder))
    }
    if ('has' in p && (p.chosen === undefined || plain(p.chosen)) && p.source === undefined) {
      const refs = list(p.has)
      if (refs.some((r) => typeof r !== 'string')) throw new Unknown('a test for something picked by a filter')
      // `chosen` narrows to one whose pick is this: a Hunter who chose Colossus Slayer. An unanswered pick is no pick.
      const picked = (g: Gained) => Object.entries((p.chosen ?? {}) as O).every(([key, want]) =>
        list(plain(g.picks[key]) ? Object.keys(g.picks[key] as O) : g.picks[key]).some((x) => typeof x === 'string' && typeof want === 'string' && (matches(want, x) || matches(x, want))))
      // `match` is how an item is carried: the fields the saved character keeps on it.
      // A spell is had when some effect gives it or lets the character pick it: Agonizing Blast's Eldritch Blast.
      if (p.match === undefined && p.chosen === undefined && refs.some((r) => (r as string).startsWith('spell:'))
        && spells().some((h) => refs.some((r) => matches(r as string, h.spell) || matches(h.spell, r as string)))) return true
      return gained.some((g) => picked(g) && (p.match === undefined || (g.from === 'inventory' && fitsPattern(g.carried, p.match)))
        && refs.some((r) => r === 'this' ? (holder.carried ? g.carried === holder.carried && g.from === 'inventory' : g.entity === holder.entity && g.from === holder.from)
          : matches(r as string, g.id) || groupsOf(g.entity).has(r as string)))
    }
    if (typeof p.proficient === 'string') {
      // Proficiency with something, or with any group it is in: a longsword is a martial weapon.
      const it = p.proficient === 'this' ? holder.item ?? holder.entity : resolve(catalog, p.proficient)?.entity
      const keys = it ? [...(kinds.get(it.id) ?? [it.id]), ...groupsOf(it)] : [p.proficient]
      const need = p.level === 'expertise' ? 2 : 1
      return keys.some((k) => ((without(`proficiencies.${untagged(k)}`, holder) as number | undefined) ?? 0) >= need)
    }
    if ('class' in p && typeof p.class === 'string' && p.class.startsWith('class:')) return (levels[untagged(p.class)] ?? 0) > 0
    if ('match' in p && plain(p.match) && !('event' in p)) {
      return Object.entries(p.match).every(([field, pattern]) => {
        if (plain(pattern) && !('atLeast' in pattern || 'atMost' in pattern)) throw new Unknown(`a match on \`${field}\` by its parts`)
        if (plain(pattern) && [pattern.atLeast, pattern.atMost].some((b) => b !== undefined && typeof b !== 'number'))
          throw new Unknown(`a match on \`${field}\` by rank`)
        return fitsPattern(without(field, holder), pattern)
      })
    }
    if ('event' in p) {
      const event = holder.event
      if (!event) throw new Unknown('a test of what is happening in play')
      if (!list(p.event).some((e) => matches(e as string, event.event as string))) return false
      if ((p.by !== undefined && p.by !== 'self') || (p.subject !== undefined && p.subject !== 'self')) return false
      return Object.entries((p.match as O | undefined) ?? {}).every(([field, pattern]) => {
        const have = event[field]
        if (pattern === true) return have !== undefined
        if (plain(pattern) && field === 'attack') return plain(have) && withAttack(have, pattern, holder)
        if (plain(pattern)) return false // a part of the roll the sheet doesn't have
        return list(pattern).some((want) => typeof want === 'string' && typeof have === 'string' ? isA(have, want) : want === have)
      })
    }
    if ('prose' in p) throw new Unknown(`a test still in words: "${(p.prose as O).text}"`)
    throw new Unknown(`the test {${Object.keys(p).join(', ')}}`)
  }

  /** Whether the attack a roll belongs to fits a pattern: its range, what it is made by, and the item it is made with. */
  const withAttack = (attack: O, pattern: O, holder: Gained): boolean => Object.entries(pattern).every(([k, want]) => {
    if (k === 'range') return attack.range === want || attack.range === 'melee-or-ranged'
    if (k === 'via') return attack.via === want
    if (k === 'hands') return attack.hands === want
    if (k === 'item') {
      if (typeof attack.item === 'string') return want === true || want === attack.item
      const it = attack.item as Gained | undefined
      if (!it) return false
      if (want === true) return true
      if (want === 'this') return holder.carried !== undefined && it.carried === holder.carried
      if (typeof want === 'string') return (kinds.get(it.id) ?? [it.id]).some((id) => matches(want, id)) || groupsOf(it.entity).has(want)
      if (plain(want) && want.kind === 'item') return want.where === undefined || candidateFits(it.entity, want.where)
    }
    throw new Unknown(`a fact about the attack the sheet doesn't have: \`${k}\``)
  })

  /** Whether an id is another, or a kind of it: a saving throw is a D20 Test. */
  const isA = (id: string, want: string): boolean => {
    for (let at: unknown = id, n = 0; typeof at === 'string' && n < 8; at = resolve(catalog, at)?.entity.isA, n++) if (matches(want, at)) return true
    return false
  }

  /** Whether a write applies, and its operand; undefined, and a note, when either can't be evaluated. */
  const settle = (w: Write, entry?: string): unknown => {
    try {
      if (w.at !== undefined || entry !== undefined) w = { ...w, holder: { ...w.holder, at: w.at ?? entry?.split('.').pop(), entry } }
      if (w.when !== undefined && !test(w.when, w.holder)) return undefined
      // An activity that is one option of a pick has no pool when another option was picked: a Hunter who chose
      // Colossus Slayer has no Horde Breaker. The rest of an activity's `when` is about play, and the pool stands.
      if (list(plain(w.option) && 'all' in w.option ? w.option.all : w.option).some((t) => plain(t) && 'has' in t && plain(t.chosen) && !test(t, w.holder))) return undefined
      if (plain(w.operand) && 'upTo' in w.operand) {
        const cap = w.operand.upTo === 'maximum' ? read(['abilityMaximums', w.segs[w.segs.length - 1]].join('.')) : value(w.operand.upTo, w.holder)
        if (typeof cap !== 'number') throw new Unknown(`the cap ${JSON.stringify(w.operand.upTo)}`)
        return { amount: number(w.operand.amount, w.holder), upTo: cap }
      }
      const v = value(w.operand, w.holder)
      return w.negate ? -number(v, w.holder) : v
    } catch (e) {
      if (!(e instanceof Unknown)) throw e
      skip(w.holder.id, `its change to \`${w.segs.join('.')}\` needs ${e.message}`)
      return undefined
    }
  }

  // The numeric pipeline of design/model/effects.md, "How effects combine": the stored
  // value or the best `$base`, then adds, capped adds from the lowest cap up, multipliers, floors, ceilings,
  // and last a value set outright.
  // A change whose own `when` asks about the field it changes is asking how the field stands without it:
  // "if you already have this proficiency". `without` leaves that entity's changes out.
  const settling = new Map<string, Gained>()
  function read(path: string, without?: Gained): unknown {
    let segs = path.split('.')
    if (segs[0] === 'self') segs = segs.slice(1)
    if (ROLES.includes(segs[0])) throw new Unknown(`a read of \`${path}\`, which isn't the character's own field`)
    if (segs.some((s) => s.startsWith('{'))) throw new Unknown(`a read of \`${path}\`, through a pick`)
    const key = segs.join('.')
    if (segs[0] === 'levels') return segs.length === 2 ? levels[untagged(segs[1])] ?? 0 : levels
    // What is left of a pool: its maximum less what has been spent.
    if (segs[0] === 'pools' && segs.length === 3 && (segs[2] === 'current' || segs[2] === 'spent')) {
      const spent = (character.spent as Record<string, number> | undefined)?.[segs[1]] ?? 0
      const max = read(`pools.${segs[1]}.max`)
      return segs[2] === 'spent' ? spent : typeof max === 'number' ? Math.max(0, max - spent) : max
    }
    const mark = without ? `${key}|${gained.indexOf(without)}` : key
    if (memo.has(mark)) return memo.get(mark)
    if (reading.has(mark)) {
      const asker = settling.get(key)
      if (without || !asker) throw new Unknown(`\`${key}\`, which depends on itself`)
      return read(path, asker)
    }
    reading.add(mark)
    try {
      const base = stored(segs)
      // A `$where: true` reaches every entry there is: one that is stored, or that a rule writes by name.
      const exists = (prefix: string[]) => stored(prefix) !== undefined
        || writes.some((w) => w.segs.length >= prefix.length && prefix.every((s, i) => w.segs[i] === s))
      // With a pattern, the entry's own fields have to fit it: {"slots": true} is every entry that has `slots`.
      const fits = (w: Write, i: number) => exists(segs.slice(0, i + 1)) && (!w.where
        || Object.entries(w.where).every(([k, pattern]) => fitsPattern(read([...segs.slice(0, i + 1), k].join('.')), pattern)))
      const hits = writes.filter((w) => w.holder !== without && w.segs.length === segs.length && w.segs.every((s, i) => s === segs[i] || s === '*')
        && w.segs.every((s, i) => s !== '*' || fits(w, i)))
      const entryOf = (w: Write) => { const i = w.segs.indexOf('*'); return i < 0 ? undefined : segs.slice(0, i + 1).join('.') }
      const below = new Set(writes.filter((w) => w.segs.length > segs.length && segs.every((s, i) => w.segs[i] === s || w.segs[i] === '*')).map((w) => w.segs[segs.length]))
      let out: unknown
      if (plain(base) || (base === undefined && below.size)) {
        // A map: each entry it stores or a rule writes, read in turn.
        const keys = new Set([...Object.keys(plain(base) ? base : {}), ...[...below].filter((k) => k !== '*')])
        out = Object.fromEntries([...keys].map((k) => [k, read(`${key}.${k}`)]).filter(([, v]) => v !== undefined))
      } else {
        const settled = hits.map((w) => {
          const before = settling.get(key)
          settling.set(key, w.holder)
          try { return { op: w.op, v: settle(w, entryOf(w)) } }
          finally { if (before) settling.set(key, before); else settling.delete(key) }
        }).filter((s) => s.v !== undefined)
        const of = (op: Write['op']) => settled.filter((s) => s.op === op).map((s) => s.v)
        // The start: the stored value, or the highest `$base` where that is higher or nothing is stored.
        const starts = [base, ...of('$base')].filter((x) => x !== undefined)
        let n: unknown = starts.length && starts.every((x) => typeof x === 'number') ? Math.max(...(starts as number[])) : starts[0]
        const adds = of('$add')
        for (const a of adds) if (typeof a === 'number') n = ((n as number | undefined) ?? 0) + a
        const capped = adds.filter(plain) as { amount: number; upTo: number }[]
        for (const a of capped.sort((x, y) => x.upTo - y.upTo)) {
          const now = (n as number | undefined) ?? 0
          n = Math.max(now, Math.min(now + a.amount, a.upTo))
        }
        for (const m of of('$multiply')) if (typeof n === 'number') n *= m as number
        for (const f of of('$atLeast')) n = n === undefined ? f : Math.max(n as number, f as number)
        for (const c of of('$atMost')) n = n === undefined ? c : Math.min(n as number, c as number)
        const sets = of('$replace')
        if (sets.length) {
          n = sets[sets.length - 1]
          if (new Set(sets.map((s) => JSON.stringify(s))).size > 1)
            skip(key, `is set outright to ${sets.map((s) => JSON.stringify(s)).join(' and ')}; which wins isn't decided, so the last was taken`)
        }
        out = n
      }
      memo.set(mark, out)
      return out
    } finally {
      reading.delete(mark)
    }
  }

  // A roll: every `change` of the roll event whose `when` holds for it adds to the total.
  const rollWith = (fields: O): Roll => {
    const event = { event: 'event:roll-made', ...fields }
    const out: Roll = { total: 0, parts: [], conditional: [], ...typeof fields.ability === 'string' && { ability: fields.ability } }
    for (const g of gained)
      for (const effect of effectsOf(g)) {
        if (!plain(effect) || effect.type !== 'change' || effect.of !== 'event' || effect.to !== undefined) continue
        const total = (effect.set as O | undefined)?.total
        if (!plain(total) || !('$add' in total || '$subtract' in total)) continue
        const holder = { ...g, event }
        try {
          if (effect.when !== undefined && !test(effect.when, holder)) continue
          const amount = value('$add' in total ? total.$add : total.$subtract, holder) ?? 0
          if (typeof amount === 'number') { const n = '$add' in total ? amount : -amount; if (n) { out.total += n; out.parts.push({ id: g.id, amount: n }) } }
          else if (typeof amount === 'string') out.parts.push({ id: g.id, amount: '$add' in total ? amount : `-${amount}` })
        } catch (e) {
          if (!(e instanceof Unknown)) throw e
          // Left for the table when the rule is about this kind of roll at all
          try { if (test(rollPart(effect.when), holder)) out.conditional.push({ id: g.id, message: e.message }) } catch { /* not about this roll, as far as can be told */ }
        }
      }
    return out
  }
  /** The abilities a roll may use: the one it names, and any a rule lets stand in for it on such a roll. */
  const abilitiesFor = (fields: O): string[] => {
    if (typeof fields.ability !== 'string') return []
    const event = { event: 'event:roll-made', ...fields }
    const out = new Set([fields.ability])
    for (const g of gained)
      for (const effect of effectsOf(g)) {
        if (!plain(effect) || effect.type !== 'ability-substitute' || effect.to !== undefined) continue
        try {
          if (!test(effect.for, { ...g, event }) || (effect.when !== undefined && !test(effect.when, { ...g, event }))) continue
          for (const use of list(effect.use)) {
            if (use === 'spellcasting') { for (const e of Object.values((read('spellcasting') ?? {}) as Record<string, O>)) if (typeof e.ability === 'string') out.add(e.ability) }
            else out.add(use as string)
          }
        } catch (e) { if (!(e instanceof Unknown)) throw e }
      }
    return [...out]
  }
  /** A roll with the best ability it may use. */
  const roll = (fields: O): Roll => {
    const all = abilitiesFor(fields).map((ability) => rollWith({ ...fields, ability }))
    return all.length ? all.reduce((best, r) => (r.total > best.total ? r : best)) : rollWith(fields)
  }

  /** The item an activity's attack is made with, where it is `this` item. */
  const itemUsed = (g: Gained, a: O): Gained | undefined => {
    const atk = plain(a.delivery) ? a.delivery.attack : undefined
    return plain(atk) && atk.item === 'this' ? gained.find((i) => i.from === 'inventory' && i.carried !== undefined && i.carried === g.carried) : undefined
  }
  /** Whether an activity passes a filter's `where`. A pattern on the item an attack is made with tests the item itself. */
  const activityFits = (g: Gained, a: O, where: unknown, holder: Gained): boolean => {
    if (where === undefined) return true
    if (!plain(where)) throw new Unknown(`the filter ${JSON.stringify(where)}`)
    if (Array.isArray(where.all)) return where.all.every((w) => activityFits(g, a, w, holder))
    if (Array.isArray(where.any)) return where.any.some((w) => activityFits(g, a, w, holder))
    if ('not' in where) return !activityFits(g, a, where.not, holder)
    if (typeof where.activity === 'string') return where.activity === a.key || matches(where.activity, g.id)
    // An activity an entity gave: its own, by `"this"` or its id.
    if (typeof where.grantedBy === 'string') return where.grantedBy === 'this' ? g.entity === holder.entity : matches(where.grantedBy, g.id)
    // A filter by the spell an activity casts passes none of a rule's or a feature's own activities.
    if ('spell' in where && !g.id.startsWith('spell:')) return false
    if (plain(where.match)) {
      const want = ((where.match.delivery as O | undefined)?.attack as O | undefined)?.item
      if (want === undefined || typeof want === 'string' && !want.includes(':') && want !== 'this') return fitsPattern(a, where.match)
      const atk = plain(a.delivery) && plain(a.delivery.attack) ? a.delivery.attack : undefined
      if (!atk || !withAttack({ ...atk, item: itemUsed(g, a) }, { item: want }, holder)) return false
      const { item: _item, ...rest } = (where.match.delivery as O).attack as O
      return fitsPattern(a, { ...where.match, delivery: { ...(where.match.delivery as O), attack: Object.keys(rest).length ? rest : true } })
    }
    throw new Unknown(`a filter of activities by {${Object.keys(where).join(', ')}}`)
  }
  /** Every activity the character has, with the changes its other rules make to it. A change with a `variant`
   *  adds the changed activity beside the original, as another way to use it; variants don't combine with each other. */
  const activities = (): { from: Gained; activity: O }[] => {
    const changes = gained.flatMap((h) => effectsOf(h).filter((e): e is O => plain(e) && e.type === 'change' && e.to === undefined
      && plain(e.of) && e.of.kind === 'activity').map((effect) => ({ h, effect })))
    const out: { from: Gained; activity: O }[] = []
    for (const g of gained)
      for (const a of list(g.entity.activities)) {
        if (!plain(a)) continue
        // The activity with every plain change, then one more form for each change that adds a variant of it.
        let base = a
        const variants: { h: Gained; effect: O }[] = []
        for (const { h, effect } of changes) {
          try {
            if (!activityFits(g, a, (effect.of as O).where, h)) continue
            if (effect.when !== undefined && !test(effect.when, h)) continue
            if (typeof effect.variant === 'string') variants.push({ h, effect })
            else base = applyPatch(base, effect.set as O)
          } catch (e) {
            if (!(e instanceof Unknown)) throw e
            skip(h.id, `its change to activities needs ${e.message}`)
          }
        }
        const forms = [base, ...variants.map(({ h, effect }) => ({ ...applyPatch(base, effect.set as O), key: `${a.key}/${effect.variant}`, name: `${a.name ?? g.entity.name} (${h.entity.name})` }))]
        for (const activity of forms) out.push({ from: g, activity })
      }
    return out
  }

  const attacks = (): Attack[] => {
    const out: Attack[] = []
    for (const { from: g, activity: a } of activities()) {
        const atk = plain(a.delivery) ? a.delivery.attack : undefined
        if (!plain(atk)) continue
        try {
          const item = itemUsed(g, a)
          // An attack with any item of a group (an improvised weapon) carries the group as what it is made with.
          const fields = { ability: atk.ability, attack: { range: atk.range, via: atk.via, hands: atk.hands, item: item ?? (typeof atk.item === 'string' && atk.item !== 'this' ? atk.item : undefined) } }
          // A stated bonus is the whole of it, as a stat block's is. Otherwise the rules for such a roll add up.
          const toHit: Roll = atk.bonus !== undefined ? { total: number(atk.bonus, g), parts: [], conditional: [] } : roll({ roll: 'roll:attack', ...fields })
          const ability = toHit.ability
          const damage = list(a.outcomes).filter((o): o is O => plain(o) && plain(o.damage)).map((o) => {
            const d = o.damage as O
            const type = plain(d.type) && d.type.of === 'weapon' ? ((item?.entity.weapon as O | undefined)?.damage as O | undefined)?.type : d.type
            return { amount: value(d.amount, g) as number | string, bonus: rollWith({ roll: 'roll:damage', ...fields, ability }), type }
          })
          // Extra damage of its own type that an effect adds to such a damage roll: Radiant Strikes' 1d8
          const event = { event: 'event:roll-made', roll: 'roll:damage', ...fields, ability }
          for (const h of gained)
            for (const effect of effectsOf(h)) {
              if (effect.type !== 'damage-bonus' || effect.to !== undefined) continue
              try {
                if (effect.when !== undefined && !test(effect.when, { ...h, event })) continue
                damage.push({ amount: value(effect.amount, { ...h, event }) as number | string, bonus: { total: 0, parts: [], conditional: [] }, type: effect.damageType })
              } catch (e) { if (!(e instanceof Unknown)) throw e }
            }
          out.push({ id: g.id, key: a.key as string, ...item && { item: item.id }, name: [item?.entity.name, a.name ?? g.entity.name].filter(Boolean).join(': '),
            range: atk.range as string, ...ability && { ability }, toHit, damage })
        } catch (e) {
          if (!(e instanceof Unknown)) throw e
          skip(g.id, `its attack "${a.key}" needs ${e.message}`)
        }
      }
    return out
  }

  const spells = (): SpellHeld[] => {
    const out: SpellHeld[] = []
    for (const g of gained)
      for (const effect of effectsOf(g)) {
        if (effect.type !== 'spell-access' || effect.to !== undefined) continue
        try {
          if (effect.when !== undefined && !test(effect.when, g)) continue
          if (!Array.isArray(effect.spells)) throw new Unknown('every spell a test picks')
          for (const entry of effect.spells)
            for (const spell of keysOf(entry, g) ?? [])
              out.push({ spell, how: effect.how as string, from: g.id, ...typeof effect.ability === 'string' && { ability: effect.ability }, ...effect.counts === false && { counts: false } })
        } catch (e) {
          if (!(e instanceof Unknown)) throw e
          skip(g.id, `its spells need ${e.message}`)
        }
      }
    return out
  }

  const items = () => gained.filter((g) => g.from === 'inventory').map((g) => {
    let pools = {}
    try { pools = itemPools(g) } catch (e) { if (!(e instanceof Unknown)) throw e; skip(g.id, `its pools need ${e.message}`) }
    return { id: g.id, name: g.entity.name as string, carried: g.carried!, pools }
  })

  const sight = (): (O & { id: string })[] => {
    const out: (O & { id: string })[] = []
    for (const g of gained)
      for (const effect of effectsOf(g)) {
        if (effect.type !== 'see' || effect.to !== undefined) continue
        try {
          if (effect.when !== undefined && !test(effect.when, g)) continue
          const { type: _type, when: _when, range, ...rest } = effect
          // A sense's rule reads the sense's range, and a creature without the sense has none.
          const feet = range === undefined ? undefined : value(range, g)
          if (range !== undefined && feet === undefined) continue
          out.push({ id: g.id, ...(feet === undefined ? {} : { range: feet }), ...rest })
        } catch (e) { if (!(e instanceof Unknown)) throw e }
      }
    return out
  }
  const defenses = (): Defenses => {
    const out: Defenses = { resist: [], immune: [], vulnerable: [], conditional: [] }
    for (const g of gained)
      for (const effect of effectsOf(g)) {
        if (effect.type !== 'defense' || effect.to !== undefined) continue
        const each = (into: string[]) => {
          for (const k of ['resist', 'immune', 'vulnerable'] as const) {
            const what = effect[k]
            if (what === undefined) continue
            let ids: string[] | undefined
            if (plain(what)) ids = [what.except ? `all but ${list(what.except).join(', ')}` : 'all']
            else ids = list(what).flatMap((x) => keysOf(x, g) ?? [])
            for (const id of ids) if (into === out.conditional as unknown) out.conditional.push({ id: g.id, message: `${k} ${id}` }); else if (!out[k].includes(id)) out[k].push(id)
          }
        }
        try {
          if (effect.when === undefined || test(effect.when, g)) each(out.resist)
        } catch (e) {
          if (!(e instanceof Unknown)) throw e
          each(out.conditional as unknown as string[])
        }
      }
    return out
  }

  /** The part of a test that is about the roll itself, with the rest dropped. */
  const rollPart = (p: unknown): unknown => {
    if (plain(p) && 'event' in p) return p
    if (plain(p) && Array.isArray(p.all)) { const parts = p.all.map(rollPart).filter((x) => x !== undefined); return parts.length ? { all: parts } : undefined }
    return undefined
  }

  // The picks: each choice offered is answered, with as many picks as it allows, each one an option it offers.
  // A part of a choice the engine can't evaluate is taken as satisfied.
  // A choice anywhere inside an effect is made when the character is built: which cantrips, which spell list they come from.
  const choicesIn = (v: unknown, g: Gained) => {
    if (Array.isArray(v)) v.forEach((x) => choicesIn(x, g))
    else if (plain(v)) {
      if (plain(v.choose) && typeof v.choose.key === 'string') asked.push({ g, choose: v.choose })
      // A choice inside a step is made each time the step runs, so the character records none: which Cunning Strike options to use on this hit.
      for (const [k, x] of Object.entries(v)) if (k !== 'outcomes' && k !== 'step') choicesIn(x, g)
    }
  }
  // An effect that doesn't apply yet offers nothing: a Mystic Arcanum of a level the Warlock hasn't reached.
  const applies = (effect: O, g: Gained): boolean => {
    if (effect.when === undefined) return true
    try { return test(effect.when, g) } catch (e) { if (!(e instanceof Unknown)) throw e; return true }
  }
  // A change with a `variant` is an optional form taken when the activity is used, so its choices are asked then too.
  for (const g of gained) for (const effect of effectsOf(g)) if (effect.to === undefined && effect.variant === undefined && applies(effect, g)) choicesIn(effect, g)
  // What a feat, invocation, or other picked entity requires is tested against the character as it stands now.
  // A class's requirement is for multiclassing: it applies once the character has levels in more than one.
  const several = Object.keys(character.classes).length > 1
  for (const g of gained) {
    const needs = g.entity.requires ?? (several && plain(g.entity.multiclass) ? g.entity.multiclass.requires : undefined)
    if (needs === undefined) continue
    try { if (!test(needs, g)) picks.push({ id: g.id, message: "is picked, and the character doesn't meet what it requires" }) }
    catch (e) { if (!(e instanceof Unknown)) throw e; skip(g.id, `what it requires needs ${e.message}`) }
  }
  // What a carried thing holds is held once: a spellbook with the same spell twice has one fewer spell than it claims.
  for (const c of inventory)
    for (const [pool, held] of Object.entries(plain(c.holds) ? c.holds : {})) {
      const ids = list(held).map((h) => (plain(h) ? h.id : h)).filter((x): x is string => typeof x === 'string')
      const twice = [...new Set(ids.filter((id, i) => ids.indexOf(id) !== i))]
      if (twice.length) picks.push({ id: c.item as string, message: `its ${pool} holds ${twice.join(', ')} more than once` })
    }
  try { read('size') } catch (e) { if (!(e instanceof Unknown)) throw e } // a species with several sizes asks for one
  const seen = new Set<string>()
  for (const { g, choose, when } of asked) {
    // A choice in an effect that doesn't apply isn't offered: a feature's second save proficiency, offered only when the character already has the first.
    if (when !== undefined && !applies({ when }, g)) continue
    const mark = `${gained.indexOf(g)} ${choose.key}`
    if (seen.has(mark)) continue
    seen.add(mark)
    const answer = g.picks[choose.key as string]
    if (answer === undefined) { if (choose.optional !== true) picks.push({ id: g.id, message: `"${choose.name}" isn't answered` }); continue }
    const picked = plain(answer) ? Object.entries(answer).flatMap(([k, n]) => Array<string | number>(n).fill(k)) : list(answer) as (string | number)[]
    try {
      const range = plain(choose.count) && ('atLeast' in choose.count || 'atMost' in choose.count) ? choose.count : undefined
      const want = range ? undefined : value(choose.count ?? 1, g)
      const least = range?.atLeast === undefined ? want : number(range.atLeast, g)
      const most = range?.atMost === undefined ? want : number(range.atMost, g)
      if ((typeof least === 'number' && picked.length < least) || (typeof most === 'number' && picked.length > most))
        picks.push({ id: g.id, message: `"${choose.name}" has ${picked.length} picked, and gives ${least === most ? least : least === undefined ? `at most ${most}` : most === undefined ? `at least ${least}` : `${least} to ${most}`}` })
    } catch (e) { if (!(e instanceof Unknown)) throw e }
    for (const p of picked) {
      if (typeof p !== 'string') continue
      const fits = list(choose.from).some((f) => {
        try {
          if (typeof f === 'string') return matches(f, p) || matches(p, f) || (resolve(catalog, p) !== undefined && groupsOf(resolve(catalog, p)!.entity).has(f))
          if (plain(f) && typeof f.kind === 'string') {
            const entity = p.startsWith(`${f.kind}:`) ? resolve(catalog, p)?.entity : undefined
            return entity !== undefined && (f.where === undefined || candidateFits(entity, f.where, g))
          }
          if (plain(f) && typeof f.name === 'string') return f.name === p
          return true
        } catch (e) { if (!(e instanceof Unknown)) throw e; return true }
      })
      if (!fits) picks.push({ id: g.id, message: `"${choose.name}": ${p} isn't one of its options` })
      // The choice's own condition on each pick: Expertise in a skill the character is proficient in.
      const entity = resolve(catalog, p)?.entity
      try {
        if (fits && entity && choose.where !== undefined && !candidateFits(entity, choose.where, g))
          picks.push({ id: g.id, message: `"${choose.name}": ${p} doesn't meet the choice's condition` })
      } catch (e) { if (!(e instanceof Unknown)) throw e }
    }
  }

  return {
    levels, gained, unevaluated, picks, roll, attacks, activities, defenses, sight, spells, items,
    read: (path) => {
      try { return read(path) } catch (e) {
        if (!(e instanceof Unknown)) throw e
        skip(path, `can't be read: it needs ${e.message}`)
        return undefined
      }
    },
  }
}
