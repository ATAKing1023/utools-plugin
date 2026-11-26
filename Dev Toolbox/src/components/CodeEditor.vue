<script setup>
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { Compartment, EditorState } from '@codemirror/state'
import { EditorView, keymap, lineNumbers, placeholder as placeholderExtension } from '@codemirror/view'
import {
  defaultKeymap,
  history,
  historyKeymap,
  indentWithTab,
  selectAll
} from '@codemirror/commands'
import {
  HighlightStyle,
  bracketMatching,
  foldAll as foldAllCommand,
  foldGutter,
  foldKeymap,
  indentOnInput,
  indentUnit,
  syntaxTree,
  syntaxHighlighting,
  unfoldAll as unfoldAllCommand
} from '@codemirror/language'
import { json } from '@codemirror/lang-json'
import { xml } from '@codemirror/lang-xml'
import { tags } from '@lezer/highlight'

const props = defineProps({
  modelValue: {
    type: String,
    default: ''
  },
  language: {
    type: String,
    default: 'json'
  },
  inputId: {
    type: String,
    default: ''
  },
  ariaLabel: {
    type: String,
    default: '源码编辑'
  },
  placeholder: {
    type: String,
    default: ''
  },
  testId: {
    type: String,
    default: ''
  },
  readOnly: {
    type: Boolean,
    default: false
  },
  showLineNumbers: {
    type: Boolean,
    default: true
  },
  showFoldGutter: {
    type: Boolean,
    default: true
  }
})

const emit = defineEmits(['update:modelValue', 'paste'])

const host = ref(null)
const languageCompartment = new Compartment()
const stickyPath = ref('')
let view = null
let applyingExternalValue = false
let stickyFrame = 0
const XML_TEXT_CHUNK_NAMES = new Set([
  'Text',
  'EntityReference',
  'CharacterReference'
])

const syntaxTheme = HighlightStyle.define([
  {
    tag: [tags.propertyName, tags.attributeName],
    color: 'var(--syntax-property)'
  },
  {
    tag: [tags.string, tags.attributeValue],
    color: 'var(--syntax-string)'
  },
  {
    tag: [tags.number, tags.bool, tags.null],
    color: 'var(--syntax-number)'
  },
  {
    tag: [tags.keyword, tags.operator],
    color: 'var(--syntax-keyword)'
  },
  {
    tag: [tags.comment],
    color: 'var(--syntax-comment)',
    fontStyle: 'italic'
  },
  {
    tag: [tags.tagName],
    color: 'var(--syntax-tag)'
  },
  {
    tag: [tags.punctuation, tags.bracket],
    color: 'var(--syntax-punctuation)'
  }
])

const editorTheme = EditorView.theme(
  {
    '&': {
      height: '100%',
      background: 'var(--app-bg)',
      color: 'var(--text-primary)'
    },
    '&.cm-focused': {
      outline: 'none'
    },
    '.cm-scroller': {
      overflowX: 'auto',
      overflowY: 'auto',
      fontFamily: 'var(--font-mono)',
      fontSize: '13px',
      lineHeight: '1.65'
    },
    '.cm-content': {
      minHeight: '220px',
      minWidth: '100%',
      padding: '10px 0',
      caretColor: 'var(--accent)'
    },
    '.cm-line': {
      padding: '0 12px 0 6px'
    },
    '.cm-gutters': {
      background: 'var(--surface-subtle)',
      borderRight: '1px solid var(--border)',
      color: 'var(--text-muted)'
    },
    '.cm-lineNumbers .cm-gutterElement': {
      minWidth: '0',
      padding: '0 2px 0 4px',
      color: 'color-mix(in srgb, var(--accent) 58%, var(--text-muted))',
      textAlign: 'right'
    },
    '.cm-lineNumbers': {
      flex: '0 0 auto'
    },
    '.cm-foldGutter': {
      width: '18px'
    },
    '.cm-foldGutter .cm-gutterElement': {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '0 2px',
      color: 'var(--text-muted)',
      cursor: 'pointer'
    },
    '.cm-foldGutter .cm-gutterElement:hover': {
      color: 'var(--accent)'
    },
    '.cm-foldPlaceholder': {
      margin: '0 4px',
      padding: '0 5px',
      border: '1px solid var(--border-strong)',
      borderRadius: '4px',
      background: 'var(--surface-hover)',
      color: 'var(--text-secondary)'
    },
    '.cm-placeholder': {
      color: 'var(--text-muted)'
    },
    '.cm-selectionBackground, ::selection': {
      background:
        'color-mix(in srgb, var(--accent) 22%, transparent) !important'
    },
    '.cm-cursor': {
      borderLeftColor: 'var(--accent)'
    },
    '.cm-activeLineGutter': {
      background: 'transparent'
    },
    '.cm-activeLine': {
      background: 'color-mix(in srgb, var(--accent) 5%, transparent)'
    }
  },
  { dark: false }
)

