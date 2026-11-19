// The core mechanics grammar: Values, Predicates, Effects, States, Activities,
// Outcomes, and Triggers. See design/model/ for the reasoning.
//
// These declarations refer to each other by name (Ref('Value')), so they are
// assembled into one TypeBox Module in index.ts.

import Type, { type TSchema, type TProperties } from 'typebox'
import {
  KeyedBy, Obj, Opt, OneOf, OneOrMany, Ref, AnyId, Key, DiceString, IdOf,
  AbilityRef, SkillRef, SizeRef, DamageTypeRef, SenseRef, MovementModeRef, CurrencyRef,
  GroupRef,
  ActionRef, EventRef, RestRef, RestrictionRef, RollRef,
  SourceTypeRef, AreaShapeRef, EnvironmentRef, TableRef, PlaneRef, StateRef,
  ClassRef, SubclassRef, SpellRef, ItemRef, CreatureRef, StandingRef, KindName, FeatureRef,
  TimeUnit, Role, Gap,
} from './base.ts'

const Value = Ref('Value')
const Predicate = Ref('Predicate')
const Who = Ref('Who')
const Trigger = Ref('Trigger')
const Outcome = Ref('Outcome')
const Step = Ref('Step')
const Effect = Ref('Effect')
const Activity = Ref('Activity')
const Duration = Ref('Duration')
const Uses = Ref('Uses')
const Zone = Ref('Zone')

const Compare = { atLeast: Opt(Value), atMost: Opt(Value) }

/** Edits to stored fields, in the patch grammar of patch files (bundles.md "Patch operations"). */
const Patch = KeyedBy('^(?!\\$|id$).+', Ref('PatchValue'), { minProperties: 1, additionalProperties: false })
/** A patch on the spell for this way of casting it only. A spell's casting is its `cast` activity:
 *  {"activities": {"cast": {"concentration": {"$delete": true}}}}; its components are on the spell:
 *  {"components": {"material": {"$delete": true}}}, or {"components": {"$replace": {}}} for none. */
const SpellPatch = KeyedBy('^(?!\\$|id$).+', Ref('PatchValue'), { minProperties: 1, additionalProperties: false,
  description: 'Changes to the spell when cast this way, in the patch grammar: {"activities": {"cast": {"concentration": {"$delete": true}}}}' })

/** What was picked by a `choose` elsewhere in the entity or activity, by its key:
 *  the damage type chosen when the spell was cast, the ability Resilient raised.
 *  Like a choice, it stands in any field without the field declaring it (global.ts). */
const ChosenDecl = Obj({ chosen: Key, value: Opt(Key), from: Opt(AnyId) },
  'A read of a pick, standing in any field: `value` reads a named value from the picked entity\'s `values` instead of the pick itself (the damage type of the chosen dragon); `from` is the entity the choice is on, when not this one')

/** Any entity of a kind, optionally filtered: "any skill", "a tool". A choice's candidates and
 *  the fields that hold only a filter use this; every id field takes one of its own kinds (global.ts). */
export const Pick = Obj({ kind: KindName, where: Opt(Predicate) }, 'Any entity of this kind that matches `where`')

/** The one way to write a choice: it stands where an item or value goes, and its
 *  candidates are what that place holds. Other rules read the pick with {chosen: key}.
 *  No field declares one: the checker puts each candidate in the choice's place and
 *  checks that (choices.ts), so the declaration checks only the choice's own fields. */
const choiceFields = <F extends TSchema>(from: F) => ({
  key: Key,
  name: Type.String({ minLength: 1, description: 'What a UI shows for the choice: "Skill Proficiencies"' }),
  count: Opt(Type.Union([Value, Obj(Compare)], { description: 'How many to pick; 1 if omitted' })),
  from,
  where: Opt(Predicate),
  distinct: Opt(Type.Boolean()),
  each: Opt(Value), // how many times one candidate can be picked; each pick applies once: three +1s, at most two on one ability
  optional: Opt(Type.Boolean()),
  when: Opt(Predicate),
  by: Opt(Role), // who picks in play, if not the one gaining it: a shove's target. A pick the DM makes at the table is entered like any other
})
const ChoiceDecl = Obj({ choose: Obj(choiceFields(Type.Array(Type.Union([
  Type.Unknown({ description: 'An item or value of the kind the choice stands for' }),
  Pick,
  Obj({ name: Type.String({ minLength: 1 }), of: Type.Array(Type.Unknown(), { minItems: 1 }) }, 'Several items taken together as one candidate, under a name: a house\'s tools'),
]), { minItems: 1 }))) }, 'A choice standing in for an item or value, anywhere one goes')
/** A choice whose candidates are typed here, for the one place a choice sits beside other fields: a check's. */
const ChooseBody = <T extends TSchema>(t: T) => Obj(choiceFields(Type.Array(Type.Union([t, Pick]), { minItems: 1 })))
const TimeSpan = Obj({ amount: Value, unit: TimeUnit })
// An activity: one by its key, any activity of an entity by the entity's id, or
// any activity matching a filter, whose `match` reads the activity's stored fields:
// "the Attack action" is {kind: activity, where: {match: {action: "action:attack"}}}.
const ActivityPick = Type.Union([Key, AnyId, Obj({ kind: Type.Literal('activity'), where: Opt(Predicate) })])
// A pool: one by its key or its group's key, or any pool matching a filter, whose
// `match` reads the fields of the `resource` effect that declares it: "a spell slot
// of level 2 or higher" is {kind: pool, where: {match: {group: "spell-slots", values: {level: {atLeast: 2}}}}}.
const PoolPick = Type.Union([Key, Obj({ kind: Type.Literal('pool'), where: Opt(Predicate) })])

// Values -------------------------------------------------------------------

