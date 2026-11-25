import { parse as parseYaml } from 'yaml'
import { parseJsonText } from './logic.js'
import {
  JSON_XML_NAMESPACE,
  JSON_XML_PREFIX,
  xmlToJson
} from '../xml/logic.js'

export function stripJsonComments(text) {
  if (typeof text !== 'string') return ''

  let result = ''
  let inString = false
  let inLineComment = false
  let inBlockComment = false

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index]
    const next = text[index + 1]

    if (inLineComment) {
      if (character === '\n') {
        inLineComment = false
        result += character
      }
      continue
    }

    if (inBlockComment) {
      if (character === '*' && next === '/') {
        inBlockComment = false
        index += 1
      } else if (character === '\n') {
        result += character
      }
      continue
    }

    if (inString) {
      result += character
      if (character === '\\') {
        if (index + 1 < text.length) {
          result += text[index + 1]
          index += 1
        }
        continue
      }
      if (character === '"') inString = false
      continue
    }

    if (character === '"') {
      inString = true
      result += character
      continue
    }

    if (character === '/' && next === '/') {
      inLineComment = true
      index += 1
      continue
    }

    if (character === '/' && next === '*') {
      inBlockComment = true
      index += 1
      continue
    }

    result += character
  }

  return result
}

export function compressJsonText(text) {
  if (typeof text !== 'string') return ''

  let result = ''
  let inString = false
  let escaped = false

  for (const character of text) {
    if (inString) {
      result += character
      if (escaped) {
        escaped = false
        continue
      }
      if (character === '\\') {
        escaped = true
        continue
      }
      if (character === '"') inString = false
      continue
    }

    if (character === '"') {
      inString = true
      result += character
      continue
    }

    if (
      character === ' ' ||
      character === '\n' ||
      character === '\r' ||
      character === '\t'
    ) {
      continue
    }

    result += character
  }

  return result
}

export function compressEscapedJsonText(text) {
  const compressed = compressJsonText(text)
  return JSON.stringify(compressed).slice(1, -1)
}

export const JSON_SOURCE_LABELS = Object.freeze({
  json: 'JSON',
  urlparams: 'URL Params',
  xml: 'XML',
  yaml: 'YAML'
})

function looksLikeXml(text) {
  const trimmed = text.trim()
  return trimmed.startsWith('<') && trimmed.endsWith('>')
}

function xmlElementToJson(element) {
  const attributes = {}
  for (const attribute of element.attributes) {
    attributes[`@${attribute.name}`] = attribute.value
  }

  const children = [...element.children]
  const text = [...element.childNodes]
    .filter((node) => node.nodeType === 3)
    .map((node) => node.nodeValue || '')
    .join('')
    .trim()

  if (children.length === 0) {
    if (Object.keys(attributes).length > 0) {
      if (text) attributes['#text'] = text
      return attributes
    }
    return text
  }

  const result = { ...attributes }
  for (const child of children) {
    const key = child.nodeName
    const value = xmlElementToJson(child)
    if (result[key] === undefined) {
      result[key] = value
    } else if (Array.isArray(result[key])) {
      result[key].push(value)
    } else {
      result[key] = [result[key], value]
    }
  }
  if (text) result['#text'] = text
  return result
}

function sourceError(message, input = '') {
  const text = typeof input === 'string' ? input : ''
  return {
    message,
    displayMessage: message,
    position: null,
    line: null,
    column: null,
    inputLength: text.length
  }
}

export function parseUrlParamsSource(text) {
  if (typeof text !== 'string') return null
  const trimmed = text.trim()
  if (!trimmed || trimmed.startsWith('{') || trimmed.startsWith('[')) return null

  const candidate = trimmed.startsWith('?') ? trimmed.slice(1) : trimmed
  if (!candidate.includes('=')) return null
  if (
    !/^[^\s&=]+=[^\s&]*(?:&[^\s&=]+=[^\s&]*)+$/.test(candidate) &&
    !/^[^\s&=]+=[^\s&]*$/.test(candidate)
  ) {
    return null
  }

  try {
    const params = new URLSearchParams(candidate)
    const value = Object.fromEntries(params)
    if (Object.keys(value).length === 0) return null
    return { ok: true, source: 'urlparams', value }
  } catch (error) {
    return null
  }
}

export function parseXmlSource(text) {
  if (typeof text !== 'string' || !looksLikeXml(text)) return null

  const parsed = xmlToJson(text)
  if (!parsed.ok) {
    return {
      ok: false,
      source: 'xml',
      error: {
        message: 'XML 解析失败，请检查标签是否闭合',
        displayMessage: 'XML 解析失败，请检查标签是否闭合',
        position: null,
        line: parsed.error?.line ?? null,
        column: parsed.error?.column ?? null
      }
    }
  }

  return {
    ok: true,
    source: 'xml',
    value: parsed.value
  }
}

function looksLikeYaml(text) {
  return /^[A-Za-z_][\w.-]{0,39}\s*:(\s|$)/m.test(text)
}