const foldMarkerSvg = `<svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true"><path d="M4.5 6.25 8 9.75l3.5-3.5" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`

function markerDOM(open) {
  const marker = document.createElement('span')
  marker.className = `code-editor__fold-marker ${open ? 'is-open' : 'is-closed'}`
  marker.innerHTML = foldMarkerSvg
  return marker
}

function languageExtension(language) {
  return language === 'xml' ? xml() : json()
}

function jsonKeyText(state, node) {
  const raw = state.sliceDoc(node.from, node.to)
  try {
    return JSON.parse(raw)
  } catch {
    return raw
  }
}

function arrayChildIndex(parent, child) {
  let index = 0
  for (let node = parent.firstChild; node; node = node.nextSibling) {
    if (node.from === child.from && node.to === child.to) return index
    if (!['[', ']', ','].includes(node.name)) index += 1
  }
  return 0
}

function jsonPathSegments(state, position) {
  let node = syntaxTree(state).resolveInner(position, 1)
  const segments = []
  let guard = 0

  while (node && node.parent && guard < 500) {
    const parent = node.parent
    if (parent.name === 'Property') {
      if (node.name !== 'PropertyName' && node.name !== ':') {
        const key = parent.getChild('PropertyName')
        if (key) segments.unshift(jsonKeyText(state, key))
      }
    } else if (parent.name === 'Array') {
      if (!['[', ']', ','].includes(node.name)) {
        segments.unshift(`[${arrayChildIndex(parent, node)}]`)
      }
    }
    node = parent
    guard += 1
  }

  return segments
}

function directXmlElements(parent) {
  const elements = []
  for (let child = parent?.firstChild; child; child = child.nextSibling) {
    if (child.name === 'Element') elements.push(child)
  }
  return elements
}

function xmlElementName(state, elementNode) {
  const openTag =
    elementNode.getChild('OpenTag') ||
    elementNode.getChild('SelfClosingTag')
  const tagName = openTag?.getChild('TagName')
  return tagName ? state.sliceDoc(tagName.from, tagName.to) : ''
}

function xmlPathSegment(state, elementNode) {
  const name = xmlElementName(state, elementNode)
  const siblings = directXmlElements(elementNode.parent)
  const sameName = siblings.filter(
    (sibling) => xmlElementName(state, sibling) === name
  )

  if (sameName.length <= 1) return name
  const index = sameName.findIndex(
    (sibling) =>
      sibling.from === elementNode.from && sibling.to === elementNode.to
  )
  if (index < 0) return name
  return `${name}[${index + 1}]`
}

function xmlPathSegments(state, position) {
  let node = syntaxTree(state).resolveInner(position, 1)
  const segments = []
  let guard = 0

  while (node && guard < 500) {
    if (node.name === 'Element') {
      segments.unshift(xmlPathSegment(state, node))
    }
    node = node.parent
    guard += 1
  }

  return segments
}

function refreshStickyPath() {
  if (!view) return

  if (view.scrollDOM.scrollTop <= 2) {
    stickyPath.value = ''
    return
  }

  const state = view.state
  const viewportTop = view.scrollDOM.getBoundingClientRect().top
  const block = view.lineBlockAtHeight(
    Math.max(0, viewportTop - view.documentTop + 1)
  )
  const line = state.doc.lineAt(block.from)
  const indent = line.text.length - line.text.trimStart().length
  const position = Math.min(
    line.from + (line.text.trim() ? indent : 0),
    state.doc.length
  )
  const segments =
    props.language === 'xml'
      ? xmlPathSegments(state, position)
      : jsonPathSegments(state, position)
  stickyPath.value = segments.join(' › ')
}