/** A read of a field by its path: "target.hp.max", "modifiers.ability:wis", "levels.class:cleric".
 *  The first segment is a role (or `candidate`); with none, the path reads the creature in
 *  question, as `match` does: each candidate in a filter, the recipient in an outcome's `when`,
 *  otherwise self. A segment in braces reads a pick: "speeds.{speed}.speed"; a `*` reads every entry, as a list for `sum`, `max`, or `min`. What is read is the
 *  field with every effect applied. A stored field is in the kind's schema; a computed one
 *  (proficiency bonus, modifiers, levels) exists because a rule computes it, so no list of
 *  readable facts is kept (design/model/roles-and-values.md). */
const PathDecl = Type.String({
  pattern: '^(?!unlimited$)(?:(?:self|this|target|source|subject|actor|candidate)\\.)?[a-z][A-Za-z]*(?:\\.(?:[A-Za-z0-9][A-Za-z0-9/_+:@-]*|\\*|\\{[a-z0-9][a-z0-9-]*(?:\\.[a-z0-9][a-z0-9-]*)*\\}))*$',
  description: 'A field read by its path: "target.hp.max"; with no role, the creature in question',
})

const ValueDecl = Type.Union([
  Type.Number(),
  DiceString,
  Ref('Path'),
  Type.Literal('unlimited'),
  Obj({ dice: Obj({ count: Value, die: Value, plus: Opt(Value) }) }, 'Computed dice: Sneak Attack, upcasting'),
  Obj({
    byLevel: KeyedBy('^[0-9]+$', Value),
    of: Opt(ClassRef),
  }, 'A value that steps up at the listed levels (class level with `of`, otherwise character level)'),
  Obj({ table: Type.Union([TableRef, Ref('Path')]), column: Opt(Type.String()), by: Opt(Value) },
    'A table\'s column at a level: `by`, or the level in the class the rule came from. The table is an id, or a path to a field that holds one: "spellcasting.{at}.slots"'),
  Obj({ slotLevel: Type.Literal(true) }, 'The level the spell was cast at'),
  Obj({ value: Key, from: Opt(AnyId) }, "A named value from an entity's `values` (default: the entity the rule is on)"),
  Obj({ stackLevel: StateRef }, 'The level of a stacking state, such as exhaustion'),
  Obj({ pool: Key, facet: Type.Literal('spent') }, 'The total on the units of this pool that this use\'s cost spent: their kept numbers in a `rolled` pool, or a roll of their dice (Hit Dice). `pool` can name a group. A fact of the moment, not a field, like an event\'s'),
  Obj({ count: Who }, 'How many creatures or objects the who picks right now: "the number of allies you can see within 30 feet"'),
  Obj({ event: Type.String() }, 'A field of the triggering event, or of the event a `when` tests'),
  Obj({ bonus: Type.Record(Type.String(), Type.Unknown()) },
    'What the creature\'s rules add to a roll with these fields, as an event test\'s `match` names them: {bonus: {roll: "roll:check", skill: "skill:perception"}} is its Wisdom (Perception) bonus. A skill with no ability named uses its own; a field in braces is a pick or the key a `$at` is at'),
  Obj({ if: Predicate, then: Value, else: Value },
    'One number or another, by a test: "1d12 if the target is missing any of its hit points, otherwise 1d8". The test reads the creature an outcome\'s `when` reads, the recipient'),
  Obj({ settled: OneOf('natural', 'total', 'mode', 'success', 'crit', 'margin', 'attack', 'spell', 'slot', 'against', 'spent', 'amount', 'excess', 'remaining') },
    'In an `emits` entry, a fact the engine settles as it runs what the entry covers: the d20\'s face, the total, whether it succeeded and whether it was a critical hit, what the attack is made with, what was spent, the spell and slot level, the damage dealt, the damage left over once hit points reach 0, the hit points it leaves (design/model/triggers-and-events.md, "Where events come from")'),
  Obj({ stored: Type.String() }, 'In an `emits` entry, a stored field of what the entry covers, by its path: "action", "damage.type"'),
  Obj({ result: Key }, 'What an earlier outcome (by key) rolled or dealt; for a `pool` outcome that spends Hit Dice or `rolled` units, the total rolled on them'),
  Obj({ speed: Type.Literal('in-use'), of: Opt(Role) }, 'The speed being moved with, whichever it is: a fact of the moment, not a field'),
  Obj({ weapon: OneOf('damage', 'die'), of: Opt(Role) }),
  // Each takes a list of values, or one value with a `*` path in it, worked out once for every entry the
  // path reads: {sum: {max: [1, {sum: ["classes.*.*.hp", "modifiers.ability:con"]}]}} is each level's
  // hit points plus the Constitution modifier, at least 1, added up
  Obj({ sum: Type.Union([Type.Array(Value, { minItems: 1 }), Value]) }),
  Obj({ max: Type.Union([Type.Array(Value, { minItems: 1 }), Value]) }),
  Obj({ min: Type.Union([Type.Array(Value, { minItems: 1 }), Value]) }),
  Obj({ times: Value, by: Value }),
  Obj({ divide: Value, by: Type.Number(), round: OneOf('down', 'up') }),
])

// Who ----------------------------------------------------------------------

const WhoDecl = Type.Union([
  Role,
  Obj({
    pool: OneOf('ally', 'enemy', 'any', 'object'),
    of: Opt(Role),
    where: Opt(Predicate),
    chosen: Opt(Type.Union([Type.Literal(true), Type.Literal('except')])),
    includeSelf: Opt(Type.Boolean()),
  }),
])

// Predicates ---------------------------------------------------------------

