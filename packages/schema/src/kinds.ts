// Entity kinds: what a bundle file can contain. Each kind's own fields hold
// what the book prints about that thing; anything that acts or changes
// numbers is an effect, state, or activity from core.ts.

import Type, { type TProperties } from 'typebox'
import {
  KeyedBy, Obj, Opt, OneOf, OneOrMany, Ref, AnyId, Key, IdOf, EntityBase, Text,
  AbilityRef, SkillRef, SizeRef, CurrencyRef, SpellSchoolRef, HitDieRef,
  LanguageRef, CreatureTypeRef, CreatureTagRef, AlignmentRef, GroupRef, WeaponPropertyRef,
  WeaponMasteryRef, RarityRef, StatBlockSectionRef, TableRef,
  ClassRef, SubclassRef, SpellRef, ItemRef, CreatureRef, FeatureRef, FeatRef, StandingRef, SpeciesRef,
  DamageTypeRef, TimeUnit,
} from './base.ts'
import { StateBody, Pick } from './core.ts'

const Value = Ref('Value')
const Predicate = Ref('Predicate')
const Effect = Ref('Effect')
const Activity = Ref('Activity')
const Uses = Ref('Uses')

/** An entity whose id must have the given kind prefix. */
const entity = <P extends TProperties>(kind: string, props: P, description?: string) =>
  Obj({ ...EntityBase, id: IdOf(kind), ...props }, description)

const Grant = Type.Union([
  FeatureRef, FeatRef,
  SubclassRef, // through a choice: the class feature that grants a subclass offers it, and the pick gives the subclass's features by class level
  Obj({ feat: FeatRef, chosen: KeyedBy('^[a-z0-9][a-z0-9-]*$', OneOrMany(AnyId)) },
    'A feat with some of its choices already made, by choice key: Magic Initiate (Cleric) is {feat, chosen: {class: class:cleric@2024}}'),
])

/** What a container (species, background) gives: features and feats, never rules of its own. */
const Grants = {
  features: Opt(Type.Array(Grant, { description: 'Features and feats this gives its holder, in printed order: a species\' traits, a feat\'s parts, a 2024 background\'s feat. Classes and subclasses use levels; the class feature that grants a subclass offers it here as a choice' })),
}

/** What a unit that carries rules has: a feature, feat, spell, item, or rule. */
const Mechanics = {
  ...Grants,
  values: Opt(KeyedBy('^[a-z0-9][a-z0-9-]*$', Type.Union([AnyId, Value]), { description: 'Named values other rules read: a rune save DC, a damage die, a dragon\'s damage type' })),
  effects: Opt(Type.Array(Effect)),
  activities: Opt(Type.Array(Activity)),
}

const Equipment = Type.Union([
  Obj({ item: ItemRef, quantity: Opt(Value) }),
  Obj({ amount: Value, currency: CurrencyRef }),
])

const Price = Obj({ amount: Value, currency: CurrencyRef })
const PatchValue = Ref('PatchValue')
/** One change to one entity, as in a patch file or an optional rule's overrides. */
const PatchEntry = Obj({
  target: AnyId,
  set: KeyedBy('^(?!\\$|id$).+', PatchValue, { minProperties: 1, additionalProperties: false }),
})
const Levels = KeyedBy('^[1-9][0-9]*$', Type.Array(FeatureRef))

/** Speeds by movement mode, so "your fly speed" is `speeds.movement-mode:fly.speed`. */
const Speeds = KeyedBy('^movement-mode:', Obj({ speed: Value, hover: Opt(Type.Literal(true)), note: Opt(Type.String()) }), { minProperties: 1 })

// Character options --------------------------------------------------------

const ClassDecl = entity('class', {
  hitDie: HitDieRef,
  levels: Levels,
  subclass: Opt(Obj({ level: Type.Integer({ minimum: 1 }), title: Opt(Type.String()) })),
  firstClass: Opt(Type.Array(FeatureRef, { description: 'Features gained only when this is your first class: its full proficiencies' })),
  multiclass: Opt(Obj({ requires: Opt(Predicate), features: Opt(Type.Array(FeatureRef)) },
    'Taking this class when it isn\'t your first: the ability scores it needs, and the features you get instead of `firstClass`')),
  startingEquipment: Opt(Type.Array(Equipment)),
}, 'A class. It gives features by class level; it has no rules of its own')