function scheduleStickyRefresh() {
  if (stickyFrame) return

  const schedule =
    typeof requestAnimationFrame === 'function'
      ? requestAnimationFrame
      : (callback) => setTimeout(callback, 0)
  stickyFrame = schedule(() => {
    stickyFrame = 0
    refreshStickyPath()
  })
}

function onUpdate(update) {
  if (update.docChanged || update.viewportChanged || update.geometryChanged) {
    scheduleStickyRefresh()
  }
  if (!update.docChanged || applyingExternalValue) return
  emit('update:modelValue', update.state.doc.toString())
}

function onPaste(event) {
  emit('paste', event)
  return event.defaultPrevented
}

function createEditor() {
  if (!host.value) return

  view = new EditorView({
    parent: host.value,
    state: EditorState.create({
      doc: props.modelValue,
      extensions: [
        props.showLineNumbers ? lineNumbers() : [],
        props.showFoldGutter ? foldGutter({ markerDOM }) : [],
        EditorState.readOnly.of(props.readOnly),
        EditorView.editable.of(!props.readOnly),
        history(),
        bracketMatching(),
        indentOnInput(),
        indentUnit.of('  '),
        EditorState.tabSize.of(2),
        keymap.of([
          ...defaultKeymap,
          ...historyKeymap,
          ...foldKeymap,
          indentWithTab,
          { key: 'Mod-a', run: selectAll }
        ]),
        languageCompartment.of(languageExtension(props.language)),
        editorTheme,
        syntaxHighlighting(syntaxTheme),
        placeholderExtension(props.placeholder),
        EditorView.contentAttributes.of({
          id: props.inputId,
          role: 'textbox',
          'aria-label': props.ariaLabel,
          'aria-multiline': 'true',
          autocapitalize: 'off',
          spellcheck: 'false',
          translate: 'no'
        }),
        EditorView.updateListener.of(onUpdate),
        EditorView.domEventHandlers({
          paste: onPaste
        })
      ]
    })
  })
  view.scrollDOM.addEventListener('scroll', scheduleStickyRefresh, {
    passive: true
  })
}

function focus() {
  view?.focus()
}

function foldAll() {
  return view ? Boolean(foldAllCommand(view)) : false
}

function unfoldAll() {
  return view ? Boolean(unfoldAllCommand(view)) : false
}

function arrayValueNodes(arrayNode) {
  const values = []
  for (let node = arrayNode.firstChild; node; node = node.nextSibling) {
    if (!['[', ']', ','].includes(node.name)) values.push(node)
  }
  return values
}

function propertyValueNode(propertyNode) {
  for (let node = propertyNode.firstChild; node; node = node.nextSibling) {
    if (node.name !== 'PropertyName' && node.name !== ':') return node
  }
  return null
}

function selectPath(segments) {
  if (!view || !Array.isArray(segments) || segments.length === 0) return false

  const state = view.state
  let node = syntaxTree(state).topNode.firstChild
  if (!node) return false

  for (const segment of segments) {
    if (typeof segment === 'number') {
      if (node.name !== 'Array') return false
      const child = arrayValueNodes(node)[segment]
      if (!child) return false
      node = child
      continue
    }

    if (node.name !== 'Object') return false
    let next = null
    for (let child = node.firstChild; child; child = child.nextSibling) {
      if (child.name !== 'Property') continue
      const key = child.getChild('PropertyName')
      if (!key) continue
      if (jsonKeyText(state, key) !== segment) continue
      next = propertyValueNode(child)
      break
    }
    if (!next) return false
    node = next
  }

  view.dispatch({
    selection: { anchor: node.from, head: node.to },
    effects: EditorView.scrollIntoView(node.from, { y: 'center' })
  })
  view.focus()
  return true
}

function xmlAttributeNode(state, elementNode, name) {
  const openTag =
    elementNode.getChild('OpenTag') ||
    elementNode.getChild('SelfClosingTag')
  if (!openTag) return null

  for (let child = openTag.firstChild; child; child = child.nextSibling) {
    if (child.name !== 'Attribute') continue
    const attributeName = child.getChild('AttributeName')
    if (!attributeName) continue
    if (state.sliceDoc(attributeName.from, attributeName.to) === name) {
      return child
    }
  }

  return null
}

function syntaxChildren(parent, name) {
  const children = []
  for (let child = parent?.firstChild; child; child = child.nextSibling) {
    if (child.name === name) children.push(child)
  }
  return children
}

