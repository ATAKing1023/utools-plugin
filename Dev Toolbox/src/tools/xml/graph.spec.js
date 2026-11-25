import { describe, expect, it } from 'vitest'
import { collapseAllCardIds } from '../json/graph.js'
import { buildXmlGraph } from './graph.js'

describe('xml relationship graph', () => {
  it('builds element cards with attribute, text, comment, CDATA and child rows', () => {
    const graph = buildXmlGraph(
      '<root id="1"><item kind="a">Alpha</item>' +
        '<!-- note --><![CDATA[raw <value>]]><empty/></root>'
    )

    expect(graph.ok).toBe(true)
    expect(graph.rootId).toBe('/root')
    expect(graph.cards.map((card) => card.id)).toEqual([
      '/root',
      '/root/item',
      '/root/empty'
    ])

    const root = graph.cards[0]
    expect(root.type).toBe('object')
    expect(root.rows.map((row) => row.label)).toEqual([
      '@id',
      'item',
      '#comment',
      '#cdata',
      'empty'
    ])
    expect(root.rows.map((row) => row.type)).toEqual([
      'string',
      'object',
      'string',
      'string',
      'object'
    ])
    expect(root.childIds).toEqual(['/root/item', '/root/empty'])
    expect(graph.edges.map((edge) => edge.to)).toEqual([
      '/root/item',
      '/root/empty'
    ])

    const item = graph.cards[1]
    expect(item.rows.map((row) => row.label)).toEqual(['@kind', '#text'])
    expect(item.rows[1].value).toBe('Alpha')
  })

  it('skips whitespace-only indentation text but keeps mixed content', () => {
    const graph = buildXmlGraph(
      '<root>\n  <a>1</a>\n  <b>Hello <i>x</i>!</b>\n</root>'
    )

    expect(graph.ok).toBe(true)
    expect(graph.cards[0].rows.map((row) => row.label)).toEqual(['a', 'b'])

    const mixed = graph.cards.find((card) => card.id === '/root/b')
    expect(mixed.rows.map((row) => row.label)).toEqual([
      '#text',
      'i',
      '#text'
    ])
    expect(mixed.rows[0].value).toBe('Hello ')
    expect(mixed.rows[2].value).toBe('!')
  })

  it('collapses every element card that has child cards, including the root', () => {
    const graph = buildXmlGraph('<root><a><b/></a></root>')

    expect(graph.ok).toBe(true)
    expect(collapseAllCardIds(graph)).toEqual(['/root', '/root/a'])
  })

  it('numbers only duplicate sibling element paths', () => {
    const graph = buildXmlGraph(
      '<root><role>a</role><role>b</role><role>c</role><user/></root>'
    )

    expect(graph.ok).toBe(true)
    expect(graph.cards.map((card) => card.id)).toEqual([
      '/root',
      '/root/role[1]',
      '/root/role[2]',
      '/root/role[3]',
      '/root/user'
    ])
  })

  it('reports input, row and depth limits instead of a graph', () => {
    const tooLarge = buildXmlGraph(
      '<root><!--' + 'x'.repeat(3 * 1024 * 1024) + '--></root>'
    )
    expect(tooLarge.ok).toBe(false)
    expect(tooLarge.limit).toBe('inputBytes')

    const manyRows = buildXmlGraph('<root>' + '<a/>'.repeat(10001) + '</root>')
    expect(manyRows.ok).toBe(false)
    expect(manyRows.limit).toBe('rows')

    const manyCards = buildXmlGraph('<root>' + '<a/>'.repeat(501) + '</root>')
    expect(manyCards.ok).toBe(true)

    let deep = ''
    for (let index = 0; index < 130; index += 1) deep += '<a>'
    deep += 'x'
    for (let index = 0; index < 130; index += 1) deep += '</a>'
    const tooDeep = buildXmlGraph(deep)
    expect(tooDeep.ok).toBe(false)
    expect(tooDeep.limit).toBe('containerDepth')
  })

  it('passes malformed XML errors through', () => {
    const graph = buildXmlGraph('<root><item></root>')

    expect(graph.ok).toBe(false)
    expect(typeof graph.error.displayMessage).toBe('string')
  })
})