const TriggerProps = {
  event: OneOrMany(EventRef),
  by: Opt(Who),
  subject: Opt(Who),
  match: Opt(Type.Record(Type.String(), Type.Unknown(), { minProperties: 1,
    description: 'The event\'s own fields, which its vocabulary entry declares in `payload`, read as in a filter\'s `match`: {"roll": "roll:attack", "natural": 20, "attack": {"item": "this"}} on event:roll-resolved, {"rest": "rest:long"} on event:rest-finished, {"state": "condition:prone"} on event:state-applied, {"class": "class:fighter"} or {"gives": {"picks": "maneuvers"}} on event:level-gained, {"item": "this"} on an item event, {"count": 20} on event:initiative-count. An id matches either edition and anything that isA it, a group matches its members, and `this` is the entity the rule is on' })),
  next: Opt(Type.Literal(true)),
  every: Opt(TimeSpan),
  when: Opt(Predicate),
}

const PredicateDecl = Type.Union([
  Obj({ all: Type.Array(Predicate, { minItems: 1 }) }),
  Obj({ any: Type.Array(Predicate, { minItems: 1 }) }),
  Obj({ not: Predicate }),
  Obj({ match: Type.Record(Type.String(), Type.Unknown(), { minProperties: 1 }) },
    'Fields of the thing tested. In a filter, the candidate\'s: {match: {school: "spell-school:evocation", level: 0}}; elsewhere, the creature in question\'s, as a path with no role reads: "a Large or smaller beast" is {match: {creatureType: "creature-type:beast", size: {atMost: "size:large"}}}. A value equals the field, or is in it when the field is a list; a list of values is any of them; an object matches a nested field the same way; {atLeast, atMost} compares a number, or a ranked id such as a size by its rank; a bound {of: role, steps?} is that creature\'s own value of the field, `steps` ranks away ("larger than you" is {atLeast: {of: "self", steps: 1}}); `true` matches any field that is set; {chosen} and {choose} stand for a pick. The fields are checked against the kind\'s schema, a creature\'s outside a filter'),

  // Build
  Obj({ class: Type.Union([ClassRef, SubclassRef]) }, 'Has a level in this class, or has this subclass. A level threshold is a `compare`: {compare: "levels.class:cleric", atLeast: 3}'),
  Obj({ has: AnyId,
    chosen: Opt(KeyedBy('^[a-z0-9][a-z0-9-]*$', Type.Union([OneOrMany(AnyId), Type.String({ minLength: 1, description: 'The name of a named option: "Potent Spellcasting"' })]))),
    match: Opt(Type.Record(Type.String(), Type.Unknown(), { minProperties: 1 })),
    source: Opt(Role) },
    'Has a feature, feat, spell known, item, background, species, state, or condition (a subspecies counts as its parent, and a species as any it `countsAs`). A group id: has anything in that group, as "a Spellcasting or Pact Magic feature". `chosen`: with these picks made in its choices, by key: Draconic Ancestry with the red dragon picked. `match`: for an item, how it is carried, by the fields a saved character keeps on the item (`worn`, `held`, `attuned`): wearing armor is {has: "group:armor", match: {worn: true}}, attuned to and holding this item {has: "this", match: {attuned: true, held: true}}; with no `match`, carrying it at all. `source`: for a state, the role that applied it: "a creature grappled by you" is {has: "condition:grappled", source: "self"}. In a choice filter, `candidate` is the option being considered.'),
  Obj({ lowers: Type.Array(Ref('Path'), { minItems: 1 }) },
    'A state whose effects lower one of these fields: a long rest ends {kind: state, where: {lowers: ["hp.max"]}}, the states reducing your hit point maximum'),
  Obj({ group: GroupRef, for: Opt(Type.Union([ClassRef, SubclassRef])) },
    'In a choice filter: the option is in this group, such as every Eldritch Invocation, a Fighting Style feat, or a gaming set; with `for`, only those available to that class'),
  Obj({ grantedBy: AnyId },
    'The candidate, or the spell being cast, is something you have because this entity gave it: "one spell you gained from this feature". A class id means any feature that class or its subclasses gave you, or a spell that counts as that class\'s: "your Wizard spells" is {grantedBy: "class:wizard"}'),
  Obj({ proficient: AnyId, level: Opt(OneOf('proficient', 'expertise')) }),
  Obj({ spellcaster: Type.Boolean() }, 'Can cast at least one spell: "requires attunement by a spellcaster"'),

  // State and pools
  Obj({ restricted: RestrictionRef }, 'Is under this restriction: "can\'t speak"'),
  Obj({ defense: Obj({ resist: Opt(AnyId), immune: Opt(AnyId), vulnerable: Opt(AnyId) }) },
    'Has this defense once all its sources combine: "a creature that can\'t be blinded" is {defense: {immune: "condition:blinded"}}'),
  Obj({ compare: Value, ...Compare, equals: Opt(Type.Union([Type.String(), Type.Number(), Type.Boolean()])) }, 'What a Value reads equals this (a field that holds a flag or an id: "a weapon you have mastered" is {compare: "masteries.{attack.item}", equals: true}), or a number it reads is at least or at most another: "Cleric level 3 or higher" is {compare: "levels.class:cleric", atLeast: 3}; "Strength 13 or higher" is {compare: "abilities.ability:str", atLeast: 13}; "while the item has at least 1 charge" is {compare: "this.pools.charges.current", atLeast: 1}; "half its hit points or fewer" is {compare: "hp.current", atMost: {times: "hp.max", by: 0.5}}. A path with no role reads the creature the test is about'),

  // What is happening in play
  Obj({ event: OneOrMany(EventRef), by: Opt(Who), subject: Opt(Who), match: TriggerProps.match },
    'This event is being handled, or something that happens because of it, with these fields: "an attack roll with this weapon" is {event: "event:roll-made", by: "self", match: {roll: "roll:attack", attack: {item: "this"}}}. The same shape as a trigger; no `by` means anyone'),

  // A creature or object
  Obj({ kind: OneOf('creature', 'object') }),
  Obj({ within: Value, of: Opt(Who) }, 'Within this many feet of a role, or of any member of a pool'),
  Obj({ perceived: OneOf('sight', 'hearing', 'any'), by: Opt(Role) }),
  Obj({ perceives: Obj({ sense: Opt(OneOf('sight', 'hearing', 'any')), of: Opt(Role) }) }),
  Obj({ willing: Type.Boolean() }),
  Obj({ hostile: Type.Boolean() }),
  Obj({ is: Type.Union([Role, AnyId]) },
    'Is this role, or (in a choice filter) the option being considered is this id or what was picked for that choice: a second language that isn\'t the first'),
  Obj({ turn: Role }, 'It is this role\'s turn: "on your turn"'),
  Obj({ creature: Role, where: Predicate }, 'Evaluates creature atoms against another role'),

  // An activity being used
  Obj({ activity: ActivityPick }, 'The activity being used is this one, or matches the filter: "a spell that calls for a saving throw" is {kind: activity, where: {match: {delivery: {save: true}}}}'),
  Obj({ spell: SpellRef }, 'The spell being cast is one of these, or matches a filter: "an evocation spell" is {kind: spell, where: {match: {school: "spell-school:evocation"}}}. On a state, the spell it came from'),
  Obj({ prepared: Type.Literal(true) }, 'A spell the caster has prepared'),
  Obj({ stored: Key }, 'In a filter, the candidate is held in this pool: "a spell in your spellbook" is {kind: spell, where: {stored: "spellbook"}}'),
  Obj({ dealsDamage: Type.Union([Type.Boolean(), DamageTypeRef]) }),

  Obj({ cover: OneOf('half', 'three-quarters', 'total'), from: Opt(Role) }, 'Has at least this cover against a role'),
  Obj({ grounded: Type.Boolean() }, 'On the ground, as opposed to flying, climbing, or swimming'),
  Obj({ moved: Obj({
    atLeast: Value,
    toward: Opt(Role),
    straight: Opt(Type.Literal(true)),
    since: Opt(OneOf('turn-start', 'last-action')),
  }) }, '"moved at least 20 feet straight toward the target immediately before the hit"'),

  // History and world
  Obj({ happened: Obj({
    ...TriggerProps,
    since: Type.Union([OneOf('turn-start', 'last-turn', 'rest'), TimeSpan]), // turn-start: the current turn, whoever's it is
  }) }),
  Obj({ environment: EnvironmentRef }),
])

