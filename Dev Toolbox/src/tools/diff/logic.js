import { diffLines } from 'diff'

export const DIFF_MARKERS = Object.freeze({
  context: '',
  removed: '-',
  added: '+',
  changed: '~'
})

export function filterDiffRows(rows, onlyDifferences) {
  if (!Array.isArray(rows)) return []
  return onlyDifferences
    ? rows.filter((row) => row.type !== 'context')
    : rows.slice()
}

function createCounts() {
  return {
    added: 0,
    removed: 0,
    changed: 0,
    unchanged: 0
  }
}

function normalizeInput(value) {
  return typeof value === 'string' ? value : ''
}

function countLines(value) {
  const text = normalizeInput(value)
  if (text.length === 0) return 0

  let lines = 0
  let endsWithNewline = false

  for (let index = 0; index < text.length; index += 1) {
    const character = text.charCodeAt(index)
    if (character === 10) {
      lines += 1
      endsWithNewline = true
      continue
    }
    if (character === 13) {
      lines += 1
      endsWithNewline = true
      if (text.charCodeAt(index + 1) === 10) index += 1
      continue
    }
    endsWithNewline = false
  }

  return endsWithNewline ? lines : lines + 1
}

export function splitLineDetails(value) {
  const text = normalizeInput(value)
  if (text.length === 0) return []

  const pieces = text.split(/(\r\n|\n|\r)/)
  const lines = []

  for (let index = 0; index < pieces.length; index += 2) {
    const lineText = pieces[index] ?? ''
    const lineEnding = pieces[index + 1] ?? ''
    const isTrailingSplit = index === pieces.length - 1

    if (isTrailingSplit && lineText === '' && lineEnding === '') break
    lines.push({
      text: lineText,
      hasNewline: lineEnding.length > 0
    })
  }

  return lines
}

export function buildDiffResult(originalValue, revisedValue, options = {}) {
  const original = normalizeInput(originalValue)
  const revised = normalizeInput(revisedValue)
  const isEmpty = original.length === 0 && revised.length === 0
  const skipIdenticalRows = options.skipIdenticalRows === true

  if (isEmpty) {
    return {
      isEmpty: true,
      identical: false,
      rows: [],
      counts: createCounts()
    }
  }

  if (skipIdenticalRows && original === revised) {
    return {
      isEmpty: false,
      identical: true,
      hasDifferences: false,
      rows: [],
      counts: {
        added: 0,
        removed: 0,
        changed: 0,
        unchanged: countLines(original)
      }
    }
  }

  let parts
  try {
    parts = diffLines(original, revised, {
      ignoreWhitespace: false,
      stripTrailingCr: false,
      ignoreNewlineAtEof: false,
      maxEditLength: options.maxEditLength,
      timeout: options.timeout
    })
  } catch {
    return {
      isEmpty: false,
      identical: false,
      rows: [],
      counts: createCounts(),
      error: '无法计算文本差异，请检查输入内容。'
    }
  }

  if (!Array.isArray(parts)) {
    return {
      isEmpty: false,
      identical: false,
      rows: [],
      counts: createCounts(),
      limited: true,
      error: '文本差异过大，已停止精确比较。请缩小对比范围后重试。'
    }
  }

  const rows = []
  const counts = createCounts()
  let oldNumber = 1
  let newNumber = 1
  let partIndex = 0

  const addContextLines = (part) => {
    for (const line of splitLineDetails(part.value)) {
      rows.push({
        type: 'context',
        marker: DIFF_MARKERS.context,
        oldNumber,
        newNumber,
        oldText: line.text,
        newText: line.text,
        hasNewline: line.hasNewline
      })
      oldNumber += 1
      newNumber += 1
      counts.unchanged += 1
    }
  }

  const addRemovedLines = (lines, startIndex = 0) => {
    for (let index = startIndex; index < lines.length; index += 1) {
      const line = lines[index]
      rows.push({
        type: 'removed',
        marker: DIFF_MARKERS.removed,
        oldNumber,
        newNumber: null,
        oldText: line.text,
        newText: '',
        hasNewline: line.hasNewline
      })
      oldNumber += 1
      counts.removed += 1
    }
  }

  const addAddedLines = (
    lines,
    includeLineNumbers = true,
    startIndex = 0
  ) => {
    for (let index = startIndex; index < lines.length; index += 1) {
      const line = lines[index]
      rows.push({
        type: 'added',
        marker: DIFF_MARKERS.added,
        oldNumber: null,
        newNumber: includeLineNumbers ? newNumber : null,
        oldText: '',
        newText: line.text,
        hasNewline: line.hasNewline
      })
      newNumber += 1
      counts.added += 1
    }
  }

  while (partIndex < parts.length) {
    const part = parts[partIndex]

    if (!part.added && !part.removed) {
      addContextLines(part)
      partIndex += 1
      continue
    }

    if (part.removed) {
      const removedLines = []
      while (partIndex < parts.length && parts[partIndex].removed) {
        for (const line of splitLineDetails(parts[partIndex].value)) {
          removedLines.push(line)
        }
        partIndex += 1
      }

      const addedLines = []
      while (partIndex < parts.length && parts[partIndex].added) {
        for (const line of splitLineDetails(parts[partIndex].value)) {
          addedLines.push(line)
        }
        partIndex += 1
      }

      const pairedCount = Math.min(removedLines.length, addedLines.length)

      for (let index = 0; index < pairedCount; index += 1) {
        const oldLine = removedLines[index]
        const newLine = addedLines[index]
        rows.push({
          type: 'changed',
          marker: DIFF_MARKERS.changed,
          oldNumber,
          newNumber,
          oldText: oldLine.text,
          newText: newLine.text,
          oldHasNewline: oldLine.hasNewline,
          newHasNewline: newLine.hasNewline
        })
        oldNumber += 1
        newNumber += 1
        counts.changed += 1
      }

      addRemovedLines(removedLines, pairedCount)
      addAddedLines(addedLines, true, pairedCount)
      continue
    }

    const addedLines = []
    while (partIndex < parts.length && parts[partIndex].added) {
      for (const line of splitLineDetails(parts[partIndex].value)) {
        addedLines.push(line)
      }
      partIndex += 1
    }
    addAddedLines(addedLines)
  }

  const hasDifferences =
    counts.added > 0 || counts.removed > 0 || counts.changed > 0

  return {
    isEmpty: false,
    identical: original === revised && !hasDifferences,
    hasDifferences,
    rows,
    counts
  }
}
