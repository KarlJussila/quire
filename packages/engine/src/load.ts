// Turns a set of bundles into one catalog. The steps, in order:
//
// 1. Read each bundle: its manifest, entities, and patch files.
// 2. Validate every entity and patch file against the schema. An invalid
//    entity is reported and left out; the rest of its bundle still loads.
// 3. Check requirements. A missing required bundle is a warning: its
//    references dangle, nothing crashes.
// 4. Collapse reprints. The same id in two bundles is one entity. Identical
//    copies merge; otherwise a bundle's copy beats one in a bundle it requires
//    (a book over its SRD), then the latest release date wins, and the
//    override is reported, because homebrew overrides official content the
//    same way.
// 5. Build the alias table from `supersedes`, and repoint references through it.
// 6. Apply patches in bundle load order, revalidating each patched entity. A
//    patch that makes its target invalid is reported and not applied.
// 7. Check optional rules' overrides. They aren't applied here; a campaign
//    turns rules on with enableRules(). Each override must name a loaded
//    entity and leave it valid.
// 8. Resolve references. An untagged reference means either edition (see
//    design/bundles.md "References and editions"), so it resolves if either
//    version is loaded. A missing vocabulary term is an error. Missing content
//    is a dangling reference, a warning. A reference into a loaded bundle the
//    referring bundle doesn't require is an undeclared dependency, a warning.
// 9. Check what rules reach into other entities (links.ts): a `change` must
//    patch something its target has, and a named value must be stored there.
//    Each reference means the referrer's own edition when that's loaded.

import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs'
import { join, relative } from 'node:path'
import { checkEntity, check, EntityKinds, pathsIn, storedPath } from '@quire/schema'
import { references, rewriteReferences, vocabularyKinds, kindOf, candidates, isPart } from './refs.ts'
import { applyPatch } from './patch.ts'
import { linkProblems, activitiesOf } from './links.ts'
import { suppliedPaths, supplies } from './supplied.ts'

export interface Manifest {
  id: string
  name: string
  version: string
  releaseDate?: string
  requires?: ({ bundle: string } | { anyOf: { bundle: string }[] })[]
  [key: string]: unknown
}

export type Entity = { id: string; name: string; source: { book: string }; [key: string]: unknown }

export interface Bundle {
  dir: string
  manifest: Manifest
  entities: { file: string; entity: Entity }[]
  patches: { file: string; data: { patches: { target: string; set: Record<string, unknown> }[] } }[]
}

export interface Finding {
  severity: 'error' | 'warning' | 'info'
  code:
    | 'invalid-json' | 'invalid-manifest' | 'invalid-entity' | 'invalid-patch-file' | 'duplicate-id'
    | 'missing-requirement' | 'reprint-override' | 'reprint-wording' | 'supersedes-conflict' | 'patch-target-missing'
    | 'patch-invalid' | 'missing-vocabulary' | 'dangling-reference' | 'undeclared-dependency'
    | 'override-not-optional' | 'override-target-missing' | 'override-invalid' | 'reaches-nothing' | 'never-emitted' | 'pool-declared-twice'
    | 'unsupplied-path'
  bundle?: string
  file?: string
  id?: string
  message: string
}

export interface CatalogEntry {
  entity: Entity
  /** The bundle whose copy won. */
  bundle: string
  /** Every bundle that ships this id, in load order. */
  bundles: string[]
}

export type Edition = '2014' | '2024'

export interface LoadOptions {
  /** The edition an untagged reference uses when both versions are loaded. */
  prefer?: Edition
}

export interface Catalog {
  /** The edition an untagged reference uses when both versions are loaded. */
  prefer: Edition
  bundles: Map<string, Bundle>
  entries: Map<string, CatalogEntry>
  /** superseded id → surviving id */
  aliases: Map<string, string>
  findings: Finding[]
}

const jsonFiles = (dir: string): string[] =>
  !existsSync(dir) ? [] : readdirSync(dir).sort().flatMap((f) => {
    const p = join(dir, f)
    return statSync(p).isDirectory() ? jsonFiles(p) : p.endsWith('.json') ? [p] : []
  })

function readJson(file: string, findings: Finding[], bundle?: string): unknown {
  try {
    return JSON.parse(readFileSync(file, 'utf8'))
  } catch (e) {
    findings.push({ severity: 'error', code: 'invalid-json', bundle, file, message: (e as Error).message })
    return undefined
  }
}

