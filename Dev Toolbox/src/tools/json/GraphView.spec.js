import fs from 'node:fs'
import path from 'node:path'
import { flushPromises, mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import { describe, expect, it } from 'vitest'
import GraphView from './GraphView.vue'
import { buildJsonGraph } from './graph.js'

const sample = {
  title: 'Dev Toolbox',
  nested: {
    enabled: true,
    deeper: { count: 2 }
  },
  items: ['alpha', { deep: null }],
  html: '<img src=x onerror="window.__graphXss=1"><script>bad()</script>'
}

async function mountGraph(value, props = {}) {
  const graph = buildJsonGraph(value, JSON.stringify(value))
  const wrapper = mount(GraphView, {
    props: {
      graph,
      ...props
    },
    attachTo: document.body
  })
  await flushPromises()
  await nextTick()
  return { wrapper, graph }
}

function cardByPath(wrapper, path) {
  return wrapper
    .findAll('.graph-card')
    .find((card) => card.attributes('data-graph-card-id') === path)
}

function rowByPath(wrapper, path) {
  return wrapper
    .findAll('.graph-row')
    .find((row) => row.attributes('data-graph-path') === path)
}

describe('GraphView', () => {
  it('renders cards, primitive rows, and labeled edges as text', async () => {
    const { wrapper } = await mountGraph(sample)

    expect(wrapper.find('[data-testid="json-graph"]').exists()).toBe(true)
    expect(
      wrapper.find('[data-testid="json-graph-viewport"]').attributes('role')
    ).toBe('group')
    expect(
      wrapper.find('[data-testid="json-graph-viewport"]').attributes('aria-label')
    ).toBe('JSON 关系图')
    expect(wrapper.findAll('.graph-card')).toHaveLength(5)
    expect(wrapper.findAll('.graph-row')).toHaveLength(10)
    expect(wrapper.findAll('.json-graph__edge')).toHaveLength(4)
    expect(
      wrapper.findAll('.json-graph__edge text').map((label) => label.text())
    ).toEqual(['nested', 'deeper', 'items', '[1]'])
    expect(rowByPath(wrapper, '$["title"]').text()).toContain('string')
    expect(rowByPath(wrapper, '$["title"]').text()).toContain('"Dev Toolbox"')
    expect(cardByPath(wrapper, '$["nested"]').text()).toContain('object')
    expect(cardByPath(wrapper, '$["nested"]').text()).toContain('2 个属性')
    expect(wrapper.find('img').exists()).toBe(false)
    expect(wrapper.find('script').exists()).toBe(false)
    expect(wrapper.text()).toContain('<img src=x')
    expect(window.__graphXss).toBeUndefined()
  })

  it('renders primitive roots and zero-count empty containers', async () => {
    const primitive = await mountGraph(
      '<img src=x onerror="window.__graphXss=1"><script>bad()</script>'
    )
    expect(primitive.wrapper.findAll('.graph-card')).toHaveLength(1)
    expect(primitive.wrapper.findAll('.graph-row')).toHaveLength(0)
    expect(primitive.wrapper.find('.graph-card__primitive').text()).toContain(
      '<img src=x'
    )
    expect(primitive.wrapper.find('img').exists()).toBe(false)
    expect(primitive.wrapper.find('script').exists()).toBe(false)
    expect(primitive.wrapper.find('.json-graph__edge').exists()).toBe(false)

    const empty = await mountGraph({
      emptyObject: {},
      emptyArray: [],
      nested: [{}]
    })
    expect(empty.wrapper.text()).toContain('空对象')
    expect(empty.wrapper.text()).toContain('空数组')
    expect(empty.wrapper.text()).toContain('0 个属性')
    expect(empty.wrapper.text()).toContain('0 项')
  })

  it('renders visible edge labels for empty and whitespace container keys', async () => {
    const { wrapper } = await mountGraph({
      '': { empty: 1 },
      '   ': { spaces: 2 }
    })
    const edgeLabels = wrapper
      .findAll('.json-graph__edge text')
      .map((label) => label.text())

    expect(edgeLabels).toEqual(['""', '"   "'])
    expect(edgeLabels.every((label) => label.trim().length > 0)).toBe(true)
    expect(
      rowByPath(wrapper, '$[""]').find('.graph-row__label').text()
    ).toBe('""')
  })

  it('shows the same path, type, and preview on hover and keyboard focus', async () => {
    const { wrapper } = await mountGraph(sample)
    const row = rowByPath(wrapper, '$["nested"]["deeper"]["count"]')
    const card = cardByPath(wrapper, '$["nested"]')

    await row.trigger('mouseenter')
    let tooltip = wrapper.find('[data-testid="json-graph-tooltip"]')
    expect(tooltip.attributes('role')).toBe('tooltip')
    expect(tooltip.text()).toContain('$["nested"]["deeper"]["count"]')
    expect(tooltip.text()).toContain('number')
    expect(tooltip.text()).toContain('2')

    await row.trigger('mouseleave')
    expect(wrapper.find('[data-testid="json-graph-tooltip"]').exists()).toBe(
      false
    )

    await card.trigger('mouseenter')
    tooltip = wrapper.find('[data-testid="json-graph-tooltip"]')
    expect(tooltip.text()).toContain('$["nested"]')
    expect(tooltip.text()).toContain('object')
    await card.trigger('mouseleave')

    row.element.focus()
    await nextTick()
    tooltip = wrapper.find('[data-testid="json-graph-tooltip"]')
    expect(tooltip.attributes('id')).toBe('json-graph-tooltip')
    expect(tooltip.text()).toContain('$["nested"]["deeper"]["count"]')
    expect(tooltip.text()).toContain('number')
    expect(row.attributes('aria-describedby')).toBe('json-graph-tooltip')
    expect(wrapper.find('[role="status"]').text()).toContain(
      '$["nested"]["deeper"]["count"]'
    )

    await row.trigger('keydown', { key: 'Escape' })
    expect(wrapper.find('[data-testid="json-graph-tooltip"]').exists()).toBe(
      false
    )
  })

  it('closes the tooltip when the pointer leaves and the inspector when focus leaves', async () => {
    const { wrapper } = await mountGraph(sample)
    const row = rowByPath(wrapper, '$["title"]')
    const inspector = () =>
      wrapper.find('[data-testid="json-graph-inspector"]')

    await row.trigger('mouseenter')
    expect(wrapper.find('[data-testid="json-graph-tooltip"]').exists()).toBe(
      true
    )
    await wrapper.get('[data-testid="json-graph"]').trigger('pointerleave')
    expect(wrapper.find('[data-testid="json-graph-tooltip"]').exists()).toBe(
      false
    )

    await row.trigger('click')
    expect(inspector().exists()).toBe(true)
    await wrapper.get('[data-testid="json-graph"]').trigger('pointerleave')
    expect(inspector().exists()).toBe(true)

    await row.trigger('click')
    expect(inspector().exists()).toBe(true)
    const outside = document.createElement('button')
    outside.type = 'button'
    outside.textContent = 'outside'
    document.body.append(outside)
    row.element.focus()
    outside.focus()
    await nextTick()
    expect(inspector().exists()).toBe(false)
    outside.remove()
  })

  it('opens the full-value inspector from click and Enter and closes it safely', async () => {
    const longValue = `x${'y'.repeat(4088)}`
    const { wrapper } = await mountGraph({
      longValue,
      nested: { flag: true }
    })
    const row = rowByPath(wrapper, '$["longValue"]')

    expect(row.text().length).toBeLessThan(longValue.length)
    await row.trigger('click')
    let inspector = wrapper.find('[data-testid="json-graph-inspector"]')
    expect(inspector.exists()).toBe(true)
    expect(inspector.attributes('aria-label')).toBe('JSON 检查器')
    expect(inspector.text()).toContain('$["longValue"]')
    expect(inspector.text()).toContain('string')
    expect(inspector.find('pre').text()).toBe(`"${longValue}"`)
    expect(inspector.find('pre').attributes('aria-label')).toBe('完整 JSON 值')

    inspector.find('pre').element.focus()
    await nextTick()
    await inspector.find('pre').trigger('keydown', { key: 'Escape' })
    expect(wrapper.find('[data-testid="json-graph-inspector"]').exists()).toBe(
      false
    )
    expect(document.activeElement).toBe(row.element)

    row.element.focus()
    await row.trigger('keydown', { key: 'Enter' })
    inspector = wrapper.find('[data-testid="json-graph-inspector"]')
    expect(inspector.exists()).toBe(true)
    await inspector.get('[aria-label="关闭检查器"]').trigger('click')
    await nextTick()
    expect(wrapper.find('[data-testid="json-graph-inspector"]').exists()).toBe(
      false
    )
    expect(document.activeElement).toBe(row.element)
  })

  it('restores focus by stable identity after collapse and falls back when hidden', async () => {
    const { wrapper } = await mountGraph({
      a: { deep: { value: 1 } },
      b: { value: 2 }
    })
    const cardA = cardByPath(wrapper, '$["a"]')
    const cardB = cardByPath(wrapper, '$["b"]')
    const inspector = () =>
      wrapper.find('[data-testid="json-graph-inspector"]')

    await cardB.trigger('click')
    expect(inspector().exists()).toBe(true)
    await cardA
      .findAll('button')
      .find((button) => button.attributes('aria-label')?.includes('$["a"]'))
      .trigger('click')
    await flushPromises()
    expect(inspector().exists()).toBe(true)
    await inspector().get('[aria-label="关闭检查器"]').trigger('click')
    await nextTick()
    expect(document.activeElement).toBe(cardB.element)

    await cardB.trigger('click')
    expect(inspector().exists()).toBe(true)
    inspector().find('pre').element.focus()
    await nextTick()
    cardByPath(wrapper, '$')
      .find('.graph-card__collapse')
      .element.click()
    await flushPromises()
    expect(inspector().exists()).toBe(false)
    expect(document.activeElement).toBe(cardByPath(wrapper, '$').element)
  })

  it('supports per-card, collapse-all, and expand-all semantics with ARIA', async () => {
    const { wrapper } = await mountGraph(sample)
    const surface = wrapper.get('[data-testid="json-graph-surface"]')
    const transformBefore = [
      surface.attributes('data-scale'),
      surface.attributes('data-x'),
      surface.attributes('data-y')
    ]
    let nestedCard = cardByPath(wrapper, '$["nested"]')
    let toggle = nestedCard
      .findAll('button')
      .find((button) => button.attributes('aria-label')?.includes('$["nested"]'))

    expect(toggle.attributes('aria-expanded')).toBe('true')
    await toggle.trigger('click')
    await flushPromises()
    nestedCard = cardByPath(wrapper, '$["nested"]')
    toggle = nestedCard
      .findAll('button')
      .find((button) => button.attributes('aria-label')?.includes('$["nested"]'))
    expect(toggle.attributes('aria-expanded')).toBe('false')
    expect(cardByPath(wrapper, '$["nested"]["deeper"]')).toBeUndefined()
    expect(nestedCard.text()).toContain('deeper')
    expect(wrapper.findAll('.json-graph__edge')).toHaveLength(3)
    expect([
      surface.attributes('data-scale'),
      surface.attributes('data-x'),
      surface.attributes('data-y')
    ]).toEqual(transformBefore)

    await wrapper
      .get('[role="toolbar"]')
      .findAll('button')
      .find((button) => button.text() === '重置视图')
      .trigger('click')
    expect(Number(surface.attributes('data-scale'))).toBe(1)
    expect(cardByPath(wrapper, '$["nested"]["deeper"]')).toBeUndefined()

    await wrapper
      .get('[role="toolbar"]')
      .findAll('button')
      .find((button) => button.text() === '全部收起')
      .trigger('click')
    await flushPromises()
    expect(wrapper.findAll('.graph-card')).toHaveLength(1)
    expect(wrapper.findAll('.json-graph__edge')).toHaveLength(0)
    expect(cardByPath(wrapper, '$["nested"]["deeper"]')).toBeUndefined()
    expect(cardByPath(wrapper, '$["items"][1]')).toBeUndefined()
    expect(cardByPath(wrapper, '$').text()).toContain('4 个属性')

    await wrapper
      .get('[role="toolbar"]')
      .findAll('button')
      .find((button) => button.text() === '全部展开')
      .trigger('click')
    await flushPromises()
    expect(wrapper.findAll('.graph-card')).toHaveLength(5)
    expect(wrapper.findAll('.json-graph__edge')).toHaveLength(4)
  })

  it('uses one graph tab stop with arrow traversal, Enter, and Space', async () => {
    const { wrapper } = await mountGraph(sample)
    const viewport = wrapper.get('[data-testid="json-graph-viewport"]')
    const rootCard = cardByPath(wrapper, '$')
    const focusItems = wrapper.findAll('[data-graph-focus-index]')

    expect(viewport.attributes('tabindex')).toBe('0')
    expect(focusItems.every((item) => item.attributes('tabindex') === '-1')).toBe(
      true
    )
    expect(
      wrapper
        .findAll('.graph-card__collapse')
        .every((button) => button.attributes('tabindex') === '-1')
    ).toBe(true)

    viewport.element.focus()
    await nextTick()
    expect(document.activeElement).toBe(rootCard.element)

    await rootCard.trigger('keydown', { key: 'ArrowDown' })
    await nextTick()
    expect(
      document.activeElement.getAttribute('data-graph-focus-index')
    ).toBe('1')
    expect(document.activeElement.getAttribute('data-graph-path')).toBe(
      '$["title"]'
    )

    await wrapper
      .find('[data-graph-focus-index="1"]')
      .trigger('keydown', { key: 'Enter' })
    expect(wrapper.find('[data-testid="json-graph-inspector"]').exists()).toBe(
      true
    )
    await wrapper
      .find('[data-graph-focus-index="1"]')
      .trigger('keydown', { key: 'Escape' })

    rootCard.element.focus()
    await rootCard.trigger('keydown', { key: ' ' })
    await flushPromises()
    expect(wrapper.findAll('.graph-card')).toHaveLength(1)
    expect(
      cardByPath(wrapper, '$')
        .find('.graph-card__collapse')
        .attributes('aria-expanded')
    ).toBe('false')

    await wrapper
      .find('[data-graph-focus-index="0"]')
      .trigger('keydown', { key: 'End' })
    await nextTick()
    expect(document.activeElement.getAttribute('data-graph-focus-index')).toBe(
      String(wrapper.findAll('[data-graph-focus-index]').length - 1)
    )
  })

  it('scopes wheel zoom, closes overlays, and provides fit/reset controls', async () => {
    const { wrapper } = await mountGraph(sample)
    const viewport = wrapper.get('[data-testid="json-graph-viewport"]')
    const surface = wrapper.get('[data-testid="json-graph-surface"]')
    const initialScale = Number(surface.attributes('data-scale'))
    const row = rowByPath(wrapper, '$["title"]')

    await row.trigger('mouseenter')
    expect(wrapper.find('[data-testid="json-graph-tooltip"]').exists()).toBe(
      true
    )
    viewport.element.dispatchEvent(
      new WheelEvent('wheel', {
        deltaY: -120,
        clientX: 240,
        clientY: 160,
        bubbles: true,
        cancelable: true
      })
    )
    await nextTick()
    expect(Number(surface.attributes('data-scale'))).toBeGreaterThan(
      initialScale
    )
    expect(wrapper.find('[data-testid="json-graph-tooltip"]').exists()).toBe(
      false
    )

    const toolbar = wrapper.get('[role="toolbar"]')
    const button = (name) =>
      toolbar.findAll('button').find((item) => item.text() === name)

    await button('放大').trigger('click')
    const zoomedScale = Number(surface.attributes('data-scale'))
    expect(zoomedScale).toBeGreaterThan(initialScale)

    await button('重置视图').trigger('click')
    expect(Number(surface.attributes('data-scale'))).toBe(1)

    await button('缩小').trigger('click')
    expect(Number(surface.attributes('data-scale'))).toBeLessThan(1)

    await button('适应视图').trigger('click')
    const fittedScale = Number(surface.attributes('data-scale'))
    expect(fittedScale).toBeLessThanOrEqual(1)
    expect(fittedScale).toBeGreaterThanOrEqual(0.25)
    expect(wrapper.find('[role="status"]').text()).toContain('已适应视图')
  })

  it('keeps controls labeled, the live region polite, and source free of v-html', async () => {
    const { wrapper } = await mountGraph(sample)
    const buttons = wrapper
      .get('[role="toolbar"]')
      .findAll('button')
      .map((button) => button.text())

    expect(buttons).toEqual([
      '适应视图',
      '重置视图',
      '缩小',
      '放大',
      '全部收起',
      '全部展开',
      '导出图片'
    ])
    const live = wrapper.find('[role="status"]')
    expect(live.attributes('aria-live')).toBe('polite')
    expect(live.attributes('aria-atomic')).toBe('true')

    const source = fs.readFileSync(
      path.join(process.cwd(), 'src/tools/json/GraphView.vue'),
      'utf8'
    )
    expect(source).not.toMatch(/v-html/i)
  })
})