// Triggers -----------------------------------------------------------------

const TriggerDecl = Type.Union([
  Obj(TriggerProps),
  Obj({ becomes: Predicate, subject: Opt(Who), next: Opt(Type.Literal(true)), when: Opt(Predicate) },
    'Fires when its test turns true for the creature in `subject` (self if omitted), as a number crosses a line: "when you drop to 0 hit points" is {becomes: {compare: {hp: "current"}, atMost: 0}}'),
])

const TriggeredRule = {
  on: OneOrMany(Trigger),
  uses: Opt(Uses),
  step: Step,
}

const RecoveryAmount = {
  amount: Type.Union([Type.Literal('all'), Value]),
  roll: Opt(Obj({ die: Type.Integer(), min: Type.Integer() })),
}
const RecoveryDecl = Type.Union([
  Obj({ on: Trigger, ...RecoveryAmount }),
  Obj({ after: TimeSpan, ...RecoveryAmount },
    'A set time after a use spends the pool: "can\'t be used again until 3 days have passed" is {after: {amount: 3, unit: "day"}, amount: "all"}'),
])

const UsesDecl = Obj({
  max: Value,
  recover: Type.Array(Ref('Recovery')),
  start: Opt(Value),
  held: Opt(Type.Literal(true)),
})

const DurationDecl = Type.Union([
  OneOf('instant', 'permanent', 'until-dispelled'),
  Obj({ amount: Value, unit: TimeUnit, upTo: Opt(Type.Literal(true)) }),
])

// Effects ------------------------------------------------------------------


const DefenseList = Type.Union([
  Type.Array(AnyId, { minItems: 1 }),
  Obj({ all: Type.Literal(true), except: Opt(Type.Array(AnyId)) }),
])

const Shape = OneOf('alignment', 'personality', 'mental-scores', 'proficiencies', 'features',
  'spellcasting', 'hp', 'equipment', 'languages', 'senses')

const effect = <T extends string, P extends TProperties>(type: T, props: P, description?: string) =>
  Obj({ type: Type.Literal(type), to: Opt(Who), ...props }, description)

