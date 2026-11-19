// Renders an entity's mechanics as English rules text. Each construct has a
// phrase, and phrases compose. Anything not covered yet comes out as
// "[type]", so gaps in the renderer are visible rather than silently dropped.
//
// This is a spike over the rules and conditions typed so far. It is the
// basis for display, for checking transcriptions against the book, and for
// the sentence editor (see design/authoring.md).

type N = any

/** Who a sentence is about, with the words that go with them. */
interface Subject { s: string; poss: string; obj: string; you: boolean }
const YOU: Subject = { s: 'you', poss: 'your', obj: 'you', you: true }
const third = (s: string, obj = 'it'): Subject => ({ s, poss: s === 'it' ? 'its' : `${s}'s`, obj, you: false })

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)
const plain = (v: unknown): v is Record<string, any> => !!v && typeof v === 'object' && !Array.isArray(v)
const uncap = (s: string) => s.charAt(0).toLowerCase() + s.slice(1)
const list = (xs: string[], and = 'and') =>
  xs.length <= 1 ? xs.join('') : xs.length === 2 ? `${xs[0]} ${and} ${xs[1]}` : `${xs.slice(0, -1).join(', ')}, ${and} ${xs.at(-1)}`
const asArray = <T>(x: T | T[] | undefined): T[] => (x === undefined ? [] : Array.isArray(x) ? x : [x])
const humanize = (k: string) => k.replace(/-/g, ' ')
const singular = (k: string) => { const h = humanize(k); return /sses$/.test(h) ? h.slice(0, -2) : /ures$/.test(h) ? h.slice(0, -1) : h.replace(/s$/, '') }
const plural = (s: string) => (/(armor|s)$/i.test(s) ? s : /[^aeiou]y$/i.test(s) ? `${s.slice(0, -1)}ies` : `${s}s`)
const NUMBERS = ['zero', 'one', 'two', 'three', 'four', 'five']

const VERBS: Record<string, string> = {
  have: 'has', are: 'is', gain: 'gains', take: 'takes', regain: 'regains', die: 'dies', lose: 'loses',
  make: 'makes', drop: 'drops', roll: 'rolls', land: 'lands', fall: 'falls', fail: 'fails', 'can\'t': 'can\'t', can: 'can', must: 'must', finish: 'finishes',
}
const verb = (who: Subject, v: string) => (who.you ? v : VERBS[v] ?? `${v}s`)
const be = (who: Subject) => (who.you ? 'are' : 'is')

/** Tests in prose the renderer knows how to say, by their gap's name, about the holder. */
const TRAITS: Record<string, (h: Subject) => string> = {
  'magic-weapon': () => 'the weapon is magical',
  'bardic-inspiration-die': (h) => `${h.s} ${verb(h, 'have')} a Bardic Inspiration die from you`,
  'free-hand': (h) => `${h.s} ${verb(h, 'have')} a hand free`,
  'heavily-obscured': (h) => `${h.s} ${be(h)} heavily obscured`,
  'requires-sight': () => 'it requires sight',
  'requires-hearing': () => 'it requires hearing',
  'social-interaction': () => 'the check is to interact socially',
  'verbal-component': () => 'the spell has a verbal component',
  'beyond-normal-range': () => 'the target is beyond normal range',
  dragging: (h) => `${h.obj === 'you' ? 'you are' : `${h.s} is`} being dragged`,
  monster: (h) => `${h.s} ${be(h)} a monster`,
  'ate-and-drank': (h) => `${h.s} ${verb(h, 'have')} eaten and drunk`,
  'held-aloft-by-magic': (h) => `${h.s} ${be(h)} held aloft by magic`,
  'in-another-creatures-space': (h) => `${h.s} ${be(h)} in another creature's space`,
  'larger-than-that-creature': (h) => `${h.s} ${be(h)} larger than that creature`,
  'ate-nothing-today': (h) => `${h.s} ate nothing that day`,
  'ate-full-ration': (h) => `${h.s} ate a full day's food`,
  'ate-less-than-half-food': (h) => `${h.s} ate less than half a day's food`,
  'drank-half-water': (h) => `${h.s} drank only half a day's water`,
  'drank-less-than-half-water': (h) => `${h.s} drank less than half a day's water`,
  'moving-weight-over-capacity': (h) => `${h.s} ${be(h)} pushing, dragging, or lifting more than ${h.poss} carrying capacity`,
  'finishing-short-rest': (h) => `${h.s} ${verb(h, 'finish')} a Short Rest`,
  'trained-to-accept-a-rider': (h) => `${h.s} ${be(h)} trained to accept a rider`,
  'has-materials-pouch-or-focus': (h) => `${h.s} ${verb(h, 'have')} the material components, a component pouch, or a spellcasting focus`,
}

// The phrases below were written for the named tests of play (the roll, its die,
// its result, the attack being made, what a use spends, where an effect comes
// from) and the events they went with. This reads an event test's fields back
// into those tests, and a trigger on a roll, a use, or damage back into the
// event the phrases name, so the same phrases still apply.
const ROLL_EVENTS = ['event:roll-made', 'event:roll-resolved']
// A roll's `success` and `crit` as the one word the phrases use: an attack (or its damage) hits,
// misses, or scores a critical hit; any other roll succeeds or fails.
function asResult(m: N): N {
  if (m.success === undefined && m.crit !== true) return m
  const { success, crit, ...rest } = m
  const attack = [].concat(m.roll ?? []).some((r: string) => r === 'roll:attack' || r === 'roll:damage') || (m.roll === undefined && m.attack !== undefined)
  const result = crit === true ? 'crit' : attack ? (success ? 'hit' : 'miss') : success ? 'succeeded' : 'failed'
  return { ...rest, result }
}
const DAMAGE_EVENTS = ['event:taking-damage', 'event:damaged']
const TRIGGER_KEYS = ['trigger', 'on', 'ends', 'happened']
// The tests an event's fields stand for. In a trigger the roll needs no `by`: the trigger's own says who rolls.
function eventAtoms(m: N, by: N, subject: N, event: string, inTrigger: boolean): N[] {
  const out: N[] = []
  if (m.roll !== undefined) {
    const r: N = { roll: m.roll }
    if (m.ability !== undefined) r.ability = m.ability
    if (m.skill !== undefined) r.skill = m.skill
    if (!inTrigger) {
      if (by !== 'self') r.by = by ?? { pool: 'any' }
      if (subject !== undefined) r.target = subject
    }
    out.push(r)
  }
  if (m.natural !== undefined) out.push({ natural: m.natural })
  if (m.mode !== undefined) out.push({ mode: m.mode })
  if (m.result !== undefined) out.push({ result: m.result, ...m.margin !== undefined && { margin: m.margin } })
  if (m.attack !== undefined) out.push({ attack: m.attack === true ? {} : m.attack })
  if (m.spent !== undefined) out.push({ spends: m.spent })
  if (m.spell !== undefined && m.spell !== true) out.push({ spell: m.spell })
  if (m.action !== undefined && event === 'event:activity-used') out.push({ activity: { kind: 'activity', where: { match: { action: m.action } } } })
  if (m.damageType !== undefined) out.push({ against: { damageType: m.damageType } })
  if (m.against !== undefined) out.push({ against: m.against })
  return out
}
// A read of a field by its path ("target.hp.max"): its role, if any, and the rest.
const ROLES = new Set(['self', 'this', 'target', 'source', 'subject', 'actor', 'candidate'])
const PATH = /^(?!unlimited$)(?:[a-z]+\.)?[a-z][A-Za-z]*(?:\.[^.]+)*$/
function readOf(v: N): { role?: string; segs: string[]; field: string } | undefined {
  if (typeof v !== 'string' || !PATH.test(v)) return undefined
  const segs = v.split('.')
  const role = ROLES.has(segs[0]) && segs.length > 1 ? segs.shift() : undefined
  return { role, segs, field: segs.join('.') }
}
// A number worked out in play rather than written: arithmetic, a read, a pick.
const computed = (v: N) => (typeof v === 'object' && v !== null) || !!readOf(v)
const conj = (xs: N[]): N => (xs.length === 1 ? xs[0] : { all: xs })
const withWhen = (when: N, atoms: N[]): N => (!atoms.length ? when : when === undefined ? conj(atoms) : conj([...('all' in when ? when.all : [when]), ...atoms]))
function olderTrigger(t: N): N {
  if ('becomes' in t) {
    const b = t.becomes
    if (readOf(b?.compare)?.field === 'hp.current' && b.atMost === 0) return { event: 'event:reduced-to-zero', subject: t.subject ?? 'self', ...t.when && { when: t.when } }
    return t
  }
  if (typeof t.event !== 'string') return t
  const { match: raw = {}, ...rest } = t
  const m = asResult(raw)
  const known = ['roll', 'ability', 'skill', 'natural', 'mode', 'result', 'margin', 'attack', 'spent', 'spell', 'action', 'damageType', 'against', 'remaining', 'pool']
  const others = Object.fromEntries(Object.entries(m).filter(([k]) => !known.includes(k)))
  const keep = (x: N) => (Object.keys(others).length ? { ...x, match: others } : x)
  if (ROLL_EVENTS.includes(t.event)) {
    const rolls = [].concat(m.roll ?? [])
    if (rolls.length === 1 && rolls[0] === 'roll:attack' && !JSON.stringify(rest.when ?? {}).includes('"spell"')) {
      const { roll: _, ...f } = m
      return keep({ ...rest, event: 'event:attack-roll', ...withWhen(rest.when, eventAtoms(f, rest.by, rest.subject, t.event, true)) !== undefined && { when: withWhen(rest.when, eventAtoms(f, rest.by, rest.subject, t.event, true)) } })
    }
    if (rolls.length === 1 && rolls[0] === 'roll:initiative') {
      const { by, ...r } = rest
      const { roll: _, ...f } = m
      const when = withWhen(r.when, eventAtoms(f, undefined, undefined, t.event, true))
      return keep({ ...r, event: 'event:initiative-rolled', ...by !== undefined && { subject: by }, ...when && { when } })
    }
    const when = withWhen(rest.when, eventAtoms(m, rest.by, rest.subject, t.event, true))
    return keep({ ...rest, event: 'event:roll-made', ...when && { when } })
  }
  if (t.event === 'event:activity-used') {
    if (m.action === 'action:attack') {
      const { action: _, ...f } = m
      const when = withWhen(rest.when, eventAtoms(f, rest.by, rest.subject, t.event, true))
      return keep({ ...rest, event: 'event:attack-action-taken', ...when && { when } })
    }
    if (m.spell !== undefined) {
      const when = withWhen(rest.when, eventAtoms(m, rest.by, rest.subject, t.event, true))
      return keep({ ...rest, event: 'event:spell-cast', ...when && { when } })
    }
  }
  if (t.event === 'event:pool-spent' && m.pool === 'spell-slots') return keep({ ...rest, event: 'event:spell-slot-expended' })
  if (DAMAGE_EVENTS.includes(t.event)) {
    const when = withWhen(rest.when, eventAtoms(m, rest.by, rest.subject, t.event, true))
    return keep({ ...rest, event: m.remaining === 0 ? 'event:reduced-to-zero' : 'event:damaged', ...when && { when } })
  }
  return t
}
// A change of a creature's field, or of the roll in progress, reads as the stat it names
// ("your Strength score increases by 2"): the patch's path back to the stat the phrases know.
const STATS: Record<string, string> = { ac: 'ac', 'hp.max': 'hp-max', attunementSlots: 'attunement-slots', weight: 'weight', age: 'age',
  carryingCapacity: 'carrying-capacity', jump: 'jump', proficiencyBonus: 'proficiency-bonus', 'spellcasting.*.dc': 'spell-save-dc',
  'spellcasting.*.attack': 'spell-attack', creatureType: 'creature-type', size: 'size', alignment: 'alignment' }
const EVENT_STATS: Record<string, string> = { total: 'roll', die: 'die', criticalMinimum: 'critical-hit-minimum' }
function statOf(segs: N[], event = false): N {
  const [a, b, c] = segs
  const key = segs.map((x) => (typeof x === 'string' ? x : '?')).join('.')
  if (event) return segs.length === 1 ? EVENT_STATS[a] : undefined
  if (key in STATS) return STATS[key]
  if (segs.length === 2 && (a === 'abilities' || a === 'abilityMaximums')) return { ability: b, ...a === 'abilityMaximums' && { facet: 'maximum' } }
  if (segs.length === 3 && a === 'speeds' && c === 'speed') return { speed: b === '*' ? 'all' : b }
  if (segs.length === 2 && a === 'movementCosts') return { movementCost: b === '*' ? 'all' : b }
  if (segs.length === 3 && a === 'pools') return { pool: b, facet: c }
  if (segs.length === 2 && a === 'passives') return { passive: b }
  return undefined
}
// The patch's path to its one changed field, and the operators there.
function patchPath(set: N): [N[], N] {
  const segs: N[] = []
  for (let o = set; ;) {
    if (o === true) return [segs, undefined]
    if (!plain(o)) return [[], undefined]
    const { $where, $at, ...rest } = o
    if ($where === true) segs.push('*')
    else if ($at !== undefined) segs.push($at)
    else if ($where !== undefined) return [[], undefined]
    const keys = Object.keys(rest)
    if (keys.length && keys.every((k) => k.startsWith('$'))) return [segs, rest]
    if (keys.length !== 1) return [[], undefined]
    segs.push(keys[0])
    o = rest[keys[0]]
  }
}
function asModifier(x: N): N | undefined {
  const { type: _, of, set, ...rest } = x
  if (of === undefined || of === 'event') {
    const [segs, op] = patchPath(set)
    const target = segs.length ? statOf(segs, of === 'event') : undefined
    return target === undefined ? undefined : { type: 'modifier', target, ...op && { set: op }, ...rest }
  }
  const values = plain(set) && Object.keys(set).length === 1 ? set.values : undefined
  if ((typeof of === 'string') && plain(values) && Object.keys(values).length === 1) {
    const [k, op] = Object.entries(values)[0]
    if (plain(op) && Object.keys(op).every((o) => o.startsWith('$'))) return { type: 'modifier', target: { value: k, ...of !== 'this' && { from: of } }, set: op, ...rest }
  }
  return undefined
}
const lowered = (p: string): N => statOf(p.split('.')) ?? p

const CREATURE_FIELDS: Record<string, string> = { creatureType: 'creatureType', tags: 'creatureTag', size: 'size', alignment: 'alignment' }
function older(x: N, parent = ''): N {
  if (Array.isArray(x)) {
    // A conjunction inside a conjunction reads as one
    const items = x.map((v) => older(v, parent)).flatMap((v: N) => (parent === 'all' && plain(v) && Object.keys(v).length === 1 && Array.isArray(v.all) ? v.all : [v]))
    // An outcome with `otherwise` reads as the outcome and its opposite
    if (parent === 'any' && items.length > 1 && items.every((v: N) => plain(v) && 'all' in v && v.all.length === 2 && 'roll' in v.all[0] && JSON.stringify(v.all[0]) === JSON.stringify(items[0].all[0])))
      return items.map((v: N) => v.all[1])
    return items.flatMap((o: N) => plain(o) && o.when && Array.isArray(o.otherwise) && !('type' in o)
      ? [(({ otherwise: _, ...a }) => a)(o), ...o.otherwise.map((b: N) => ({ ...b, when: { not: o.when } }))] : [o])
  }
  if (!plain(x)) return x
  // An item test reads by how the item is carried: {has, match: {worn: true}} is "wearing"
  if ('has' in x && plain(x.match)) {
    const said = Object.keys(x.match).sort().map((k) => ({ [({ worn: 'wearing', held: 'holding', attuned: 'attuned' } as N)[k] ?? k]: x.has }))
    x = said.length === 1 ? said[0] : { all: said }
  }
  // A starting value isn't a modifier: "your base AC is 10 + your Dexterity modifier"
  if (x.type === 'change' && x.of === undefined && plain(x.set?.ac) && '$base' in x.set.ac && Object.keys(x.set).length === 1) {
    const { type: _t, set, ...rest } = x
    x = { type: 'ac-formula', base: set.ac.$base, ...rest }
  } else if (x.type === 'change' && !JSON.stringify(x.set ?? {}).includes('"$base"')) x = asModifier(x) ?? x
  if (Array.isArray(x.lowers)) x = { ...x, lowers: x.lowers.map(lowered) }
  // A test in prose reads through the open tags the renderer knows, by its gap's name
  if (Object.keys(x).length === 1 && x.prose?.gap?.category === 'test') return { trait: x.prose.gap.name }
  if (TRIGGER_KEYS.includes(parent) && ('event' in x || 'becomes' in x)) x = olderTrigger(x)
  else if (typeof x.event === 'string' && x.event.startsWith('event:') && !('at' in x)) {
    // An event test in a `when`
    const m = asResult({ ...x.match })
    const atoms = eventAtoms(m, x.by, x.subject, x.event, false)
    if (x.event === 'event:rest-finished' && x.match?.rest === 'rest:short') return { trait: 'finishing-short-rest' }
    if (atoms.length) return older(conj(atoms))
  }
  // A state from a spell
  if (x.kind === 'state' && plain(x.where?.spell?.where?.match) || x.kind === 'state' && x.where?.spell?.kind === 'spell') {
    const level = x.where.spell.where?.match?.level
    return { ...x, where: { against: { sourceType: 'source-type:spell', ...level && { spellLevel: level } } } }
  }
  // A creature's own fields read as the creature phrases: "a beast", "Large or smaller"
  // and "has a fly speed", "has blindsight"
  if (plain(x.match) && Object.keys(x).length === 1 && Object.entries(x.match).every(([k, v]) => k in CREATURE_FIELDS || ((k === 'speeds' || k === 'senses') && plain(v))))
    return older(conj(Object.entries(x.match).flatMap(([k, v]: [string, N]) => k === 'speeds'
      ? Object.entries(v).map(([m, t]) => ({ speed: m, ...plain(t) && t.hover && { hover: true } }))
      : k === 'senses' ? Object.keys(v).map((sense) => ({ sense })) : [{ [CREATURE_FIELDS[k]]: v }])), parent)
  // A mode the holder has a speed in, while picking one: Dash's "one of your speeds"
  if (x.compare === 'self.speeds.{speed}.speed' && x.atLeast === 0 && Object.keys(x).length === 2) return { speed: 'candidate' }
  // A filter's stored-field tests the phrases name: an attack, a cost
  if (plain(x.match) && Object.keys(x).length === 1) {
    const m = x.match
    if (Object.keys(m).length === 1 && plain(m.delivery) && Object.keys(m.delivery).length === 1 && 'attack' in m.delivery) {
      const a = m.delivery.attack === true ? {} : { ...m.delivery.attack }
      if (Array.isArray(a.range)) a.range = a.range[0]
      return { attack: a }
    }
    if (Object.keys(m).length === 1 && plain(m.cost) && Object.keys(m.cost).length === 1) return { spends: m.cost.resource }
    if (Object.keys(m).length === 1 && plain(m.activities) && m.activities.key === 'cast' && plain(m.activities.cost)) return { spends: m.activities.cost.resource }
  }
  const out: N = {}
  for (const [k, v] of Object.entries(x)) out[k] = Array.isArray(v) && TRIGGER_KEYS.includes(k) ? v.map((t) => older(t, k)) : older(k === 'for' ? bothRolls(v) : v, k)
  return out
}
// A weapon's ability substitute is for its attack and damage rolls, which the phrases take as said
function bothRolls(p: N): N {
  if (Array.isArray(p)) return p.map(bothRolls)
  if (!plain(p)) return p
  const r = p.match?.roll
  if (typeof p.event === 'string' && Array.isArray(r) && r.length === 2 && r.includes('roll:attack') && r.includes('roll:damage')) {
    const { roll: _, ...m } = p.match
    return { ...p, match: m }
  }
  return Object.fromEntries(Object.entries(p).map(([k, v]) => [k, bothRolls(v)]))
}

// The phrases below were written for named tests on the activity being used. An
// activity filter's stored-field tests read the same way, so this turns them into
// the names the phrases know: {match: {action}} is `action`, {match: {delivery:
// {save: true}}} is `delivery: "save"`, and an activity filter in `runs`, `grant`,
// `forbid`, or `compel` is a `matching` predicate.
function phrases(x: N, onActivity = false, parent = ''): N {
  if (Array.isArray(x)) return x.map((v) => phrases(v, onActivity, parent))
  if (!x || typeof x !== 'object') return x
  const pred = (p: N): N => phrases(p, true)
  const asMatching = (a: N): N => typeof a === 'string' ? (a.includes(':') ? { matching: { activity: a } } : a) : a.choose ? a : { matching: pred(a.where ?? {}) }
  const out: N = {}
  for (const [k, v] of Object.entries(x)) {
    if (k === 'match' || k === '$where' || k === '$remove' || k === 'emits') out[k] = v
    else if (k === 'where' && x.kind === 'activity') out[k] = pred(v)
    else if (k === 'where' && ('kind' in x || 'creature' in x)) out[k] = phrases(v)
    else out[k] = phrases(v, onActivity, k)
  }
  if (onActivity && out.match && Object.keys(out).length === 1 && Object.keys(out.match).every((k) => k === 'action' || k === 'delivery')) {
    const atoms = Object.entries(out.match).map(([k, v]: [string, N]) => k === 'delivery' ? { delivery: Object.keys(v)[0] } : { [k]: v })
    return atoms.length === 1 ? atoms[0] : { all: atoms }
  }
  if (Object.keys(out).length === 1 && out.activity?.kind === 'activity' && parent !== 'grant' && parent !== 'runs') return pred(x.activity.where ?? {})
  if ((out.type === 'forbid' || out.type === 'compel') && out.activity) out.activity = typeof out.activity === 'string' ? { activity: out.activity } : out.activity.where ?? {}
  if (Array.isArray(out.runs)) out.runs = out.runs.map((r: N) => 'activity' in r ? { ...asMatching(r.activity).matching ? asMatching(r.activity) : { activity: r.activity }, ...r.times !== undefined && { times: r.times } } : r)
  if (out.grant?.activity && typeof out.grant.activity !== 'string' || typeof out.grant?.activity === 'string' && out.grant.activity.includes(':')) out.grant = { ...out.grant, activity: asMatching(x.grant.activity) }
  return out
}

