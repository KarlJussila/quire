# Bundles and the loader

A **bundle** is one source book or homebrew pack: a directory with a manifest
and one JSON file per entity. Official and homebrew bundles have the same
format and go through the same validation.

```
bundles/<code>/
  bundle.json          the manifest
  entities/<kind>/…    one entity per file (a file may also hold an array)
  patches/…            optional: changes to entities other bundles own
```

## The manifest

```jsonc
{ "id": "harbor", "name": "The Harbor Guild", "version": "0.1.0",
  "kind": "homebrew", "edition": "2024",
  "requires": [ { "bundle": "core" }, { "bundle": "srd24" } ] }
```

`requires` lists the bundles this one refers to. An entry can be
`{ "anyOf": [...] }` when any one provider will do. Every bundle requires
`core`, which is always loaded and has no edition. It holds what both
editions share:
- **the vocabulary:** abilities, skills, damage types, sizes, named
  actions, groups, rarities, and the rest of the game's nouns. A term that
  only one book's content uses (a subclass's option list, a setting's
  dragonmarks) is that book's own, the way a homebrew bundle defines its
  own terms; a book that shares it with another book prints its own copy;
- **this project's own rules and states**, which cite `core`: how a roll,
  an activity, and a state work, whatever the edition.

**Each edition's rules and conditions are in its SRD bundle**: `srd` for 2014 and `srd24` for 2024, with the SRD's wording
(CC-BY): actions, movement, combat, dying, senses, hazards, spellcasting.
Every bundle with an edition requires its SRD. A rule that is the same in
both editions ships in both under one id (`rule:proficiency-bonus`).

**A rule belongs to the editions of the bundles that ship it.** The engine
applies a rule when one of those bundles has the edition in use, or when
none of them has an edition. So a 2024 character never gets the 2014
Advantage and Disadvantage rule beside the 2024 Advantage and Disadvantage
rules, a rule one edition dropped (Contests, Shoving) needs nothing to say
so, and a homebrew bundle with no edition applies to both. Nothing in a
rule names its edition or what it replaces.

## Ids and editions

An id is `kind:key`. A `/` in the key namespaces it under a parent
(`feature:barbarian/rage`). A key ending `@2024` is the 2024 version of
something whose rules changed. Identical content keeps one id across
editions, and vocabulary always does: `damage-type:fire` is the same term in
both. No entity id ends in `@2014`.

A feature's key sits under the one entity that offers it:
- **A class's or subclass's features**, including the options of a list that
  belongs to it: `feature:warlock/pact-magic@2024`,
  `feature:warlock/pact-of-the-tome@2024` (an invocation),
  `feature:sorcerer/careful-spell` (Metamagic),
  `feature:ranger/hunter/colossus-slayer`. An option goes under the class or
  subclass, not under the feature that makes the choice.
- **A species', background's, feat's, or item's features** go under it the
  same way: `feature:aasimar/...`, `feature:criminal/...`.
- **A feat that borrows a class's list** (one that grants an Eldritch
  Invocation, say) doesn't make its options shared; they stay under the class.
- **Only a feature several entities offer stays at the top:** fighting
  styles, `feature:evasion` (Rogue and Monk),
  `feature:ability-score-improvement`.

The id is only a name: the engine never reads a class from it (see below).

A later book's rewrite of something shares its id and wins ("Loading"
below), and the reprint-override warnings for it are expected. Only the
2014/2024 split gets `@2024` ids. A subrace that a later book makes a full
race keeps both, under different ids: the full race doesn't replace the
subrace.

### References and editions

A reference names a thing, not an edition, unless it must:

- **Untagged, `language:dwarvish`:** Dwarvish in whichever edition. Where a
  rule uses the thing (grants a language, casts a spell, names a base item),
  the engine takes the version that's loaded, or the preferred edition when
  both are. The preference is a load option; unset, it is 2014 when every loaded bundle with an edition is a 2014 one, and 2024 otherwise. Where a
  rule tests for it ("if you're a dwarf", "other than hide", "while raging",
  a spell's class lists), either version passes.
- **Pinned, `X@2024` or `X@2014`:** only that version. `@2014` names the
  untagged entity. Pin only when the rule depends on that version's content.
  The 2014 Rage applies `state:raging@2014`, and the 2024 Rage applies
  `state:raging@2024`, because the two states end differently. A test for
  `state:raging` still matches both, so a 2014 subclass's "while raging"
  works under a 2024 Rage.
- **Lists of parts are exact.** A class's or subclass's `levels`, any
  `features` list, `firstClass`, `multiclass.features`, and `replaces` name
  exactly the entity they list, and an untagged id there is the untagged
  entity. They build an entity rather than refer to something. That covers
  each entry, a granted feat's `feat`, and a choice's options; a choice's
  filter, its count, and a granted feat's `chosen` values are ordinary
  references (Magic Initiate (Cleric) is `chosen: {class: "class:cleric"}`).
- **Groups have no edition.** A group's members are whatever claims it, from
  either edition. A choice over a group or a kind first keeps one version of
  each thing, by the rule above, and then tests the version it kept. Draconic
  is a standard language if the 2024 version is the one kept, and exotic if
  the 2014 one is.
- **Load checks** treat an untagged reference as satisfied, and its
  dependency as declared, when either version is.

A namespace is only a name. What gives a feature to a character is a list:
a class's or subclass's `levels`, or any other entity's `features` (a
species' traits, a background's feature, a feat's parts, a feature's
sub-features), in printed order. A feature nothing lists is an option some
choice offers, or a gap.

