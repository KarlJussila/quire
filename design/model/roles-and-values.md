# Roles and values

## Roles

Many rules point at a creature other than the one holding the effect:
"frightened *of you*", "while the *grappler* is within reach", "the *caster*
gains the benefit", "a creature that *hits you*". Every rule has these roles:

| Role | Who it is |
|---|---|
| `self` | the creature or object holding the effect, state, or activity. Inside a state, the state's holder; on an item, and in a state on an item, whoever has the item. |
| `this` | the entity the rule is written on, when that isn't the holder: "attacks made with this weapon", "this item's charges". In a state on an item, the item. |
| `target` | the creature or object an activity's step is resolving against |
| `source` | the creature that applied a state or created a zone. Every applied state records its source. |
| `subject` | in a trigger, the creature the event happened to (whose turn starts, who was hit, who entered the area); an activity no trigger sets off has none, and its outcomes go to its targets |
| `actor` | in a trigger, the creature that caused the event: the attacker who hit you, the creature leaving your reach |

Objects take part on the same terms as creatures. An object can be a target,
hold a state (a Shillelagh-imbued club, a glyph-marked door), or be the
subject of an event.

**A state on an item is written as the item's own rules are.** Its effects
and activities join the item's while it lasts: `self` is whoever has the
item, `this` is the item, and `source` is the creature that applied the
state. So the item carries the change wherever it goes. Chromatic
Infusion's weapon deals the extra damage whoever hits with it, and Enhanced
Defense is Armor +1's effect with the artificer's level read through
`source`:

```jsonc
// A homebrew infusion: "the weapon deals an extra 1d4 damage of the chosen type when it hits"
{ "applyState": { "state": { "effects": [
    { "type": "damage-bonus", "amount": "1d4", "damageType": { "choose": … },
      "when": { "event": "event:roll-made", "by": "self",
                "match": { "roll": "roll:damage", "attack": { "item": "this" } } } } ] },
    "duration": { "amount": 1, "unit": "minute" } },
  "to": "target" }

// A homebrew ward: +1 to AC while worn or wielded, +2 from the wizard's 10th level
{ "type": "change", "when": { "any": [ { "has": "this", "match": {"worn": true} }, { "has": "this", "match": {"held": true} } ] },
  "set": { "ac": { "$add": { "if": { "compare": "source.levels.class:wizard", "atLeast": 10 },
                             "then": 2, "else": 1 } } } }
```

A state that describes the item goes on the item: Flame Tongue's flames are
on the sword, not on the hand holding it. A rule that
benefits only the creature who placed a mark (Lifedrinker's pact weapon, a
homebrew rune) stays on that creature's feature and tests the item for
the mark: `{has: "state:warlock/pact-weapon", source: "self"}`.

**Relationships are states, not more roles.** A mount, companion, familiar,
host, or pilot is a state with a source: summoning a familiar applies
`state:familiar` to it with the caster as source, and mounting applies
`state:mounted` to the rider with the mount as source (`applyState`'s
`source` names a source other than the creature acting). "Your familiar" is
then `{pool: "any", where: {has: "state:familiar", source: "self"}}`, and
"grappled by this creature" is the same pattern. The role list stays closed
and short.

A trigger's `by` is the event's actor. Its `subject` is who the event
happened to. Inside the triggered activity, the roles `actor` and `subject`
name those two creatures, so Hellish Rebuke and an opportunity attack target
`actor`. "When a creature you can see hits you" is `{event:
"event:roll-resolved", by: {pool: "any", where: {perceived: "sight"}},
subject: "self", match: {roll: "roll:attack", success: true}}`. Who is `by`
and who is `subject` for each event is in
[triggers-and-events.md](triggers-and-events.md).

## Who

A **who** is a role, or a creature pool narrowed by a filter:

```ts
type Role = "self" | "this" | "target" | "source" | "subject" | "actor";
type Who  = Role | { pool: "ally" | "enemy" | "any" | "object";
                     of?: Role;                // "allies of the source"; default self
                     where?: Predicate;        // evaluated against each candidate
                     chosen?: true | "except"; // "of your choice", "any you designate to be unaffected"
                     includeSelf?: boolean };
```

