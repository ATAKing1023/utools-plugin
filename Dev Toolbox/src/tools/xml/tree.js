import { parseXmlDocument } from './logic.js'

const ELEMENT_NODE = 1
const TEXT_NODE = 3
const CDATA_SECTION_NODE = 4
const COMMENT_NODE = 8
const XML_NAMESPACE = 'http://www.w3.org/XML/1998/namespace'

function createAttributeNode(attribute, parentId) {
  return {
    id: `${parentId}/@[${JSON.stringify(attribute.name)}]`,
    label: `@${attribute.name}`,
    value: attribute.value,
    kind: 'attribute',
    defaultOpen: false
  }
}

function childNodes(node) {
  return Array.from(node.childNodes || [])
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

function isIndentationWhitespace(value) {
  return (
    value.trim().length === 0 &&
    /(?:\r\n|\r|\n)[ \t]+$/.test(value)
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

function createElementNode(
  element,
  id,
  depth,
  inheritedSpace = 'default'
) {
  const children = Array.from(element.attributes || []).map((attribute) =>
    createAttributeNode(attribute, id)
  )
  const spaceMode = resolveSpaceMode(element, inheritedSpace)
  const ignoreFormattingWhitespace = shouldIgnoreFormattingWhitespace(
    element,
    spaceMode
  )
  const elementChildren = childNodes(element)

  elementChildren.forEach((child, sourceIndex) => {
    if (child.nodeType === ELEMENT_NODE) {
      children.push(
        createElementNode(
          child,
          `${id}/${child.nodeName}[${sourceIndex}]`,
          depth + 1,
          spaceMode
        )
      )
      return
    }

    if (child.nodeType === COMMENT_NODE) {
      children.push({
        id: `${id}/comment[${sourceIndex}]`,
        label: '#comment',
        value: child.nodeValue ?? '',
        kind: 'comment',
        defaultOpen: false
      })
      return
    }

    if (child.nodeType === CDATA_SECTION_NODE) {
      children.push({
        id: `${id}/cdata[${sourceIndex}]`,
        label: '#cdata',
        value: child.nodeValue ?? '',
        kind: 'cdata',
        defaultOpen: false
      })
      return
    }

    if (child.nodeType === TEXT_NODE) {
      const value = String(child.nodeValue ?? '')
      if (!value) return
      if (
        ignoreFormattingWhitespace &&
        (isIndentationWhitespace(value) ||
          isBoundaryNewline(elementChildren, sourceIndex))
      ) {
        return
      }
      children.push({
        id: `${id}/text[${sourceIndex}]`,
        label: '#text',
        value,
        kind: 'text',
        defaultOpen: false
      })
    }
  })

  return {
    id,
    label: element.nodeName,
    kind: 'element',
    children,
    defaultOpen: depth === 0
  }
}

export function buildXmlTree(value) {
  const parsed = parseXmlDocument(value)
  if (!parsed.ok) return parsed

  const nodes = []

  Array.from(parsed.document.childNodes).forEach((child, sourceIndex) => {
    if (child.nodeType === ELEMENT_NODE) {
      nodes.push(
        createElementNode(
          child,
          `/${child.nodeName}[${sourceIndex}]`,
          0,
          'default'
        )
      )
      return
    }

    if (child.nodeType === COMMENT_NODE) {
      nodes.push({
        id: `/comment[${sourceIndex}]`,
        label: '#comment',
        value: child.nodeValue ?? '',
        kind: 'comment',
        defaultOpen: false
      })
    }
  })

  if (nodes.length === 0) {
    return {
      ok: false,
      error: {
        code: 'InvalidXml',
        message: 'XML 解析失败：未找到可显示的节点',
        displayMessage: 'XML 解析失败：未找到可显示的节点',
        line: null,
        column: null
      }
    }
  }

  return { ok: true, nodes }
}
