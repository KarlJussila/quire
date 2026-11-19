# Costs and the action economy

## Costs, uses, and recovery

```ts
type Cost =
  | { resource: string | PoolFilter; amount?: Value }  // a pool or a group, 1 by default: action, reaction,
                                          // movement, ki, charges, spell-slots; or a filter over pools
  | { hp: Value }
  | { currency: Value; unit: CurrencyRef }
  | { forgo: "attack" | "advantage" }     // "forgo one of your attacks"; "forgo any Advantage" on the roll being made (Brutal Strike)

type Uses = { max: Value; recover: Recovery[]; start?: Value;   // "begins with 1d4 levels"
              held?: true }   // a budget that returns when the use ends: ten tentacles, one grapple each
type Recovery = ({ on: Trigger } | { after: TimeSpan })   // after: a set time after a use spends the pool
               & { amount: "all" | Value; roll?: { die: number; min: number } }
```

A `resource` with `rolled` (a die) is a pool of numbers: each unit is rolled
when it's regained and keeps its number until spent, and `{pool, facet:
"spent"}` reads the total on the units an activity's cost spent. A homebrew
Omen feature that rolls two d20s at each long rest is
`{type: "resource", key: "foretelling-rolls", max: 2, rolled: "d20",
recover: [a long rest, all]}`, and its activity costs `{resource:
"foretelling-rolls"}`, has its own once-per-turn `uses`, and does
`{intercept: {set: {$replace: {pool: "foretelling-rolls", facet: "spent"}}}}`.

`uses` declares a pool named after the activity's key, so another activity's
`cost` can name it too. A `spell-access` with `uses` declares a pool named
after each spell it gives (`misty-step`), and two sources of the same free
spell add their uses. A `resource` effect declares a pool shared across
activities, such as ki or a wand's charges. The two share one set of names:
an activity that spends a `resource` names it in `cost` and has no `uses`
of its own, unless it has a second limit ("no more than once per turn"),
and then the resource takes another key. Each printed limit folds into
`uses`:

| Printed limit | `uses` |
|---|---|
| "3/Day" | `{max: 3, recover: [{on: {event: event:dawn}, amount: "all"}]}` |
| "1/Long Rest" | `{max: 1, recover: [{on: {event: event:rest-finished, subject: "self", match: {rest: rest:long}}, amount: "all"}]}` |
| "Recharge 5–6" | `{max: 1, recover: [{on: {event: event:turn-start, subject: "self"}, amount: "all", roll: {die: 6, min: 5}}]}` |
| "once per turn" | `{max: 1, recover: [{on: {event: event:turn-start, subject: {pool: "any"}}, amount: "all"}]}` (any creature's turn) |
| "can't be used again until 3 days have passed" | `{max: 1, recover: [{after: {amount: 3, unit: "day"}, amount: "all"}]}`; "regains its magic in a century" is `after: {amount: 100, unit: "year"}` |
| "once per round" | not yet an event of its own; the round starts at the top of initiative |

## Durations

```ts
type Duration =
  | "instant" | "permanent" | "until-dispelled"
  | { amount: Value; unit: TimeUnit; upTo?: true }