const SubclassDecl = entity('subclass', {
  class: ClassRef,
  levels: Levels,
})

const FeatureDecl = entity('feature', {
  requires: Opt(Predicate),
  repeatable: Opt(Type.Boolean()),
  replaces: Opt(FeatureRef),
  availableTo: Opt(Type.Array(Type.Union([ClassRef, SubclassRef]), { minItems: 1, description:
    'For a group shared by several classes: the classes (or subclasses) whose choices offer it. Archery is for the fighter and ranger' })),
  ...Mechanics,
})

const FeatDecl = entity('feat', {
  requires: Opt(Predicate),
  repeatable: Opt(Type.Boolean()),
  ...Mechanics,
})

const SpeciesDecl = entity('species', {
  parent: Opt(SpeciesRef),
  size: Opt(OneOrMany(SizeRef, { description: 'Your size; with several, you choose (Small or Medium). A subspecies\'s own size, speeds, or type replaces its parent\'s' })),
  creatureType: Opt(CreatureTypeRef),
  tags: Opt(Type.Array(CreatureTagRef, { description: 'Also counts as: a bugbear is a goblinoid' })),
  countsAs: Opt(Type.Array(SpeciesRef, { minItems: 1, description: 'Also counts as these species for prerequisites and effects: the eladrin is also an elf' })),
  speeds: Opt(Speeds),
  replaces: Opt(Type.Array(FeatureRef, { minItems: 1, description:
    'Parent features this subspecies doesn\'t have: a variant replacing its parent\'s traits' })),
  subspeciesRequired: Opt(Type.Boolean()),
  nameTables: Opt(Type.Array(TableRef)),
  ...Grants,
}, 'A species (race), or a subspecies (subrace) when it has a parent. Its rules are in the traits it gives')

const BackgroundDecl = entity('background', {
  startingEquipment: Opt(Type.Array(Equipment)),
  tables: Opt(Type.Array(TableRef)),
  ...Grants,
}, 'A background. Its rules are in the features it gives, one per printed line')

const SpellDecl = entity('spell', {
  level: Type.Integer({ minimum: 0, maximum: 9 }),
  school: SpellSchoolRef,
  lists: Opt(Type.Array(Type.Union([ClassRef, SubclassRef]))), // a book can print a list for a subclass that casts spells
  ritual: Opt(Type.Literal(true)),
  components: Obj({
    verbal: Opt(Type.Literal(true)),
    somatic: Opt(Type.Literal(true)),
    material: Opt(Obj({
      text: Type.String(),
      parts: Opt(Type.Array(Obj({
        worth: Price, // at least this much
        consumed: Opt(Type.Literal(true)),
        count: Opt(Type.Integer({ minimum: 2, description: '"four ivory strips worth 50 gp each"' })),
        per: Opt(OneOf('target', 'hit-die')), // "for each corpse", "per Hit Die of the target"
      }), { minItems: 1, description: 'The priced parts. Unpriced parts are only in the text: a focus or pouch replaces them' })),
    })),
  }),
  ...Mechanics,
}, "A spell. Casting time, range, duration, and concentration live on its activities")

// States and conditions ----------------------------------------------------

const StateDecl = entity('state', StateBody)
const ConditionDecl = entity('condition', StateBody)

// Creatures ----------------------------------------------------------------

/** Senses by id, as speeds are by mode. */
const Senses = KeyedBy('^sense:', Obj({ range: Type.Number(), blindBeyond: Opt(Type.Literal(true)), note: Opt(Type.String()) }), { minProperties: 1 })
/** A printed phrase the schema doesn't break down yet: "any non-good alignment". */
const Printed = Obj({ text: Type.String() })

const Block = Obj({
  name: Type.String(),
  section: StatBlockSectionRef,
  text: Text,
  effects: Opt(Type.Array(Effect)),
  activity: Opt(Activity),
  gaps: Opt(Type.Array(Ref('Gap'))),
})

