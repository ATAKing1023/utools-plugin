import { escapeXmlAttribute, parseXmlDocument } from './logic.js'

const ELEMENT_NODE = 1
const ATTRIBUTE_NODE = 2
const TEXT_NODE = 3
const CDATA_SECTION_NODE = 4
const PROCESSING_INSTRUCTION_NODE = 7
const COMMENT_NODE = 8
const DOCUMENT_NODE = 9
const XML_NAMESPACE = 'http://www.w3.org/XML/1998/namespace'
const RENDERED_NODE_LIMIT = 100
const DOCUMENT_POSITION_FOLLOWING = 4
const XPATH_ANY_TYPE = 0
const XPATH_NUMBER_TYPE = 1
const XPATH_STRING_TYPE = 2
const XPATH_BOOLEAN_TYPE = 3

const NODE_ITERATOR_TYPES = new Set([4, 5])
const NODE_SNAPSHOT_TYPES = new Set([6, 7])
const SINGLE_NODE_TYPES = new Set([8, 9])
const namespaceBindingsCache = new WeakMap()

function emptyResult() {
  return { ok: true, output: '', count: 0, firstAddress: null }
}

function errorResult(message) {
  return {
    ok: false,
    output: `// ${message}`,
    count: 0,
    firstAddress: null
  }
}

function namespaceBindings(document) {
  const cached = namespaceBindingsCache.get(document)
  if (cached) return cached

  const bindings = new Map()

  for (const element of Array.from(document.getElementsByTagName('*'))) {
    for (const attribute of Array.from(element.attributes || [])) {
      if (!attribute.name.startsWith('xmlns:')) continue
      const prefix = attribute.name.slice('xmlns:'.length)
      if (!bindings.has(prefix)) bindings.set(prefix, new Set())
      bindings.get(prefix).add(attribute.value)
    }
  }

  if (!bindings.has('xml')) {
    bindings.set('xml', new Set([XML_NAMESPACE]))
  }

  namespaceBindingsCache.set(document, bindings)
  return bindings
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function stripXPathStrings(expression) {
  let output = ''
  let quote = null

  for (const character of expression) {
    if (quote) {
      if (character === quote) quote = null
      output += ' '
      continue
    }
    if (character === '"' || character === "'") {
      quote = character
      output += ' '
      continue
    }
    output += character
  }

  return output
}

function expressionUsesPrefix(expression, prefix) {
  const pattern = new RegExp(
    `(^|[^\\w.\\-])${escapeRegExp(prefix)}\\s*:(?!:)`
  )
  return pattern.test(stripXPathStrings(expression))
}

function conflictingNamespace(expression, bindings) {
  for (const [prefix, uris] of bindings) {
    if (uris.size < 2 || !expressionUsesPrefix(expression, prefix)) continue
    return {
      prefix,
      uris: Array.from(uris).sort()
    }
  }
  return null
}

function createNamespaceResolver(bindings) {
  return (prefix) => {
    const uris = bindings.get(prefix)
    return uris?.size === 1 ? uris.values().next().value : null
  }
}

function siblingIndex(node, nodeType) {
  let index = 0
  for (
    let sibling = node.previousSibling;
    sibling;
    sibling = sibling.previousSibling
  ) {
    if (sibling.nodeType === nodeType) index += 1
  }
  return index
}

function nodeAddressSegment(node) {
  if (node.nodeType === ELEMENT_NODE) {
    return {
      type: 'element',
      name: node.nodeName,
      index: siblingIndex(node, ELEMENT_NODE)
    }
  }

  if (node.nodeType === TEXT_NODE) {
    return {
      type: 'text',
      index: siblingIndex(node, TEXT_NODE)
    }
  }

  if (node.nodeType === CDATA_SECTION_NODE) {
    return {
      type: 'cdata',
      index: siblingIndex(node, CDATA_SECTION_NODE)
    }
  }

  if (node.nodeType === COMMENT_NODE) {
    return {
      type: 'comment',
      index: siblingIndex(node, COMMENT_NODE)
    }
  }

  if (node.nodeType === PROCESSING_INSTRUCTION_NODE) {
    return {
      type: 'processing-instruction',
      index: siblingIndex(node, PROCESSING_INSTRUCTION_NODE)
    }
  }

  return null
}

export function xmlNodeAddress(node) {
  if (!node) return null
  if (node.nodeType === DOCUMENT_NODE) return [{ type: 'document' }]

  if (node.nodeType === ATTRIBUTE_NODE) {
    const ownerAddress = xmlNodeAddress(node.ownerElement)
    return ownerAddress
      ? [...ownerAddress, { type: 'attribute', name: node.name }]
      : null
  }

  const segments = []
  let current = node

  while (current && current.nodeType !== DOCUMENT_NODE) {
    const segment = nodeAddressSegment(current)
    if (!segment) return null
    segments.unshift(segment)
    current = current.parentNode
  }

  return segments.length > 0 ? segments : null
}

function compareDocumentOrder(left, right) {
  if (left === right) return 0

  try {
    if (
      left.compareDocumentPosition(right) & DOCUMENT_POSITION_FOLLOWING
    ) {
      return -1
    }
    if (
      right.compareDocumentPosition(left) & DOCUMENT_POSITION_FOLLOWING
    ) {
      return 1
    }
  } catch {
    return 0
  }

  return 0
}

function collectResultNodes(result) {
  if (NODE_ITERATOR_TYPES.has(result.resultType)) {
    const nodes = []
    let node = result.iterateNext()
    while (node) {
      nodes.push(node)
      node = result.iterateNext()
    }
    return nodes
  }

  if (NODE_SNAPSHOT_TYPES.has(result.resultType)) {
    return Array.from(
      { length: result.snapshotLength },
      (_, index) => result.snapshotItem(index)
    ).filter(Boolean)
  }

  if (SINGLE_NODE_TYPES.has(result.resultType)) {
    return result.singleNodeValue ? [result.singleNodeValue] : []
  }

  return null
}

function serializeNode(node) {
  const document = node.nodeType === DOCUMENT_NODE ? node : node.ownerDocument
  const Serializer =
    document?.defaultView?.XMLSerializer || globalThis.XMLSerializer

  if (!Serializer) return '// 当前环境不支持 XML 序列化'

  const serializer = new Serializer()
  return serializer.serializeToString(node)
}

function serializeResultNode(node) {
  if (node.nodeType === ELEMENT_NODE || node.nodeType === DOCUMENT_NODE) {
    return serializeNode(node)
  }

  if (node.nodeType === ATTRIBUTE_NODE) {
    return `@${node.name}="${escapeXmlAttribute(node.value)}"`
  }

  if (node.nodeType === TEXT_NODE) {
    return node.nodeValue ?? ''
  }

  if (node.nodeType === CDATA_SECTION_NODE) {
    const value = String(node.nodeValue ?? '').replace(
      /\]\]>/g,
      ']]]]><![CDATA[>'
    )
    return `<![CDATA[${value}]]>`
  }

  if (node.nodeType === COMMENT_NODE) {
    return `<!--${node.nodeValue ?? ''}-->`
  }

  if (node.nodeType === PROCESSING_INSTRUCTION_NODE) {
    const target = node.target || node.nodeName || ''
    return node.data ? `<?${target} ${node.data}?>` : `<?${target}?>`
  }

  return String(node.nodeValue ?? '')
}

