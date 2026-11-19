import { test } from 'node:test'
import assert from 'node:assert/strict'
import { load, enableRules, type CatalogEntry } from '../src/index.ts'

const dir = (b: string) => new URL(`./fixtures/bundles/${b}`, import.meta.url).pathname
const catalog = load(['core', 'ext', 'brew'].map(dir))
const codes = (code: string) => catalog.findings.filter((f) => f.code === code)

test('identical reprints collapse silently', () => {
  const e = catalog.entries.get('spell:fire-bolt')!
  assert.deepEqual(e.bundles, ['core', 'ext'])
  assert.equal(codes('reprint-override').some((f) => f.id === 'spell:fire-bolt'), false)
})

test('a differing reprint: the later release wins, and the override is reported', () => {
  const e = catalog.entries.get('feature:a')!
  assert.equal(e.bundle, 'ext')
  assert.deepEqual(codes('reprint-override').map((f) => f.id), ['feature:a'])
})

test('supersedes repoints references to the survivor', () => {
  const b = catalog.entries.get('feature:b')!
  assert.deepEqual(b.entity.requires, { has: 'feat:new-name' })
  assert.equal(catalog.aliases.get('feat:old-name'), 'feat:new-name')
})

test('patches apply, skip missing targets, and refuse invalid results', () => {
  const a = catalog.entries.get('feature:a')!.entity.effects as unknown[]
  assert.equal(a.length, 2)
  assert.deepEqual(codes('patch-target-missing').map((f) => f.id), ['feature:not-loaded'])
  assert.deepEqual(codes('patch-invalid').map((f) => f.id), ['feature:b'])
  assert.equal(catalog.entries.get('feature:b')!.entity.effects, undefined)
})

test('a missing vocabulary term is an error; missing content dangles', () => {
  assert.deepEqual(codes('missing-vocabulary').map((f) => f.message), ['/effects/0/resist/0: damage-type:psychic doesn\'t exist in the loaded bundles'])
  assert.deepEqual(codes('dangling-reference').map((f) => f.id), ['feature:c'])
})

test('invalid entities are left out; the rest of the bundle loads', () => {
  assert.deepEqual(codes('invalid-entity').map((f) => f.id), ['feature:broken'])
  assert.equal(catalog.entries.has('feature:broken'), false)
  assert.equal(catalog.entries.has('feature:uses-core'), true)
})

test('requirements: an unmet anyOf warns, and references outside the declared scope are undeclared', () => {
  assert.deepEqual(codes('missing-requirement').map((f) => f.bundle), ['brew'])
  assert.deepEqual(codes('undeclared-dependency').map((f) => f.id), ['feature:uses-core'])
})

test('nothing else is reported', () => {
  const expected = new Set(['reprint-override', 'patch-target-missing', 'patch-invalid', 'missing-vocabulary',
    'dangling-reference', 'invalid-entity', 'missing-requirement', 'undeclared-dependency',
    'override-invalid', 'override-not-optional'])
  assert.deepEqual(catalog.findings.filter((f) => !expected.has(f.code)), [])
})

test('wording-only differences: the book wording beats the SRD wording, reported as info', () => {
  const c = load(['core', 'srd-copy'].map(dir))
  assert.equal(c.entries.get('spell:fire-bolt')!.bundle, 'core')
  assert.deepEqual(c.findings.filter((f) => f.code === 'reprint-wording').map((f) => f.severity), ['info'])
})

test('a book beats a differing copy in the SRD it requires, though the SRD is newer', () => {
  for (const order of [['core', 'srd-copy', 'book'], ['core', 'book', 'srd-copy']]) {
    const c = load(order.map(dir))
    assert.equal(c.entries.get('spell:fire-bolt')!.bundle, 'book')
  }
})

test('optional rules: overrides are checked at load and applied only when the rule is on', () => {
  assert.deepEqual(codes('override-invalid').map((f) => f.id), ['rule:bad-variant'])
  assert.deepEqual(codes('override-not-optional').map((f) => f.id), ['rule:not-optional'])
  const effects = (entries: Map<string, CatalogEntry>) => (entries.get('feature:a')!.entity.effects as unknown[]).length
  assert.equal(effects(catalog.entries), 2)
  assert.equal(effects(enableRules(catalog, ['rule:variant'])), 3)
  assert.equal(effects(catalog.entries), 2, 'the catalog itself is unchanged')
  assert.throws(() => enableRules(catalog, ['rule:not-optional']))
})

test('optional rules: what an optional rule defines is left out while it is off', () => {
  assert.equal(enableRules(catalog, []).has('feature:variant-only'), false)
  assert.equal(enableRules(catalog, ['rule:variant']).has('feature:variant-only'), true)
})

