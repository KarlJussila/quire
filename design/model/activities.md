# Activities

## The activity shape

An activity is a **header** (what it costs, and when it can be used) plus a
**step**. A step is the part that resolves against targets: range, targets
or area, a delivery, and outcomes split by result. Outcomes can contain
another step, which covers "on a hit, the target must also make a save", the
Wand of Wonder's rows that each have their own area, and triggered rules that
force a save. A nested step with no targets or area of its own acts on the
enclosing step's: the creature hit, or each creature in the area.

```ts
interface Activity extends Step {
  key: string;                          // stable within its owner
  name?: string;                        // defaults to the owner's name
  action?: ActionRef;                   // the named action it is: action:magic, action:attack
  standalone?: false;                   // only run by another activity: a weapon attack or grapple, run by the Attack action
  time?: { amount: Value; unit: TimeUnit };  // a minute or longer: 1-minute casts, rituals, 8-hour studies
  trigger?: Trigger;                    // reactions and "when you hit" riders
  when?: Predicate;                     // "while holding the wand"
  cost?: (Cost | { oneOf: Cost[][] })[];  // pools it spends; oneOf for "a use or a spell slot"
  effects?: Effect[];                   // hold while it resolves: a crit range for this attack only
  uses?: Uses;
  sourceTypes?: SourceTypeRef[];
  duration?: Duration; concentration?: true; ritual?: true;
  emits?: Emit[];                       // events this activity fires (triggers-and-events.md)
}

interface Step {
  range?: { self: true } | { touch: true } | { sight: true } | { unlimited: true }
        | { distance: Value; long?: Value; unit?: "feet" | "miles" };
  origin?: Who;                          // where the range is measured from, if not the one acting: a familiar delivering a touch spell
  target?: { who?: Who; count?: Value | { atLeast?: Value; atMost?: Value } | "all";
             select?: "chosen" | "nearest" | "random"; distinct?: boolean;
             also?: { who: Who; count?: Value } };  // more targets with their own conditions:
                                                  // "a second creature within 10 feet of the first target"
  area?: { shape: AreaShapeRef; size: Value; width?: Value; height?: Value;
           origin?: "self" | "point" | "target"; affects?: Who };
  delivery?: Delivery;
  outcomes?: Outcome[];                 // when it goes the user's way: a hit, the target's failed save or check,
                                        // your own successful save or check (`by: "self"`), or no delivery
  otherwise?: Outcome[] | "half";       // the other result
}

type Delivery =
  | { attack: { range: "melee" | "ranged" | "melee-or-ranged"; via?: "weapon" | "spell" | "unarmed";
                ability?: AbilityRef; bonus?: Value; reach?: number;
                item?: ItemRef } }  // "this" weapon, or any item of a group: an improvised weapon
  | { save: { ability?: AbilityRef | AbilityRef[]; kind?: RollRef;  // kind: a save with no ability, roll:death-save
              dc: Value; unwillingOnly?: true; by?: "self" } }
  | { check: { ability?: AbilityRef; skill?: SkillRef | SkillRef[]; choose?: { key; name; from: CheckSpec[] };  // the roller picks one
               dc: Value; by?: "self" } }
  | { contest: { self: CheckSpec | Choose<CheckSpec>; target: CheckSpec | Choose<CheckSpec> } }  // 2014 grapple and shove; its rolls are roll:contest
// A CheckSpec is { ability, skill? }. Where the roller picks a check ("a Strength
// (Athletics) or Dexterity (Acrobatics) check"), it is a `choose` over CheckSpecs,
// as is an escape's `check`. The pair is free: "Charisma (Religion)" adds
// the Charisma modifier and, if proficient in Religion, the proficiency bonus.
// That's Skills with Different Abilities (a 2014 variant, a 2024 rule); the DM
// can call for any pairing, and nothing in the schema ties a skill to its usual ability.
```

**What an attack adds to its roll is rules, not a field of the attack.** An
attack names its `ability`, and the loaded rules add the rest:
`rule:attack-rolls` and `rule:damage-and-healing` add that ability's
modifier to the attack roll and the damage roll, `rule:weapon-proficiency`
adds the proficiency bonus when the attacker is proficient with the item
(`{proficient: "this"}`), and a `+1` weapon, Archery, or Rage adds its own
part the same way, each as a `change` of the roll event. An
`ability-substitute` lets another ability stand in, and the attacker uses
the best one. A `bonus` on the attack is for an attack whose total is
printed outright, as a stat block's is, and then nothing else is added.

