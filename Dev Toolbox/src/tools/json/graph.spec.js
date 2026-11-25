import { describe, expect, it } from 'vitest'
import {
  GRAPH_LIMITS,
  buildJsonGraph,
  clampGraphScale,
  collapseAllCardIds,
  fitGraphTransform,
  formatGraphValue,
  graphKeyLabel,
  inspectJsonGraphLimits,
  layoutGraph,
  previewGraphValue,
  projectVisibleGraph,
  resetGraphTransform,
  revealGraphRectTransform,
  semanticTypeOf,
  truncateGraphText,
  utf8ByteLength
} from './graph.js'

function graphOf(value) {
  return buildJsonGraph(value, JSON.stringify(value))
}

function nestedArray(depth, leaf = 'leaf') {
  let value = leaf
  for (let index = 0; index < depth; index += 1) {
    value = [value]
  }
  return value
}

function paddedToBytes(value, targetBytes) {
  const serialized = JSON.stringify(value)
  return `${' '.repeat(targetBytes - utf8ByteLength(serialized))}${serialized}`
}

describe('json graph model', () => {
  it('derives container cards, primitive rows, paths, types, and labeled edges in input order', () => {
    const value = {
      name: 'toolbox',
      nested: {
        enabled: true,
        deeper: { count: 0 }
      },
      items: ['alpha', { deep: null }],
      'a["b"]': { '': 1 }
    }
    const graph = graphOf(value)
    const root = graph.cards[0]

    expect(graph.ok).toBe(true)
    expect(graph.rootId).toBe('$')
    expect(root).toMatchObject({
      id: '$',
      path: '$',
      label: '$',
      parentId: null,
      depth: 0,
      type: 'object',
      count: 4
    })
    expect(root.rows.map((row) => row.label)).toEqual([
      'name',
      'nested',
      'items',
      'a["b"]'
    ])
    expect(root.rows.map((row) => row.path)).toEqual([
      '$["name"]',
      '$["nested"]',
      '$["items"]',
      '$["a[\\"b\\"]"]'
    ])
    expect(root.rows.map((row) => row.type)).toEqual([
      'string',
      'object',
      'array',
      'object'
    ])
    expect(root.rows[0]).toMatchObject({
      preview: '"toolbox"',
      isContainer: false,
      childId: null
    })
    expect(root.rows[1]).toMatchObject({
      preview: '对象 · 2 个属性',
      isContainer: true,
      childId: '$["nested"]'
    })

    const nested = graph.cards.find((card) => card.id === '$["nested"]')
    expect(nested.rows.map((row) => row.label)).toEqual([
      'enabled',
      'deeper'
    ])
    expect(nested.rows[1].path).toBe('$["nested"]["deeper"]')
    expect(graph.edges.map((edge) => edge.label)).toEqual([
      'nested',
      'deeper',
      'items',
      '[1]',
      'a["b"]'
    ])
    expect(graph.edges.map((edge) => edge.to)).toEqual([
      '$["nested"]',
      '$["nested"]["deeper"]',
      '$["items"]',
      '$["items"][1]',
      '$["a[\\"b\\"]"]'
    ])
    expect(graph.stats).toEqual({
      inputBytes: utf8ByteLength(JSON.stringify(value)),
      cards: 6,
      rows: 11
    })
  })

  it('represents primitive roots and every primitive semantic type', () => {
    const cases = [
      ['line\nbreak', 'string', '"line\\nbreak"'],
      [42, 'number', '42'],
      [-0, 'number', '-0'],
      [false, 'boolean', 'false'],
      [null, 'null', 'null']
    ]

    for (const [value, type, preview] of cases) {
      const graph = graphOf(value)
      expect(graph.ok).toBe(true)
      expect(graph.cards).toHaveLength(1)
      expect(graph.cards[0]).toMatchObject({
        id: '$',
        type,
        rows: [],
        childIds: [],
        preview
      })
      expect(graph.edges).toEqual([])
    }
  })

  it('renders zero-count cards for root and nested empty containers', () => {
    const rootObject = graphOf({})
    expect(rootObject.cards).toHaveLength(1)
    expect(rootObject.cards[0]).toMatchObject({
      id: '$',
      type: 'object',
      count: 0,
      rows: []
    })
    expect(rootObject.cards[0].preview).toBe('对象 · 0 个属性')

    const rootArray = graphOf([])
    expect(rootArray.cards[0]).toMatchObject({
      type: 'array',
      count: 0,
      rows: []
    })
    expect(rootArray.cards[0].preview).toBe('数组 · 0 项')

    const nested = graphOf({
      emptyObject: {},
      emptyArray: [],
      nested: [[], {}]
    })
    expect(nested.cards.map((card) => card.id)).toEqual([
      '$',
      '$["emptyObject"]',
      '$["emptyArray"]',
      '$["nested"]',
      '$["nested"][0]',
      '$["nested"][1]'
    ])
    expect(
      nested.cards
        .filter((card) => card.id !== '$')
        .map((card) => [card.type, card.count, card.rows.length])
    ).toEqual([
      ['object', 0, 0],
      ['array', 0, 0],
      ['array', 2, 2],
      ['array', 0, 0],
      ['object', 0, 0]
    ])
  })

  it('keeps unusual keys text-safe and path IDs unique', () => {
    const value = {
      'a.b': 1,
      'a["b"]': 2,
      '': 3,
      'emoji 😀': 4,
      '<img src=x onerror="bad()">': '<script>bad()</script>'
    }
    const graph = graphOf(value)
    const ids = graph.cards.map((card) => card.id)

    expect(new Set(ids).size).toBe(ids.length)
    expect(graph.cards[0].rows.map((row) => row.label)).toEqual([
      'a.b',
      'a["b"]',
      '',
      'emoji 😀',
      '<img src=x onerror="bad()">'
    ])
    expect(graph.cards[0].rows.map((row) => row.path)).toEqual([
      '$["a.b"]',
      '$["a[\\"b\\"]"]',
      '$[""]',
      '$["emoji 😀"]',
      '$["<img src=x onerror=\\"bad()\\">"]'
    ])
    expect(graph.cards[0].rows[4].preview).toBe('"<script>bad()</script>"')
  })

  it('labels every container edge with a visible key fallback', () => {
    const graph = graphOf({
      '': { empty: 1 },
      '   ': { spaces: 2 },
      '\n': { newline: 3 },
      '[]': { punctuation: 4 },
      normal: { value: 5 }
    })

    expect(graph.cards[0].rows.map((row) => row.displayLabel)).toEqual([
      '""',
      '"   "',
      '"\\n"',
      '[]',
      'normal'
    ])
    expect(graph.edges.map((edge) => edge.label)).toEqual([
      '""',
      '"   "',
      '"\\n"',
      '[]',
      'normal'
    ])
    expect(graph.edges.every((edge) => edge.label.trim().length > 0)).toBe(
      true
    )
    expect(graphKeyLabel('')).toBe('""')
    expect(graphKeyLabel('   ')).toBe('"   "')
    expect(graphKeyLabel('normal')).toBe('normal')
  })

  it('projects collapse state and hides descendant cards and edges', () => {
    const graph = graphOf({
      keep: 'yes',
      nested: {
        visibleChild: { deep: true },
        sibling: 1
      }
    })

    const nestedCollapsed = projectVisibleGraph(
      graph,
      new Set(['$["nested"]'])
    )
    expect(nestedCollapsed.cards.map((card) => card.id)).toEqual([
      '$',
      '$["nested"]'
    ])
    expect(nestedCollapsed.edges.map((edge) => edge.to)).toEqual([
      '$["nested"]'
    ])
    expect(
      nestedCollapsed.cards.find((card) => card.id === '$["nested"]').rows
        .map((row) => row.label)
    ).toEqual(['visibleChild', 'sibling'])

    const rootCollapsed = projectVisibleGraph(graph, new Set(['$']))
    expect(rootCollapsed.cards.map((card) => card.id)).toEqual(['$'])
    expect(rootCollapsed.edges).toEqual([])

    const unrelated = projectVisibleGraph(graph, new Set(['$["missing"]']))
    expect(unrelated.cards).toHaveLength(graph.cards.length)
    expect(unrelated.edges).toHaveLength(graph.edges.length)
    expect(collapseAllCardIds(graph)).toEqual([
      '$',
      '$["nested"]'
    ])
  })
})