test('a patch edits one element of a keyed list by its key, a choice by its choose key', async () => {
  const { applyPatch } = await import('../src/patch.ts')
  const feature = { id: 'feature:paladin/fighting-style', features: [
    { choose: { key: 'style', name: 'Fighting Style', from: ['feature:defense', 'feature:dueling'] } },
    'feature:x',
  ], activities: [{ key: 'a', name: 'A' }, { key: 'b', name: 'B' }] }
  const out = applyPatch(feature, { features: { style: { from: { $append: ['feature:brew-style'] } } }, activities: { b: { name: 'Bee' } } })
  assert.deepEqual(out.features, [
    { choose: { key: 'style', name: 'Fighting Style', from: ['feature:defense', 'feature:dueling', 'feature:brew-style'] } },
    'feature:x',
  ])
  assert.deepEqual(out.activities, [{ key: 'a', name: 'A' }, { key: 'b', name: 'Bee' }])
  assert.deepEqual(feature.features[0], { choose: { key: 'style', name: 'Fighting Style', from: ['feature:defense', 'feature:dueling'] } })
})

test('a patch edits numbers, time spans, and the list elements a pattern picks', async () => {
  const { applyPatch } = await import('../src/patch.ts')
  const attack = { key: 'attack', cost: [{ resource: 'action' }], outcomes: [{ runs: [{ activity: { kind: 'activity' }, times: 1 }] }, { damage: { amount: 1, type: 'damage-type:bludgeoning' } }] }
  const out = applyPatch(attack, {
    cost: { $where: { resource: 'action' }, resource: 'bonus-action' },
    outcomes: { $where: { runs: true }, runs: { $where: { times: { atMost: 1 } }, times: { $atLeast: 2 } } },
  })
  assert.deepEqual(out.cost, [{ resource: 'bonus-action' }])
  assert.deepEqual((out.outcomes as any)[0], { runs: [{ activity: { kind: 'activity' }, times: 2 }] })
  assert.deepEqual((out.outcomes as any)[1], attack.outcomes[1], 'an element the pattern misses is unchanged')
  const typed = applyPatch(attack, { outcomes: { $where: { damage: true }, damage: { type: 'damage-type:force' } } })
  assert.equal((typed.outcomes as any)[1].damage.type, 'damage-type:force')
  assert.equal((typed.outcomes as any)[1].damage.amount, 1)
  const spell = { time: { amount: 1, unit: 'minute' }, cost: [{ resource: 'action' }, { spellSlot: { min: 1 } }], range: { touch: true } }
  const ritual = applyPatch(spell, { time: { $add: { amount: 10, unit: 'minute' } }, cost: { $remove: { spellSlot: true } }, range: { $replace: { distance: 60 } } })
  assert.deepEqual(ritual, { time: { amount: 11, unit: 'minute' }, cost: [{ resource: 'action' }], range: { distance: 60 } })
  assert.deepEqual(applyPatch({ reach: 5 }, { reach: { $add: 5 }, bonus: { $add: 2 } }), { reach: 10, bonus: 2 }, 'a missing number counts as 0')
  const creature = { speeds: { 'movement-mode:walk': { speed: 30 }, 'movement-mode:fly': { speed: 60, hover: true } }, abilities: { 'ability:str': 10 } }
  assert.deepEqual(applyPatch(creature, { speeds: { $where: true, speed: { $add: 10 } } }).speeds,
    { 'movement-mode:walk': { speed: 40 }, 'movement-mode:fly': { speed: 70, hover: true } }, '$where: true edits every entry of a map')
  assert.deepEqual((applyPatch(creature, { speeds: { $where: { hover: true }, speed: { $multiply: 2 } } }).speeds as any)['movement-mode:fly'], { speed: 120, hover: true })
  assert.deepEqual(applyPatch(creature, { abilities: { $at: 'ability:str', $add: 2 } }).abilities, { 'ability:str': 12 }, '$at edits the entry by its key')
  const pick = { abilities: { $at: { choose: { key: 'ability', from: ['ability:str', 'ability:dex'] } }, $add: 1 } }
  assert.deepEqual(applyPatch(creature, pick), creature, 'an entry picked in play is left for play')
  assert.deepEqual(applyPatch({ str: 19, dex: 21, hp: 10 }, { str: { $add: { amount: 2, upTo: 20 } }, dex: { $add: { amount: 2, upTo: 20 } }, hp: { $subtract: 3 } }),
    { str: 20, dex: 21, hp: 7 }, 'a capped add stops at the cap and never lowers')
  assert.deepEqual(applyPatch({ times: 3 }, { times: { $atLeast: 2 } }), { times: 3 }, 'two Extra Attacks don\'t stack')
})

test('a reference a patch adds is checked against the patching bundle\'s dependencies', () => {
  assert.deepEqual(catalog.entries.get('feature:core-only')!.entity.requires, { has: 'feat:new-name' })
  assert.equal(codes('undeclared-dependency').some((f) => f.id === 'feature:core-only'), false)
})