const EffectDecl = Type.Union([
  effect('roll-mod', { mode: OneOf('advantage', 'disadvantage') }, 'Advantage or disadvantage on the rolls `when` names with an event:roll-made test'),
  effect('forced-result', { success: Opt(Type.Boolean()), crit: Opt(Type.Boolean()) },
    'The roll succeeds or fails, or is or isn\'t a critical hit, whatever the die says: Paralyzed\'s Str and Dex saves fail (success: false) and its hits from within 5 feet are critical (crit: true); Adamantine Armor\'s critical hits become normal hits (crit: false)'),
  effect('die-mod', {
    reroll: Opt(Obj({ below: Opt(Type.Integer()), mustUse: Opt(Type.Boolean()) })),
    extraDie: Opt(Type.Boolean()),
    maximize: Opt(Type.Literal(true)),
    times: Opt(Type.Integer({ minimum: 2 })), // roll each die this many times and add them: a critical hit's damage dice
  }),
  effect('damage-bonus', { amount: Value, damageType: DamageTypeRef },
    'Extra damage of its own type: "an extra 1d6 fire damage". A bonus to the damage roll itself is a modifier on `roll`'),
  effect('defense', {
    resist: Opt(DefenseList), immune: Opt(DefenseList), vulnerable: Opt(DefenseList),
  }),
  effect('bypass', { resistance: Opt(Type.Array(DamageTypeRef)), immunity: Opt(Type.Array(DamageTypeRef)) }),
  effect('speed', { mode: MovementModeRef, speed: Value, hover: Opt(Type.Boolean()) }),
  effect('sense', { sense: SenseRef, range: Value, note: Opt(OneOf('blind-beyond')) }),
  effect('proficiency', { in: Type.Array(AnyId, { minItems: 1 }), // a filter: every one it picks, "all skills"
    level: Opt(OneOf('proficient', 'expertise', 'half', 'proficiency-or-expertise')) }), // the last: proficiency, or expertise if already proficient
  effect('spell-access', {
    spells: Type.Union([Type.Array(SpellRef, { minItems: 1 }), Predicate]),
    how: OneOf('prepared', 'known', 'innate'),
    counts: Opt(Type.Boolean()), // false: doesn't count against spells prepared or known
    countsAs: Opt(ClassRef), // "they count as paladin spells for you"
    ability: Opt(AbilityRef), uses: Opt(Uses),
    castAt: Opt(Value), // the spell level it's cast at this way: hellish rebuke as a 2nd-level spell
    set: Opt(SpellPatch),
  }),
  effect('spell-list', {
    spells: Type.Union([Type.Array(SpellRef, { minItems: 1 }), Predicate]),
    list: Type.Union([ClassRef, Type.Literal('spellcasting')]), // a class's list, or every list of a class you cast spells from
  }, 'Spells added to a spell list for you: an Otherworldly Patron\'s expanded list, a dragonmark\'s spells'),
  effect('resource', {
    key: Key,
    max: Opt(Value), // no max: no limit, as a spellbook's pages
    values: Opt(KeyedBy('^[a-z][a-z0-9-]*$', Value)), // named values a pool filter can match: a spell slot's level
    die: Opt(Value), dc: Opt(Value),
    rolled: Opt(DiceString), // each unit is this die, rolled when regained, and keeps its number until spent: a d20 kept to replace a later roll
    group: Opt(Key), // a name for several pools together; spending from the group spends from one of them, the owner's choice: Hit Dice
    recover: Type.Array(Ref('Recovery')), start: Opt(Value),
  }),
  effect('ability-substitute', { for: Predicate, use: Type.Union([OneOrMany(AbilityRef), Type.Literal('spellcasting')]) }),
  effect('change', {
    of: Opt(Type.Union([AnyId, Pick, Type.Literal('event')], {
      description: 'What changes: an entity, `this`, or every entity or activity a filter picks (illusion spells, medium armor); `event`, the event the `when` tests, as {event} reads it (a roll\'s `total`, each `die`, its `criticalMinimum`). Without `of`, the creature the effect applies to' })),
    set: Patch,
    variant: Opt(Key), // adds the changed activity as another way to use it, under this name, instead of changing it: a ritual
  }, 'Changes fields of what `of` picks, in the patch grammar, as its paths read them. A creature\'s: {"set": {"ac": {"$add": 1}}}, {"set": {"abilities": {"ability:str": {"$atLeast": 19}}}}, every speed {"set": {"speeds": {"$where": true, "speed": {"$multiply": 0.5}}}}; changes to one number combine as bonuses stack, and a set value wins. A roll\'s: {"of": "event", "set": {"total": {"$add": "modifiers.ability:cha"}}} with a `when` naming the roll. An entity\'s: {"of": {"kind": "activity", "where": {"spell": "spell:guidance"}}, "set": {"range": {"$replace": {"distance": 60}}}}, checked against the kind\'s schema; a creature\'s fields aren\'t, as a rule may compute a new one'),
  effect('counts-as', { qualifier: IdOf('damage-qualifier') },
    'Damage that counts as having this qualifier, against resistance and immunity: a monk\'s unarmed strikes count as magical'),
  effect('forbid', {
    restriction: Type.Array(RestrictionRef, { minItems: 1 }), target: Opt(Who),
    activity: Opt(ActivityPick), // only these activities: "can't cast another spell this turn, except a cantrip"
  },
    '`target` limits the restriction to acting against someone: "can\'t attack the charmer"'),
  effect('waive', { restriction: Type.Array(RestrictionRef, { minItems: 1 }) },
    'Lifts a restriction other rules impose: a druid in Wild Shape can still cast spells. Doing without a spell\'s component is a `change` of the spell; doing what a rule forbids anyway is `suppress` of that rule\'s effect'),
  effect('compel', { activity: Opt(ActivityPick), target: Opt(Who) }),
  effect('suppress', {
    sourceType: Opt(Type.Array(SourceTypeRef)), state: Opt(Type.Array(StateRef)), rule: Opt(Type.Array(IdOf('rule'))),
    effects: Opt(Type.Array(Key, { minItems: 1 })), // only the effects of those rules or states with these keys
  }, 'Antimagic suppresses magic; Alert suppresses the unseen-attacker rule against you. With `effects`, only the effects of those rules or states with these keys: a feat that frees you from somatic components has {"rule": ["rule:components"], "effects": ["somatic"]}'),
  effect('see', {
    range: Opt(Value),
    dim: Opt(Type.Literal('bright')), // sees dim light as bright light
    darkness: Opt(OneOf('dim', 'bright')), // sees darkness as dim (darkvision) or as bright (Devil's Sight, truesight)
    magicalDarkness: Opt(Type.Boolean()),
    invisible: Opt(Type.Boolean()),
    withoutSight: Opt(Type.Literal(true)), // perceives without relying on sight: blindsight
    tremor: Opt(Type.Literal(true)), // pinpoints what touches the same surface or liquid; not sight
    illusions: Opt(Type.Literal(true)), // sees through visual illusions and succeeds on saves against them
    transformations: Opt(Type.Literal(true)), // sees the true form of a transformed creature or object
    planes: Opt(Type.Array(PlaneRef)),
  }, 'How a creature perceives: darkvision, blindsight, truesight, See Invisibility, Devil\'s Sight'),
  effect('record', { pick: Type.Union([AnyId, Obj({ name: Type.String({ minLength: 1 }) }, 'A label that isn\'t an entity: "Spring"')]) },
    'Keeps a pick that no rule reads (yet) and shows it: a god, an eladrin\'s season, a homebrew flavor choice. Rules can still read it with {chosen}'),
  effect('light', { bright: Value, dim: Value, as: Opt(EnvironmentRef) }),
  effect('zone', { zone: Zone }),
  effect('shapeshift', {
    form: Type.Union([CreatureRef, Predicate]),
    keep: Type.Array(Shape),
    hp: Opt(OneOf('form', 'own')),
    gear: Opt(OneOf('falls', 'merges', 'worn')),
  }),
  effect('triggered', TriggeredRule),
])