function formatScalarResult(result) {
  if (result.resultType === XPATH_NUMBER_TYPE) {
    return String(result.numberValue)
  }
  if (result.resultType === XPATH_STRING_TYPE) {
    return result.stringValue || '// 空字符串'
  }
  if (result.resultType === XPATH_BOOLEAN_TYPE) {
    return String(result.booleanValue)
  }
  return ''
}

export function evaluateXmlFilter(expression, source, parsedDocument = null) {
  if (typeof expression !== 'string' || expression.trim() === '') {
    return emptyResult()
  }

  const document =
    parsedDocument && typeof parsedDocument.evaluate === 'function'
      ? parsedDocument
      : null
  if (!document) {
    const parsed = parseXmlDocument(source)
    if (!parsed.ok) {
      return errorResult(parsed.error?.displayMessage || 'XML 解析失败')
    }
    return evaluateXmlFilter(expression, source, parsed.document)
  }
  if (typeof document.evaluate !== 'function') {
    return errorResult('当前环境不支持 XPath')
  }

  const bindings = namespaceBindings(document)
  const conflicting = conflictingNamespace(expression.trim(), bindings)
  if (conflicting) {
    return errorResult(
      `XPath 前缀 "${conflicting.prefix}" 在文档中绑定了多个命名空间（${conflicting.uris.join(
        '、'
      )}）；浏览器 XPath 1.0 无法按分支动态绑定，请改用唯一前缀或 local-name()/namespace-uri()`
    )
  }

  let result
  try {
    result = document.evaluate(
      expression.trim(),
      document,
      createNamespaceResolver(bindings),
      XPATH_ANY_TYPE,
      null
    )
  } catch (error) {
    return errorResult(
      `XPath 执行失败：${
        error && typeof error.message === 'string' ? error.message : '表达式无效'
      }`
    )
  }

  const nodes = collectResultNodes(result)
  if (nodes === null) {
    return {
      ok: true,
      output: formatScalarResult(result),
      count: 0,
      firstAddress: null
    }
  }

  const orderedNodes = nodes.slice().sort(compareDocumentOrder)
  if (orderedNodes.length === 0) {
    return {
      ok: true,
      output: '// 未匹配到节点',
      count: 0,
      firstAddress: null
    }
  }

  const rendered = orderedNodes
    .slice(0, RENDERED_NODE_LIMIT)
    .map(serializeResultNode)
  if (orderedNodes.length > RENDERED_NODE_LIMIT) {
    rendered.push(
      `<!-- 仅显示前 ${RENDERED_NODE_LIMIT} 项，共 ${orderedNodes.length} 项 -->`
    )
  }

  let firstAddress = null
  for (const node of orderedNodes) {
    firstAddress = xmlNodeAddress(node)
    if (firstAddress) break
  }

  return {
    ok: true,
    output: rendered.join('\n\n'),
    count: orderedNodes.length,
    firstAddress
  }
}
