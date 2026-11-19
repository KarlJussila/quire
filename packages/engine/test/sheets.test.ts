import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { delimiter, join } from 'node:path'
import { load, workOut, type Character, type Catalog } from '../src/index.ts'
import { bundleDir } from '../scripts/bundles.ts'

// Each character with an .expected.json beside it: the expected numbers were worked out by hand
// from the book, and the engine has to arrive at the same sheet. The characters are in
// characters/, or in the directories QUIRE_CHARACTERS names (separated as in PATH).
const dirs = process.env.QUIRE_CHARACTERS?.split(delimiter) ?? [new URL('./characters/', import.meta.url).pathname]
const catalogs = new Map<string, Catalog>()
const catalogFor = (codes: string[]) => {
  const key = codes.join()
  if (!catalogs.has(key)) catalogs.set(key, load(codes.map(bundleDir)))
  return catalogs.get(key)!
}

for (const [dir, file] of dirs.flatMap((d) => readdirSync(d).filter((f) => f.endsWith('.expected.json')).sort().map((f) => [d, f]))) {
  const name = file.replace('.expected.json', '')
  test(`${name} works out to the sheet the book gives`, () => {
    const character = JSON.parse(readFileSync(join(dir, name + '.json'), 'utf8')) as Character
    const want = JSON.parse(readFileSync(join(dir, file), 'utf8'))
    const out = workOut(catalogFor(character.bundles as string[]), character)
    const got: Record<string, unknown> = {}, expected: Record<string, unknown> = {}
    const say = (label: string, g: unknown, w: unknown) => { if (w !== undefined) { got[label] = g; expected[label] = w } }
    for (const [a, n] of Object.entries(want.abilities ?? {})) say(`score ${a}`, out.read(`abilities.${a}`), n)
    say('proficiency bonus', out.read('proficiencyBonus'), want.proficiencyBonus)
    say('hit point maximum', out.read('hp.max'), want['hp.max'])
    say('armor class', out.read('ac'), want.ac)
    for (const [a, n] of Object.entries(want.saves ?? {})) say(`save ${a}`, out.roll({ roll: 'roll:save', ability: a }).total, n)
    const abilityOf = (skill: string) => catalogFor(character.bundles as string[]).entries.get(skill)?.entity.ability
    for (const [s, n] of Object.entries(want.skills ?? {})) say(`check ${s}`, out.roll({ roll: 'roll:check', ability: abilityOf(s), skill: s }).total, n)
    say('initiative', out.roll({ roll: 'roll:initiative', ability: 'ability:dex' }).total, want.initiative)
    for (const [cls, fields] of Object.entries((want.spellcasting ?? {}) as Record<string, Record<string, unknown>>))
      for (const [f, n] of Object.entries(fields)) say(`${cls} ${f}`, out.read(`spellcasting.${cls}.${f}`), n)
    ;((want['spell-slots'] ?? []) as number[]).forEach((n, i) => say(`level ${i + 1} spell slots`, out.read(`pools.spell-slot-${i + 1}.max`), n))
    for (const [k, n] of Object.entries(want.pools ?? {})) say(`pool ${k}`, out.read(`pools.${k}.max`), n)
    const attacks = new Map(out.attacks().map((a) => [a.name, `${a.toHit.total >= 0 ? '+' : ''}${a.toHit.total}, ${a.damage.map((d) =>
      `${d.amount}${d.bonus.total ? (d.bonus.total > 0 ? '+' : '') + d.bonus.total : ''} ${String(d.type).split(':')[1]}`).join(' + ')}`]))
    for (const [a, line] of Object.entries(want.attacks ?? {})) say(`attack ${a}`, attacks.get(a), line)
    assert.deepEqual(got, expected)
    assert.deepEqual(out.picks, [], 'every choice is answered, and every pick is for a choice the character was offered')
  })
}