// States -------------------------------------------------------------------

/** The parts of a state, shared by state and condition entities and by inline states. */
export const StateBody = {
  isA: Opt(StateRef),
  sourceName: Opt(Type.String({ description: 'What the text calls the source, for display: "the charmer", "the grappler"' })),
  persists: Opt(Type.Literal(true)), // general rules that end states (a long rest's restoration) skip it; only its own ends do
  effects: Opt(Type.Array(Effect)),
  activities: Opt(Type.Array(Activity)),
  when: Opt(Predicate),
  implies: Opt(Type.Array(StateRef)),
  duration: Opt(Duration),
  ends: Opt(Type.Array(Trigger)),
  concentration: Opt(Type.Literal(true)),
  stacks: Opt(OneOf('no', 'levels', 'separate')), // separate: several at once, each on its own
  maxLevel: Opt(Type.Integer({ minimum: 1 })),
}

const RepeatSaveDecl = Obj({
  on: Opt(Trigger),
  ability: Opt(AbilityRef),
  dc: Opt(Value),
  mode: Opt(OneOf('advantage', 'disadvantage')),
  onFailure: Opt(Type.Array(Outcome)),
  tally: Opt(Obj({
    successes: Obj({ count: Type.Integer({ minimum: 1 }), outcomes: Opt(Type.Array(Outcome)) }),
    failures: Obj({ count: Type.Integer({ minimum: 1 }), outcomes: Type.Array(Outcome) }),
  })),
})

// Activities ---------------------------------------------------------------

const RangeDecl = Type.Union([
  Obj({ self: Type.Literal(true) }),
  Obj({ touch: Type.Literal(true) }),
  Obj({ sight: Type.Literal(true) }),
  Obj({ unlimited: Type.Literal(true) }),
  Obj({ distance: Value, long: Opt(Value), min: Opt(Value), unit: Opt(OneOf('feet', 'miles')) }),
])

const Target = Obj({
  who: Opt(Who),
  also: Opt(Obj({ who: Who, count: Opt(Value) }, 'More targets, with their own conditions: "a second creature within 10 feet of the first target"')),
  count: Opt(Type.Union([Value, Obj(Compare), Type.Literal('all')])),
  select: Opt(OneOf('chosen', 'nearest', 'random')),
  distinct: Opt(Type.Boolean()),
})

const Area = Obj({
  shape: AreaShapeRef,
  size: Value,
  width: Opt(Value),
  height: Opt(Value),
  origin: Opt(OneOf('self', 'point', 'target')),
  affects: Opt(Who),
})

const CheckSpec = Ref('CheckSpec')
const CheckSpecDecl = Obj({ ability: AbilityRef, skill: Opt(OneOrMany(SkillRef)) })
// A check, or a choice of checks the roller picks from: "a Strength (Athletics) or Dexterity (Acrobatics) check".

const Delivery = Type.Union([
  Obj({ attack: Obj({
    range: OneOf('melee', 'ranged', 'melee-or-ranged'),
    via: Opt(OneOf('weapon', 'spell', 'unarmed')),
    ability: Opt(AbilityRef),
    bonus: Opt(Value),
    reach: Opt(Type.Number()),
    item: Opt(ItemRef), // what the attack is made with: `this` item, or any item of a group (an improvised weapon)
    hands: Opt(Type.Union([Type.Literal(1), Type.Literal(2)])), // how many hands hold the weapon: a weapon's attack is 1, a Two-Handed weapon's and the Versatile form's are 2
  }) }),
  Obj({ save: Obj({ ability: Opt(OneOrMany(AbilityRef)), kind: Opt(RollRef), dc: Value, unwillingOnly: Opt(Type.Literal(true)), by: Opt(Type.Literal('self')) },
    'A save; `kind` names a save tied to no ability: roll:death-save') }),
  Obj({ check: Obj({ ability: Opt(AbilityRef), skill: Opt(OneOrMany(SkillRef)), choose: Opt(ChooseBody(CheckSpec)), dc: Value, by: Opt(Type.Literal('self')) },
    'A check against `dc`, of `ability` and `skill`, or of the checks in `choose`, which the roller picks from: "a Strength (Athletics) or Dexterity (Acrobatics) check"') }),
  Obj({ contest: Obj({ self: CheckSpec, target: CheckSpec }, 'Each side rolls its check; a choice is the roller\'s') }),
])

const OtherwiseDecl = Type.Union([Type.Array(Outcome), Type.Literal('half')])

const StepProps = {
  range: Opt(Ref('Range')),
  origin: Opt(Who), // where the range is measured from and the effect comes from, if not the one acting: "your familiar can deliver the spell"
  target: Opt(Target),
  area: Opt(Area),
  delivery: Opt(Delivery),
  outcomes: Opt(Type.Array(Outcome)),
  otherwise: Opt(Ref('Otherwise')),
}

const Cost = Type.Union([
  Obj({ resource: PoolPick, amount: Opt(Value) }, 'Spends from a pool, 1 by default: `action`, `reaction`, `movement`, ki, charges, a spell slot (`spell-slots`, the group). A filter picks among pools: "a spell slot of level 2 or higher"'),
  Obj({ hp: Value }),
  Obj({ currency: Value, unit: CurrencyRef }),
  Obj({ forgo: OneOf('attack', 'advantage') }), // one of the attacks of the Attack action, or any Advantage on the roll being made
])

