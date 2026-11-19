# Characters

A character is an entity like any other: a document the app saves, checked
by the schema as the `Character` declaration
(`packages/schema/src/character.ts`; the example below is its test
fixture). It isn't bundle content, so nothing in a bundle refers to one. It
has two layers:

- **Stored:** what the player decided and what has happened in play. This
  is the saved file.
- **Worked out:** the character as the rules see it, with every effect
  applied: its AC, speeds, maximum hit points, features, spell save DC. The
  engine computes it from the stored layer and never saves it. A rule
  reading `target.ac` reads this layer.

Both layers share one set of names, since rules read them by the same paths
([roles-and-values.md](roles-and-values.md) "Values"): a stored field never
has the name of a worked-out one with a different shape. The levels taken
are stored in `classes`; the count per class is the worked-out `levels`.

## Stored: what the player decided

The stored character holds decisions and play state only. Anything the rules
can work out (AC, speeds, proficiencies, the features gained) is never
stored, so it can't go stale.

```jsonc
{
  "format": 1,
  "id": "4f9c…",                         // a uuid; not a content id
  "name": "Ilsa",
  "bundles": ["core", "srd24"],           // the content it's built with
  "rules": {                             // optional rules turned on, with what each tracks
    "rule:experience-points": {"xp": 6500},
    "rule:renown": {"faction:harpers": 3}
  },
  "abilities": {"ability:str": 8, "ability:dex": 15, "ability:con": 14,
                "ability:int": 15, "ability:wis": 10, "ability:cha": 12},  // before any bonus
  "species": {"species": "species:elf@2024",
              "chosen": {"feature:elf/elven-lineage@2024": {"lineage": "feature:elf/elven-lineage/high-elf@2024",
                                                           "spellcasting-ability": "ability:int"}}},
  "background": {"background": "background:sage@2024",
                 "chosen": {"feature:sage/ability-scores@2024": {"ability-scores": {"ability:int": 2, "ability:con": 1}},
                            "feat:magic-initiate@2024": {"cantrips": ["spell:guidance", "spell:light"], "spell": "spell:bless",
                                                         "spellcasting-ability": "ability:int"}}},
  "firstClass": "class:wizard@2024",     // gives saving throws and the full starting proficiencies
  "classes": {                           // each class's levels in order: the first entry is its level 1
    "class:wizard@2024": [
      {"hp": 6,
       "chosen": {"feature:wizard/spellcasting@2024": {"cantrips": ["spell:fire-bolt", "spell:mage-hand", "spell:prestidigitation"]}}},
      {"hp": 4},
      {"hp": 4},
      {"hp": 4,
       "chosen": {"feature:wizard/ability-score-improvement@2024": {"feat": "feat:grappler@2024"},
                  "feat:grappler@2024": {"ability": "ability:dex"}}}
    ],
    "class:fighter@2024": [
      {"hp": 6,
       "chosen": {"feature:fighter/fighting-style@2024": {"fighting-style": "feat:archery@2024"}}}
    ]
  },
  "inventory": [
    {"item": "item:armor-of-resistance@2024", "worn": true, "attuned": true,
     "chosen": {"item:armor-of-resistance@2024": {"base": "item:studded-leather", "resistance": "damage-type:fire"}}},
    {"item": "item:arrow@2024", "quantity": 18},
    {"item": "item:bag-of-holding@2024", "contents": [{"item": "item:rope@2024", "quantity": 1}]}
  ],
  "currency": {"currency:gp": 112, "currency:sp": 4},
  "hp": {"current": 23, "temp": 0},
  "spent": {"hit-dice": 2, "spell-slot-1": 1, "arcane-recovery": 1},
  "states": [{"state": "condition:poisoned"}, {"state": "condition:exhaustion@2024", "level": 1}]
}
```

The ids and choice keys are the corpus's, except `rule:experience-points`
and `rule:renown`, which don't exist yet.

**Picks sit where they were offered.** A choice belongs to the entity that
holds it, so a pick is stored under that entity's id and the choice's key,
in the place the entity was gained: Elven Lineage's pick under the species,
a level's picks under that level. The same feature gained twice (an Ability
Score Improvement at levels 4 and 8) has its picks in two places, so
repeats need nothing special. A pick that is itself an entity with choices
has them beside it, under its own id: Grappler taken at the level 4
Ability Score Improvement keeps its ability at that level under
`feat:grappler@2024`. One shape serves every kind, so the
engine can find every choice a character was offered and whether it was
answered.

**Picks made on use aren't stored here.** Protection from Energy's damage type is
asked each time it's cast and lives on the state the cast applies, in
`states`.

**A pick is whatever the choice offers.** A choice of content (a spell, a
feat, a damage type, a lineage) stores the id. A choice of a value stores
the value, and a choice between options written in place stores the
option's name. An option with its own name and rules in the book is
content, so it's a feature with an id: Elven Lineage's pick is
`"feature:elf/elven-lineage/high-elf@2024"`. The spellcasting ability is
picked once on Elven Lineage itself, so it sits beside the lineage. A rename in the content orphans a
pick by id or by name alike, and the engine reports it like any unanswered
choice.

**Levels are kept per class**, keyed by class id like speeds, so a level's
picks sit at its class level: the Wizard's level 4 is the fourth entry
under `class:wizard@2024`. The order levels were taken across classes isn't
kept; no rule needs it except which class came first, which is
`firstClass`.

