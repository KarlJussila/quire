# Triggers and events

## Triggers

A trigger is an event plus optional filters. The event's field is `event`;
the fields that hold a trigger keep their own names (a recovery's or a
triggered rule's `on`, an activity's `trigger`, `ends`), so "3/Day"
is `recover: [{on: {event: event:dawn}, amount: "all"}]`.

```ts
type Trigger = EventTrigger | Becomes;

interface EventTrigger {
  event: EventRef | EventRef[];         // event:roll-resolved, event:turn-start, event:dawn, …
  by?: Who;                             // the actor: "a creature you can see"; none means anyone
  subject?: Who;                        // who it happened to: whose turn, who was hit
  match?: { [field: string]: unknown }; // the event's own fields, as its vocabulary entry declares them
  next?: true;                          // the next occurrence only ("your next turn")
  every?: { amount: number; unit: TimeUnit };  // for event:time-elapsed: "each hour"
  when?: Predicate;                     // situation filter, including Activity atoms
}

interface Becomes {                     // a test turning true
  becomes: Predicate;
  subject?: Who;                        // whose test; default self
  next?: true;
  when?: Predicate;
}

interface TriggeredRule {               // a triggered effect, and each of a zone's rules
  on: Trigger | Trigger[];
  uses?: Uses;                          // "the first time on a turn" is a once-per-turn use
  step: Step;
}
```

