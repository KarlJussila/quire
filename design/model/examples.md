# Worked examples

Each example is the encoding of a whole rule, or the interesting part of
one. The grammar for each part is in the other files of this folder.

```jsonc
// Rage (SRD 5.1)
{ "id": "feature:barbarian/rage",
  "effects": [ { "type": "resource", "key": "rage",
                 "max": { "byLevel": { "1": 2, "3": 3, "6": 4, "12": 5, "17": 6, "20": "unlimited" },
                          "of": "class:barbarian" },
                 "recover": [ { "on": { "event": "event:rest-finished", "subject": "self", "match": { "rest": "rest:long" } }, "amount": "all" } ] } ],
  "activities": [ { "key": "rage",
                    "cost": [ { "resource": "bonus-action" }, { "resource": "rage" } ],
                    "outcomes": [ { "applyState": { "state": "state:raging",
                                                    "duration": { "amount": 1, "unit": "minute" } },
                                    "to": "self" } ] } ] }

// state:raging
{ "when": { "not": { "has": "group:heavy-armor", "match": {"worn": true} } },
  "effects": [
    { "type": "roll-mod", "mode": "advantage",
      "when": { "event": "event:roll-made", "by": "self",
                "match": { "roll": [ "roll:check", "roll:save" ], "ability": "ability:str" } } },
    { "type": "change", "of": "event",
      "set": { "total": { "$add": { "byLevel": { "1": 2, "9": 3, "16": 4 }, "of": "class:barbarian" } } },
      "when": { "event": "event:roll-made", "by": "self",
                "match": { "roll": "roll:damage", "attack": { "range": "melee", "via": "weapon", "ability": "ability:str" } } } },
    { "type": "defense", "resist": [ "damage-type:bludgeoning", "damage-type:piercing", "damage-type:slashing" ] },
    { "type": "forbid", "restriction": [ "restriction:cast-spells", "restriction:concentrate" ] } ],
  "ends": [ { "event": "event:state-applied", "subject": "self", "match": { "state": "condition:unconscious" } },
            { "event": "event:turn-end", "subject": "self",
              "when": { "not": { "any": [
                { "happened": { "event": "event:roll-made", "by": "self", "subject": { "pool": "any", "where": { "hostile": true } },
                                "match": { "roll": "roll:attack" }, "since": "last-turn" } },
                { "happened": { "event": "event:damaged", "subject": "self", "since": "last-turn" } } ] } } } ] }

// state:raging@2024: what changes from 2014. It lasts until the end of your
// next turn, and each later turn you extend it by attacking an enemy, forcing
// an enemy to save, or using a bonus action, for up to 10 minutes. (The data
// still carries the extension as a gap; this is the encoding it needs.)
{ "duration": { "amount": 10, "unit": "minute" },
  "ends": [ { "event": "event:turn-end", "subject": "self",
              "when": { "not": { "any": [
                { "happened": { "event": "event:state-applied", "subject": "self",
                                "match": { "state": "state:raging" }, "since": "turn-start" } },
                { "happened": { "event": "event:roll-made", "by": "self", "subject": { "pool": "enemy" },
                                "match": { "roll": "roll:attack" }, "since": "turn-start" } },
                { "happened": { "event": "event:roll-made", "by": { "pool": "enemy" }, "subject": "self",
                                "match": { "roll": "roll:save" }, "since": "turn-start" } },
                { "happened": { "event": "event:activity-used", "by": "self", "when": { "activity": "extend-rage" },
                                "since": "turn-start" } } ] } } },
            { "event": "event:item-equipped", "subject": "self", "match": { "item": "group:heavy-armor" } },
            { "event": "event:state-applied", "subject": "self", "match": { "state": "condition:incapacitated" } } ],
  "effects": [ /* …as 2014, with the damage bonus on any Strength attack */ ],
  "activities": [ { "key": "extend-rage", "cost": [ { "resource": "bonus-action" } ] } ] }

// Champion: Improved Critical
{ "effects": [ { "type": "change", "of": "event", "set": { "criticalMinimum": { "$atMost": 19 } },
                 "when": { "event": "event:roll-made", "by": "self", "match": { "attack": { "via": "weapon" } } } } ] }

// Dwarven Resilience
{ "effects": [
    { "type": "roll-mod", "mode": "advantage",
      "when": { "event": "event:roll-made", "by": "self",
                "match": { "roll": "roll:save", "against": { "sourceType": "source-type:poison" } } } },
    { "type": "defense", "resist": [ "damage-type:poison" ] } ] }

// Wand of Paralysis
{ "effects": [ { "type": "resource", "key": "charges", "max": 7,
                 "recover": [ { "on": { "event": "event:dawn" }, "amount": "1d6+1" } ] } ],
  "activities": [ { "key": "ray",
                    "when": { "has": "this", "match": {"held": true} },
                    "cost": [ { "resource": "action" }, { "resource": "charges" } ],
                    "range": { "distance": 60 },
                    "target": { "count": 1, "who": { "pool": "any", "where": { "perceived": "sight" } } },
                    "delivery": { "save": { "ability": "ability:con", "dc": 15 } },
                    "outcomes": [ { "applyState": { "state": "condition:paralyzed",
                                                    "duration": { "amount": 1, "unit": "minute" },
                                                    "repeatSave": {} } } ] } ] }

// Divine Smite (SRD 5.1): a rider, so a trigger and a slot and no economy cost
{ "activities": [ { "key": "smite",
                    "trigger": { "event": "event:roll-resolved", "by": "self",
                                 "match": { "roll": "roll:attack", "success": true,
                                            "attack": { "range": "melee", "via": "weapon" } } },
                    "cost": [ { "resource": "spell-slots" } ],
                    "outcomes": [
                      { "damage": { "type": "damage-type:radiant", "amount":
                          { "dice": { "count": { "min": [ 5, { "sum": [ 1, { "slotLevel": true } ] } ] }, "die": 8 } } } },
                      { "damage": { "amount": "1d8", "type": "damage-type:radiant" },
                        "when": { "match": { "creatureType": [ "creature-type:undead",
                                                               "creature-type:fiend" ] } } } ] } ] }

// Spirit Guardians (SRD 5.1): a zone anchored to the caster
{ "activities": [ { "key": "cast", "action": "action:cast-a-spell", "cost": [ { "resource": "action" } ],
    "range": { "self": true }, "concentration": true,
    "duration": { "amount": 10, "unit": "minute", "upTo": true },
    "outcomes": [ { "to": "self", "zone": {
        "anchor": "self", "area": { "shape": "area-shape:emanation", "size": 15 },
        "affects": { "pool": "any", "chosen": "except" },
        "effects": [ { "type": "change", "set": { "speeds": { "$where": true, "speed": { "$multiply": 0.5 } } } } ],
        "on": [ { "on": [ { "event": "event:moved" }, { "event": "event:turn-start" } ],
                  "uses": { "max": 1, "recover": [ { "on": { "event": "event:turn-start", "subject": { "pool": "any" } }, "amount": "all" } ] },
                  "step": {
                    "delivery": { "save": { "ability": "ability:wis", "dc": { "spellcasting": "dc" } } },
                    "outcomes": [
                      { "damage": { "amount": { "dice": { "count": { "slotLevel": true }, "die": 8 } },
                                    "type": "damage-type:necrotic" },
                        "when": { "creature": "source", "where": { "alignment": "alignment:evil" } },
                        "otherwise": [ { "damage": { "amount": { "dice": { "count": { "slotLevel": true }, "die": 8 } },
                                                     "type": "damage-type:radiant" } } ] } ],
                    "otherwise": "half" } } ] } } ] } ] }

// Adult Red Dragon (SRD 5.1): a legendary pool, Legendary Resistance, a recharge breath
{ "legendary": { "actions": 3 },
  "blocks": [
    { "name": "Legendary Resistance (3/Day)", "activity": {
        "key": "legendary-resistance",
        "trigger": { "event": "event:roll-resolved", "by": "self",
                     "match": { "roll": "roll:save", "success": false } },
        "uses": { "max": 3, "recover": [ { "on": { "event": "event:dawn" }, "amount": "all" } ] },
        "outcomes": [ { "intercept": { "success": true } } ] } },
    { "name": "Fire Breath (Recharge 5–6)", "activity": {
        "key": "fire-breath", "cost": [ { "resource": "action" } ],
        "uses": { "max": 1, "recover": [ { "on": { "event": "event:turn-start", "subject": "self" },
                                           "amount": "all", "roll": { "die": 6, "min": 5 } } ] },
        "area": { "shape": "area-shape:cone", "size": 60 },
        "delivery": { "save": { "ability": "ability:dex", "dc": 21 } },
        "outcomes": [ { "damage": { "amount": "18d6", "type": "damage-type:fire" } } ],
        "otherwise": "half" } },
    { "name": "Wing Attack (Costs 2 Actions)", "activity": {
        "key": "wing-attack", "cost": [ { "resource": "legendary", "amount": 2 } ],
        "area": { "shape": "area-shape:emanation", "size": 10 },
        "delivery": { "save": { "ability": "ability:dex", "dc": 22 } },
        "outcomes": [ { "damage": { "amount": "2d6+8", "type": "damage-type:bludgeoning" } },
                      { "applyState": { "state": "condition:prone" } },
                      { "grant": { "movement": { "divide": "speeds.movement-mode:fly.speed", "by": 2, "round": "down" } },
                        "to": "self" } ] } } ] }
```