// What an entity or activity emits, and when (design/model/triggers-and-events.md, "Where events come from").
const EmitDecl = Obj({
  event: EventRef,
  for: Opt(Obj({ kind: OneOf('activity', 'outcome'), where: Opt(Predicate) },
    'What the entry covers: every activity or outcome this filter picks, wherever it is. On an activity, leave it out: that activity')),
  at: OneOf('started', 'finished', 'rolled', 'resolved', 'applying', 'applied'),
  by: Opt(Who), // default: the creature using the activity
  subject: Opt(Who), // default: each target
  fields: Opt(KeyedBy('^[a-z][a-zA-Z]*$', Type.Union([Value, AnyId, Type.Literal('target')]),
    { description: 'The event\'s fields: fixed ids, or {stored} and {settled} Values read from what the entry covers' })),
}, 'An event fired at a moment of what the entry covers. An activity\'s moments are `started` (its costs are paid) and `finished`; a delivery\'s, `rolled` (the die has landed) and `resolved` (the result is fixed); an outcome\'s, `rolled`, `applying` (it can still be changed), and `applied`')
const Emit = Ref('Emit')

const ActivityDecl = Obj({
  key: Key,
  name: Opt(Type.String()),
  action: Opt(ActionRef),
  standalone: Opt(Type.Literal(false)), // only run by another activity: a grapple, a weapon attack, run by the Attack action
  time: Opt(TimeSpan), // a minute or longer; the Longer Casting Times rule says what that costs each turn
  trigger: Opt(Trigger),
  when: Opt(Predicate),
  cost: Opt(Type.Array(Type.Union([Cost, Obj({ oneOf: Type.Array(Type.Array(Cost), { minItems: 2 }) }, 'Alternatives: a use or a spell slot')]))),
  uses: Opt(Uses),
  sourceTypes: Opt(Type.Array(SourceTypeRef)),
  duration: Opt(Duration),
  concentration: Opt(Type.Literal(true)),
  ritual: Opt(Type.Literal(true)),
  effects: Opt(Type.Array(Effect, { description: 'Effects that hold while this activity resolves: a crit range for this attack only' })),
  emits: Opt(Type.Array(Emit)),
  ...StepProps,
})

const StepDecl = Obj(StepProps)

// Outcomes -----------------------------------------------------------------

const Cast = Obj({
  spell: Opt(SpellRef), // a filter: one it picks, which the caster chooses as they cast
  castAt: Opt(Value), // the spell level it's cast at
  slot: Opt(Type.Literal(false)),
  stats: Opt(Type.Union([OneOf('self', 'original'), Obj({ dc: Opt(Value), attack: Opt(Value), ability: Opt(AbilityRef) })])),
  set: Opt(SpellPatch),
})

const Summon = Obj({
  creature: Opt(CreatureRef), // a filter: one it picks, which the summoner chooses
  copyOf: Opt(Role),
  count: Opt(Type.Union([Value, Obj({ budget: Value, weight: Value })])),
  set: Opt(Patch), // changes to the summoned creature's stat block, in the patch grammar; the schema checks the fields against Creature
  arrives: Opt(Duration),
  duration: Opt(Duration),
  controller: Opt(OneOf('self', 'none', 'enemy')),
  initiative: Opt(OneOf('shared', 'own', 'after-self')),
  unlessCommanded: Opt(Key),
  state: Opt(StateRef),
  ends: Opt(Type.Array(Trigger, { description: '"disappears when it drops to 0 hit points"' })),
})

const InlineState = Obj(StateBody, 'A one-off state with no id')

// `when` and `key`, like every list item's, are added in global.ts.
const OutcomeCommon = {
  otherwise: Opt(Type.Array(Outcome, { description: 'What happens instead when `when` is false' })),
  to: Opt(Who),
  after: Opt(Duration),
}

const outcome = <K extends string, T extends TSchema>(key: K, body: T) =>
  Obj({ ...({ [key]: body } as Record<K, T>), ...OutcomeCommon })

const Empty = Obj({})
/** What a rule does or tests, in words, where the grammar can't say it yet. Any field takes
 *  {prose} (global.ts); `gap` names what's missing, so a later batch can find it. */
const Prose = Obj({ text: Type.String(), gap: Opt(Gap) })

