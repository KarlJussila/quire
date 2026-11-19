# The core mechanics model

How the bundles say what rules do. The schema in
`packages/schema/src` (`core.ts` for the grammar, `kinds.ts` for the content
kinds) implements this; these files explain it. When the two disagree, the
schema is right and the doc needs fixing.

| File | Contents |
|---|---|
| [vocabulary.md](vocabulary.md) | Closed grammar and open vocabulary, the vocabulary kinds, groups, and editions in references |
| [roles-and-values.md](roles-and-values.md) | Roles (`self`, `target`, `source`, …), the who, every Value form, and paths: what a rule can read |
| [predicates.md](predicates.md) | `when`: the atoms, filters with `match`, event tests, history, and source types |
| [effects.md](effects.md) | The effect types, number operators, `change`, and how effects combine (the numeric pipeline, AC, pools) |
| [states.md](states.md) | States and conditions, and permanent changes (charms, curses, diseases) |
| [activities.md](activities.md) | Activities, steps and deliveries, outcomes, Multiattack, summons, casting, stored things, and zones |
| [costs-and-economy.md](costs-and-economy.md) | Costs, uses and recovery, durations, and the action economy as pools (Hit Dice, spell slots, movement) |
| [triggers-and-events.md](triggers-and-events.md) | Triggers, `becomes`, the events and their fields, and where events come from (`emits`) |
| [choices.md](choices.md) | The one `choose` construct, `record`, replacing picks, and values a pick carries |
| [character.md](character.md) | The saved character, and what the rules work out from it |
| [content-kinds.md](content-kinds.md) | What each kind adds around the grammar: creatures, items, vehicles, standing, rules, deities, classes and species |
| [examples.md](examples.md) | Worked examples, and a table of hard cases with the construct for each |

## What every field and part takes

Some forms belong to the grammar as a whole, so no field or part declares
them; the schema document adds them everywhere when it is built
(`packages/schema/src/global.ts`):

- **Any field** takes a choice (`{choose}`) or a read of a pick
  (`{chosen}`): [choices.md](choices.md). It also takes prose,
  `{prose: {text, gap?}}`, for what the grammar can't say yet: a test, an
  outcome, an amount. `gap` names what's missing (`{category, name}`, as in
  an entity's `gaps`), so a later batch can find every place it stands. An
  entity's own `gaps` list is for rules in its text with no place in its
  data at all.
- **Any id** takes a group, a filter `{kind, where}`, `"this"`, or
  `"candidate"`, and in a test a list: [predicates.md](predicates.md) "Ids,
  groups, and filters".
- **Any number in a rule** can be worked out in play with a Value
  ([roles-and-values.md](roles-and-values.md)): a reader such as `{level}`
  or arithmetic on one, as well as a plain number. A plain number still
  meets the field's own limits. Stored data, like a stat block's AC or a
  spell's level, stays a plain number.
- **Any list item**, the parts a rule is made of (an effect, an outcome, an
  activity, a cost, a recovery, a granted feature), takes `when`, which
  leaves the item out unless its test passes, and `key`, a name other rules
  point at it by: `{chosen: key}` reads a choice, `{result: key}` an
  outcome, and same-key effects don't stack. Tests and numbers aren't
  parts: a list of tests is `all` or `any`, a list of numbers a `sum`.
  `when` sits on the item rather than on any object inside it, so there is
  one place to write it.

## Notation and ids

Notation is TypeScript-style: `{ a: X; b?: Y }` is an object whose `b` field is
optional, `X[]` is a list, and `"p" | "q"` is a **closed list**, meaning the
schema accepts only those exact strings.

Identifiers are flat: a kind prefix, then a key (`ability:con`,
`damage-type:fire`, `condition:poisoned`). A `/` inside the key namespaces it
under a parent, as in `feature:barbarian/rage` or
`state:disease/sewer-plague`. It is still one flat id. Editions are in
[vocabulary.md](vocabulary.md) "Editions in references".

## The four layers

1. **Effects:** passive rule statements, such as "resistance to fire", "+2
   damage", or "advantage on Strength saves". Each may carry a `when` gate.
2. **States:** named statuses that switch effects on. These are the official
   conditions, plus raging, Mage Armor, wild-shaped, concentrating, hasted, and
   so on.
3. **Activities:** things a creature does, with costs (the action economy is
   pools), timing, targeting, delivery, and outcomes.
4. **Triggers:** "when X happens", which start reactions, riders, recurring
   effects, recovery, and state endings.

Foundry VTT's dnd5e system converged on a similar split (Activities plus
Active Effects). It's prior art, not a template.

## Standing decisions

- **States are their own kind.** `state:` sits beside `condition:` with the
  same shape. Conditions are applied with the same outcome as any state.
- **Situational rules are typed,** not left as notes on the sheet.
- **One activity shape.** Spells, features, items, and monster actions share
  it, monster action economy included.
- **Data can be richer than the engine.** Rules the engine won't run yet,
  such as Rage ending if you didn't attack this turn, are still expressed in
  data. The engine and app ignore them until they support them.
- **As few closed lists as possible** ([vocabulary.md](vocabulary.md)).
- **Capped bonuses apply after uncapped ones, in ascending order of cap.** The
  same staged pipeline covers every number, not just ability scores
  ([effects.md](effects.md) "The numeric pipeline").
- **Ability scores have no general cap.** Caps belong to the feature that
  grants the increase. Characters do have a per-ability *maximum*, default 20,
  that capped features like the ASI respect, and the Tome raises it. A Tome
  read at 20 lets a later ASI reach 22.
- **A shield blocks Unarmored Defense.** The shield's presence makes that AC
  formula unavailable; the formula doesn't just lose the shield's bonus.
- **Permanent benefits and afflictions are permanent states.** Charms,
  curses, blessings, diseases, and madness are each a family under a parent
  state (`state:curse/…` isA `state:curse`), so other rules can find them.
- **Area shapes use the 2024 names** in both editions (`emanation` for "each
  creature within 10 feet of you"). Each edition's wording stays in its text.
- **"Against poison/magic/disease" tests the source of the effect** (a
  `source-type:` declared on activities), not its outcome.
- **Consequences the engine can derive from existing data are engine
  behaviour,** not schema: a pick that stops qualifying, harmful and
  damaging activities, willingness.

## What stays prose

DM adjudication, narrative effects, and one-off procedures stay as text plus a
gap marker, through the `prose` outcome or the entity's text. Examples: Speak
with Animals' conversation, Wish's open-ended options, "the DM decides". The
bar is "could a rules engine apply this mechanically?", not "does it change
the sheet?".