test('an untagged reference means either edition; the preferred one when both are loaded', async () => {
  const { resolve, matches } = await import('../src/index.ts')
  const both = load(['ed14', 'ed24', 'edition-user'].map(dir))
  assert.equal(resolve(both, 'feature:thing')!.entity.id, 'feature:thing@2024', '2024 when unset')
  assert.equal(resolve(load(['ed14', 'ed24'].map(dir), { prefer: '2014' }), 'feature:thing')!.entity.id, 'feature:thing')
  assert.equal(resolve(both, 'feature:thing@2014')!.entity.id, 'feature:thing', '@2014 pins the untagged entity')
  assert.equal(resolve(both, 'feature:thing@2024')!.entity.id, 'feature:thing@2024')
  assert.equal(matches('feature:thing', 'feature:thing@2024'), true)
  assert.equal(matches('feature:thing', 'feature:thing'), true)
  assert.equal(matches('feature:thing@2014', 'feature:thing@2024'), false)
})

test('edition checks: either version satisfies an untagged reference; pins and lists of parts are exact', () => {
  const c = load(['ed24', 'edition-user'].map(dir))
  const ids = (code: string) => c.findings.filter((f) => f.code === code).map((f) => f.id).sort()
  assert.deepEqual(ids('dangling-reference'), ['feature:parts', 'feature:pins-2014'])
  assert.deepEqual(ids('undeclared-dependency'), [])
  assert.deepEqual(ids('invalid-entity'), ['feature:bad@2014'])
  assert.equal(c.entries.has('feature:rule-ref'), true)
})

test('what a rule reaches into must be there: its own edition\'s patched parts, named values, activity keys, event fields', async () => {
  const { reachProblems } = await import('../src/index.ts')
  const entity = (id: string, rest: object) => [id, { entity: { id, name: id, source: { book: 'x' }, ...rest } } as CatalogEntry] as const
  const c = { aliases: new Map(), entries: new Map([
    entity('rule:strike', { activities: [{ key: 'unarmed-strike', outcomes: [{ damage: { amount: 1 } }] }] }),
    entity('rule:strike@2024', { activities: [{ key: 'damage', outcomes: [{ damage: { amount: 1 } }] }] }),
    entity('rule:jump@2024', { values: { 'long-jump': 10 } }),
    entity('event:roll-made', { payload: ['total'] }),
    entity('condition:prone', { activities: [{ key: 'stand-up', cost: [{ resource: 'movement' }] }] }),
  ]) }
  const rules = [
    { type: 'change', of: 'rule:strike', set: { activities: { 'unarmed-strike': { outcomes: { $where: { damage: true }, damage: { type: 't' } } } } } },
    { type: 'change', of: 'rule:strike', set: { activities: { $where: { key: 'unarmed-strike' }, reach: 10 } } },
    { type: 'change', of: { kind: 'activity', where: { all: [{ activity: 'condition:prone' }, { match: { key: 'stand-up' } }] } }, set: { cost: { $where: { resource: 'action' }, amount: 5 } } },
    { type: 'change', of: { kind: 'activity', where: { activity: 'stand-up' } }, set: { reach: 5 } },
    { type: 'change', of: { kind: 'activity', where: { activity: 'stand-upp' } }, set: { reach: 5 } },
    { type: 'change', of: 'rule:jump', set: { values: { 'running-start': { $atLeast: 5 } } } },
    { type: 'change', of: 'rule:jump', set: { values: { 'long-jump': { $add: 5 } } } },
    { type: 'change', of: 'event', set: { total: { $add: 1 }, faces: { $add: 1 } }, when: { event: 'event:roll-made' } },
  ]
  const found = (id: string) => reachProblems(c, { id, name: 'x', source: { book: 'x' }, effects: rules }).map((p) => p.path)
  assert.deepEqual(found('feat:x'), ['/effects/2/set/cost/$where', '/effects/4/of/where/activity', '/effects/5/set/values/running-start', '/effects/7/set/faces'])
  assert.deepEqual(found('feat:x@2024'), ['/effects/0/set/activities/unarmed-strike', '/effects/1/set/activities/$where',
    '/effects/2/set/cost/$where', '/effects/4/of/where/activity', '/effects/5/set/values/running-start', '/effects/7/set/faces'], 'a 2024 rule reaches the 2024 strike')
})

test('a loaded rule supplies the paths it computes: its pools, and fields a change gives a base or sets outright', async () => {
  const { suppliedPaths, supplies } = await import('../src/supplied.ts')
  const computed = suppliedPaths([
    { effects: [{ type: 'resource', key: 'ki', max: 2, die: 'd6', recover: [] }] },
    { activities: [{ key: 'innate-sorcery', uses: { max: 2 } }] },
    { effects: [{ type: 'change', set: { sanity: { $replace: 10 }, ac: { $add: 1 }, jump: { $base: 3 }, spellcasting: { $where: true, mod: { $replace: 3 } } } }] },
  ])
  for (const p of ['pools.ki.current', 'pools.ki.max', 'pools.ki.die', 'pools.innate-sorcery.current', 'sanity', 'jump', 'spellcasting.class:wizard.mod', 'pools.{pool}.current'])
    assert.ok(supplies(computed, p), p)
  for (const p of ['pools.rage.current', 'ac', 'pools.ki.recover', 'spellcasting.class:wizard.dc'])
    assert.ok(!supplies(computed, p), `${p}: an add or cap adjusts a value; it doesn't compute one`)
})
