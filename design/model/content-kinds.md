# Content kinds

The grammar is shared. Each content kind adds its own fields around it. The
rule throughout: **a kind's own fields hold what the book prints about that
thing; anything that acts or changes numbers is an effect, state, or
activity**. Every kind can carry `effects` and `activities`, except the
containers below. The schema for each kind is in
`packages/schema/src/kinds.ts`.

## Shared shapes

```ts
type Attunement = true | { by: Predicate; text?: string };  // "by a cleric", "by a creature of evil alignment"
type CheckSpec  = { ability: AbilityRef; skill?: SkillRef | SkillRef[] };  // with a list, the creature picks
type Price      = { amount: Value; currency: CurrencyRef };
// Text and Gap: book text with formatting, and a {category, name} gap marker.
```

A choice (`Choose<T>`) can stand where an item or value goes:
[choices.md](choices.md).

**Naming.** Outcome keys are camelCase (`applyState`, `endState`, `tempHp`).
Effects are discriminated by `type`, so `damage-bonus` names its damage type
`damageType`.

## Classes, species, and backgrounds

- **Containers grant; units carry rules.** A class, subclass, species, or
  background has no effects or activities of its own. It gives features (a
  class and subclass by level in `levels`, the others in `features`) plus its
  descriptive fields (`hitDie`, `size`, `speeds`, `parent`). The rules live in
  features, feats, spells, items, conditions, and core rules. Where the book
  prints a basic trait or line rather than a named feature, it is still a
  feature with that text: a species' "Ability Score Increase.", "Darkvision.",
  and "Languages." paragraphs, a background's "Skill Proficiencies:" line, a
  class's Proficiencies block. A class's starting proficiencies are in
  `firstClass`, and `multiclass` holds `requires` (the score minimums) and the
  `features` you get instead when it isn't your first class. The class
  feature that grants a subclass offers it as a choice in its `features`
  (`{"choose": {"key": "subclass", "from": [{"kind": "subclass", "where":
  {"match": {"class": "class:wizard"}}}]}}`), so the pick is stored at the
  level the feature was gained, and the subclass then gives its `levels` by
  the level of its class. The class reference has no edition, so a 2014
  subclass can be picked for the 2024 class. The 2024
  starting languages (Common plus two standard ones) are the book's "Choose
  Languages" step, `rule:languages@2024`, which applies to every creature
  with a character level, not a background feature. A species whose book
  states its languages keeps a Languages feature of its own.
- **One kind for species.** Races and subraces are `species:` entities; a
  subspecies has a `parent`. A variant that replaces some of its parent's
  traits lists the parent features it doesn't have in `replaces` (a homebrew
  half-elf variant that trades Skill Versatility for a swim speed).
