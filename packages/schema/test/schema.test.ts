import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { checkEntity, check, declarationFor, pathsIn, storedPath } from '../src/index.ts'

const load = (name: string) => JSON.parse(readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8'))
const valid: { id: string }[] = load('valid.json')
const invalid: { why: string; entity: unknown }[] = load('invalid.json')

for (const entity of valid) {
  test(`valid: ${entity.id}`, () => {
    assert.deepEqual(checkEntity(entity), [])
  })
}

for (const { why, entity } of invalid) {
  test(`invalid: ${why}`, () => {
    assert.notDeepEqual(checkEntity(entity), [])
  })
}

test('a saved character: picks by the entity offering each choice, then its key', () => {
  const ilsa = load('character.json')
  assert.deepEqual(check('Character', ilsa), [])
  const broken = (change: (c: any) => void) => { const c = structuredClone(ilsa); change(c); return check('Character', c) }
  // Worked-out facts aren't saved, so they can't go stale.
  assert.notDeepEqual(broken((c) => { c.ac = 15 }), [])
  // A pick sits under the entity that offers the choice.
  assert.notDeepEqual(broken((c) => { c.species.chosen = { lineage: 'feature:elf/elven-lineage/high-elf@2024' } }), [])
  // A saved character holds answers, not choices.
  assert.notDeepEqual(broken((c) => { c.classes['class:wizard@2024'][1].hp = { choose: { key: 'hp', name: 'HP', from: [4, 6] } } }), [])
  assert.notDeepEqual(broken((c) => { c.inventory[2].contents[0].when = { spellcaster: true } }), [])
})

test('the per-declaration validators agree with the dispatching one', () => {
  for (const entity of valid) assert.deepEqual(check(declarationFor(entity.id)!, entity), [], entity.id)
})

test('patches: list operators and nested objects', () => {
  const patch = {
    source: { book: 'srd' },
    patches: [{ target: 'feature:barbarian/primal-path', set: {
      effects: { $append: [{ type: 'sense', sense: 'sense:darkvision', range: 60 }] },
      text: { plain: 'New text' },
      repeatable: true,
    } }],
  }
  assert.deepEqual(check('Patch', patch), [])
  assert.notDeepEqual(check('Patch', { ...patch, patches: [{ target: 'feature:x', set: { id: 'feature:y' } }] }), [])
  assert.notDeepEqual(check('Patch', { ...patch, patches: [{ target: 'feature:x', set: { choices: [1, 2] } }] }), [])
})

test('keyed maps reject keys outside their pattern', () => {
  const dragon = valid.find((e) => e.id === 'creature:adult-red-dragon')!
  assert.notDeepEqual(checkEntity({ ...dragon, abilities: { str: 27 } }), [])
  const barbarian = valid.find((e) => e.id === 'class:barbarian')!
  assert.notDeepEqual(checkEntity({ ...barbarian, levels: { first: [] } }), [])
})

test('problems point at the mistake', () => {
  const base = { id: 'feature:x', name: 'X', source: { book: 'srd' } }
  const first = (extra: object) => checkEntity({ ...base, ...extra })[0]
  assert.deepEqual(first({ effects: [{ type: 'heal-over-time' }] }).path, '/effects/0/type')
  assert.deepEqual(first({ activities: [{ key: 'x', activaton: {} }] }),
    { path: '/activities/0/activaton', message: 'unexpected field "activaton"' })
  assert.equal(first({ effects: [{ type: 'triggered', on: { event: 'event:hit' },
    step: { outcomes: [{ damage: { amount: '1d6', type: 'fire' } }] } }] }).path,
    '/effects/0/step/outcomes/0/damage/type')
})

test('match: fields are checked against the filtered kind', () => {
  const feat = (where: unknown) => ({ id: 'feat:test', name: 'Test', source: { book: 'srd' },
    effects: [{ type: 'proficiency', in: [{ kind: 'item', where }] }] })
  assert.deepEqual(checkEntity(feat({ match: { weapon: { properties: 'weapon-property:finesse' } } })), [])
  assert.deepEqual(checkEntity(feat({ not: { match: { weapon: { properties: ['weapon-property:heavy'] } } } })), [])
  assert.match(checkEntity(feat({ match: { weapon: { property: 'weapon-property:finesse' } } }))[0].message, /no field "property"/)
  assert.match(checkEntity(feat({ match: { school: 'spell-school:evocation' } }))[0].message, /no field "school"/)
  const spell = { id: 'feat:test', name: 'Test', source: { book: 'srd' },
    effects: [{ type: 'change', set: { ac: { $add: 1 } }, when: { spell: { kind: 'spell', where: { match: { level: { atLeast: 1 }, lists: { chosen: 'class' } } } } } }] }
  assert.deepEqual(checkEntity(spell), [])
  // Outside a filter, a match tests the creature in question's fields.
  const loose = (match: unknown) => ({ ...spell, effects: [{ type: 'change', set: { ac: { $add: 1 } }, when: { match } }] })
  assert.match(checkEntity(loose({ level: 1 }))[0].message, /no field "level"/)
  assert.deepEqual(checkEntity(loose({ creatureType: 'creature-type:beast', size: { atMost: { of: 'self', steps: 1 } }, tags: 'creature-tag:goblinoid' })), [])
})

test('change: fields are checked against the changed kind', () => {
  const feat = (of: unknown, set: unknown) => ({ id: 'feat:test', name: 'Test', source: { book: 'srd' },
    effects: [{ type: 'change', of, set }] })
  const strike = { kind: 'activity', where: { activity: 'rule:unarmed-strike' } }
  assert.deepEqual(checkEntity(feat(strike, { delivery: { attack: { reach: { $add: 5 } } } })), [])
  assert.deepEqual(checkEntity(feat(strike, { outcomes: { $where: { damage: true }, damage: { type: 'damage-type:force' } } })), [])
  assert.deepEqual(checkEntity(feat(strike, { cost: { $where: { resource: 'action' }, resource: 'bonus-action' } })), [])
  assert.match(checkEntity(feat(strike, { delivery: { attack: { rech: { $add: 5 } } } }))[0].message, /no field "rech" to change/)
  assert.match(checkEntity(feat(strike, { outcomes: { $where: { damag: true }, damage: { type: 'damage-type:force' } } }))[0].message, /no field "damag"/)
  assert.deepEqual(checkEntity(feat('spell:mage-hand', { components: { verbal: { $delete: true } } })), [])
  assert.match(checkEntity(feat('spell:mage-hand', { component: { verbal: { $delete: true } } }))[0].message, /no field "component"/)
  const item = { id: 'item:test', name: 'Test', source: { book: 'srd' }, effects: [{ type: 'change', of: 'this', set: { weapon: { properties: { $append: ['weapon-property:finesse'] } } } }] }
  assert.deepEqual(checkEntity(item).filter((p) => /change/.test(p.message)), [])
  const summon = (set: unknown) => ({ id: 'feat:test', name: 'Test', source: { book: 'srd' },
    activities: [{ key: 'call', outcomes: [{ summon: { creature: 'creature:wolf', set } }] }] })
  assert.deepEqual(checkEntity(summon({ hp: { average: { $add: 10 } } })), [])
  assert.match(checkEntity(summon({ hitPoints: { $add: 10 } }))[0].message, /no field "hitPoints"/)
})

test('a choice stands in any field, and each option is checked in its place', () => {
  const feat = (effects: unknown[]) => ({ id: 'feat:test', name: 'Test', source: { book: 'srd' }, effects })
  const choose = (from: unknown[], extra = {}) => ({ choose: { key: 'pick', name: 'Pick', from, ...extra } })
  const bypass = (x: unknown) => feat([{ type: 'bypass', resistance: [x] }])
  // A field that never declared a choice takes one.
  assert.deepEqual(checkEntity(bypass(choose(['damage-type:fire', 'damage-type:cold']))), [])
  assert.deepEqual(checkEntity(bypass(choose([{ kind: 'damage-type' }]))), [])
  // An option that doesn't fit the field is caught, as is a choice missing its own fields.
  assert.notDeepEqual(checkEntity(bypass(choose(['damage-type:fire', 'ability:str']))), [])
  assert.match(checkEntity(bypass({ choose: { key: 'pick', from: ['damage-type:fire'] } }))
    .map((p) => `${p.path} ${p.message}`).join('\n'), /\/effects\/0\/resistance\/0\/choose/)
  // A named group's items stand in a list together; a read of a single pick stands for its options.
  assert.deepEqual(checkEntity(feat([choose([{ name: 'Both', of: [{ type: 'defense', resist: ['damage-type:fire'] }, { type: 'defense', resist: ['damage-type:cold'] }] }])])), [])
  assert.deepEqual(checkEntity(feat([{ type: 'record', pick: choose(['damage-type:fire', 'damage-type:cold']) }, { type: 'bypass', resistance: [{ chosen: 'pick' }] }])), [])
  assert.notDeepEqual(checkEntity(feat([{ type: 'record', pick: choose(['damage-type:fire', 'ability:str']) }, { type: 'bypass', resistance: [{ chosen: 'pick' }] }])), [])
})

test('every id takes this, candidate, a group, or a filter of its kinds; a test also takes a list', () => {
  const feat = (effects: unknown[]) => ({ id: 'feat:test', name: 'Test', source: { book: 'srd' }, effects })
  const bypass = (x: unknown) => feat([{ type: 'bypass', resistance: [x] }])
  const when = (w: unknown) => feat([{ type: 'change', set: { ac: { $add: 1 } }, when: w }])
  assert.deepEqual(checkEntity(bypass('group:physical-damage')), [])
  assert.deepEqual(checkEntity(bypass({ kind: 'damage-type', where: { not: { is: 'damage-type:fire' } } })), [])
  // A filter of another kind doesn't fit.
  assert.notDeepEqual(checkEntity(bypass({ kind: 'ability' })), [])
  assert.deepEqual(checkEntity(when({ has: 'this', match: { held: true } })), [])
  assert.deepEqual(checkEntity(when({ has: ['feat:alert', 'feat:lucky'] })), [])
  // A list is a test's: outside one, an id field holds one id.
  assert.notDeepEqual(checkEntity(feat([{ type: 'damage-bonus', amount: 1, damageType: ['damage-type:fire', 'damage-type:cold'] }])), [])
  // `candidate` only means something inside a `where`.
  assert.deepEqual(checkEntity(feat([{ type: 'proficiency', in: [{ kind: 'skill', where: { not: { proficient: 'candidate' } } }] }])), [])
  assert.match(checkEntity(when({ has: 'candidate' })).map((p) => p.message).join(), /inside a `where`/)
  // A read of a pick stands in any field, including a whole list.
  assert.deepEqual(checkEntity(feat([{ type: 'spell-access', how: 'known', spells: { chosen: 'spells', from: 'feat:magic-initiate' } }])), [])
})

test('every list item takes when and key; tests and numbers are not list items', () => {
  const feat = (x: object) => ({ id: 'feat:test', name: 'Test', source: { book: 'srd' }, ...x })
  const activity = (cost: unknown[]) => feat({ activities: [{ key: 'go', cost, outcomes: [{ heal: { amount: 1 } }] }] })
  assert.deepEqual(checkEntity(activity([{ resource: 'ki', when: { has: 'feat:alert' } }])), [])
  assert.deepEqual(checkEntity(feat({ effects: [{ type: 'sense', sense: 'sense:darkvision', range: 60, key: 'dark', when: { has: 'feat:alert' } }] })), [])
  assert.notDeepEqual(checkEntity(feat({ effects: [{ type: 'change', set: { ac: { $add: 1 } }, when: { all: [{ has: 'feat:alert', when: { has: 'feat:lucky' } }] } }] })), [])
})

test('a number in a rule can be computed, and a plain one still meets its limits', () => {
  const feat = (effects: unknown[]) => ({ id: 'feat:test', name: 'Test', source: { book: 'srd' }, effects })
  assert.deepEqual(checkEntity(feat([{ type: 'die-mod', times: 'proficiencyBonus' }])), [])
  assert.deepEqual(checkEntity(feat([{ type: 'die-mod', times: { times: 'proficiencyBonus', by: 2 } }])), [])
  assert.notDeepEqual(checkEntity(feat([{ type: 'die-mod', times: 1 }])), [])
})

test('the paths a rule reads are found by the schema, and a stored field supplies one', () => {
  const feat = { id: 'feat:test', name: 'Test', source: { book: 'srd' }, effects: [
    { type: 'change', set: { ac: { $add: { max: [1, 'modifiers.ability:wis'] } } }, when: { compare: 'target.speeds.movement-mode:fly.speed', atLeast: 10 } },
    { type: 'change', of: 'this', set: { range: { $replace: 'levels.total' }, rounding: 'up' } },
  ] }
  assert.deepEqual([...pathsIn(feat)].sort(), ['levels.total', 'modifiers.ability:wis', 'target.speeds.movement-mode:fly.speed'])
  assert.equal(storedPath('target.speeds.movement-mode:fly.speed', feat), true)
  assert.equal(storedPath('hp.current', feat), true)
  assert.equal(storedPath('modifiers.ability:wis', feat), false)
})
