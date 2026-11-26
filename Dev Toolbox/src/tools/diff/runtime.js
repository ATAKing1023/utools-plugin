export const ASYNC_INPUT_THRESHOLD = 80000
export const ASYNC_LINE_THRESHOLD = 1000

function countLineBreaks(value) {
  const text = typeof value === 'string' ? value : ''
  let lineBreaks = 0

  for (let index = 0; index < text.length; index += 1) {
    const character = text.charCodeAt(index)
    if (character === 13) {
      lineBreaks += 1
      if (text.charCodeAt(index + 1) === 10) index += 1
    } else if (character === 10) {
      lineBreaks += 1
    }
  }

  return lineBreaks
}

export function shouldUseWorkerDiff(originalValue, revisedValue) {
  const original = typeof originalValue === 'string' ? originalValue : ''
  const revised = typeof revisedValue === 'string' ? revisedValue : ''

  if (original.length + revised.length >= ASYNC_INPUT_THRESHOLD) {
    return true
  }

  return (
    countLineBreaks(original) + countLineBreaks(revised) >=
    ASYNC_LINE_THRESHOLD
  )
}