```jsonc
// "each creature of your choice within 30 feet that you can see"
{ "pool": "any", "chosen": true,
  "where": { "all": [ { "within": 30 }, { "perceived": "sight" } ] } }

// "hostile goblinoids"
{ "pool": "enemy", "where": { "match": { "tags": "creature-tag:goblinoid" } } }
```

A who picks what's in play right now, and a filter (`{kind, where}`,
[predicates.md](predicates.md) "Filters") picks from the books. Both stand in
more places rather than a third selector being added:

- `{count: Who}` is a value: how many the who picks. A homebrew rally's
  "the number of allies you can see within 30 feet, to a maximum of +3" is
  `{min: [3, {count: {pool: "ally", where: {all: [{within: 30}, {perceived:
  "sight", by: "self"}]}}}]}`.
- Items anyone holds are objects in play, and the item atoms take
  `"candidate"`: a homebrew feature's "per magic item you are attuned to" is
  `{count: {pool: "object", where: {creature: "self", where: {has: "candidate", match: {attuned: true}}}}}`.
- A step's `origin` is a who: where its range is measured from and the
  effect comes from, if not the one acting. Find Familiar's touch delivery is
  a `change` that adds a variant with `origin` set to the familiar.

## Values

```ts
type Value =
  | number
  | string                                    // fixed dice: "2d8", "1d6+1", "3d4"
  | { dice: { count: Value; die: Value; plus?: Value } }  // computed dice: Sneak Attack, upcasting
  | Path                                      // a field read by its path: "modifiers.ability:wis", "target.hp.max"
  | "unlimited"                               // Rage at 20th level
  | { byLevel: Record<string, Value | "unlimited">; of?: ClassRef }  // class level with `of`, else character level
  | { table: TableRef; column?: string; by?: Value } // a progression's column; a value by size
  | { slotLevel: true }                       // the level the spell was cast at
  | { value: string; from?: Id }              // a named value from an entity's `values`: a rune's DC, Hex's die
  | { chosen: string; value?: string; from?: Id }  // a pick, or a value the picked entity carries (choices.md)
  | { weapon: "damage" | "die"; of?: Role }   // the weapon's own damage dice
  | { stackLevel: StateRef }                  // exhaustion level
  | { pool: string; facet: "spent" }         // the total on the units the cost spent, or a roll of their dice (Hit Dice); a pool group's key works too
  | { count: Who }                            // how many the who picks right now
  | Choose<Value | { atLeast: Value; atMost?: Value }>  // a number you pick; a range is any whole number in it
  | { event: string }                         // a field of the triggering event, or of the event a `when` tests
  | { if: Predicate; then: Value; else: Value } // a number that depends on a test; these nest
  | { settled: "natural" | "total" | "mode" | "success" | "crit" | "margin" | "attack" | "spell" | "slot"
             | "against" | "spent" | "amount" | "excess" | "remaining" } // in an emits entry: what the engine settled
  | { stored: string }                        // in an emits entry: a stored field of what it covers, by path: "delivery.save.kind"
  | { result: string }                        // what an earlier outcome (by key) rolled or dealt
  | { speed: "in-use"; of?: Role }            // the speed the creature is moving with
  | { sum: Value[] } | { max: Value[] } | { min: Value[] }
  | { times: Value; by: Value }
  | { divide: Value; by: number; round: "down" | "up" }
  | { bonus: EventFields };              // what the creature's rules add to a roll with these fields: its Wisdom (Perception)
                                         // bonus is {bonus: {roll: "roll:check", skill: "skill:perception"}}. A skill with no
                                         // ability named uses its own. Passive scores are 10 plus this.
```

