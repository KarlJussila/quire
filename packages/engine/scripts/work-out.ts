// Works out a saved character against the bundles it names and prints its sheet.
// Usage: node scripts/work-out.ts <character.json> [path...]
// With paths, prints only those fields.

import { readFileSync } from 'node:fs'
import { load, workOut, type Character } from '../src/index.ts'
import { bundleDir } from './bundles.ts'

const [file, ...paths] = process.argv.slice(2)
const character = JSON.parse(readFileSync(file, 'utf8')) as Character
const catalog = load((character.bundles as string[]).map(bundleDir))
const out = workOut(catalog, character)
const show = (label: string, v: unknown) => console.log(`${label}: ${typeof v === 'string' ? v : JSON.stringify(v)}`)
const signed = (n: number) => (n < 0 ? `${n}` : `+${n}`)

console.log(`${character.name}: level ${out.levels.total}`)
if (paths.length) for (const p of paths) show(p, out.read(p))
else {
  for (const p of ['abilities', 'modifiers', 'proficiencyBonus', 'hp.max', 'ac', 'speeds', 'senses', 'passives', 'size', 'carryingCapacity', 'attunementSlots']) show(p, out.read(p))
  const of = (kind: string) => [...catalog.entries.values()].map((e) => e.entity).filter((e) => e.id.startsWith(`${kind}:`) && !e.id.includes('@'))
  show('saving throws', of('ability').map((a) => `${a.name} ${signed(out.roll({ roll: 'roll:save', ability: a.id }).total)}`).join(', '))
  show('skills', of('skill').map((s) => `${s.name} ${signed(out.roll({ roll: 'roll:check', ability: s.ability, skill: s.id }).total)}`).join(', '))
  show('initiative', signed(out.roll({ roll: 'roll:initiative', ability: 'ability:dex' }).total))
  show('items', out.items().map((i) => `${i.name}${['worn', 'held', 'attuned'].filter((k) => i.carried[k]).map((k) => ` (${k})`).join('')}${Object.entries(i.pools).map(([k, p]) => `, ${k} ${p.current}/${p.max}`).join('')}`).join('; '))
  console.log('attacks')
  for (const a of out.attacks()) console.log(`  ${a.name} (${a.range}${a.ability ? `, ${a.ability.split(':')[1]}` : ''}): ${signed(a.toHit.total)} to hit, ${a.damage.map((d) => `${d.amount}${d.bonus.total ? signed(d.bonus.total) : ''} ${String(d.type).split(':')[1]}`).join(' + ')}${[...a.toHit.conditional, ...a.damage.flatMap((d) => d.bonus.conditional)].map((n) => `; ${n.id} may apply`).join('')}`)
  show('sight', out.sight().map(({ id, range, ...how }) => `${id}${range === undefined ? '' : ` to ${range} ft`}: ${Object.entries(how).map(([k, v]) => (v === true ? k : `${k} ${JSON.stringify(v)}`)).join(', ')}`).join('; '))
  const d = out.defenses()
  show('defenses', `resists ${d.resist.join(', ') || 'nothing'}; immune to ${d.immune.join(', ') || 'nothing'}; vulnerable to ${d.vulnerable.join(', ') || 'nothing'}${d.conditional.filter((n) => !n.id.startsWith("rule:")).map((n) => `; ${n.message} at times (${n.id})`).join("")}`)
  show('masteries', Object.keys((out.read('masteries') ?? {}) as object).join(', '))
  show('spellcasting', out.read('spellcasting'))
  const held = out.spells()
  for (const how of [...new Set(held.map((h) => h.how))]) show(`spells ${how}`, held.filter((h) => h.how === how).map((h) => h.spell.split(':')[1]).join(', '))
  const pools = (out.read('pools') ?? {}) as Record<string, { max?: unknown }>
  show('pools', Object.entries(pools).filter(([, p]) => p.max !== 0 && p.max !== undefined).map(([k, p]) => `${k} ${p.max}`).join(', '))
  show('proficiencies', out.read('proficiencies'))
  console.log(`\ngained ${out.gained.filter((g) => !g.from.startsWith('rules')).length} entities and ${out.gained.filter((g) => g.from.startsWith('rules')).length} rules`)
  for (const g of out.gained.filter((g) => !g.from.startsWith('rules'))) console.log(`  ${g.id}  (${g.from})`)
}
console.log(`\npicks: ${out.picks.length}`)
for (const n of out.picks) console.log(`  ${n.id}: ${n.message}`)
console.log(`\nleft out, ${out.unevaluated.length}:`)
for (const n of out.unevaluated) console.log(`  ${n.id}: ${n.message}`)
