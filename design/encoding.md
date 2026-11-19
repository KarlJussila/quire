# Encoding conventions

How a rule from a book is written in the grammar: the habits that keep
official content and homebrew consistent. The grammar itself is in
[model/](model/README.md); this file is what to reach for first when
encoding an entity, and it is the same for a book and for homebrew.

Before any of these: what the grammar can't say stays text. The rule goes
in the entity's `text`, and a `gaps` entry (or `{prose: {text, gap}}` where
one part is missing) names what isn't typed. A half-right encoding is worse
than a gap.

- **Changes are `change`** (`design/model/effects.md`, "Changing things"): a
  rule that edits something picks it with `of` and patches it in `set`.
  Without `of` it edits the creature, by path: `{set: {ac: {$add: 1}}}`,
  `{set: {speeds: {$where: true, speed: {$add: 10}}}}`; `of: "event"` edits
  the roll in progress (`total`, `die`, `criticalMinimum`). Don't invent a
  field or effect for "X changes Y".
- **References name no edition** (`design/bundles.md`, "References and
  editions"): `spell:bless`, not `spell:bless@2024`, even in a 2024 entity.
  Pin only when the rule depends on one version (Rage applies
  `state:raging@2024`).
- **A new feature's key sits under the one entity that offers it**
  (`design/bundles.md`, "Ids and editions"): an invocation is
  `feature:warlock/<key>`, a maneuver `feature:fighter/battle-master/<key>`,
  a species trait `feature:<species>/<key>`. Only a feature several entities
  offer stays at the top. When a batch gives a top-level feature its owner,
  move it there and update every reference.
- **Cut-down spells:** a spell a feature grants in a cut-down form is its
  own spell entity, on no class list, with the original's text minus the
  removed option and `wording: "original"`
  (a homebrew domain's `spell:cleric/ember-domain/fire-shield-warm`). Narrowing the base spell's
  choice would break a player who also learns the full spell elsewhere.
- **A choice that changes a list** stands where the book makes it, each
  candidate carrying its effects (the Genie's patron kind in its Expanded
  Spell List feature).
- **Filters test stored fields with `match`** (`design/model/predicates.md`,
  "Filters"): "a Finesse weapon" is `{kind: "item", where: {match: {weapon:
  {properties: "weapon-property:finesse"}}}}`. A creature's own fields are
  a `match` too: "a beast" is `{match: {creatureType:
  "creature-type:beast"}}`, "has a fly speed" `{match: {speeds:
  {"movement-mode:fly": true}}}`.
- **Numbers are read by path** (`design/model/roles-and-values.md`):
  `"modifiers.ability:wis"`, `"levels.class:cleric"`, `"pools.ki.current"`,
  `"target.hp.max"`.
- **Choices are written where the pick goes**; there is no `choices` list.
- **Gaps:** what the encoding can't say goes in the entity's `gaps` and the
  agent's notes, never into a half-right encoding.
- **Spent ammunition:** "once it hits, the ammunition is no longer magical"
  needs no encoding and no gap. The piece has left the character's inventory,
  and what happens to it if picked up again is not the engine's to track. An
  item that turns into another while still held is different: that stays a
  gap.
- **Once per turn** recovers at the start of *every* turn
  (`subject: {pool: any}`); "once on each of your turns" is your own turn.
- **Rests:** a recovery on `rest:short` also happens on a long rest; a
  trigger on `rest:short` is a short rest only. "When you finish a short or
  long rest" is a trigger with no `rest`.
- **Triggered damage or states** go to the creature hit: `"to": "subject"`.
- **Triggers name their event with `event`, and test its fields with
  `match`:** "when you hit" is `{event: "event:roll-resolved", by: "self",
  match: {roll: "roll:attack", success: true}}`. The same shape in a `when`
  tests the event being handled: "your saving throws against poison" is
  `{event: "event:roll-made", by: "self", match: {roll: "roll:save", against:
  {sourceType: "source-type:poison"}}}` (`design/model/predicates.md`
  and `design/model/triggers-and-events.md`). There are no separate roll, attack, result,
  or spends tests.
- **A number crossing a line is `becomes`:** "if your fly speed drops to 0"
  and "when you drop to 0 hit points" are `{becomes: Predicate, subject:
  "self"}`; damage that leaves a creature at 0 is `match: {remaining: 0}` on
  `event:damaged`, or on `event:taking-damage` to change it first.
- **"If X, A; otherwise B"** is one outcome with `when` and `otherwise`, and a
  number that depends on a test is `{if, then, else}`.
- **Look before minting a term.** Grep `bundles/core/entities/vocabulary`
  for an existing one first (`event:dusk` already meant sunset). A term goes
  in `core` unless only one book uses it.
- **Never list a category's members.** "Favor 10 with any guild" is the
  marker every standing grants (`{has: "feature:favor-10"}`), not one test
  per guild; "any sword" is a group.
- **Who acts.** An event with no `by` means anyone acted, in a trigger and
  in a `when` alike, so "your rolls" says `by: "self"`. A roll's `subject`
  is the creature it's against: "attack rolls against you" is `{event:
  "event:roll-made", by: {pool: "any"}, subject: "self", match: {roll:
  "roll:attack"}}`, and a saving throw's `subject` is the creature that
  forced it.