const CreatureProps = {
  size: OneOrMany(SizeRef),
  creatureType: OneOrMany(CreatureTypeRef),
  tags: Opt(Type.Array(CreatureTagRef)),
  swarm: Opt(SizeRef), // "Medium Swarm of Tiny Beasts": the swarm's members' size
  alignment: Opt(Type.Union([AlignmentRef, Printed])),
  weight: Opt(Type.Number({ description: 'Pounds. Optional; effects that change it do nothing when it is absent' })),
  age: Opt(Type.Number({ description: 'Years. Optional, like weight' })),
  ac: Value,
  acFrom: Opt(Type.Array(Type.Union([ItemRef, Type.String()]), { description: 'What the printed AC comes from: worn armor, "natural armor"' })),
  hp: Obj({ average: Value, formula: Opt(Type.String()) }),
  speeds: Speeds,
  abilities: KeyedBy('^ability:', Type.Integer()),
  saves: Opt(KeyedBy('^ability:', Type.Integer())),
  skills: Opt(KeyedBy('^skill:', Type.Integer())),
  senses: Opt(Senses),
  passivePerception: Opt(Type.Integer()),
  languages: Opt(Type.Array(Type.Union([
    Obj({
      language: Type.Union([LanguageRef, Type.Literal('any')]),
      count: Opt(Type.Integer()),
      understandsOnly: Opt(Type.Literal(true)),
    }),
    Printed,
  ]))),
  telepathy: Opt(Type.Number()),
  cr: Opt(Type.Union([Type.Number(), Obj({ value: Type.Number(), inLair: Opt(Type.Number()) })])),
  xp: Opt(Type.Integer()),
  proficiencyBonus: Opt(Type.Integer()),
  initiative: Opt(Type.Integer()), // the 2024 printed modifier
  habitat: Opt(Type.Array(Type.String())),
  treasure: Opt(Type.Array(Type.String())),
  gear: Opt(Type.Array(Type.Union([ItemRef, Type.String()]))),
  effects: Opt(Type.Array(Effect)),
  blocks: Opt(Type.Array(Block)),
  legendary: Opt(Obj({ actions: Type.Integer({ minimum: 1 }), inLair: Opt(Type.Integer()) })),
  base: Opt(CreatureRef),
}

const CreatureDecl = entity('creature', CreatureProps)

// Items --------------------------------------------------------------------

const ItemDecl = entity('item', {
  rarity: Opt(RarityRef),
  attunement: Opt(Type.Union([Type.Literal(true), Obj({ by: Opt(Predicate), text: Opt(Type.String()) })])),
  cost: Opt(Price),
  weight: Opt(Type.Number()),
  size: Opt(SizeRef), // an object's size, for a rule that picks objects by it: "a Tiny nonmagical object"
  weapon: Opt(Obj({
    damage: Opt(Obj({ amount: Value, type: DamageTypeRef })),
    versatile: Opt(Value),
    properties: Type.Array(WeaponPropertyRef),
    mastery: Opt(WeaponMasteryRef),
    range: Opt(Obj({ normal: Type.Number(), long: Type.Number() })),
  })),
  armor: Opt(Obj({
    ac: Value, // the wearer's base AC, with whatever part Dexterity plays: {sum: [12, "modifiers.ability:dex"]}, {sum: [15, {min: [2, "modifiers.ability:dex"]}]}, 18
    strength: Opt(Type.Integer()),
    stealthDisadvantage: Opt(Type.Literal(true)),
  })),
  base: Opt(Type.Union([
    ItemRef,
    Obj({ item: ItemRef, chosen: KeyedBy('^[a-z0-9][a-z0-9-]*$', OneOrMany(AnyId)) },
      'A base with some of its choices already made, by choice key: a +1 longsword is {item: item:weapon-1, chosen: {base: item:longsword}}'),
  ], { description: 'The item this is made from: a +1 longsword\'s longsword, a choice of one ("any weapon") made when the item is created, or a magic item it functions as. It supplies the stats this item doesn\'t set, and its effects, activities, and other rules apply to this item as well' })),
  contents: Opt(Type.Array(Obj({ item: Type.Union([ItemRef, CurrencyRef]), quantity: Value }))),
  object: Opt(Obj({ ac: Type.Integer(), hp: Value, damageThreshold: Opt(Type.Integer()), effects: Opt(Type.Array(Effect)) })),
  sentience: Opt(Obj({
    abilities: KeyedBy('^ability:', Type.Integer()),
    alignment: AlignmentRef,
    senses: Opt(Senses),
    communication: OneOf('emotion', 'speech', 'telepathy'),
    languages: Opt(Type.Array(LanguageRef)),
  })),
  ...Mechanics,
})

