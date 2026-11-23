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
    expect(
      root.children.find((node) => node.label === 'item')
    ).toMatchObject({
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

  it('keeps direct CDATA-only and CDATA-plus-element content in hierarchy', () => {
    const result = buildXmlTree(
      '<root><code><![CDATA[  significant  ]]></code>' +
        '<note><![CDATA[a]]><b>c</b></note></root>'
    )
    const root = result.nodes[0]
    const code = root.children.find((node) => node.label === 'code')
    const note = root.children.find((node) => node.label === 'note')

    expect(code.children).toEqual([
      expect.objectContaining({
        label: '#cdata',
        kind: 'cdata',
        value: '  significant  '
      })
    ])
    expect(note.children).toEqual([
      expect.objectContaining({
        label: '#cdata',
        kind: 'cdata',
        value: 'a'
      }),
      expect.objectContaining({
        label: 'b',
        kind: 'element'
      })
    ])
  })

  it('retains indentation and text-node whitespace without trimming', () => {
    const result = buildXmlTree('<root>\n  <item> value </item>\n</root>')
    const root = result.nodes[0]
    const item = root.children.find((node) => node.label === 'item')

    expect(
      root.children
        .filter((node) => node.kind === 'text')
        .map((node) => node.value)
    ).toEqual(['\n  ', '\n'])
    expect(item.children).toHaveLength(1)
    expect(item.children[0].value).toBe(' value ')
  })

  it('shows mixed-content separator text without trimming', () => {
    const result = buildXmlTree(
      '<root><p>Hello <b>world</b> <i>again</i>!</p></root>'
    )
    const p = result.nodes[0].children.find(
      (node) => node.label === 'p'
    )
    const textValues = p.children
      .filter((node) => node.kind === 'text')
      .map((node) => node.value)

    expect(textValues).toEqual(['Hello ', ' ', '!'])
  })

  it('keeps whitespace-only separators between inline elements', () => {
    const result = buildXmlTree(
      '<root><p><b>Hello</b> <i>world</i></p></root>'
    )
    const p = result.nodes[0].children.find(
      (node) => node.label === 'p'
    )
    const textValues = p.children
      .filter((node) => node.kind === 'text')
      .map((node) => node.value)

    expect(textValues).toEqual([' '])
  })

  it('keeps a bare newline separator between inline elements', () => {
    const result = buildXmlTree(
      '<root><p><b>Hello</b>\n<i>world</i></p></root>'
    )
    const p = result.nodes[0].children.find(
      (node) => node.label === 'p'
    )
    const textValues = p.children
      .filter((node) => node.kind === 'text')
      .map((node) => node.value)

    expect(textValues).toEqual(['\n'])
  })

  it.each([
    ['newline-space', '\n ', '\n '],
    ['newline-indent', '\n  ', '\n  '],
    ['crlf', '\r\n ', '\n '],
    ['newline-tab', '\n\t', '\n\t']
  ])(
    'keeps %s separators between inline elements as text',
    (_name, separator, normalizedSeparator) => {
      const result = buildXmlTree(
        `<root><p><b>Hello</b>${separator}<i>world</i></p></root>`
      )
      const p = result.nodes[0].children.find(
        (node) => node.label === 'p'
      )
      const textValues = p.children
        .filter((node) => node.kind === 'text')
        .map((node) => node.value)

      expect(textValues).toEqual([normalizedSeparator])
    }
  )

  it.each([
    ['newline-space', '\n ', '\n '],
    ['newline-indent', '\n  ', '\n  '],
    ['crlf', '\r\n ', '\n '],
    ['newline-tab', '\n\t', '\n\t']
  ])(
    'keeps %s separators between empty inline elements as text',
    (_name, separator, normalizedSeparator) => {
      const paragraphResult = buildXmlTree(
        `<root><p><b></b>${separator}<i></i></p></root>`
      )
      const paragraph = paragraphResult.nodes[0].children.find(
        (node) => node.label === 'p'
      )
      const paragraphTextValues = paragraph.children
        .filter((node) => node.kind === 'text')
        .map((node) => node.value)

      expect(paragraphTextValues).toEqual([normalizedSeparator])

      const rootResult = buildXmlTree(
        `<root><a/>${separator}<b/></root>`
      )
      const rootTextValues = rootResult.nodes[0].children
        .filter((node) => node.kind === 'text')
        .map((node) => node.value)

      expect(rootTextValues).toEqual([normalizedSeparator])
    }
  )

  it('shows whitespace-only separators in preserve-space subtrees', () => {
    const result = buildXmlTree(
      '<root><code xml:space="preserve">  leading <b>and</b> trailing  </code></root>'
    )
    const code = result.nodes[0].children.find(
      (node) => node.label === 'code'
    )
    const textValues = code.children
      .filter((node) => node.kind === 'text')
      .map((node) => node.value)

    expect(textValues).toEqual(['  leading ', ' trailing  '])

    const inherited = buildXmlTree(
      '<root xml:space="preserve"> <a/> </root>'
    )
    const inheritedTextValues = inherited.nodes[0].children
      .filter((node) => node.kind === 'text')
      .map((node) => node.value)

    expect(inheritedTextValues).toEqual([' ', ' '])
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
