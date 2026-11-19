import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { load as loadDirs, workOut, type Character } from '../src/index.ts'
import { bundleDir } from '../scripts/bundles.ts'

// Each character here is checked by hand against the SRD; the numbers are the sheet's.
const load = (codes: string[]) => loadDirs(codes.map(bundleDir))
const character = (name: string) => JSON.parse(readFileSync(new URL(`./characters/${name}.json`, import.meta.url), 'utf8')) as Character

const ilsa = character('ilsa')
const out = workOut(load(ilsa.bundles as string[]), ilsa)

test('levels are counted per class and in all', () => {
  assert.equal(out.read('levels.class:wizard'), 4)
  assert.equal(out.read('levels.class:fighter@2024'), 1)
  assert.equal(out.read('levels.total'), 5)
})

test('features come from the species, background, classes, and picks', () => {
  const from = (id: string) => out.gained.find((g) => g.id === id)?.from
  assert.equal(from('feature:elf/elven-lineage/high-elf@2024'), 'feature:elf/elven-lineage@2024')
  assert.equal(from('feat:ability-score-improvement@2024'), 'feature:wizard/ability-score-improvement@2024')
  assert.equal(from('feature:wizard/proficiencies@2024'), 'class:wizard@2024 as the first class')
  assert.equal(from('feature:fighter/proficiencies@2024'), undefined)
  // The subclass is picked at Wizard level 3 and gives its features up to Wizard level 4.
  assert.equal(from('subclass:wizard/evoker@2024'), 'feature:wizard/wizard-subclass@2024')
  assert.ok(out.gained.some((g) => g.from === 'subclass:wizard/evoker@2024 level 3'))
  assert.ok(!out.gained.some((g) => g.from === 'subclass:wizard/evoker@2024 level 6'))
  assert.deepEqual(out.picks, [])
})

test('ability scores take the background\'s and the feat\'s increases', () => {
  // Int 15, +2 from Sage, +1 from Ability Score Improvement; Con 14, +1 from Sage; Wis 10, +1 from Ability Score Improvement.
  assert.deepEqual(out.read('abilities'), { 'ability:str': 8, 'ability:dex': 15, 'ability:con': 15, 'ability:int': 18, 'ability:wis': 11, 'ability:cha': 12 })
})

test('the core rules compute modifiers and the proficiency bonus', () => {
  assert.deepEqual(out.read('modifiers'), { 'ability:str': -1, 'ability:dex': 2, 'ability:con': 2, 'ability:int': 4, 'ability:wis': 0, 'ability:cha': 1 })
  assert.equal(out.read('proficiencyBonus'), 3)
})

test('the hit point maximum is each level\'s hit points plus the Constitution modifier', () => {
  // Wizard 6, 4, 4, 4 and Fighter 6, each +2.
  assert.equal(out.read('hp.max'), 34)
  const frail = { ...ilsa, abilities: { ...ilsa.abilities, 'ability:con': 1 }, classes: { 'class:wizard@2024': [{ hp: 6 }, { hp: 1 }, { hp: 4 }] } }
  // Constitution 1, +1 from Sage, is -4: 2, then the 2024 minimum of 1, then 1.
  assert.equal(workOut(load(ilsa.bundles as string[]), frail).read('hp.max'), 4)
})

test('armor class starts from worn armor or 10 + Dexterity, and a held shield adds 2', () => {
  const again = (inventory: unknown[]) => workOut(load(ilsa.bundles as string[]), { ...ilsa, inventory }).read('ac')
  assert.equal(out.read('ac'), 14) // studded leather, 12 + Dex 2; the shield is carried, not held
  assert.equal(again([]), 12)
  assert.equal(again([{ item: 'item:studded-leather@2024' }]), 12) // carried, not worn
  assert.equal(again([{ item: 'item:studded-leather@2024', worn: true }, { item: 'item:shield@2024', held: true }]), 16)
  assert.equal(again([{ item: 'item:half-plate@2024', worn: true }]), 17) // 15 + Dex, at most 2
  assert.equal(again([{ item: 'item:chain-mail@2024', worn: true }]), 16)
})

test('a roll adds what every rule about it adds: saving throws and skill checks', () => {
  // Proficient in Intelligence and Wisdom saves (Wizard, the first class), bonus 3.
  assert.equal(out.roll({ roll: 'roll:save', ability: 'ability:int' }).total, 7)
  assert.equal(out.roll({ roll: 'roll:save', ability: 'ability:wis' }).total, 3)
  assert.equal(out.roll({ roll: 'roll:save', ability: 'ability:dex' }).total, 2)
  // Arcana: Sage's proficiency, doubled by Scholar's expertise. History: Sage's. Perception: Keen Senses.
  assert.equal(out.roll({ roll: 'roll:check', ability: 'ability:int', skill: 'skill:arcana' }).total, 10)
  assert.equal(out.roll({ roll: 'roll:check', ability: 'ability:int', skill: 'skill:history' }).total, 7)
  assert.equal(out.roll({ roll: 'roll:check', ability: 'ability:wis', skill: 'skill:perception' }).total, 3)
  assert.equal(out.roll({ roll: 'roll:check', ability: 'ability:dex', skill: 'skill:stealth' }).total, 2)
  assert.equal(out.roll({ roll: 'roll:initiative', ability: 'ability:dex' }).total, 2)
  assert.equal(out.read('proficiencies.skill:arcana'), 2)
  assert.equal(out.read('proficiencies.language:elvish'), 1)
  assert.equal(out.read('proficiencies.group:simple-weapon'), 1)
})

