# Choices

## One way to write a choice

```ts
interface Choose<T> { choose: {
  key: string; name: string;            // name: what a UI shows
  count?: Value | { atLeast?: Value; atMost?: Value };
  from: (T | { kind: KindRef; where?: Predicate } | { name: string; of: T[] })[];
  where?: Predicate; distinct?: boolean; each?: Value; optional?: boolean; when?: Predicate;
  by?: Role;                            // who picks in play (a shove's target); replacing a pick later is a `replace` outcome
} }
```

`{choose: {key, name, count?, from, where?, distinct?, each?, optional?,
when?, by?}}` stands wherever an item or value goes, and its candidates are what
that place holds. "Strength or Dexterity +1" is a change whose
`abilities` entry is `$at` a choose; "two skills" is a proficiency whose `in` holds
one; Elven Lineage is a choose in `features`; Shoving's "prone or push" is a
choose in `outcomes`. `from` is a list of candidates: items of the slot's
type, `{kind, where}` filters ("a skill", "a tool"), or a named group
`{name, of: [...]}` of several items taken together (a house's tools).
`where` filters every candidate. `name` is what a UI shows, and every
candidate written out in place is named too. Other rules read the pick with
`{chosen: key}`.

No field declares that it takes a choice, or a read of one: both stand in any
field, added to every field once when the schema document is built
(`packages/schema/src/global.ts`). The checker then puts each candidate in
the choice's place in turn and checks that (`choices.ts`): a named group's
items together, spliced into a list, or each alone in a field that holds one
item; a filter as whatever the choice's other candidates are, or an id of
its kind; a range as a number. A `{chosen: key}` read of a choice in the
same entity is checked the same way, as each candidate of that choice; a
read of several picks is too where it sits in a list, and elsewhere it may
stand for the whole list (`"spells": {"chosen": "spells"}`). A read of a
value from a picked entity (`{chosen, value, from}`) is checked when the
bundles load: some candidate must store that value. A candidate that
doesn't leaves the field out, as a cone's breath has no width.

## When a choice is made

A choice is made when the thing holding it is gained (a feature, feat, species, background),
used (an activity), or applied (a state). Protection from Energy's damage type is a
choose inside the state the spell applies, so it is asked when the spell is
cast.

## Picks that depend on other picks

In a choice's `where`, `is` names the candidate being considered: `{not:
{is: {chosen: "first"}}}` is "another one than your first pick", and
`{any: [{is: "language:dwarvish"}, {proficient: "language:dwarvish"}]}` is
"Dwarvish, or any language if you already know Dwarvish". Outside choices,
`is` names a role.

## Picks that repeat

`each` lets one candidate be picked more than once, up to that many times,
and the effect holding the choice applies once per pick. Ability score
increases are written this way, as +1s to spread: a 2024 background's "+2
to one and +1 to another, or +1 to all three" is three picks among its
three abilities with `each: 2`, and the Ability Score Improvement feat's
"+2 to one, or +1 to two" is two picks with `each: 2`. A character stores
such a pick as a count per candidate: `{"ability:int": 2, "ability:con":
1}`.

An ability score increase never needs to exclude a homebrew Resolve score itself. An ability
with `changedBy: "manual"` is never a candidate for a choice that a change
raises, and one whose optional rule is off isn't loaded at all.

## Candidates that are entities

A candidate with its own name and text in the book, or one other rules read
a value from, is a feature in a group, and the choice draws the group: the
dragon ancestries, Metamagic options, Eldritch Invocations. A homebrew
option joins by naming the group. Plain alternatives in one sentence or
table row stay in place as named groups: a house's tools, the 2014 Shove
action's "knock prone or push".

## Values a pick carries

Any entity's `values` holds named ids or numbers. `{chosen, value, from}`
reads one from the picked entity: Damage Resistance resists `{chosen:
"ancestry", value: "damage-type", from:
"feature:dragonborn/draconic-ancestry"}`, where `from` names the entity
holding the choice when it isn't the one the rule is on.

## A pick no rule reads

The `record` effect holds a choose and does nothing else: `{type: "record",
pick: {choose: {key: "season", name: "Season", from: [{name: "Spring"},
…]}}}`. The pick is kept and shown, and rules can still read it with
`{chosen}`. Candidates may be ids or plain labels (`{name}`). It's for
homebrew flavor picks and picks whose rules aren't written out yet, and for
a lasting pick that other features read: a homebrew Weather Ward's season
is a `record` over its four aura states, its activity applies
`{applyState: {state: {chosen: "season"}}}`, and a later feature's benefits
test `{has: "feature:…/weather-ward", chosen: {season:
"state:…/weather-ward-winter"}}`.

## Granted feats

`features` lists feats as well as features: a 2024 background gives its
origin feat there. A feat whose choice the giver makes is `{feat, chosen:
{<choose key>: <id>}}`, as in Magic Initiate (Cleric): `{feat:
"feat:magic-initiate@2024", chosen: {class: "class:cleric"}}`. The feat is a
part, so it names the exact entity; the chosen class is a reference, so it
names no edition.

## Proficiency targets

A proficiency can name an item, a group, or an item filter: the 2024 Rogue's
"Martial weapons that have the Finesse or Light property" is `{kind: "item",
where: {all: [{group: "group:martial-weapon"}, {match: {weapon: {properties:
[finesse, light]}}}]}}`, where a list matches any of its entries. A known
language is a proficiency. `level: "proficiency-or-expertise"` is
"proficiency, or expertise if you already have it".

## Replacing a pick later

Replacing a pick later is an activity with a trigger and a `replace` outcome. Activities are things
you choose to do, so the trade is always optional (a `triggered` effect is
the one that happens on its own). The 2024 Sorcerer's "whenever you gain a
Sorcerer level that grants new Metamagic options, you can replace one
Metamagic option you know" is `{key: "replace-metamagic", name: "Replace
Metamagic", trigger: {event: "event:level-gained", match: {gives: {picks:
"metamagic"}}}, outcomes: [{replace: {choice: "metamagic"}}]}`. A trade that
isn't of a pick uses `what` and `with`: a feature's fixed spells are `what: {kind: "spell",
where: {grantedBy: "this"}}`, with `same: ["level"]` for "another spell of
the same level". A level-gained trigger's `gives` is what the level gives: a
feature (`"feature:ability-score-improvement"`) or new picks in a choice
(`{picks: key}`).

## Granted by

`grantedBy: "this"` is something this entity gave you, and `grantedBy` can
name another feature: Cantrip
Versatility's "a cantrip you learned from this class's Spellcasting feature"
is `{all: [{match: {level: 0}}, {grantedBy:
"feature:cleric/spellcasting"}]}`. So a class's known cantrips count as
granted by its Spellcasting feature (Pact Magic for the warlock), and Mystic
Arcanum's spells by Mystic Arcanum, wherever class spellcasting ends up
encoded. `grantedBy` with a class id is "your Wizard spells": any spell a
feature of that class or one of its subclasses gave you (the class's
`levels` and the subclass's `class` say which), or that `countsAs` that
class. It works on the spell being cast too, so a class's focus is a
`suppress` of the components rule's `material` effect when holding its focus
group and casting one of its spells: `{all: [{has: "group:spellcasting-focus/wizard", match: {held: true}},
{spell: {kind: "spell", where: {grantedBy: "class:wizard"}}}]}`. A spell's
class lists (`lists`) say only what it's on, which differs for a multiclass
caster.

## A pick that stops qualifying

A pick that stops qualifying is the engine's to catch, not the schema's. Candidates carry their
requirements (an invocation's `requires`), so whenever the character
changes, the engine rechecks every pick and flags one that no longer
qualifies, sending the player back to that choice. A rule such as "if this
change makes you ineligible for any of your Eldritch Invocations, you must
also replace them now" needs no data of its own.

**What the engine checks of a pick.** A choice in an entity's `features`, or
anywhere inside one of its `effects` (the weapons a mastery feature covers,
a feat's cantrips, the spell list those cantrips come from), is made when
the character is built. For each, the engine reports a choice with no
answer, an answer with more or fewer picks than its `count` works out to
(a Wizard who reaches level 4 and still has three cantrips), and a pick
that isn't one of the options the choice offers now. A choice made in play
isn't checked, because the character records none: a choice inside an
activity, inside a step's `outcomes` (which Cunning Strike options to use on
this hit), or inside a `change` with a `variant` (an optional form taken when
the activity is used). A choice with `optional: true` needs no answer. An
effect whose `when` doesn't hold offers nothing, and that `when` can test an
earlier pick: `{has: "feature:ranger/favored-enemy", chosen: {"enemy-1":
"creature-type:humanoid"}}` asks for two humanoid races only of a Ranger who
chose humanoids. A species with several sizes (`size: ["size:medium", "size:small"]`) offers
a choice of one, answered under the species with the key `size`.
What a picked entity `requires` is tested against the character as it
stands: a Warlock with Agonizing Blast and no Eldritch Blast is reported.
A class's `multiclass.requires` is tested once the character has levels in
more than one class.
A choice's own `where` is tested on each pick, with the pick as the
candidate: Expertise in a skill the character isn't proficient in is
reported, and so is a Spell Mastery spell that isn't in the spellbook.
