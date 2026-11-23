import { XMLValidator } from 'fast-xml-parser'

const ELEMENT_NODE = 1
const TEXT_NODE = 3
const CDATA_SECTION_NODE = 4
const PROCESSING_INSTRUCTION_NODE = 7
const COMMENT_NODE = 8
const DOCUMENT_TYPE_NODE = 10

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

function serializeDoctype(node) {
  let result = `<!DOCTYPE ${node.name || node.nodeName || 'root'}`

  if (node.publicId) {
    result += ` PUBLIC "${node.publicId}"`
  } else if (node.systemId) {
    result += ' SYSTEM'
  }

  if (node.systemId) {
    result += ` "${node.systemId}"`
  }

  if (node.internalSubset) {
    result += ` [${node.internalSubset}]`
  }

  return `${result}>`
}

function meaningfulChildren(node) {
  return Array.from(node.childNodes || []).filter((child) => {
    if (child.nodeType !== TEXT_NODE) return true
    return String(child.nodeValue ?? '').trim().length > 0
  })
}

function serializeInlineNode(node) {
  switch (node.nodeType) {
    case ELEMENT_NODE:
      return serializeElementInline(node)
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

function serializeElementInline(element) {
  const name = element.nodeName
  const attributes = serializeAttributes(element)
  const children = meaningfulChildren(element)

  if (children.length === 0) return `<${name}${attributes}/>`

  return `<${name}${attributes}>${children
    .map(serializeInlineNode)
    .join('')}</${name}>`
}

function serializeTextOnlyElement(element, children) {
  const content = children
    .map((child) => {
      if (child.nodeType === TEXT_NODE) {
        return escapeXmlText(String(child.nodeValue ?? '').trim())
      }
      return serializeInlineNode(child)
    })
    .join('')

  return `<${element.nodeName}${serializeAttributes(
    element
  )}>${content}</${element.nodeName}>`
}

function serializeMixedElement(element, children) {
  return `<${element.nodeName}${serializeAttributes(element)}>${children
    .map(serializeInlineNode)
    .join('')}</${element.nodeName}>`
}

function serializeElement(element, depth) {
  const children = meaningfulChildren(element)
  const padding = indent(depth)
  const name = element.nodeName
  const attributes = serializeAttributes(element)

  if (children.length === 0) {
    return `${padding}<${name}${attributes}/>`
  }

  const hasText = children.some((child) => child.nodeType === TEXT_NODE)
  const hasNonText = children.some((child) => child.nodeType !== TEXT_NODE)

  if (hasText && hasNonText) {
    return `${padding}${serializeMixedElement(element, children)}`
  }

  if (hasText) {
    return `${padding}${serializeTextOnlyElement(element, children)}`
  }

  const childLines = children.map((child) => {
    switch (child.nodeType) {
      case ELEMENT_NODE:
        return serializeElement(child, depth + 1)
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

function serializeTopLevelNode(node) {
  switch (node.nodeType) {
    case ELEMENT_NODE:
      return serializeElement(node, 0)
    case COMMENT_NODE:
      return serializeComment(node)
    case PROCESSING_INSTRUCTION_NODE:
      return serializeProcessingInstruction(node)
    case DOCUMENT_TYPE_NODE:
      return serializeDoctype(node)
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
      .map(serializeTopLevelNode)
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
