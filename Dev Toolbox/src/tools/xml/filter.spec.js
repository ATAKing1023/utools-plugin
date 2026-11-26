import { describe, expect, it } from 'vitest'
import { evaluateXmlFilter } from './filter.js'
import { parseXmlDocument } from './logic.js'

const source = [
  '<root>',
  '  <item id="1">Alpha</item>',
  '  <item id="2">Beta</item>',
  '</root>'
].join('\n')

describe('xml filter', () => {
  it('returns matching element nodes in document order', () => {
    const result = evaluateXmlFilter('//item', source)

    expect(result.ok).toBe(true)
    expect(result.count).toBe(2)
    expect(result.output).toContain('<item id="1">Alpha</item>')
    expect(result.output).toContain('<item id="2">Beta</item>')
    expect(result.firstAddress).toEqual([
      { type: 'element', name: 'root', index: 0 },
      { type: 'element', name: 'item', index: 0 }
    ])
  })

  it('reuses a document that has already been parsed', () => {
    const parsed = parseXmlDocument(source)
    const result = evaluateXmlFilter(
      '//item',
      '<this source is intentionally invalid>',
      parsed.document
    )

    expect(result.ok).toBe(true)
    expect(result.count).toBe(2)
  })

  it('returns attribute addresses for source selection', () => {
    const result = evaluateXmlFilter('//item[2]/@id', source)

    expect(result.ok).toBe(true)
    expect(result.output).toBe('@id="2"')
    expect(result.firstAddress).toEqual([
      { type: 'element', name: 'root', index: 0 },
      { type: 'element', name: 'item', index: 1 },
      { type: 'attribute', name: 'id' }
    ])
  })

  it('formats scalar XPath results without a locate address', () => {
    const result = evaluateXmlFilter('count(//item)', source)

    expect(result).toEqual({
      ok: true,
      output: '2',
      count: 0,
      firstAddress: null
    })
  })

  it('reports invalid expressions and empty node sets', () => {
    const invalid = evaluateXmlFilter('//[', source)
    expect(invalid.ok).toBe(false)
    expect(invalid.output).toContain('XPath 执行失败')

    expect(evaluateXmlFilter('//missing', source)).toEqual({
      ok: true,
      output: '// 未匹配到节点',
      count: 0,
      firstAddress: null
    })
  })

  it('resolves namespace prefixes declared in the document', () => {
    const namespaced =
      '<root xmlns:demo="urn:demo"><demo:item>value</demo:item></root>'
    const result = evaluateXmlFilter('//demo:item', namespaced)

    expect(result.ok).toBe(true)
    expect(result.count).toBe(1)
    expect(result.output).toContain('<demo:item')
    expect(result.output).toContain('>value</demo:item>')
  })

  it('reports prefixes bound to conflicting namespaces instead of dropping matches', () => {
    const namespaced = [
      '<root>',
      '  <branch xmlns:demo="urn:one"><demo:item>A</demo:item></branch>',
      '  <branch xmlns:demo="urn:two"><demo:item>B</demo:item></branch>',
      '</root>'
    ].join('\n')
    const result = evaluateXmlFilter('//demo:item', namespaced)

    expect(result.ok).toBe(false)
    expect(result.output).toContain('前缀 "demo"')
    expect(result.output).toContain('urn:one')
    expect(result.output).toContain('urn:two')
    expect(result.output).toContain('local-name()/namespace-uri()')

    const literalOnly = evaluateXmlFilter(
      `count(//branch[contains(., 'demo:item')])`,
      namespaced
    )
    expect(literalOnly.ok).toBe(true)
    expect(literalOnly.output).toBe('0')
  })
})
