const POSITION_PATTERN = /\bat position\s+(\d+)\b/i
const LINE_COLUMN_PATTERN = /\bline\s+(\d+)(?:,\s*|\s+)column\s+(\d+)\b/i

export function isJsonInputEmpty(value) {
  return typeof value !== 'string' || value.trim().length === 0
}

export function positionToLineColumn(text, position) {
  if (
    typeof text !== 'string' ||
    !Number.isInteger(position) ||
    position < 0 ||
    position > text.length
  ) {
    return null
  }

  let line = 1
  let column = 1

  for (let index = 0; index < position; index += 1) {
    const character = text[index]

    if (character === '\r') {
      if (text[index + 1] === '\n' && index + 1 < position) {
        index += 1
      }
      line += 1
      column = 1
    } else if (character === '\n') {
      line += 1
      column = 1
    } else {
      column += 1
    }
  }

  return { line, column }
}

export function normalizeJsonError(error, input) {
  const message =
    error && typeof error.message === 'string' && error.message
      ? error.message
      : 'JSON 解析失败'

  const positionMatch = POSITION_PATTERN.exec(message)
  const lineColumnMatch = LINE_COLUMN_PATTERN.exec(message)
  const position = positionMatch ? Number(positionMatch[1]) : null

  let line = lineColumnMatch ? Number(lineColumnMatch[1]) : null
  let column = lineColumnMatch ? Number(lineColumnMatch[2]) : null

  if (
    (line === null || column === null) &&
    position !== null &&
    typeof input === 'string'
  ) {
    const derived = positionToLineColumn(input, position)
    if (derived) {
      line = line ?? derived.line
      column = column ?? derived.column
    }
  }

  let displayMessage = message
  if (Number.isInteger(line) && Number.isInteger(column)) {
    displayMessage = `${message}\n位置：第 ${line} 行，第 ${column} 列`
  } else if (Number.isInteger(line)) {
    displayMessage = `${message}\n位置：第 ${line} 行`
  } else if (Number.isInteger(column)) {
    displayMessage = `${message}\n位置：第 ${column} 列`
  }

  return {
    message,
    displayMessage,
    position,
    line,
    column
  }
}

export function parseJsonText(text) {
  if (typeof text !== 'string') {
    return {
      ok: false,
      error: normalizeJsonError({ message: 'JSON 输入必须是文本' }, '')
    }
  }

  try {
    return {
      ok: true,
      value: JSON.parse(text)
    }
  } catch (error) {
    return {
      ok: false,
      error: normalizeJsonError(error, text)
    }
  }
}

export function formatJsonText(text) {
  const parsed = parseJsonText(text)
  if (!parsed.ok) return parsed

  try {
    return {
      ok: true,
      value: JSON.stringify(parsed.value, null, 2)
    }
  } catch (error) {
    return {
      ok: false,
      error: normalizeJsonError(error, text)
    }
  }
}

export function jsonValueToDisplay(value) {
  if (value === null) return 'null'
  if (typeof value === 'string') return JSON.stringify(value)
  if (typeof value === 'number') {
    return Object.is(value, -0) ? '-0' : String(value)
  }
  if (typeof value === 'boolean') return String(value)
  return String(value)
}
