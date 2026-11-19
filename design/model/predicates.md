# Predicates

## The three kinds of `when`

`when` is one Predicate grammar: `all`, `any`, `not`, and atoms. Its atoms read
from three contexts, and the engine does what it can with each:

| Context | Examples | What the engine does |
|---|---|---|
| **Build** | level, ownership, equipped or attuned items, armor worn | Folds the effect into the sheet |
| **State** | `{has: "state:raging"}`, `{has: "condition:prone"}` | Applies the effect while the state is active in play |
| **Situation** | the event being handled (a roll, the attack, its result, the damage, a use), the target | Shows a conditional note on the affected number; a dice roller applies it |

## The atoms

| Group | Atoms |
|---|---|
| Build | `class` (has a level in the class, or has the subclass), `has` (a feature, feat, spell known, item, state, or condition id; see State; for an item, `match` says how it's carried, by the fields a saved character keeps on it: wearing armor is `{has: "group:armor", match: {worn: true}}`, attuned to and holding this item `{has: "this", match: {attuned: true, held: true}}`, and with no `match`, carrying it at all; `chosen` narrows it to one whose pick is this, as a Hunter who chose Colossus Slayer is `{has: "this", chosen: {"hunters-prey": "feature:colossus-slayer"}}`), `proficient`, `spellcaster` (can cast at least one spell). Like every id, theirs take a group, a filter, `"this"`, or `"candidate"` (see "Ids, groups, and filters" below): "a finesse weapon you are proficient with", "an object inscribed with this rune", "a skill you are proficient in", "an item you are attuned to". |
| Defense | `defense: {resist?, immune?, vulnerable?}`, each an id or a list: the creature has it once all its sources combine. "An attacker that can't be blinded" is `{not: {defense: {immune: "condition:blinded"}}}`. Like size and type, defenses change in play, so this is a named atom, not `match`. `restricted` (is under a `restriction:`, "can't speak") |
| State | `has` with a state or condition id (matching anything that isA it), with `source: Role` for "grappled by this creature" and "charmed by the source": `{has: "condition:grappled", source: "self"}`. A state is one more thing a creature has, so it uses the same atom as a feature. In a state filter, `lowers` (a list of paths) picks the states whose changes lower one of them: "any reduction to your ability scores" |
| Value | `{compare: Value, atLeast?, atMost?, equals?}`: any number a Value reads is at least or at most another Value, and a field is read by its path. `equals` tests a worked-out field that holds a flag or an id. `match` tests only the fields an entity stores, so it can't read what the rules work out for a character: "a weapon you have mastered" is `{compare: "masteries.{attack.item}", equals: true}`. "Cleric level 3 or higher" is `{compare: "levels.class:cleric", atLeast: 3}`; character level is `"levels.total"`; "Strength 13 or higher" is `{compare: "abilities.ability:str", atLeast: 13}`; "while the item has at least 1 charge" is `{compare: "pools.charges.current", atLeast: 1}`; "half its hit points or fewer" is `{compare: "hp.current", atMost: {times: "hp.max", by: 0.5}}`; "exhaustion level 3 or higher" reads `{stackLevel}`; challenge rating, speed, and renown or piety read `"cr"`, `"speeds.movement-mode:walk.speed"`, and `"standings.…"`. There is no separate atom per number |
| Event | `{event, by?, subject?, match?}`, a trigger's shape: true while that event is being handled, or something that happens because of it (a damage roll while its attack resolves). `match` tests the event's fields, which each event declares ([triggers-and-events.md](triggers-and-events.md) "Event fields"). No `by` means anyone, so "your saving throws" says `by: "self"`, and "attack rolls against you" is `{event: "event:roll-made", by: {pool: "any"}, subject: "self", match: {roll: "roll:attack"}}`. See "Event tests" below |
| Creature or object | `kind` (`creature` or `object`); a creature's own fields are a `match`, as a candidate's are: "a Large or smaller beast" is `{match: {creatureType: "creature-type:beast", size: {atMost: "size:large"}}}`, "larger than you" is `{match: {size: {atLeast: {of: "self", steps: 1}}}}`, "has a fly speed" is `{match: {speeds: {"movement-mode:fly": true}}}` (`{hover: true}` in place of `true`: and can hover with it), and "has blindsight" is `{match: {senses: {"sense:blindsight": true}}}`; `within` (feet, `of` a role or any member of a pool: "within 5 feet of an ally"), `cover` (from a role), `grounded`, `moved` (`{atLeast, toward?, straight?, since?}`: a charge), `perceived` and `perceives` (`{sense?, of?: Role}`), `willing`, `hostile`, `is` (a role: "not you" is `{not: {is: "self"}}`), `turn` (it is this role's turn: "on your turn"). A test no atom can say yet is prose, as anywhere (README "What every field and part takes"): `{prose: {text: "you have a hand free", gap: {category: "test", name: "free-hand"}}}`. `size` compares with `atLeast` and `atMost`, and can compare to a role ("no more than one size larger than you"); hit points and challenge rating are a `compare` (see Number). |
| Other creature | `{creature: Role, where: Predicate}` evaluates creature atoms against another role: "if you are evil", "while the grappler is within 5 feet" |
| Activity | over an activity being cast or used: `activity` is one by its key, any activity of an entity by the entity's id (the Attack action runs `{activity: "rule:grappling"}`), or any activity matching a filter, whose `match` reads the activity's stored fields: "the Attack action" is `{activity: {kind: "activity", where: {match: {action: "action:attack"}}}}`, and "a spell that calls for a saving throw" is `{match: {delivery: {save: true}}}` in that `where`. Also `spell` (spell ids, or a spell filter: "an evocation spell" is `{spell: {kind: "spell", where: {match: {school: "spell-school:evocation"}}}}`), `prepared`, `stored` (in a filter, the candidate is held in this pool: "a spell in your spellbook"), and `dealsDamage` (read from the outcomes, nested steps, and the damage type chosen when cast). On a state, `spell` is the spell it came from: Cleansing Touch ends `{kind: "state", where: {spell: {kind: "spell"}}}`. What an activity costs and how it attacks are stored fields, read with `match`: "an activity that costs ki" is `{match: {cost: {resource: "ki"}}}`, "a spell with a casting time of an action" is `{match: {activities: {key: "cast", cost: {resource: "action"}}}}` in a spell filter, and "three melee attacks" is `{match: {delivery: {attack: {range: "melee"}}}}`. The same filter picks activities in `change`'s `of`, `runs`, `grant`, `forbid`, and `compel`. |
| Choices | `group` (the candidate is in this group, with `for` a class: [vocabulary.md](vocabulary.md) "Groups"), `grantedBy` (the candidate, or the spell being cast, is something this entity gave you: [choices.md](choices.md)) |
| History | `happened: { ...EventTrigger; since: "turn-start" \| "last-turn" \| "rest" \| {amount, unit}}`, a trigger's fields plus `since`, which asks the event log whether something happened. `turn-start` is the start of the current turn, whoever's turn it is |
| World | `environment` |

Creature atoms and paths with no `of`, role, or `creature` wrapper read the creature in
question: each candidate, in a target filter; the recipient, in an outcome's
`when`; and `self`, in an effect's `when`.

## Event tests

A test on what is happening has a trigger's shape inside a `when`. The roll
events' fields are `roll` (with `ability` and `skill`; matches anything that
isA it), `natural` (a die value or range), `total`, `mode` (advantage or
disadvantage), `success` (the attack hit, or the save or check succeeded)
with `margin` ("fails by 5 or more"), `crit` (the attack roll scored a
critical hit, which is also a success), `attack`, `spell`, `slot`, and
`against`:

- `attack` is what the attack is made with, settled as it's made: `{range?,
  via?, ability?, item?, hands?}`, where `item: "this"` means "made with this
  weapon", an item, group, or item filter matches the weapon ("a Finesse
  weapon"), and `hands` is how many hands hold it. An attack states its
  `hands`: a weapon's is 1, and the Two-Handed rule and the Versatile form
  make it 2, so Dueling's "in one hand" is `{attack: {hands: 1}}`, and its
  "no other weapons" counts the weapons held: `{compare: {count: {pool:
  "object", where: {all: [{match: {weapon: true}}, {creature: "self", where:
  {has: "candidate", match: {held: true}}}]}}}, atMost: 1}`.
- `against` is where the effect being answered comes from: `{sourceType?,
  damageType?, condition?, state?, creatureType?, creature?, spellLevel?,
  qualifier?}`, each field one id or a list. Dwarven Resilience's "saving
  throws against poison" is `{event: "event:roll-made", by: "self", match:
  {roll: "roll:save", against: {sourceType: "source-type:poison"}}}`, and
  "saves against being cursed" is `against: {state: "state:curse"}`.
- A use's `spent` is what it spent: Bewitching Magic's "using an action and
  a spell slot" is `match: {spent: ["action", "spell-slots"]}` on
  `event:activity-used`.

**History.** `happened` asks the event log whether something happened: "if
you haven't attacked a hostile creature since your last turn" is a question
about the log, so it reuses the trigger grammar instead of a list of flag
names. The engine may not keep an event log at first; those rules validate
and stay dormant.

## Ids, groups, and filters

Anywhere an id goes, these go too, without the field declaring them
(`packages/schema/src/global.ts`):

- a group id, `group:martial-weapon`: its members;
- a filter `{kind, where}` of the kinds the field takes (below);
- `"this"`, the entity the rule is on: `{has: "this", match: {held: true}}`;
- `"candidate"`, what a filter or choice is considering, so only inside a
  `where`: `{kind: "skill", where: {not: {proficient: "candidate"}}}`;
- in a test, a list of ids, as in `{has: ["feat:alert", "feat:lucky"]}`.

What a group, filter, or list means follows from where it stands, never
from the field:

- **In a test** (`when`, `where`, a trigger), any one of them: `{has: "group:martial-weapon", match: {held: true}}` is wielding any martial weapon.
- **In what a rule gives, applies, or changes** (a proficiency, a defense,
  `change`'s `of`, `endState`), every one: proficiency in
  `group:martial-weapon` is in all of them, and the long rest's `endState`
  of `{kind: "state", where: {lowers: ["hp.max"]}}` ends every such state.
  For one of them, write a choice: Cleansing Touch's "end one spell" is a
  `choose` over a state filter.
- **In what an activity does with one thing** (`cast`, `summon`, `runs`,
  `grant`), the one the actor picks as they do it: a homebrew feature's "cast
  any ritual you have prepared" casts `{kind: "spell", where: …}`.
- **In a choice's candidates**, one picked when the choice is made.

## Filters

A filter is `{kind, where}`: any entity of that kind that passes `where`. It
stands wherever an id goes, and in the fields that hold only a filter (`replace`'s `what` and `with`). Inside `where`, `{match: {...}}` tests the
candidate's own stored fields, so a filter can test any field the kind has
without a named atom for it:

- A value equals the field, or is in it when the field is a list:
  `{match: {school: "spell-school:evocation"}}`,
  `{match: {lists: "class:wizard"}}`.
- A list of values is any of them: `{match: {school: [enchantment,
  illusion]}}`.
- An object matches a nested field the same way: a Finesse weapon is
  `{match: {weapon: {properties: "weapon-property:finesse"}}}`, and
  Forcebreaker's "a weapon that deals bludgeoning damage" is
  `{match: {weapon: {damage: {type: "damage-type:bludgeoning"}}}}`.
- `{atLeast, atMost}` compares a number (`{match: {level: {atLeast: 1}}}`);
  `true` matches any field that is set (`{match: {components: {material:
  true}}}`); `{chosen}` and `{choose}` stand for a pick, as in Magic
  Initiate's `{match: {lists: {chosen: "class"}, level: 0}}`.
- The loader checks each field against the kind's schema, so a misspelled
  field is an error rather than a filter that matches nothing.

It's a wrapper because field names clash with atoms: a spell's `level` is not
the character-level atom. Atoms stay for what isn't a stored field of the
candidate: `group` (which follows the group hierarchy), `proficient`, `has`,
`is`, `prepared`, `dealsDamage`, the holder's states, and `all`,
`any`, and `not`. Outside a filter, `match` tests the creature in question,
read with every effect applied, so a creature whose size changes in play
matches its changed size; its fields are checked against a stat block's.
"One-handed" is `{not: {match: {weapon: {properties:
"weapon-property:two-handed"}}}}`.

The counterpart that changes stored fields, `change`, is in
[effects.md](effects.md) "Changing things".

## Source types

Source types are about where an effect comes from, not what it does.
"Advantage on saves against poison" covers anything a poison does. Carrion
Crawler Mucus applies Paralyzed while Poisoned, Malice applies Blinded, and a
homebrew poison could do anything. So `source-type:` is vocabulary, and an
activity declares its source types: every activity on a poison item carries
`sourceTypes: ["source-type:poison"]`. Each source type's metadata also says
what implies it:

| Source type | Declared on | Also implied by |
|---|---|---|
| `source-type:poison` | poison items, monster stings, "a poison" | outcomes that deal poison damage or apply Poisoned |
| `source-type:disease` | contagion sources | applying a state that `isA` `state:disease` |
| `source-type:spell` | — | any spell's activity |
| `source-type:magic` | magical traps, curses | spells and magic items' activities |

This covers Gnome Cunning ("saving throws against magic") and Magic
Resistance ("against spells and other magical effects") too.

A source type is not "hostile". The `against` field is tested only on saves,
damage taken, and conditions imposed on you, so beneficial spells and items
never match it. Bless and Healing Word force no save and deal no damage, and a
willing target skips the save.
