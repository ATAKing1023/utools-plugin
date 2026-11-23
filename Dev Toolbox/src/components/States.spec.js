import { mount } from '@vue/test-utils'
import { defineComponent, h, nextTick, ref } from 'vue'
import { describe, expect, it } from 'vitest'
import EmptyState from './EmptyState.vue'
import ErrorNotice from './ErrorNotice.vue'
import ModeTabs from './ModeTabs.vue'
import ToolFrame from './ToolFrame.vue'
import TreeView from './TreeView.vue'

function mountModeTabs({ initialMode = 'tree', modes } = {}) {
  const Host = defineComponent({
    setup() {
      const mode = ref(initialMode)
      return () =>
        h(ModeTabs, {
          modelValue: mode.value,
          'onUpdate:modelValue': (value) => {
            mode.value = value
          },
          ...(modes ? { modes } : {})
        })
    }
  })

  const wrapper = mount(Host, { attachTo: document.body })
  return {
    wrapper,
    tabs() {
      return wrapper.findAll('[role="tab"]')
    },
    currentMode() {
      return wrapper.findComponent(ModeTabs).props('modelValue')
    }
  }
}

describe('ModeTabs', () => {
  it('provides accessible tabs and a v-model update', async () => {
    const wrapper = mount(ModeTabs, {
      props: {
        modelValue: 'tree'
      }
    })

    const tabs = wrapper.findAll('[role="tab"]')
    expect(tabs.map((tab) => tab.text())).toEqual(['可视化', '格式化'])
    expect(tabs[0].attributes('aria-selected')).toBe('true')
    expect(tabs[1].attributes('aria-selected')).toBe('false')

    await tabs[1].trigger('click')
    expect(wrapper.emitted('update:modelValue')).toEqual([['format']])

    await wrapper.setProps({ modelValue: 'format' })
    expect(wrapper.findAll('[role="tab"]')[1].attributes('aria-selected')).toBe(
      'true'
    )
  })

  it('accepts a caller-supplied mode list', () => {
    const wrapper = mount(ModeTabs, {
      props: {
        modelValue: 'visual',
        modes: [
          { id: 'visual', label: '可视化' },
          { id: 'format', label: '格式化' }
        ]
      }
    })

    expect(wrapper.findAll('[role="tab"]').map((tab) => tab.text())).toEqual([
      '可视化',
      '格式化'
    ])
  })

  it('moves selection and focus with ArrowRight and ArrowLeft', async () => {
    const probe = mountModeTabs()
    let tabs = probe.tabs()

    expect(tabs[0].attributes('tabindex')).toBe('0')
    expect(tabs[1].attributes('tabindex')).toBe('-1')
    tabs[0].element.focus()

    await tabs[0].trigger('keydown', { key: 'ArrowRight' })
    await nextTick()
    tabs = probe.tabs()

    expect(probe.currentMode()).toBe('format')
    expect(tabs[0].attributes('aria-selected')).toBe('false')
    expect(tabs[0].attributes('tabindex')).toBe('-1')
    expect(tabs[1].attributes('aria-selected')).toBe('true')
    expect(tabs[1].attributes('tabindex')).toBe('0')
    expect(document.activeElement).toBe(tabs[1].element)

    await tabs[1].trigger('keydown', { key: 'ArrowLeft' })
    await nextTick()
    tabs = probe.tabs()

    expect(probe.currentMode()).toBe('tree')
    expect(tabs[0].attributes('aria-selected')).toBe('true')
    expect(tabs[0].attributes('tabindex')).toBe('0')
    expect(tabs[1].attributes('tabindex')).toBe('-1')
    expect(document.activeElement).toBe(tabs[0].element)
  })

  it('wraps at both ends and prevents the handled key default', async () => {
    const probe = mountModeTabs()
    let tabs = probe.tabs()
    tabs[0].element.focus()

    const leftEvent = new KeyboardEvent('keydown', {
      key: 'ArrowLeft',
      bubbles: true,
      cancelable: true
    })
    tabs[0].element.dispatchEvent(leftEvent)
    await nextTick()
    tabs = probe.tabs()

    expect(leftEvent.defaultPrevented).toBe(true)
    expect(probe.currentMode()).toBe('format')
    expect(document.activeElement).toBe(tabs[1].element)

    const rightEvent = new KeyboardEvent('keydown', {
      key: 'ArrowRight',
      bubbles: true,
      cancelable: true
    })
    tabs[1].element.dispatchEvent(rightEvent)
    await nextTick()
    tabs = probe.tabs()

    expect(rightEvent.defaultPrevented).toBe(true)
    expect(probe.currentMode()).toBe('tree')
    expect(document.activeElement).toBe(tabs[0].element)
  })

  it('selects and focuses the first or last tab with Home and End', async () => {
    const probe = mountModeTabs({ initialMode: 'format' })
    let tabs = probe.tabs()
    tabs[1].element.focus()

    const homeEvent = new KeyboardEvent('keydown', {
      key: 'Home',
      bubbles: true,
      cancelable: true
    })
    tabs[1].element.dispatchEvent(homeEvent)
    await nextTick()
    tabs = probe.tabs()

    expect(homeEvent.defaultPrevented).toBe(true)
    expect(probe.currentMode()).toBe('tree')
    expect(tabs[0].attributes('tabindex')).toBe('0')
    expect(tabs[1].attributes('tabindex')).toBe('-1')
    expect(document.activeElement).toBe(tabs[0].element)

    const endEvent = new KeyboardEvent('keydown', {
      key: 'End',
      bubbles: true,
      cancelable: true
    })
    tabs[0].element.dispatchEvent(endEvent)
    await nextTick()
    tabs = probe.tabs()

    expect(endEvent.defaultPrevented).toBe(true)
    expect(probe.currentMode()).toBe('format')
    expect(tabs[0].attributes('tabindex')).toBe('-1')
    expect(tabs[1].attributes('tabindex')).toBe('0')
    expect(tabs[1].attributes('aria-selected')).toBe('true')
    expect(document.activeElement).toBe(tabs[1].element)
  })

  it('handles unknown and disabled current values safely', async () => {
    const unknown = mountModeTabs({ initialMode: 'missing' })
    let tabs = unknown.tabs()

    expect(tabs.map((tab) => tab.attributes('aria-selected'))).toEqual([
      'false',
      'false'
    ])
    expect(tabs[0].attributes('tabindex')).toBe('0')
    expect(tabs[1].attributes('tabindex')).toBe('-1')

    await tabs[0].trigger('keydown', { key: 'ArrowRight' })
    await nextTick()
    expect(unknown.currentMode()).toBe('format')
    expect(document.activeElement).toBe(unknown.tabs()[1].element)

    unknown.wrapper.unmount()
    const disabled = mountModeTabs({
      initialMode: 'tree',
      modes: [
        { id: 'tree', label: '可视化', disabled: true },
        { id: 'format', label: '格式化' }
      ]
    })
    tabs = disabled.tabs()

    expect(tabs[0].attributes('disabled')).toBeDefined()
    expect(tabs[0].attributes('tabindex')).toBe('-1')
    expect(tabs[1].attributes('tabindex')).toBe('0')

    tabs[1].element.focus()
    await tabs[1].trigger('keydown', { key: 'ArrowLeft' })
    await nextTick()
    expect(disabled.currentMode()).toBe('format')
    expect(document.activeElement).toBe(disabled.tabs()[1].element)
  })

  it('keeps a single enabled tab as a defined no-op', async () => {
    const probe = mountModeTabs({
      initialMode: 'tree',
      modes: [{ id: 'tree', label: '可视化' }]
    })
    const tab = probe.tabs()[0]
    tab.element.focus()

    const event = new KeyboardEvent('keydown', {
      key: 'ArrowRight',
      bubbles: true,
      cancelable: true
    })
    tab.element.dispatchEvent(event)
    await nextTick()

    expect(event.defaultPrevented).toBe(true)
    expect(probe.currentMode()).toBe('tree')
    expect(probe.tabs()[0].attributes('tabindex')).toBe('0')
    expect(document.activeElement).toBe(probe.tabs()[0].element)
  })
})

