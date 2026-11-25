import { XMLValidator } from 'fast-xml-parser'

const ELEMENT_NODE = 1
const TEXT_NODE = 3
const CDATA_SECTION_NODE = 4
const PROCESSING_INSTRUCTION_NODE = 7
const COMMENT_NODE = 8
const DOCUMENT_TYPE_NODE = 10
const XML_NAMESPACE = 'http://www.w3.org/XML/1998/namespace'

export const JSON_XML_NAMESPACE = 'https://dev-toolbox.local/json'
export const JSON_XML_PREFIX = 'tb'
const XMLNS_NAMESPACE = 'http://www.w3.org/2000/xmlns/'

function isPositiveInteger(value) {
  return Number.isInteger(value) && value > 0
}

function createXmlError(message, line, column, code = 'InvalidXml') {
  let displayMessage = message
  if (isPositiveInteger(line) && isPositiveInteger(column)) {
    displayMessage = `${message}\n位置：第 ${line} 行，第 ${column} 列`
  } else if (isPositiveInteger(line)) {
    displayMessage = `${message}\n位置：第 ${line} 行`
  } else if (isPositiveInteger(column)) {
    displayMessage = `${message}\n位置：第 ${column} 列`
  }

  return {
    code,
    message,
    displayMessage,
    line: isPositiveInteger(line) ? line : null,
    column: isPositiveInteger(column) ? column : null
  }
}

export function isXmlInputEmpty(value) {
  return typeof value !== 'string' || value.trim().length === 0
}

export function validateXml(value) {
  if (typeof value !== 'string') {
    return {
      ok: false,
      error: createXmlError('XML 输入必须是文本', null, null)
    }
  }

  let result
  try {
    result = XMLValidator.validate(value)
  } catch (error) {
    return {
      ok: false,
      error: createXmlError(
        error && typeof error.message === 'string'
          ? error.message
          : 'XML 校验失败',
        null,
        null
      )
    }
  }

  if (result === true) return { ok: true }

  const details = result?.err || {}
  const message =
    typeof details.msg === 'string' && details.msg
      ? details.msg
      : 'XML 格式无效'
  const line = isPositiveInteger(details.line) ? details.line : null
  const column = isPositiveInteger(details.col) ? details.col : null

  return {
    ok: false,
    error: createXmlError(message, line, column, details.code || 'InvalidXml')
  }
}

export function parseParserErrorMessage(text) {
  const rawMessage =
    typeof text === 'string' && text.trim() ? text.trim() : 'XML 解析失败'
  const patterns = [
    /error on line\s+(\d+)\s+at column\s+(\d+)/i,
    /(?:^|\n)\s*(\d+):(\d+):/i,
    /\bline\s+(\d+)(?:,\s*|\s+)column\s+(\d+)\b/i
  ]

  let line = null
  let column = null

  for (const pattern of patterns) {
    const match = pattern.exec(rawMessage)
    if (!match) continue
    line = Number(match[1])
    column = Number(match[2])
    break
  }

  return createXmlError(
    rawMessage,
    isPositiveInteger(line) ? line : null,
    isPositiveInteger(column) ? column : null
  )
}

export function parseXmlDocument(value) {
  if (typeof value !== 'string') {
    return {
      ok: false,
      error: createXmlError('XML 输入必须是文本', null, null)
    }
  }

  let document
  try {
    document = new DOMParser().parseFromString(value, 'application/xml')
  } catch (error) {
    return {
      ok: false,
      error: createXmlError(
        error && typeof error.message === 'string'
          ? error.message
          : 'XML 解析失败',
        null,
        null
      )
    }
  }

  const parserError =
    document.querySelector?.('parsererror') ||
    (document.documentElement?.nodeName?.toLowerCase() === 'parsererror'
      ? document.documentElement
      : null)

  if (parserError) {
    return {
      ok: false,
      error: parseParserErrorMessage(parserError.textContent)
    }
  }

  if (!document.documentElement) {
    return {
      ok: false,
      error: createXmlError('XML 解析失败：未找到根元素', null, null)
    }
  }

  return { ok: true, document }
}

function jsonTypeMarker(node, name) {
  return (
    node.getAttributeNS?.(JSON_XML_NAMESPACE, name) ??
    node.getAttribute?.(`${JSON_XML_PREFIX}:${name}`) ??
    null
  )
}

export function isJsonXmlMetadataAttribute(attribute) {
  return (
    attribute.namespaceURI === XMLNS_NAMESPACE ||
    attribute.namespaceURI === JSON_XML_NAMESPACE ||
    attribute.name === 'xmlns' ||
    attribute.name?.startsWith('xmlns:') ||
    attribute.name?.startsWith(`${JSON_XML_PREFIX}:`)
  )
}

