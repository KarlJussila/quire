// The Quire content schema. One TypeBox Module holds every declaration,
// so recursive references resolve and each export carries its static type.

import Type from 'typebox'
import Schema from 'typebox/schema'
import { CoreDecls } from './core.ts'
import { KindDecls, EntityKinds } from './kinds.ts'
import { CharacterDecls } from './character.ts'
import { jsonSchema } from './document.ts'
import { explainer } from './explain.ts'
import { matchChecker } from './match.ts'
import { expand, pronounProblems } from './choices.ts'
import { pathReader } from './paths.ts'

export const Declarations = { ...CoreDecls, ...KindDecls, ...CharacterDecls }
export const Quire = Type.Module(Declarations)

export { EntityKinds, jsonSchema }
export type KindName = keyof typeof EntityKinds
export type DeclarationName = keyof typeof Declarations

// Exact static types, generated from the JSON Schema by scripts/types.ts.
// (TypeBox's inferred types fall back to `any` deep in the recursion.)
export type * from '../generated/types.ts'

type Validator = ReturnType<typeof Schema.Compile>
const validators = new Map<string, Validator>()
let entityValidator: Validator | undefined

let document: ReturnType<typeof jsonSchema> | undefined

/** A compiled validator for one declaration, built on first use. Compiling the
 *  plain JSON document is much faster than compiling the TypeBox Module types. */
export function validator(name: DeclarationName): Validator {
  let v = validators.get(name)
  if (!v) {
    document ??= jsonSchema()
    v = Schema.Compile({ $schema: document.$schema, $defs: document.$defs, $ref: `#/$defs/${name}` } as any)
    validators.set(name, v)
  }
  return v
}

/** The declaration that validates an entity, chosen by its id's kind prefix. */
export function declarationFor(id: string): DeclarationName | undefined {
  const kind = id.slice(0, id.indexOf(':'))
  return (EntityKinds as Record<string, DeclarationName>)[kind]
}

export type { Problem } from './explain.ts'
import type { Problem } from './explain.ts'

let explain: ReturnType<typeof explainer> | undefined
let matches: ReturnType<typeof matchChecker> | undefined

// Checks a value as written, where a choice or read stands in any field (global.ts), and
// again with each choice's candidates in its place (choices.ts). A problem inside a
// candidate is reported at the place the choice stands.
function problems(v: Validator, name: DeclarationName, value: unknown): Problem[] {
  const found: Problem[] = []
  const seen = new Set<string>()
  const add = (p: Problem) => { const k = `${p.path} ${p.message}`; if (!seen.has(k)) { seen.add(k); found.push(p) } }
  for (const copy of [value, ...expand(value)]) if (!v.Check(copy)) explainAt(name, copy).forEach(add)
  pronounProblems(value).forEach(add)
  return found
}
function explainAt(name: DeclarationName, value: unknown): Problem[] {
  document ??= jsonSchema()
  explain ??= explainer(document.$defs as Record<string, any>, document.$schema)
  return explain({ $ref: `#/$defs/${name}` }, value)
}

// A {kind, where} filter's `match` is checked against the kind's fields. An activity's
// are Activity's; a pool's are its `resource` effect's.
function poolMatches() {
  const defs = document!.$defs as Record<string, any>
  const branches = (s: any): any[] => s.anyOf ? s.anyOf.flatMap(branches) : [s]
  const resource = branches(defs.Effect).find((s: any) => s.properties?.type?.const === 'resource')
  return matchChecker({ ...defs, Pool: resource }, { ...EntityKinds, activity: 'Activity', outcome: 'Outcome', pool: 'Pool' })
}

/** Validates one entity of any kind, dispatching on its id's kind prefix. */
export function checkEntity(value: unknown): Problem[] {
  document ??= jsonSchema()
  entityValidator ??= Schema.Compile(document as any)
  matches ??= poolMatches()
  if (entityValidator.Check(value) && expand(value).every((copy) => entityValidator!.Check(copy)) && !pronounProblems(value).length) return matches(value)
  // Report against the entity's own kind; the dispatcher's errors only say "must match then".
  const id = (value as { id?: unknown })?.id
  const name = typeof id === 'string' ? declarationFor(id) : undefined
  if (!name) return [{ path: '/id', message: typeof id === 'string' ? `unknown kind in ${id}` : 'missing id' }]
  return problems(validator(name), name, value)
}

/** Validates a value against one named declaration. */
export function check(name: DeclarationName, value: unknown): Problem[] {
  return problems(validator(name), name, value)
}

let paths: ReturnType<typeof pathReader> | undefined

/** The paths an entity reads, by its kind's schema (paths.ts). */
export function pathsIn(entity: { id: string }): Set<string> {
  document ??= jsonSchema()
  paths ??= pathReader(document.$defs as Record<string, any>)
  const name = declarationFor(entity.id)
  return name ? paths.pathsIn(entity, name) : new Set()
}

/** Whether a field at the path is stored by a creature's stat block or a saved character,
 *  or, for a `this.` path, by the reading entity's own kind. */
export function storedPath(path: string, reader: { id: string }): boolean {
  document ??= jsonSchema()
  paths ??= pathReader(document.$defs as Record<string, any>)
  const own = declarationFor(reader.id)
  return paths.stored(path, path.startsWith('this.') ? (own ? [own] : []) : ['Creature', 'Character'])
}
