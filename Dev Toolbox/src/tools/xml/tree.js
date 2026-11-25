import { isJsonXmlMetadataAttribute, parseXmlDocument } from './logic.js'

const ELEMENT_NODE = 1
const TEXT_NODE = 3
const CDATA_SECTION_NODE = 4
const COMMENT_NODE = 8
const XML_NAMESPACE = 'http://www.w3.org/XML/1998/namespace'

function resolveSpaceMode(element, inheritedSpace = 'default') {
  const directValue = element.getAttribute?.('xml:space')
  const namespacedValue = element.getAttributeNS?.(XML_NAMESPACE, 'space')
  const value = directValue ?? namespacedValue

  if (value === 'preserve') return 'preserve'
  if (value === 'default') return 'default'
  return inheritedSpace
}

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

function createElementNode(element, id, depth, inheritedSpace = 'default') {
  const spaceMode = resolveSpaceMode(element, inheritedSpace)
  const children = Array.from(element.attributes || [])
    .filter((attribute) => !isJsonXmlMetadataAttribute(attribute))
    .map((attribute) => createAttributeNode(attribute, id))
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
      if (!value.trim() && spaceMode !== 'preserve') return
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