function xmlNodeToJson(node) {
  const elementChildren = []
  let text = ''

  childNodes(node).forEach((child) => {
    if (child.nodeType === ELEMENT_NODE) {
      elementChildren.push(child)
      return
    }
    if (child.nodeType === TEXT_NODE || child.nodeType === CDATA_SECTION_NODE) {
      text += String(child.nodeValue ?? '')
    }
  })

  const attributes = {}
  Array.from(node.attributes || []).forEach((attribute) => {
    if (isJsonXmlMetadataAttribute(attribute)) return
    attributes[`@${attribute.name}`] = attribute.value
  })
  const trimmedText = text.trim()
  const hasAttributes = Object.keys(attributes).length > 0
  const explicitType = jsonTypeMarker(node, 'type')
  const arrayMarker = jsonTypeMarker(node, 'array')

  let converted

  if (explicitType === 'null') {
    converted = null
  } else if (explicitType === 'number') {
    converted = Number(trimmedText)
  } else if (explicitType === 'boolean') {
    converted = trimmedText === 'true'
  } else if (explicitType === 'string') {
    converted = trimmedText
  } else if (
    elementChildren.length === 0 &&
    !hasAttributes &&
    explicitType !== 'object'
  ) {
    converted = trimmedText
  } else {
    const result = { ...attributes }
    elementChildren.forEach((child) => {
      const name = child.nodeName
      const childValue = xmlNodeToJson(child)
      if (!Object.prototype.hasOwnProperty.call(result, name)) {
        result[name] = childValue
      } else if (Array.isArray(result[name])) {
        result[name].push(childValue)
      } else {
        result[name] = [result[name], childValue]
      }
    })

    if (trimmedText) result['#text'] = trimmedText
    converted = result
  }

  if (arrayMarker === 'top') {
    const items = elementChildren
      .filter((child) => child.nodeName === 'item')
      .map((child) => xmlNodeToJson(child))
    if (items.length > 0) return items
    return Array.isArray(converted) ? converted : []
  }

  if (arrayMarker) {
    if (
      elementChildren.length === 0 &&
      !trimmedText &&
      !hasAttributes &&
      explicitType === null
    ) {
      return []
    }
    return [converted]
  }

  return converted
}

export function xmlToJson(value) {
  const parsed = parseXmlDocument(value)
  if (!parsed.ok) return parsed

  const root = parsed.document.documentElement
  if (!root) {
    return {
      ok: false,
      error: createXmlError('XML 解析失败：未找到根元素', null, null)
    }
  }

  const converted = xmlNodeToJson(root)
  if (root.nodeName === 'root') {
    return { ok: true, value: converted }
  }

  return {
    ok: true,
    value: { [root.nodeName]: converted }
  }
}

export function escapeXmlText(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

export function escapeXmlAttribute(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/\r/g, '&#13;')
    .replace(/\n/g, '&#10;')
    .replace(/\t/g, '&#9;')
}

function indent(depth) {
  return '  '.repeat(depth)
}

function serializeAttributes(element) {
  return Array.from(element.attributes || [])
    .map(
      (attribute) =>
        ` ${attribute.name}="${escapeXmlAttribute(attribute.value)}"`
    )
    .join('')
}

function serializeComment(node) {
  return `<!--${node.nodeValue ?? ''}-->`
}

function serializeCdata(node) {
  return `<![CDATA[${String(node.nodeValue ?? '').replace(
    /\]\]>/g,
    ']]]]><![CDATA[>'
  )}]]>`
}

function serializeProcessingInstruction(node) {
  const target = node.target || node.nodeName || ''
  const data = typeof node.data === 'string' ? node.data : ''
  return data ? `<?${target} ${data}?>` : `<?${target}?>`
}

function skipMarkupConstruct(source, start, terminator) {
  const end = source.indexOf(terminator, start)
  return end < 0 ? -1 : end + terminator.length
}

function readMarkupDeclaration(source, start) {
  let quote = null
  let subsetDepth = 0

  for (let index = start; index < source.length; index += 1) {
    const character = source[index]

    if (!quote && source.startsWith('<!--', index)) {
      const end = skipMarkupConstruct(source, index + 4, '-->')
      if (end < 0) return ''
      index = end - 1
      continue
    }

    if (!quote && source.startsWith('<?', index)) {
      const end = skipMarkupConstruct(source, index + 2, '?>')
      if (end < 0) return ''
      index = end - 1
      continue
    }

    if (!quote && source.startsWith('<![CDATA[', index)) {
      const end = skipMarkupConstruct(source, index + 9, ']]>')
      if (end < 0) return ''
      index = end - 1
      continue
    }

    if (quote) {
      if (character === quote) quote = null
      continue
    }

    if (character === '"' || character === "'") {
      quote = character
    } else if (character === '[') {
      subsetDepth += 1
    } else if (character === ']' && subsetDepth > 0) {
      subsetDepth -= 1
    } else if (character === '>' && subsetDepth === 0) {
      return source.slice(start, index + 1)
    }
  }

  return ''
}

