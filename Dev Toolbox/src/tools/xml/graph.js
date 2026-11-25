import {
  GRAPH_LAYOUT,
  GRAPH_LIMITS,
  truncateGraphText,
  utf8ByteLength
} from '../json/graph.js'
import { isJsonXmlMetadataAttribute, parseXmlDocument } from './logic.js'

const ELEMENT_NODE = 1
const TEXT_NODE = 3
const CDATA_SECTION_NODE = 4
const COMMENT_NODE = 8

export const XML_GRAPH_TYPE_LABELS = Object.freeze({
  object: '元素',
  string: '文本'
})
export const XML_GRAPH_COUNT_LABELS = Object.freeze({ object: '个条目' })
export const XML_GRAPH_EMPTY_LABELS = Object.freeze({ object: '空元素' })

const LIMIT_META = Object.freeze({
  inputBytes: Object.freeze({ label: 'UTF-8 输入大小', display: '2 MiB' }),
  containerDepth: Object.freeze({ label: '元素嵌套层级', display: '128 层' }),
  rows: Object.freeze({ label: '总行数', display: '10,000 行' })
})

function limitFailure(key, actual) {
  const meta = LIMIT_META[key]
  return {
    ok: false,
    limit: key,
    limitLabel: meta.label,
    limitDisplay: meta.display,
    limitValue: GRAPH_LIMITS[key],
    actual
  }
}

function childNodesOf(node) {
  return Array.from(node.childNodes || [])
}

function attributesOf(element) {
  return Array.from(element.attributes || []).filter(
    (attribute) => !isJsonXmlMetadataAttribute(attribute)
  )
}

function textNodeValue(node) {
  return String(node.nodeValue ?? '')
}

function elementChildPaths(parentId, childNodes) {
  const totals = new Map()
  for (const child of childNodes) {
    if (child.nodeType !== ELEMENT_NODE) continue
    totals.set(child.nodeName, (totals.get(child.nodeName) || 0) + 1)
  }

  const seen = new Map()
  const paths = new Map()
  for (const child of childNodes) {
    if (child.nodeType !== ELEMENT_NODE) continue
    const name = child.nodeName
    if ((totals.get(name) || 0) > 1) {
      const index = (seen.get(name) || 0) + 1
      seen.set(name, index)
      paths.set(child, `${parentId}/${name}[${index}]`)
    } else {
      paths.set(child, `${parentId}/${name}`)
    }
  }

  return paths
}

function cardHeight(rowCount) {
  const chrome = GRAPH_LAYOUT.headerHeight + GRAPH_LAYOUT.bodyPadding * 2
  return (
    chrome +
    (rowCount > 0
      ? rowCount * GRAPH_LAYOUT.rowHeight
      : GRAPH_LAYOUT.emptyHeight)
  )
}

function inspectLimits(rootElement) {
  let rowCount = 0
  const stack = [{ element: rootElement, depth: 1 }]

  while (stack.length > 0) {
    const { element, depth } = stack.pop()
    if (depth > GRAPH_LIMITS.containerDepth) {
      return limitFailure('containerDepth', depth)
    }

    for (const attribute of attributesOf(element)) {
      rowCount += 1
    }

    for (const child of childNodesOf(element)) {
      if (child.nodeType === ELEMENT_NODE) {
        rowCount += 1
        stack.push({ element: child, depth: depth + 1 })
        continue
      }

      if (child.nodeType === TEXT_NODE) {
        const text = textNodeValue(child)
        if (!text.trim()) continue
        rowCount += 1
        continue
      }

      if (
        child.nodeType === CDATA_SECTION_NODE ||
        child.nodeType === COMMENT_NODE
      ) {
        rowCount += 1
      }
    }

    if (rowCount > GRAPH_LIMITS.rows) {
      return limitFailure('rows', rowCount)
    }
  }

  return null
}

export function buildXmlGraph(inputText) {
  const inputBytes = utf8ByteLength(inputText)
  if (inputBytes > GRAPH_LIMITS.inputBytes) {
    return limitFailure('inputBytes', inputBytes)
  }

  const parsed = parseXmlDocument(inputText)
  if (!parsed.ok) return parsed

  const rootElement = parsed.document.documentElement
  const limit = inspectLimits(rootElement)
  if (limit) return limit

  const cards = []
  const edges = []

  function buildElement(element, id, depth, parentId) {
    const rows = []
    const childIds = []
    const childElements = []

    function pushLeaf(label, value, path) {
      rows.push({
        id: `row:${path}`,
        path,
        cardId: id,
        index: rows.length,
        label,
        displayLabel: label,
        type: 'string',
        isContainer: false,
        childId: null,
        preview: truncateGraphText(value, 120),
        value
      })
    }

    for (const attribute of attributesOf(element)) {
      pushLeaf(`@${attribute.name}`, attribute.value, `${id}/@${attribute.name}`)
    }

    const children = childNodesOf(element)
    const childPaths = elementChildPaths(id, children)

    children.forEach((child, sourceIndex) => {
      if (child.nodeType === ELEMENT_NODE) {
        const childId = childPaths.get(child)
        const label = child.nodeName
        rows.push({
          id: `row:${childId}`,
          path: childId,
          cardId: id,
          index: rows.length,
          label,
          displayLabel: label,
          type: 'object',
          isContainer: true,
          childId,
          preview: '元素',
          value: null
        })
        childIds.push(childId)
        edges.push({
          id: `edge:${childId}`,
          from: id,
          to: childId,
          label,
          path: childId
        })
        childElements.push({ element: child, id: childId, depth: depth + 1 })
        return
      }

      if (child.nodeType === TEXT_NODE) {
        const text = textNodeValue(child)
        if (!text.trim()) return
        pushLeaf('#text', text, `${id}/text[${sourceIndex}]`)
        return
      }

      if (child.nodeType === CDATA_SECTION_NODE) {
        pushLeaf('#cdata', textNodeValue(child), `${id}/cdata[${sourceIndex}]`)
        return
      }

      if (child.nodeType === COMMENT_NODE) {
        pushLeaf(
          '#comment',
          textNodeValue(child),
          `${id}/comment[${sourceIndex}]`
        )
      }
    })

    cards.push({
      id,
      path: id,
      label: element.nodeName,
      parentId,
      depth,
      type: 'object',
      rows,
      childIds,
      value: {
        name: element.nodeName,
        attributes: Object.fromEntries(
          attributesOf(element).map((attribute) => [
            attribute.name,
            attribute.value
          ])
        ),
        childNodes: childNodesOf(element).length
      },
      preview: `元素 · ${rows.length} 个子节点`,
      count: rows.length,
      height: cardHeight(rows.length)
    })

    for (const child of childElements) {
      buildElement(child.element, child.id, child.depth, id)
    }
  }

  const rootId = `/${rootElement.nodeName}`
  buildElement(rootElement, rootId, 0, null)

  return {
    ok: true,
    rootId,
    cards,
    edges,
    stats: { cards: cards.length, rows: cards.reduce((n, c) => n + c.rows.length, 0) }
  }
}