**A weapon has one attack, which a rule for items gives it.** No weapon
carries an activity. `rule:weapon-attack` applies to every weapon and gives
its carrier one attack with it (`item: "this"`): a melee attack that uses
Strength and deals the weapon's own damage (`"this.weapon.damage.amount"`,
type `{of: "weapon"}`). What kind of weapon it is and the properties it has
don't add attacks; each is a rule that changes that one. `rule:ranged-weapon`
makes it a ranged attack that uses Dexterity, `rule:thrown-weapon` makes a
melee weapon's attack `melee-or-ranged`, `rule:finesse-weapon` is an
`ability-substitute`, and `rule:versatile-weapon` adds the two-handed
damage as a `variant`, since it is another way to make the same attack. The
Unarmed Strike is an attack of the same shape on its own rule, with
Strength; only a feature's `ability-substitute` (Martial Arts) lets another
ability stand in. A homebrew weapon property is one more such rule.

**Variants stand beside the attack and don't combine.** An activity gets
every plain change that applies, and then one more form for each change
with a `variant`: a Monk's quarterstaff has its attack, the attack with the
Martial Arts die, and the attack held in two hands.


Activities sit on spells (`spell.activities`), features, feats, items,
states, rules, and `weapon-mastery:` entities, and on a stat block's entries
(`activity`). The block-level `legendary` count is the size of the
creature's `legendary` pool.

A monster's printed to-hit and DC are stored as `bonus` and `dc`, because the
book is the source of truth. The engine can derive them too, and flag a
mismatch.

`reach` is a melee attack's reach. A ranged attack's normal and long range go
in the step's `range`.

**Success and failure both have outcomes.** `outcomes` is the result the
user wants and `otherwise` is the other one, so "on a success …; on a failure
…" fills both. A finer split gates single outcomes with the roll's result:
"if it fails by 5 or more, it falls" is an outcome in the failure side with
`when: {event: "event:roll-resolved", match: {success: false, margin: 5}}`.

**Harmful and damaging** are read from outcomes, so no activity is tagged by
hand. An activity is damaging if it has a `damage` outcome, and harmful if it
also forces a save or check, or applies a state to an unwilling target.
Charmed's `forbid` uses `restriction:target-harmful` (2014) and
`restriction:target-damaging` (2024), with `target: "source"`.

**Willingness is the affected creature's choice**, made when an effect lands.
The schema doesn't fix it per effect. The engine defaults it from the same
reading: a creature is unwilling against a harmful effect and willing
otherwise. The player or DM can override that either way, and any creature
can choose not to resist a save or contest. Zone of Truth defaults to
unwilling, but a creature can choose to fail its save. A grappled creature
being shoved free by an ally defaults to resisting, because a shove is a forced
contest, but it can choose not to, so its own contest succeeds automatically.
`willing` in a predicate reads that choice; `unwillingOnly` on a save means
only unwilling targets roll.

**A spell's casting time, range, duration, and concentration live on its
activities only.** The spell entity keeps level, school, lists, ritual, and
components. The header a reader sees is drawn from the first activity, so the
two can't disagree.

**Material components stay on the spell, not in `cost`.** They're a property
of the spell that rules act on: a focus or component pouch replaces the
unpriced ones, and innate casting can go without them. Most priced ones are
only needed, not spent. `components.material` is the printed text plus its
priced `parts`, each with a `worth` (at least this much), and optionally
`consumed`, `count`, and `per` (`target` or `hit-die`):

```jsonc
// Clone (SRD 5.2)
{ "material": { "text": "a diamond worth 1,000+ GP, which the spell consumes, and a sealable vessel worth 2,000+ GP …",
    "parts": [ { "worth": { "amount": 1000, "currency": "currency:gp" }, "consumed": true },
               { "worth": { "amount": 2000, "currency": "currency:gp" } } ] } }
```

Costs, uses, durations, and the action economy are in
[costs-and-economy.md](costs-and-economy.md).

## Outcomes

