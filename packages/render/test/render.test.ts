import { test } from 'node:test'
import assert from 'node:assert/strict'
import { renderer } from '../src/index.ts'

const names: Record<string, string> = {
  'ability:dex': 'Dexterity', 'ability:str': 'Strength', 'roll:attack': 'Attack Roll', 'condition:prone': 'Prone',
  'condition:incapacitated': 'Incapacitated', 'skill:athletics': 'Athletics', 'skill:acrobatics': 'Acrobatics',
  'restriction:attack': 'Attack', 'action:help': 'Help', 'group:maneuver@2024': 'Maneuver', 'group:gaming-set': 'Gaming Set',
  'group:light-armor': 'Light Armor', 'group:shield': 'Shield', 'group:martial-weapon': 'Martial Weapon', 'weapon-property:light': 'Light',
  'damage-type:acid': 'Acid', 'ability:cha': 'Charisma', 'feature:dragonborn/draconic-ancestry': 'Draconic Ancestry',
  'event:rest-finished': 'Rest Finished', 'rest:long': 'Long Rest',
}
const r = renderer((id) => names[id] ?? id)

test('roll modifiers read from the holder, or from the attacker for rolls against it', () => {
  assert.equal(r.effect({ type: 'roll-mod', mode: 'advantage', when: { event: 'event:roll-made', by: 'self', match: { roll: 'roll:save', ability: 'ability:dex' } } }),
    'You have advantage on Dexterity saving throws.')
  assert.equal(r.effect({ type: 'roll-mod', mode: 'advantage', when: { event: 'event:roll-made', by: { pool: 'any', where: { within: 5 } }, subject: 'self', match: { roll: 'roll:attack' } } }),
    'Attack rolls against you by attackers within 5 feet of you have advantage.')
})

test('a state\'s source reads as the book names it', () => {
  const [line] = r.entity({ sourceName: 'the charmer', effects: [{ type: 'forbid', restriction: ['restriction:attack'], target: 'source' }] })
  assert.equal(line, 'You can\'t attack the charmer.')
})

test('an applied state speaks from its holder; its source is whoever acted', () => {
  const help = {
    key: 'help-attack', action: 'action:help', cost: [{ resource: 'action' }],
    target: { count: 1, who: { pool: 'enemy', where: { within: 5 } } },
    outcomes: [{ applyState: { state: { effects: [{ type: 'roll-mod', mode: 'advantage',
      when: { event: 'event:roll-made', by: { pool: 'ally', of: 'source' }, subject: 'self', match: { roll: 'roll:attack' } } }] },
      ends: [{ event: 'event:turn-start', subject: 'source' }] } }],
  }
  assert.equal(r.activity(help), 'As an action (the Help action), choose an enemy within 5 feet of you. '
    + 'Until the start of your next turn, attack rolls against it by allies of yours have advantage.')
})

test('constructs the renderer doesn\'t cover show as placeholders', () => {
  assert.match(r.effect({ type: 'shapeshift', form: 'creature:wolf' }), /^\[shapeshift\]$/)
})

test('a choice stands where its pick goes and reads in place', () => {
  assert.deepEqual(r.entity({ features: [{ choose: { key: 'maneuvers', name: 'Maneuvers', count: { byLevel: { 3: 3, 7: 5 }, of: 'class:fighter' },
    from: [{ kind: 'feature', where: { group: 'group:maneuver@2024' } }] } }],
  activities: [{ key: 'replace-maneuvers', name: 'Replace Maneuvers', trigger: { event: 'event:level-gained', match: { gives: { picks: 'maneuvers' } } }, outcomes: [{ replace: { choice: 'maneuvers' } }] }] }),
  ['Replace Maneuvers. When you gain a level that gives you more Maneuvers choices, you can choose to replace one of your Maneuvers choices with another.',
    'Maneuvers: Choose (3 at class:fighter level 3 and 5 at 7) Maneuvers.'])
  assert.equal(r.effect({ type: 'proficiency', in: [{ choose: { key: 'gaming-set', name: 'Gaming Set', from: [{ kind: 'item', where: { group: 'group:gaming-set' } }] } }] }),
    'You gain proficiency with one gaming set of your choice.')
  assert.equal(r.effect({ type: 'change', set: { abilities: { $at: { choose: { key: 'ability', name: 'Ability Score Increase', from: ['ability:str', 'ability:dex'] } }, $add: { amount: 1, upTo: 20 } } } }),
    'One ability score of your choice (Strength or Dexterity) increases by 1, to a maximum of 20.')
})

test('a choice between groups names each group', () => {
  const plus = (a: string) => ({ type: 'change', set: { abilities: { [a]: { $add: 1 } } } })
  assert.equal(r.effect({ choose: { key: 'scores', name: 'Ability Scores', from: [
    { name: '+1 to both', of: [plus('ability:str'), plus('ability:dex')] },
    { name: '+2 to Strength', of: [{ type: 'change', set: { abilities: { 'ability:str': { $add: 2 } } } }] }] } }),
  'Ability Scores: Choose one of: +1 to both (Your Strength score increases by 1. Your Dexterity score increases by 1.); or +2 to Strength (Your Strength score increases by 2.).')
})

test('proficiency reads groups and item filters as plural nouns', () => {
  assert.equal(r.effect({ type: 'proficiency', in: ['group:light-armor', 'group:shield'] }), 'You gain proficiency with light armor and shields.')
  assert.equal(r.effect({ type: 'proficiency', in: [{ kind: 'item', where: { all: [{ group: 'group:martial-weapon' }, { match: { weapon: { properties: 'weapon-property:light' } } }] } }] }),
    'You gain proficiency with martial weapons that have the Light property.')
})

test('a picked entity\'s values are read by other features', () => {
  const pick = { chosen: 'ancestry', value: 'damage-type', from: 'feature:dragonborn/draconic-ancestry' }
  assert.equal(r.effect({ type: 'defense', resist: [pick] }), 'You have resistance to the damage type of your Draconic Ancestry.')
  assert.equal(r.effect({ type: 'change', of: 'event', set: { total: { $add: 'modifiers.ability:cha' } },
    when: { all: [{ event: 'event:roll-made', by: 'self', match: { roll: 'roll:damage', spell: { kind: 'spell' } } }, { dealsDamage: pick }] } }),
  'When you cast a spell that deals damage of the type of your Draconic Ancestry, you add your Charisma modifier to its damage.')
})

test('a recorded pick drives no rule but shows', () => {
  assert.equal(r.effect({ type: 'record', pick: { choose: { key: 'season', name: 'Season', from: [{ name: 'Spring' }, { name: 'Summer' }, { name: 'Winter' }] } } }),
    'Season: Choose one of Spring, Summer, or Winter.')
})


test('a trigger on a test turning true, a value that depends on a test, and the events a rule sets off', () => {
  const half = { compare: 'hp.current', atMost: { times: 'hp.max', by: 0.5 } }
  assert.equal(r.entity({ ends: [{ becomes: { not: half }, subject: 'self' }] })[0],
    'It ends as soon as it is no longer true that you have half of your hit points or fewer.')
  assert.equal(r.value({ if: { has: 'feature:dragonborn/draconic-ancestry' }, then: 2, else: 1 }),
    '2 if you have Draconic Ancestry, or else 1')
  assert.equal(r.activity({ key: 'take', name: 'Take a Long Rest', time: { amount: 8, unit: 'hour' },
    emits: [{ event: 'event:rest-finished', at: 'finished', subject: 'self', fields: { rest: 'rest:long' } }] }),
  'It takes 8 hours. When it finishes, the Rest Finished event happens (rest: long rest).')
})