test('each source of spellcasting gets its save DC and attack bonus from its ability', () => {
  // Wizard: Intelligence +4, proficiency bonus 3.
  assert.equal(out.read('spellcasting.class:wizard.ability'), 'ability:int')
  assert.equal(out.read('spellcasting.class:wizard.dc'), 15)
  assert.equal(out.read('spellcasting.class:wizard.attack'), 7)
  assert.equal(out.read('spellcasting.class:wizard.prepared'), 7)
  assert.equal(out.read('spellcasting.class:wizard.cantrips'), 4)
  assert.equal(out.read('spellcasting.class:wizard.casterLevel'), 4)
})

test('pools have a maximum from their rule and what is left after what was spent', () => {
  const spent = workOut(load(ilsa.bundles as string[]), { ...ilsa, spent: { 'second-wind': 1 } })
  assert.equal(spent.read('pools.second-wind.max'), 2) // Fighter 1
  assert.equal(spent.read('pools.second-wind.current'), 1)
  assert.equal(out.read('pools.second-wind.current'), 2)
  assert.equal(out.read('pools.arcane-recovery.max'), 1)
})

test('spell slots come from the one casting class\'s table, or the multiclass table at the summed caster level', () => {
  const slots = (o: ReturnType<typeof workOut>) => [1, 2, 3].map((n) => o.read(`pools.spell-slot-${n}.max`))
  assert.deepEqual(slots(out), [4, 3, 0]) // Wizard 4; the Fighter level isn't a caster's
  const two = workOut(load(ilsa.bundles as string[]), { ...ilsa, classes: { ...ilsa.classes, 'class:cleric@2024': [{ hp: 5 }] } })
  assert.deepEqual(slots(two), [4, 3, 2]) // Wizard 4 and Cleric 1: a level 5 spellcaster
  assert.equal(two.read('spellcasting.class:cleric.dc'), 11) // Wisdom +0, proficiency bonus 3 at level 6
})

test('an increase stops at its cap', () => {
  const capped = { ...ilsa, abilities: { ...ilsa.abilities, 'ability:int': 19 } }
  assert.equal(workOut(load(ilsa.bundles as string[]), capped).read('abilities.ability:int'), 20)
})

test('what the engine can\'t evaluate is left out and listed', () => {
  // The carrying rule slows a creature moving more than it can carry, a test still written in words.
  assert.deepEqual(out.read('speeds'), { 'movement-mode:walk': { speed: 30 } })
  assert.ok(out.unevaluated.some((n) => n.id === 'rule:carrying-capacity@2024' && n.message.includes('still in words')))
})

test('a rule applies by the edition of the bundles that ship it', () => {
  const both = workOut(load(['core', 'srd', 'srd24']), ilsa)
  const rules = both.gained.filter((g) => g.from === 'rules').map((g) => g.id)
  assert.ok(rules.includes('rule:advantage@2024'))
  assert.ok(!rules.includes('rule:advantage-and-disadvantage'), 'the 2014 rule that 2024 split in two')
  assert.ok(!rules.includes('rule:shoving'), 'a 2014 rule that 2024 dropped')
  assert.ok(rules.includes('rule:ability-checks'), 'a shared rule, from a bundle with no edition')
  assert.ok(rules.includes('rule:proficiency-bonus'), 'a rule both SRDs ship')
  assert.equal(both.read('proficiencyBonus'), 3)
})

test('a weapon gives one attack by rule, which its kind and properties change; a magic weapon adds its bonus, and an item keeps its own charges', () => {
  const carrier = { id: '7b0e9d0c-1111-4222-8333-444455556666', name: 'Carrier', bundles: ['core', 'srd24'],
    abilities: { 'ability:str': 14, 'ability:dex': 16, 'ability:con': 10, 'ability:int': 10, 'ability:wis': 10, 'ability:cha': 10 },
    classes: {}, hp: { current: 1, temp: 0 },
    inventory: [
      { item: 'item:wand-of-magic-missiles@2024', held: true, spent: { charges: 3 } },
      { item: 'item:weapon-1', chosen: { 'item:weapon-1': { base: 'item:longsword@2024' } }, held: true },
      { item: 'item:dagger@2024' },
    ] } as unknown as Character
  const got = workOut(load(carrier.bundles as string[]), carrier)
  const line = (name: string) => {
    const a = got.attacks().find((x) => x.name === name)!
    return `${a.ability} ${a.toHit.total} ${a.damage[0].amount} ${a.damage[0].bonus.total} ${a.damage[0].type}`
  }
  // No class, so no proficiency: Strength +2 and the weapon's +1
  assert.equal(line('Weapon, +1: Attack'), 'ability:str 3 1d8 3 damage-type:slashing')
  assert.equal(line('Weapon, +1: Attack (Versatile)'), 'ability:str 3 1d10 3 damage-type:slashing')
  // A Finesse weapon uses the better of Strength and Dexterity, thrown as well
  assert.equal(line('Dagger: Attack'), 'ability:dex 3 1d4 3 damage-type:piercing')
  assert.equal(got.attacks().find((x) => x.name === 'Dagger: Attack')!.range, 'melee-or-ranged', 'Thrown changes the one attack; it adds none')
  assert.deepEqual(got.items()[0].pools, { charges: { max: 7, spent: 3, current: 4 } })
})