export function renderer(nameOf: (id: string) => string) {
  // A pick standing in for an id: "the chosen damage type", "the damage type of your Draconic Ancestry".
  const chosenNoun = (c: N) => c.value && c.from ? `the ${humanize(c.value)} of your ${nameOf(c.from)}`
    : c.value ? `the ${humanize(c.value)} of the chosen ${humanize(c.chosen)}`
    : c.from ? `the ${humanize(c.chosen)} chosen for ${nameOf(c.from)}`
    : `the chosen ${humanize(c.chosen)}`
  const name = (x: N): string => (typeof x === 'object' && x && 'chosen' in x ? chosenNoun(x)
    : typeof x === 'object' && x && 'choose' in x ? chooseNoun(x.choose) : nameOf(x))

  // How many a choice picks: "two", "at least 1", "(3 at level 3 and 5 at 7)"
  const countText = (n: N): string => typeof n === 'number' ? (n <= 5 ? NUMBERS[n] : String(n))
    : typeof n === 'object' && ('atLeast' in n || 'atMost' in n) ? [n.atLeast !== undefined && `at least ${value(n.atLeast)}`, n.atMost !== undefined && `at most ${value(n.atMost)}`].filter(Boolean).join(' and ')
    : `(${value(n)})`
  const timesText = (n: N): string => n === 1 ? 'once' : n === 2 ? 'twice' : `${countText(n)} times`
  // How often one candidate can be picked: ", the same one up to twice"
  const eachText = (c: N): string => c.each === undefined ? '' : `, the same one up to ${timesText(c.each)}`
  // A filter on the candidates: "other than the exotic language you chose", "where it is a skill you're proficient in"
  const filterText = (w: N): string => !w ? '' : /^plus-(one|two)$/.test(w.not?.is?.chosen ?? '') ? ` other than your +${w.not.is.chosen === 'plus-two' ? 2 : 1} pick`
    : w.not?.is?.chosen ? ` other than the ${humanize(w.not.is.chosen)} you chose` : ` where ${clause(w)}`
  // A kind filter as a noun and what follows "of your choice": ["cantrips", " from the Wizard spell list"], ["Eldritch Invocations", ""]
  const pickParts = (p: N, many: boolean): [string, string] => {
    const w = p.where
    const parts: N[] = !w ? [] : 'all' in w ? w.all : [w]
    if (p.kind === 'item' && parts.every(itemPart)) return [itemNoun(p, many), '']
    const spellish = p.kind === 'spell' && spellNoun({ all: parts.filter((x) => 'match' in x) }, many) ? parts.filter((x) => 'match' in x) : []
    const groups = parts.find((x) => 'group' in x && Object.keys(x).every((k) => k === 'group' || k === 'for'))
    const rest = parts.filter((x) => !spellish.includes(x) && x !== groups)
    // What's left after the noun: "other than Minor Illusion where you don't already have it"
    const others = rest.filter((x) => typeof x.not?.is === 'string').map((x) => name(x.not.is))
    // "a weapon that deals bludgeoning damage"
    const deals = rest.find((x) => 'dealsDamage' in x && x.dealsDamage !== true)
    const left = rest.filter((x) => typeof x.not?.is !== 'string' && x !== deals)
    const extra = `${deals ? ` that ${many ? 'deal' : 'deals'} ${list(asArray(deals.dealsDamage).map(lower), 'or')} damage` : ''}${others.length ? ` other than ${list(others, 'or')}` : ''}${left.length ? filterText(left.length === 1 ? left[0] : { all: left }) : ''}`
    if (spellish.length) {
      const sn = spellNoun({ all: spellish }, many)!
      const i = sn.indexOf(' from the ')
      return i < 0 ? [sn, extra] : [sn.slice(0, i), sn.slice(i) + extra]
    }
    if (groups) {
      // A group named for its options' kind reads as is; otherwise the kind follows: "Fighting Style feat"
      const g = (id: string) => {
        const n = p.kind === 'item' ? lower(id) : p.kind === 'feat' && !/feat$/i.test(name(id)) ? `${name(id)} feat` : name(id)
        return many ? plural(n) : n
      }
      return [list(asArray(groups.group).map(g), 'or'), (groups.for ? ` available to ${name(groups.for)}` : '') + extra]
    }
    return [many ? plural(humanize(p.kind)) : humanize(p.kind), extra]
  }
  const pickNoun = (p: N, many: boolean): string => pickParts(p, many).join('')
  // A choice standing where one item goes: "two skills of your choice", "Strength or Dexterity (your choice)"
  function chooseNoun(c: N): string {
    const n = c.count ?? 1
    const many = n !== 1
    const where = filterText(c.where)
    if (c.from.length === 1 && typeof c.from[0] === 'object' && 'kind' in c.from[0]) {
      const [noun, rest] = pickParts(c.from[0], many)
      return `${countText(n)} ${noun} of your choice${rest}${where}${eachText(c)}`
    }
    if (c.from.every((x: N) => typeof x === 'object' && 'kind' in x)) return `${countText(n)} ${list(c.from.map((x: N) => pickNoun(x, many)), 'or')} of your choice${where}${eachText(c)}`
    const parts = c.from.map((x: N) => typeof x === 'string' ? name(x) : 'of' in x || 'name' in x ? x.name : 'kind' in x ? pickNoun(x, many) : '[candidate]')
    return `${many ? `${countText(n)} of ` : ''}${list(parts, 'or')} (your choice)${where}${eachText(c)}`
  }
  const kindOf = (id: string) => id.slice(0, id.indexOf(':'))
  const lower = (id: string) => name(id).toLowerCase()
  const spanOf = (t: N) => `${value(t.amount)} ${t.unit}${t.amount === 1 ? '' : 's'}`
  // When a recovery happens: on a trigger, or a set time after a use
  const regained = (r: N) => (r.after ? `${spanOf(r.after)} after a use` : trigger(anyRest(r.on)).when)
  // How often something can be used: "once per long rest"
  const per = (u: N): string => {
    const r = u.recover?.length === 1 ? u.recover[0].on : undefined
    if (u.recover?.length === 1 && u.recover[0].after) return `${u.max === 1 ? 'once' : `${value(u.max)} times`}, and can't again until ${spanOf(u.recover[0].after)} after a use`
    const rest = r?.match?.rest === 'rest:long' ? 'long rest' : r?.match?.rest === 'rest:short' ? 'short or long rest' : undefined
    const times = u.max === 1 ? 'once' : u.max === 2 ? 'twice' : `${value(u.max)} times`
    if (rest) return `${times} per ${rest}`
    // Once per turn: "once per turn", not "regaining the uses at the start of each turn"
    if (u.recover?.length === 1 && r?.event === 'event:turn-start' && typeof r.subject === 'object' && r.subject.pool === 'any') return `${times} per turn`
    if (u.recover?.length === 1 && r?.event === 'event:spell-cast' && r.by === 'self' && !r.when) return `${times} per spell you cast`
    return u.recover?.length ? `${times}, regaining the uses ${list(u.recover.map(regained), 'or')}` : times
  }
  const abilityName = (a: N) => (typeof a === 'object' && 'chosen' in a ? `the ${humanize(a.chosen)} you chose` : typeof a === 'object' && 'choose' in a ? chooseNoun(a.choose) : asArray(a).map(name).join(' or '))
  // The fields a {spell: {kind, where: {match}}} test matches, if it is one
  const spellMatch = (x: N) => (x.spell?.kind === 'spell' && x.spell.where && 'match' in x.spell.where ? x.spell.where.match : undefined)
  // A spell filter's fields as a noun: "1st-level divination or enchantment spell from the Wizard spell list"
  const SPELL_FIELDS = ['level', 'school', 'lists', 'ritual', 'components']
  const spellNoun = (w: N, many: boolean): string | undefined => {
    const all = w && 'all' in w ? w.all : w ? [w] : []
    // "not with a component" reads as a qualifier: "whose material components cost nothing"
    const without = all.filter((x: N) => plain(x.not?.match?.components) && Object.keys(x.not).length === 1)
    const parts = all.filter((x: N) => !without.includes(x))
    if (!parts.length || !parts.every((x: N) => 'match' in x)) return undefined
    const lacks = without.map((x: N) => x.not.match.components).map((c: N) => c.material?.parts ? ' whose material components cost nothing'
      : ` without a ${list(Object.keys(c), 'or')} component`).join('')
    const m = Object.assign({}, ...parts.map((x: N) => x.match))
    if (!Object.keys(m).every((k) => SPELL_FIELDS.includes(k))) return undefined
    const lv = typeof m.level === 'number' ? { atLeast: m.level, atMost: m.level } : m.level, sc = m.school, li = m.lists, rit = m.ritual
    const ord = (n: number) => `${n}${n === 1 ? 'st' : n === 2 ? 'nd' : n === 3 ? 'rd' : 'th'}-level`
    const level = !lv || (lv.atLeast === 0 && lv.atMost === undefined) ? '' : lv.atMost === 0 ? 'cantrip' : lv.atLeast === lv.atMost ? `${ord(lv.atLeast)} ` : lv.atLeast !== undefined && lv.atMost === undefined ? `${ord(lv.atLeast)} or higher ` : ''
    const noun = level === 'cantrip' ? (many ? 'cantrips' : 'cantrip') : `${level}${sc ? `${list(asArray(sc).map(lower), 'or')} ` : ''}${rit ? 'ritual ' : ''}${many ? 'spells' : 'spell'}`
    const from = !li ? '' : li === true ? ' from any class\'s spell list' : asArray(li).some((c: N) => typeof c === 'object' && 'choose' in c) ? ` from the spell list of ${asArray(li).map(name).join(' or ')}`
      : ` from the ${list(asArray(li).map((c: N) => (typeof c === 'object' ? 'chosen class\'s' : name(c))), 'or')} spell list`
    const comps = m.components ? ` with a ${list(Object.keys(m.components), 'or')} component` : ''
    return `${level === 'cantrip' && sc ? `${list(asArray(sc).map(lower), 'or')} ` : ''}${noun}${from}${comps}${lacks}`
  }
  // A field match in plain words, where no wording above fits: "its weapon properties is Finesse or Light"
  const matchText = (m: N, not = false): string => {
    const out: string[] = []
    const fields = (o: N, at: string[]) => {
      for (const [k, v] of Object.entries(o)) {
        const path = [...at, humanize(k)]
        if (v && typeof v === 'object' && !Array.isArray(v) && !['chosen', 'choose', 'atLeast', 'atMost'].some((x) => x in v)) { fields(v, path); continue }
        const said = v === true ? 'set' : v && typeof v === 'object' && !Array.isArray(v) ? ('atLeast' in v || 'atMost' in v ? compare(v) : name(v))
          : list(asArray(v).map((x: N) => (typeof x === 'string' && x.includes(':') ? name(x) : String(x))), 'or')
        out.push(`its ${path.join(' ')} ${not ? 'isn\'t' : 'is'} ${said}`)
      }
    }
    fields(m, [])
    return list(out)
  }
  // A patch body read generically, for changes the change wording doesn't know: "its delivery attack reach increases by 5".
  // A keyed element (an activity, a resource effect) is read in place: the line already names what changes.
  const patchText = (set: N): string => {
    const out: string[] = []
    // A patch's string is a path only if it has a dot: "up" and "self" are words here.
    const say = (x: N): string => typeof x === 'string' && x.includes('.') && readOf(x) ? value(x) : typeof x === 'string' && x.includes(':') ? name(x) : typeof x === 'object' ? (x && 'amount' in x && 'unit' in x ? `${value(x.amount)} ${x.unit}s` : x && 'kind' in x ? pickNoun(x, true) : value(x)) : String(x)
    const OUTCOME = ['runs', 'damage', 'then', 'tempHp', 'heal', 'applyState', 'choose']
    // A list element by its shape: a cost, a choice, an effect, an outcome
    const piece = (x: N): string => !x || typeof x !== 'object' ? say(x)
      : 'resource' in x && Object.keys(x).every((k) => k === 'resource' || k === 'amount') ? (x.amount !== undefined ? `${value(x.amount)} ${humanize(x.resource)}` : costNoun(x.resource))
      : 'choose' in x && Object.keys(x).length === 1 && x.choose.from.some((o: N) => o?.of?.some((y: N) => OUTCOME.some((k) => k in y)))
        ? `${x.choose.optional ? 'optionally, ' : ''}${list(x.choose.from.map((o: N) => o.of ? `${o.name}: ${list(o.of.map(piece))}` : piece(o)), 'or')}`
      : 'choose' in x ? chooseNoun(x.choose)
      : 'who' in x && 'count' in x ? `${x.count === 1 ? who(x.who) : `${typeof x.count === 'number' ? countText(x.count) : value(x.count)} ${who(x.who, true)}`}${x.also ? `, and also ${piece(x.also)}` : ''}`
      : typeof x.type === 'string' ? uncap(effect(x)).replace(/\.$/, '')
      : OUTCOME.some((k) => k in x) ? outcome(x, roleSubject('self'))
      : say(x)
    const fields = (o: N, at: string[]) => {
      for (const [k, v] of Object.entries(o)) {
        if (k === '$where') continue
        const path = [...at, humanize(k)], its = `its ${path.join(' ')}`
        const replaced = plain(v) && '$replace' in v ? v.$replace : v
        const added = plain(v) ? v.$append ?? v.$prepend : undefined
        if ((k === 'activities' || k === 'effects') && plain(v) && !Object.keys(v).some((x) => x.startsWith('$') && x !== '$where')) {
          if ('$where' in v) fields(v, [])
          else for (const sub of Object.values(v)) if (plain(sub)) fields(sub, [])
        }
        else if (k === 'recover' && Array.isArray(replaced))
          out.push(`its uses come back ${list(replaced.map((r: N) => `${r.amount === 'all' ? '' : `${value(r.amount)} at a time `}${trigger(anyRest(r.on)).when}`), 'or')}`)
        else if (k === 'ends' && Array.isArray(replaced))
          out.push(replaced.length ? `it ends only ${list(replaced.map((t: N) => trigger(t).when), 'or')}` : "it doesn't end early")
        else if (k === 'when' && plain(v) && !Object.keys(v).some((x) => x.startsWith('$'))) out.push(`it works only while ${clause(v)}`)
        else if (Array.isArray(replaced) && !replaced.length) out.push(`it has no ${path.join(' ')}`)
        else if (k === 'outcomes' && Array.isArray(replaced)) out.push(`instead it does this: ${list(replaced.map(piece))}`)
        else if (Array.isArray(replaced)) out.push(`${its} becomes ${list(replaced.map(piece))}`)
        else if (!plain(v)) out.push(`${its} becomes ${say(v)}`)
        else if ('$replace' in v) out.push(`${its} becomes ${piece(v.$replace)}`)
        else if ('$add' in v) out.push(`${its} increases by ${say(v.$add)}`)
        else if ('$multiply' in v) out.push(`${its} is multiplied by ${v.$multiply}`)
        else if ('$base' in v) out.push(`${its} starts at ${say(v.$base)}`)
        else if ('$atLeast' in v) out.push(`${its} is at least ${say(v.$atLeast)}`)
        else if ('$atMost' in v) out.push(`${its} is at most ${say(v.$atMost)}`)
        else if ('$delete' in v) out.push(`it has no ${path.join(' ')}`)
        else if (k === 'outcomes' && added) out.push(`it also does this: ${list(added.map(piece))}`)
        else if (k === 'effects' && added) out.push(`it also has this effect: ${list(added.map(piece))}`)
        else if (k === 'cost' && added) out.push(`it also costs ${list(added.map(piece))}`)
        else if (added) out.push(`${list(added.map(piece))} ${added.length === 1 ? 'is' : 'are'} added to ${its}`)
        else if ('$remove' in v) out.push(`${its} lose any ${matchText(v.$remove).replace(/^its /, '')}`)
        else fields(v, path)
      }
    }
    fields(set, [])
    return list([...new Set(out)])
  }
  // An item filter's parts the item wording knows: a group, weapon properties, one-handed, proficiency.
  const propsOf = (x: N) => x.match && Object.keys(x.match).length === 1 && x.match.weapon && Object.keys(x.match.weapon).length === 1 ? x.match.weapon.properties : undefined
  const oneHanded = (x: N) => x.not && propsOf(x.not) === 'weapon-property:two-handed'
  const damageTypeOf = (x: N) => x.match && Object.keys(x.match).length === 1 && x.match.weapon?.damage && Object.keys(x.match.weapon).length === 1 ? x.match.weapon.damage.type : undefined
  const itemPart = (x: N) => ('group' in x && Object.keys(x).length === 1) || propsOf(x) || oneHanded(x) || damageTypeOf(x) || x.proficient === 'candidate'
  // An item filter as a noun: "martial weapons that have the Light property", "a one-handed melee weapon"
  const itemNoun = (p: N, many: boolean): string => {
    const parts: N[] = !p.where ? [] : 'all' in p.where ? p.where.all : [p.where]
    const group = parts.find((x) => 'group' in x)?.group, props = parts.map(propsOf).find(Boolean), deals = parts.map(damageTypeOf).find(Boolean)
    const head = group ? list(asArray(group).map((g: string) => (many ? plural(lower(g)) : lower(g))), 'or') : parts.some(oneHanded) || props ? (many ? 'weapons' : 'weapon') : many ? 'items' : 'item'
    // Without a group, the property reads as an adjective: "a Finesse weapon"
    const adjective = !group && props ? `${list(asArray(props).map(name), 'or')} ` : ''
    return `${parts.some(oneHanded) ? 'one-handed ' : ''}${adjective}${head}${group && props ? ` that ${many ? 'have' : 'has'} the ${list(asArray(props).map(name), 'or')} property` : ''}${deals ? ` that ${many ? 'deal' : 'deals'} ${list(asArray(deals).map(lower), 'or')} damage` : ''}${parts.some((x) => x.proficient === 'candidate') ? ' you are proficient with' : ''}`
  }
  // An item or group as a plural noun
  const items = (x: N): string => typeof x === 'string' ? plural(lower(x)) : itemNoun(x, true)
  // "climb" for movement-mode:climb, whose name may be "Climbing"
  const modeNoun = (id: string) => id.slice(id.indexOf(':') + 1)

  // Whose perspective a phrase is in. Inside an applied state, `self` is the
  // state's holder and `source` is whoever applied it.
  let ctx: Record<string, Subject> = {}
  // Inside {creature, where}, the creature being described; explicit roles still mean the holder.
  let outerSelf: Subject | undefined
  const roleSubject = (role: string): Subject =>
    ctx[role] ?? ({ self: YOU, target: third('the target'), source: third('its source'), actor: third('that creature'), subject: third('that creature'), this: third('this item') } as Record<string, Subject>)[role] ?? third('it')
  // Plural "they", conjugated like "you": "they have", "they are"
  const THEY: Subject = { s: 'they', poss: 'their', obj: 'them', you: true }
  // A test about another creature, where `self` in the test still means the holder
  function about<T>(subject: Subject, f: () => T): T {
    const saved = outerSelf
    outerSelf ??= roleSubject('self')
    try { return within({ self: subject }, f) } finally { outerSelf = saved }
  }
  function within<T>(next: Record<string, Subject>, f: () => T): T {
    const saved = ctx
    ctx = { ...ctx, ...next }
    try { return f() } finally { ctx = saved }
  }

  function value(v: N): string {
    if (typeof v === 'number') return String(v)
    if (readOf(v)) return pathWords(v)
    if (typeof v === 'string') return v
    if (!v || typeof v !== 'object') return '[value]'
    if ('if' in v) return `${value(v.then)} if ${clause(v.if)}, or else ${value(v.else)}`
    // What a roll, use, or outcome came to, and a field of what is being used
    if ('settled' in v) return `its ${humanize(v.settled)}`
    if ('stored' in v) return `its ${humanize(String(v.stored).split('.').pop() ?? '')}`
    const me = roleSubject('self')
    const of = v.of === 'self' && outerSelf ? outerSelf : v.of && typeof v.of === 'string' && !v.of.includes(':') ? roleSubject(v.of) : me
    if ('table' in v) return v.column ? `the ${humanize(v.column)} column of ${name(v.table)}` : `a roll on ${name(v.table)}`
    if ('byLevel' in v) {
      const steps = Object.entries(v.byLevel as Record<string, N>).sort(([a], [b]) => +a - +b)
      const at = v.of ? `${name(v.of).toLowerCase()} level` : 'level'
      return list(steps.map(([lv, x], i) => `${value(x)} at ${i ? '' : `${at} `}${lv}`))
    }
    if ('slotLevel' in v) return 'the spell\'s level'
    if ('dice' in v && typeof v.dice.count === 'object' && 'min' in v.dice.count) {
      const [capN, per] = v.dice.count.min
      if (per?.divide?.event === 'distance') return `1d${value(v.dice.die)} for every ${per.by} feet fallen, up to ${capN}d${value(v.dice.die)}`
    }
    if ('dice' in v && typeof v.dice.count === 'object' && 'chosen' in v.dice.count) return `a roll of the ${humanize(v.dice.count.chosen)} you chose, as d${value(v.dice.die)}s`
    if ('dice' in v) return `${typeof v.dice.count === 'number' ? v.dice.count : `(${value(v.dice.count)})`}d${value(v.dice.die)}${v.dice.plus !== undefined ? ` + ${value(v.dice.plus)}` : ''}`
    if ('stackLevel' in v) return `${of.poss} ${name(v.stackLevel)} level`
    if ('pool' in v && v.facet === 'spent') return v.pool === 'hit-dice' ? 'the total rolled on the Hit Dice you spent' : `the number on the ${singular(v.pool)} spent`
    if ('event' in v) return ({ excess: 'the damage left over', amount: 'the damage' } as Record<string, string>)[v.event] ?? `the event's ${humanize(v.event)}`
    if ('speed' in v) return 'the speed you are using'
    // One value worked out for every entry its `*` path reads
    for (const [k, word] of [['sum', 'the total'], ['max', 'the highest'], ['min', 'the lowest']])
      if (k in v && !Array.isArray(v[k])) return `${word}, over each entry, of ${value(v[k])}`
    if ('sum' in v) return v.sum.map(value).join(' + ')
    if ('max' in v) return `the higher of ${list(v.max.map(value))}`
    if ('min' in v) return `the lower of ${list(v.min.map(value))}`
    if ('times' in v) return v.by === 2 ? `twice ${value(v.times)}` : v.by === 0.5 ? `half ${value(v.times)}` : `${value(v.times)} times ${value(v.by)}`
    if ('divide' in v) return `${v.by === 2 ? 'half' : `1/${v.by} of`} ${value(v.divide)}${v.round === 'down' ? ' (rounded down)' : v.round === 'up' ? ' (rounded up)' : ''}`
    if ('result' in v) return `the ${humanize(v.result)}`
    if ('weapon' in v) return v.weapon === 'die' ? `one of the weapon's damage dice` : `the weapon's damage`
    if ('chosen' in v) return `the chosen ${humanize(v.chosen)}`
    if ('count' in v) return `the number of ${who(v.count, true)}`
    if ('choose' in v) {
      // "a number of your choice from 1 to your Charisma modifier"
      const r = v.choose.from.length === 1 && typeof v.choose.from[0] === 'object' && 'atLeast' in v.choose.from[0] ? v.choose.from[0] : undefined
      return r ? `a number of your choice from ${value(r.atLeast)}${r.atMost !== undefined ? ` to ${value(r.atMost)}` : ' up'}` : `${list(v.choose.from.map((x: N) => typeof x === 'string' && x.includes(':') && !readOf(x) ? name(x) : value(x)), 'or')} (your choice)`
    }
    if ('value' in v) return `the ${humanize(v.value)}`
    return `[${Object.keys(v)[0]}]`
  }

  // A field read by its path, as a noun phrase: "the target's hit point maximum". A path
  // with no role reads the creature in question, which `within` binds to self.
  function pathWords(v: string): string {
    const { role, segs } = readOf(v)!
    const of = role === 'self' && outerSelf ? outerSelf : role && role !== 'candidate' ? roleSubject(role) : roleSubject('self')
    const [field, a, b] = segs
    if (field === 'modifiers' && a) return `${of.poss} ${name(a)} modifier`
    if (field === 'abilities' && a) return `${of.poss} ${name(a)} score`
    if (field === 'proficiencyBonus') return `${of.poss} proficiency bonus`
    if (field === 'levels' && a) return a === 'total' ? `${of.poss} level` : `${of.poss} ${name(a)} level`
    if (field === 'spellcasting') return `${of.poss} ${{ dc: 'spell save DC', attack: 'spell attack bonus', mod: 'spellcasting ability modifier' }[segs.at(-1)!] ?? `spellcasting ${humanize(segs.at(-1)!)}`}`
    if (field === 'hp' && a) return a === 'max' ? `${of.poss} hit point maximum` : `${of.poss} hit points`
    if (field === 'cr') return `${of.poss} challenge rating`
    if (field === 'reach') return `${of.poss} reach`
    if (field === 'standings' && a) return `${of.poss} ${name(a)}`
    if (field === 'spent' && a) return `the number of ${humanize(a)} uses ${of.you ? 'you have' : `${of.s} has`} spent`
    if (field === 'pools' && a) return b === 'current' ? `${of.poss} ${humanize(a)}` : `${of.poss} ${humanize(a)} (${b})`
    if (field === 'speeds' && a) return a.startsWith('{') ? `${of.poss} chosen speed` : a === 'movement-mode:walk' ? `${of.poss} speed` : `${of.poss} ${lower(a)} speed`
    if (field === 'senses' && a) return `${of.poss} ${lower(a)} range`
    return `${of.poss} ${segs.map((x) => (x.startsWith('{') ? `chosen ${humanize(x.slice(1, -1))}` : x.includes(':') ? lower(x) : humanize(x))).join(' ')}`
  }

  // A distance: "5 feet", or "the grappler's reach".
  const isReach = (v: N) => readOf(v)?.segs.at(-1) === 'reach'
  // A speed is already a distance: "half your speed", not "half your speed feet".
  const distance = (v: N) => (isReach(v) || /"speed"|speeds\./.test(JSON.stringify(v ?? 0)) ? value(v) : `${value(v)} feet`)

  // A pool of creatures, as a noun phrase: "an enemy within 5 feet of you".
  function who(w: N, plural = false): string {
    if (typeof w === 'string') return roleSubject(w).s
    const nouns: Record<string, [string, string]> = {
      any: ['a creature', 'creatures'], enemy: ['an enemy', 'enemies'], ally: ['an ally', 'allies'], object: ['an object', 'objects'],
    }
    let noun = nouns[w.pool]?.[plural ? 1 : 0] ?? '[who]'
    if (w.of && w.of !== 'self') {
      const of = roleSubject(w.of)
      noun += of.you ? ' of yours' : ` of ${of.s}`
    }
    if (w.chosen === true) noun += ' of your choice'
    return w.where ? `${noun} ${relative(w.where, plural)}` : noun
  }

  const sees = (p: N) => (p.sense === 'hearing' ? 'hear' : p.sense === 'any' ? 'see or hear' : 'see')

  // A clause about the candidate as a relative clause: "it has" → "that has", "its level" → "whose level"
  const thatClause = (t: string) => /^(its|their) /.test(t) ? t.replace(/^(its|their) /, 'whose ') : `that ${t.replace(/^(it|they) /, '')}`
  // A predicate as a relative clause about a candidate creature: "that you can see".
  function relative(p: N, plural = false): string {
    const is = plural ? 'are' : 'is', has = plural ? 'have' : 'has', cant = 'can\'t'
    if ('all' in p) return list(p.all.map((x: N) => relative(x, plural)))
    if ('any' in p) return list(p.any.map((x: N) => relative(x, plural)), 'or')
    if ('not' in p) {
      const q = p.not
      if ('perceived' in q) return `that ${roleSubject(q.by ?? 'self').s} ${cant} see`
      if ('perceives' in q) return `that ${cant} ${sees(q.perceives)} ${roleSubject(q.perceives.of ?? 'self').obj}`
      if ('within' in q) return `farther than ${distance(q.within)} from ${q.of ? who(q.of) : roleSubject('self').obj}`
      if ('is' in q) return `other than ${q.is === 'self' && outerSelf ? outerSelf.obj : roleSubject(q.is).s}`
      if ('has' in q && isState(q.has)) return `that ${plural ? 'don\'t' : 'doesn\'t'} have ${stateName(q.has)}`
      // An item with a rarity is a magic item: "a nonmagical object"
      if ('match' in q && Object.keys(q.match).length === 1 && q.match.rarity === true) return `that ${is}n't magical`
      if ('match' in q) return thatClause(matchText(q.match, true))
      const pool = readOf(q.compare)?.segs[0] === 'pools' ? readOf(q.compare)!.segs[1] : undefined
      if ('compare' in q && !(pool && q.atLeast === 1 && q.atMost === undefined)) return thatClause(about(plural ? THEY : third('it'), () => clause(p)))
      if (pool && q.atLeast === 1 && q.atMost === undefined) return `that ${plural ? 'don\'t' : 'doesn\'t'} have ${humanize(pool)}`
      return `that ${is}n't ${relative(q, plural).replace(/^that (is|are) /, '')}`
    }
    if ('perceived' in p) return `that ${roleSubject(p.by ?? 'self').s} can see`
    if ('perceives' in p) return `that can ${sees(p.perceives)} ${roleSubject(p.perceives.of ?? 'self').obj}`
    if ('within' in p) return isReach(p.within) ? `within ${distance(p.within)}` : `within ${distance(p.within)} of ${p.of ? who(p.of) : roleSubject('self').obj}`
    if ('willing' in p) return p.willing ? `that ${is} willing` : `that ${is}n't willing`
    if ('trait' in p && TRAITS[p.trait]) return `that ${TRAITS[p.trait](third('it')).replace(/^it (is|has) /, (_m, v) => `${plural ? { is: 'are', has: 'have' }[v as 'is' | 'has'] : v} `)}`
    if ('hostile' in p) return p.hostile ? `that ${is} hostile` : `that ${is}n't hostile`
    if ('has' in p && isState(p.has)) {
      if (p.source === 'self' && p.has.startsWith('condition:grappled')) return `that ${roleSubject('self').s} ${roleSubject('self').you ? 'are' : 'is'} grappling`
      return p.source === 'self' ? `that ${has} ${stateName(p.has)} from ${roleSubject('self').obj}` : `that ${has} ${stateName(p.has)}`
    }
    if ('size' in p) return `that ${is} ${sizeBound(p.size)}`
    if ('group' in p && typeof p.group !== 'object' || Array.isArray(p.group))
      return `that ${is} ${list(asArray(p.group).map((g: string) => `${/^[aeiou]/i.test(name(g)) ? 'an' : 'a'} ${lower(g)}`), 'or')}`
    if ('creatureType' in p || 'creatureTag' in p) return `that ${is} ${list(asArray(p.creatureType ?? p.creatureTag).map((t: string) => `${/^[aeiou]/i.test(name(t)) ? 'an' : 'a'} ${name(t)}`), 'or')}`
    if ('kind' in p) return `that ${is} ${plural ? `${p.kind}s` : `a ${p.kind}`}`
    // A number of the creature being considered: "that has half of its hit points or fewer"
    if ('compare' in p) return thatClause(about(plural ? THEY : third('it'), () => compareClause(p)))
    if ('is' in p && typeof p.is === 'string' && !p.is.includes(':')) return `that ${is} ${roleSubject(p.is).s}`
    if ('sense' in p) return `that ${has} ${lower(p.sense)}`
    if ('proficient' in p && p.proficient === 'candidate') return 'that you are proficient in'
    if ('defense' in p) return `that ${is} ${defenseWords(p.defense)}`
    if ('grantedBy' in p) return `that ${p.grantedBy === 'this' ? 'this feature' : name(p.grantedBy)} gave you`
    // "objects that you are attuned to": an item atom about another creature, with the candidate as its item
    if ('creature' in p && 'where' in p && JSON.stringify(p.where).includes('"candidate"')) return `that ${clause(p).replace(/ (it|candidate)$/, '')}`
    if ('speed' in p && p.speed === 'candidate') return 'that you have'
    return `that ${clause(p)}`
  }

  // "no more than one size larger than you", "two or more sizes smaller than the grappler"
  function sizeBound(s: N): string {
    if (typeof s === 'string') return name(s)
    if (Array.isArray(s)) return list(s.map(name), 'or')
    const bound = s.atMost ?? s.atLeast
    if (typeof bound === 'object') {
      const steps = bound.steps ?? 0
      const of = roleSubject(bound.of).obj
      if (s.atMost && steps > 0) return `no more than ${NUMBERS[steps]} size${steps > 1 ? 's' : ''} larger than ${of}`
      if (s.atLeast && steps > 0) return `at least ${NUMBERS[steps]} size${steps > 1 ? 's' : ''} larger than ${of}`
      if (s.atMost && steps < 0) return `${NUMBERS[-steps]} or more sizes smaller than ${of}`
      if (s.atMost && steps === 0) return `${of === 'you' ? 'your' : `${of}'s`} size or smaller`
    }
    if (typeof s.atMost === 'string' && s.atLeast === undefined) return `${name(s.atMost)} or smaller`
    if (typeof s.atLeast === 'string' && s.atMost === undefined) return `${name(s.atLeast)} or larger`
    if (typeof s.atLeast === 'string' && typeof s.atMost === 'string') return `${name(s.atLeast)} to ${name(s.atMost)}`
    return '[size]'
  }

  // A state read as an adjective ("you are raging") rather than a thing you have ("you have Wild Shape").
  const adjState = (id: string) => kindOf(id) === 'state' && /^\w+(ing|ed)$|^stable$/i.test(name(id))
  const stateName = (id: string) => kindOf(id) === 'condition' ? `the ${name(id)} condition` : name(id)
  const isState = (id: unknown) => typeof id === 'string' && ['state', 'condition'].includes(kindOf(id))

  // The predicate atoms that test the activity being used.
  const ACTIVITY = ['activity', 'spell', 'prepared', 'spends', 'dealsDamage', 'delivery']

  // A predicate as a clause about the holder: "you are within 5 feet of it".
  // "immune to the Blinded condition", "resistant to fire damage"
  const defenseWords = (d: N) => list((['immune', 'resist', 'vulnerable'] as const).filter((k) => d[k])
    .map((k) => `${{ immune: 'immune', resist: 'resistant', vulnerable: 'vulnerable' }[k]} to ${list(asArray(d[k]).map(name), 'or')}`))

  function clause(p: N): string {
    const h = roleSubject('self')
    const parts = 'all' in p ? p.all : [p]
    // "deals fire damage" alone is about the attack or effect at hand; with a spell atom it qualifies spells
    if (parts.every((x: N) => ACTIVITY.some((k) => k in x)) && parts.some((x: N) => !['spends', 'dealsDamage', 'delivery'].some((k) => k in x)))
      return `${h.s} ${verb(h, parts.some((x: N) => 'activity' in x) ? 'use' : 'cast')} ${activityNoun(p)}`
    if ('all' in p) return list(p.all.map(clause))
    if ('any' in p) return list(p.any.map(clause), 'or')
    if ('not' in p) {
      const q = p.not
      if ('has' in q && isState(q.has)) return adjState(q.has) ? `${h.s} ${h.you ? 'aren\'t' : 'isn\'t'} ${lower(q.has)}` : `${h.s} ${h.you ? 'don\'t' : 'doesn\'t'} have ${stateName(q.has)}`
      if ('has' in q && q.has === 'candidate') return `${h.s} ${h.you ? 'don\'t' : 'doesn\'t'} already have it`
      if ('has' in q && typeof q.has === 'string' && kindOf(q.has) === 'group' && !q.chosen) return `${h.s} ${h.you ? 'don\'t' : 'doesn\'t'} have ${/^[aeiou]/i.test(name(q.has)) ? 'an' : 'a'} ${name(q.has)}`
      if ('against' in q) return `it isn't against ${againstNoun(q.against)}`
      if ('defense' in q) return `${h.s} ${h.you ? 'aren\'t' : 'isn\'t'} ${defenseWords(q.defense)}`
      if ('match' in q) return matchText(q.match, true)
      if ('is' in q) return `it isn't ${typeof q.is === 'object' ? `the ${humanize(q.is.chosen)} you chose` : name(q.is)}`
      if ('proficient' in q && q.level === 'expertise') return `${h.s} ${h.you ? 'don\'t' : 'doesn\'t'} have expertise in ${q.proficient === 'candidate' ? 'it' : name(q.proficient)}`
      if ('proficient' in q) return `${h.s} ${h.you ? 'aren\'t' : 'isn\'t'} proficient in ${q.proficient === 'candidate' ? 'it' : name(q.proficient)}`
      if ('trait' in q && q.trait === 'monster') return `${h.s} ${h.you ? 'aren\'t' : 'isn\'t'} a monster`
      if ('size' in q) return `${h.s} ${h.you ? 'aren\'t' : 'isn\'t'} ${sizeBound(q.size)}`
      if ('moved' in q) return `${h.s} ${h.you ? 'haven\'t' : 'hasn\'t'} moved this turn`
      if (['wearing', 'wielding', 'holding', 'equipped', 'carrying'].some((k) => k in q)) return clause(q).replace(/^(you|it) (have equipped|has equipped|\w+)/, (_m, w, v) => `${w} ${w === 'you' ? 'aren\'t' : 'isn\'t'} ${({ wear: 'wearing', wears: 'wearing', wield: 'wielding', wields: 'wielding', hold: 'holding', holds: 'holding', carry: 'carrying', carries: 'carrying', 'have equipped': 'using', 'has equipped': 'using' } as Record<string, string>)[v] ?? v}`)
      if ('creatureType' in q) return `${h.you ? 'it' : h.s} isn't ${list(asArray(q.creatureType).map((t: string) => `${/^[aeiou]/i.test(name(t)) ? 'an' : 'a'} ${name(t)}`), 'or')}`
      if ('within' in q) return isReach(q.within) ? `${h.s} ${be(h)} out of ${distance(q.within)}` : `${h.s} ${be(h)} farther than ${distance(q.within)} from ${q.of ? who(q.of) : 'it'}`
      if ('natural' in q) return `the d20 doesn't show ${q.natural}`
      if ('mode' in q) return `${h.s} ${h.you ? 'don\'t' : 'doesn\'t'} have ${q.mode} on the roll`
      if (readOf(q.compare)?.field === 'cr' && q.atLeast !== undefined && q.atMost === undefined) return `${h.poss} challenge rating is lower than ${value(q.atLeast)}`
      if ('speed' in q && q.hover) return `${h.s} can't hover`
      if ('speed' in q) return `${h.s} ${h.you ? 'don\'t' : 'doesn\'t'} have a ${modeNoun(q.speed)} speed`
      if ('any' in q && q.any.every((x: N) => x.attack?.item)) return `the weapon isn't a ${list(q.any.map((x: N) => lower(x.attack.item)), 'or')}`
      if ('any' in q && q.any.every((x: N) => 'happened' in x)) return `${h.s} ${h.you ? 'haven\'t' : 'hasn\'t'} ${list(q.any.map((x: N) => happened(x.happened).replace(/^you have /, '')), 'or')} ${since(q.any[0].happened.since)}`
      if ('dealsDamage' in q) return `the weapon doesn't deal ${list(asArray(q.dealsDamage).map(name), 'or')} damage`
      if ('trait' in q && q.trait === 'beyond-normal-range') return 'the target is within normal range'
      if (readOf(q.compare)?.field === 'hp.current' && hpFraction(q.atLeast ?? q.atMost)) return q.atLeast !== undefined
        ? `${h.s} ${verb(h, 'have')} fewer than ${hpFraction(q.atLeast)} of ${h.poss} hit points`
        : `${h.s} ${verb(h, 'have')} more than ${hpFraction(q.atMost)} of ${h.poss} hit points`
      if (readOf(q.compare)?.field === 'hp.current' && readOf(q.atLeast)?.field === 'hp.max' && q.atMost === undefined) return `${h.s} ${verb(h, 'have')} fewer hit points than ${h.poss} hit point maximum`
      if ('any' in q) return `neither ${list(q.any.map(clause), 'nor')}`
      return `not (${clause(q)})`
    }
    if ('trait' in p) return TRAITS[p.trait]?.(h) ?? `[${humanize(p.trait)}]`
    if ('match' in p) return matchText(p.match)
    if ('creature' in p && 'where' in p) { const saved = outerSelf; outerSelf = h; try { return within({ self: roleSubject(p.creature) }, () => clause(p.where)) } finally { outerSelf = saved } }
    if ('activity' in p) { const n = typeof p.activity === 'string' && p.activity.includes(':') ? singular(lower(p.activity)) : humanize(p.activity); return `it is ${/^[aeiou]/.test(n) ? 'an' : 'a'} ${n}` }
    if ('perceived' in p) { const by = (!p.by || p.by === 'self') && outerSelf ? outerSelf : roleSubject(p.by ?? 'self'); return `${by.s} can ${sees({ sense: p.perceived })} ${h.obj === by.obj && h.s === by.s ? (h.you ? 'yourself' : 'itself') : h.s}` }
    if ('attuned' in p) return `${h.s} ${be(h)} attuned to ${p.attuned === 'this' || p.attuned === 'candidate' ? 'it' : typeof p.attuned === 'string' ? name(p.attuned) : items(p.attuned)}`
    for (const k of ['wearing', 'wielding', 'holding', 'equipped', 'carrying']) if (k in p) {
      const thing = p[k] === 'this' ? 'it' : typeof p[k] === 'string' && kindOf(p[k]) === 'group' ? (/armor$/.test(p[k]) ? lower(p[k]) : `${/^[aeiou]/i.test(name(p[k])) ? 'an' : 'a'} ${singular(p[k].slice(6))}`) : typeof p[k] === 'string' ? name(p[k]) : items(p[k])
      const v = { wearing: 'wear', wielding: 'wield', holding: 'hold', equipped: 'have equipped', carrying: 'carry' }[k] as string
      return `${h.s} ${h.you ? v : v.replace(/^have/, 'has').replace(/^(\w+)(?<!has)$/, '$1s')} ${thing}`
    }
    if ('proficient' in p && p.proficient === 'candidate') return p.level === 'expertise' ? `${h.s} ${verb(h, 'have')} expertise in it` : `${h.s} ${be(h)} proficient in it`
    if ('proficient' in p && kindOf(p.proficient) === 'language') return `${h.s} already ${verb(h, 'know')} ${name(p.proficient)}`
    if ('proficient' in p && !p.level) return `${h.s} ${be(h)} proficient in ${name(p.proficient)}`
    if ('grantedBy' in p) return `${p.grantedBy === 'this' ? 'this feature' : name(p.grantedBy)} gave it to you`
    if ('is' in p) return `it is ${typeof p.is === 'object' ? `the ${humanize(p.is.chosen)} you chose` : name(p.is)}`
    if ('has' in p && isState(p.has)) return adjState(p.has) ? `${h.s} ${be(h)} ${lower(p.has)}` : `${h.s} ${verb(h, 'have')} ${stateName(p.has)}`
    if ('speed' in p && p.hover) return `${h.s} can hover`
    if ('speed' in p && p.speed === 'movement-mode:walk') return `${h.poss} speed isn't 0`
    if ('speed' in p) return `${h.s} ${verb(h, 'have')} a ${modeNoun(p.speed)} speed`
    if ('spellcaster' in p) return p.spellcaster ? `${h.s} can cast at least one spell` : `${h.s} can't cast spells`
    if ('has' in p && p.has === 'candidate') return `${h.s} already ${verb(h, 'have')} it`
    if ('has' in p && typeof p.has === 'string' && p.has !== 'candidate') {
      const k = kindOf(p.has)
      if (p.chosen) return `${h.s} ${verb(h, 'have')} ${name(p.has)} with ${list(Object.values(p.chosen).flat().map((v) => (String(v).includes(':') ? name(v as string) : cap(humanize(v as string)))))}`
      return k === 'species' ? `${h.s} ${be(h)} ${/^[aeiou]/i.test(name(p.has)) ? 'an' : 'a'} ${name(p.has)}`
        : k === 'group' ? `${h.s} ${verb(h, 'have')} ${/^[aeiou]/i.test(name(p.has)) ? 'an' : 'a'} ${name(p.has)}`
        : `${h.s} ${verb(h, 'have')} ${name(p.has)}`
    }
    if ('compare' in p) return compareClause(p)
    if ('natural' in p) return `the d20 shows ${typeof p.natural === 'number' ? p.natural : compare(p.natural)}`
    if ('mode' in p) return `${h.s} ${verb(h, 'have')} ${p.mode} on the roll`
    if ('spends' in p) return asArray(p.spends).every((k: string) => ECONOMY.includes(k)) ? `it has a casting time of ${list(asArray(p.spends).map(costNoun), 'or')}` : `${h.s} ${verb(h, 'spend')} ${list(asArray(p.spends).map(humanize), 'or')}`
    if ('action' in p) return `it is part of the ${list(asArray(p.action).map(name), 'or')} action`
    if ('kind' in p) return `it is ${p.kind === 'object' ? 'an object' : 'a creature'}`
    if ('result' in p) return { hit: 'it hits', miss: 'it misses', crit: 'it is a critical hit', failed: 'it fails', succeeded: 'it succeeds' }[p.result as string]
      + (p.margin ? ` by ${p.margin} or more` : '')
    if ('hostile' in p) return `${h.you ? 'it' : h.s} ${p.hostile ? 'is' : 'isn\'t'} hostile`
    if ('moved' in p) return `${h.s} ${h.you ? 'have' : 'has'} moved${p.moved.atLeast === 1 ? '' : ` at least ${value(p.moved.atLeast)} feet`}${p.moved.toward ? `${p.moved.straight ? ' straight' : ''} toward ${roleSubject(p.moved.toward).obj}` : ''} this turn`
    if ('cover' in p) return `${h.s} ${verb(h, 'have')} ${humanize(p.cover)} cover`
    if ('turn' in p) return p.turn === 'self' ? `it is ${h.poss} turn` : `it is ${roleSubject(p.turn).poss} turn`
    if ('within' in p) return isReach(p.within) ? `${h.s} ${be(h)} within ${distance(p.within)}` : `${h.s} ${be(h)} within ${distance(p.within)} of ${p.of ? who(p.of) : 'it'}`
    if ('perceives' in p) return `${h.s} can ${sees(p.perceives)} ${roleSubject(p.perceives.of ?? 'self').obj}`
    if ('attack' in p) return `it is ${attackNoun(p.attack, true)}`
    if ('happened' in p) {
      return `${happened(p.happened)} ${since(p.happened.since)}`
    }
    if ('dealsDamage' in p) return `it deals ${damageOf(p.dealsDamage)}`
    if ('roll' in p) return `it is ${rolls(p)}`
    if ('size' in p) return `${h.s} ${be(h)} ${sizeBound(p.size)}`
    if ('creatureType' in p || 'creatureTag' in p) return `${h.you ? 'it' : h.s} is ${list(asArray(p.creatureType ?? p.creatureTag).map((t: string) => `${/^[aeiou]/i.test(name(t)) ? 'an' : 'a'} ${name(t)}`), 'or')}`
    if ('against' in p) return `it is against ${againstNoun(p.against)}`
    if ('sense' in p) return `${h.s} ${verb(h, 'have')} ${lower(p.sense)}`
    if ('restricted' in p) return `${h.s} can't ${lower(p.restricted)}`
    if ('defense' in p) return `${h.s} ${be(h)} ${defenseWords(p.defense)}`
    if ('environment' in p) return `${h.s} ${be(h)} ${list(asArray(p.environment).map((x: string) => (x === 'environment:underwater' ? 'underwater' : `in ${lower(x)}`)), 'or')}`
    if ('grounded' in p) return p.grounded ? `${h.s} ${be(h)} on the ground` : `${h.s} ${be(h)} off the ground`
    return `[${Object.keys(p)[0]}]`
  }
  // "while …", or "unless …" for a negation.
  // "acid damage", "damage of the type of your Draconic Ancestry"
  const damageOf = (t: N) => typeof t === 'object' && !Array.isArray(t) && 'chosen' in t
    ? `damage of ${chosenNoun(t).replace(/damage type/, 'type')}` : t === true ? 'damage' : `${list(asArray(t).map(name), 'or')} damage`
  // What a roll or effect is against: "a spell", "being charmed or frightened", "magical damage", "it"
  const againstNoun = (a: N) => {
    const what = [
      ...asArray(a.sourceType).map((t: string) => (t === 'source-type:spell' ? 'a spell' : lower(t))),
      ...(a.condition ? [`being ${list(asArray(a.condition).map(lower), 'or')}`] : []),
      ...(a.damageType ? [`${list(asArray(a.damageType).map(name), 'or')} damage`] : []),
      ...(a.qualifier ? [`${list(asArray(a.qualifier).map(lower), 'or')} damage`] : []),
      ...(a.creatureType ? [list(asArray(a.creatureType).map((t: string) => plural(name(t))), 'or')] : []),
    ]
    const by = a.creature ? roleSubject(a.creature).obj : ''
    return what.length ? `${list(what, 'or')}${by ? ` from ${by}` : ''}` : by || '[against]'
  }
  const gateWord = (p: N) => ('against' in p && Object.keys(p).length === 1 ? ` against ${againstNoun(p.against)}` : 'not' in p && readOf(p.not.compare)?.segs[0] !== 'hp' ? ` unless ${clause(p.not)}` : 'trait' in p ? ` when ${clause(p)}` : 'happened' in p || 'natural' in p || 'not' in p ? ` if ${clause(p)}` : ` while ${clause(p)}`)

  const compare = (p: N) =>
    p.atLeast !== undefined && p.atMost !== undefined ? `between ${value(p.atLeast)} and ${value(p.atMost)}`
    : p.atLeast !== undefined ? (typeof p.atLeast === 'number' ? `${p.atLeast} or more` : `at least ${value(p.atLeast)}`)
    : `${typeof p.atMost === 'number' ? `${p.atMost} or less` : `at most ${value(p.atMost)}`}`

  // "half" for {times: {hp: "max"}, by: 0.5}, a fraction of the hit point maximum
  const hpFraction = (x: N) => (x?.times === 'hp.max' ? (x.by === 0.5 ? 'half' : String(x.by)) : undefined)
  // A compare as a clause about the creature it reads: "you are level 3 or higher", "your Cleric level is 3 or more",
  // "Strength 13 or higher", "it has half of its hit points or fewer"
  function compareClause(p: N): string {
    const v = p.compare, lo = p.atLeast, hi = p.atMost
    const r = readOf(v), role = r?.role, f = r?.field, [s0, s1, s2] = r?.segs ?? []
    const h = role === 'self' && outerSelf ? outerSelf : role && role !== 'candidate' ? roleSubject(role) : roleSubject('self')
    const onlyLo = lo !== undefined && hi === undefined, onlyHi = hi !== undefined && lo === undefined
    if (p.equals !== undefined) return s0 === 'masteries' && p.equals === true ? `${h.s} ${verb(h, 'have')} mastered the weapon` : `${within({ self: h }, () => value(v))} is ${p.equals === true ? 'set' : value(p.equals)}`
    if (f === 'levels.total' && !role && onlyLo) return lo === 1 ? `${h.s} ${verb(h, 'have')} a character level` : `${h.s} ${be(h)} level ${value(lo)} or higher`
    if (s0 === 'abilities' && !role && onlyLo) return `${name(s1)} ${value(lo)} or higher`
    if (f === 'hp.current' && onlyHi && hpFraction(hi)) return `${h.s} ${verb(h, 'have')} ${hpFraction(hi)} of ${h.poss} hit points or fewer`
    if (f === 'hp.current' && hi === 0 && lo === undefined) return `${h.s} ${verb(h, 'have')} 0 hit points`
    if (f === 'hp.current' && lo === 1 && hi === undefined) return `${h.s} ${verb(h, 'have')} at least 1 hit point`
    if (s0 === 'pools' && s2 === 'current' && lo === 1 && hi === undefined) return `${h.s} ${verb(h, 'have')} ${humanize(s1)}`
    if (s0 === 'speeds' && hi === 0 && lo === undefined) return `${s1 === 'movement-mode:walk' ? `${h.poss} speed` : `${h.poss} ${modeNoun(s1)} speed`} is 0`
    if (s0 === 'pools' && s2 === 'current') return `${h.poss} ${humanize(s1)} ${onlyHi ? (s1.endsWith('s') ? 'are' : 'is') : s1.endsWith('s') ? 'reach' : 'reaches'} ${compare(p)}`
    return `${within({ self: h }, () => value(v))} ${f === 'hp.current' ? 'are' : 'is'} ${compare(p)}`
  }


  // An attack as a head noun and what follows it: "melee weapon attack" + " with this weapon".
  function attackParts(a: N): [string, string] {
    const range = a.range === 'melee-or-ranged' ? 'melee or ranged' : a.range
    const head = a.via === 'unarmed' ? 'unarmed strike' : [range, a.via, 'attack'].filter(Boolean).join(' ')
    let tail = ''
    const held = a.hands ? ` held in ${a.hands === 2 ? 'two hands' : 'one hand'}` : ''
    const thing = a.item === 'this' ? 'this weapon' : typeof a.item === 'string' ? lower(a.item) : a.item ? itemNoun(a.item, false) : a.hands ? 'weapon' : ''
    if (thing) tail += ` with ${thing === 'this weapon' ? '' : /^(?!one)[aeiou]/i.test(thing) ? 'an ' : 'a '}${thing}${held}`
    if (a.ability) tail += ` using ${name(a.ability)}`
    return [head, tail]
  }
  function attackNoun(a: N, article = false): string {
    const s = attackParts(a).join('')
    return article ? `${/^[aeiou]/.test(s) ? 'an' : 'a'} ${s}` : s
  }
  // "melee weapon attack rolls with this weapon"
  const attackRolls = (a: N, one = false) => { const [head, tail] = attackParts(a); return `${head} roll${one ? '' : 's'}${tail}` }

  const ECONOMY = ['action', 'bonus-action', 'reaction']
  // A pool a filter picks: "a level 5 spell slot", "a spell slot of level 2 or higher".
  const poolNoun = (f: N): string => {
    const m = f.where?.match ?? {}, level = m.values?.level
    const noun = m.group === 'spell-slots' ? 'spell slot' : m.group ? humanize(m.group).replace(/s$/, '') : 'pool'
    return typeof level === 'number' ? `a level ${level} ${noun}` : level?.atLeast ? `a ${noun} of level ${level.atLeast} or higher` : `a ${noun}`
  }
  const costNoun = (k: N) => (k === 'action' ? 'an action' : k === 'bonus-action' ? 'a bonus action' : k === 'reaction' ? 'a reaction' : k === 'spell-slots' ? 'a spell slot' : typeof k === 'object' ? poolNoun(k) : humanize(k))
  // An activity filter as a noun phrase: "spells with a verbal component".
  function activityNoun(p: N): string {
    if ('not' in p) return `spells other than ${activityNoun(p.not)}`
    if ('spell' in p && typeof p.spell === 'object' && 'kind' in p.spell) {
      // A spell filter: its fields as a noun, or each part as an activity atom
      const w = p.spell.where
      if (w?.is?.chosen) return `the ${choiceName(w.is.chosen)} you chose`
      const sn = spellNoun(w, true)
      if (sn) return sn
      const atom = (x: N) => ('match' in x ? { spell: { kind: 'spell', where: x } } : x)
      if (!('all' in w) && 'match' in w) return '[spell]'
      return activityNoun('all' in w ? { all: w.all.map(atom) } : atom(w))
    }
    if ('spell' in p) return list(asArray(p.spell).map(name), 'or')
    if ('compare' in p && p.compare?.slotLevel) return `spells using a spell slot of ${compare(p).replace(/^(\d+) or more$/, (_m, n) => `level ${n} or higher`)}`
    if ('trait' in p) return `spells that ${humanize(p.trait).replace(/ in area$/, ' in its area')}`
    if ('all' in p && p.all.length === 2 && p.all.some((x: N) => spellMatch(x)?.level === 0) && p.all.some((x: N) => x.spends === 'action'))
      return 'cantrips with a casting time of an action'
    if ('all' in p && p.all.some((x: N) => spellMatch(x)?.ritual) && p.all.some((x: N) => 'prepared' in x)) return 'prepared spells with the Ritual tag'
    if ('all' in p) {
      // One activity of an entity, by its key: "Prone's stand up activity"
      const keyed = p.all.find((x: N) => Object.keys(x.match ?? {}).length === 1 && typeof x.match.key === 'string')
      const owner = p.all.find((x: N) => typeof x.activity === 'string')
      if (keyed && owner) {
        const rest = p.all.filter((x: N) => x !== keyed && x !== owner)
        return `${name(owner.activity)}'s ${humanize(keyed.match.key)} activity${rest.length ? ` ${activityNoun({ all: rest }).replace(/^spells /, '')}` : ''}`
      }
      // A head noun (an activity, an attack, or spells from spellNoun), then qualifiers: "cantrips that deal damage and call for a saving throw".
      const spellish = p.all.filter((x: N) => x.spell?.kind === 'spell' && spellNoun(x.spell.where, true))
      const isHead = (x: N) => ('activity' in x || 'attack' in x || 'spell' in x) && !spellish.includes(x)
      const head = p.all.find(isHead)
      const one = !!head && !('attack' in head)
      const quals = p.all.filter((x: N) => x !== head && !spellish.includes(x)).flatMap((x: N): string[] => {
        if ('spends' in x) {
          const ks = asArray(x.spends), econ = ks.filter((k: string) => ECONOMY.includes(k)), other = ks.filter((k: string) => !ECONOMY.includes(k))
          return [econ.length ? (head ? `with ${econ.map(costNoun).join(' or ')}` : `with a casting time of ${econ.map(costNoun).join(' or ')}`) : '',
            ...other.map((k: string) => (k === 'spell-slots' ? `that ${one ? 'expends' : 'expend'} a spell slot` : `spending ${humanize(k)}`))].filter(Boolean)
        }
        if ('dealsDamage' in x) return [activityNoun(x).replace(/^spells that deal/, one ? 'that deals' : 'that deal')]
        if ('delivery' in x) return [activityNoun(x).replace(/^spells that call/, one ? 'that calls' : 'that call')]
        if ('prepared' in x) return [activityNoun(x).replace(/^spells /, '')]
        if ('match' in x) return [`where ${matchText(x.match)}`]
        if ('not' in x && 'match' in x.not) return [`where ${matchText(x.not.match, true)}`]
        return [`[activity ${Object.keys(x)[0]}]`]
      })
      const noun = head ? activityNoun(head) : spellish.length ? spellNoun({ all: spellish.map((x: N) => x.spell.where).filter(Boolean) }, true)! : 'spells'
      return `${noun}${quals.length ? ` ${list(quals)}` : ''}`.replace(/ and that /g, ' and ').replace(/, that /g, ', ')
    }
    if ('prepared' in p) return 'spells you have prepared'
    if ('spends' in p) return asArray(p.spends).every((k: string) => ECONOMY.includes(k))
      ? `spells with a casting time of ${asArray(p.spends).map(costNoun).join(' or ')}` : `uses that spend ${list(asArray(p.spends).map(costNoun), 'or')}`
    if ('action' in p) return `the ${list(asArray(p.action).map(name), 'or')} action`
    if ('activity' in p) return p.activity.includes(':') ? name(p.activity) : humanize(p.activity).replace(/\b(?!(of|the|a|an|and)\b)\w/g, (c: string) => c.toUpperCase())
    if ('attack' in p) return plural(attackNoun(p.attack))
    if ('dealsDamage' in p) return p.dealsDamage === true ? 'spells that deal damage' : `spells that deal ${list(asArray(p.dealsDamage).map(lower), 'or')} damage`
    if ('delivery' in p) return p.delivery === 'save' ? 'spells that call for a saving throw' : `spells that call for ${p.delivery === 'attack' ? 'an attack roll' : `a ${p.delivery}`}`
    return `[activity ${Object.keys(p)[0]}]`
  }

  const since = (w: N) => (w === 'last-turn' ? 'since your last turn' : w === 'rest' ? 'since your last rest' : 'this turn')
  function happened(t: N): string {
    if (t.event === 'event:spell-cast') return t.when ? `you have cast ${activityNoun(t.when).replace(/^spells/, 'a spell').replace(/^cantrips/, 'a cantrip').replace('other than cantrips', 'other than a cantrip')}` : 'you have cast a spell'
    if (t.event === 'event:spell-slot-expended') return 'you have expended a spell slot'
    if (t.event === 'event:state-applied') return `you have become ${lower(t.match.state)}`
    if (t.event === 'event:state-ended') return `you have stopped being ${lower(t.match.state)}`
    if (t.event === 'event:attack-action-taken') return 'you have taken the Attack action'
    if (t.event === 'event:attack-roll') return `you have made ${t.when?.attack ? attackNoun(t.when.attack, true) : 'an attack roll'}${t.subject && typeof t.subject === 'object' ? ` against ${who(t.subject)}` : ''}`
    if (t.event === 'event:damaged') return 'you have taken damage'
    return `[${t.event}] happened`
  }

  // A roll filter as a plural noun: "Dexterity saving throws".
  function rolls(r: N): string {
    const plural: Record<string, string> = {
      'roll:attack': 'attack rolls', 'roll:save': 'saving throws', 'roll:check': 'ability checks', 'roll:d20-test': 'D20 Tests',
      'roll:contest': 'contested checks', 'roll:initiative': 'Initiative rolls', 'roll:death-save': 'death saving throws', 'roll:damage': 'damage rolls',
    }
    const kinds = list(asArray(r.roll).map((k: string) => plural[k] ?? `${lower(k)}s`))
    // `true` is "any that is set": a roll that uses an ability, a check made with a skill
    const abilities = asArray(r.ability).filter((x: unknown) => typeof x === 'string').map(name)
    const skill = asArray(r.skill).filter((x: unknown) => typeof x === 'string').map(name)
    const any = [r.ability === true && 'an ability', r.skill === true && 'a skill'].filter(Boolean)
    return `${abilities.length ? `${list(abilities)} ` : ''}${kinds}${skill.length ? ` (${list(skill, 'or')})` : ''}${any.length ? ` that use ${list(any as string[])}` : ''}`
  }

  // Splits a when into its roll atom and the conditions around it.
  function splitRoll(when: N): { roll?: N; attack?: N; result?: N; rest: N[] } {
    const atoms = when ? ('all' in when ? when.all : [when]) : []
    const out: { roll?: N; attack?: N; result?: N; rest: N[] } = { rest: [] }
    for (const a of atoms) {
      if ('roll' in a && !out.roll) out.roll = a
      else if ('attack' in a && !out.attack) out.attack = a.attack
      else if ('result' in a && !out.result) out.result = a
      else out.rest.push(a)
    }
    return out
  }
  const gate = (rest: N[]) => (rest.length ? gateWord(rest.length === 1 ? rest[0] : { all: rest }) : '')

  function stat(t: N, h: Subject): string {
    if (typeof t === 'string') return ({ ac: `${h.poss} AC`, 'hp-max': `${h.poss} hit point maximum`, weight: `${h.poss} weight`, age: `${h.poss} age`,
      'attunement-slots': `the number of magic items ${h.s} can be attuned to`, 'carrying-capacity': `${h.poss} carrying capacity` } as Record<string, string>)[t] ?? `${h.poss} ${humanize(t)}`
    if ('value' in t) return `${h.poss} ${humanize(t.value).replace(/^push drag lift/, 'push, drag, or lift')} limit`
    if ('speed' in t) return t.speed === 'all' ? `${h.poss} speed` : `${h.poss} ${lower(t.speed)} speed`
    if ('movementCost' in t && t.movementCost === 'movement-mode:walk') return `each foot ${h.you ? 'you walk' : `${h.s} walks`}`
    if ('movementCost' in t) return `each foot ${h.you ? 'you move' : `${h.s} moves`}${t.movementCost === 'all' ? '' : ` while ${modeNoun(t.movementCost).replace(/(im|aw|imb)$/, (x) => x)}${modeNoun(t.movementCost) === 'swim' ? 'ming' : 'ing'}`}`
    if ('passive' in t) return `${h.poss} passive ${name(t.passive)} score`
    if ('pool' in t) return t.pool === 'movement' ? `${h.poss} movement this turn` : `${h.poss} ${humanize(t.pool)}`
    if ('ability' in t && typeof t.ability === 'object' && 'choose' in t.ability) {
      const c = t.ability.choose
      const ids = c.from.every((x: N) => typeof x === 'string') ? ` (${list(c.from.map(name), 'or')})` : c.from.length === 1 && c.from[0].where ? pickParts(c.from[0], false)[1] : ''
      // Picks that can repeat, each adding once: "an ability score of your choice, picked three times with none picked more than twice,"
      if (c.each !== undefined) {
        const n = c.count ?? 1
        const cap = typeof n === 'number' && typeof c.each === 'number' && c.each >= n ? ', the same one or different ones' : ` with none picked more than ${timesText(c.each)}`
        return `${h.you ? 'an' : `one of ${h.poss}`} ability score of ${h.you ? 'your' : 'its'} choice${ids}${filterText(c.where)}, picked ${timesText(n)}${cap},`
      }
      return `${countText(c.count ?? 1)} ${h.you ? '' : `of ${h.poss} `}ability score${(c.count ?? 1) === 1 ? '' : 's'} of ${h.you ? 'your' : 'its'} choice${ids}${filterText(c.where)}`
    }
    if ('ability' in t) return t.facet === 'maximum' ? `${h.poss} ${name(t.ability)} maximum` : `${h.poss} ${name(t.ability)} score`
    return `[${Object.keys(t)[0]}]`
  }

  // Reads a patch on an activity as the changes it makes: "takes 1 minute", "doesn't require concentration".
  function activityChanges(set: N, h: Subject): string[] {
    const c: N = {}
    for (const [k, v] of Object.entries(set) as [string, N][]) {
      if (k === 'outcomes' && v.$append) c.outcomes = v.$append
      else if (k === 'outcomes' && v.$where?.damage && v.damage?.type) c.damage = { type: v.damage.type.$replace ?? v.damage.type }
      else if (k === 'cost' && v.$where?.resource && v.resource) c.swapCost = { from: v.$where.resource, to: v.resource }
      else if (k === 'cost' && v.$remove?.resource === 'spell-slots') c.removeCost = 'spell-slot'
      else if (k === 'time' && v.$add) c.addTime = v.$add
      else if (v?.$replace !== undefined && ['time', 'range', 'duration', 'otherwise'].includes(k)) c[k] = v.$replace
      else if (k === 'otherwise' && typeof v === 'string') c.otherwise = v
      else if (k === 'concentration' && v.$delete) c.concentration = false
      else if (k === 'duration' && v.upTo?.$delete && Object.keys(v).length === 1) c.fullDuration = true
      else if (k === 'target' && v.also?.$replace) c.target = { also: v.also.$replace.who, count: v.also.$replace.count }
      else if (k === 'target' && v.count !== undefined) c.target = { count: v.count }
      else if (k === 'range' && v.distance?.$add !== undefined && Object.keys(v).length === 1) c.rangeAdd = v.distance.$add
      else (c.other ??= []).push(`changes so ${patchText({ [k]: v })}`)
    }
    const unit = (t: N) => `${value(t.amount)} ${t.unit}${t.amount === 1 ? '' : 's'}`
    const r = c.range
    return [
      c.time ? `takes ${unit(c.time)}` : '', c.addTime ? `takes ${unit(c.addTime)} longer` : '',
      c.swapCost ? `uses ${costNoun(c.swapCost.to)} instead of ${costNoun(c.swapCost.from)}` : '',
      c.removeCost === 'spell-slot' ? 'expends no spell slot' : '',
      r ? `has a range of ${r.distance !== undefined ? `${value(r.distance)} ${r.unit ?? 'feet'}` : r.touch ? 'touch' : r.sight ? 'sight' : r.self ? 'self' : 'unlimited'}` : '',
      c.rangeAdd !== undefined ? `gains ${value(c.rangeAdd)} feet of range` : '',
      c.concentration === false ? "doesn't require concentration" : '',
      c.fullDuration ? 'lasts its full duration' : '',
      c.duration && typeof c.duration === 'object' ? `lasts ${c.duration.upTo ? 'up to ' : ''}${unit(c.duration)}` : c.duration ? `lasts ${humanize(c.duration)}` : '',
      c.target?.also ? `can also target ${c.target.count !== undefined ? `${value(c.target.count)} more: ` : ''}${who(c.target.also)}`
        : c.target?.count !== undefined ? `can target ${value(c.target.count)} creatures` : '',
      c.damage?.add !== undefined ? `deals extra damage equal to ${value(c.damage.add)}` : '',
      c.damage?.type ? `deals ${typeof c.damage.type === 'string' ? lower(c.damage.type) : value(c.damage.type)} damage instead` : '',
      c.otherwise === 'half' ? 'deals half damage on a successful save' : '',
      ...(c.other ?? []),
      ...(c.outcomes ?? []).map((o: N) => `also: ${outcome(o, h)}`),
    ].filter(Boolean)
  }
  // A patch on a spell's components: {"$replace": {}} is none, $delete drops one.
  const componentsText = (comp: N): string => !comp ? ''
    : comp.$replace ? (Object.keys(comp.$replace).length ? `with only ${list(Object.keys(comp.$replace).map((k) => `a ${k}`), 'and')} component` : 'with no components')
    : `without ${list(Object.keys(comp).filter((k) => comp[k]?.$delete), 'or')} components`
  // A patch on a spell for one way of casting it: its components, and changes to its casting.
  const spellChanges = (set: N | undefined, h: Subject) => {
    const { components, activities, ...rest } = set ?? {}
    return {
      components: componentsText(components),
      changes: [...(activities?.cast ? activityChanges(activities.cast, h) : []), ...(Object.keys(rest).length ? [`changes so ${patchText(rest)}`] : [])],
    }
  }

  // A bonus to damage, or extra damage of a type: "When you cast a spell that deals fire damage, you add your Charisma modifier to its damage."
  function damageText(e: N, h: Subject, amount: string): string {
    // "When you cast a spell that deals fire damage, you add your Charisma modifier to its damage."
    const parts = (e.when && 'all' in e.when ? e.when.all : e.when ? [e.when] : []).filter((x: N) => x.roll !== 'roll:damage')
    const spell = parts.some((x: N) => x.spell?.kind === 'spell' && !x.spell.where)
    const deals = parts.find((x: N) => 'dealsDamage' in x)
    if (spell && parts.length === (deals ? 2 : 1))
      return `When ${h.s} ${verb(h, 'cast')} a spell${deals ? ` that deals ${damageOf(deals.dealsDamage)}` : ''}, ${h.s} ${verb(h, 'add')} ${amount} to its damage.`
    // "When you cast an evocation spell, you add your Intelligence modifier to its damage."
    const acts = parts.filter((x: N) => ACTIVITY.some((k) => k in x))
    if (acts.length && !spell) {
      const rest = parts.filter((x: N) => !acts.includes(x))
      const use = acts.some((x: N) => 'activity' in x) ? 'use' : 'cast'
      const what = activityNoun(acts.length === 1 ? acts[0] : { all: acts })
      return `When ${h.s} ${verb(h, use)} ${what}, ${h.s} ${verb(h, 'add')} ${amount} to ${acts.some((x: N) => 'activity' in x || typeof x.spell === 'string' || Array.isArray(x.spell)) ? 'its' : 'their'} damage${e.damageType ? ` (${lower(e.damageType)})` : ''}${gate(rest)}.`
    }
    if (parts.length === 1 && 'attack' in parts[0])
      return `${cap(h.s)} ${verb(h, 'add')} ${amount} to the damage of ${h.poss} ${((a) => plural(a[0]) + a[1])(attackParts(parts[0].attack))}${e.damageType ? ` (${lower(e.damageType)})` : ''}.`
    return `${cap(h.s)} ${verb(h, 'add')} ${amount} to ${h.poss} damage${e.damageType ? ` (${lower(e.damageType)})` : ''}${parts.length ? gateWord(parts.length === 1 ? parts[0] : { all: parts }) : ''}.`
  }

  // How dice are rolled, or a change to each die: "you can reroll a 1 on a damage die", "treat any 1 or 2 as a 3"
  function dieText(e: N, h: Subject): string {
    const { roll, attack, result, rest } = splitRoll(e.when)
    const floor = e.set?.$atLeast, replace = e.set?.$replace
    if (e.reroll) {
      const which = e.reroll.below === 2 ? 'a 1' : e.reroll.below ? `a ${e.reroll.below - 1} or lower` : 'any die'
      const on = roll?.roll === 'roll:damage' ? `on a damage die${attack ? ` for ${attackNoun(attack, true)}` : ''}` : roll ? `on ${h.poss} ${rolls(roll)}` : ''
      return `When ${h.s} ${verb(h, 'roll')} ${which} ${on}, ${h.s} can reroll it${e.reroll.mustUse ? ` and must use the new roll` : ''}${gate(rest)}.`.replace(/\s+,/, ',')
    }
    if (floor !== undefined && roll?.roll === 'roll:damage') return `${cap(h.s)} can treat any ${floor - 1 === 1 ? '1' : `roll of ${floor - 1} or lower`} on a damage die as a ${floor}${gate(rest)}.`
    if (floor !== undefined && !e.times) return `${cap(h.s)} can treat a d20 roll of ${floor - 1} or lower as a ${floor} on ${roll ? `${h.poss} ${rolls(roll)}` : 'a d20 roll'}${gate(rest)}.`
    const lead = result ? `When ${result.result === 'crit' ? `${h.s} ${verb(h, 'score')} a critical hit` : clause(result)}, ` : ''
    const natural = asArray(e.when && 'all' in e.when ? e.when.all : e.when).find((x: N) => x && 'natural' in x)?.natural
    if (replace !== undefined && natural) {
      const n = typeof natural === 'number' ? `${natural}` : `${compare(natural)}`.replace(/ or more$/, ' or higher')
      const shows = `${/^(8|11|18)\b/.test(n) ? 'an' : 'a'} ${n}`
      return `${cap(h.s)} ${verb(h, 'treat')} ${shows} on the d20 of ${roll ? `${h.poss} ${rolls(roll)}` : 'a d20 roll'} as ${/^(8|11|18)/.test(String(replace)) ? 'an' : 'a'} ${value(replace)}${gate(rest.filter((x: N) => !('natural' in x)))}.`
    }
    if (e.extraDie) return `${cap(lead.replace(/hit, $/, attack ? `hit with ${attackNoun(attack, true)}, ` : 'hit, '))}${lead ? h.s : cap(h.s)} ${verb(h, 'roll')} one additional ${attack?.via === 'weapon' ? 'weapon ' : ''}damage die${attack && !result ? ` with ${attackNoun(attack, true)}` : ''}${gate(rest)}.`
    if (e.maximize) return `${cap(lead)}${lead ? h.s : cap(h.s)} ${verb(h, 'roll')} the maximum on ${roll?.roll === 'roll:damage' || !roll ? `${h.poss} damage dice` : `the dice of ${h.poss} ${rolls(roll)}`}${gate(rest)}.`
    if (!e.times) return '[dice]'
    const dice = roll?.roll === 'roll:damage' ? 'the damage dice' : roll ? `the dice of ${h.poss} ${rolls(roll)}` : 'the dice'
    return `${cap(lead)}${lead ? h.s : cap(h.s)} ${verb(h, 'roll')} ${dice} ${e.times === 2 ? 'twice' : `${e.times} times`} and ${verb(h, 'add')} them together${gate(rest)}.`
  }

  // Advantage, or a change to the total, on the rolls a `when` names: "You have advantage on Dexterity saving throws."
  function rollText(e: N, h: Subject): string {
    let { roll, attack, rest } = splitRoll(e.when)
    // "Strength (Athletics) or Dexterity (Acrobatics) checks": a choice of rolls.
    const alt = !roll && rest.find((p: N) => p.any?.every((x: N) => 'roll' in x))
    if (alt) [roll, rest] = [alt.any[0], rest.filter((p: N) => p !== alt)]
    if (!roll) return '[roll]'
    let noun = alt ? alt.any.map(rolls).join(' or ') : rolls(roll)
    if (attack) noun = noun.replace('attack rolls', attackRolls(attack))
    const w = gate(rest)
    const targetSelf = roll.target === 'self'
    const by = roll.by
    if (typeof by === 'string' && by !== 'self') {
      const b = roleSubject(by)
      return `${cap(b.s)} ${verb(b, 'have')} ${e.mode ?? '[bonus]'} on ${noun} against ${targetSelf ? h.obj : 'it'}${w}.`
    }
    if (by && typeof by === 'object') {
      const attackers = by.where ? `attackers ${relative(by.where, true)}` : who(by, true)
      const against = roll.target && !targetSelf ? who(roll.target, true) : h.obj
      return `${cap(noun)} against ${against} by ${attackers} have ${e.mode}${w}.`
    }
    if (targetSelf && !by) return `${cap(noun)} against ${h.obj} have ${e.mode}${w}.`
    const target = roll.target && !targetSelf ? ` against ${who(roll.target, true)}` : ''
    if (e.mode) return `${cap(h.s)} ${verb(h, 'have')} ${e.mode} on ${noun}${target}${w}.`
    const add = e.set?.$add
    if (e.set?.$multiply !== undefined) return `${cap(h.poss)} ${noun}${target} are multiplied by ${e.set.$multiply}${w}.`
    if (e.set?.$subtract !== undefined) return `${cap(h.poss)} ${noun}${target} are reduced by ${value(e.set.$subtract)}${w}.`
    if (typeof add === 'object' && 'times' in add && typeof add.times === 'number' && add.times < 0)
      return `${cap(h.poss)} ${noun}${target} are reduced by ${-add.times} times ${value(add.by)}${w}.`
    if (typeof add === 'number' && add < 0) return `${cap(h.s)} ${verb(h, 'take')} a ${add} penalty to ${noun}${target}${w}.`
    return `${cap(h.s)} ${verb(h, 'add')} ${value(add)} to ${noun}${target}${w}.`
  }

  function effect(e: N): string {
    if ('choose' in e) return chooseLine(e.choose, effect)
    const h = e.to ? roleSubject(e.to) : roleSubject('self')
    const readsWhen = ['roll-mod', 'forced-result', 'triggered'].includes(e.type) || (e.type === 'modifier' && ['roll', 'die', 'critical-hit-minimum'].includes(e.target))
    const g = e.when && !readsWhen ? gateWord(e.when) : ''
    switch (e.type) {
      case 'roll-mod': return rollText(e, h)
      case 'forced-result': {
        const { roll, attack, result, rest } = splitRoll(e.when)
        if (e.crit === true) {
          let noun = rolls(roll).replace('rolls', 'roll')
          if (attack) noun = noun.replace('attack roll', attackRolls(attack, true))
          const by = roll.by?.where ? ` by an attacker ${relative(roll.by.where)}` : ''
          const hit = roll.target && roll.target !== 'self' ? who(roll.target) : h.obj
          return `Any ${noun} that hits ${hit}${by} is a critical hit${gate(rest)}.`.replace(' that hits', result ? ' that hits' : '')
        }
        if (e.crit === false) return `${cap(h.s)} ${verb(h, 'turn')} any critical hit against ${h.obj} into a normal hit${gate(rest)}.`
        if (e.success !== undefined && asArray(roll?.roll).includes('roll:attack')) {
          let noun = rolls(roll)
          if (attack) noun = noun.replace('attack rolls', attackRolls(attack))
          return `${cap(h.poss)} ${noun} automatically ${e.success ? 'hit' : 'miss'}${gate(rest)}.`
        }
        const traits = rest.filter((a: N) => 'trait' in a)
        const others = rest.filter((a: N) => !('trait' in a))
        const that = traits.length ? ` that ${list(traits.map((t: N) => TRAITS[t.trait]?.(h).replace(/^it requires/, 'require') ?? humanize(t.trait)))}` : ''
        const how = e.success === true ? verb(h, 'succeed') : e.success === false ? verb(h, 'fail') : '[forced-result]'
        return `${cap(h.s)} automatically ${how} on ${roll ? rolls(roll) : '[rolls]'}${that}${gate(others)}.`.replace(/fail(s?) on /, 'fail$1 ')
      }
      case 'damage-bonus': return damageText(e, h, value(e.amount))
      case 'ac-formula': return `${cap(h.poss)} base AC is ${value(e.base)}${g}.`
      case 'modifier': {
        const c = e.set
        if (e.target === 'roll') {
          const damage = splitRoll(e.when).roll?.roll === 'roll:damage'
          if (!damage) return rollText(e, h)
          return damageText(e, h, c.$multiply !== undefined ? `×${c.$multiply}` : c.$subtract !== undefined ? `−${value(c.$subtract)}` : value(c.$add))
        }
        if (e.target === 'die') return dieText(e, h)
        if (e.target === 'critical-hit-minimum') {
          const { roll, attack, rest } = splitRoll(e.when)
          let noun = roll ? rolls(roll) : attack ? attackRolls(attack) : 'attack rolls'
          if (roll && attack) noun = noun.replace('attack rolls', attackRolls(attack))
          const min = c.$atMost
          return `${cap(h.poss)} ${noun} score a critical hit on a roll of ${min === 20 ? '20' : `${value(min)}–20`} on the d20${gate(rest)}.`
        }
        const target = stat(e.target, h)
        const add = typeof c.$add === 'object' && 'upTo' in c.$add ? c.$add.amount : c.$add
        const upTo = typeof c.$add === 'object' && 'upTo' in c.$add ? c.$add.upTo : undefined
        if (c.$replace !== undefined) return `${cap(target)} is ${value(c.$replace)}${g}.`
        if (c.$atLeast !== undefined) return `${cap(target)} is ${value(c.$atLeast)} unless it is already higher${g}.`
        if (c.$atMost !== undefined) return `${cap(target)} can be no more than ${value(c.$atMost)}${'speed' in Object(e.target) ? ' feet' : ''}${g}.`
        if (c.$multiply === 0.5) return `${cap(target)} is halved${g}.`
        if (c.$multiply !== undefined) return `${cap(target)} is multiplied by ${c.$multiply}${g}.`
        if (c.$subtract !== undefined) return `${cap(target)} is reduced by ${value(c.$subtract)}${g}.`
        if ('movementCost' in Object(e.target)) return `${cap(target)} costs ${value(add)} extra foot${g}.`
        if (typeof add === 'object' && 'times' in add && typeof add.times === 'number' && add.times < 0)
          return `${cap(target)} is reduced by ${-add.times} times ${value(add.by)}${g}.`
        const unit = 'speed' in Object(e.target) ? ' feet' : ''
        const s3 = (e.target?.ability?.choose?.count ?? 1) === 1 || e.target?.ability?.choose?.each !== undefined ? 's' : ''
        const cap20 = upTo === undefined ? '' : upTo === 'maximum' ? `, to no more than ${h.poss} maximum for it` : `, to a maximum of ${value(upTo)}`
        if (typeof add === 'number') return `${cap(target)} ${add < 0 ? `decrease${s3} by ${-add}${unit}` : `increase${s3} by ${add}${unit}`}${cap20}${g}.`
        return `${cap(target)} increase${s3} by ${value(add)}${cap20}${g}.`
      }
      case 'forbid': {
        const except = e.activity?.all?.find((x: N) => x.not?.action)?.not.action
        if (except && e.restriction[0] === 'restriction:actions')
          return `${cap(h.s)} can't take any action other than ${list(asArray(except).map(name), 'or')}${g}.`
        if (e.activity && e.restriction.length === 1 && e.restriction[0] === 'restriction:cast-spells')
          return `${cap(h.s)} can't cast ${activityNoun(e.activity)}${g}.`
        const what = e.restriction.map(lower)
        return e.target
          ? `${cap(h.s)} can't ${list(what.map((w: string) => w.replace(/^target /, 'target it ')), 'or').replace(/^attack/, `attack ${roleSubject(e.target).s}`)}${g}.`.replace(/target it/, `target ${roleSubject(e.target).obj === 'it' ? 'them' : roleSubject(e.target).obj}`).replace(/willingly move closer/, `willingly move closer to ${roleSubject(e.target).s}`)
          : `${cap(h.s)} can't ${list(what, 'or')}${g}.`
      }
      case 'defense': {
        const parts: string[] = []
        if (e.resist) parts.push(`${verb(h, 'have')} resistance to ${'all' in e.resist ? `all damage${e.resist.except ? ` except ${list(e.resist.except.map(name), 'and')} damage` : ''}` : list(e.resist.map(name))}`)
        if (e.vulnerable) parts.push(`${verb(h, 'have')} vulnerability to ${'all' in e.vulnerable ? 'all damage' : list(e.vulnerable.map(name))}`)
        if (e.immune) parts.push(`${verb(h, 'are')} immune to ${'all' in e.immune ? 'everything' : list(e.immune.map(name))}`)
        return `${cap(h.s)} ${parts.join(' and ')}${g}.`
      }
      case 'record': return chooseLine(e.pick.choose, (x: N) => typeof x === 'string' ? name(x) : x.name)
      case 'speed': return `${cap(h.s)} ${verb(h, 'have')} a ${lower(e.mode)} speed ${typeof e.speed === 'number' ? `of ${e.speed} feet` : `equal to ${value(e.speed)}`}${e.hover ? ' and can hover' : ''}${g}.`
      case 'sense': return `${cap(h.s)} ${verb(h, 'have')} ${name(e.sense).toLowerCase()} out to ${distance(e.range)}${g}.`
      case 'proficiency': {
        // An ability id here is that ability's saving throws; a group reads as "land vehicles".
        const thing = (x: N) => typeof x === 'object' && 'choose' in x ? chooseNoun(x.choose)
          : typeof x === 'object' && x.kind === 'item' ? items(x)
          : typeof x === 'object' && 'kind' in x ? `all ${pickNoun(x, true)}`
          : typeof x === 'object' && !('chosen' in x) ? items(x) : typeof x === 'object' ? `the chosen ${humanize(x.chosen)}${x.chosen === 'ability' ? '\'s saving throws' : ''}`
          : kindOf(x) === 'ability' ? `${name(x)} saving throws` : kindOf(x) === 'group' ? items(x) : name(x)
        const language = (x: N) => typeof x === 'string' ? kindOf(x) === 'language'
          : 'choose' in x && x.choose.from.every((y: N) => typeof y === 'string' ? kindOf(y) === 'language' : y.kind === 'language')
        if (e.in.every(language)) return `${cap(h.s)} ${verb(h, e.in.some((x: N) => typeof x === 'object') ? 'learn' : 'know')} ${list(e.in.map(thing))}${g}.`
        const level = e.level === 'expertise' ? 'expertise in' : e.level === 'half' ? 'half proficiency with'
          : e.level === 'proficiency-or-expertise' ? 'proficiency (expertise if already proficient) with' : 'proficiency with'
        return `${cap(h.s)} ${verb(h, 'gain')} ${level} ${list(e.in.map(thing))}${g}.`
      }
      case 'see': {
        const parts: string[] = []
        if (e.dim || e.darkness) parts.push(`${h.s} can see${e.dim ? ' in dim light as if it were bright light' : ''}${e.dim && e.darkness ? ' and' : ''}${e.darkness ? ` in ${e.magicalDarkness ? 'normal and magical ' : ''}darkness as if it were ${e.darkness} light` : ''}`)
        else if (e.magicalDarkness) parts.push(`${h.s} can see in magical darkness`)
        if (e.withoutSight) parts.push(`${h.s} can perceive ${h.poss} surroundings without relying on sight`)
        if (e.tremor) parts.push(`${h.s} can pinpoint creatures and moving objects touching the same surface or liquid as ${h.obj}`)
        if (e.invisible) parts.push(`${h.s} can see invisible creatures and objects`)
        if (e.illusions) parts.push(`${h.s} see${h.you ? '' : 's'} through visual illusions and automatically succeed${h.you ? '' : 's'} on saving throws against them`)
        if (e.transformations) parts.push(`${h.s} see${h.you ? '' : 's'} the true form of creatures and objects transformed by magic`)
        if (e.planes?.length) parts.push(`${h.s} can see into the ${list(e.planes.map(name))}`)
        return `${e.range ? `Within ${distance(e.range)}, ` : ''}${list(parts)}${g}.`.replace(/^you/, 'You')
      }
      case 'change': {
        const set = e.set ?? {}
        const of = e.of
        // The Attack action's attack count: "you can attack twice, instead of once".
        const times = set.outcomes?.runs?.times?.$atLeast
        if (of?.kind === 'activity' && of.where?.action === 'action:attack' && times !== undefined) {
          const n = typeof times === 'number' ? times : undefined
          const say = n === 2 ? 'twice' : n === 3 ? 'three times' : n === 4 ? 'four times'
            : `${value(typeof times === 'object' && 'byLevel' in times ? { ...times, byLevel: Object.fromEntries(Object.entries(times.byLevel).map(([k, x]) => [k, (x as number) - 1])) } : times)} more times`
          return `${cap(h.s)} can attack ${say}${n ? ', instead of once,' : ''} whenever ${h.s} ${verb(h, 'take')} the Attack action${g}.`
        }
        if (of?.kind !== 'activity') {
          const what = of === 'this' ? 'it' : typeof of === 'string' ? name(of) : of?.kind === 'item' ? items(of)
            : of?.kind === 'spell' ? spellNoun(of.where, true) ?? activityNoun({ spell: of }) : plural(humanize(of?.kind ?? 'thing'))
          // Armor without its drawbacks: Mithral Armor
          const ARMOR: Record<string, string> = { strength: 'has no Strength requirement', stealthDisadvantage: 'doesn\'t impose disadvantage on Stealth checks' }
          const armor = Object.keys(set).length === 1 && plain(set.armor) ? Object.entries(set.armor) : []
          if (armor.length && armor.every(([k, x]) => k in ARMOR && plain(x) && x.$delete)) return `${cap(what)} ${list(armor.map(([k]) => ARMOR[k]))}${g}.`
          const comp = set.components
          if (comp && Object.values(comp).every((x: N) => x?.$delete)) return `${cap(h.s)} can cast ${what} ${componentsText(comp)}${g}.`
          return `${cap(what)}: ${patchText(set)}${g}.`
        }
        // An activity: read the patch as the changes it makes.
        e = { ...e, filter: of.where ?? {} }
        const changes = activityChanges(set, h)
        const what = activityNoun(e.filter).replace(/^spells with a ritual tag/, 'spells with the Ritual tag')
        if (!changes.length) return '[change]'
        const f = 'all' in e.filter ? e.filter.all : [e.filter]
        const many = !f.some((x: N) => 'activity' in x || typeof x.spell === 'string' || Array.isArray(x.spell))
        const use = f.some((x: N) => 'activity' in x || 'attack' in x) ? 'use' : 'cast'
        // The changes read as "it takes …"; for a plural noun, "they take …".
        const PLURAL: Record<string, string> = { gains: 'gain', changes: 'change', takes: 'take', uses: 'use', expends: 'expend', has: 'have', "doesn't": "don't", lasts: 'last', needs: 'need', deals: 'deal' }
        const agree = (c: string) => (many ? c.replace(/^\S+/, (w) => PLURAL[w] ?? w) : c)
        const said = changes.filter((c) => !c.startsWith('also: ')).map(agree)
        const also = (set.outcomes?.$append ?? []).map((o: N) => outcome(o, h))
        if (e.variant === 'ritual') return `${cap(h.s)} can cast ${what} as a ritual, which ${list(said)}${g}.`
        const when = also.length ? `When ${h.s} ${verb(h, use)} ${what}, ${list(also)}` : ''
        if (e.variant) return `${cap(h.s)} can choose to ${use} ${what} so that ${many ? 'they' : 'it'} ${list(said)}${g}.`
        return [said.length ? `${cap(what)} ${list(said)}${g}.` : '', when ? `${cap(when)}${g}.` : ''].filter(Boolean).join(' ')
      }
      case 'light': return `${cap(h.s)} ${verb(h, 'shed')} bright light in a ${value(e.bright)}-foot radius and dim light for an additional ${value(e.dim)} feet${g}.`
      case 'die-mod': return dieText(e, h)
      case 'suppress': {
        // Some of a rule's or state's effects, by their keys: "the somatic part of the Components rule"
        const parts = e.effects ? `The ${list(e.effects.map(humanize))} ${e.effects.length > 1 ? 'parts' : 'part'} of ` : ''
        const on = plain(e.to) ? who(e.to, true) : h.obj
        if (e.state) return parts ? `${parts}${list(asArray(e.state).map(stateName))} ${e.effects.length > 1 ? 'are' : 'is'} suspended on ${on}${g}.`
          : `${cap(list(asArray(e.state).map(stateName)))} ${asArray(e.state).length > 1 ? 'are' : 'is'} suspended on ${on}${g}.`
        const many = parts ? e.effects.length > 1 : asArray(e.rule).length > 1
        const rules = `${parts || 'The '}${parts ? 'the ' : ''}${list(asArray(e.rule).map(name))} rule${asArray(e.rule).length > 1 ? 's' : ''} ${many ? 'don\'t' : 'doesn\'t'} apply to`
        const { roll, attack, rest } = splitRoll(e.when)
        if (roll) return `${rules} ${h.poss} ${attack ? rolls(roll).replace('attack rolls', attackRolls(attack)) : rolls(roll)}${gate(rest)}.`
        return `${rules} ${h.obj}${g}.`
      }
      case 'resource': {
        // A recovery on a short rest also happens on a long one.
        const on = regained
        const rolled = e.rolled ? `; each is ${/^[aeiou8]/.test(e.rolled.replace(/^1?d/, '')) ? 'an' : 'a'} ${e.rolled.replace(/^1d/, 'd')} rolled when regained, and keeps its number until spent` : ''
        const refill = (e.recover?.length ? `, ${e.recover.map((r: N) => r.amount === 'all' ? `refilled ${on(r)}` : `regaining ${value(r.amount)} ${on(r)}`).join(' or ')}` : '') + rolled
        if (typeof e.max === 'number' && e.recover?.length) return `${cap(h.s)} ${verb(h, 'have')} ${e.max} ${e.max === 1 ? singular(e.key) : humanize(e.key)}${refill}${g}.`
        if (typeof e.max === 'number') return `${cap(h.s)} ${verb(h, 'count')} up to ${e.max} ${humanize(e.key)}${g}.`
        // A pool with no max holds any number of things: a spellbook's spells.
        if (e.max === undefined) return `${cap(h.s)} ${verb(h, 'have')} a ${humanize(e.key)} that holds any number of things${refill}${g}.`
        // A pool in a group with its own level: Pact Magic's slots.
        if (e.values?.level !== undefined) return `${cap(h.s)} ${verb(h, 'have')} ${humanize(e.key)} slots${e.group ? ` (${humanize(e.group).replace(/s$/, '')}s)` : ''}, as many as ${value(e.max)} and of the level ${value(e.values.level)}${refill}${g}.`
        const extras = `${e.die !== undefined ? `; the die is ${value(e.die)}` : ''}${e.dc !== undefined ? `; the save DC is ${value(e.dc)}` : ''}`
        return `${cap(h.s)} ${verb(h, 'have')} ${humanize(e.key)} equal to ${value(e.max)}${refill}${extras}${g}.`
      }
      case 'spell-access': {
        const spells = Array.isArray(e.spells) ? list(e.spells.map(name))
          : 'chosen' in e.spells ? `the chosen ${humanize(e.spells.chosen)}` : activityNoun(e.spells)
        const plural = !Array.isArray(e.spells) || e.spells.length > 1 || (e.spells[0]?.choose?.count ?? 1) !== 1
        const gate = readOf(e.when?.compare), lv = !gate?.role && gate?.segs[0] === 'levels' ? gate.segs[1] : undefined
        const at = lv && e.when.atLeast !== undefined && e.when.atMost === undefined
          ? `At ${lv === 'total' ? '' : `${name(lv)} `}level ${value(e.when.atLeast)}, ` : ''
        const w = at ? '' : g
        const body = e.how === 'prepared' ? `${h.s} always ${verb(h, 'have')} ${spells} prepared`
          : e.how === 'known' ? `${h.s} ${verb(h, 'know')} ${spells}` : `${h.s} can cast ${spells}`
        const counts = e.counts === false ? `; ${plural ? 'they don\'t' : 'it doesn\'t'} count against the number of spells ${h.s} can ${e.how === 'known' ? 'know' : 'prepare'}` : ''
        const ability = e.ability ? `; ${abilityName(e.ability)} is ${h.poss} spellcasting ability for ${plural ? 'them' : 'it'}` : ''
        const sp = spellChanges(e.set, h)
        const how = `${e.castAt === undefined ? '' : typeof e.castAt === 'number' ? ` as a ${e.castAt === 1 ? '1st' : e.castAt === 2 ? '2nd' : e.castAt === 3 ? '3rd' : `${e.castAt}th`}-level spell` : ` at level ${value(e.castAt)}`}${sp.components ? ` ${sp.components}` : ''}${sp.changes.length ? `, and ${plural ? 'they' : 'it'} ${list(sp.changes)}` : ''}`
        const free = e.uses ? `${e.how === 'innate' ? ' ' : `; ${h.s} can cast ${plural ? 'each' : 'it'} `}${per(e.uses)}${e.how === 'innate' ? '' : ' without a spell slot'}` : ''
        return `${at}${at ? body : cap(body)}${w}${free}${how && e.how !== 'innate' ? `; ${h.s} can cast ${plural ? 'them' : 'it'}${how}` : how}${counts}${ability}.`
      }
      case 'spell-list': {
        const spells = Array.isArray(e.spells) ? list(e.spells.map(name)) : activityNoun(e.spells)
        const to = e.list === 'spellcasting' ? `the spell list of each class ${h.s} cast${h.you ? '' : 's'} spells with` : `the ${name(e.list)} spell list for ${h.obj}`
        return `${cap(spells)} ${Array.isArray(e.spells) && e.spells.length === 1 ? 'is' : 'are'} added to ${to}${g}.`
      }
      case 'triggered': {
        const t = asArray(e.on).map((x: N) => trigger(x).when)
        const cond = e.when ? `, if ${clause(e.when)}` : ''
        return `${cap(list(t, 'or'))}${cond}, ${step(e.step)}.`
      }
      case 'zone': {
        const z = e.zone, a = z.area
        const shape = lower(a.shape)
        const feet = (v: N) => typeof v === 'object' && 'byLevel' in v ? value({ ...v, byLevel: Object.fromEntries(Object.entries(v.byLevel).map(([k, x]) => [k, `${value(x)} feet`])) }) : `${value(v)} feet`
        const area = typeof a.size === 'number' ? `a ${a.size}-foot ${shape}` : `${/^[aeiou]/.test(shape) ? 'an' : 'a'} ${shape} of ${feet(a.size)}`
        const anchor = z.anchor === 'self' ? `around ${h.obj}` : z.anchor === 'object' ? 'around the object' : z.anchor === 'target' ? 'around the target' : 'at a point'
        const affected = z.affects ? `${z.affects.includeSelf ? `${h.s} and ` : ''}${who({ ...z.affects, includeSelf: undefined }, true)}` : 'each creature'
        const inner = within({ self: third('each affected creature'), source: h }, () => [
          ...(z.effects ?? []).map((x: N) => effect(x)),
          ...(z.on ?? []).map((x: N) => effect({ type: 'triggered', ...x })),
        ])
        const terrain = [z.terrain && 'difficult terrain', z.obscured && `${z.obscured}ly obscured`].filter(Boolean)
        return `${cap(h.s)} ${verb(h, 'have')} an aura, ${area} ${anchor}${g}${terrain.length ? `, which is ${list(terrain)}` : ''}.${inner.length ? ` It affects ${affected}: ${inner.map(uncap).join(' ')}` : ''}`
      }
      case 'waive': return `${cap(h.s)} ${verb(h, 'ignore')} ${list([...(e.restriction ?? []).map((x: string) => `the ${lower(x)} restriction`), ...(e.requirement ?? []).map((x: string) => `the ${lower(x)} requirement`)])}${g}.`
      case 'bypass': return `${cap(h.poss)} damage ignores ${list([e.resistance && `resistance to ${list(e.resistance.map(name))}`, e.immunity && `immunity to ${list(e.immunity.map(name))}`].filter(Boolean))}${g}.`
      case 'ability-substitute': return `${cap(h.s)} can use ${e.use === 'spellcasting' ? `${h.poss} spellcasting ability` : list(asArray(e.use).map(name), 'or')} instead of the usual ability for ${clause(e.for).replace(/^it is /, '')}${g}.`
      case 'counts-as': return `${cap(h.s)} ${verb(h, 'count')} as ${e.size ? (typeof e.size === 'string' ? name(e.size) : `${NUMBERS[Math.abs(e.size.steps)]} size${Math.abs(e.size.steps) > 1 ? 's' : ''} ${e.size.steps > 0 ? 'larger' : 'smaller'}`) : lower(e.qualifier)} for ${list(asArray(e.for).map(lower))}${g}.`
      default: return `[${e.type}]`
    }
  }

  // A trigger as "when …" and as what an "until" names.
  // A short rest's trigger reads "a short or long rest", since finishing a long rest finishes a short one too
  const anyRest = (on: N) => on.match?.rest === 'rest:short' ? { ...on, match: { ...on.match, rest: undefined } } : on
  function trigger(raw: N): { when: string; until: string } {
    // A test turning true
    if ('becomes' in raw) {
      const b = raw.becomes
      const s = 'not' in b && Object.keys(b).length === 1 ? `it is no longer true that ${clause(b.not)}` : clause(b)
      return { when: `as soon as ${s}${raw.when ? ` and ${clause(raw.when)}` : ''}`, until: `until ${s}` }
    }
    // The event's own fields read like the trigger's
    const t = { ...raw, ...raw.match }
    if (Array.isArray(t.event)) {
      const each = t.event.map((event: string) => trigger({ ...t, event }))
      return { when: list(each.map((x: N) => x.when), 'or'), until: list(each.map((x: N) => x.until), 'or') }
    }
    const subj = t.subject ? (typeof t.subject === 'string' ? roleSubject(t.subject) : third(who(t.subject))) : roleSubject('self')
    const by = t.by ? (typeof t.by === 'string' ? roleSubject(t.by) : third(who(t.by))) : undefined
    const w = t.when
    const filter = !w ? ''
      : w.attack ? ` ${t.event === 'event:damaged' ? 'from' : 'with'} ${attackNoun(w.attack, true)}`
      : w.trait === 'verbal-component' ? ' with a verbal component'
      : t.event === 'event:moved' && 'not' in w && 'within' in w.not && isReach(w.not.within) ? ` out of ${distance(w.not.within)}`
      : gateWord(w)
    const both = (until: string) => ({ when: `when ${until}${filter}`, until: until + filter })
    switch (t.event) {
      case 'event:turn-start': return { when: typeof t.subject === 'object' ? `at the start of each turn of ${subj.s}${filter}` : `at the start of ${subj.poss} turn${filter}`, until: `the start of ${subj.poss} next turn` }
      case 'event:attack-action-taken': return both(`${(by ?? subj).s} ${verb(by ?? subj, 'take')} the Attack action`)
      case 'event:turn-end': return { when: typeof t.subject === 'object' ? `at the end of each turn of ${subj.s}${filter}` : `at the end of ${subj.poss} turn${filter}`, until: `the end of ${subj.poss} ${t.next ? 'next ' : ''}turn` }
      case 'event:state-applied': return both(`${subj.s} ${verb(subj, 'gain')} ${stateName(t.state)}`)
      case 'event:rest-finished': return both(`${subj.s} ${verb(subj, 'finish')} ${t.rest ? `a ${name(t.rest)}` : 'a short or long rest'}`)
      case 'event:level-gained': {
        const lvl = t.class ? `${/^[aeiou]/i.test(name(t.class)) ? 'an' : 'a'} ${name(t.class)} level` : 'a level'
        if (t.gives?.picks) return both(`${subj.s} ${verb(subj, 'gain')} ${lvl} that gives ${subj.obj} more ${choiceName(t.gives.picks)} choices`)
        return both(`${subj.s} ${verb(subj, 'gain')} ${lvl}${t.gives ? ` that grants the ${name(t.gives)} feature` : ''}`)
      }
      case 'event:revived': return both(`${subj.s} ${be(subj)} raised from the dead`)
      case 'event:reduced-to-zero': return by?.you ? both('you reduce a creature to 0 hit points') : both(`damage reduces ${subj.obj} to 0 hit points`)
      case 'event:leaves-reach': return both(`${by ? by.s : 'a creature'} leaves ${subj.poss} reach`)
      case 'event:attack-roll': return ['hit', 'crit', 'miss'].includes(w?.result ?? w?.all?.find((x: N) => 'result' in x)?.result) ? (() => {
          const res = w.result ?? w.all.find((x: N) => 'result' in x).result, crit = res === 'crit'
          const rest = w.all ? w.all.filter((x: N) => !('result' in x)) : []
          const alt = rest.find((x: N) => x.any?.every((y: N) => 'attack' in y))
          const atk = rest.find((x: N) => 'attack' in x) ?? (alt && { attack: alt, any: true })
          const others = rest.filter((x: N) => x !== atk && x !== alt)
          const hitter = by ? by.s : 'a creature', hit = by?.you ? 'hit' : 'hits', hurt = by?.you || !t.subject ? 'a creature' : subj.obj
          const hits = res === 'miss' ? (by?.you ? 'miss' : 'misses') : crit ? `${by?.you ? 'score' : 'scores'} a critical hit${by?.you || !t.subject ? '' : ` against ${subj.obj}`}` : `${hit} ${hurt}`
          return { when: `when ${hitter} ${hits} with ${atk?.any ? list(atk.attack.any.map((x: N) => attackNoun(x.attack, true)), 'or') : atk ? attackNoun(atk.attack, true) : 'an attack roll'}${others.length ? `${gateWord(others.length === 1 ? others[0] : { all: others })}` : ''}`, until: res === 'miss' ? 'the miss' : 'the hit' }
        })()
        : w?.attack && Object.keys(w).length === 1 && by?.you ? { when: `when you make ${attackNoun(w.attack, true)}`, until: `you make ${attackNoun(w.attack, true)}` }
        : w?.attack && Object.keys(w).length === 1 ? both(`${by ? by.s : 'a creature'} makes ${attackNoun(w.attack, true)} against ${subj.obj}`)
        : by?.you ? both('you make an attack roll') : both(`${by ? by.s : 'a creature'} makes an attack roll against ${subj.obj}`)
      case 'event:spell-cast': return { when: `when ${by?.you ? 'you cast' : `${by ? by.s : 'a creature'} casts`} ${t.when ? activityNoun(t.when).replace(/^spells/, 'a spell') : 'a spell'}`, until: 'a spell is cast' }
      case 'event:ability-check': return both(`${(by ?? subj).s} ${verb(by ?? subj, 'make')} an ability check`)
      case 'event:moved': return both(`${subj.s} ${be(subj)} moved`)
      case 'event:forced-move': return both(`${subj.s} ${be(subj)} moved against ${subj.you ? 'your' : 'its'} will`)
      case 'event:damaged': return both(by && !by.you ? `${subj.s} ${verb(subj, 'take')} damage from ${by.s}` : by?.you && !subj.you ? `you deal damage to ${typeof t.subject === 'object' ? subj.s : subj.obj}` : `${subj.s} ${verb(subj, 'take')} damage`)
      case 'event:healed': return both(`${subj.s} ${verb(subj, 'regain')} hit points`)
      case 'event:time-elapsed': return { when: `after ${value(t.every.amount)} ${t.every.unit}s`, until: `${value(t.every.amount)} ${t.every.unit}s pass` }
      case 'event:hp-max-changed': return both(`${subj.poss} hit point maximum changes`)
      case 'event:fell': return both(`${subj.s} ${verb(subj, 'land')} at the end of a fall`)
      case 'event:jump-landed': return both(`${subj.s} ${verb(subj, 'land')} from a jump`)
      case 'event:speed-changed': return both(`${subj.poss} speed changes`)
      case 'event:dawn': return { when: 'at dawn', until: 'the next dawn' }
      case 'event:dusk': return { when: 'at dusk', until: 'the next dusk' }
      case 'event:item-equipped': case 'event:item-unequipped': case 'event:attuned': {
        const one = (x: any): string => x === 'this' ? 'this item' : typeof x === 'string' && kindOf(x) === 'group' ? (/armor$/.test(x) ? lower(x) : `${/^[aeiou]/i.test(name(x)) ? 'an' : 'a'} ${singular(x.slice(6))}`) : typeof x === 'string' ? name(x) : items(x)
        const it = Array.isArray(t.item) ? list(t.item.map(one), 'or') : t.item ? one(t.item) : 'an item'
        if (t.event === 'event:attuned') return both(`${subj.s} ${verb(subj, 'finish')} attuning to ${it}`)
        return both(t.event === 'event:item-equipped' ? `${subj.s} ${verb(subj, 'equip')} ${it}` : `${subj.s} ${verb(subj, 'drop')}, ${verb(subj, 'stow')}, or ${verb(subj, 'take')} off ${it}`)
      }
      case 'event:day-ended': return { when: `at the end of each day${filter.replace(' when', ', if')}`, until: 'the end of the day' }
      case 'event:state-ended': return both(`${stateName(t.state)} ends on ${subj.obj}`)
      case 'event:extinguished': return both(`the fire on ${subj.obj} is put out`)
      case 'event:saving-throw': {
        // The roll-made wording, with the creature saving as the roller
        const r = trigger({ ...t, event: 'event:roll-made', by: t.subject ?? 'self', subject: undefined, when: t.when ?? { roll: 'roll:save' } })
        const forced = by ? ` that ${by.s} ${by.you ? 'force' : 'forces'}` : ''
        return { when: r.when + forced, until: r.until }
      }
      case 'event:roll-made': {
        // The roll's own atoms, then what it was made for: "for a spell that deals fire damage"
        const atoms = w?.all ?? (w ? [w] : [])
        const rw = atoms.find((x: N) => 'roll' in x), resAtom = atoms.find((x: N) => 'result' in x)
        const sp = atoms.find((x: N) => x.spell?.kind === 'spell'), deals = atoms.find((x: N) => 'dealsDamage' in x)
        const others = atoms.filter((x: N) => ![rw, resAtom, sp, deals].includes(x))
        const forWhat = (sp ? ` for ${sp.spell.where ? activityNoun(sp).replace(/^spells\b/, 'a spell').replace(/^cantrips\b/, 'a cantrip') : 'a spell'}` : '')
          + (deals ? ` that deals ${damageOf(deals.dealsDamage)}` : '') + (others.length ? gateWord(others.length === 1 ? others[0] : { all: others }) : '')
        if (rw && resAtom) {
          const r = rw, res = resAtom.result
          const noun = rolls(r).replace(/s\b/, '').replace(/s$/, '').replace(/,? and /, (m) => m.replace('and', 'or'))
          const v = res === 'failed' ? `fail ${/^[aeiou]/i.test(noun) ? 'an' : 'a'} ${noun}` : res === 'miss' ? 'miss with an attack roll' : res === 'succeeded' ? `succeed on ${/^[aeiou]/i.test(noun) ? 'an' : 'a'} ${noun}` : `make ${/^[aeiou]/i.test(noun) ? 'an' : 'a'} ${noun} that ${res === 'hit' ? 'hits' : res}`
          return { when: `when ${by?.s ?? 'you'} ${by && !by.you ? v.replace(/^(\w+)/, (m) => (m === 'miss' ? 'misses' : `${m}s`)) : v}${forWhat}`, until: 'the roll' }
        }
        if (rw) {
          const made = list(asArray(rw.roll).map((k: string) => {
            if (k === 'roll:d20-test') return 'an attack roll, a saving throw, or an ability check'
            const ab = rw.ability ? `${list(asArray(rw.ability).map(name), 'or')} ` : ''
            const sk = rw.skill && typeof rw.skill === 'string' ? ` (${name(rw.skill)})` : ''
            const noun = k === 'roll:check' && (ab || sk) ? `${ab.trim()}${sk} check` : k === 'roll:initiative' ? 'Initiative roll' : `${ab}${lower(k)}`
            return `${/^[aeiou]/i.test(noun) ? 'an' : 'a'} ${noun}`
          }), 'or')
          const roller = by ?? YOU
          return { when: `when ${roller.s} ${verb(roller, 'make')} ${made}${forWhat}`, until: `${roller.s} ${verb(roller, 'make')} ${made}${forWhat}` }
        }
        return { when: `immediately after ${by?.s ?? 'you'} roll${by && !by.you ? 's' : ''} any die${forWhat}`, until: 'the roll' }
      }
      case 'event:initiative-rolled': return both(`${subj.s} ${verb(subj, 'roll')} Initiative`)
      case 'event:died': return both(`${subj.s} ${verb(subj, 'die')}`)
      case 'event:breathes': return both(`${subj.s} can breathe again`)
      case 'event:initiative-count': return { when: `on initiative count ${t.count}`, until: `initiative count ${t.count}` }
      default: return both(`[${t.event}]`)
    }
  }

  function outcome(o: N, base: Subject): string {
    const s = o.to ? roleSubject(o.to) : base
    const lead = o.when ? ('not' in o.when ? `unless ${clause(o.when.not)}, ` : `if ${clause(o.when)}, `) : ''
    const body = (() => {
      if ('applyState' in o) {
        const a = o.applyState
        // Inside the state, "you" is its holder, and its source is whoever is acting now.
        const inside = { self: s, source: roleSubject('self') }
        const lasts = a.duration && typeof a.duration === 'object' ? ` for ${value(a.duration.amount)} ${a.duration.unit}${a.duration.amount === 1 ? '' : 's'}` : ''
        const until = a.ends?.length ? ` until ${list(within(inside, () => a.ends.map((t: N) => trigger(t).until)), 'or')}` : ''
        const from = a.source ? `, with ${roleSubject(a.source).obj} as the source` : ''
        const become = (id: string) => (/^\w+ing\b/.test(lower(id)) ? (s.you ? 'start' : 'starts') : s.you ? 'become' : 'becomes')
        // A state picked earlier: "you gain the environment you chose"
        if (a.state.chosen) return `${s.s} ${verb(s, 'gain')} the ${humanize(a.state.chosen)} ${s.you ? 'you' : 'it'} chose${from}${lasts}${until}`
        // One of several states: "it becomes charmed or frightened (your choice)", "you gain Archer, Chalice, or Dragon (your choice)"
        if (a.state.choose) {
          const c = a.state.choose
          return c.from.every((x: N) => typeof x === 'string' && adjState(x))
            ? `${s.s} ${become(c.from[0])} ${list(c.from.map(lower), 'or')} (your choice)${from}${lasts}${until}`
            : c.from.every((x: N) => typeof x === 'string' && kindOf(x) === 'condition')
            ? `${s.s} ${verb(s, 'gain')} the ${list(c.from.map(name), 'or')} condition (your choice)${from}${lasts}${until}`
            : `${s.s} ${verb(s, 'gain')} ${chooseNoun(c)}${from}${lasts}${until}`
        }
        if (typeof a.state === 'string') return adjState(a.state)
          ? `${s.s} ${become(a.state)} ${lower(a.state)}${from}${lasts}${until}` : `${s.s} ${verb(s, 'gain')} ${stateName(a.state)}${from}${lasts}${until}`
        return within(inside, () => {
          const parts = [...(a.state.activities ?? []).map((x: N) => `${s.you ? 'you gain' : `${s.s} gains`} ${x.name ?? cap(humanize(x.key))} (${uncap(activity(x)).replace(/\.$/, '')})`),
            ...(a.state.effects ?? []).map((e: N) => uncap(effect(e)).replace(/\.$/, ''))]
          const gated = a.state.when ? gateWord(a.state.when) : ''
          return `${until.trim()}${gated ? `,${gated}` : ''}, ${list(parts)}${lasts}`.replace(/^, /, '')
        })
      }
      if ('replace' in o) {
        // "replace one of your Maneuvers choices with another", "replace one spell that this feature gave you with …"
        const r = o.replace
        if (r.choice) return `${s.s} ${verb(s, 'replace')} one of ${s.poss} ${choiceName(r.choice, r.from)} choices${r.from ? ` from ${name(r.from)}` : ''} with another`
        const same = r.same ? ` of the same ${list(r.same.map(humanize))}` : ''
        // "one spell this feature gave you", "one cantrip Spellcasting gave you"
        const parts: N[] = !r.what?.where ? [] : 'all' in r.what.where ? r.what.where.all : [r.what.where]
        const given = parts.find((x) => 'grantedBy' in x)?.grantedBy, others = parts.filter((x) => !('grantedBy' in x))
        const kept = { kind: r.what?.kind, ...(others.length ? { where: others.length === 1 ? others[0] : { all: others } } : {}) }
        const what = given ? `${pickNoun(kept, false)} ${given === 'this' ? 'this feature' : name(given)} gave ${s.obj}` : r.what ? pickNoun(r.what, false) : 'pick'
        const [noun, rest] = r.with ? pickParts(r.with, false) : ['', '']
        return `${s.s} ${verb(s, 'replace')} one ${what} with ${r.with ? `${/^[aeiou]/i.test(noun) ? 'an' : 'a'} ${noun}${same}${rest}` : `another${same}`}`
      }
      if ('endState' in o && o.endState.state?.where?.lowers) return `every effect lowering ${s.poss} ${list(o.endState.state.where.lowers.map((t: N) => stat(t, third('')).trim().replace(/^'s /, '').replace(/ score$/, '')).filter(Boolean), 'or')
        .replace(/hit point maximum or Strength, Dexterity, Constitution, Intelligence, Wisdom, or Charisma/, 'hit point maximum or ability scores')} ends`
      if ('endState' in o && typeof o.endState.state === 'object') {
        // "one spell of your choice on it ends"
        const st = o.endState.state, c = 'choose' in st ? st.choose : undefined
        const noun = (x: N) => typeof x === 'string' ? lower(x)
          : x.where && Object.keys(x.where).length === 1 && x.where.against?.sourceType && Object.keys(x.where.against).length === 1 ? list(asArray(x.where.against.sourceType).map(lower), 'or')
          : `effect${x.where ? ` where ${clause(x.where)}` : ''}`
        const what = list((c ? c.from : [st]).map(noun), 'or')
        return c ? `${countText(c.count ?? 1)} ${what} of your choice on ${s.obj} ends` : `every ${what} on ${s.obj} ends`
      }
      if ('endState' in o) return o.endState.levels !== undefined
        ? (typeof o.endState.levels === 'number' ? `${s.s} ${verb(s, 'lose')} ${o.endState.levels} ${name(o.endState.state)} level${o.endState.levels === 1 ? '' : 's'}`
          : `${s.s} ${verb(s, 'lose')} ${name(o.endState.state)} levels equal to ${value(o.endState.levels)}`)
        : adjState(o.endState.state) ? `${s.s} ${s.you ? 'are' : 'is'} no longer ${lower(o.endState.state)}`
        : kindOf(o.endState.state) === 'state' ? `${s.s} no longer ${s.you ? 'have' : 'has'} ${name(o.endState.state)}`
        : s.you ? `you end ${stateName(o.endState.state)}` : `${stateName(o.endState.state)} ends on ${s.obj}`
      if ('damage' in o) {
        const t = o.damage.type
        const chosen = typeof t === 'object' && 'chosen' in t
        const picked = typeof t === 'object' && 'choose' in t
        const type = typeof t === 'string' ? name(t) : chosen || picked ? '' : t?.of === 'weapon' ? 'the weapon\'s type of' : t?.of === 'attack' ? 'the attack\'s type of' : '[type]'
        const of = chosen && t.value ? ` of ${chosenNoun(t).replace(/damage type/, 'type')}` : chosen ? ` of the chosen ${humanize(t.chosen).replace(/^damage /, '')}` : picked ? (t.choose.from.every((x: N) => typeof x === 'string') ? ` of a type of your choice: ${list(t.choose.from.map(name), 'or')}` : ' of a type of your choice') : ''
        return computed(o.damage.amount)
          ? `${s.s} ${verb(s, 'take')} ${type ? `${type} ` : ''}damage${of} equal to ${value(o.damage.amount)}`
          : `${s.s} ${verb(s, 'take')} ${value(o.damage.amount)} ${type ? `${type} ` : ''}damage${of}`
      }
      if ('tempHp' in o) return `${s.s} ${verb(s, 'gain')} ${computed(o.tempHp.amount) ? `temporary hit points equal to ${value(o.tempHp.amount)}` : `${value(o.tempHp.amount)} temporary hit points`}`
      if ('heal' in o && typeof o.heal.amount === 'object' && 'max' in o.heal.amount && typeof o.heal.amount.max[0] === 'number')
        return `${s.s} ${verb(s, 'regain')} hit points equal to ${value(o.heal.amount.max[1])} (minimum ${o.heal.amount.max[0]})`
      if ('destroy' in o) return `${s.s} ${s.you ? 'are' : 'is'} destroyed`
      if ('random' in o) {
        // "roll a d20: on a 1, this item is destroyed"
        const r = o.random
        const rows = (r.results ?? []).map((x: N) => `on ${x.range[0] === x.range[1] ? `a ${x.range[0]}` : `a ${x.range[0]}–${x.range[1]}`}, ${list(x.outcomes.map((y: N) => outcome(y, s)))}`)
        return r.dice && rows.length ? `roll ${r.dice.replace(/^1d/, 'a d')}: ${rows.join('; ')}` : '[random]'
      }
      if ('heal' in o && o.heal.split) return `you restore ${value(o.heal.amount)} hit points, divided as you choose among them`
      if ('heal' in o && JSON.stringify(o.heal.amount).includes('"chosen"')) return `${s.s} ${verb(s, 'regain')} hit points equal to ${value(o.heal.amount)}`
      if ('heal' in o) return `${s.s} ${verb(s, 'regain')} ${value(o.heal.amount)} hit point${o.heal.amount === 1 ? '' : 's'}`
      if ('kill' in o) return `${s.s} ${verb(s, 'die')}`
      if ('setHp' in o && readOf(o.setHp)?.field === 'hp.max') return `${s.s} ${verb(s, 'regain')} all lost hit points`
      if ('setHp' in o) return `${s.s} ${s.you ? 'drop' : 'drops'} to ${value(o.setHp)} hit point${o.setHp === 1 ? '' : 's'}`
      if ('move' in o) {
        const m = o.move
        const toward = m.toward?.awayFrom === 'self' ? ' away from you' : ''
        if (m.kind === 'fall') return `${s.s} ${verb(s, 'fall')}`
        if (m.kind === 'swap') return `${s.s} ${verb(s, 'swap')} places with the target`
        if (m.kind === 'teleport') return `${s.s} ${verb(s, 'teleport')}${m.distance !== undefined ? ` up to ${value(m.distance)} feet` : ''}${m.where ? ` to an unoccupied space ${relative(m.where)}` : ''}`
        if (m.where) {
          const to = `move to a space ${relative(m.where).replace(/^within/, 'within')}`
          return m.cost ? `${s.s} ${verb(s, 'use')} ${s.poss} ${list(m.cost.map((c: N) => humanize(c.resource)))} to ${to}` : `${s.s} ${s.you ? to : to.replace(/^move/, 'moves')}`
        }
        const free = m.provokes === false ? ' without provoking opportunity attacks' : ''
        if (m.kind === 'move' && !m.toward) return `${s.s} ${s.you ? 'move' : 'moves'} up to ${distance(m.distance)}${free}`
        return `${s.s} ${be(s)} ${m.kind === 'push' ? 'pushed' : 'moved'} ${distance(m.distance)}${toward}${free}`
      }
      // A nested step with its own roll or recipients reads as a step: "that creature must succeed on a DC 15 Wisdom saving throw or …"
      if ('then' in o && (o.then.delivery || o.then.target || o.then.area)) return step(o.then, base)
      if ('then' in o) return list((o.then.outcomes ?? []).map((x: N) => outcome(x, base)))
      if ('choose' in o) {
        const c = o.choose
        const who = c.by && c.by !== 'self' ? `${roleSubject(c.by).s} ${roleSubject(c.by).you ? 'choose' : 'chooses'}` : 'choose'
        return `${who} ${countText(c.count ?? 1)}: ${c.from.map((x: N) => 'of' in x ? `${x.name} (${list(x.of.map((y: N) => outcome(y, base)))})` : outcome(x, base)).join('; or ')}`
      }
      if ('runs' in o) {
        const against = base.you ? '' : ` against ${base.obj === 'it' ? base.s : base.obj}`
        // "take the Dash or Disengage action (your choice)"
        const rules = (r: N) => r.activity?.choose?.from.every((x: N) => typeof x === 'string' && kindOf(x) === 'rule') ? r.activity.choose.from : undefined
        if (o.runs.length === 1 && rules(o.runs[0])) return `take the ${list(rules(o.runs[0]).map(name), 'or')} action (your choice)`
        if (o.runs.every((r: N) => typeof r.matching?.activity === 'string' && kindOf(r.matching.activity) === 'rule')) return `take the ${list(o.runs.map((r: N) => name(r.matching.activity)))} action${o.runs.length > 1 ? 's' : ''}`
        return `make ${o.runs.map((r: N) => `${r.times === 1 || r.times === undefined ? 'one' : value(r.times)} ${runNoun(r)}`).join(' and ')}${against}`
      }
      if ('pool' in o) {
        const p = o.pool
        if (typeof p.add === 'string' && readOf(p.add)?.segs.join('.') === `spent.${p.resource}`) return `${s.s} ${verb(s, 'regain')} all ${s.poss} spent ${humanize(p.resource)}`
        if (p.add !== undefined && p.resource === 'hit-dice') return `${s.s} ${verb(s, 'regain')} spent Hit Dice, up to ${value(p.add)}`
        if (typeof p.add === 'object' && p.add.times === -1) return `${s.poss} ${humanize(p.resource)} ${p.resource.endsWith('s') ? 'lose' : 'loses'} ${value(p.add.by)}`
        if (p.add !== undefined) return p.resource === 'object-interaction' ? `${s.s} can interact with one more object this turn`
          : `${s.s} ${verb(s, 'gain')} ${value(p.add)} ${p.add === 1 ? singular(p.resource) : humanize(p.resource)}`
        if (typeof p.spend === 'number' && ['action', 'bonus-action', 'reaction'].includes(p.resource)) return `${s.s} must use ${s.poss} ${humanize(p.resource)}`
        if (typeof p.spend === 'number') return `${s.poss} ${humanize(p.resource)} ${p.resource.endsWith('s') ? 'go' : 'goes'} down by ${p.spend}`
        if (p.spend?.choose) {
          const c = p.spend.choose, r = c.from[0], dice = p.resource === 'hit-dice'
          return `${s.s} ${c.optional ? 'can ' : ''}${dice ? 'spend and roll' : 'spend'} ${r.atMost === undefined ? 'any number' : `up to ${value(r.atMost)}`} of ${s.poss} ${dice ? 'Hit Dice' : humanize(p.resource)}`
        }
        return `${s.poss} ${humanize(p.resource)} reset${p.resource.endsWith('s') ? '' : 's'} to 0`
      }
      if ('intercept' in o) {
        const i = o.intercept
        if (i.mode) return `${s.s} ${verb(s, 'have')} ${i.mode} on that roll`
        const c = i.set ?? {}
        if (i.reroll) return `${s.s} reroll${s.you ? '' : 's'} the die${c.$add !== undefined ? `, adding ${value(c.$add)},` : ''} and must use the new roll`
        if (c.$subtract !== undefined) return `reduce the damage by ${value(c.$subtract)}`
        if (c.$add !== undefined) return `add ${value(c.$add)} to the roll`
        if (i.cancel) return 'prevent it'
        if (c.$replace !== undefined) return `treat the roll as ${value(c.$replace)}`
        if (i.redirect) return `make the attack target ${who(i.redirect)} instead`
        if (i.crit === false) return 'turn the critical hit into a normal hit'
        if (i.success !== undefined) return i.success ? 'turn the roll into a success' : 'turn the roll into a failure'
        return '[intercept]'
      }
      if ('zone' in o) {
        const z = o.zone
        const where = z.anchor === 'self' ? (lower(z.area.shape) === 'emanation' ? ` ${value(z.area.size)} feet around ${s.obj}` : ` from ${s.obj}`) : ''
        const size = z.anchor === 'self' && lower(z.area.shape) === 'emanation' ? 'an area' : `a ${value(z.area.size)}-foot ${lower(z.area.shape)}`
        const lasts = z.duration && typeof z.duration === 'object' ? ` for ${value(z.duration.amount)} ${z.duration.unit}${z.duration.amount === 1 ? '' : 's'}` : ''
        const rules = [...(z.effects ?? []).map((e: N) => uncap(effect(e)).replace(/\.$/, '')), ...(z.on ?? []).map((r: N) => `${list(asArray(r.on).map((x: N) => trigger(x).when), 'or')}, ${step(r.step)}`)]
        return `${size}${where} is affected${lasts}${rules.length ? `: ${rules.join('; ')}` : ''}`
      }
      if ('cast' in o) {
        const c = o.cast
        const what = typeof c.spell === 'string' ? name(c.spell) : c.spell && 'chosen' in c.spell ? `the ${humanize(c.spell.chosen)} you chose` : c.spell && 'kind' in c.spell ? `a spell: ${activityNoun({ spell: c.spell }).replace(/^spells/, 'one of the spells')}` : 'the chosen spell'
        const sp = spellChanges(c.set, s)
        return `${s.s} cast${s.you ? '' : 's'} ${what}${c.castAt !== undefined ? ` at level ${value(c.castAt)}` : ''}${c.slot === false ? ' without expending a spell slot' : ''}${sp.components ? `, ${sp.components}` : ''}${c.stats?.dc !== undefined ? ` (save DC ${value(c.stats.dc)})` : ''}${c.stats?.attack !== undefined ? ` (attack bonus +${value(c.stats.attack)})` : ''}${sp.changes.length ? `; cast this way, it ${list(sp.changes)}` : ''}`
      }
      if ('summon' in o) {
        const m = o.summon
        return `${s.s} ${verb(s, 'summon')} ${m.creature ? `${/^[aeiou]/i.test(name(m.creature)) ? 'an' : 'a'} ${name(m.creature)}` : m.copyOf ? `a copy of ${roleSubject(m.copyOf).obj}` : 'a creature'}${m.duration && typeof m.duration === 'object' ? ` for ${value(m.duration.amount)} ${m.duration.unit}${m.duration.amount === 1 ? '' : 's'}` : ''}`
      }
      if ('revive' in o) return `${s.s} ${s.you ? 'return' : 'returns'} to life with ${value(o.revive.hp)} hit points`
      if ('create' in o) {
        const c = o.create
        const lasts = c.duration && typeof c.duration === 'object' ? ` that lasts ${value(c.duration.amount)} ${c.duration.unit}${c.duration.amount === 1 ? '' : 's'}` : ''
        return `${s.s} ${verb(s, 'create')} ${c.item ? `${/^[aeiou]/i.test(name(c.item)) ? 'an' : 'a'} ${name(c.item)}` : c.object ? `${/^[aeiou]/i.test(c.object.name) ? 'an' : 'a'} ${lower(c.object.name)}` : 'an object'}${lasts}`
      }
      if ('grant' in o) {
        const gr = o.grant
        const spend = gr.cost ? `use ${s.poss} ${list(gr.cost.map((c: N) => humanize(c.resource)))} to ` : ''
        const free = gr.provokes === false ? ' without provoking opportunity attacks' : ''
        if (gr.movement !== undefined) return `${s.s} can ${spend}move up to ${distance(gr.movement)}${free}`
        if (gr.activity) return `${s.s} can ${spend}${typeof gr.activity === 'string' ? `use ${humanize(gr.activity)}` : `make ${list([gr.activity.matching].map((m: N) => 'attack' in m ? attackNoun(m.attack, true) : 'activity' in m ? `the ${name(m.activity)} action` : '[grant]'))}`}${free}`
        return '[grant]'
      }
      if ('drop' in o) return `${s.s} ${verb(s, 'drop')} whatever ${s.you ? 'you are' : 'it is'} holding`
      if ('prose' in o) return uncap(o.prose.text.replace(/\.$/, ''))
      return `[${Object.keys(o).find((k) => !['to', 'when', 'key'].includes(k))}]`
    })()
    return lead + body
  }

  function runNoun(r: N): string {
    const m = r.matching
    if (!m) return r.activity?.choose ? `${list(r.activity.choose.from.map((x: N) => typeof x === 'string' && x.includes(':') ? name(x) : humanize(x)), 'or')} (your choice)` : humanize(r.activity)
    const one = (x: N): string => 'attack' in x ? attackNoun(x.attack) : 'activity' in x ? `${name(x.activity)} option` : '[option]'
    return 'any' in m ? list(m.any.map(one), 'or') : one(m)
  }

  // A check, or a choice of checks the roller picks from: "Strength (Athletics) or Dexterity (Acrobatics)".
  const checks = (c: N): string => c.choose ? list(c.choose.from.map(checks), 'or') : `${name(c.ability)}${c.skill ? ` (${list(asArray(c.skill).map(name), 'or')})` : ''}`

  // `around`: who a nested step with no target of its own acts on, the enclosing step's recipients
  function step(st: N, around?: Subject): string {
    const me = roleSubject('self')
    const w = st.target?.who
    const pooled = w && typeof w === 'object'
    // A filtered target is chosen first, then called "it".
    const tgt = w === 'self' ? me : pooled ? third('it') : w ? roleSubject(w) : around && !around.you ? { ...around } : third('the target')
    if (pooled && st.target.count !== undefined && st.target.count !== 1 && st.target.count !== 'all') Object.assign(tgt, { s: 'each of them', poss: 'their', obj: 'them' })
    // "choose up to six allies (which can include you)"
    const n = st.target?.count
    const many = n !== undefined && n !== 'all' && !(typeof n === 'number' && n === 1)
    const howMany = n === undefined || !many ? '' : typeof n === 'number' ? `${countText(n)} ` : n.atMost !== undefined && n.atLeast === undefined ? `up to ${countText(n.atMost)} ` : n.atMost === undefined && n.atLeast === 0 ? 'any number of ' : n.atMost === undefined && n.atLeast === 1 ? 'one or more ' : `${countText(n)} `
    const mine = pooled && w.includeSelf && w.pool !== 'any' ? ` (which can include ${me.obj})` : ''
    const choose = pooled ? `choose ${howMany}${many ? who(w, true) : who(w)}${mine}${st.range?.touch ? ' that you touch' : ''}. ` : ''
    const outs = (os: N[] | undefined, base: Subject) => (os ?? []).map((o) => outcome(o, base)).join('; ')
    const d = st.delivery
    // "each creature in a 15-foot Cone from you"
    if (st.area && !w) {
      const a = st.area
      const one = (x: N) => {
        if (typeof x.shape === 'object') return `the area your ${nameOf(x.shape.from)} sets`
        return `a ${value(x.size)}-foot ${lower(x.shape)}${x.width !== undefined ? ` ${value(x.width)} feet wide` : ''}${x.origin === 'self' ? ' from you' : ''}`
      }
      const where = 'choose' in a ? `${list(a.choose.from.map((g: N) => one(g.of[0])), 'or')} (your choice each time)` : one(a)
      tgt.s = `each creature in ${where}`; tgt.obj = 'it'; tgt.poss = 'its'
    }
    const after = (st.area || /^each /.test(tgt.s)) && !w ? third('it') : tgt
    let s: string
    if (!d) s = choose + outs(st.outcomes, w || st.area ? tgt : me)
    else if ('attack' in d) {
      const bonus = (d.attack.bonus ? ` with a bonus of ${value(d.attack.bonus)}` : '')
        + (st.range?.distance !== undefined ? ` (range ${value(st.range.distance)}${st.range.long !== undefined ? `/${value(st.range.long)}` : ''} feet)` : '')
      s = `${choose}${me.s} ${verb(me, 'make')} ${attackNoun(d.attack, true)}${bonus}${w ? ` against ${tgt.obj}` : ''}. On a hit, ${outs(st.outcomes, w ? tgt : third('the target'))}`
    } else if ('save' in d) {
      const kind = d.save.ability && typeof d.save.ability === 'object' && 'chosen' in d.save.ability ? `saving throw of the ability your ${nameOf(d.save.ability.from)} sets`
        : d.save.ability ? `${list(asArray(d.save.ability).map(name), 'or')} saving throw` : lower(d.save.kind)
      if (d.save.by === 'self') s = `${me.s} ${verb(me, 'make')} a DC ${value(d.save.dc)} ${kind}${st.outcomes?.length ? `. On a success, ${outs(st.outcomes, me)}` : ''}`
      else {
        const choiceNote = asArray(d.save.ability).length > 1 ? 'its choice' : ''
        const dc = typeof d.save.dc === 'number' ? `a DC ${d.save.dc} ${kind}${choiceNote ? ` (${choiceNote})` : ''}` : `a ${kind} (${[choiceNote, `DC ${value(d.save.dc)}`].filter(Boolean).join('; ')})`
        s = `${choose}${choose ? cap(tgt.s) : tgt.s} must succeed on ${dc} or ${outs(st.outcomes, after)}`
      }
      if (Array.isArray(st.otherwise) && st.otherwise.length) s += d.save.by === 'self' ? `. On a failure, ${outs(st.otherwise, me)}` : `. On a successful save, ${outs(st.otherwise, after)}`
    } else if ('check' in d) {
      const c = `DC ${value(d.check.dc)} ${checks(d.check)} check`
      const base = w && w !== 'self' ? tgt : me
      s = d.check.by === 'self'
        ? `${choose}${me.s} ${verb(me, 'make')} a ${c}.${st.outcomes?.length ? ` On a success, ${outs(st.outcomes, base)}` : ''}${Array.isArray(st.otherwise) && st.otherwise.length ? ` On a failure, ${outs(st.otherwise, base)}` : ''}`.replace(/\.$/, '')
        : `${choose}${cap(tgt.s)} must succeed on a ${c} or ${outs(st.outcomes, tgt)}`
    } else if ('contest' in d) {
      s = `${choose}${me.s} ${verb(me, 'make')} a ${checks(d.contest.self)} check contested by ${tgt.poss} ${checks(d.contest.target)} check. If ${me.s} ${me.you ? 'win' : 'wins'}, ${outs(st.outcomes, tgt)}`
    } else s = '[delivery]'
    if (st.otherwise === 'half') s += '. On a success, half as much damage'
    if (st.origin) s += `. It comes from ${who(st.origin)}`
    return s
  }

  // An event something sets off: "When it finishes, the Rest Finished event happens (rest: long rest)."
  const MOMENTS: Record<string, (x: string) => string> = {
    started: (x) => `when ${x} starts`, finished: (x) => `when ${x} finishes`, rolled: (x) => `when ${x} makes its roll`,
    resolved: (x) => `once the roll of ${x} is settled`, applying: (x) => `just before ${x} takes effect`, applied: (x) => `once ${x} takes effect`,
  }
  // What an activity's delivery calls for: "an activity that calls for a saving throw"
  function deliveryNoun(w: N): string | undefined {
    if (w.all?.length === 2 && 'not' in w.all[1]) {
      const [a, b] = [deliveryNoun(w.all[0]), deliveryNoun(w.all[1].not)]
      return a && b ? `${a}, other than ${b}` : undefined
    }
    const d = w.match?.delivery
    if ('attack' in w && Object.keys(w).length === 1) return 'an activity that makes an attack'
    if (!plain(d) || Object.keys(d).length !== 1) return undefined
    if (d.check?.by === 'self') return 'an activity whose user makes an ability check'
    if (d.save?.kind) return 'an activity that calls for a particular kind of saving throw'
    const what = { attack: 'makes an attack', check: 'calls for an ability check', save: 'calls for a saving throw', contest: 'calls for a contest' }[Object.keys(d)[0]]
    return what && `an activity that ${what}`
  }
  function emitLine(x: N): string {
    const what = !x.for ? 'it' : (x.for.where && deliveryNoun(x.for.where))
      ?? `${x.for.kind === 'activity' ? 'an activity' : 'an outcome'}${x.for.where ? ` where ${clause(x.for.where)}` : ''}`
    const fields = Object.entries(x.fields ?? {}).filter(([k, v]) => !(plain(v) && (v as N).settled === k))
      .map(([k, v]) => `${humanize(k)}: ${v === 'this' ? 'this' : v === 'target' ? 'the target' : typeof v === 'string' && v.includes(':') ? lower(v) : value(v)}`)
    const whose = x.by ? ` for ${typeof x.by === 'string' ? roleSubject(x.by).s : who(x.by)}` : ''
    return `${cap(MOMENTS[x.at](what))}${x.when ? ` and ${clause(x.when)}` : ''}, the ${name(x.event)} event happens${whose}${fields.length ? ` (${fields.join('; ')})` : ''}.`
  }

  function activity(a: N): string {
    const emitted = (a.emits ?? []).map(emitLine).join(' ')
    if (emitted && !a.outcomes && !a.step && !a.effects?.length && !a.action && !a.trigger && !a.cost?.length)
      return `${a.time ? `It takes ${value(a.time.amount)} ${a.time.unit}${a.time.amount === 1 ? '' : 's'}. ` : ''}${emitted}`
    const costs = (a.cost ?? []).map(function cost(c: N): string {
      if ('oneOf' in c) {
        // "1 to 5 sorcery points"
        const one = c.oneOf.every((alt: N[]) => alt.length === 1 && alt[0].resource === c.oneOf[0][0].resource && typeof alt[0].amount === 'number')
        if (one && c.oneOf.length > 2) return `${c.oneOf[0][0].amount} to ${c.oneOf.at(-1)[0].amount} ${humanize(c.oneOf[0][0].resource)}`
        return list(c.oneOf.map((alt: N[]) => list(alt.map(cost))), 'or')
      }
      if (c.resource === 'action') return 'an action'
      if (c.resource === 'bonus-action') return 'a bonus action'
      if (c.resource === 'reaction') return 'your reaction'
      if (c.resource === 'movement') return `movement equal to ${value(c.amount)}`
      if (c.resource === 'hit-dice') {
        if (c.amount?.choose) { const r = c.amount.choose.from[0]; return r.atMost === undefined ? 'any number of your Hit Dice' : `up to ${value(r.atMost)} of your Hit Dice (your choice)` }
        return (c.amount ?? 1) === 1 ? 'one of your Hit Dice' : `${value(c.amount)} of your Hit Dice`
      }
      if (c.forgo === 'attack') return 'one of your attacks'
      if (c.resource === 'spell-slots' || typeof c.resource === 'object') return costNoun(c.resource)
      if ('currency' in c) return `${value(c.currency)} ${name(c.unit)}`
      if (typeof c.amount === 'object' && 'choose' in c.amount) {
        // "as many lay on hands points as you choose", "up to the higher of 1 and your Charisma modifier healing dice (your choice)"
        const r = c.amount.choose.from[0]
        return r.atMost === undefined ? `as much of your ${humanize(c.resource)} as you choose` : `up to ${value(r.atMost)} ${humanize(c.resource)} (your choice)`
      }
      if ((c.amount ?? 1) !== 1) return `${value(c.amount)} ${humanize(c.resource)}`
      return singular(c.resource) !== humanize(c.resource) ? `1 ${singular(c.resource)}` : `a use of your ${humanize(c.resource)}`
    })
    const named = a.action ? ` (the ${name(a.action)} action)` : ''
    const cond = a.when ? ('not' in a.when ? `unless ${clause(a.when.not)}` : `if ${clause(a.when)}`) : ''
    const effectText = (a.effects ?? []).map((e: N) => uncap(effect(e)).replace(/\.$/, '')).join('; ')
    // An activity whose only result is effects for its own use: "spend a use of your channel divinity to roll the maximum …"
    // A saving throw's subject is "the creature that forced the saving throw".
    const forcer: Record<string, Subject> = a.trigger?.event === 'event:roll-made' && JSON.stringify(a.trigger.when ?? {}).includes('"roll:save"') ? { subject: third('the creature that forced the saving throw') } : {}
    const body = within(forcer, () => step(a)) || (a.action ? `take the ${name(a.action)} action` : effectText)
    let lead: string
    if (costs[0] === 'one of your attacks') lead = `When you take the Attack action, you can replace one of your attacks${costs.length > 1 ? ` and spend ${list(costs.slice(1))}` : ''}: `
    else if (a.standalone === false) lead = `As one of the attacks of an action that makes attacks, such as the Attack action${cond ? `, ${cond}` : ''}, `
    else if (a.trigger) lead = `${cap(trigger(a.trigger).when)}${cond ? `, ${cond}` : ''}, you can ${costs.length ? `${/^a use of|^\d/.test(costs[0]) ? 'spend' : 'use'} ${list(costs)}${named} to ` : 'choose to '}`
    else if (costs.length && costs[0].startsWith('movement')) lead = `${cond ? `${cap(cond)}, you` : 'You'} can spend ${list(costs)} to `
    else if (costs.length && !['an action', 'a bonus action', 'your reaction'].includes(costs[0])) lead = `${cond ? `${cap(cond).replace(/^If you finish/, 'When you finish')}, you` : 'You'} can spend ${list(costs)} to `
    else if (costs.length) lead = `As ${costs[0] === 'your reaction' ? 'a reaction' : costs[0]}${named}${costs.length > 1 ? ` and ${list(costs.slice(1))}` : ''}${cond ? `, ${cond}` : ''}, `
    else lead = `At any time (no action required)${cond ? `, ${cond}` : ''}, `
    // "you can make" reads better than "you can you make"
    let joined: string
    if (lead.endsWith('to ') && /^you are no longer /.test(body)) joined = lead + body.replace(/^you are no longer /, 'stop being ')
    else if (lead.endsWith('to ') && /^you no longer have /.test(body)) joined = lead + body.replace(/^you no longer have /, 'end ')
    // A body that names someone else ("that creature takes …") can't follow "to".
    else if (lead.endsWith('to ')) joined = /^you /.test(body) ? lead + body.replace(/^you (can )?/, '')
      : !/^(the|that|this|each|every|it|its|a|an|any|your|on|if|unless|for|until|while|within|one|when|whenever|immediately)\b/.test(body) ? lead + body
      : `${lead.replace(/ (choose )?to $/, '').replace(/can$/, 'can use this feature')}. If you do, ${body}`
    else joined = lead + body
    // Once per casting on a roll: the bonus goes on one of the spell's rolls, not each
    const perCast = a.uses?.max === 1 && a.uses.recover?.length === 1 && a.uses.recover[0].on?.event === 'event:spell-cast' && a.trigger?.event === 'event:roll-made'
    const times = perCast ? ' You can do this to only one roll of each spell you cast.' : a.uses ? ` You can do this ${computed(a.uses.max) ? per(a.uses).replace(/^(.+?) times/, 'a number of times equal to $1') : per(a.uses)}.` : ''
    joined = joined.replace(/choose to choose /, 'choose ')
    const during = effectText && body !== effectText ? ` For that use, ${effectText}.` : ''
    return `${joined}.${times}${during}`.replace(/ +/g, ' ').replace(/\.\./g, '.').replace(/([.;:]) ([a-z])/g, (_m, p, c) => (p === '.' ? `. ${c.toUpperCase()}` : `${p} ${c}`))
  }

  // A choice standing for a whole effect, outcome, or feature, under its name:
  // "Fighting Style: Choose one of Archery, Defense, or Dueling."
  function chooseLine(c: N, item: (x: N) => string): string {
    const n = c.count ?? 1
    const many = n !== 1
    let from: string
    if (c.from.length === 1 && typeof c.from[0] === 'object' && 'kind' in c.from[0]) from = pickNoun(c.from[0], many)
    else if (c.from.some((x: N) => typeof x === 'object' && 'of' in x))
      from = `of: ${c.from.map((x: N) => 'of' in x ? `${x.name} (${x.of.map(item).join(' ')})` : typeof x === 'string' ? name(x) : 'kind' in x ? pickNoun(x, false) : item(x)).join('; or ')}`
    else from = `of ${list(c.from.map((x: N) => typeof x === 'string' ? name(x) : 'kind' in x ? pickNoun(x, false) : item(x)), 'or')}`
    const who = c.optional ? 'You can choose' : 'Choose'
    return `${c.name}: ${c.when ? `if ${clause(c.when)}, ` : ''}${c.when ? uncap(who) : who} ${countText(n)} ${from}${filterText(c.where)}${c.distinct ? ', each different' : ''}${eachText(c)}.`
  }

  /** The English for an entity's mechanics, one sentence or paragraph per line. */
  // The entity being rendered, for a choice named by key elsewhere in it.
  let current: N = {}
  function choiceName(key: string, from?: string): string {
    let found: string | undefined
    const walk = (x: N): void => {
      if (found || !x || typeof x !== 'object') return
      if (x.choose?.key === key) { found = x.choose.name; return }
      Object.values(x).forEach(walk)
    }
    if (!from) walk(current)
    return found ?? cap(humanize(key))
  }
  function entity(e: N): string[] {
    current = e
    return within(e.sourceName ? { source: third(e.sourceName) } : {}, () => {
      const out: string[] = []
      if (e.requires) out.push(`Prerequisite: ${clause(e.requires)}.`)
      if (e.creatureType) out.push(`Creature type: ${list(asArray(e.creatureType).map(name), 'or')}${e.tags?.length ? ` (also ${list(e.tags.map(name))})` : ''}.`)
      if (e.countsAs?.length) out.push(`Also counts as ${list(e.countsAs.map(name))}.`)
      if (e.size) out.push(`Size: ${list(asArray(e.size).map(name), 'or')}${Array.isArray(e.size) && e.size.length > 1 ? ' (you choose)' : ''}.`)
      if (e.speeds) out.push(`Speed: ${list(Object.entries(e.speeds).map(([mode, x]: [string, N]) => `${lower(mode)} ${value(x.speed)} feet${x.hover ? ' (hover)' : ''}`))}.`)
      if (e.appliesTo?.where) out.push(`For ${who(e.appliesTo, true)}:`)
      if (e.base) {
        const made = (id: string) => `Made from ${/^[aeiou]/i.test(name(id)) ? 'an' : 'a'} ${lower(id)}`
        out.push(typeof e.base === 'string' ? `${made(e.base)}.`
          : e.base.item ? `${made(e.base.item)}, ${list(Object.entries(e.base.chosen).map(([k, v]) => k === 'base' ? `itself made from ${list(asArray(v as string).map((id) => `${/^[aeiou]/i.test(name(id)) ? 'an' : 'a'} ${lower(id)}`))}` : `with ${list(asArray(v as string).map(lower))} as its ${humanize(k)}`))}.`
          : chooseLine(e.base.choose, name))
      }
      if (e.isA && kindOf(e.id) === 'state') out.push(`A kind of ${stateName(e.isA)}.`)
      if (e.when && kindOf(e.id) === 'state') out.push(`It works only while ${clause(e.when)}.`)
      if (e.duration && typeof e.duration === 'object' && e.duration.amount !== undefined && kindOf(e.id) === 'state')
        out.push(`It lasts ${value(e.duration.amount)} ${e.duration.unit}${e.duration.amount === 1 ? '' : 's'}.`)
      if (e.implies?.length) out.push(`You also have ${list(e.implies.map(stateName))}.`)
      if (e.concentration) out.push('It requires concentration.')
      if (e.stacks === 'levels') out.push(`It stacks in levels, up to ${e.maxLevel ?? 'any number'}.`)
      for (const [k, v] of Object.entries(e.values ?? {})) out.push(`${cap(humanize(k).replace(/^push drag lift/, 'push, drag, or lift'))}: ${value(v)}.`)
      for (const x of e.effects ?? []) out.push(effect(x))
      for (const a of e.activities ?? []) out.push(`${a.name ?? cap(humanize(a.key))}. ${activity(a)}`)
      for (const f of e.features ?? []) if (typeof f === 'object' && 'choose' in f) out.push(chooseLine(f.choose, name))
      for (const x of e.startingEquipment ?? []) if ('choose' in x) out.push(chooseLine(x.choose, (y: N) => 'item' in y ? name(y.item) : `${value(y.amount)} ${name(y.currency)}`))
      if (e.firstClass?.length) out.push(`If this is your first class, you gain ${list(e.firstClass.map(name))}.`)
      if (e.multiclass) {
        const m = e.multiclass
        out.push(`If it isn't${m.requires ? `, you need ${clause(m.requires)} to take it, and` : ','} you gain ${m.features?.length ? list(m.features.map(name)) : 'none of those'} instead.`)
      }
      for (const x of e.emits ?? []) out.push(emitLine(x))
      if (e.ends?.length) out.push(`It ends ${list(e.ends.map((t: N) => trigger(t).when), 'or')}.`)
      if (e.defines?.length) out.push(`Defines ${list(e.defines.map(name))}.`)
      return out
    })
  }

  return {
    entity: (e: N) => entity(phrases(older(e))),
    effect: (e: N, ...rest: N[]) => (effect as N)(phrases(older(e)), ...rest),
    activity: (a: N, ...rest: N[]) => (activity as N)(phrases(older(a)), ...rest),
    value, clause: (p: N, ...rest: N[]) => (clause as N)(phrases(older(p, 'when')), ...rest), chooseLine,
  }
}