/** Step 1 and 2: read one bundle directory, keeping only valid entities. */
export function readBundle(dir: string, findings: Finding[]): Bundle | undefined {
  const manifest = readJson(join(dir, 'bundle.json'), findings) as Manifest | undefined
  if (!manifest) return undefined
  const manifestProblems = check('Manifest', manifest)
  if (manifestProblems.length) {
    findings.push({ severity: 'error', code: 'invalid-manifest', file: join(dir, 'bundle.json'),
      message: manifestProblems.map((p) => `${p.path} ${p.message}`).join('; ') })
    return undefined
  }
  const bundle: Bundle = { dir, manifest, entities: [], patches: [] }
  const seen = new Set<string>()
  for (const file of jsonFiles(join(dir, 'entities'))) {
    const data = readJson(file, findings, manifest.id)
    if (data === undefined) continue
    for (const entity of (Array.isArray(data) ? data : [data]) as Entity[]) {
      const problems = checkEntity(entity)
      if (problems.length) {
        findings.push({ severity: 'error', code: 'invalid-entity', bundle: manifest.id, file: relative(dir, file),
          id: entity?.id, message: problems.slice(0, 5).map((p) => `${p.path || '/'} ${p.message}`).join('; ') })
        continue
      }
      if (entity.id.endsWith('@2014')) {
        findings.push({ severity: 'error', code: 'invalid-entity', bundle: manifest.id, file: relative(dir, file),
          id: entity.id, message: 'no entity id ends in @2014: the 2014 version is the untagged id' })
        continue
      }
      if (seen.has(entity.id)) {
        findings.push({ severity: 'error', code: 'duplicate-id', bundle: manifest.id, file: relative(dir, file),
          id: entity.id, message: 'the same id appears twice in one bundle' })
        continue
      }
      seen.add(entity.id)
      bundle.entities.push({ file: relative(dir, file), entity })
    }
  }
  for (const file of jsonFiles(join(dir, 'patches'))) {
    const data = readJson(file, findings, manifest.id)
    if (data === undefined) continue
    const problems = check('Patch', data)
    if (problems.length) {
      findings.push({ severity: 'error', code: 'invalid-patch-file', bundle: manifest.id, file: relative(dir, file),
        message: problems.slice(0, 5).map((p) => `${p.path || '/'} ${p.message}`).join('; ') })
      continue
    }
    bundle.patches.push({ file: relative(dir, file), data: data as Bundle['patches'][number]['data'] })
  }
  return bundle
}

const requirementsOf = (m: Manifest): string[][] =>
  (m.requires ?? []).map((r) => ('anyOf' in r ? r.anyOf.map((a) => a.bundle) : [r.bundle]))

/** Bundles this bundle may reference: itself and its requirements, transitively. */
function scopeOf(id: string, bundles: Map<string, Bundle>, memo = new Map<string, Set<string>>()): Set<string> {
  const cached = memo.get(id)
  if (cached) return cached
  const scope = new Set<string>([id])
  memo.set(id, scope)
  const b = bundles.get(id)
  if (b) for (const alternatives of requirementsOf(b.manifest))
    for (const alt of alternatives) if (bundles.has(alt)) for (const s of scopeOf(alt, bundles, memo)) scope.add(s)
  return scope
}

const withoutSource = ({ source: _source, ...rest }: Entity) => rest
const withoutWording = ({ source: _s, text: _t, gaps: _g, ...rest }: Entity) =>
  Array.isArray(rest.blocks) ? { ...rest, blocks: rest.blocks.map(({ text: _bt, ...b }: Record<string, unknown>) => b) } : rest