describe('json graph layout', () => {
  it('places visible cards deterministically in left-to-right layers', () => {
    const graph = graphOf({
      first: { deep: 1 },
      second: { deep: 2 },
      third: [3, 4]
    })
    const visible = projectVisibleGraph(graph, new Set())
    const first = layoutGraph(visible)
    const second = layoutGraph(visible)
    const root = first.nodes.find((node) => node.id === '$')
    const firstChild = first.nodes.find((node) => node.id === '$["first"]')
    const secondChild = first.nodes.find((node) => node.id === '$["second"]')
    const thirdChild = first.nodes.find((node) => node.id === '$["third"]')

    expect(second.nodes).toEqual(first.nodes)
    expect(second.edges).toEqual(first.edges)
    expect(root.x).toBe(30)
    expect(firstChild.x).toBeGreaterThan(root.x)
    expect(firstChild.x).toBe(secondChild.x)
    expect(firstChild.x).toBe(thirdChild.x)
    expect(firstChild.y).toBeLessThan(secondChild.y)
    expect(secondChild.y).toBeLessThan(thirdChild.y)
    expect(root.y + root.height / 2).toBeCloseTo(
      (firstChild.y + thirdChild.y + thirdChild.height) / 2
    )
    expect(firstChild.width).toBe(252)
    expect(firstChild.height).toBe(98)
    expect(first.edges.map((edge) => edge.displayLabel)).toEqual([
      'first',
      'second',
      'third'
    ])
    expect(first.edges[0].pathData).toMatch(
      /^M \d+(?:\.\d+)? \d+(?:\.\d+)? C /
    )
    expect(first.width).toBe(
      Math.max(...first.nodes.map((node) => node.x + node.width)) + 30
    )
  })

  it('produces identical coordinates for identical visible input', () => {
    const graph = graphOf({
      alpha: { one: 1, two: 2 },
      beta: { three: 3 }
    })
    const visible = projectVisibleGraph(graph, new Set())
    const snapshotA = JSON.stringify(layoutGraph(visible))
    const snapshotB = JSON.stringify(layoutGraph(projectVisibleGraph(graph, [])))

    expect(snapshotB).toBe(snapshotA)
  })

  it('computes fit and root-centered reset transforms', () => {
    const graph = graphOf({
      first: { deep: 1 },
      second: { deep: 2 }
    })
    const layout = layoutGraph(projectVisibleGraph(graph, new Set()))
    const fit = fitGraphTransform(layout, 900, 500, 20)
    const reset = resetGraphTransform(layout, 900, 500)

    expect(fit.scale).toBeLessThanOrEqual(1)
    expect(fit.scale).toBeGreaterThanOrEqual(0.25)
    expect(fit.x).toBeCloseTo((900 - layout.width * fit.scale) / 2)
    expect(fit.y).toBeCloseTo((500 - layout.height * fit.scale) / 2)
    expect(reset.scale).toBe(1)
    expect(reset.x + layout.rootNode.x + layout.rootNode.width / 2).toBe(450)
    expect(reset.y + layout.rootNode.y + layout.rootNode.height / 2).toBe(250)

    const tiny = fitGraphTransform(
      { width: 10000, height: 10000, rootNode: layout.rootNode },
      640,
      360
    )
    expect(tiny.scale).toBe(0.25)
    expect(clampGraphScale(0.1)).toBe(0.25)
    expect(clampGraphScale(0.25)).toBe(0.25)
    expect(clampGraphScale(2)).toBe(2)
    expect(clampGraphScale(3)).toBe(2)
  })

  it('pans focused rectangles inside the viewport without changing scale', () => {
    const viewport = { left: 20, top: 30, width: 600, height: 300 }
    const transform = { scale: 0.25, x: 100, y: 80 }

    expect(
      revealGraphRectTransform(
        transform,
        viewport,
        { left: 900, top: 120, right: 950, bottom: 140 },
        10,
        20
      )
    ).toEqual({ scale: 0.25, x: -240, y: 80 })

    expect(
      revealGraphRectTransform(
        transform,
        viewport,
        { left: 30, top: 250, right: 60, bottom: 340 },
        10,
        20
      )
    ).toEqual({ scale: 0.25, x: 100, y: 50 })

    expect(
      revealGraphRectTransform(
        transform,
        viewport,
        { left: 10, top: 20, right: 20, bottom: 25 },
        10,
        20
      )
    ).toEqual({ scale: 0.25, x: 120, y: 100 })

    expect(
      revealGraphRectTransform(
        transform,
        viewport,
        { left: 200, top: 100, right: 250, bottom: 120 },
        10,
        20
      )
    ).toEqual(transform)
  })

  it('formats full inspection values and bounded previews without changing source text', () => {
    const objectValue = { nested: [true, null] }
    const longText = 'x'.repeat(200)

    expect(formatGraphValue(objectValue, 'object')).toBe(
      '{\n  "nested": [\n    true,\n    null\n  ]\n}'
    )
    expect(formatGraphValue('line\nbreak', 'string')).toBe('"line\\nbreak"')
    expect(previewGraphValue(longText, 'string')).toHaveLength(120)
    expect(previewGraphValue(longText, 'string').endsWith('…')).toBe(true)
    expect(truncateGraphText('abcdefghij', 5)).toBe('abcd…')
    expect(truncateGraphText('short', 5)).toBe('short')
    expect(semanticTypeOf(null)).toBe('null')
    expect(semanticTypeOf([])).toBe('array')
  })
})