**Who is `by` and who is `subject`.** For turn events, the subject is the
creature whose turn it is. A roll's `by` is the
creature rolling and its `subject` the creature the roll is against, so an
attack roll's `by` is the attacker and `subject` the target, and a saving
throw's `by` is the creature saving and `subject` the creature that forced
it. A trigger without `by` fires whoever acted: "when a creature within 5
feet of you is attacked" is `{event: "event:roll-made", subject: {pool:
"any", where: {within: 5, of: "self"}}, match: {roll: "roll:attack"}}`, and
"your attacks" says `by: "self"`. The same holds for the event test in a
`when`. A reaction that deals force damage "to the creature that forced the
saving throw" damages `subject`.

`event:roll-made` is the die roll while it can still change (rerolls,
bonuses, advantage), and only what changes the roll goes there.
`event:roll-resolved` is the roll once its result is fixed, and what acts on
the result goes there, a natural 20's extra damage included. So "when you hit" and "when you fail a save" match `success` on
`roll-resolved`, and "when you score a critical hit" matches `crit`. They
are two facts, not one: a critical hit is a hit, so `{success: true}`
matches it too. `rule:rolling-20-or-1` makes every critical hit a hit. A roll or event that happens while a cast or attack
resolves (its damage roll, the healing it restores, the creature it
damages) carries that cast's or attack's fields, so its `when` can test
the spell, slot, or weapon: Seeking Spell rerolls on `roll-resolved` with
`match: {roll: "roll:attack", success: false}` and `{spell: {kind:
"spell"}}`, and Disciple of Life's extra healing tests the slot of the
spell doing the healing. "Once per casting" is one use that recovers on
every cast, the way "once per turn" recovers every turn: Elemental
Affinity adds Charisma to one damage roll of the spell with `uses: {max: 1,
recover: [{on: {event: "event:activity-used", by: "self", match: {spell:
true}}, amount: "all"}]}`.

**A test turning true.** Some rules don't care what happened, only that a
number crossed a line: "if your fly speed is reduced to 0, you fall",
Bloodied's "half your hit points or fewer". `{becomes: Predicate}` fires
when its test goes from false to true for the creature in `subject`; the
engine checks it whenever a number it reads changes. Bloodied 2024 is `{on:
{becomes: {compare: "hp.current", atMost: {times: "hp.max", by:
0.5}}, subject: "self"}}`, and the state ends on `{becomes: {not: …}}`.
Watching hit points can't stand in for damage itself: rules that react to
damage need who dealt it, its type, its source, and the amount, and damage
taken by temporary hit points leaves hit points where they were.

## Event fields

Each `event:` entity declares its payload, such as a roll's kind and die,
or a use's spell and slot level. The `{event: field}` Value reads it, as in
"you take damage equal to half the damage dealt" or "a spell of 3rd level or
lower". A trigger's `match`, and the event test in a `when`, test it, read
as a filter's `match` reads a candidate's fields:

| Event | Payload | Example |
|---|---|---|
| `event:roll-made`, `event:roll-resolved` | `roll`, `ability`, `skill`, `natural`, `total`, `mode`, `success`, `crit`, `margin`, `attack`, `spell`, `slot`, `against` | `{"roll": "roll:attack", "success": true, "natural": 20, "attack": {"item": "this"}}` |
| `event:activity-used` | `activity`, `action`, `spell`, `slot`, `spent`, `attack` | `{"action": "action:attack"}`; `{"spell": {"kind": "spell", "where": …}}` |
| `event:taking-damage`, `event:damaged` | `amount`, `damageType`, `attack`, `success`, `crit` (the attack's), `spell`, `slot`, `against`, `excess` (damage left over once hit points reach 0), `remaining` (the hit points it leaves) | `{"remaining": 0}`: reduced to 0 hit points |
| `event:healed` | `amount`, `spell`, `slot` | |
| `event:pool-spent` | `pool`, `amount` | `{"pool": "spell-slots"}` |
| `event:rest-finished` | `rest` | `{"rest": "rest:long"}` |
| `event:level-gained` | `class`, `gives` | `{"class": "class:paladin"}`; `{"gives": {"picks": "maneuvers"}}` (new picks in a choice) or `{"gives": "feature:ability-score-improvement"}` |
| `event:state-applied`, `event:state-ended` | `state` | `{"state": "condition:prone"}` |
| `event:item-equipped`, `event:item-unequipped`, `event:attuned` | `item` | `{"item": "this"}`; `{"item": ["group:medium-armor", "group:shield"]}` |
| `event:fell` | `distance` | |

`taking-damage` is the damage about to be dealt, while an `intercept` can
still change the amount (Uncanny Dodge, Relentless Endurance's "drop to 1
instead"); `damaged` is the damage once dealt (Hellish Rebuke, a
Concentration save). An id matches either edition and anything that isA
it, a group matches its members, a list matches any of its entries, and
`this` is the entity the rule is on. The loader reports a `match` field the
event doesn't declare (`links.ts`), so a new event needs only its
vocabulary entry, not a schema change.

## Where events come from

The engine runs the procedures (an attack, a save, a rest), but which
events each one emits, when, and with which fields is data. Any rule, and
any activity, can list what it emits under `emits`:

```ts
interface Emit {
  event: EventRef;
  for?: { kind: "activity" | "outcome"; where?: Predicate }; // on a rule: what this covers; on an activity, leave it out
  at: "started" | "finished" | "rolled" | "resolved" | "applying" | "applied";
  by?: Who;                 // default: the creature using the activity
  subject?: Who;            // default: each target
  when?: Predicate;
  fields?: { [field: string]: Value | Id | "this" | "target" };
}
```

Because `for` is a filter, one entry on one rule covers every activity or
outcome it matches, including ones a later book adds. An attack is also an
activity, so it matches both the activity rule and the attack rule and
gets both rules' events: overlapping filters do the work of inheritance.

**The engine's part** is two short lists:

- **The moments**, in order. An activity: `started` (its costs are paid),
  `finished`. A delivery (an attack, save, check, or contest): `rolled`
  (the die has landed), `resolved` (the result is fixed). An outcome:
  `rolled` (its damage or healing dice), `applying` (about to take effect,
  while the amount can still change), `applied`.
- **The settled facts** it fills in at each moment, read with `{settled:
  name}`: `natural`, `total`, `mode`, `success`, `crit`, `margin`, `attack` (what
  the attack is made with), `spell`, `slot`, `against`, `spent`, `amount`,
  `excess`, and `remaining`. Stored fields of what an entry covers are
  read with `{stored: path}`: `{stored: "delivery.save.kind"}`.

**The base rules** in `bundles/core/entities/rules/` (shared) and the SRD bundles' (`bundles/srd`, `bundles/srd24`):

| Rule | Covers | Emits |
|---|---|---|
| `rule:using-an-activity` | every activity | `activity-used` at `started` |
| `rule:attack-rolls` | activities whose delivery is an attack | `roll-made` at `rolled`, `roll-resolved` at `resolved` |
| `rule:saving-throws` | activities whose delivery is a save, `by` the target | the same, with `roll:save` or the save's own kind |
| `rule:ability-checks` | check and contest deliveries, for whoever rolls | the same, with `roll:check` or `roll:contest` |
| `rule:damage-and-healing` | damage, heal, kill, and revive outcomes | `roll-made` for damage and healing rolls, `taking-damage` at `applying`, `damaged`, `healed`, `died`, `revived` at `applied` |
| `rule:states` | applyState and endState outcomes | `state-applied`, `state-ended` |

Rests are activities: each rest rule has a `take` activity ("Take a Long
Rest", 8 hours) that emits `rest-finished` at `finished` with its `rest`.
Short Rest's Hit Dice spending is gated on the event test `{event:
"event:rest-finished", subject: "self", match: {rest: "rest:short"}}`,
true while the rest is ending.

A later book hooks into old content by patching an `emits` entry onto an
old entity or activity, or by adding its own rule whose `for` picks the old
activities.

**What the engine still emits itself.** The clock (`turn-start`,
`turn-end`, `dawn`, `dusk`, `day-ended`, `time-elapsed`), movement and
position (`moved`, `forced-move`, `leaves-reach`, `fell`, `jump-landed`,
`seen`, `breathes`), items (`item-equipped`, `item-unequipped`,
`attuned`, `extinguished`), `level-gained`, `pool-spent`, and the rolls
outside any delivery (initiative, a check the DM calls for). Each of these
event entries says so with `"emittedBy": "engine"`. The loader reports an
event that nothing emits: no `emits` entry names it and it isn't marked
`emittedBy: "engine"`.

## Activity or triggered effect?

If the creature *may* do it ("you can use your reaction", "you can choose to
succeed instead"), or it has a cost, it's an activity with a `trigger`. If it
simply happens, it's a `triggered` effect: Troll Regeneration, a damage aura at the start of each
turn, a curse that strikes when you attune. Legendary Resistance is an
activity, because the creature chooses.