The outcome union is also closed. Every outcome, as a list item, takes `key?` (so `while` and
`{result}` Values can refer to it), `when?`, `otherwise?` (below), `to?: Who`
(default `target`), and `after?: Duration` for delays ("a new body forms in
1d10 days").

| Outcome | Fields | Examples |
|---|---|---|
| `damage` | `amount`, `type` (a type, a `{chosen}` pick, a `choose`, or `{of: "attack" \| "weapon" \| "component"}` for "the attack's type") | Fire Breath, Divine Smite |
| `heal` | `amount`, `split?` (one total divided among the targets, as `tempHp`) | Cure Wounds, Lay on Hands, Preserve Life |
| `tempHp` | `amount`, `split?` (one total shared among targets) | Heroism, Aid |
| `applyState` | `state` (id, inline, or `{chosen}`), `duration?`, `ends?`, `repeatSave?`, `escape?: {dc, check?}` (`check` a CheckSpec or a `choose` of them), `while?`, `source?` (a role to record as the source instead of the creature acting) | conditions, Rage, Hex, permanent states, mounting |
| `endState` | `state` (an id; or a `{kind: "state", where}` filter or a choice of one, which picks among the states the recipient has now: Cleansing Touch's "end one spell"), `levels?` (remove only that many levels of a stacking state), and a state filter's `lowers` test picks the states whose effects lower these stats: a long rest's `{state: {kind: "state", where: {lowers: ["hp.max", "abilities.ability:str", …]}}}` (general rules like this skip states that `persist`) | Lesser Restoration, dousing a flame blade, a long rest's one exhaustion level |
| `replace` | `choice` (a choice key; `from?` the entity it's on, if not this one), or `what` and `with` (two `{kind, where}` filters: what you give up, what replaces it), `same?` (stored fields the two share: `["level"]`) | "whenever you gain a level, you can replace one invocation", a feature's "replace one spell you gained from this feature with another spell of the same level", a cursed item becoming another item (`what` is `{kind: "item", where: {is: "this"}}`) |
| `move` | `kind: "move" \| "push" \| "pull" \| "teleport" \| "throw" \| "swap" \| "plane" \| "fall"`, `distance?`, `toward?: Role \| {awayFrom: Role} \| "random" \| "up" \| "down"`, `plane?`, `where?: Predicate` (the destination), `cost?` (what the mover pays, written as an activity's `cost`: `[{resource: "reaction"}]` for Dissonant Whispers), `provokes?: false` | Thunderwave, Misty Step, Banishment, a random-direction throw |
| `drop` | `item`: `"held"` (what's in its hands) or an item, group, or filter; `count?` | Unconscious, Command's Drop, Heat Metal |
| `setHp` | a Value | suffocation dropping you to 0, 2024 knocking out leaving 1 hit point |
| `kill` | — (gate with `when`) | Power Word Kill, the Vorpal Sword, Death Ray at 0 HP |
| `revive` | `hp: Value` | Revivify, a vampire reforming in its resting place |
| `destroy` | — | Disintegrate on an object, a wand crumbling |
| `create` | `item`, or an inline `object` with its own effects and activities; `quantity?`, `duration?`, `ends?` | Goodberry, a Wall of Stone panel, the Energy Bow's arrow. A weapon a feature creates is an item of its own (a homebrew `item:spirit-blade`), so the weapon rules, its properties, and its mastery apply to it as to any weapon, and the sheet lists its attacks as a carried weapon's |
| `pool` | `key`, `add?`, `spend?`, `store?` (what the added units hold: a spell, a pick, or a choice of spells) | a ward absorbing damage, adding spells to a spellbook |
| `cast` | see "Casting" | spells from items, innate casting, Glyph of Warding |
| `summon` | see "Summons" | Find Familiar, 2024 summon spells, Figurines |
| `zone` | see "Zones and auras" | Spirit Guardians, Wall of Fire, Cloudkill |
| `random` | `dice` and `results: [{range, outcomes}]`, or `table`; `count?`, `unique?` | Wand of Wonder, a Deck of Many Things, a monster's random eye rays |
| `runs` | `[{activity, times?}]`, where `activity` is a key, an entity's id, or an activity filter ("three melee attacks"); a run activity pays none of its own costs | Multiattack; the Attack action, whose `times` Extra Attack raises with a `change` |
| `choose` | a choice among outcomes, or named groups of them; `by?: Role` (who chooses) | Shoving's prone or push, Multiattack alternatives |
| `intercept` | on the triggering event: `set?` (one number operator on the roll's total or the damage: `{$add: "1d6"}`, `{$subtract: …}`, `{$replace: 20}`), `reroll?`, `success?` (the roll becomes a success or a failure), `crit?: false` (a critical hit becomes a normal hit), `mode?`, `cancel?`, `redirect?: Who` | Shield, Cutting Words, Legendary Resistance, Uncanny Dodge, Counterspell, reflecting a spell, Peerless Aim |
| `grant` | `activity` (a key, an entity's id, or an activity filter for "one weapon attack"), or `movement: Value`; `cost?` (what the recipient pays if it chooses to act, written as an activity's `cost`: `[{resource: "reaction"}]`), `provokes?: false` | Commander's Strike (the target can choose to use its reaction to attack), a dragon's flight after Wing Attack |
| `then` | a `Step` | a hit that also forces a save; a table row with its own area |
| `prose` | `text`, `gap` | DM adjudication that can't be typed |

`intercept` acts on the event that triggered the activity: a roll, a hit, a
spell being cast, damage being taken. This is how reactions and riders change
something already under way.

**Else.** Any outcome with a `when` can have an `otherwise`, the outcomes
that run instead when the test is false, so "if X, A; otherwise B" doesn't
repeat the test. Death Saving Throws' natural 20:
`{heal: {amount: 1}, to: "self", when: {event: "event:roll-resolved", match:
{natural: 20}}, otherwise: [{pool: {resource: "death-save-successes", add: 1},
to: "self"}]}`. A number that depends on a test is a Value instead,
`{if, then, else}` ([roles-and-values.md](roles-and-values.md)).

There are three ways to pick among alternatives, and they don't overlap:
`choose` (someone picks), `random` (dice pick), and `cost.oneOf` (alternative
ways to pay). Multiattack alternatives are a `choose` among named groups of
`runs`.

```ts
interface RepeatSave {
  on?: Trigger;                         // default: the end of each of the target's turns
  ability?: AbilityRef; dc?: Value;     // default: the original save
  mode?: "advantage" | "disadvantage";
  onFailure?: Outcome[];                // a petrifying gaze
  tally?: { successes: { count: number; outcomes?: Outcome[] };   // Flesh to Stone:
            failures:  { count: number; outcomes: Outcome[] } };  // 3 successes end it, 3 failures petrify
}
```

## Multiattack

Multiattack is one activity whose outcome runs other activities, with a
`choose` where the block offers alternatives:

```jsonc
// Werewolf (SRD 5.1): "two attacks: two with its spear (humanoid form) or
// one with its bite and one with its claws (hybrid form)"
{ "key": "multiattack",
  "cost": [ { "resource": "action" } ],
  "when": { "not": { "has": "state:werewolf/wolf-form" } },
  "outcomes": [ { "choose": { "key": "attacks", "name": "Multiattack", "from": [
      { "name": "Two spear attacks", "of": [ { "runs": [ { "activity": "spear", "times": 2 } ] } ] },
      { "name": "Bite and claws", "of": [ { "runs": [ { "activity": "bite" }, { "activity": "claws" } ] } ] } ] } } ] }
```

## Summons

```ts
type SummonOutcome = { summon: {
  creature?: CreatureRef; from?: Pick;  // a fixed block, or a choice ("a beast of CR 1/4 or lower")
  copyOf?: Role;                        // Simulacrum, Mislead
  count?: Value | { budget: Value; weight: Value };  // Animate Objects' size weights
  set?: Patch;                          // changes to the creature's stat block, in the patch grammar, checked against Creature
  arrives?: Duration;                   // "appears at the start of your next turn"
  duration?: Duration;
  controller?: "self" | "none" | "enemy";
  initiative?: "shared" | "own" | "after-self";
  unlessCommanded?: string;             // an activity key: "takes the Dodge action"
  state?: StateRef;                     // the relationship state it gets, with self as source
  ends?: Trigger[];                     // "disappears when it drops to 0 hit points"
} }
```

Dismissing a summon is `endState` on its relationship state.

## Casting

```ts
type CastOutcome = { cast: {
  spell?: SpellRef | Chosen;            // a fixed spell, or one picked earlier
  from?: Pick | Chosen;                 // a spell filter: {kind: "spell", where: {stored: "stored-spells"}} is a spell held in that pool
  castAt?: Value;                       // the spell level, if not chosen
  slot?: false;                         // no slot spent
  stats?: "self" | "original" | { dc?: Value; attack?: Value; ability?: AbilityRef };
  set?: Patch;                          // changes to the spell, for this casting only
} }
```

What the book changes about the spell when it's cast this way is `set`, a
patch on the spell in the grammar of `change` ([effects.md](effects.md)
"Changing things"), applied to this casting only. A spell's casting is its
`cast` activity, and its components are on the spell. The Crown of the Wrath
Bringer's fear "has a duration of 1 minute and doesn't require
concentration":
`{"set": {"activities": {"cast": {"duration": {"$replace": {"amount": 1, "unit": "minute"}}, "concentration": {"$delete": true}}}}}`.
No components is `{"components": {"$replace": {}}}`; only a verbal one is
`{"components": {"$replace": {"verbal": true}}}`. `slot`, `castAt`, and
`stats` stay named: spending a slot, the level, and the caster's numbers
aren't stored on the spell.

`stats: "original"` is for a spell stored by another caster, as in the Ring of
Spell Storing and Glyph of Warding. Storing a spell is a `cast` whose target is
the item's pool. Casting it is `from: {kind: "spell", where: {stored: key}}`.

## Pools that hold things

A `pool` outcome with `store` adds units that each hold what `store` names: a
spell id, a pick, or a choice of spells. The `stored` test finds them:
`{kind: "spell", where: {stored: "spellbook"}}` is "a spell in your
spellbook". The pool's `max` limits how much it holds, and the `add` says how
much one thing takes up, so a pool doesn't know about spell levels:
- A spellbook is a pool with no `max` on the spellbook item
  (`{"type": "resource", "key": "spellbook", "recover": []}`). It belongs
  to that copy of the book, so losing the book loses its spells and a
  backup book has its own.
- Everything a Wizard learns goes into the book the same way. The
  Spellcasting feature's `add-spells` activity, triggered by
  `event:level-gained`, adds six spells at level 1 and two a level after:
  `{"pool": {"resource": "spellbook", "add": 2, "store": {"choose": {"key":
  "new-spells", "count": 2, "from": […]}}}}`. A 2024 Savant adds its school's
  free spells from the same event, and Copy a Spell adds a found one. A
  saved character keeps what the book holds on its inventory entry
  ([character.md](character.md) "Items carry their own picks").
- The Ring of Spell Storing holds 5 levels of spells: `max: 5`, and storing
  adds the slot level the spell was cast with. An item that holds one spell
  has `max: 1` and adds 1.
- The spells a class prepares or knows are a choice in its Spellcasting
  feature: a `spell-access` whose `spells` is a `choose` with `count:
  "spellcasting.class:cleric.prepared"` and `from` the class's list up to
  `spellcasting.class:cleric.spellLevel`. The Wizard's choice is from the
  spells its book holds (`{stored: "spellbook"}`).

## Zones and auras

A zone is an area that persists and does things to whoever is in it.

```ts
interface Zone {
  area: { shape: AreaShapeRef; size: Value; width?: Value; height?: Value };
  anchor: "self" | "point" | "target" | "object";  // an aura moves with its anchor
  affects?: Who;                        // default: any creature in it
  effects?: Effect[];                   // true for creatures in it (or for the anchor's allies)
  on?: TriggeredRule[];
  terrain?: "difficult"; obscured?: "light" | "heavy"; cover?: "half" | "three-quarters" | "total";
  blocks?: ("creatures" | "objects" | "spells" | "sight")[];  // Wall of Force
  hidden?: { skill: SkillRef; dc: Value };  // a glyph found with Investigation
  duration?: Duration;
}
```

An aura is a `zone` *effect* anchored to its holder, such as Aura of
Protection. A spell's area that lingers is a `zone` *outcome*, such as Spirit
Guardians or Wall of Fire. An antimagic field is a zone whose effects include
`suppress {sourceType: source-type:magic}`.

A zone's rules fire on `event:turn-start` and `event:turn-end` with the
occupant as `subject`, and on `event:moved` for a creature that moves into
it: a 30-foot frightening aura is `{event: ["event:moved", "event:turn-start"],
subject: {pool: "enemy", where: {within: 30, of: "self"}}}`. There is no
event yet for entering or leaving an area that doesn't move with a creature.
