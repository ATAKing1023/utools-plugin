import { describe, expect, it } from 'vitest'
import { shouldUseWorkerDiff } from './runtime.js'

describe('diff runtime routing', () => {
  it('keeps small inputs on the synchronous path', () => {
    expect(shouldUseWorkerDiff('alpha\nbeta\n', 'alpha\ngamma\n')).toBe(false)
  })

  it('routes inputs over the character threshold to the worker', () => {
    expect(shouldUseWorkerDiff('a'.repeat(40000), 'b'.repeat(40000))).toBe(
      true
    )
  })

  it('routes line-heavy inputs below the character threshold to the worker', () => {
    const original = Array.from({ length: 1200 }, (_, index) =>
      index % 100 === 0 ? 'changed' : 'same'
    ).join('\n')
    const revised = original.replace('changed', 'updated')

    expect(original.length + revised.length).toBeLessThan(80000)
    expect(shouldUseWorkerDiff(original, revised)).toBe(true)
  })

  it('counts CRLF pairs as one line break', () => {
    const text = `${'same\r\n'.repeat(1000)}tail`

    expect(shouldUseWorkerDiff(text, text)).toBe(true)
  })

  it('routes the 78000-character, 19500-line pathological case', () => {
    const original = 'a\n'.repeat(19500)
    const revised = 'b\n'.repeat(19500)

    expect(original.length + revised.length).toBe(78000)
    expect(shouldUseWorkerDiff(original, revised)).toBe(true)
  })
})
