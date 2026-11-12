// Regression: legacy decorators as compiled by Babel with decorator metadata (jiti — the `ghuri` CLI's
// TypeScript loader) pass the class prototype in place of the property descriptor.
import { describe, expect, it } from 'vitest'
import { action, display, getActionOptions, getDisplayOptions } from '../src/decorators'

function applyBabelLegacy(proto: any, key: string, decorators: Array<(...a: any[]) => any>): void {
  const metadata = (t: unknown) => t
  const desc = Object.getOwnPropertyDescriptor(proto, key)!
  const result = [...decorators, metadata, metadata]
    .slice()
    .reverse()
    .reduce((d: any, dec) => dec(proto, key, d) || d, { ...desc })
  Object.defineProperty(proto, key, result)
}

describe('admin decorators compiled by Babel (legacy + metadata)', () => {
  it('@display and @action attach their options', () => {
    class PostAdmin {
      isRecent() {
        return true
      }
      archive() {}
    }
    applyBabelLegacy(PostAdmin.prototype, 'isRecent', [display({ description: 'Recent?', boolean: true })])
    applyBabelLegacy(PostAdmin.prototype, 'archive', [action({ description: 'Archive' })])
    expect(getDisplayOptions(PostAdmin.prototype.isRecent)).toEqual({ description: 'Recent?', boolean: true })
    expect(getActionOptions(PostAdmin.prototype.archive)).toEqual({ description: 'Archive' })
  })
})
