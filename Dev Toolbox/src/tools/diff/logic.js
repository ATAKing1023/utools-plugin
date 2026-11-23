import { createTwoFilesPatch, diffLines } from 'diff'

export const DIFF_MARKERS = Object.freeze({
  context: '',
  removed: '-',
  added: '+',
  changed: '~'
})

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

export function buildUnifiedDiff(originalValue, revisedValue) {
  const original = normalizeInput(originalValue)
  const revised = normalizeInput(revisedValue)

  try {
    return createTwoFilesPatch(
      'original.txt',
      'revised.txt',
      original,
      revised,
      '',
      '',
      {
        context: 3,
        ignoreWhitespace: false,
        stripTrailingCr: false
      }
    )
  } catch {
    return ''
  }
}

export function buildDiffResult(originalValue, revisedValue) {
  const original = normalizeInput(originalValue)
  const revised = normalizeInput(revisedValue)
  const isEmpty = original.length === 0 && revised.length === 0

  if (isEmpty) {
    return {
      isEmpty: true,
      identical: false,
      rows: [],
      counts: createCounts(),
      unifiedDiff: ''
    }
  }

  let parts
  try {
    parts = diffLines(original, revised, {
      ignoreWhitespace: false,
      stripTrailingCr: false,
      ignoreNewlineAtEof: false
    })
  } catch {
    return {
      isEmpty: false,
      identical: false,
      rows: [],
      counts: createCounts(),
      unifiedDiff: '',
      error: '无法计算文本差异，请检查输入内容。'
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

  const addRemovedLines = (lines) => {
    for (const line of lines) {
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

  const addAddedLines = (lines, includeLineNumbers = true) => {
    for (const line of lines) {
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
        removedLines.push(...splitLineDetails(parts[partIndex].value))
        partIndex += 1
      }

      const addedLines = []
      while (partIndex < parts.length && parts[partIndex].added) {
        addedLines.push(...splitLineDetails(parts[partIndex].value))
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

      addRemovedLines(removedLines.slice(pairedCount))
      addAddedLines(addedLines.slice(pairedCount))
      continue
    }

    const addedLines = []
    while (partIndex < parts.length && parts[partIndex].added) {
      addedLines.push(...splitLineDetails(parts[partIndex].value))
      partIndex += 1
    }
    addAddedLines(addedLines)
  }

  const hasDifferences = rows.some((row) => row.type !== 'context')

  return {
    isEmpty: false,
    identical: original === revised && !hasDifferences,
    hasDifferences,
    rows,
    counts,
    unifiedDiff: buildUnifiedDiff(original, revised)
  }
}
