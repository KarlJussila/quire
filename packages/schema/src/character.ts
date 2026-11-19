// A character: the document the app saves (design/model/character.md). It holds what the
// player decided and what has happened in play, never what the rules work out (AC, speeds,
// proficiencies, the features gained), so nothing in it can go stale. It isn't bundle
// content: its id is a uuid, and no bundle refers to one.

import Type from 'typebox'
import { KeyedBy, Obj, Opt, Ref, IdOf, ClassRef, ItemRef, SpeciesRef, StateRef } from './base.ts'

const ID = '^[a-z][a-z-]*:[a-z0-9][a-z0-9/_+-]*(@[0-9]{4})?$'
const BundleCode = Type.String({ pattern: '^[a-z0-9]+(-[a-z0-9]+)*$' })

/** What a choice was answered with: an id, an option's name, a number, several of those,
 *  or a count per candidate for a pick that repeats ({"ability:int": 2, "ability:con": 1}). */
const Pick = Type.Union([
  Type.String({ minLength: 1 }),
  Type.Number(),
  Type.Array(Type.Union([Type.String({ minLength: 1 }), Type.Number()]), { minItems: 1 }),
  KeyedBy(ID, Type.Integer({ minimum: 1 }), { minProperties: 1 }),
])

/** The picks made where something was gained, by the id of the entity holding each choice and
 *  then the choice's key. A pick that is an entity with choices of its own has them beside it,
 *  under its id: Grappler taken at an Ability Score Improvement. */
const PicksDecl = KeyedBy(ID, KeyedBy('^[a-z0-9][a-z0-9-]*$', Pick, { minProperties: 1 }),
  { description: 'Picks by the id of the entity offering the choice, then the choice\'s key' })
const Picks = Ref('Picks')

const SpentDecl = KeyedBy('^[a-z0-9][a-z0-9-]*$', Type.Integer({ minimum: 0 }),
  { description: 'Units spent from each pool, by its key. What is left is worked out: the maximum minus this' })
const Spent = Ref('Spent')

const InventoryEntry = Obj({
  item: ItemRef,
  quantity: Opt(Type.Integer({ minimum: 0 })),
  worn: Opt(Type.Boolean()),
  held: Opt(Type.Boolean()),
  attuned: Opt(Type.Boolean()),
  chosen: Opt(Picks),
  spent: Opt(Spent),
  holds: Opt(KeyedBy('^[a-z0-9][a-z0-9-]*$', Type.Array(Type.Union([Type.String(), Obj({ id: Type.String(), amount: Opt(Type.Number({ minimum: 0 })) })])),
    { description: 'What each of its pools holds, by the pool\'s key: the spells in a spellbook, the spells stored in a Ring of Spell Storing. An entry with an `amount` takes up that much of the pool (the slot level a stored spell was cast with)' })),
  contents: Opt(Type.Array(Ref('InventoryEntry'))),
}, 'An item carried: its own picks and spent charges, what its pools hold, and what is inside it')

const Level = Obj({
  hp: Type.Integer({ minimum: 1, description: 'The hit points this level\'s Hit Die gave: its maximum at the first level, afterwards the number rolled or the fixed value' }),
  chosen: Opt(Picks),
}, 'One level in a class, with the picks made there')

const CharacterDecl = Obj({
  format: Type.Literal(1),
  id: Type.String({ pattern: '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$', description: 'A uuid, not a content id' }),
  name: Type.String({ minLength: 1 }),
  bundles: Type.Array(BundleCode, { minItems: 1, description: 'The content it is built with' }),
  rules: Opt(KeyedBy('^rule:', Type.Record(Type.String(), Type.Unknown()),
    { description: 'Optional rules turned on, each with what it tracks, in the shape its rule entity declares' })),
  abilities: KeyedBy('^ability:', Type.Integer({ minimum: 1 }), { description: 'Scores before any bonus' }),
  species: Opt(Obj({ species: SpeciesRef, chosen: Opt(Picks) })),
  background: Opt(Obj({ background: IdOf('background'), chosen: Opt(Picks) })),
  firstClass: Opt(ClassRef), // the class taken at character level 1: it gives saving throws and the full starting proficiencies
  classes: KeyedBy('^class:', Type.Array(Level), { description: 'Each class\'s levels in order, the first entry its level 1. The engine works out the count per class and in all (`levels.class:wizard`, `levels.total`)' }),
  chosen: Opt(Picks), // picks for choices the rules themselves offer every character: the 2024 languages
  inventory: Opt(Type.Array(Ref('InventoryEntry'))),
  currency: Opt(KeyedBy('^currency:', Type.Integer({ minimum: 0 }))),
  hp: Obj({ current: Type.Integer({ minimum: 0 }), temp: Opt(Type.Integer({ minimum: 0 })) },
    'Hit points left. A higher maximum doesn\'t heal; a lower one caps them'),
  spent: Opt(Spent),
  states: Opt(Type.Array(Obj({
    state: StateRef,
    level: Opt(Type.Integer({ minimum: 1 })),
    chosen: Opt(Picks),
  }, 'A state or condition on the character, with picks made when it was applied (Protection from Energy\'s damage type)'))),
  companions: Opt(Type.Array(Type.String(), { description: 'The ids of companions saved beside it: a familiar, a summoned creature, a mount' })),
}, 'A character, as saved: what the player decided and what has happened in play')

/** Declarations for the saved character; documents, not rules, so no field takes a choice. */
export const CharacterDecls = {
  Character: CharacterDecl,
  InventoryEntry,
  Picks: PicksDecl,
  Spent: SpentDecl,
}