function doctypeDeclarationFromSource(source) {
  if (typeof source !== 'string') return ''

  let index = 0
  while (index < source.length) {
    const start = source.indexOf('<', index)
    if (start < 0) return ''

    if (source.startsWith('<!--', start)) {
      index = skipMarkupConstruct(source, start + 4, '-->')
      if (index < 0) return ''
      continue
    }

    if (source.startsWith('<?', start)) {
      index = skipMarkupConstruct(source, start + 2, '?>')
      if (index < 0) return ''
      continue
    }

    if (source.startsWith('<![CDATA[', start)) {
      index = skipMarkupConstruct(source, start + 9, ']]>')
      if (index < 0) return ''
      continue
    }

    if (/^<!DOCTYPE(?:\s|$)/i.test(source.slice(start, start + 10))) {
      return readMarkupDeclaration(source, start)
    }

    index = start + 1
  }

  return ''
}

function skipWhitespace(source, start) {
  let index = start
  while (index < source.length && /\s/.test(source[index])) index += 1
  return index
}

function readDoctypeLiteral(source, start) {
  const quote = source[start]
  if (quote !== '"' && quote !== "'") return null

  const end = source.indexOf(quote, start + 1)
  if (end < 0) return null

  return {
    value: source.slice(start + 1, end),
    end
  }
}

function parseDoctypeIdentifiers(declaration, name) {
  if (!declaration) return null

  let index = skipWhitespace(declaration, '<!DOCTYPE'.length)
  const nameStart = index
  while (
    index < declaration.length &&
    !/\s/.test(declaration[index]) &&
    declaration[index] !== '[' &&
    declaration[index] !== '>'
  ) {
    index += 1
  }

  const declaredName = declaration.slice(nameStart, index)
  if (name && declaredName && declaredName !== name) return null

  index = skipWhitespace(declaration, index)
  const publicKeyword = /^PUBLIC(?:\s|$)/i.test(declaration.slice(index, index + 7))

  if (publicKeyword) {
    index = skipWhitespace(declaration, index + 6)
    const publicId = readDoctypeLiteral(declaration, index)
    if (!publicId) return null

    index = skipWhitespace(declaration, publicId.end + 1)
    const systemId = readDoctypeLiteral(declaration, index)
    if (!systemId) return null

    return {
      publicId: publicId.value,
      systemId: systemId.value,
      hasPublicId: true,
      hasSystemId: true
    }
  }

  if (/^SYSTEM(?:\s|$)/i.test(declaration.slice(index, index + 7))) {
    index = skipWhitespace(declaration, index + 6)
    const systemId = readDoctypeLiteral(declaration, index)
    if (!systemId) return null

    return {
      publicId: '',
      systemId: systemId.value,
      hasPublicId: false,
      hasSystemId: true
    }
  }

  return {
    publicId: '',
    systemId: '',
    hasPublicId: false,
    hasSystemId: false
  }
}

function doctypeIdentifiersFromSource(source, name) {
  const declaration = doctypeDeclarationFromSource(source)
  return declaration ? parseDoctypeIdentifiers(declaration, name) : null
}

export function quoteDoctypeIdentifier(value) {
  const identifier = String(value)

  if (!identifier.includes('"')) return `"${identifier}"`
  if (!identifier.includes("'")) return `'${identifier}'`

  throw new Error(
    'DOCTYPE 标识符同时包含单引号和双引号，无法安全序列化。'
  )
}

function serializeDoctype(node, source) {
  const name = node.name || node.nodeName || 'root'
  const fromSource = doctypeIdentifiersFromSource(source, name)
  const publicId = fromSource?.publicId ?? node.publicId ?? ''
  const systemId = fromSource?.systemId ?? node.systemId ?? ''
  const hasPublicId =
    fromSource?.hasPublicId ?? Boolean(node.publicId)
  const hasSystemId =
    fromSource?.hasSystemId ?? Boolean(node.systemId)
  let result = `<!DOCTYPE ${name}`

  if (hasPublicId) {
    if (!hasSystemId) {
      throw new Error('DOCTYPE PUBLIC 标识符缺少 SYSTEM 标识符。')
    }
    result += ` PUBLIC ${quoteDoctypeIdentifier(publicId)}`
    result += ` ${quoteDoctypeIdentifier(systemId)}`
  } else if (hasSystemId) {
    result += ` SYSTEM ${quoteDoctypeIdentifier(systemId)}`
  }

  if (node.internalSubset) {
    result += ` [${node.internalSubset}]`
  }

  return `${result}>`
}

