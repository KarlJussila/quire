// Finds a bundle's directory by its code. The places searched are QUIRE_BUNDLES (directories
// separated as in PATH), or else bundles/ in the working directory and then this repository's
// bundles/. A corpus kept elsewhere runs from its own root or sets QUIRE_BUNDLES.

import { existsSync } from 'node:fs'
import { delimiter, join, resolve } from 'node:path'

const own = new URL('../../../bundles/', import.meta.url).pathname
export const bundleRoots = process.env.QUIRE_BUNDLES
  ? process.env.QUIRE_BUNDLES.split(delimiter).map((d) => resolve(d))
  : [...new Set([resolve('bundles'), resolve(own)])]

export const bundleDir = (code: string): string => {
  const dir = bundleRoots.map((r) => join(r, code)).find((d) => existsSync(join(d, 'bundle.json')))
  if (!dir) throw new Error(`no bundle "${code}" in ${bundleRoots.join(', ')}`)
  return dir
}