describe('TreeView', () => {
  const nodes = [
    {
      id: 'root',
      label: 'root',
      kind: 'object',
      children: [
        {
          id: 'items',
          label: 'items',
          kind: 'array',
          children: [
            {
              id: 'name',
              label: 'name',
              kind: 'text',
              value: '<b>safe text</b>'
            }
          ]
        },
        {
          id: 'note',
          label: '#comment',
          kind: 'comment',
          value: 'a comment'
        }
      ]
    }
  ]

  it('renders recursively and expands/collapses by click and keyboard', async () => {
    const wrapper = mount(TreeView, { props: { nodes } })
    const rootNode = wrapper.find('[data-kind="object"]')
    const rootToggle = rootNode.find('.tree-node__toggle')

    expect(rootNode.attributes('role')).toBe('treeitem')
    expect(rootNode.attributes('aria-expanded')).toBe('false')
    expect(wrapper.text()).not.toContain('a comment')

    await rootToggle.trigger('click')
    expect(wrapper.find('[data-kind="object"]').attributes('aria-expanded')).toBe(
      'true'
    )
    expect(wrapper.text()).toContain('a comment')
    expect(wrapper.text()).not.toContain('<b>safe text</b>')

    const arrayToggle = wrapper
      .find('[data-kind="array"]')
      .find('.tree-node__toggle')
    await arrayToggle.trigger('click')
    expect(wrapper.text()).toContain('<b>safe text</b>')
    expect(wrapper.find('[data-kind="text"] b').exists()).toBe(false)

    await rootToggle.trigger('keydown', { key: 'Enter' })
    expect(wrapper.find('[data-kind="object"]').attributes('aria-expanded')).toBe(
      'false'
    )
    await rootToggle.trigger('keydown', { key: ' ' })
    expect(wrapper.find('[data-kind="object"]').attributes('aria-expanded')).toBe(
      'true'
    )
    await rootToggle.trigger('keydown', { key: 'Space' })
    expect(wrapper.find('[data-kind="object"]').attributes('aria-expanded')).toBe(
      'true'
    )
  })

  it('honors defaultOpen and leaves text values uninterpreted', () => {
    const wrapper = mount(TreeView, {
      props: {
        nodes: [
          {
            id: 'open',
            label: 'open',
            kind: 'element',
            defaultOpen: true,
            children: [
              {
                id: 'comment',
                label: 'comment',
                kind: 'comment',
                value: '<script>not html</script>'
              }
            ]
          }
        ]
      }
    })

    expect(wrapper.find('[data-kind="element"]').attributes('aria-expanded')).toBe(
      'true'
    )
    expect(wrapper.text()).toContain('<script>not html</script>')
    expect(wrapper.find('script').exists()).toBe(false)
  })
})

describe('EmptyState and ErrorNotice', () => {
  it('renders defined, reusable states', async () => {
    const empty = mount(EmptyState)
    expect(empty.attributes('role')).toBe('status')
    expect(empty.attributes('data-state')).toBe('empty')
    expect(empty.text()).toContain('暂无内容')

    await empty.setProps({ message: '没有可展示的结果' })
    expect(empty.text()).toContain('没有可展示的结果')

    const error = mount(ErrorNotice, {
      props: { message: '解析失败' }
    })
    expect(error.attributes('role')).toBe('alert')
    expect(error.text()).toContain('解析失败')
  })

  it('supports a reusable ToolFrame with title, description, and footer slots', () => {
    const wrapper = mount(ToolFrame, {
      props: {
        title: '测试工具',
        description: '工具说明'
      },
      slots: {
        default: '<p class="content">内容</p>',
        footer: '<button class="footer">操作</button>'
      }
    })

    expect(wrapper.find('h1').text()).toBe('测试工具')
    expect(wrapper.text()).toContain('工具说明')
    expect(wrapper.find('.content').exists()).toBe(true)
    expect(wrapper.find('.footer').exists()).toBe(true)
  })
})
