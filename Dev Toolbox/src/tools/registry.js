const toolModules = import.meta.glob('./*/index.vue', { eager: true })

export function toolCodeFromPath(modulePath) {
  const match = /^\.\/([^/]+)\/index\.vue$/.exec(modulePath)
  return match ? match[1] : null
}

export function createToolRegistry(modules) {
  const registry = new Map()

  for (const [modulePath, moduleValue] of Object.entries(modules || {})) {
    const code = toolCodeFromPath(modulePath)
    if (!code) continue
    const component = moduleValue?.default || moduleValue
    if (component) registry.set(code, component)
  }

  return registry
}

export const toolRegistry = createToolRegistry(toolModules)

export function resolveTool(code) {
  if (typeof code !== 'string') return null
  return toolRegistry.get(code) || null
}