const VehicleDecl = entity('vehicle', {
  size: SizeRef,
  dimensions: Opt(Type.String()),
  cost: Opt(Price),
  weight: Opt(Type.Number()),
  crew: Opt(Type.Integer()),
  passengers: Opt(Type.Integer()),
  cargo: Opt(Obj({ amount: Type.Number(), unit: OneOf('tons', 'pounds') })),
  speeds: Opt(Speeds),
  travelPace: Opt(Obj({ milesPerHour: Opt(Type.Number()), milesPerDay: Opt(Type.Number()) })),
  abilities: Opt(KeyedBy('^ability:', Type.Integer())),
  effects: Opt(Type.Array(Effect)),
  components: Opt(Type.Array(Obj({
    key: Key, name: Type.String(), count: Opt(Type.Integer()),
    ac: Opt(Type.Integer()), hp: Opt(Type.Integer()), damageThreshold: Opt(Type.Integer()),
    crew: Opt(Type.Integer()), speeds: Opt(Speeds),
    effects: Opt(Type.Array(Effect)), activities: Opt(Type.Array(Activity)),
  }))),
  activities: Opt(Type.Array(Activity)),
})

// Campaign kinds -----------------------------------------------------------

const StandingDecl = entity('standing', {
  ranks: Opt(Type.Array(Obj({ at: Type.Integer(), name: Opt(Type.String()), grants: Type.Array(AnyId) }))),
  earn: Opt(Text),
  lose: Opt(Text),
}, 'Renown, piety, or rank: a score the DM adjusts, with rewards at thresholds')

const RuleDecl = entity('rule', {
  optional: Opt(Type.Literal(true)),
  overrides: Opt(Type.Array(PatchEntry, { minItems: 1, description:
    'Changes to other entities while a DM has this optional rule on: a variant replaces part of the rule it varies' })),
  appliesTo: Opt(Ref('Who')),
  defines: Opt(Type.Array(AnyId, { description:
    'What the rule adds to the game: cover\'s states, a homebrew Resolve ability. What an optional rule defines exists only while it is on' })),
  emits: Opt(Type.Array(Ref('Emit'), { description: 'Events this rule fires for every activity or outcome its entries cover: the attack roll rules emit event:roll-made for every attack' })),
  ...Mechanics,
})

const DeityDecl = entity('deity', {
  alignment: Opt(Type.Union([AlignmentRef, Printed])),
  domains: Opt(Type.Array(SubclassRef)),
  symbol: Opt(Type.String()),
  pantheon: Opt(Type.String()),
  standing: Opt(StandingRef),
})

const TableDecl = entity('table', {
  axis: Opt(OneOf('class-level', 'character-level', 'caster-level')),
  dice: Opt(Type.String()),
  columns: Type.Array(Obj({ key: Key, name: Type.String() }), { minItems: 1 }),
  rows: Type.Array(Obj({
    level: Opt(Type.Integer({ minimum: 1 })),
    range: Opt(Type.Tuple([Type.Integer(), Type.Integer()])),
    cells: Type.Record(Type.String(), Type.Union([Type.Number(), Type.String()])),
    outcomes: Opt(Type.Array(Ref('Outcome'))),
  })),
}, 'A printed table: class progressions, spell slots, random tables')

// Vocabulary terms ---------------------------------------------------------

/** A vocabulary term: a game noun other content refers to by id. */
const term = <P extends TProperties>(kind: string, props: P = {} as P) =>
  entity(kind, { isA: Opt(IdOf(kind)), ...props })