function childNodes(node) {
  return Array.from(node.childNodes || [])
}

function resolveSpaceMode(element, inheritedSpace = 'default') {
  const directValue = element.getAttribute?.('xml:space')
  const namespacedValue = element.getAttributeNS?.(XML_NAMESPACE, 'space')
  const value = directValue ?? namespacedValue

  if (value === 'preserve') return 'preserve'
  if (value === 'default') return 'default'
  return inheritedSpace
}

function serializeInlineNode(node, inheritedSpace) {
  switch (node.nodeType) {
    case ELEMENT_NODE:
      return serializeElementInline(node, inheritedSpace)
    case TEXT_NODE:
      return escapeXmlText(node.nodeValue ?? '')
    case CDATA_SECTION_NODE:
      return serializeCdata(node)
    case COMMENT_NODE:
      return serializeComment(node)
    case PROCESSING_INSTRUCTION_NODE:
      return serializeProcessingInstruction(node)
    default:
      return ''
  }
}

function serializeElementInline(element, inheritedSpace) {
  const name = element.nodeName
  const attributes = serializeAttributes(element)
  const spaceMode = resolveSpaceMode(element, inheritedSpace)
  const children = childNodes(element)

  if (children.length === 0) return `<${name}${attributes}/>`

  return `<${name}${attributes}>${children
    .map((child) => serializeInlineNode(child, spaceMode))
    .join('')}</${name}>`
}

function containsDirectTextContent(children) {
  return children.some(
    (child) =>
      child.nodeType === TEXT_NODE ||
      child.nodeType === CDATA_SECTION_NODE
  )
}

function serializeElement(
  element,
  depth,
  inheritedSpace = 'default'
) {
  const padding = indent(depth)
  const name = element.nodeName
  const attributes = serializeAttributes(element)
  const spaceMode = resolveSpaceMode(element, inheritedSpace)
  const children = childNodes(element)

  if (children.length === 0) {
    return `${padding}<${name}${attributes}/>`
  }

  if (
    spaceMode === 'preserve' ||
    containsDirectTextContent(children)
  ) {
    return `${padding}<${name}${attributes}>${children
      .map((child) => serializeInlineNode(child, spaceMode))
      .join('')}</${name}>`
  }

  const childLines = children.map((child) => {
    switch (child.nodeType) {
      case ELEMENT_NODE:
        return serializeElement(child, depth + 1, spaceMode)
      case COMMENT_NODE:
        return `${indent(depth + 1)}${serializeComment(child)}`
      case CDATA_SECTION_NODE:
        return `${indent(depth + 1)}${serializeCdata(child)}`
      case PROCESSING_INSTRUCTION_NODE:
        return `${indent(depth + 1)}${serializeProcessingInstruction(child)}`
      default:
        return ''
    }
  })

  return [
    `${padding}<${name}${attributes}>`,
    ...childLines.filter(Boolean),
    `${padding}</${name}>`
  ].join('\n')
}

function serializeTopLevelNode(node, source) {
  switch (node.nodeType) {
    case ELEMENT_NODE:
      return serializeElement(node, 0, 'default')
    case COMMENT_NODE:
      return serializeComment(node)
    case PROCESSING_INSTRUCTION_NODE:
      return serializeProcessingInstruction(node)
    case DOCUMENT_TYPE_NODE:
      return serializeDoctype(node, source)
    case CDATA_SECTION_NODE:
      return serializeCdata(node)
    default:
      return ''
  }
}

function extractXmlDeclaration(value) {
  if (typeof value !== 'string') return ''
  const match = /^\uFEFF?\s*(<\?xml\s+[\s\S]*?\?>)/i.exec(value)
  return match ? match[1].trim() : ''
}

function isXmlDeclaration(value) {
  return /^<\?xml(?:\s|$)/i.test(String(value).trimStart())
}

export function formatXmlText(value) {
  const validation = validateXml(value)
  if (!validation.ok) return validation

  const parsed = parseXmlDocument(value)
  if (!parsed.ok) return parsed

  try {
    const lines = Array.from(parsed.document.childNodes)
      .map((node) => serializeTopLevelNode(node, value))
      .filter(Boolean)
    const declaration = extractXmlDeclaration(value)

    if (declaration && !isXmlDeclaration(lines[0] ?? '')) {
      lines.unshift(declaration)
    }

    return {
      ok: true,
      value: lines.join('\n')
    }
  } catch (error) {
    return {
      ok: false,
      error: createXmlError(
        error && typeof error.message === 'string'
          ? error.message
          : 'XML 格式化失败',
        null,
        null
      )
    }
  }
}