- **Tables.** Spell slot progressions (`table:full-caster`,
  `table:pact-magic`, `table:multiclass-slots`) and random tables (a
  background's bonds and flaws) are `table:` entities, read with `{table,
  column}`. A class's other columns (Rages, Sneak Attack) are `byLevel`
  Values on the features that use them.
- **Spellcasting.** A class's Spellcasting (or Pact Magic) feature says the
  character casts spells through that class, as a `change` to the
  character's own `spellcasting`, keyed by the class: `{"spellcasting":
  {"class:wizard": {"ability": "ability:int", "slots": "table:full-caster",
  "prepared": {"$base": {"byLevel": …}}, "cantrips": {"$base": …},
  "casterLevel": {"$base": "levels.class:wizard"}}}}`. `casterLevel` is what the
  class counts toward multiclass spell slots (a Paladin's is half its level,
  rounded as its edition says). The save DC and attack bonus aren't written:
  `rule:spell-save-dc-and-attack-bonus` gives every entry of `spellcasting`
  its `dc` and `attack` from its `ability`, and `rule:spell-slots` gives each
  its slots by level and `spellLevel`, the highest level it has slots for on
  its own. Which cantrips and spells the character has are choices in the
  same feature, `spell-access` effects whose counts and level limit read
  those fields: `{"choose": {"key": "prepared", "count":
  "spellcasting.class:cleric.prepared", "from": [{"kind": "spell", "where":
  {"match": {"lists": "class:cleric", "level": {"atLeast": 1, "atMost":
  "spellcasting.class:cleric.spellLevel"}}}}]}}`. A class has no `caster`
  field.

## Creatures

```ts
interface Creature extends Entity {
  size: SizeRef | SizeRef[];            // "Medium or Small"
  creatureType: CreatureTypeRef; tags?: CreatureTagRef[];
  alignment?: AlignmentRef;             // alignment:unaligned and alignment:any-evil are vocabulary too
  ac: Value;                            // the printed AC: "16 (natural armor)" is 16
  acFrom?: (ItemRef | string)[];        // what it comes from: ["natural armor"], [item:plate-armor, item:shield]
  hp: { average: Value; formula?: string };             // Values allow summon scaling
  speeds: Record<MovementModeRef, { speed: Value; hover?: true; note?: string }>;  // speeds.movement-mode:fly.speed
  abilities: Record<AbilityRef, number>;
  saves?: Record<AbilityRef, number>;   // printed totals
  skills?: Record<SkillRef, number>;    // printed totals
  senses?: Record<SenseRef, { range: number; blindBeyond?: true; note?: string }>;
  passivePerception?: number;           // printed; derived when the book omits it
  languages: { language: LanguageRef | "any"; count?: number; understandsOnly?: true }[];
  telepathy?: number;
  cr: number | { value: number; inLair?: number }; xp?: number; proficiencyBonus?: number;
  effects: Effect[];                    // resistances, immunities, Magic Resistance, Pack Tactics
  blocks: Block[];                      // traits, actions, bonus actions, reactions, legendary, lair, mythic
  legendary?: { actions: number; inLair?: number };
  base?: CreatureRef;                   // "uses the Fiendish Spirit stat block", with overrides
}

interface Block { name: string; section: StatBlockSectionRef; text: Text;
                  effects?: Effect[]; activity?: Activity; gaps?: Gap[] }