const TermDecls = {
  Ability: term('ability', {
    abbreviation: Type.String(), order: Opt(Type.Integer()),
    fallback: Opt(AbilityRef), // a creature without this score uses that one for its checks and saves: Wisdom for Resolve
    changedBy: Opt(Type.Literal('manual')), // only the DM raises or lowers it, by hand, so an ability score increase can't pick it: Resolve
  }),
  Skill: term('skill', { ability: AbilityRef }),
  Size: term('size', { rank: Type.Integer(), space: Type.Number() }),
  DamageType: term('damage-type'),
  DamageQualifier: term('damage-qualifier'),
  Sense: term('sense'),
  MovementMode: term('movement-mode'),
  Currency: term('currency', { cp: Type.Number(), symbol: Opt(Type.String()) }),
  SpellSchool: term('spell-school'),
  HitDie: term('hit-die', { sides: Type.Integer() }),
  Language: term('language', { script: Opt(Type.String()), speakers: Opt(Type.String()) }),
  CreatureType: term('creature-type'),
  CreatureTag: term('creature-tag'),
  Alignment: term('alignment', { components: Opt(Type.Array(AlignmentRef)) }),
  WeaponProperty: term('weapon-property', Mechanics),
  WeaponMastery: term('weapon-mastery', Mechanics),
  Tool: term('tool', { ability: Opt(AbilityRef) }),
  Action: term('action'),
  Event: term('event', {
    payload: Opt(Type.Array(Type.String(), { description: 'The fields the event carries, which a trigger\'s or an event test\'s `match` and the {event: field} Value read' })),
    emittedBy: Opt(Type.Literal('engine', { description: 'The engine fires it itself (the clock, movement, rolls outside any delivery), as well as any `emits` entries that name it' })),
  }),
  Rest: term('rest'),
  Restriction: term('restriction'),
  Roll: term('roll', { d20Test: Opt(Type.Boolean()) }),
  SourceType: term('source-type', { impliedBy: Opt(Predicate) }),
  AreaShape: term('area-shape', { dimensions: Type.Array(OneOf('size', 'width', 'height')) }),
  Environment: term('environment'),
  Rarity: term('rarity', { order: Type.Integer() }),
  StatBlockSection: term('stat-block-section', { order: Type.Integer() }),
  Group: entity('group', { isA: Opt(OneOrMany(GroupRef, { description: 'Groups this one is part of: a martial melee weapon is a martial weapon and a melee weapon' })) }),
  Plane: term('plane'),
}

// Bundles ------------------------------------------------------------------

const BundleCode = Type.String({ pattern: '^[a-z0-9]+(-[a-z0-9]+)*$' })
const Version = Type.String({ pattern: '^[0-9]+\\.[0-9]+\\.[0-9]+(?:-[0-9A-Za-z.-]+)?(?:\\+[0-9A-Za-z.-]+)?$' })
const Requirement = Obj({ bundle: BundleCode, version: Opt(Version) })

const ManifestDecl = Obj({
  id: BundleCode,
  name: Type.String(),
  version: Version,
  kind: Opt(OneOf('official', 'homebrew', 'playtest')),
  edition: Opt(OneOf('2014', '2024')),
  requires: Opt(Type.Array(Type.Union([Requirement, Obj({ anyOf: Type.Array(Requirement, { minItems: 2 }) })]))),
  license: Opt(Type.String()),
  attribution: Opt(Type.String()),
  releaseDate: Opt(Type.String({ pattern: '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' })),
}, 'bundle.json')


/** A patch value: a scalar replaces, an operator edits, a plain object recurses. The same
 *  grammar serves patch files, optional rules' overrides, and the `change` effect. */
const Pattern = Type.Record(Type.String(), Type.Unknown(), { minProperties: 1,
  description: 'A pattern, read as in `match`: the list elements whose fields match it' })