## Hard cases

| Case | Expressed as |
|---|---|
| Modifying other activities (metamagic, Potent Cantrip, Ritual Adept) | `change {of: {kind: "activity", where}, set}`; the filter uses the Activity atoms. A bonus to a damage roll (Empowered Evocation) is a change of the roll's `total` |
| Ignoring resistance (Boon of Irresistible Offense) | `bypass` |
| Substituting an ability (the 2024 Pact of the Blade, Shillelagh, monk weapons) | `ability-substitute`; the best eligible ability wins |
| Changing or rerolling the die (Halfling Lucky, Reliable Talent, GWF, Boon of Fate) | `die-mod`, or a change of the roll's `die`, for standing rules; `intercept` for a reaction that changes a roll already made |
| Damage that counts as magical or silvered | `counts-as` |
| Counting as a size larger for carrying capacity (Powerful Build) | `change` that doubles `carryingCapacity` |
| Transformations (Wild Shape, Polymorph, lycanthropy) | `applyState` of a state whose effects include `shapeshift {form, keep, hp}` |
| Summons that scale with spell level (2024 summon spells) | `summon {set}` with Values that use `{slotLevel: true}` |
| A choice made at use time (Chromatic Orb's damage type, a breath shape) | a `choose` where the pick goes: in `outcomes`, or in `damage.type` |
| Feature replacement (optional class features) | `replaces: Id` on the optional feature, with the swap recorded as a choice |
| A condition that lasts as long as another ("also Paralyzed while Poisoned in this way") | `applyState {while: <key of the sibling outcome>}` |
| Heavy armor's speed penalty, waived by Strength | a change of `speeds` with a `when` on the Strength score |
| Exhaustion levels (2014 table, 2024 −2 per level) | a state with `stacks: "levels"`, `maxLevel: 6`, and effects whose Values read `{stackLevel}` |
| Legendary Resistance | an activity triggered by the creature's own failed save, with `uses` and `intercept {success: true}` |
| A stored spell (Ring of Spell Storing, Glyph of Warding) | `cast {spell: {kind: "spell", where: {stored}}, stats: "original"}` |
| Forced movement (Thunderwave, telekinetic ray) | `move` |
| "Frightened of you", "grappled by the source" | the state records its `source`; its effects use `{creature: "source", …}` |
