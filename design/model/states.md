# States

## The state shape

```ts
interface State extends Entity {        // also the shape of Condition
  isA?: StateRef;                       // state:disease/sewer-plague isA state:disease
  sourceName?: string;                  // what the text calls the source: "the charmer", "the grappler"
  effects?: Effect[];                   // what's true while it's active
  activities?: Activity[];              // wild-shape attacks, a Charm's uses
  when?: Predicate;                     // effects apply only while this holds
  implies?: StateRef[];                 // paralyzed implies incapacitated
  duration?: Duration;                  // default when the applier doesn't say
  ends?: Trigger[];                     // "ends early if you're knocked unconscious"
  concentration?: true;                 // ending concentration ends it
  stacks?: "no" | "levels" | "separate";  // exhaustion stacks levels; separate: several at once
  maxLevel?: number;                    // exhaustion's 6
  persists?: true;                      // specific beats general: rules that end states in general
                                        // (a long rest restoring reductions) skip it; only its own ends do
}
```

Applying a state the creature already has refreshes its duration, unless the
state `stacks`. That is the general "Combining Game Effects" rule.

A state ends in one of three ways: its `duration` runs out, one of its `ends`
triggers fires, or a repeat save succeeds. "Until the end of your next turn"
has no duration, just an `ends` trigger with `next: true`. A state that comes
and goes with a number ends on a `becomes` trigger: Bloodied ends on `{becomes:
{not: …}}` ([triggers-and-events.md](triggers-and-events.md)). An `ends`
trigger takes effect once the event it names has resolved, so the state still
applies to that event: "disadvantage on the next saving throw it makes" ends
on that save, after giving it disadvantage, and Invisibility's attack is still
made unseen.

An outcome may apply an inline state with no id, for a one-off such as a
monster's slowing ray. Inline states are not vocabulary and can't be named
elsewhere. How a state is applied and ended (`applyState`, `endState`,
`repeatSave`) is in [activities.md](activities.md) "Outcomes".

```jsonc
// condition:poisoned
{ "id": "condition:poisoned", "name": "Poisoned",
  "effects": [
    { "type": "roll-mod", "mode": "disadvantage",
      "when": { "event": "event:roll-made", "by": "self", "match": { "roll": "roll:attack" } } },
    { "type": "roll-mod", "mode": "disadvantage",
      "when": { "event": "event:roll-made", "by": "self", "match": { "roll": "roll:check" } } } ] }
```

**Concentration** is one state per edition, `state:concentrating`. An
activity with `concentration: true` gives its user that state, and the
activity's effects end when it ends. Only one at a time comes from the
state's `stacks: "no"`, not from any spell. A variant allowing parallel
concentration overrides that one field to `"separate"`.

## Permanent changes

Some activities change the character for good:
- reading a Tome of Clear Thought
- a Deck of Many Things draw
- a Blessing or Charm
- contracting a disease or lycanthropy

These are **states applied permanently**. A state is never a pool candidate,
because pools choose features, feats, spells, and other content kinds, and
`state:` isn't one of them. That keeps these benefits out of every feat or
feature list without a special flag. A permanent state is stored with the
creature that has it (the character document, for a character), unlike
session states like Rage. States can carry activities as well as effects,
which covers Charms.

```jsonc
// item: Tome of Clear Thought
{ "activities": [ { "key": "study",
    "time": { "amount": 48, "unit": "hour" },
    "outcomes": [ { "applyState": { "state": "state:tome-of-clear-thought",
                                    "duration": "permanent" }, "to": "self" } ] } ] }

// state:tome-of-clear-thought
{ "effects": [ { "type": "change", "set": { "abilities": { "ability:int": { "$add": 2 } } } },
               { "type": "change", "set": { "abilityMaximums": { "ability:int": { "$add": 2 } } } } ] }
```

**Players never see the word "state".** In play, active states appear as
**Active** effects, such as Raging, Hasted, or Poisoned. On the sheet,
permanent ones appear under **Lasting effects**, grouped by the printed name
of their `isA` parent: Blessings, Charms, Curses, Diseases, Madness. A state
with no parent is listed under its source, for example "From the Tome of Clear
Thought". The schema only has to provide those parent names.

**Each family is identifiable through `isA`.** Charms, curses, blessings,
diseases, and madness each have a parent state, and every member names it:

- `state:charm/many-tongues` has `isA: "state:charm"`, and
  `state:curse/lycanthropy/werewolf` has `isA: "state:curse"`.
- `state:disease/sewer-plague` has `isA: "state:disease"`, and
  `state:madness/short-term/...` works the same way.

Other rules find the family through the parent, because a state reference
matches everything that isA it:

- Remove Curse is `endState {state: "state:curse"}`.
- "Advantage on saves against being cursed" tests `match: {roll:
  "roll:save", against: {state: "state:curse"}}`.
- "While you have a charm" is `{has: "state:charm"}`.
- "Advantage on saves against disease" tests `against: {sourceType:
  "source-type:disease"}`.

A cursed item works the same way. Attuning to the Berserker Axe applies
`state:curse/berserker-axe` (isA `state:curse`), which forbids ending the
attunement, so Remove Curse ends it like any other curse.

Only `state:curse` and a few curses are encoded so far; the other families
(charms, diseases, madness, the Tome's state) wait on their content.

2024 Epic Boons are printed as feats, so they stay feats.
