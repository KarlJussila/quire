# Effects

## The effect types

Effect types are grammar, so the union is closed. This is the full list.

| Type | Fields | Examples |
|---|---|---|
| `roll-mod` | `mode: "advantage" \| "disadvantage"` | Rage's advantage on Strength checks |
| `forced-result` | `success?` and `crit?`, each `true` or `false`, whatever the die says | Paralyzed's failed Str and Dex saves (`success: false`) and critical hits from within 5 feet (`crit: true`); Deafened; Adamantine Armor (`crit: false`) |
| `die-mod` | how the dice are rolled: `reroll?: {below, mustUse?}`, `extraDie?`, `maximize?`, `times?` (roll each die that many times and add them) | Great Weapon Fighting 2014, Halfling Lucky, Brutal Critical, Supreme Healing, a critical hit's damage dice |
| `damage-bonus` | `amount: Value`, `damageType` | extra damage of its own type: Hex, a Flame Tongue's fire |
| `defense` | `resist?`, `immune?`, `vulnerable?`, each a list of ids or `{all: true, except?: Id[]}` | Rage, a golem, a vampire's resistances |
| `bypass` | `resistance?`, `immunity?` (damage types) | Boon of Irresistible Offense |
| `speed` | `mode`, `speed: Value`, `hover?` | fly speed, swim speed equal to walking |
| `sense` | `sense`, `range: Value` | darkvision, blindsight, telepathy |
| `proficiency` | `in: Id[]`, `level?: "proficient" \| "expertise" \| "half" \| "proficiency-or-expertise"` | skills, saves, tools, weapons, armor; languages known |
| `spell-access` | `spells`, `how: "prepared" \| "known" \| "innate"`, `counts?: boolean`, `countsAs?` (a class), `ability?`, `uses?`, `castAt?`, `set?` | domain spells, a feat's spells |
| `spell-list` | `spells` (ids or a Predicate), `list`: a class, or `"spellcasting"` for every class you cast spells with | an Otherworldly Patron's expanded list, a dragonmark's or guild's spells |
| `resource` | `key`, `max: Value`, `die?`, `dc?`, `rolled?`, `group?`, `values?`, `recover: Recovery[]` | rage uses, ki, sorcery points, wand charges ([costs-and-economy.md](costs-and-economy.md)) |
| `ability-substitute` | `for`, `use: AbilityRef \| "spellcasting"` | the 2024 Pact of the Blade, Shillelagh, monk weapons |
| `change` | `of?` (whose fields: unset is the creature the effect applies to; an id, `this`, or a `{kind, where}` filter, where `activity` is a kind; `"event"` is the roll the `when` tests), `set` (a patch body), `variant?` (adds a second version of an activity instead of changing it) | ability scores and their maximums, AC, speeds, HP maximum, pool facets, attunement slots, creature type; a roll's total (`total`: Bless's +1d4, a +1 weapon's attack bonus, Rage's damage), each die (`die`: Great Weapon Fighting 2024), the critical hit range (`criticalMinimum`: Improved Critical); Extra Attack, metamagic, rituals, Potent Cantrip, Telekinetic's Mage Hand. See "A creature's fields" and "Changing things" |
| `counts-as` | `qualifier` | damage that counts as magical or silvered against resistance and immunity: a monk's unarmed strikes, a pact weapon. Counting as a size larger for carrying capacity is a `change` that doubles it (Powerful Build) |
| `forbid` | `restriction`, `target?: Who` (only when acting against them), `activity?` (only these activities: a key, an entity's id, or an activity filter) | can't cast spells or concentrate while raging; Charmed's "can't attack the charmer" or aim harmful effects at them |
| `compel` | `activity?` (a key, an entity's id, or an activity filter), `target?: Who`, `when?` | the Berserker Axe's "attack the nearest creature", a sentient item taking control |
| `suppress` | `sourceType`, `state`, or `rule`; `effects?` (only those rules' or states' effects with these keys) | an antimagic field, inside a zone; Alert suppresses the unseen-attacker part of the unseen-attackers rule against you; a feat that frees you from somatic components the somatic part of the components rule |
| `see` | `range?`, `dim?: "bright"`, `darkness?: "dim" \| "bright"`, `magicalDarkness?`, `invisible?`, `withoutSight?`, `tremor?`, `illusions?`, `transformations?`, `planes?` | darkvision, blindsight, tremorsense, and truesight (as rules per edition, for creatures with that sense), See Invisibility, Devil's Sight |
| `light` | `bright: Value`, `dim: Value`, `as?: EnvironmentRef` | the Sun Blade's sunlight, a torch |
| `waive` | `restriction` | a druid in Wild Shape can still cast spells |
| `zone` | see [activities.md](activities.md) "Zones and auras" | Aura of Protection, an antimagic cone |
| `shapeshift` | `form` (a creature id, or a Predicate over creatures), `keep: KeepRef[]`, `hp?: "form" \| "own"`, `gear?: "falls" \| "merges" \| "worn"` | the effect inside Wild Shape's and Polymorph's states |
| `triggered` | a `TriggeredRule` ([triggers-and-events.md](triggers-and-events.md)) | Troll Regeneration, a damage aura at turn start |
| `record` | `pick`: a `choose` that no rule needs to act on ([choices.md](choices.md)) | a homebrew flavor pick, a homebrew Weather Ward's season |

Every effect may carry `when` and `to`. `to` sends the effect to someone other
than its holder while it holds: the Hexed state gives its `source` extra damage
against the holder, and Charmed gives the charmer advantage on social checks.
Inside the effect, `self` is still the holder. Effects with a numeric part go
through the pipeline under "How effects combine".

**Spell access.** `how: "prepared"` is always prepared, `"known"` is learned,
and `"innate"` is cast without either, usually with `uses`. `counts: false`
says the spells don't count against the number you can prepare or know; it is
written out wherever the text, or the class rule it falls under, says so. A
subclass's spell table is one `spell-access` per row, gated on the class level:
`when: {compare: "levels.class:cleric", atLeast: 3}`. A spell granted by a class
or subclass feature counts as that class's spell, so the class isn't repeated.
A spell a feature grants in a cut-down form is its own spell entity, on no
class list: a homebrew domain's warm-shield-only Fire Shield is
`spell:cleric/ember-domain/fire-shield-warm`, so learning the full spell some
other way can't be confused with it. `castAt` is the level it's cast at this
way (hellish rebuke "as a 2nd-level spell"), and `set` is a patch on the
spell for this way of casting it, as on a `cast` outcome
([activities.md](activities.md) "Casting"): a homebrew species' spells without
material components are `{"set": {"components": {"material": {"$delete":
true}}}}`. A rule that changes the spell however you cast it is a `change`
effect instead, with `variant` when it's optional: a homebrew feature's "you
can cast it without concentration". `spell-list` only
widens what you can pick from, so it has no `how`; its tables are by spell
level, which needs no gate.

**A speed or a sense an effect gives is a starting value.** `speed` and
`sense` effects are read as a `$base` on `speeds.<mode>.speed` and
`senses.<sense>.range`: where several give the same one, the best applies,
and other changes work on it. **A choice among sets of effects**
(`{choose: {key, from: [{name, of: [effects]}]}}` in an `effects` list)
applies the sets picked, by name: the Cleric's Divine Order.

**A character is in its own aura.** A `zone` anchored on `self` whose
`affects` has `includeSelf` gives its effects to the character too, with the
character as their `source`: the Paladin's Aura of Protection adds to its
own saving throws. **A `damage-bonus` joins the attack.** Where its `when`
fits an attack's damage roll, the attack lists it after its own damage:
Radiant Strikes' 1d8 Radiant on a melee weapon's attack.

**A creature's fields.** A `change` without `of` edits the creature the
effect applies to, by the same paths a read takes
([roles-and-values.md](roles-and-values.md)): `abilities` (by ability id),
`abilityMaximums` (the most each can be raised to), `ac`, `speeds` (by
movement mode, each `{speed}`), `hp.max`, `passives` (by skill),
`movementCosts` (by mode: feet spent per foot moved; crawling, difficult
terrain, and squeezing each add 1 to all modes, climbing without a climb
speed adds 1 to climbing only), `carryingCapacity`, `jump`,
`proficiencyBonus`, `spellcasting` (by class, each `{dc, attack}`), `pools`
(by key, each `{count, die, dc}`), `attunementSlots`, `weight`, `age`,
`creatureType`, `size`, and `alignment`. Nothing lists these: a path is
checked against the stored fields of Creature and Character, and one neither
stores is a fact some rule computes. A map's every entry is `$where: true`
("all your speeds": `{speeds: {$where: true, speed: {$multiply: 0.5}}}`),
and an entry picked in play is `$at` with the choice
(`{abilities: {$at: {choose: …}, $add: 1}}`). A named value is a change of
the entity that stores it: Athlete's running start is `{of: "rule:jumping",
set: {values: {"running-start": {$replace: 5}}}}`.
`of: "event"` is the roll a `when` names (below).

`defense` lists take any id that can be defended against: damage types,
damage qualifiers (`damage-qualifier:nonmagical`), conditions and states,
source types, and specific spells or activities ("immune to this creature's
Frightful Presence for 24 hours" applies an inline state with
`immune: ["<that activity>"]`).

A creature-wide shape change, like a vampire's bat or mist form, is a state
with `change` effects. `shapeshift` is for becoming a different stat
block.

## One set of number operators

Every change to a number is written with the patch operators
([../bundles.md](../bundles.md) "Patch operations"), in the effect's `set`,
in the patch body of a `change`. A field holds one operator:

| Operator | Meaning | Example |
|---|---|---|
| `$add` | add; a negative number subtracts | `{set: {ac: {$add: 1}}}` |
| `$add: {amount, upTo}` | a capped add: not past `upTo`, and never lowering a number already above it; `upTo: "maximum"` is the ability's maximum | an ASI's `{$add: {amount: 2, upTo: 20}}` |
| `$subtract` | subtract a Value | Uncanny Dodge's intercept, "reduce the damage by 1d10 + your level" |
| `$multiply` | multiply | Slow's `{set: {speeds: {$where: true, speed: {$multiply: 0.5}}}}` |
| `$atLeast` | a floor, or a setter that only helps | Barkskin's AC 16, a Belt of Giant Strength |
| `$atMost` | a ceiling | an overloaded creature's speed 5 |
| `$replace` | sets the stat outright, a number or an id | Grappled's speed 0, Fey creature type |

A roll in progress is a change `of: "event"`, the event the `when` tests,
and its fields are ones that event carries: Bless is `{type: "change", of:
"event", set: {total: {$add: "1d4"}}, when: {event: "event:roll-made", by:
"self", match: {roll: ["roll:attack", "roll:save"]}}}`, and Rage's damage is
`{of: "event", set: {total: {$add: …}}, when: {event: "event:roll-made", by:
"self", match: {roll: "roll:damage", attack: {range: "melee", via: "weapon",
ability: "ability:str"}}}}`. `die` is each die of that roll ("treat any 1 or
2 as a 3" is `{die: {$atLeast: 3}}`), and `criticalMinimum` is the lowest
d20 roll that scores a critical hit, 20 unless changed (Improved Critical is
`{criticalMinimum: {$atMost: 19}}`; the lowest wins, and it doesn't stack).
An `intercept` on a roll in progress takes the same `set`. A speed reduced
below 0 is 0, so a reduction needs no floor.

## Changing things

A rule that changes something stored is a `change` effect, the counterpart of
a filter's `match`: `of` picks what changes with the selectors filters use,
and `set` says how, in the patch grammar of patch files
([../bundles.md](../bundles.md) "Patch operations"). The loader checks
`set`'s fields against the kind's schema.

- `of` is an id (`"spell:mage-hand"`), `this` (the entity the rule is on), or
  a `{kind, where}` filter. `activity` is a kind there: every activity of
  every entity that passes the Activity atoms, so
  `{"kind": "activity", "where": {"spell": "spell:guidance"}}` is Guidance's
  casting.
- Extra Attack raises the Attack action's attack count, and `$atLeast` is why
  two Extra Attack features don't stack:
  `{"of": {"kind": "activity", "where": {"match": {"action": "action:attack"}}},
  "set": {"outcomes": {"$where": {"runs": true}, "runs": {"$where":
  {"times": true}, "times": {"$atLeast": 2}}}}}`.
- Ritual Adept (2024), for a ritual in the spellbook: `{"time": {"$add":
  {"amount": 10, "unit": "minute"}}, "cost": {"$remove": {"resource":
  "spell-slots"}}}`, with `variant` because it adds a second way to cast the
  spell rather than changing the first.
- Telekinetic (2024): Mage Hand's `{"range": {"distance": {"$add": 30}}}`,
  and, on the spell itself, `{"components": {"verbal": {"$delete": true},
  "somatic": {"$delete": true}}}`.
- Doing without a spell's component changes the spell, as Telekinetic
  does: Improved Illusions (2024) is `{"of": {"kind": "spell", "where":
  {"match": {"school": "spell-school:illusion"}}}, "set": {"components":
  {"verbal": {"$delete": true}}}}`. Armor without its drawbacks changes
  the armor: Mithral Armor is `{"of": "this", "set": {"armor": {"strength":
  {"$delete": true}, "stealthDisadvantage": {"$delete": true}}}}`, and
  a homebrew feat that removes the Stealth disadvantage of every medium
  armor uses an `of` over medium armor.
- A draconic monk's unarmed strike as acid: `{"outcomes": {"$where":
  {"damage": true}, "damage": {"type": "damage-type:acid"}}}`.

Doing what a rule forbids anyway is different: the spell keeps its
component, and you can provide it where the rule says you can't. That is
`suppress` of the rule's effect, named by the effect's `key`. The components
rule's three `forbid`s are keyed `verbal`, `somatic`, and `material`, so War
Caster is `{"type": "suppress", "rule": ["rule:components"], "effects":
["somatic"], "when": {"any": [{"has": "group:weapon", "match": {"held": true}}, {"has": "group:shield", "match": {"held": true}}]}}`, and Beast Spells suppresses `verbal` and `somatic`
in Wild Shape. A state's effects are named the same way: Grappler's Fast
Wrestler suppresses the Grappled condition's `extra-movement` on creatures
it grapples that are its size or smaller. The checker makes sure each key
is on an effect of a rule or state named. `waive` is left for
restrictions, the "can't" that `forbid` imposes.

A change applies to its holder's view: Telekinetic changes Mage Hand for you,
not for every caster. Computed stats (AC, save DC, passive scores, carrying
capacity, a pool's die and count) are changed the same way, by path; grants
that add rather than edit are their own effects (`speed`, `sense`,
`proficiency`, `spell-access`); and a roll in progress is changed by a
change `of: "event"`, `roll-mod`
(advantage), `die-mod` (how the dice are rolled), `damage-bonus` (extra damage
of its own type), and `forced-result`. A change can only reach what's
encoded: a change to a spell's damage waits for that spell's own mechanics.

## How effects combine

The rules interact in ways the grammar has to be able to say, even when the
engine owns the arithmetic. Three things handle it:

1. **Each kind of effect has a fixed combining rule**, defined by the grammar
   rather than by the data (see the table below).
2. **One general rule: same-name effects don't stack.** The most potent one
   applies. This is "Combining Game Effects" in the books, covering two Bless
   spells, two copies of the same ring, and so on. The engine tracks each
   effect's source, so it can apply this.
3. **Every number goes through the same staged pipeline.** That includes
   ability scores, AC, speeds, HP maximum, carrying capacity, pool sizes, and
   budgets. A cap or predicate at one stage reads the result of the stage
   before it, which breaks the loops where an item "needs to know the final
   score".

| Rule | How it combines |
|---|---|
| Advantage and disadvantage | Any number of either counts as one; having both cancels |
| Resistance and vulnerability | Multiple instances of the same type count once; resistance plus vulnerability cancel |
| Proficiency | Applied at most once; doubled or halved at most once (Expertise, Jack of All Trades). A modifier to the proficiency bonus itself (Ioun Stone of Mastery) goes through the pipeline first. |
| Temporary HP | Doesn't stack; keep the higher |
| `criticalMinimum` | Doesn't stack; the lowest threshold applies (Improved and Superior Critical, Hexblade's Curse) |
| Ordinary modifiers | Go through the pipeline below |

### The numeric pipeline

| Stage | What it does | Examples |
|---|---|---|
| 1. Base | Start from the stored value or the highest `$base` | rolled score, 30 ft walking speed, a class's pool size |
| 2. Add | Uncapped additive modifiers | Longstrider +10 ft, a homebrew feat's +2 sorcery points, species ability bonuses |
| 3. Capped add | Capped additive modifiers, in ascending cap order, each only up to its own cap | ASI and feats (your maximum), Ioun Stone (20), Epic Boon (30) |
| 4. Multiply | Multipliers, applied after all adds | Haste doubles speed, Slow halves it, Powerful Build doubles carrying capacity |
| 5. Floors | "Can't be less than", and setters that only help | Barkskin AC 16, Belt of Giant Strength 21, Amulet of Health 19 |
| 6. Ceilings and sets | "Can't be more than", and overrides | Grappled speed 0, Feeblemind Intelligence 1 |

Belts and amulets are floors, because the book says they have no effect if
your score is already higher. So is any rule that sets a number to
something better without saying it adds: a homebrew feature's four attunement
slots are `$atLeast: 4`, and a later feature's five are `$atLeast: 5`, so
the higher applies. `$replace` is for a value that
holds whatever else applies, such as a Grappled creature's speed of 0. The ordering in stage 3 isn't printed in the
books. It's the ruling under which Strength 18 with a +2 item and a "+1,
maximum 20" item comes out at 20.

**Ability scores have no general cap.** Each increase carries its own, as
`$add: {amount, upTo}`:

- `upTo: 20` or `upTo: 30` for a printed number (Ioun Stones, Epic Boons).
- `upTo: "maximum"` for features capped at **your maximum for that score**,
  which defaults to 20. The ASI feature and capped feats use this ("can't
  increase an ability score above 20 using this feature").
- A change of `abilityMaximums` raises that maximum. The Tome of
  Clear Thought ("increases by 2, as does your maximum for that score") is
  `$add: 2`; Body and Mind ("your maximum for those scores is now 25") is
  `$atLeast: 25`.

The ASI's "20" means "your maximum", so a Tome lets a later ASI reach 22.

### Pools and budgets are stats too

Any pool can be changed. Every `resource` pool has an identity key, and its
facets (`count`, `die`, `dc`) are fields under `pools`:

- Two more sorcery points: `{type: "change", set: {pools: {"sorcery-points": {count:
  {$add: 2}}}}}`.
- A new die size: `{type: "change", set: {pools: {"bardic-inspiration": {die:
  {$replace: "d8"}}}}}`.
- A homebrew feat's "if you already have Bardic Inspiration, you gain one more use".
  The pool merges by key, so this is an add on an existing pool, or the
  pool's creation if there isn't one.
- The action economy pools work the same way: a feature that grants a second
  reaction each round adds 1 to the `reaction` pool's count.
- "If you already have this proficiency" is a `when` on the entity's own
  effect, and it asks how the field stands without that entity. A homebrew
  Steady Mind gives Wisdom saves `when: {not: {proficient: "ability:wis"}}` and a
  choice of another save `when: {proficient: "ability:wis"}`; the engine
  reads the proficiency for those tests with Steady Mind's own changes left
  out, so the feature doesn't count what it gives itself.

### A starting value, and armor class

`$base` gives a number its starting value: `{"ac": {"$base": {"sum": [10,
"modifiers.ability:dex", "modifiers.ability:con"]}}}` is Unarmored Defense.
It is stage 1 of the pipeline. Where several apply, or the field is stored
too (a stat block's printed AC, a species' speed), the highest is the start,
and every add, multiplier, floor, and ceiling then works on it. So nothing
is special about armor class: worn armor, Unarmored Defense, natural armor,
Mage Armor, and Draconic Resilience are each a `$base` on `ac` with a
`when` saying when it's available (`{not: {has: "group:armor", match: {worn: true}}}`), and a
shield's +2 is an ordinary `$add` that applies whichever start won.

A core rule computes a field the same way: the proficiency bonus is
`{"proficiencyBonus": {"$base": {"byLevel": …}}}`, so a stat block's printed
bonus stands and an Ioun Stone's +1 adds to either. A modifier whose `when`
depends on which start won ("while wearing armor") says so in its `when`.

### Proficiency is a number

`proficiencies` holds, by what a creature is proficient in (a skill, an
ability's saving throws, a tool, a weapon group, a language), how many
times its proficiency bonus counts: 0.5, 1, or 2 for expertise. A
`proficiency` effect raises that number to at least its level's, so the
highest applies and nothing stacks. The saving throw and ability check
rules then need no case for expertise or Jack of All Trades: a check adds
`{times: {max: ["proficiencies.{skill}", "proficiencies.group:ability-checks"]},
by: "proficiencyBonus"}`, rounded down.

### What a roll adds

A roll's bonus isn't a field. It is whatever the loaded rules add to that
roll's `total`: the saving throws rule adds `"modifiers.{ability}"` to any
`roll:save`, a Cloak of Protection adds 1, Bless adds 1d4. A segment in
braces reads a field of the roll being tested (its `ability`, its
`skill`, or a field inside one, as `{attack.item}` is the weapon the
attack is made with), as it reads a pick elsewhere. The engine works out a sheet's
save and skill bonuses by asking what a roll with those fields would add
(`roll({roll: "roll:save", ability: "ability:wis"})`), so a homebrew rule
that changes saving throws shows up on the sheet with nothing else said.
What applies only under a condition of play is listed beside the number.

### Every entity of a kind

`$at` takes a filter as well as a key or a pick: `{"modifiers": {"$at":
{"kind": "ability"}, "$base": {"divide": {"sum": ["abilities.{at}", -10]},
"by": 2, "round": "down"}}}` gives every loaded ability its modifier, and
`{at}` is the key it is at. An ability a homebrew bundle or an optional
rule adds gets its modifier with nothing more written.

### Speeds are values

A speed is a `Value`, so it can be computed from anything:

```jsonc
// Homebrew: Boots and Ladders (immovable rods you work with your mind)
{ "type": "speed", "mode": "movement-mode:fly",
  "speed": { "max": [ 0, { "times": "modifiers.ability:int", "by": 5 } ] },
  "when": { "has": "this", "match": {"worn": true} } }
// Fly speed "equal to your walking speed"
{ "type": "speed", "mode": "movement-mode:fly", "speed": "speeds.movement-mode:walk.speed" }
```
