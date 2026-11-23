import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import EmptyState from './EmptyState.vue'
import ErrorNotice from './ErrorNotice.vue'
import ModeTabs from './ModeTabs.vue'
import ToolFrame from './ToolFrame.vue'
import TreeView from './TreeView.vue'

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