**A path reads a field** of a creature, with every effect applied:
`"modifiers.ability:wis"`, `"proficiencyBonus"`, `"levels.total"`,
`"levels.class:cleric"`, `"spellcasting.class:druid.dc"`, `"hp.max"`,
`"cr"`, `"reach"`, `"standings.standing:…"`, `"pools.ki.current"`,
`"speeds.movement-mode:fly.speed"`, `"senses.sense:darkvision.range"`. A
doubled or halved proficiency bonus is `{times: "proficiencyBonus", by: 2}`.
A segment in braces reads a pick: Dash's `"speeds.{speed}.speed"`. Some
fields are stored (a stat block's `cr`), others computed (the proficiency
bonus); see "What a path can read" below.

A path may start with a role: `"target.hp.max"`. With none, it reads the
creature the test is about, as creature atoms do
([predicates.md](predicates.md)): in a target filter, each candidate; in
`{creature, where}`, that creature; everywhere else, `self`. Inside a filter,
`self.` still means the holder: Control Undead's "an undead whose challenge
rating is lower than your paladin level" is `{not: {compare: "cr", atLeast:
"self.levels.class:paladin"}}`.

**What a path can read.** Nothing lists the facts a rule may read. A path
is checked only for its shape; it reads a fact that is either stored or
computed:

- **Stored:** a field of the Creature kind (a stat block) or the Character
  kind (a saved character, [character.md](character.md)). A `this.` path
  reads the entity the rule is on, by its own kind's fields.
- **Computed by a loaded rule:** a `resource` effect computes its pool
  (`pools.<key>.max` and `.current`, and each field it declares, such as
  `die`); an activity's `uses` is a pool by the activity's key; a `change`
  on the creature that gives a field its starting value (`$base`) or sets
  it outright (`$replace`) computes that field
  ([effects.md](effects.md), "A starting value, and armor class"). So a homebrew rule that computes `sanity` makes `sanity` readable
  with nothing added to the schema.
- **Counted by the engine:** a character's class levels
  (`levels.class:wizard`, `levels.total`), from its stored `classes`. They
  come before any rule, since they decide which features the character has.

A stored field and a computed one never share a name with different
shapes: a stat block's `ac` is the number a rule reads, and what it comes
from is `acFrom`. The loader reports each path that nothing supplies as the
info finding `unsupplied-path`, one per path with how many entities read
it. What it lists is what the core rules have yet to compute.

**Every entry of a list or map** is a `*` segment, inside `sum`, `max`, or
`min` given one value instead of a list: the value is worked out once for
each entry the path reads. A character's hit points from its levels are
`{sum: {max: [1, {sum: ["classes.*.*.hp", "modifiers.ability:con"]}]}}`:
each level's hit points plus the Constitution modifier, at least 1, added
up.

**A number that depends on a test** is `{if, then, else}`. The test reads
what an outcome's `when` reads, the recipient: a homebrew cantrip's "d12
instead of d8 if the target is missing any hit points" is
`{if: {compare: "hp.current", atMost: {sum: ["hp.max", -1]}}, then: 12,
else: 8}`.

**Picking a number is a choice.** A choice can stand where a value goes,
and a range `{atLeast, atMost?}` among its candidates is any whole number in
it. Other rules read the pick with `{chosen: key}`, like any choice. Healing
Light's cost is `{resource: "healing-light", amount: {choose: {key: "dice",
name: "Dice to Spend", from: [{atLeast: 1, atMost: {max: [1,
"modifiers.ability:cha"]}}]}}}`, and its heal is `{dice: {count: {chosen: "dice"},
die: 6}}`. Lay on Hands' range has no `atMost`, since the pool already caps
the spend.

**Upcasting is a Value.** Computed dice plus `{slotLevel: true}` express
every "at higher levels" rule, with no separate scaling list. Divine Smite's
"2d8, plus 1d8 for each slot level above 1st, to a maximum of 5d8" is
`{dice: {count: {min: [5, {sum: [1, {slotLevel: true}]}]}, die: 8}}`.
Cantrips scale with `byLevel` on character level.

**Named values.** An entity's `values` holds numbers or ids that belong to
the rule rather than to any one effect: a rune's save DC, Hex's die, Wild
Shape's maximum challenge rating. `{value: key}` reads one from the entity
the rule is on, and `from` names another.