export function parseYamlSource(text) {
  if (typeof text !== 'string' || !looksLikeYaml(text)) return null

  try {
    const value = parseYaml(text)
    if (value === undefined) return null
    return { ok: true, source: 'yaml', value }
  } catch (error) {
    return {
      ok: false,
      source: 'yaml',
      error: sourceError(
        error && typeof error.message === 'string'
          ? error.message
          : 'YAML 解析失败',
        text
      )
    }
  }
}

export function detectJsonSource(text) {
  const parsedJson = parseJsonText(text)
  if (parsedJson.ok) {
    return { ok: true, source: 'json', value: parsedJson.value }
  }

  const urlParams = parseUrlParamsSource(text)
  if (urlParams) return urlParams

  const xml = parseXmlSource(text)
  if (xml) return xml

  const yaml = parseYamlSource(text)
  if (yaml) return yaml

  return {
    ok: false,
    source: 'json',
    error: parsedJson.error
  }
}

function isJsonContainerText(value) {
  return (
    typeof value === 'string' &&
    /^\s*(\{[\s\S]*\}|\[[\s\S]*\])\s*$/.test(value)
  )
}

function formatFilterResult(value) {
  try {
    if (value === undefined) return '// undefined'
    if (typeof value === 'function') return '// function'

    let output = value
    if (isJsonContainerText(output)) {
      try {
        output = JSON.parse(output)
      } catch {
        // Keep the original string when it only resembles JSON.
      }
    }

    const serialized = JSON.stringify(output, null, 2)
    return serialized === undefined ? '// undefined' : serialized
  } catch (error) {
    return `// ${error && typeof error.message === 'string' ? error.message : '无法序列化' }`
  }
}

export function evaluateJsFilter(expression, context) {
  if (typeof expression !== 'string' || expression.trim() === '') {
    return { ok: true, output: '' }
  }

  try {
    const result = Function(
      'context',
      `return (function(){ return this${expression}; }).call(context);`
    )(context)
    return { ok: true, output: formatFilterResult(result) }
  } catch (error) {
    return {
      ok: false,
      output: `// ${
        error && typeof error.message === 'string'
          ? error.message
          : '过滤表达式执行失败'
      }`
    }
  }
}

