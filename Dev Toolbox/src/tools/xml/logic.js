import { XMLValidator } from 'fast-xml-parser'

const ELEMENT_NODE = 1
const TEXT_NODE = 3
const CDATA_SECTION_NODE = 4
const PROCESSING_INSTRUCTION_NODE = 7
const COMMENT_NODE = 8
const DOCUMENT_TYPE_NODE = 10
const XML_NAMESPACE = 'http://www.w3.org/XML/1998/namespace'

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

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function doctypeIdentifiersFromSource(source, name) {
  if (typeof source !== 'string' || !name) return null

  const pattern = new RegExp(
    `<!DOCTYPE\\s+${escapeRegExp(name)}\\s+(?:PUBLIC\\s+(['"])([\\s\\S]*?)\\1\\s+(['"])([\\s\\S]*?)\\3|SYSTEM\\s+(['"])([\\s\\S]*?)\\5)`,
    'i'
  )
  const match = pattern.exec(source)
  if (!match) return null

  if (match[2] !== undefined) {
    return {
      publicId: match[2],
      systemId: match[4] ?? ''
    }
  }

  return {
    publicId: '',
    systemId: match[6] ?? ''
  }
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
  let result = `<!DOCTYPE ${name}`

  if (publicId) {
    if (!systemId) {
      throw new Error('DOCTYPE PUBLIC 标识符缺少 SYSTEM 标识符。')
    }
    result += ` PUBLIC ${quoteDoctypeIdentifier(publicId)}`
    result += ` ${quoteDoctypeIdentifier(systemId)}`
  } else if (systemId) {
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

function isWhitespaceOnlyText(node) {
  return (
    node.nodeType === TEXT_NODE &&
    String(node.nodeValue ?? '').trim().length === 0
  )
}

function isIndentationWhitespace(node) {
  return (
    isWhitespaceOnlyText(node) &&
    /(?:\r\n|\r|\n)[ \t]+$/.test(String(node.nodeValue ?? ''))
  )
}

function isBoundaryNewline(children, index) {
  const value = String(children[index].nodeValue ?? '')
  if (!/^(?:\r\n|\r|\n)$/.test(value)) return false

  const hasElementBefore = children
    .slice(0, index)
    .some((child) => child.nodeType === ELEMENT_NODE)
  const hasElementAfter = children
    .slice(index + 1)
    .some((child) => child.nodeType === ELEMENT_NODE)

  return !hasElementBefore || !hasElementAfter
}

function hasElementChild(element) {
  return childNodes(element).some(
    (child) => child.nodeType === ELEMENT_NODE
  )
}

function hasNonWhitespaceText(element) {
  return childNodes(element).some(
    (child) =>
      child.nodeType === TEXT_NODE &&
      String(child.nodeValue ?? '').trim().length > 0
  )
}

function resolveSpaceMode(element, inheritedSpace = 'default') {
  const directValue = element.getAttribute?.('xml:space')
  const namespacedValue = element.getAttributeNS?.(XML_NAMESPACE, 'space')
  const value = directValue ?? namespacedValue

  if (value === 'preserve') return 'preserve'
  if (value === 'default') return 'default'
  return inheritedSpace
}

function shouldIgnoreFormattingWhitespace(element, spaceMode) {
  if (spaceMode === 'preserve') return false
  return hasElementChild(element) && !hasNonWhitespaceText(element)
}

function presentationChildren(element, spaceMode) {
  const ignoreFormattingWhitespace = shouldIgnoreFormattingWhitespace(
    element,
    spaceMode
  )

  const children = childNodes(element)

  return children.filter((child, index) => {
    if (!ignoreFormattingWhitespace || !isWhitespaceOnlyText(child)) {
      return true
    }
    if (isIndentationWhitespace(child)) return false
    return !isBoundaryNewline(children, index)
  })
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
  const children = presentationChildren(element, spaceMode)

  if (children.length === 0) return `<${name}${attributes}/>`

  return `<${name}${attributes}>${children
    .map((child) => serializeInlineNode(child, spaceMode))
    .join('')}</${name}>`
}

function serializeElement(element, depth, inheritedSpace = 'default') {
  const padding = indent(depth)
  const name = element.nodeName
  const attributes = serializeAttributes(element)
  const spaceMode = resolveSpaceMode(element, inheritedSpace)
  const children = presentationChildren(element, spaceMode)

  if (children.length === 0) {
    return `${padding}<${name}${attributes}/>`
  }

  if (
    spaceMode === 'preserve' ||
    children.some((child) => child.nodeType === TEXT_NODE)
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
  const match = /^\uFEFF?\s*(<\?xml[\s\S]*?\?>)/i.exec(value)
  return match ? match[1].trim() : ''
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

    if (declaration && !lines[0]?.toLowerCase().startsWith('<?xml')) {
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
