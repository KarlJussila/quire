// Optional rules. A rule with `optional: true` can carry `overrides`: patches
// to other entities that apply only while a DM has the rule on. The base
// content stays as printed; turning a variant on layers it over the top. What
// an optional rule `defines` (a homebrew Resolve ability) is left out while it's off.

import { applyPatch } from './patch.ts'
import type { Catalog, CatalogEntry, Entity } from './load.ts'

/** The catalog's entries with these optional rules turned on, in the given order. */
export function enableRules(catalog: Catalog, ruleIds: string[]): Map<string, CatalogEntry> {
  const entries = new Map(catalog.entries)
  const on = new Set<string>()
  for (const ruleId of ruleIds) {
    const id = catalog.aliases.get(ruleId) ?? ruleId
    const rule = entries.get(id)?.entity
    if (!rule?.optional) throw new Error(`${ruleId} isn't a loaded optional rule`)
    on.add(id)
    for (const o of (rule.overrides as { target: string; set: Record<string, unknown> }[] | undefined) ?? []) {
      const id = catalog.aliases.get(o.target) ?? o.target
      const entry = entries.get(id)
      if (entry) entries.set(id, { ...entry, entity: applyPatch(entry.entity, o.set) as Entity })
    }
  }
  for (const [id, { entity }] of catalog.entries) {
    if (!entity.optional || on.has(id)) continue
    for (const d of (entity.defines as string[] | undefined) ?? []) entries.delete(catalog.aliases.get(d) ?? d)
  }
  return entries
}