```

Event-based endings are `ends` triggers, on the state or on the `applyState`
outcome, never a Duration.

## Action economy is pools

Actions, bonus actions, reactions, and movement are pools, like ki or a wand's
charges. An activity's `cost` names the pools it spends. The core rule
`rule:action-economy` gives every creature these, each refilling at the start
of the creature's own turn:

| Pool | Size | Notes |
|---|---|---|
| `action` | 1 | |
| `bonus-action` | 1 | |
| `reaction` | 1 | |
| `object-interaction` | 1 | drawing or stowing a weapon, opening a door; a further one costs an action |
| `movement` | the speed in use (`{speed: "in-use"}`) | counts up; see below |
| `legendary` | the stat block's `legendary.actions` | spent one activity at a time, only at the end of another creature's turn; "Costs 2 Actions" spends 2 |

Because they're ordinary pools, rules that bend the economy are ordinary
pool rules:
- Action Surge is a `pool` outcome adding 1 to `action`.
- Quickened Spell is a `change` to the spell's casting: `{"cost": {"$where":
  {"resource": "action"}, "resource": "bonus-action"}}`.
- Dash adds your speed to `movement`.
- Commander's Strike grants an attack the target can choose to make by
  spending its `reaction`.

Mythic actions spend `legendary`, with a `when` on the mythic state. Lair
actions aren't a pool. They're activities triggered at initiative count 20,
losing ties.

Some things take no part in the economy:
- A rider has a `trigger` and no economy cost, whether or not there's a choice
  to make. An example is Divine Smite in 2014.
- A death burst has no economy cost either.
- A free action, like speaking a few words, costs nothing.

**Named actions** are separate from cost. "As a Magic action" means the
activity *is* the Magic action, which other rules refer to: "when you take the
Attack action", Haste's extra action (only one weapon attack, Dash, Disengage,
Hide, or Utilize). An activity says so with `action: "action:magic"`, and also
lists the `action` pool in its cost. Casting a spell with a casting time of
an action is `action:magic` in 2024 and `action:cast-a-spell` in 2014.

**A long casting spends its spell slot when it finishes.** Both SRDs say so:
if concentration breaks partway, the spell fails and no slot is expended. The
books don't say when other costs of a long casting are paid, such as consumed
materials; that's the DM's call.

**Concentration** is a state: [states.md](states.md).

**Rituals** are a variant of an activity: a `change` with `variant:
"ritual"` adds a second way to use a matching spell, 10 minutes longer
(`"time": {"$add": {"amount": 10, "unit": "minute"}}`) and without its
spell slot (`"cost": {"$remove": {"resource": "spell-slots"}}`; a spell's slot is
part of its cost even where the data leaves it implicit). In 2024 the Ritual rule
gives that variant for any prepared spell with the Ritual tag. In 2014 a
feature must grant it, so the variant sits on those features: a cleric's or
wizard's Ritual Casting.

**Hit Dice come from class data.** Each class's levels give Hit Dice of that
class's `hitDie` size, and each size is its own pool (`hit-dice-d10`,
`hit-dice-d6`), shared by classes with that size: a fighter 3 / wizard 2 has
3d10 and 2d6. The pools belong to the group `hit-dice`. A `resource` effect
can join a group the same way, with `group`. A group key stands wherever a
pool key goes. Spending from it spends from one of its pools, the owner's
choice, so a character with no d10s left can only spend a d6. Regaining
across it regains in any of them. The cost `{resource: "hit-dice"}` spends
one Hit Die, `{pool: "hit-dice", facet: "spent"}` is the total rolled on
the dice the cost spent (an item can spend up to its wielder's proficiency bonus), and `{pool: {resource: "hit-dice", add}}` regains that many across sizes.
A `pool` outcome with `spend` spends more mid-activity, and its `{result}` is
the total rolled: a homebrew blade spends one Hit Die as its cost and adds
it to the attack roll, then on a hit spends `{choose: …, from: [{atLeast: 1}]}`
more and adds `{result}` to the damage. The
books don't say how a multiclass character splits regained dice. They come
back largest first, with no choice offered.

**Spell slots are pools.** A caster class's `caster.slots` table gives the
pools `spell-slot-1` to `spell-slot-9` (with several caster classes, the
multiclass table at the combined caster level), each in the group
`spell-slots` with its level in `values`: `{"level": 3}`. Pact Magic is one
more pool in the group, declared on the Pact Magic feature, whose level
comes from its table:

```jsonc
{ "type": "resource", "key": "pact-magic", "group": "spell-slots",
  "max": { "table": "table:pact-magic@2024", "column": "slots" },
  "values": { "level": { "table": "table:pact-magic@2024", "column": "slot-level" } },
  "recover": [ { "on": { "event": "event:rest-finished", "match": { "rest": "rest:short" }, "subject": "self" }, "amount": "all" } ] }
```

A cost names the group to spend any slot: `{resource: "spell-slots"}`. Since
the group holds both kinds, a Warlock slot can pay for a Wizard spell and the
other way round, which is the multiclassing rule. A narrower cost is a
filter over pools, whose `match` reads the `resource` effect's fields:
"a spell slot of level 2 or higher" (Moonlight Step) is `{resource: {kind:
"pool", where: {match: {group: "spell-slots", values: {level: {atLeast:
2}}}}}}`, "a level 5 spell slot" (Holy Nimbus) matches `level: 5`, and "a
Warlock spell slot" (Minions of Chaos) is `{resource: "pact-magic"}`.

**Upcasting and cantrips live in spell data.** A spell's slot cost is a
slot of at least the spell's level, by the casting rule, and its numbers read
`{slotLevel: true}`; casting with a higher slot is just paying more. A cantrip is level 0 with no
slot cost, and its scaling reads `"levels.total"`.

**Long times** aren't economy either. An activity that takes a minute or
longer has `time`. The Longer Casting Times rule says what that costs: an
action (in 2024, the Magic action) on each turn of the casting, and
concentration throughout.

**Movement counts up.** The pool tracks feet moved this turn. Each speed is
its own cap on that one total, so a mode is usable while the total is below
its speed. This is the Special Speeds rule in both editions ("subtract the
distance already moved from the new speed"). With walk 30, fly 60, and burrow
90: walk 30 feet, and 30 feet of flying is left. Fly 15 and burrow 15, and
flying is used up while 30 feet of burrowing remain. A cost in movement adds
to the total. Dash's extra movement takes from it, and the total can go below
zero. So a creature can Dash before it moves at all: Dash at walk 30, fly 60,
and the total is -30, so it can walk 60 or fly 90.

A cost's amount says which speed it is measured against. "Half your speed",
for standing up from prone, is half the walking speed in both editions:
- In 2024 that's the rule as written; the 2024 rules call walking speed just
  "Speed".
- 2014 doesn't say which speed. A Sage Advice answer quoted on forums reads it
  as half the highest speed, but walking speed is the simpler ruling.
- A creature with a walking speed of 0 can't stand up, in either edition.
  Open edge case: a creature that can fly but not walk and can still be
  knocked prone. None is known yet; most such creatures are incorporeal.

**Haste's extra action** is an activity on the hasted state: once per turn,
with a `choose` of `runs` among one weapon attack, Dash, Disengage, Hide, and
Use an Object (Utilize in 2024). Nothing pays for it but its own `uses`.
