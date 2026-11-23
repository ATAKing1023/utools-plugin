import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import TreeView from '../../components/TreeView.vue'
import { buildJsonTree } from './tree.js'

describe('json tree model', () => {
  it('maps object properties in input order with path IDs', () => {
    const root = buildJsonTree({
      name: 'toolbox',
      nested: { enabled: true }
    })

    expect(root).toMatchObject({
      id: '$',
      label: '$',
      kind: 'object',
      defaultOpen: true
    })
    expect(root.children.map((node) => node.label)).toEqual([
      'name',
      'nested'
    ])
    expect(root.children[0]).toMatchObject({
      id: '$["name"]',
      kind: 'text',
      value: '"toolbox"',
      defaultOpen: false
    })
    expect(root.children[1]).toMatchObject({
      id: '$["nested"]',
      kind: 'object',
      defaultOpen: false
    })
    expect(root.children[1].children[0].id).toBe('$["nested"]["enabled"]')
  })

  it('maps arrays with bracket labels and stable IDs', () => {
    const root = buildJsonTree(['alpha', { value: null }])

    expect(root.kind).toBe('array')
    expect(root.children.map((node) => node.label)).toEqual(['[0]', '[1]'])
    expect(root.children.map((node) => node.id)).toEqual(['$[0]', '$[1]'])
    expect(root.children[0]).toMatchObject({
      kind: 'text',
      value: '"alpha"'
    })
    expect(root.children[1].children[0]).toMatchObject({
      label: 'value',
      kind: 'text',
      value: 'null'
    })
  })

  it('uses deterministic string forms for primitive roots', () => {
    expect(buildJsonTree('line\nbreak')).toMatchObject({
      id: '$',
      label: '$',
      kind: 'text',
      value: '"line\\nbreak"',
      defaultOpen: true
    })
    expect(buildJsonTree(false).value).toBe('false')
    expect(buildJsonTree(null).value).toBe('null')
    expect(buildJsonTree(-0).value).toBe('-0')
  })

  it('keeps IDs unique for property names containing path punctuation', () => {
    const root = buildJsonTree({
      'a["b"]': 1,
      'a': { b: 2 }
    })
    const ids = []

    const visit = (node) => {
      ids.push(node.id)
      for (const child of node.children || []) visit(child)
    }

    visit(root)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('renders string values as text rather than HTML', () => {
    const wrapper = mount(TreeView, {
      props: {
        nodes: [
          buildJsonTree(
            '<img src=x onerror="window.__jsonTreeXss=1"><script>bad()</script>'
          )
        ]
      }
    })

    expect(wrapper.find('img').exists()).toBe(false)
    expect(wrapper.find('script').exists()).toBe(false)
    expect(wrapper.text()).toContain('<img src=x')
    expect(window.__jsonTreeXss).toBeUndefined()
  })
})