const OutcomeDecl = Type.Union([
  outcome('damage', Obj({
    amount: Value,
    type: Type.Union([
      DamageTypeRef,
      Obj({ of: OneOf('attack', 'weapon', 'component') }, '"extra damage of the attack\'s type"'),
    ]),
  })),
  outcome('heal', Obj({ amount: Value, split: Opt(Type.Boolean()) })), // split: divide the amount among the targets, as tempHp does
  outcome('tempHp', Obj({ amount: Value, split: Opt(Type.Boolean()) })),
  outcome('applyState', Obj({
    state: Type.Union([StateRef, InlineState]), // {chosen}: a state picked earlier in one of this entity's choices
    duration: Opt(Duration),
    ends: Opt(Type.Array(Trigger)),
    repeatSave: Opt(Ref('RepeatSave')),
    escape: Opt(Obj({ dc: Value, check: Opt(CheckSpec) })),
    while: Opt(Key),
    source: Opt(Role), // who the state records as its source, if not the creature acting: mounting makes the mount the rider's source
  })),
  outcome('endState', Obj({
    state: Opt(Type.Union([StateRef], { description: 'A filter ends every state it picks that the recipient has now: those lowering its hit point maximum; a choice over one ends the one picked: "end one spell"' })),
    levels: Opt(Value), // removes that many levels of a stacking state instead of all of it
  })),
  outcome('replace', Obj({
    choice: Opt(Key),
    from: Opt(AnyId),
    what: Opt(Pick),
    with: Opt(Pick),
    same: Opt(Type.Array(Type.String({ minLength: 1 }), { minItems: 1 })),
  }, 'Trade one thing you have for another, as a triggered activity, so it is optional: "whenever you gain a level, you can replace one invocation". `choice`: one of your picks for that choice (on `from`, if not this entity) for another of its options. Otherwise `what` picks what you give up ({grantedBy: "this"}: "a spell you gained from this feature") and `with` what replaces it; `same` names stored fields the two share: "another spell of the same level" is same: ["level"]. An item becoming another is what {kind: "item", where: {is: "this"}}: a cursed item turning into another')),
  outcome('move', Obj({
    kind: OneOf('move', 'push', 'pull', 'teleport', 'throw', 'swap', 'plane', 'fall'),
    distance: Opt(Value),
    toward: Opt(Type.Union([Role, Obj({ awayFrom: Role }), OneOf('random', 'up', 'down')])),
    plane: Opt(PlaneRef),
    where: Opt(Predicate),
    cost: Opt(Type.Array(Cost)), // what the mover spends to move: "must use its reaction to move away"
    provokes: Opt(Type.Literal(false)),
  })),
  outcome('drop', Obj({ item: Type.Union([Type.Literal('held'), ItemRef]), count: Opt(Value) },
    '`held`: what it holds in its hands. Command\'s Drop, Heat Metal')),
  outcome('setHp', Value), // "drops to 0 hit points", "reduce it to 1 hit point instead"
  outcome('kill', Empty),
  outcome('revive', Obj({ hp: Value })),
  outcome('destroy', Empty),
  outcome('create', Obj({
    item: Opt(ItemRef),
    object: Opt(Obj({
      name: Type.String(),
      effects: Opt(Type.Array(Effect)),
      activities: Opt(Type.Array(Activity)),
    }, 'An inline object that acts: a spectral blade. Inside it, self is the object and source its creator.')),
    quantity: Opt(Value),
    duration: Opt(Duration),
    ends: Opt(Type.Array(Trigger)),
  })),
  outcome('pool', Obj({
    resource: Key, add: Opt(Value), spend: Opt(Value), // the pool, by its key, as a cost names it
    store: Opt(AnyId), // what the added units hold: the spells written into a spellbook
  }, 'Changes a pool\'s current value: a ward that absorbs damage before its bearer does. With `store`, the units added hold those things, and a {stored} test finds them')),
  outcome('cast', Cast),
  outcome('summon', Summon),
  outcome('zone', Zone),
  outcome('random', Obj({
    dice: Opt(DiceString),
    results: Opt(Type.Array(Obj({
      range: Type.Tuple([Type.Integer(), Type.Integer()]),
      outcomes: Type.Array(Outcome),
    }))),
    table: Opt(TableRef),
    count: Opt(Value),
    unique: Opt(Type.Boolean()),
  })),
  outcome('runs', Type.Array(Type.Union([
    Obj({ activity: ActivityPick, times: Opt(Value) }, '"three melee attacks": an activity matching {kind: activity, where: {match: {delivery: {attack: {range: ["melee", "melee-or-ranged"]}}}}}, three times'),
  ]), { minItems: 1 })),
  outcome('intercept', Obj({
    set: Opt(Ref('PatchValue')), // one operator on the number in progress: the roll's total, or the damage
    reroll: Opt(Type.Boolean()),
    success: Opt(Type.Boolean()), crit: Opt(Type.Boolean()), // the roll becomes a success or failure, or a critical hit becomes a normal hit (crit: false)
    mode: Opt(OneOf('advantage', 'disadvantage')), // the roll being made gains it: 2014 Inspiration
    cancel: Opt(Type.Literal(true)), redirect: Opt(Who),
  })),
  outcome('grant', Obj({
    activity: Opt(ActivityPick),
    movement: Opt(Value),
    cost: Opt(Type.Array(Cost)),
    provokes: Opt(Type.Literal(false)),
  }, 'Lets the recipient act now if it chooses, paying `cost`: "can use its reaction to make one weapon attack", "move up to its speed"')),
  outcome('then', Step),
  outcome('prose', Prose), // the form any field takes for what isn't encoded yet (global.ts), as an outcome
])

// Zones --------------------------------------------------------------------

const ZoneDecl = Obj({
  area: Obj({ shape: AreaShapeRef, size: Value, width: Opt(Value), height: Opt(Value) }),
  anchor: OneOf('self', 'point', 'target', 'object'),
  affects: Opt(Who),
  effects: Opt(Type.Array(Effect)),
  on: Opt(Type.Array(Obj(TriggeredRule))),
  terrain: Opt(OneOf('difficult')),
  obscured: Opt(OneOf('light', 'heavy')),
  cover: Opt(OneOf('half', 'three-quarters', 'total')),
  blocks: Opt(Type.Array(OneOf('creatures', 'objects', 'spells', 'sight'))),
  hidden: Opt(Obj({ skill: SkillRef, dc: Value })),
  duration: Opt(Duration),
})

/** Every recursive declaration. index.ts turns these into one Module. */
export const CoreDecls = {
  Choice: ChoiceDecl,
  Chosen: ChosenDecl,
  Value: ValueDecl,
  Path: PathDecl,
  Who: WhoDecl,
  Predicate: PredicateDecl,
  Trigger: TriggerDecl,
  Recovery: RecoveryDecl,
  Uses: UsesDecl,
  Duration: DurationDecl,
  Effect: EffectDecl,
  RepeatSave: RepeatSaveDecl,
  Range: RangeDecl,
  Otherwise: OtherwiseDecl,
  Step: StepDecl,
  Activity: ActivityDecl,
  Outcome: OutcomeDecl,
  Zone: ZoneDecl,
  CheckSpec: CheckSpecDecl,
  Emit: EmitDecl,
}