function escapeXmlText(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

function escapeXmlAttribute(value) {
  return escapeXmlText(value).replace(/"/g, '&quot;')
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

export function jsonToXml(value, rootName = 'root') {
  const name = rootName || 'root'
  let usesMarkers = false

  function marker(name, value) {
    usesMarkers = true
    return ` ${JSON_XML_PREFIX}:${name}="${value}"`
  }

  function namespaceDeclaration() {
    return usesMarkers
      ? ` xmlns:${JSON_XML_PREFIX}="${JSON_XML_NAMESPACE}"`
      : ''
  }

  function injectNamespace(xml) {
    if (!usesMarkers || xml.includes('xmlns:')) return xml
    const match = /^<[^\s/>]+/.exec(xml)
    if (!match) return xml
    return `${match[0]}${namespaceDeclaration()}${xml.slice(match[0].length)}`
  }

  function serializeElement(node, nodeName, extraAttributes = '') {
    if (node === null) {
      return `<${nodeName}${extraAttributes}${marker('type', 'null')}/>`
    }

    if (typeof node === 'string') {
      if (node === '') {
        return `<${nodeName}${extraAttributes}${marker('type', 'string')}/>`
      }
      return `<${nodeName}${extraAttributes}>${escapeXmlText(node)}</${nodeName}>`
    }

    if (typeof node === 'number' || typeof node === 'boolean') {
      return `<${nodeName}${extraAttributes}${marker(
        'type',
        typeof node
      )}>${String(node)}</${nodeName}>`
    }

    if (Array.isArray(node)) {
      if (node.length >= 2) {
        return node
          .map((item) => serializeElement(item, nodeName))
          .join('')
      }

      const arrayMarker = marker('array', '1')
      if (node.length === 0) {
        return `<${nodeName}${extraAttributes}${arrayMarker}/>`
      }

      return serializeElement(
        node[0],
        nodeName,
        `${extraAttributes}${arrayMarker}`
      )
    }

    if (isPlainObject(node)) {
      const entries = Object.entries(node)
      const attributes = entries
        .filter(([key]) => key.startsWith('@'))
        .map(
          ([key, item]) =>
            ` ${key.slice(1)}="${escapeXmlAttribute(item)}"`
        )
        .join('')

      const contentEntries = entries.filter(([key]) => !key.startsWith('@'))
      if (contentEntries.length === 0) {
        if (attributes) {
          return `<${nodeName}${extraAttributes}${attributes}/>`
        }
        return `<${nodeName}${extraAttributes}${marker('type', 'object')}/>`
      }

      let content = ''
      for (const [key, item] of contentEntries) {
        if (key === '#text') {
          content += escapeXmlText(item)
        } else if (key === '#cdata') {
          content += `<![CDATA[${String(item).replace(
            /]]>/g,
            ']]]]><![CDATA[>'
          )}]]>`
        } else {
          content += serializeElement(item, key)
        }
      }
      return `<${nodeName}${extraAttributes}${attributes}>${content}</${nodeName}>`
    }

    return `<${nodeName}${extraAttributes}${marker('type', 'null')}/>`
  }

  function rootElement(attributes, content) {
    const namespace = usesMarkers
      ? ` xmlns:${JSON_XML_PREFIX}="${JSON_XML_NAMESPACE}"`
      : ''
    if (content === '') {
      return `<${name}${namespace}${attributes}/>`
    }
    return `<${name}${namespace}${attributes}>${content}</${name}>`
  }

  let xml

  if (Array.isArray(value)) {
    const arrayMarker = marker('array', 'top')
    const content = value
      .map((item) => serializeElement(item, 'item'))
      .join('')
    xml = rootElement(arrayMarker, content)
  } else if (isPlainObject(value)) {
    const keys = Object.keys(value)

    if (keys.length === 0) {
      xml = rootElement(marker('type', 'object'), '')
    } else if (keys.length === 1) {
      const [key] = keys
      const item = value[key]

      if (Array.isArray(item)) {
        const arrayMarker = marker('array', 'top')
        const content = item
          .map((entry) => serializeElement(entry, 'item'))
          .join('')
        xml = injectNamespace(
          content === ''
            ? `<${key}${arrayMarker}/>`
            : `<${key}${arrayMarker}>${content}</${key}>`
        )
      } else {
        xml = serializeElement(item, key)
        xml = injectNamespace(xml)
      }
    } else {
      const attributes = keys
        .filter((key) => key.startsWith('@'))
        .map((key) => ` ${key.slice(1)}="${escapeXmlAttribute(value[key])}"`)
        .join('')
      const content = keys
        .filter((key) => !key.startsWith('@'))
        .map((key) => serializeElement(value[key], key))
        .join('')
      xml = rootElement(attributes, content)
    }
  } else {
    xml = serializeElement(value, name)
    xml = injectNamespace(xml)
  }

  return xml
}

const TS_TYPE_BY_JSON_TYPE = Object.freeze({
  string: 'string',
  number: 'number',
  boolean: 'boolean',
  null: 'null',
  array: 'unknown[]',
  object: 'Record<string, unknown>'
})

function isTypeScriptIdentifier(key) {
  return /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(key)
}

function typeScriptKey(key) {
  return isTypeScriptIdentifier(key) ? key : JSON.stringify(key)
}

function tsTypeInline(value) {
  if (value === null) return 'null'

  if (Array.isArray(value)) {
    if (value.length === 0) return 'unknown[]'
    const itemTypes = new Set(value.map((item) => tsTypeInline(item)))
    if (itemTypes.size === 1) return `${[...itemTypes][0]}[]`
    return `(${[...itemTypes].join(' | ')})[]`
  }

  if (isPlainObject(value)) {
    const entries = Object.entries(value)
    if (entries.length === 0) return 'Record<string, unknown>'
    const parts = entries.map(
      ([key, item]) => `${typeScriptKey(key)}: ${tsTypeInline(item)}`
    )
    return `{ ${parts.join('; ')} }`
  }

  return TS_TYPE_BY_JSON_TYPE[typeof value] ?? 'unknown'
}

function tsTypeOf(value, indent) {
  if (value === null) return 'null'

  if (Array.isArray(value)) {
    if (value.length === 0) return 'unknown[]'
    const itemTypes = new Set(value.map((item) => tsTypeInline(item)))
    if (itemTypes.size === 1) {
      const [itemType] = [...itemTypes]
      return `${itemType}[]`
    }
    return `(${[...itemTypes].join(' | ')})[]`
  }

  if (isPlainObject(value)) {
    const entries = Object.entries(value)
    if (entries.length === 0) return 'Record<string, unknown>'

    const pad = '  '.repeat(indent + 1)
    const lines = entries.map(
      ([key, item]) => `${pad}${typeScriptKey(key)}: ${tsTypeOf(item, indent + 1)};`
    )
    return `{\n${lines.join('\n')}\n${'  '.repeat(indent)}}`
  }

  return TS_TYPE_BY_JSON_TYPE[typeof value] ?? 'unknown'
}

export function jsonToTypeScript(value, indent = 0) {
  return tsTypeOf(value, indent)
}

export function jsonToTypeScriptInterface(value, rootName = 'RootObject') {
  if (!isPlainObject(value)) {
    return `export type ${rootName} = ${tsTypeInline(value)};`
  }

  const entries = Object.entries(value)
  if (entries.length === 0) {
    return `export interface ${rootName} {\n  [key: string]: unknown;\n}`
  }

  const lines = entries.map(
    ([key, item]) => `  ${typeScriptKey(key)}: ${tsTypeOf(item, 1)};`
  )
  return `export interface ${rootName} {\n${lines.join('\n')}\n}`
}

export const JSON_ACTION_IDS = Object.freeze([
  'format',
  'compress',
  'compress-escaped',
  'strip-comments',
  'to-xml',
  'to-typescript'
])