const stableJson = (v: unknown): string =>
  Array.isArray(v) ? `[${v.map(stableJson).join(',')}]`
  : v && typeof v === 'object' ? `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${stableJson((v as any)[k])}`).join(',')}}`
  : JSON.stringify(v)

export const editionOf = (id: string): Edition => (id.endsWith('@2024') ? '2024' : '2014')

/** The ids a reference at `path` can mean that are loaded, the preferred
 * edition first. In a list of parts, only the exact entity. */
function loaded(entries: Map<string, CatalogEntry>, aliases: Map<string, string>, prefer: Edition, ref: string, path = ''): string[] {
  const ids = (isPart(path) ? [ref.replace(/@2014$/, '')] : candidates(ref)).map((id) => aliases.get(id) ?? id)
  return ids.filter((id) => entries.has(id)).sort((a, b) => Number(editionOf(b) === prefer) - Number(editionOf(a) === prefer))
}

/** The entry a rule's reference uses: the version that's loaded, or the
 * preferred edition's when both are. `path` is where the reference sits. */
export function resolve(catalog: Catalog, ref: string, path = ''): CatalogEntry | undefined {
  const [id] = loaded(catalog.entries, catalog.aliases, catalog.prefer, ref, path)
  return id === undefined ? undefined : catalog.entries.get(id)
}

const keysIn = new WeakMap<Map<string, CatalogEntry>, Set<string>>()

/** What `entity`'s rules reach into other entities that isn't there (step 9). */
const membersIn = new WeakMap<Map<string, CatalogEntry>, Map<string, Entity[]>>()
export function reachProblems(catalog: Pick<Catalog, 'entries' | 'aliases'>, entity: Entity) {
  let keys = keysIn.get(catalog.entries)
  if (!keys) keysIn.set(catalog.entries, keys = new Set([...catalog.entries.values()].flatMap((e) => activitiesOf(e.entity).map((a) => a.key as string))))
  const own = activitiesOf(entity).map((a) => a.key as string).filter((k) => !keys.has(k))
  let groups = membersIn.get(catalog.entries)
  if (!groups) {
    membersIn.set(catalog.entries, groups = new Map())
    for (const e of catalog.entries.values())
      for (const g of ([] as unknown[]).concat(e.entity.group ?? [])) if (typeof g === 'string') groups.set(g, [...(groups.get(g) ?? []), e.entity])
  }
  return linkProblems(entity, (ref) => {
    const [id] = loaded(catalog.entries, catalog.aliases, editionOf(entity.id), ref)
    return id === undefined ? undefined : catalog.entries.get(id)!.entity
  }, own.length ? new Set([...keys, ...own]) : keys, (g) => groups!.get(g) ?? [])
}

/** Whether a test for `ref` matches entity `id`: an untagged reference matches
 * either version. */
export const matches = (ref: string, id: string): boolean => candidates(ref).includes(id)

/** Loads bundle directories, in the given order, into one catalog. */
export function load(dirs: string[], options: LoadOptions = {}): Catalog {
  const findings: Finding[] = []
  const bundles = new Map<string, Bundle>()
  for (const dir of dirs) {
    const b = readBundle(dir, findings)
    if (b) bundles.set(b.manifest.id, b)
  }
  // The edition in use, unless one is asked for: 2014 when every loaded bundle that has an edition is a 2014 one.
  const editions = [...bundles.values()].map((b) => b.manifest.edition).filter((e) => e !== undefined)
  const prefer = options.prefer ?? (editions.length && editions.every((e) => e === '2014') ? '2014' : '2024')

  // 3. Requirements
  for (const b of bundles.values())
    for (const alternatives of requirementsOf(b.manifest))
      if (!alternatives.some((a) => bundles.has(a)))
        findings.push({ severity: 'warning', code: 'missing-requirement', bundle: b.manifest.id,
          message: `requires ${alternatives.join(' or ')}, which isn't loaded` })

  // 4. Reprint collapse
  const entries = new Map<string, CatalogEntry>()
  const order = [...bundles.keys()]
  // A bundle builds on what it requires outright, transitively; a choice of alternatives doesn't count.
  const buildsOn = (a: string, b: string, seen = new Set<string>()): boolean => {
    if (seen.has(a)) return false
    seen.add(a)
    const required = requirementsOf(bundles.get(a)!.manifest).filter((alts) => alts.length === 1).map(([r]) => r)
    return required.some((r) => r === b || (bundles.has(r) && buildsOn(r, b, seen)))
  }
  for (const b of bundles.values()) {
    for (const { entity } of b.entities) {
      const prior = entries.get(entity.id)
      if (!prior) { entries.set(entity.id, { entity, bundle: b.manifest.id, bundles: [b.manifest.id] }); continue }
      prior.bundles.push(b.manifest.id)
      if (stableJson(withoutSource(prior.entity)) === stableJson(withoutSource(entity))) continue
      // Copies that differ only in wording: the book's own wording beats an SRD rewording.
      // Otherwise a bundle's copy beats the copy in a bundle it builds on (a book over the SRD
      // it requires, which prints less of it), and then the later release wins.
      const wordingOnly = stableJson(withoutWording(prior.entity)) === stableJson(withoutWording(entity))
      const srd = (e: Entity) => (e.text as { wording?: string } | undefined)?.wording === 'srd'
      const date = (id: string) => bundles.get(id)!.manifest.releaseDate ?? ''
      const newer = wordingOnly && srd(prior.entity) !== srd(entity) ? srd(prior.entity)
        : buildsOn(b.manifest.id, prior.bundle) ? true
        : buildsOn(prior.bundle, b.manifest.id) ? false
        : date(b.manifest.id) > date(prior.bundle)
          || (date(b.manifest.id) === date(prior.bundle) && order.indexOf(b.manifest.id) > order.indexOf(prior.bundle))
      const [winner, loser] = newer ? [b.manifest.id, prior.bundle] : [prior.bundle, b.manifest.id]
      if (newer) { prior.entity = entity; prior.bundle = b.manifest.id }
      findings.push(wordingOnly
        ? { severity: 'info', code: 'reprint-wording', bundle: winner, id: entity.id,
            message: `${winner}'s wording is used over ${loser}'s; the rules are the same` }
        : { severity: 'warning', code: 'reprint-override', bundle: winner, id: entity.id,
            message: `${winner}'s copy replaces ${loser}'s, which differs` })
    }
  }

  // 5. Aliases from supersedes, then repoint
  const aliases = new Map<string, string>()
  for (const [id, e] of entries)
    for (const old of (e.entity.supersedes as string[] | undefined) ?? []) {
      const existing = aliases.get(old)
      if (existing && existing !== id)
        findings.push({ severity: 'error', code: 'supersedes-conflict', id: old,
          message: `superseded by both ${existing} and ${id}` })
      else aliases.set(old, id)
    }
  if (aliases.size) for (const e of entries.values()) e.entity = rewriteReferences(e.entity, (r) => aliases.get(r) ?? r) as Entity

  // 6. Patches, in bundle load order. A reference a patch adds belongs to the
  // patching bundle, so its dependencies are checked against that bundle's.
  const addedBy = new Map<string, Map<string, string>>() // entity id → reference → patching bundle
  for (const b of bundles.values())
    for (const { file, data } of b.patches)
      for (const patch of data.patches) {
        const target = aliases.get(patch.target) ?? patch.target
        const entry = entries.get(target)
        if (!entry) {
          findings.push({ severity: 'warning', code: 'patch-target-missing', bundle: b.manifest.id, file, id: target,
            message: 'the patch target isn\'t loaded, so the patch is skipped' })
          continue
        }
        const patched = applyPatch(entry.entity, patch.set) as Entity
        const problems = checkEntity(patched)
        if (problems.length) {
          findings.push({ severity: 'error', code: 'patch-invalid', bundle: b.manifest.id, file, id: target,
            message: problems.slice(0, 5).map((p) => `${p.path || '/'} ${p.message}`).join('; ') })
          continue
        }
        const before = new Set(references(entry.entity).map((r) => r.ref))
        for (const { ref } of references(patched))
          if (!before.has(ref)) addedBy.set(target, (addedBy.get(target) ?? new Map()).set(ref, b.manifest.id))
        entry.entity = patched
      }

  // 7. Optional rules' overrides
  for (const [id, e] of entries) {
    const overrides = e.entity.overrides as { target: string; set: Record<string, unknown> }[] | undefined
    if (!overrides) continue
    if (!e.entity.optional)
      findings.push({ severity: 'error', code: 'override-not-optional', bundle: e.bundle, id,
        message: 'only an optional rule can override other entities' })
    for (const o of overrides) {
      const target = entries.get(aliases.get(o.target) ?? o.target)
      if (!target) {
        findings.push({ severity: 'warning', code: 'override-target-missing', bundle: e.bundle, id,
          message: `overrides ${o.target}, which isn't loaded` })
        continue
      }
      const problems = checkEntity(applyPatch(target.entity, o.set))
      if (problems.length)
        findings.push({ severity: 'error', code: 'override-invalid', bundle: e.bundle, id,
          message: `${o.target}: ` + problems.slice(0, 5).map((p) => `${p.path || '/'} ${p.message}`).join('; ') })
    }
  }

  // 8. References
  const vocab = vocabularyKinds()
  const memo = new Map<string, Set<string>>()
  for (const [id, e] of entries) {
    for (const { ref, path } of references(e.entity)) {
      const owner = addedBy.get(id)?.get(ref) ?? e.bundle
      const scope = scopeOf(owner, bundles, memo)
      const targets = loaded(entries, aliases, prefer, ref, path).map((t) => entries.get(t)!)
      if (!targets.length) {
        const isVocab = vocab.has(kindOf(ref))
        findings.push({ severity: isVocab ? 'error' : 'warning', code: isVocab ? 'missing-vocabulary' : 'dangling-reference',
          bundle: owner, id, message: `${path}: ${ref} doesn't exist in the loaded bundles` })
      } else if (!targets.some((t) => t.bundles.some((tb) => scope.has(tb)))) {
        findings.push({ severity: 'warning', code: 'undeclared-dependency', bundle: owner, id,
          message: `${path}: ${ref} comes from ${[...new Set(targets.flatMap((t) => t.bundles))].join(', ')}, which ${owner} doesn't require` })
      }
    }
  }

  // 9. What rules reach into
  for (const [id, e] of entries)
    for (const p of reachProblems({ entries, aliases }, e.entity))
      findings.push({ severity: 'error', code: 'reaches-nothing', bundle: e.bundle, id, message: `${p.path}: ${p.message}` })

  // 10. Every event is emitted: by an `emits` entry somewhere, or by the engine
  const emitted = new Set<string>()
  const collect = (node: unknown) => {
    if (Array.isArray(node)) { node.forEach(collect); return }
    if (!node || typeof node !== 'object') return
    const o = node as Record<string, unknown>
    if (Array.isArray(o.emits)) for (const m of o.emits) if (m && typeof (m as { event?: unknown }).event === 'string') emitted.add((m as { event: string }).event)
    Object.values(o).forEach(collect)
  }
  for (const e of entries.values()) collect(e.entity)
  for (const [id, e] of entries)
    if (kindOf(id) === 'event' && e.entity.emittedBy !== 'engine' && !emitted.has(id))
      findings.push({ severity: 'error', code: 'never-emitted', bundle: e.bundle, id, message: 'nothing emits this event: no `emits` entry names it, and it isn\'t marked emittedBy engine' })

  // 11. Paths that nothing supplies: no stored field holds them and no loaded rule computes
  // them (supplied.ts). What's left is what the core rules have yet to compute.
  const computed = suppliedPaths([...entries.values()].map((e) => e.entity))
  const readers = new Map<string, { id: string; bundle: string; count: number }>()
  for (const [id, e] of entries)
    for (const p of pathsIn(e.entity)) {
      // In a rule for objects, `this` is the item it applies to.
      const reader = (e.entity.appliesTo as { pool?: string } | undefined)?.pool === 'object' ? { id: 'item:any' } : e.entity
      // A path through every entry (`classes.*.*.hp`) is stored when the field it enters is.
      if (storedPath(p.split('.*')[0], reader)) continue
      const key = p.replace(/^(self|this|target|source|subject|actor|candidate)\./, '')
      if (supplies(computed, key)) continue
      const r = readers.get(key)
      if (r) r.count++
      else readers.set(key, { id, bundle: e.bundle, count: 1 })
    }
  for (const [p, r] of readers)
    findings.push({ severity: 'info', code: 'unsupplied-path', bundle: r.bundle, id: r.id,
      message: `"${p}": no stored field holds it and no loaded rule computes it; ${r.count === 1 ? 'only this entity reads it' : `${r.count} entities read it`}` })

  // 12. A pool declared twice in one entity: an activity's `uses` is a pool by the activity's
  // key, so it can't share a key with a `resource` (design/model/costs-and-economy.md).
  for (const [id, e] of entries) {
    const resources = new Set<string>(), uses = new Set<string>()
    const walk = (x: unknown) => {
      if (Array.isArray(x)) { x.forEach(walk); return }
      if (!x || typeof x !== 'object') return
      const o = x as Record<string, unknown>
      if (typeof o.key === 'string') (o.type === 'resource' ? resources : o.uses ? uses : new Set()).add(o.key)
      Object.values(o).forEach(walk)
    }
    walk(e.entity)
    for (const k of uses) if (resources.has(k))
      findings.push({ severity: 'error', code: 'pool-declared-twice', bundle: e.bundle, id,
        message: `"${k}": both a resource and an activity's uses declare this pool` })
  }

  return { prefer, bundles, entries, aliases, findings }
}

export { EntityKinds }
