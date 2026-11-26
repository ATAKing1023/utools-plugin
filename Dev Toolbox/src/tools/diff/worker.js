import { buildDiffResult } from './logic.js'

self.onmessage = (event) => {
  const { id, original, revised, timeout } = event.data || {}

  try {
    const result = buildDiffResult(original, revised, {
      skipIdenticalRows: true,
      timeout
    })
    self.postMessage({ id, result })
  } catch (error) {
    self.postMessage({
      id,
      error:
        error instanceof Error
          ? `${error.name}: ${error.message}`
          : String(error)
    })
  }
}