// The operators on a number, which also stand beside `$where` and `$at`.
const AddValue = Type.Union([Value, Obj({ amount: Value, unit: TimeUnit }), Obj({ amount: Value, upTo: Type.Union([Value, Type.Literal('maximum')]) })])
const Edit = { $base: Opt(Value), $add: Opt(AddValue), $subtract: Opt(Value), $multiply: Opt(Type.Number()), $atLeast: Opt(Value), $atMost: Opt(Value), $replace: Opt(Type.Unknown()) }
const PatchValueDecl = Type.Union([
  Type.Union([Type.String(), Type.Number(), Type.Boolean(), Type.Null()]),
  Obj({ $append: Type.Array(Type.Unknown()) }),
  Obj({ $prepend: Type.Array(Type.Unknown()) }),
  Obj({ $replace: Type.Unknown() }, 'Replaces the field whole, rather than recursing into it'),
  Obj({ $delete: Type.Literal(true) }),
  Obj({ $base: Value },
    'A starting value for a number that nothing stores: the proficiency bonus by level, 10 + Dexterity modifier as AC, 13 + Dexterity modifier under Mage Armor. Where several apply, or a value is stored too, the highest is the start, and every other operator works on it'),
  Obj({ $add: AddValue },
    'Adds to a number, or to a time span: a ritual takes 10 minutes longer. With `upTo`, not past that number. A missing field counts as 0'),
  Obj({ $subtract: Value }),
  Obj({ $multiply: Type.Number() }),
  Obj({ $atLeast: Value }, 'Raises the number to at least this: "you can attack twice, instead of once"'),
  Obj({ $atMost: Value }, 'Lowers the number to at most this'),
  Obj({ $remove: Pattern }, 'Removes the list elements that match: a ritual expends no spell slot'),
  Type.Object({ $where: Type.Union([Pattern, Type.Literal(true)]), ...Edit }, {
    required: ['$where'], patternProperties: { '^(?!\\$).+': PatchValue }, additionalProperties: false,
    description: 'Edits the elements of a list, or the entries of a map, that match `$where` (`true`: every one) with the other fields or an operator: {"$where": {"resource": "action"}, "resource": "bonus-action"}; every speed {"$where": true, "speed": {"$multiply": 0.5}}',
  }),
  Type.Object({ $at: Type.Union([Type.String(), Pick]), ...Edit }, {
    required: ['$at'], patternProperties: { '^(?!\\$).+': PatchValue }, additionalProperties: false,
    description: 'Edits the map entry at this key, which may be a pick: "+1 to an ability of your choice" is {"abilities": {"$at": {"choose": …}, "$add": 1}}',
  }),
  KeyedBy('^(?!\\$).+', PatchValue, { additionalProperties: false, description: 'Recurses into the field; on a list of keyed objects, into the elements it names by key' }),
])

const PatchDecl = Obj({
  source: Ref('Source'),
  patches: Type.Array(PatchEntry, { minItems: 1 }),
}, 'A patch file: changes to entities owned by another bundle')

/** Every entity kind, keyed by its id prefix. */
export const EntityKinds = {
  class: 'Class', subclass: 'Subclass', feature: 'Feature', feat: 'Feat', species: 'Species',
  background: 'Background', spell: 'Spell', state: 'State', condition: 'Condition', creature: 'Creature',
  item: 'Item', vehicle: 'Vehicle', standing: 'Standing', rule: 'Rule', deity: 'Deity', table: 'Table',
  ability: 'Ability', skill: 'Skill', size: 'Size', 'damage-type': 'DamageType',
  'damage-qualifier': 'DamageQualifier', sense: 'Sense', 'movement-mode': 'MovementMode',
  currency: 'Currency', 'spell-school': 'SpellSchool', 'hit-die': 'HitDie', language: 'Language',
  'creature-type': 'CreatureType', 'creature-tag': 'CreatureTag', alignment: 'Alignment',
  group: 'Group', 'weapon-property': 'WeaponProperty', 'weapon-mastery': 'WeaponMastery',
  tool: 'Tool', action: 'Action', event: 'Event', rest: 'Rest', restriction: 'Restriction',
  roll: 'Roll', 'source-type': 'SourceType', 'area-shape': 'AreaShape',
  environment: 'Environment', rarity: 'Rarity',
  'stat-block-section': 'StatBlockSection',
  plane: 'Plane',
} as const

export const KindDecls = {
  Gap: Obj({ category: Type.String(), name: Type.String() }),
  Source: EntityBase.source,
  Class: ClassDecl,
  Subclass: SubclassDecl,
  Feature: FeatureDecl,
  Feat: FeatDecl,
  Species: SpeciesDecl,
  Background: BackgroundDecl,
  Spell: SpellDecl,
  State: StateDecl,
  Condition: ConditionDecl,
  Creature: CreatureDecl,
  Item: ItemDecl,
  Vehicle: VehicleDecl,
  Standing: StandingDecl,
  Rule: RuleDecl,
  Deity: DeityDecl,
  Table: TableDecl,
  ...TermDecls,
  Manifest: ManifestDecl,
  PatchValue: PatchValueDecl,
  Patch: PatchDecl,
}
