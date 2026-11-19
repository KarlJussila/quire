# Vocabulary

## Grammar is closed, vocabulary is open

Two kinds of list show up in a schema.

- **Grammar.** These are the words that define *how* data is structured: which
  effect and outcome types exist and which fields each has, `all`/`any`/`not`,
  the Value forms, and the activity fields. Grammar has to be closed, because
  each word decides what the remaining fields mean, and the engine needs code
  for each one.
- **Vocabulary.** These are the game's nouns: damage types, conditions,
  creature types, kinds of action, rests, trigger events, weapon properties.
  Vocabulary is open. Each term is an entity in a bundle with metadata, and
  data refers to it by id. A homebrew bundle can add a damage type, a
  "gritty-realism" rest, or a new kind of monster action without touching the
  schema. A reference to a term that doesn't exist fails validation, so typos
  are caught exactly as an enum would catch them.

Every string that names a game concept is a vocabulary reference. There are no
free-string escape hatches.

The vocabulary kinds:

| Kind | Examples | Metadata |
|---|---|---|
| `ability:` | `ability:str`, a homebrew `ability:res` (Resolve), which only exists while its optional rule is on | order; `fallback`, the score a creature without this one uses (Charisma for Honor); `changedBy: "manual"`, only the DM changes it, so an ability score increase can't pick it (Honor) |
| `skill:` | `skill:stealth` | default ability |
| `size:` | `size:medium` | rank, space |
| `damage-type:`, `damage-qualifier:` | `damage-type:fire`, `damage-qualifier:magical` | — |
| `sense:`, `movement-mode:` | `sense:darkvision`, `movement-mode:fly` | — |
| `currency:` | `currency:gp` | value in cp, symbol |
| `spell-school:`, `hit-die:` | `spell-school:evocation`, `hit-die:d8` | sides |
| `language:` | `language:deep-speech` | script, speakers; standard, rare, or exotic is a group |
| `creature-type:` | `creature-type:undead` | — |
| `creature-tag:` | `creature-tag:goblinoid`, `creature-tag:shapechanger` | — (the parenthetical in "Humanoid (Goblinoid)") |
| `alignment:` | `alignment:neutral-evil`, `alignment:evil` | `isA`: a full alignment isA both of its components |
| `group:` | `group:martial-weapon`, `group:shield`, `group:eldritch-invocation`, `group:origin` | `isA`, one or several; see "Groups" below |
| `weapon-property:`, `weapon-mastery:` | `weapon-property:finesse`, `weapon-mastery:topple` | a mastery carries its own effects and activities |
| `action:` | `action:magic`, `action:attack`, `action:dash` | the named actions; what they cost is a pool ([costs-and-economy.md](costs-and-economy.md)) |
| `event:` | `event:roll-resolved`, `event:turn-start`, `event:dawn` | its payload fields, and `emittedBy: "engine"` for the ones no data emits ([triggers-and-events.md](triggers-and-events.md)) |
| `rest:` | `rest:short`, `rest:long` | — |
| `restriction:` | `restriction:cast-spells`, `restriction:concentrate`, `restriction:reactions` | what `forbid` forbids and `waive` lifts |
| `roll:` | `roll:attack`, `roll:save`, `roll:check`, `roll:damage`, `roll:healing`, `roll:initiative`, `roll:death-save`, `roll:concentration`, `roll:contest` | `isA` (initiative isA check, death and concentration saves isA save; attack, check, and save isA `roll:d20-test`) |
| `source-type:` | `source-type:poison`, `source-type:disease`, `source-type:magic`, `source-type:spell` | what implies it ([predicates.md](predicates.md) "Source types") |
| `area-shape:` | `area-shape:cone`, `area-shape:emanation`, `area-shape:sphere`, `area-shape:line`, `area-shape:cube`, `area-shape:cylinder` | which dimensions it takes |
| `environment:` | `environment:dim-light`, `environment:underwater` | — |
| `plane:` | `plane:ethereal` | — |
| `rarity:`, `stat-block-section:` | `rarity:very-rare`, `stat-block-section:bonus-action` | order |
| `table:` | `table:pact-magic`, `table:full-caster`, a background's `table:acolyte/bond` | the rows; Values and `random` outcomes read them |

What stays closed, and why:

- **Effect and outcome types, predicate operators, and Value forms.** These
  are the grammar itself.
- **Roles** (`self`, `this`, `target`, `source`, `subject`, `actor`) and
  **creature pools** (`ally`, `enemy`, `any`, `object`). These name positions
  in a rule, not game content. See [roles-and-values.md](roles-and-values.md).
- **Time and distance units:** `round`, `minute`, `hour`, `day`, `week`,
  `month`, `year`; feet and miles. These are measurement, not game content.
  "Until the end of your next turn" is a trigger, not a unit.
- **Small structural switches**, such as whether a state stacks
  (`no`/`levels`/`separate`), or which way a modifier combines.

Vocabulary references are checked for shape by the schema and for existence
by the loader. `damage:fire` is a well-formed id and passes the schema; the
loader reports that no such entity exists.

## Groups

Any entity can name the sets it belongs to in `group`, one id or several. A
group is a vocabulary term (`group:martial-melee-weapon`,
`group:eldritch-invocation`, `group:origin`) with a name, and `isA` gives the
hierarchy (a martial melee weapon isA martial weapon and melee weapon, each
isA weapon), so content names only the most specific group. One construct
covers item, feat, and rule categories and option sets: a choice draws
`{kind, where: {group}}` (an Eldritch Invocation, an Origin feat, a gaming
set), an effect names it ("proficiency with martial weapons"), and a
condition tests it (`has: "group:heavy-armor", match: {worn: true}`). A homebrew invocation
joins by naming the group, and a homebrew group is one term file.

Where several classes take different subsets, the option says who may take
it: Archery has `availableTo: [class:fighter, class:ranger]`, and the
Paladin's choice draws `{group: "group:fighting-style", for:
"class:paladin"}`. A book that opens an existing option to its own class or
subclass patches the option's `availableTo` (a homebrew bard college that
grants a fighting style adds itself to Dueling). A group has no edition: 2014 Fighting Style options
and 2024 Fighting Style feats both join `group:fighting-style`, and a choice
keeps one version of each option by the edition preference. A choice that
must draw from one edition says so in its `where`.

**A list of ids that stands for a category** ("any sword", "a standard
language", "a one-handed melee weapon") is always a group or a filter, never
the members written out, so another book's members join without the book
naming them. Ids are listed only where the book itself names them (Bracers
of Archery's longbow and shortbow). All of one kind is `{kind}` alone:
"one ability score" is `{"kind": "ability"}`, "all skills" is `"in": [{"kind": "skill"}]`, and "two other ability scores"
is `{"kind": "ability", "where": {"not": {"is": "ability:cha"}}}`.

A language's standing is a group too: `group:standard-language`,
`group:exotic-language`, and `group:rare-language@2024`, which only 2024
prints. A 2024 language joins the standard group from its own entity, so
Draconic is standard when the 2024 version is kept and exotic otherwise.

## Editions in references

An id ending `@2024` is the 2024 version of something whose rules changed
(`feature:barbarian/rage@2024`). Identical content shares one id in both
editions. The suffix belongs to the key, so it is still one flat id. A
reference leaves the suffix off unless the rule depends on one version:
`condition:prone` means the loaded or preferred edition's Prone, and a test
for it passes on either. Lists of parts name exact entities. The full rule is
in [../bundles.md](../bundles.md) "References and editions".
