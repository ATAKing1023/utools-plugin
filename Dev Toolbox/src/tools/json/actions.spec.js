import { describe, expect, it } from 'vitest'
import {
  compressEscapedJsonText,
  compressJsonText,
  detectJsonSource,
  evaluateJsFilter,
  jsonToTypeScript,
  jsonToTypeScriptInterface,
  jsonToXml,
  parseUrlParamsSource,
  parseXmlSource,
  parseYamlSource,
  stripJsonComments
} from './actions.js'

describe('json editor actions', () => {
  it('removes line and block comments without touching string contents', () => {
    const source = [
      '{',
      '  // a line comment',
      '  /* a block',
      '     comment */',
      '  "url": "https://example.com//path",',
      '  "text": "not // a comment"',
      '}'
    ].join('\n')

    const stripped = stripJsonComments(source)

    expect(stripped).not.toContain('a line comment')
    expect(stripped).not.toContain('a block')
    expect(stripped).toContain('"https://example.com//path"')
    expect(stripped).toContain('"not // a comment"')
    expect(JSON.parse(stripped)).toEqual({
      url: 'https://example.com//path',
      text: 'not // a comment'
    })
  })

  it('keeps escaped quotes inside strings intact', () => {
    const source = '{ "a": "he said \\"hi\\" // not a comment" }'
    const stripped = stripJsonComments(source)

    expect(stripped).toContain('// not a comment')
    expect(JSON.parse(stripped)).toEqual({
      a: 'he said "hi" // not a comment'
    })
  })

  it('compresses json without losing number literals or string spacing', () => {
    const source = [
      '{',
      '  "a": 1,',
      '  "b": 2.50,',
      '  "c": 1e3,',
      '  "d": 0.10,',
      '  "text": "keep  space"',
      '}'
    ].join('\n')

    const compressed = compressJsonText(source)

    expect(compressed).toBe(
      '{"a":1,"b":2.50,"c":1e3,"d":0.10,"text":"keep  space"}'
    )
    expect(JSON.parse(compressed)).toEqual({
      a: 1,
      b: 2.5,
      c: 1000,
      d: 0.1,
      text: 'keep  space'
    })
  })

  it('escapes the compressed json so it can be embedded in a string literal', () => {
    const source = '{\n  "a": "quote \\" and \\\\ slash",\n  "b": 1\n}'

    const compressed = compressJsonText(source)
    const escaped = compressEscapedJsonText(source)

    expect(escaped).not.toBe(compressed)
    expect(escaped).toBe(
      '{\\"a\\":\\"quote \\\\\\" and \\\\\\\\ slash\\",\\"b\\":1}'
    )
    expect(JSON.parse(`"${escaped}"`)).toBe(compressed)
  })

  it('keeps escaped quotes intact while compressing', () => {
    const source = '{ "a": "he said \\"hi\\"", "b": 2 }'

    expect(compressJsonText(source)).toBe('{"a":"he said \\"hi\\"","b":2}')
  })

  it('converts json to xml with attributes and nested children', () => {
    const xml = jsonToXml({
      user: { '@id': '1', name: 'Ada' }
    })

    expect(xml).toContain('<user id="1">')
    expect(xml).toContain('<name>Ada</name>')
  })

  it('escapes xml special characters', () => {
    const xml = jsonToXml({ text: 'a & b < c > d' })

    expect(xml).toContain('a &amp; b &lt; c &gt; d')
    expect(xml).not.toContain('< c')
  })

  it('converts json to xml with a root attribute and repeated children', () => {
    const xml = jsonToXml({
      '@id': '1',
      name: 'Ada',
      tag: ['a', 'b']
    })

    expect(xml).toBe('<root id="1"><name>Ada</name><tag>a</tag><tag>b</tag></root>')
  })

  it('marks empty and ambiguous values so they survive a round trip', () => {
    expect(jsonToXml({ empty: {} })).toBe(
      '<empty xmlns:tb="https://dev-toolbox.local/json" tb:type="object"/>'
    )
    expect(jsonToXml({ value: null })).toBe(
      '<value xmlns:tb="https://dev-toolbox.local/json" tb:type="null"/>'
    )
    expect(jsonToXml({ list: [] })).toBe(
      '<list xmlns:tb="https://dev-toolbox.local/json" tb:array="top"/>'
    )
    expect(jsonToXml({ list: ['a'] })).toBe(
      '<list xmlns:tb="https://dev-toolbox.local/json" tb:array="top"><item>a</item></list>'
    )
    expect(jsonToXml({ root: { empty: {} } })).toBe(
      '<root xmlns:tb="https://dev-toolbox.local/json"><empty tb:type="object"/></root>'
    )
  })

  it('only adds the marker namespace when a marker is needed', () => {
    expect(jsonToXml({ name: 'Ada', tags: ['a', 'b'] })).not.toContain(
      'xmlns:tb'
    )
  })

  it('converts json to a typescript shape', () => {
    const typescript = jsonToTypeScript({
      name: 'Ada',
      age: 36,
      active: true,
      tags: ['x'],
      empty: []
    })

    expect(typescript).toContain('name: string')
    expect(typescript).toContain('age: number')
    expect(typescript).toContain('active: boolean')
    expect(typescript).toContain('tags: string[]')
    expect(typescript).toContain('empty: unknown[]')
  })

  it('keeps null typed as null instead of an object', () => {
    expect(jsonToTypeScript({ d: null })).toContain('d: null')
    expect(jsonToTypeScript({ d: null })).not.toContain('Record<string, unknown>')
  })

  it('emits a valid typescript interface with semicolons and nested members', () => {
    const typescript = jsonToTypeScriptInterface({
      name: 'Ada',
      age: 36,
      active: true,
      tags: ['x'],
      empty: [],
      profile: { city: 'Paris' }
    })

    expect(typescript).toContain('export interface RootObject {')
    expect(typescript).toContain('  name: string;')
    expect(typescript).toContain('  age: number;')
    expect(typescript).toContain('  active: boolean;')
    expect(typescript).toContain('  tags: string[];')
    expect(typescript).toContain('  empty: unknown[];')
    expect(typescript).toContain('  profile: {')
    expect(typescript).toContain('    city: string;')
  })

  it('quotes typescript keys that are not valid identifiers', () => {
    const typescript = jsonToTypeScriptInterface({ 'a-b': 1, '2c': 2 })

    expect(typescript).toContain('  "a-b": number;')
    expect(typescript).toContain('  "2c": number;')
  })

  it('represents a mixed array as a union array type', () => {
    expect(jsonToTypeScript({ a: [1, 'x'] })).toContain('a: (number | string)[]')
  })

  it('detects JSON, URL params, XML and YAML sources', () => {
    expect(detectJsonSource('{"name":"Ada"}')).toMatchObject({
      ok: true,
      source: 'json',
      value: { name: 'Ada' }
    })

    expect(parseUrlParamsSource('name=Ada&role=admin')).toEqual({
      ok: true,
      source: 'urlparams',
      value: { name: 'Ada', role: 'admin' }
    })

    expect(
      parseXmlSource('<root id="1"><name>Ada</name></root>')
    ).toEqual({
      ok: true,
      source: 'xml',
      value: {
        '@id': '1',
        name: 'Ada'
      }
    })

    expect(parseYamlSource('name: Ada\nactive: true')).toEqual({
      ok: true,
      source: 'yaml',
      value: { name: 'Ada', active: true }
    })
  })

  it('returns a source-specific error for malformed XML and falls back to JSON errors', () => {
    const malformed = detectJsonSource('<root><item></root>')
    expect(malformed.ok).toBe(false)
    expect(malformed.source).toBe('xml')
    expect(malformed.error.displayMessage).toContain('XML')

    const invalid = detectJsonSource('{')
    expect(invalid.ok).toBe(false)
    expect(invalid.source).toBe('json')
    expect(invalid.error.displayMessage).toContain('JSON')
  })

  it('evaluates JS filters with path, index and map expressions', () => {
    const context = {
      key: { subkey: 'value' },
      rows: [{ val: 1 }, { val: 2 }],
      matrix: [[1, 2]]
    }

    expect(evaluateJsFilter('.key.subkey', context)).toEqual({
      ok: true,
      output: '"value"'
    })
    expect(evaluateJsFilter('[0][1]', [[1, 2]])).toEqual({
      ok: true,
      output: '2'
    })
    expect(evaluateJsFilter('.rows.map(x=>x.val)', context)).toEqual({
      ok: true,
      output: '[\n  1,\n  2\n]'
    })
    expect(evaluateJsFilter('.missing.value', context).output).toContain('//')
  })
})
