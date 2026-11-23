import { describe, expect, it } from 'vitest'
import {
  createToolRegistry,
  resolveTool,
  toolCodeFromPath
} from './registry.js'

describe('tool registry', () => {
  it('maps src/tools/<code>/index.vue to the code key', () => {
    const registry = createToolRegistry({
      './timestamp/index.vue': { default: { name: 'TimestampTool' } },
      './uuid/index.vue': { default: { name: 'UuidTool' } },
      './not-a-tool/index.js': { default: { name: 'Ignored' } }
    })

    expect(toolCodeFromPath('./timestamp/index.vue')).toBe('timestamp')
    expect([...registry.keys()]).toEqual(['timestamp', 'uuid'])
    expect(registry.get('timestamp')).toEqual({ name: 'TimestampTool' })
  })

  it('resolves unknown codes to null', () => {
    expect(resolveTool('__missing_feature__')).toBeNull()
    expect(resolveTool(null)).toBeNull()
    expect(resolveTool(42)).toBeNull()
  })
})
