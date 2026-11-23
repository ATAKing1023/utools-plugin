import { describe, expect, it } from 'vitest'
import { buildXmlTree } from './tree.js'

describe('xml tree model', () => {
  const xml = [
    '<?xml version="1.0"?>',
    '<root id="1">',
    '  <item kind="a">text</item>',
    '  <!-- hello -->',
    '  <![CDATA[raw <value>]]>',
    '  <empty/>',
    '</root>'
  ].join('\n')

  it('builds an open root with attributes before children', () => {
    const result = buildXmlTree(xml)

    expect(result.ok).toBe(true)
    expect(result.nodes).toHaveLength(1)

    const root = result.nodes[0]
    expect(root).toMatchObject({
      label: 'root',
      kind: 'element',
      defaultOpen: true
    })
    expect(root.children[0]).toMatchObject({
      label: '@id',
      kind: 'attribute',
      value: '1'
    })
    expect(root.children[1]).toMatchObject({
      label: 'item',
      kind: 'element',
      defaultOpen: false
    })
  })

  it('renders element, attribute, text, comment and CDATA kinds', () => {
    const result = buildXmlTree(xml)
    const root = result.nodes[0]
    const item = root.children.find((node) => node.label === 'item')
    const comment = root.children.find((node) => node.kind === 'comment')
    const cdata = root.children.find((node) => node.kind === 'cdata')
    const empty = root.children.find((node) => node.label === 'empty')

    expect(item.children[0]).toMatchObject({
      label: '@kind',
      kind: 'attribute',
      value: 'a'
    })
    expect(item.children[1]).toMatchObject({
      label: '#text',
      kind: 'text',
      value: 'text'
    })
    expect(comment).toMatchObject({
      label: '#comment',
      value: ' hello '
    })
    expect(cdata).toMatchObject({
      label: '#cdata',
      value: 'raw <value>'
    })
    expect(empty).toMatchObject({
      kind: 'element',
      children: []
    })
  })

  it('ignores whitespace-only formatting text', () => {
    const result = buildXmlTree('<root>\n  <item> value </item>\n</root>')
    const root = result.nodes[0]
    const item = root.children.find((node) => node.label === 'item')

    expect(root.children.filter((node) => node.kind === 'text')).toEqual([])
    expect(item.children).toHaveLength(1)
    expect(item.children[0].value).toBe('value')
  })

  it('includes top-level comments alongside the root', () => {
    const result = buildXmlTree('<!--before--><root/>')

    expect(result.ok).toBe(true)
    expect(result.nodes.map((node) => node.kind)).toEqual([
      'comment',
      'element'
    ])
    expect(result.nodes[1].defaultOpen).toBe(true)
  })

  it('produces unique path-based IDs', () => {
    const result = buildXmlTree(
      '<root><a><x>1</x></a><a><x>2</x></a><!--c--><!--c--></root>'
    )
    const ids = []

    const visit = (node) => {
      ids.push(node.id)
      for (const child of node.children || []) visit(child)
    }

    for (const node of result.nodes) visit(node)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('returns an error state for invalid XML without throwing', () => {
    const result = buildXmlTree('<root><item></root>')

    expect(result.ok).toBe(false)
    expect(typeof result.error.message).toBe('string')
  })
})
