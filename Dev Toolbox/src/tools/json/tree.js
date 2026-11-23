import { jsonValueToDisplay } from './logic.js'

function kindOf(value) {
  if (Array.isArray(value)) return 'array'
  if (value !== null && typeof value === 'object') return 'object'
  return 'text'
}

function createNode(value, label, id, depth) {
  const kind = kindOf(value)
  const node = {
    id,
    label,
    kind,
    defaultOpen: depth === 0
  }

  if (kind === 'text') {
    node.value = jsonValueToDisplay(value)
    return node
  }

  if (kind === 'array') {
    node.children = value.map((child, index) =>
      createNode(child, `[${index}]`, `${id}[${index}]`, depth + 1)
    )
    return node
  }

  node.children = Object.entries(value).map(([key, child]) =>
    createNode(
      child,
      key,
      `${id}[${JSON.stringify(key)}]`,
      depth + 1
    )
  )
  return node
}

export function buildJsonTree(value) {
  return createNode(value, '$', '$', 0)
}