describe('json graph limits', () => {
  it('uses UTF-8 bytes and accepts exactly 2 MiB before graph work', () => {
    const value = { ok: true }
    const exact = paddedToBytes(value, GRAPH_LIMITS.inputBytes)
    const over = `${exact} `

    expect(utf8ByteLength('中')).toBe(3)
    expect(inspectJsonGraphLimits(value, exact)).toMatchObject({
      ok: true,
      inputBytes: 2 * 1024 * 1024
    })
    expect(buildJsonGraph(value, exact).ok).toBe(true)

    const limited = buildJsonGraph(value, over)
    expect(limited).toMatchObject({
      ok: false,
      limit: 'inputBytes',
      limitValue: 2 * 1024 * 1024,
      limitDisplay: '2 MiB'
    })
    expect(limited.cards).toBeUndefined()
  })

  it('accepts 128 container levels and rejects 129', () => {
    const exact = nestedArray(128)
    const over = nestedArray(129)

    expect(inspectJsonGraphLimits(exact).ok).toBe(true)
    expect(buildJsonGraph(exact).cards).toHaveLength(128)

    expect(buildJsonGraph(over)).toMatchObject({
      ok: false,
      limit: 'containerDepth',
      limitValue: 128,
      actual: 129,
      limitDisplay: '128 层'
    })
  })

  it('accepts 10,000 rows and rejects 10,001', () => {
    const exact = Object.fromEntries(
      Array.from({ length: 10000 }, (_, index) => [`k${index}`, index])
    )
    const over = Object.fromEntries(
      Array.from({ length: 10001 }, (_, index) => [`k${index}`, index])
    )

    expect(inspectJsonGraphLimits(exact)).toMatchObject({
      ok: true,
      rowCount: 10000
    })
    expect(buildJsonGraph(exact).stats.rows).toBe(10000)

    expect(buildJsonGraph(over)).toMatchObject({
      ok: false,
      limit: 'rows',
      limitValue: 10000,
      actual: 10001,
      limitDisplay: '10,000 行'
    })
  })

  it('accepts a 1 MiB literal that fits the input size cap', () => {
    const value = 'x'.repeat(1024 * 1024)
    const text = JSON.stringify(value)

    expect(utf8ByteLength(text)).toBeLessThan(GRAPH_LIMITS.inputBytes)
    expect(inspectJsonGraphLimits(value, text).ok).toBe(true)
    expect(buildJsonGraph(value, text).cards).toHaveLength(1)
  })

  it('reports the input size cap before the literal cap for oversized text', () => {
    const value = 'x'.repeat(3 * 1024 * 1024)
    const text = JSON.stringify(value)

    expect(utf8ByteLength(text)).toBeGreaterThan(GRAPH_LIMITS.inputBytes)
    expect(buildJsonGraph(value, text)).toMatchObject({
      ok: false,
      limit: 'inputBytes'
    })
  })

  it('no longer carries a separate card or literal character cap', () => {
    expect(GRAPH_LIMITS.cards).toBeUndefined()
    expect(GRAPH_LIMITS.literalCharacters).toBeUndefined()
    expect(Object.keys(GRAPH_LIMITS)).toEqual([
      'inputBytes',
      'containerDepth',
      'rows'
    ])
  })
})
