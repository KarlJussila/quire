// Compile-time checks: tsc fails if the static types stop matching the schema.
import type { Effect, Outcome, Activity, Creature, Value } from '../src/index.ts'

export const ok: Effect = { type: 'change', of: 'event', set: { criticalMinimum: { $atMost: 19 } }, when: { event: 'event:roll-made', by: 'self', match: { roll: 'roll:attack', attack: { via: 'weapon' } } } }
export const v: Value = { dice: { count: { slotLevel: true }, die: 8 } }
export const o: Outcome = { applyState: { state: 'condition:prone' }, to: 'self' }
export const a: Activity = { key: 'bite', delivery: { attack: { range: 'melee', bonus: 14 } }, outcomes: [o] }

// @ts-expect-error unknown effect type
export const bad1: Effect = { type: 'heal-over-time' }
// @ts-expect-error roles are a closed list
export const bad2: Outcome = { heal: { amount: 5 }, to: 'mount' }
// @ts-expect-error attack range is a closed list
export const bad3: Activity = { key: 'x', delivery: { attack: { range: 'thrown' } } }
// @ts-expect-error creatures need a size
export const bad4: Creature = { id: 'creature:x', name: 'X', source: { book: 'srd' }, creatureType: 'creature-type:beast', ac: 10, hp: { average: 1 }, speeds: [], abilities: {} }