## Loading

`packages/engine/src/load.ts` turns a set of bundles into one catalog:

1. **Validate** every entity and patch file. An invalid entity is reported and
   left out; the rest of its bundle still loads.
2. **Check requirements.** A missing required bundle is a warning; its
   references dangle instead of failing.
3. **Collapse reprints.** The same id in two bundles is one entity. Identical
   copies merge silently. Copies that differ only in wording are reported as
   information, and the book's own wording beats an SRD rewording. Otherwise
   a bundle's copy beats the copy in a bundle it requires outright (not as
   one of a choice of alternatives), directly or through another: a book
   builds on its SRD, which prints a cut-down
   version (an option left out, a spell without its wizard's name), so
   loading the book restores the book's version. When
   neither bundle requires the other, the later release wins. Either way the
   override is a warning: a homebrew bundle overrides official content the
   same way, so it has to be visible.
4. **Alias** ids through `supersedes`, and repoint references.
5. **Apply patches** in load order. A patch whose result is invalid is
   reported and not applied.
6. **Check optional rules' overrides**, without applying them: each must be
   on an optional rule, name a loaded entity, and leave it valid. A campaign
   turns rules on with `enableRules`.
7. **Resolve references.** A missing vocabulary term is an error. Missing
   content is a dangling reference, a warning: a player can load any subset of
   books. A reference into a loaded bundle that isn't required is an
   undeclared dependency, a warning.
8. **Check what rules reach into** (`links.ts`), an error if it isn't there:
   a `change` must patch something its target has (each `$where` matches an
   element, each keyed element exists), an activity a filter names by key
   must exist somewhere, a `{value, from}` must be stored in that
   entity's `values`, and each field a trigger's `match` tests must be in
   its event's `payload`. A reference here means the referrer's own edition when
   that's loaded, so a 2024 feature patching `rule:unarmed-strike` must use
   the 2024 strike's activity keys.

`node packages/engine/scripts/check-bundles.ts bundles/*` runs this over the
corpus and prints the findings.

## Patch operations

A patch sets fields on its target. The same grammar is the `set` of a
`change` effect ([model/effects.md](model/effects.md) "Changing things"), and of a `cast` outcome or
`spell-access` effect for one way of casting a spell, so content edits and rule
edits are written alike.
- A scalar replaces the field; `$replace` replaces any value whole, rather
  than recursing into it; `$delete` removes the field.
- `$append` and `$prepend` add to a list; `$remove` drops the elements that
  match a pattern (read as in `match`): `{"cost": {"$remove": {"resource":
  "spell-slots"}}}`.
- `$base` gives a number a starting value where nothing higher is stored;
  `$add`, `$subtract`, `$multiply`, `$atLeast`, and `$atMost` edit a number;
  `$add` also adds to a time span in the same unit, and `{$add: {amount,
  upTo}}` adds without passing `upTo` or lowering a number already above it.
  A missing number counts as 0, except that the loader reports arithmetic on
  a named value the entity doesn't store. Effects that change a number
  (`change`, `intercept`) use the same operators ([model/effects.md](model/effects.md) "One set of
  number operators").
- A plain object recurses into the field. On a list of keyed objects, such as
  `activities` or a `features` list holding a choice, it names elements by
  `key` (a choice by its `choose.key`) and recurses into each:
  `{"features": {"fighting-style": {"count": 2}}}`. On any list, `$where`
  picks the elements that match a pattern and the object's other fields edit
  them: `{"cost": {"$where": {"resource": "action"}, "resource":
  "bonus-action"}}`. On a map, `$where` picks the entries that match, and
  `$where: true` picks every element or entry: `{"speeds": {"$where": true,
  "speed": {"$multiply": 0.5}}}`. `$at` edits one map entry by its key,
  which may be a choice made in play: `{"abilities": {"$at": {"choose":
  …}, "$add": 1}}`.

A reference a patch adds is
checked against the patching bundle's dependencies, not the target's.
