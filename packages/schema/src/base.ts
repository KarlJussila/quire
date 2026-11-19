// Building blocks shared by every schema file.

import Type, { type TSchema, type TProperties } from 'typebox'

/** A closed object: unknown keys fail validation. */
export const Obj = <P extends TProperties>(properties: P, description?: string) =>
  Type.Object(properties, { additionalProperties: false, ...(description ? { description } : {}) })

export const Opt = <T extends TSchema>(type: T) => Type.Optional(type)

/** A closed list of literal strings. */
export const OneOf = <const L extends string[]>(...values: L) => Type.Enum(values)

/** One value, or a list of them. */
export const OneOrMany = <T extends TSchema>(type: T, options?: { description?: string }) =>
  Type.Union([type, Type.Array(type, { minItems: 1 })], options)

export const Ref = <N extends string>(name: N) => Type.Ref(name)

/** An object whose keys all match a pattern; other keys fail validation. */
export const KeyedBy = <T extends TSchema>(pattern: string, value: T, options: Record<string, unknown> = {}) =>
  Type.Record(Type.String({ pattern }), value, { additionalProperties: false, ...options })

// Identifiers --------------------------------------------------------------

/** The key part of an id: lowercase words, `/` namespaces, optional `@2024` edition. */
const KEY = '[a-z0-9][a-z0-9/_+-]*(@[0-9]{4})?'

/** Any flat id (`kind:key`). */
export const AnyId = Type.String({ pattern: `^[a-z][a-z-]*:${KEY}$`, description: 'A flat id: kind:key' })

/** An id of one kind, or of several. */
export const IdOf = (...kinds: string[]) =>
  Type.String({ pattern: `^(${kinds.join('|')}):${KEY}$`, description: `An id of kind ${kinds.join(' or ')}` })

/** A key that is unique within its owner (an activity key, a pool key, a choice key). */
export const Key = Type.String({ pattern: '^[a-z0-9][a-z0-9-]*$' })

export const DiceString = Type.String({
  pattern: '^[0-9]*d[0-9]+([+-][0-9]+)?$',
  description: 'Fixed dice, such as 2d8, 1d6+1, or d4',
})

// Vocabulary references ----------------------------------------------------

export const AbilityRef = IdOf('ability')
export const SkillRef = IdOf('skill')
export const SizeRef = IdOf('size')
export const DamageTypeRef = IdOf('damage-type')
export const DamageQualifierRef = IdOf('damage-qualifier')
export const SenseRef = IdOf('sense')
export const MovementModeRef = IdOf('movement-mode')
export const CurrencyRef = IdOf('currency')
export const SpellSchoolRef = IdOf('spell-school')
export const HitDieRef = IdOf('hit-die')
export const LanguageRef = IdOf('language')
export const CreatureTypeRef = IdOf('creature-type')
export const CreatureTagRef = IdOf('creature-tag')
export const AlignmentRef = IdOf('alignment')
export const WeaponPropertyRef = IdOf('weapon-property')
export const WeaponMasteryRef = IdOf('weapon-mastery')
export const ToolRef = IdOf('tool')
export const ActionRef = IdOf('action')
export const EventRef = IdOf('event')
export const RestRef = IdOf('rest')
export const RestrictionRef = IdOf('restriction')
export const RollRef = IdOf('roll')
export const SourceTypeRef = IdOf('source-type')
export const AreaShapeRef = IdOf('area-shape')
export const EnvironmentRef = IdOf('environment')
export const TableRef = IdOf('table')
export const RarityRef = IdOf('rarity')
export const StatBlockSectionRef = IdOf('stat-block-section')
export const GroupRef = IdOf('group')
export const PlaneRef = IdOf('plane')

// Content references -------------------------------------------------------

export const StateRef = IdOf('state', 'condition')
export const ClassRef = IdOf('class')
export const SubclassRef = IdOf('subclass')
export const SpellRef = IdOf('spell')
export const ItemRef = IdOf('item')
export const CreatureRef = IdOf('creature')
export const FeatureRef = IdOf('feature')
export const FeatRef = IdOf('feat')
export const StandingRef = IdOf('standing')
export const SpeciesRef = IdOf('species')

/** Kinds whose entities can be offered in a choice. */
export const KindName = OneOf(
  'ability', 'skill', 'language', 'tool', 'feat', 'feature', 'spell', 'item', 'species', 'background',
  'class', 'subclass', 'creature', 'damage-type', 'weapon-mastery', 'group', 'movement-mode', 'state', 'condition',
  'activity', // not an entity: every activity of every entity, for `change` and `match`
)

// Measurement --------------------------------------------------------------

export const TimeUnit = OneOf('round', 'minute', 'hour', 'day', 'week', 'month', 'year')
export const Role = OneOf('self', 'this', 'target', 'source', 'subject', 'actor')

// Book text ----------------------------------------------------------------

export const Text = Obj({
  plain: Type.String(),
  formatted: Opt(Type.String({ description: 'CommonMark presentation of the same text' })),
  wording: Opt(OneOf('upstream', 'srd', 'original')),
})

export const Gap = Obj({ category: Type.String(), name: Type.String() },
  'A rule the schema cannot express yet. The text still carries it.')

export const Source = Obj({
  book: Type.String({ pattern: '^[a-z0-9]+(-[a-z0-9]+)*$' }),
  page: Opt(Type.Integer({ minimum: 1 })),
  status: Opt(OneOf('playtest', 'legacy')),
})

/** Fields every entity has. */
export const EntityBase = {
  id: AnyId,
  name: Type.String({ minLength: 1 }),
  source: Source,
  text: Opt(Text),
  gaps: Opt(Type.Array(Gap)),
  supersedes: Opt(Type.Array(AnyId)),
  group: Opt(OneOrMany(GroupRef, { description:
    'The named sets it belongs to, which choices, effects, and conditions can refer to: a longsword is a martial melee weapon, Agonizing Blast an eldritch invocation' })),
}