```

Printed totals (saves, skills, to-hit, DCs, passive Perception) are stored as
printed, because the book is the source of truth. The engine can derive them
and flag a mismatch. A summon's stat block uses the same shape, with Values
that read `{slotLevel: true}`.

A stat block's Spellcasting is a block like any other. Its spells are written
as a character's are, with `spell-access` effects (innate casting with `uses`
for "3/day each"), not a second spellcasting grammar. The stat blocks so far
keep it as text; their slots are pools like a character's ([costs-and-economy.md](costs-and-economy.md) "Spell slots are pools").

## Items

```ts
interface Item extends Entity {
  rarity?: RarityRef; attunement?: Attunement; cost?: Price; weight?: number;
  weapon?: { damage: { amount: Value; type: DamageTypeRef }; versatile?: Value;
             properties: WeaponPropertyRef[]; mastery?: WeaponMasteryRef;
             range?: { normal: number; long: number } };
  armor?: { ac: Value;   base?: ItemRef | Choose<ItemRef>      // a +1 longsword's longsword; "any weapon"
        | { item: ItemRef; chosen: Record<Key, Id | Id[]> };  // "functions as a vorpal sword"
  contents?: { item: ItemRef | CurrencyRef; quantity: Value }[];  // a pouch of coins; 20 bullets
  object?: { ac: number; hp: Value; damageThreshold?: number; effects?: Effect[] };
  sentience?: { abilities: Record<AbilityRef, number>; alignment: AlignmentRef;
                senses: Creature["senses"]; communication: "emotion" | "speech" | "telepathy";
                languages?: LanguageRef[] };
  effects?: Effect[]; activities?: Activity[];
}
```

- **Variant families are separate entities**, one per variant, each carrying
  the family's text: `item:armor-1`, `item:armor-2`, `item:armor-3`;
  `item:armor-of-resistance-fire`; `item:robe-of-the-archmagi/white`. Split
  unless splitting one would be absurd. The 2024 +1, +2, or +3 entries
  print as one item, but their armor, shield, weapon, and ammunition share
  the 2014 ids, since the rules are the same.
- **Weapon mastery** is a `weapon-mastery:` vocabulary entity. Its activity
  is what the property does, and its triggered effect says when a master
  gets it: on a hit with a weapon that names this mastery, when the weapon
  is one the attacker has mastered (`{compare: "masteries.{attack.item}",
  equals: true}`), it runs the activity. A feature that gives the property
  some other way runs the activity itself, as Battering Roots runs Push or
  Topple. A weapon names its mastery, and the 2024 Weapon Mastery feature
  is a choice of weapons.
- **Cursed items** apply a curse state on attunement ([states.md](states.md) "Permanent
  changes").
- **The base item** is the mundane item a magic item is made from. It
  supplies the weapon or armor stats the item doesn't set, and the item's
  effects add to the base's. Most items name it directly: Sentinel Shield is
  `{"base": "item:shield"}`. "Any weapon", "any sword", or "any medium or
  heavy armor" is a `choose` over a group, made when the item is created and
  recorded on the character's copy: Weapon, +1 is
  `{"base": {"choose": {"key": "base", "name": "Weapon", "from": [{"kind": "item", "where": {"group": "group:weapon"}}]}}}`.
  Only mundane items (no `rarity`) are candidates, so the choice never
  offers another magic item. Choosing by group rather than listing items lets
  another bundle's items join: a homebrew double-bladed scimitar is in
  `group:sword`, so a Flame Tongue offers it when that bundle is loaded,
  without the SRD referring to it. An entity can be in several groups (a
  longsword is a martial melee weapon and a sword; an arrow is adventuring
  gear and ammunition).
- **A magic item as the base.** An item that "functions as" another magic
  item names it as its base, and everything the base has applies to it: its
  effects, activities, and uses, with `this` in them meaning the new item.
  A field the item sets itself, like `rarity` or `attunement`, replaces the
  base's. When the base has a choice of its own, `chosen` makes it, by choice
  key, the same way a granted feat's choices are made. A homebrew Edge of
  the Last Word, "this longsword … functions as a vorpal sword", is
  `{"base": {"item": "item:vorpal-sword", "chosen": {"base": "item:longsword"}}}`.
- **Attunement is written per rule.** Without attunement a creature gets only
  an item's nonmagical benefits, unless its description says otherwise, and
  many do: a curse that strikes whoever handles it, a harm to someone who
  isn't attuned, a property worded "while you hold it". So each rule that
  needs attunement says so with `{"has": "this", "match": {"attuned": true}}` in its `when`, next to
  any wearing or holding test (`{"has": "this", "match": {"worn": true}}`, `{"has": "this", "match": {"held": true}}`).
  The item's `attunement` field says only who can attune to it.
- **Charges** are a `resource` on the item. The pool belongs to whoever has
  the item, but it stays that item's own: two wands that both call their pool
  `charges` don't share one. A cost inside the item, `{"resource": "charges"}`,
  spends its own pool. How they come back is the item's own `recover` list:
  any trigger, all or a number or dice ("1d6 + 1 daily at dawn"), or nothing
  for charges that never return. Spending them may need attunement; regaining
  them doesn't.
- **Equipping and unequipping** are the events `event:item-equipped` (don
  armor or a shield, put on a worn item, draw or pick up a held one) and
  `event:item-unequipped` (doff, take off, drop, stow, or sheathe), with the
  event's `item` field saying which: Mage Armor ends on
  `{"event": "event:item-equipped", "subject": "target", "match": {"item": ["group:light-armor", "group:medium-armor", "group:heavy-armor"]}}`.
  A state on an item is written as the item's own rules are
  ([roles-and-values.md](roles-and-values.md)), so an item's passing
  condition is a state on the item: Flame Tongue's Ignite applies its flames
  to `this`, the flames carry the fire damage and the light, and they end on
  `{"event": "event:item-unequipped", "subject": "self", "match": {"item":
  "this"}}`.
- **An item that becomes another** ("the wand becomes a wand of smiles",
  "the staff loses its properties and becomes a nonmagical quarterstaff") is
  a `replace` outcome whose `what` is `{"kind": "item", "where": {"is":
  "this"}}` and whose `with` is the new item. An item destroyed on its last
  charge is a `destroy` outcome to `this`, as the Wand of Magic Missiles'.
- **"Daily at dawn"** is the event `event:dawn`. Nothing keeps a clock yet;
  the table says when dawn has come.

## Vehicles

A vehicle is its own kind: a stat block like a creature's, plus the parts
that make it a vehicle.

```ts
interface Vehicle extends Entity {
  size: SizeRef; dimensions?: string; cost?: Price;
  crew?: number; passengers?: number; cargo?: { amount: number; unit: "tons" | "pounds" };
  speeds: Creature["speeds"]; travelPace?: { milesPerHour?: number; milesPerDay?: number };
  abilities?: Record<AbilityRef, number>;
  effects?: Effect[];                   // condition immunities, damage threshold
  components: { key: string; name: string; count?: number; ac?: number; hp?: number;
                damageThreshold?: number; speed?: Creature["speeds"];
                activities?: Activity[]; effects?: Effect[] }[];  // hull, helm, sails, weapons
  activities?: Activity[];              // vehicle actions, with "the vehicle can take N actions"
}
```

A creature controlling a vehicle is a state (`state:piloting`, source = the
vehicle), so "while piloting" rules use the ordinary grammar. The state isn't encoded yet.

## Standing: renown, piety, and rank

Renown with a guild, piety toward a god, and rank in a knightly order are
counters with rewards at thresholds.

```ts
interface Standing extends Entity {     // standing:favor/the-harbor-guild
  ranks?: { at: number; name?: string; grants: Id[] }[];   // features granted at each threshold
  earn?: Text; lose?: Text;             // printed guidance; the DM adjusts the score
}
```

The character document holds each score. A rank's grants are ordinary
features, gated by `{compare: "standings.<standing id>", atLeast: number}`. A rank that lets you cast a spell is a feature with a `cast` activity and
`uses`, exactly like a racial spell. A deity entity names its piety standing.

## Rules

Core rules are entities too: Cover, Opportunity Attacks, Grappling, Two-Weapon
Fighting, Falling, Suffocating, Surprise, Resting, Multiclassing, Underwater
Combat.

```ts
interface Rule extends Entity {
  optional?: true;                      // a DM opts in: feats, flanking, gritty realism
  overrides?: { target: Id; set: PatchSet }[];  // patches that apply only while the rule is on
  appliesTo?: Who;                      // default: every creature
  effects?: Effect[]; activities?: Activity[];
  defines?: Id[];                       // what the rule adds: cover's states, a homebrew Resolve ability
}
```

The Opportunity Attack is a rule with a reaction activity every creature has.
Cover is a rule defining three states whose effects modify AC and Dexterity
saves.

**An optional rule's own effects apply only while it's on, and what it
defines exists only then.** The 2014 encumbrance variant's states apply only in
a campaign that uses it. A homebrew bundle's Resolve and Corruption scores
are two optional rules, `rule:resolve` and `rule:corruption`, since a DM can
add either or both; each defines its ability, so a campaign without them has
the usual six, and a choice of "an ability" never offers Resolve. `enableRules` leaves out what the
rules that are off define. At character creation the new score is made like
the other six; each rule's `values` hold what it adds to the standard array
(an 11) and to the point-buy budget (3 points), for score generation to read.

**A variant overrides what it varies.** An optional rule doesn't sit beside the
rule it changes, and the base rule doesn't carry the variant. The variant is
its own entity, with `overrides` in the same form as a patch file's entries.
While a DM has it on, the engine layers those patches over the printed
content (`enableRules`); otherwise nothing changes. The loader checks every
override at load: it must be on an optional rule, and its target must be
loaded and still valid once patched. Examples are the SRD's encumbrance and
skills-with-different-abilities variants, and a DM's own
"the grappler contests a shove away from it". Rules that are only text, such as a setting's overview of guild membership,
stay text.

## Deities

A deity is plain data: `{alignment, domains: SubclassRef[], symbol, pantheon,
standing?: StandingRef}`. A god whose setting tracks piety names that standing.