function syntaxTextGroups(parent) {
  const groups = []
  let current = null

  for (let child = parent?.firstChild; child; child = child.nextSibling) {
    if (XML_TEXT_CHUNK_NAMES.has(child.name)) {
      if (current) {
        current.to = child.to
      } else {
        current = { from: child.from, to: child.to }
        groups.push(current)
      }
      continue
    }
    current = null
  }

  return groups
}

function selectXmlAddress(address) {
  if (!view || !Array.isArray(address) || address.length === 0) return false

  const state = view.state
  const root = syntaxTree(state).topNode
  let elementNode = null
  let target = null

  for (const segment of address) {
    if (!segment || !Number.isInteger(segment.index)) {
      if (segment?.type === 'document') {
        target = root
        elementNode = null
        continue
      }
      if (segment?.type !== 'attribute') return false
    }

    const parent = elementNode || root

    if (segment.type === 'element') {
      const candidate = directXmlElements(parent)[segment.index]
      if (!candidate) return false
      if (
        segment.name &&
        xmlElementName(state, candidate) !== segment.name
      ) {
        return false
      }
      elementNode = candidate
      target = candidate
      continue
    }

    if (segment.type === 'attribute') {
      const candidate = elementNode
        ? xmlAttributeNode(state, elementNode, segment.name)
        : null
      if (!candidate) return false
      target = candidate
      continue
    }

    if (segment.type === 'text') {
      const candidate = syntaxTextGroups(parent)[segment.index]
      if (!candidate) return false
      target = candidate
      elementNode = null
      continue
    }

    const syntaxName = {
      cdata: 'Cdata',
      comment: 'Comment',
      'processing-instruction': 'ProcessingInst'
    }[segment.type]
    if (!syntaxName) return false

    const candidate = syntaxChildren(parent, syntaxName)[segment.index]
    if (!candidate) return false
    target = candidate
    elementNode = null
  }

  if (!target) return false

  view.dispatch({
    selection: { anchor: target.from, head: target.to },
    effects: EditorView.scrollIntoView(target.from, { y: 'center' })
  })
  view.focus()
  return true
}

watch(
  () => props.modelValue,
  (value) => {
    if (!view) return
    const current = view.state.doc.toString()
    if (current === value) return

    applyingExternalValue = true
    view.dispatch({
      changes: {
        from: 0,
        to: current.length,
        insert: value
      }
    })
    applyingExternalValue = false
  }
)

watch(
  () => props.language,
  (language) => {
    view?.dispatch({
      effects: languageCompartment.reconfigure(languageExtension(language))
    })
    scheduleStickyRefresh()
  }
)

onMounted(createEditor)

onBeforeUnmount(() => {
  view?.scrollDOM.removeEventListener('scroll', scheduleStickyRefresh)
  view?.destroy()
  view = null
  if (stickyFrame) {
    cancelAnimationFrame(stickyFrame)
    stickyFrame = 0
  }
})

defineExpose({
  focus,
  foldAll,
  unfoldAll,
  selectPath,
  selectXmlAddress
})
</script>

<template>
  <div
    class="code-editor"
    :data-testid="testId || undefined"
    :data-language="language"
    :data-value="modelValue"
  >
    <div
      v-if="stickyPath"
      class="code-editor__sticky"
      data-testid="code-editor-sticky-path"
      :title="stickyPath"
    >
      {{ stickyPath }}
    </div>
    <div ref="host" class="code-editor__host"></div>
  </div>
</template>

<style scoped>
.code-editor {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 220px;
  overflow: hidden;
  background: var(--app-bg);
}

.code-editor__host {
  flex: 1 1 auto;
  min-height: 0;
  overflow: hidden;
}

.code-editor__sticky {
  flex: 0 0 auto;
  display: block;
  height: 26px;
  padding: 0 10px;
  overflow: hidden;
  border-bottom: 1px solid var(--border);
  background: var(--surface-subtle);
  color: var(--text-muted);
  font-family: var(--font-mono);
  font-size: 11.5px;
  line-height: 26px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.code-editor :deep(.code-editor__fold-marker) {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  transition: transform 120ms ease;
}

.code-editor :deep(.code-editor__fold-marker.is-closed) {
  transform: rotate(-90deg);
}
</style>