**Hit points per level** are the number that level's Hit Die gave: its
maximum at the first level, afterwards the number rolled or the fixed value.
The Constitution modifier isn't in it; the hit points rule adds that.

**Items carry their own picks.** Two suits of Armor of Resistance can resist
different types, so an inventory entry holds its item's picks, whether it's
worn, held, or attuned, its own spent charges (`"spent": {"charges": 2}`),
what its pools hold, and what's inside it. A spellbook's spells are
`"holds": {"spellbook": ["spell:shield", …]}` on the book's entry, and a
Ring of Spell Storing's are the same with the slot level each takes up
(`{"id": "spell:bless", "amount": 1}`). So a Wizard with no book has
nothing to prepare from, and a second book holds its own spells. A pool that
holds the same thing twice is reported.

**Pools store what's spent, not what's left.** The maximum is worked out and
can change (a level, a Con increase), so storing spent units keeps the two
consistent. Recovery is a `spent` entry going down. Death saving throws are
two pools of the death-saving-throws rule, so they're saved here too, not in
a field of their own; a rule reads a count as `spent.relentless-rage`.

**Hit points store what's left.** A higher maximum doesn't heal: putting on
an Amulet of Health raises the maximum, and current hit points stay where
they are. A lower maximum caps them, so the engine shows the smaller of the
stored number and the maximum, and writes it back the next time hit points
change.

**Optional rules bring their own fields.** Experience points, renown, and
piety are optional rules, so the Character kind has no field for them.
`rules` lists the optional rules turned on, by rule id, and each holds what
that rule tracks, in a shape the rule entity declares; the checker rejects
an entry for a rule that isn't loaded. An optional rule that extends an
existing field stores there instead: a homebrew Resolve score is an ability,
so it goes in `abilities` once its rule is on.

## Worked out: what the rules compute

The worked-out layer has the Creature kind's fields, so rules read a
character and a monster the same way: `size`, `creatureType`, `speeds`,
`senses`, `abilities` (with every bonus), `ac`, `hp.max` beside the stored
current hit points, `languages`, `effects`, and `activities`. It adds what
only a character has:

| Field | Holds |
|---|---|
| `levels` | levels per class, keyed by class id, and `total` (counted by the engine) |
| `modifiers` | each ability's modifier, keyed by ability id |
| `proficiencyBonus` | from the total level |
| `spellcasting` | per class: ability, `dc`, `attack`, `mod`, prepared and known spells; for a 2024 Wizard, a Wizard prepares from what its spellbook item holds |
| `pools` | every pool's `max` and `current` (`current` is `max` minus `spent`) |
| `proficiencies` | skills, saves, tools, weapons, armor, languages, with their level |
| `features` | everything gained, each with where it came from (`grantedBy` reads this) |
| `masteries` | the kinds of weapon whose mastery property the character can use, keyed by item id; a Weapon Mastery feature sets each from its choice |
| `attunement` | slots used and the maximum |

`passives` (by skill, 10 plus what the rules add to that check),
`carryingCapacity`, `speeds`, and `senses` are fields a rule computes, as the
ones above are. A character's resistances, immunities, and vulnerabilities
are its `defense` effects that apply; the engine lists them, with the ones
that hold only at times set apart.
How it sees is its `see` effects that apply, each with its range: a sense's
rule gives one for a creature with that sense (darkvision), and a feature
can give its own (Devil's Sight). Each class level gives a Hit Die of the
class's size, in a pool for that size (`hit-dice-d10`).

Three things are worked out on request and aren't fields. **A roll**
(`roll({roll, ability, skill, attack})`) is what every loaded rule adds to
that roll's die, with the best ability an `ability-substitute` allows.
**The activities** are every activity the character's entities and rules
give it, each with the changes other entities make to it (a `change` whose
`of` is a filter of activities); a change with a `variant` adds the changed
activity beside the original. **The attacks** are the activities delivered
by an attack, each with its roll and its damage worked out
([activities.md](activities.md), "What an attack adds to its roll").

Each worked-out field is computed by a loaded rule, so homebrew and optional
rules change it as data, except `levels`: the engine counts the stored
`classes` itself, before any rule runs, because the levels decide which
features the character has. The table is what the core rules compute, not a
list the schema keeps ([roles-and-values.md](roles-and-values.md), "What a
path can read"). A monster's printed AC or proficiency bonus is its stored
value instead.

## What the engine does with it

- **Work out the character** from the stored layer and its content, applying
  every effect, whenever anything changes. The target is per
  keystroke.
- **Check the picks.** Every choice offered and unanswered is reported, and
  every pick that no longer qualifies is flagged ([choices.md](choices.md),
  "A pick that stops qualifying").
- **Write back** only what the player decides or what happens at the
  table: a level adds an entry to its class in `classes`, a pick answers a choice,
  play changes hit points, spent pools, states, inventory, currency, and the
  optional rules' entries.

## Companions, content, and forms

- **Companions and summons are entities of their own** (a familiar, a
  summoned creature, a mount), with their own hit points and states. Either
  side can refer to the other: a character's `companions` lists ids, and a
  companion names whoever controls it.
- **The content list lives on the character** until there are campaigns.
- **No history.** A level entry doesn't record when it was taken.
- **Changing form** (Wild Shape, Polymorph) isn't modelled yet.
