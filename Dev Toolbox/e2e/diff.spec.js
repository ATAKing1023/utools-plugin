import {
  collectPageErrors,
  expect,
  openApp,
  test
} from './fixtures/utools.js'

test.use({ viewport: { width: 1200, height: 800 } })

async function enterDiff(page) {
  await openApp(page)
  await page.evaluate(() => {
    window.__utoolsTest.enter({
      code: 'diff',
      type: 'text',
      payload: '文本 Diff',
      from: 'main'
    })
  })
  await expect(page.locator('.app-shell')).toHaveAttribute('data-route', 'diff')
}

async function expectNoPageOverflow(page) {
  const metrics = await page.evaluate(() => ({
    documentWidth: document.documentElement.scrollWidth,
    viewportWidth: document.documentElement.clientWidth,
    bodyWidth: document.body.scrollWidth
  }))

  expect(metrics.documentWidth).toBeLessThanOrEqual(metrics.viewportWidth)
  expect(metrics.bodyWidth).toBeLessThanOrEqual(metrics.viewportWidth)
}

test('renders diff rows and counts without a unified patch output', async ({
  page
}) => {
  const errors = collectPageErrors(page)
  await enterDiff(page)

  await expect(page.locator('[data-state="empty"]')).toBeVisible()
  await expect(page.locator('.diff-field__label')).toHaveText(['原文', '新文'])

  await page.locator('#diff-original').fill(
    'same\nold-only\nmiddle\nold-change\ntail\n'
  )
  await page.locator('#diff-revised').fill(
    'same\nmiddle\nnew-change\nnew-only\ntail\n'
  )

  await expect(page.locator('[data-row-kind="removed"]')).toHaveCount(1)
  await expect(page.locator('[data-row-kind="added"]')).toHaveCount(1)
  await expect(page.locator('[data-row-kind="changed"]')).toHaveCount(1)
  await expect(page.locator('[data-marker="-"]')).toHaveCount(1)
  await expect(page.locator('[data-marker="+"]')).toHaveCount(1)
  await expect(page.locator('[data-marker="~"]')).toHaveCount(1)
  await expect(page.locator('[data-count="added"]')).toContainText('新增 1')
  await expect(page.locator('[data-count="removed"]')).toContainText('删除 1')
  await expect(page.locator('[data-count="changed"]')).toContainText('修改 1')
  await expect(page.locator('[data-count="unchanged"]')).toContainText(
    '未变化 3'
  )

  await expect(page.locator('.output-row__value')).toHaveCount(0)
  await expect(
    page.getByRole('button', { name: '复制 统一 DIFF' })
  ).toHaveCount(0)
  await expect(page.locator('.output-list')).toHaveCount(0)

  expect(errors).toEqual([])
})

test('handles identical, whitespace-sensitive and one-sided input', async ({
  page
}) => {
  const errors = collectPageErrors(page)
  await enterDiff(page)

  await expect(
    page.getByRole('checkbox', { name: '仅显示差异' })
  ).toHaveCount(0)

  await page.locator('#diff-original').fill('identical\nlines\n')
  await page.locator('#diff-revised').fill('identical\nlines\n')

  await expect(page.locator('[data-testid="diff-identical"]')).toBeVisible()
  await expect(page.locator('[data-testid="diff-identical"]')).toContainText(
    '无差异'
  )
  await expect(page.locator('[data-count="added"]')).toContainText('新增 0')
  await expect(page.locator('[data-count="removed"]')).toContainText('删除 0')
  await expect(page.locator('[data-count="changed"]')).toContainText('修改 0')
  await expect(page.locator('[data-row-kind="changed"]')).toHaveCount(0)
  await expect(page.locator('.diff-table-wrap')).toHaveCount(0)
  await expect(page.locator('#diff-table')).toHaveCount(0)
  await expect(
    page.getByRole('checkbox', { name: '仅显示差异' })
  ).toBeDisabled()

  await page.locator('#diff-original').fill('alpha \nbeta\t')
  await page.locator('#diff-revised').fill('alpha\nbeta')

  await expect(page.locator('[data-row-kind="changed"]')).toHaveCount(2)
  await expect(page.locator('[data-count="changed"]')).toContainText('修改 2')
  await expect(
    page.locator('[data-row-kind="changed"] .diff-row__text').first()
  ).toHaveText('alpha ')

  await page.locator('#diff-original').fill('')
  await page.locator('#diff-revised').fill('new line\n')
  await expect(page.locator('[data-row-kind="added"]')).toHaveCount(1)
  await expect(page.locator('[data-count="added"]')).toContainText('新增 1')
  await expect(page.locator('.error-notice')).toHaveCount(0)

  await page.getByRole('checkbox', { name: '仅显示差异' }).check()
  await expect(page.locator('[data-row-kind="added"]')).toHaveCount(1)
  await expect(page.locator('[data-row-kind="context"]')).toHaveCount(0)
  await expect(page.locator('[data-count="added"]')).toContainText('新增 1')
  await expect(page.locator('.diff-filter-note')).toBeVisible()

  await page.locator('#diff-original').fill('removed line\n')
  await page.locator('#diff-revised').fill('')
  await expect(page.locator('[data-row-kind="removed"]')).toHaveCount(1)
  await expect(page.locator('[data-row-kind="added"]')).toHaveCount(0)
  await expect(page.locator('[data-row-kind="context"]')).toHaveCount(0)
  await expect(page.locator('[data-count="removed"]')).toContainText('删除 1')
  await expect(page.locator('[data-count="added"]')).toContainText('新增 0')
  await expect(page.locator('.diff-filter-note')).toBeVisible()

  await page.setViewportSize({ width: 320, height: 700 })
  await expectNoPageOverflow(page)
  await expect(
    page.getByRole('checkbox', { name: '仅显示差异' })
  ).toBeVisible()
  await expect(page.locator('.diff-table-wrap')).toBeVisible()

  await page.setViewportSize({ width: 375, height: 700 })
  await expectNoPageOverflow(page)
  await expect(page.locator('#diff-original')).toBeVisible()
  await expect(page.locator('#diff-revised')).toBeVisible()
  await page.locator('#diff-original').fill('mobile')
  await page.locator('#diff-revised').fill('mobile updated')
  await expect(page.locator('[data-row-kind="changed"]')).toHaveCount(1)

  expect(errors).toEqual([])
})

test('filters context rows without changing full counts', async ({
  page
}) => {
  const errors = collectPageErrors(page)
  await enterDiff(page)

  await page.locator('#diff-original').fill(
    'same\nold-only\nmiddle\nold-change\ntail\n'
  )
  await page.locator('#diff-revised').fill(
    'same\nmiddle\nnew-change\nnew-only\ntail\n'
  )

  const toggle = page.getByRole('checkbox', { name: '仅显示差异' })
  await expect(toggle).toBeVisible()
  await expect(toggle).not.toBeChecked()
  await expect(page.locator('.diff-row')).toHaveCount(6)
  await expect(page.locator('[data-row-kind="context"]')).toHaveCount(3)

  await page.locator('#diff-original').focus()
  await page.keyboard.press('Tab')
  await expect(page.locator('#diff-revised')).toBeFocused()
  await page.keyboard.press('Tab')
  await expect(toggle).toBeFocused()
  await page.keyboard.press('Space')

  await expect(toggle).toBeChecked()
  await expect(toggle).toBeFocused()
  const focusStyle = await toggle.evaluate((input) => {
    const style = getComputedStyle(input.nextElementSibling)
    return {
      outlineStyle: style.outlineStyle,
      outlineWidth: style.outlineWidth
    }
  })
  expect(focusStyle.outlineStyle).not.toBe('none')
  expect(focusStyle.outlineWidth).not.toBe('0px')

  await expect(page.locator('.diff-row')).toHaveCount(3)
  await expect(page.locator('[data-row-kind="context"]')).toHaveCount(0)
  await expect(page.locator('[data-marker="-"]')).toHaveCount(1)
  await expect(page.locator('[data-marker="+"]')).toHaveCount(1)
  await expect(page.locator('[data-marker="~"]')).toHaveCount(1)
  await expect(
    page.locator('[data-row-kind="removed"] .diff-table__number')
  ).toHaveText(['2', ''])
  await expect(
    page.locator('[data-row-kind="changed"] .diff-table__number')
  ).toHaveText(['4', '3'])
  await expect(
    page.locator('[data-row-kind="added"] .diff-table__number')
  ).toHaveText(['', '4'])
  await expect(page.locator('[data-count="added"]')).toContainText('新增 1')
  await expect(page.locator('[data-count="removed"]')).toContainText('删除 1')
  await expect(page.locator('[data-count="changed"]')).toContainText('修改 1')
  await expect(page.locator('[data-count="unchanged"]')).toContainText(
    '未变化 3'
  )
  await expect(page.locator('.diff-filter-note')).toHaveText(
    '上下文行已隐藏；统计仍为完整差异'
  )

  await page.keyboard.press('Space')
  await expect(toggle).not.toBeChecked()
  await expect(page.locator('.diff-row')).toHaveCount(6)
  await expect(page.locator('[data-row-kind="context"]')).toHaveCount(3)
  await expect(page.locator('.diff-filter-note')).toHaveCount(0)

  await page.keyboard.press('Space')
  await expect(toggle).toBeChecked()
  await expect(page.locator('.diff-row')).toHaveCount(3)

  expect(errors).toEqual([])
})

test('keeps the no-diff state and preserves the filter across input changes', async ({
  page
}) => {
  const errors = collectPageErrors(page)
  await enterDiff(page)

  await page.locator('#diff-original').fill(
    'same\nold-only\nmiddle\nold-change\ntail\n'
  )
  await page.locator('#diff-revised').fill(
    'same\nmiddle\nnew-change\nnew-only\ntail\n'
  )

  const toggle = page.getByRole('checkbox', { name: '仅显示差异' })
  await toggle.check()
  await expect(page.locator('.diff-row')).toHaveCount(3)

  await page.locator('#diff-original').fill(
    'same\nmiddle\nnew-change\nnew-only\ntail\n'
  )

  await expect(page.locator('[data-testid="diff-identical"]')).toBeVisible()
  await expect(page.locator('[data-testid="diff-identical"]')).toContainText(
    '无差异'
  )
  await expect(toggle).toBeChecked()
  await expect(toggle).toBeDisabled()
  await expect(page.locator('.diff-row')).toHaveCount(0)
  await expect(page.locator('.diff-filter-note')).toHaveCount(0)
  await expect(page.locator('[data-count="unchanged"]')).toContainText(
    '未变化 5'
  )

  await page.locator('#diff-revised').fill(
    'same\nmiddle\nnew-change\nnew-only\nextra\ntail\n'
  )

  await expect(toggle).toBeEnabled()
  await expect(toggle).toBeChecked()
  await expect(page.locator('.diff-row')).toHaveCount(1)
  await expect(page.locator('[data-row-kind="added"]')).toHaveCount(1)
  await expect(page.locator('[data-row-kind="context"]')).toHaveCount(0)
  await expect(page.locator('.diff-filter-note')).toBeVisible()

  await page.setViewportSize({ width: 320, height: 700 })
  await expectNoPageOverflow(page)
  await page.setViewportSize({ width: 375, height: 700 })
  await expectNoPageOverflow(page)

  expect(errors).toEqual([])
})

test('routes line-heavy input below the character threshold through the worker', async ({
  page
}) => {
  const errors = collectPageErrors(page)
  const workerUrls = []
  page.on('worker', (worker) => workerUrls.push(worker.url()))
  await enterDiff(page)

  const state = await page.evaluate(async () => {
    const originalRows = Array.from(
      { length: 3000 },
      (_, index) => `line-${index}`
    )
    const revisedRows = originalRows.map((line, index) =>
      index === 1500 ? 'line-changed' : line
    )
    const setValue = (selector, value) => {
      const textarea = document.querySelector(selector)
      Object.getOwnPropertyDescriptor(
        HTMLTextAreaElement.prototype,
        'value'
      ).set.call(textarea, value)
      textarea.dispatchEvent(
        new InputEvent('input', {
          bubbles: true,
          inputType: 'insertFromPaste'
        })
      )
    }

    const original = `${originalRows.join('\n')}\n`
    const revised = `${revisedRows.join('\n')}\n`
    setValue('#diff-original', original)
    setValue('#diff-revised', revised)
    await new Promise((resolve) => setTimeout(resolve, 0))

    return {
      totalChars: original.length + revised.length,
      busy: document.querySelector('.diff-tool').getAttribute('aria-busy')
    }
  })

  expect(state.totalChars).toBeLessThan(80000)
  expect(state.busy).toBe('true')
  await expect(page.locator('[data-count="changed"]')).toContainText(
    '修改 1',
    { timeout: 15000 }
  )
  await expect.poll(() => workerUrls.length).toBeGreaterThan(0)
  expect(workerUrls[0]).toMatch(/^blob:/)

  expect(errors).toEqual([])
})

test('virtualizes a very large one-sided comparison and reaches the final row', async ({
  page
}) => {
  const errors = collectPageErrors(page)
  const workerUrls = []
  page.on('worker', (worker) => workerUrls.push(worker.url()))
  await enterDiff(page)

  await page.evaluate(() => {
    const rows = Array.from(
      { length: 100000 },
      (_, index) => `${String(index).padStart(7, '0')} ${'x'.repeat(50)}`
    )
    const text = `${rows.join('\n')}\n`
    window.__largeDiffText = text
    const textarea = document.querySelector('#diff-original')
    Object.getOwnPropertyDescriptor(
      HTMLTextAreaElement.prototype,
      'value'
    ).set.call(textarea, text)
    textarea.dispatchEvent(
      new InputEvent('input', {
        bubbles: true,
        inputType: 'insertFromPaste'
      })
    )
  })

  await expect(page.locator('[data-count="removed"]')).toContainText(
    '删除 100000',
    { timeout: 15000 }
  )
  await expect(page.locator('#diff-table[role="table"]')).toBeVisible()
  await expect
    .poll(() => page.locator('.virtual-diff-row').count())
    .toBeLessThan(100)
  await expect(
    page.locator('[data-row-kind="removed"]').first()
  ).toBeVisible()

  await page.locator('.virtual-diff-table__viewport').evaluate((viewport) => {
    viewport.scrollTop = viewport.scrollHeight
  })

  const finalRow = page.locator('[data-virtual-index="99999"]')
  await expect(finalRow).toBeVisible()
  await expect(finalRow).toContainText('0099999')
  await expect.poll(() => workerUrls.length).toBeGreaterThan(0)
  expect(workerUrls[0]).toMatch(/^blob:/)

  await page.evaluate(() => {
    const textarea = document.querySelector('#diff-revised')
    Object.getOwnPropertyDescriptor(
      HTMLTextAreaElement.prototype,
      'value'
    ).set.call(textarea, window.__largeDiffText)
    textarea.dispatchEvent(
      new InputEvent('input', {
        bubbles: true,
        inputType: 'insertFromPaste'
      })
    )
  })
  await expect(page.locator('[data-testid="diff-identical"]')).toBeVisible()
  await expect(page.locator('.diff-table-wrap')).toHaveCount(0)
  await expect(page.locator('#diff-table')).toHaveCount(0)

  expect(errors).toEqual([])
})

test('automatically hides large unchanged regions without losing full stats', async ({
  page
}) => {
  const errors = collectPageErrors(page)
  await enterDiff(page)

  await page.evaluate(() => {
    const oldRows = Array.from(
      { length: 25000 },
      (_, index) => `${index} old ${'x'.repeat(50)}`
    )
    window.__diffOldRows = oldRows
    const newRows = oldRows.map((line, index) =>
      index % 1000 === 0 ? line.replace('old', 'new') : line
    )
    const setValue = (selector, value) => {
      const textarea = document.querySelector(selector)
      Object.getOwnPropertyDescriptor(
        HTMLTextAreaElement.prototype,
        'value'
      ).set.call(textarea, value)
      textarea.dispatchEvent(
        new InputEvent('input', {
          bubbles: true,
          inputType: 'insertFromPaste'
        })
      )
    }

    setValue('#diff-original', `${oldRows.join('\n')}\n`)
    setValue('#diff-revised', `${newRows.join('\n')}\n`)
  })

  const toggle = page.getByRole('checkbox', { name: '仅显示差异' })
  await expect(page.locator('[data-count="changed"]')).toContainText(
    '修改 25',
    { timeout: 15000 }
  )
  await expect(toggle).toBeChecked()
  await expect(page.locator('[data-count="unchanged"]')).toContainText(
    '未变化 24975'
  )
  await expect(page.locator('[data-row-kind="context"]')).toHaveCount(0)
  await expect(page.locator('.diff-row')).toHaveCount(25)
  await expect(page.locator('.diff-filter-note')).toBeVisible()

  const staleState = await page.evaluate(async () => {
    const revisedRows = window.__diffOldRows.map((line, index) =>
      index % 100 === 0 ? line.replace('old', 'new') : line
    )
    const textarea = document.querySelector('#diff-revised')
    Object.getOwnPropertyDescriptor(
      HTMLTextAreaElement.prototype,
      'value'
    ).set.call(textarea, `${revisedRows.join('\n')}\n`)
    textarea.dispatchEvent(
      new InputEvent('input', {
        bubbles: true,
        inputType: 'insertFromPaste'
      })
    )
    await new Promise((resolve) => setTimeout(resolve, 0))

    return {
      banner: document.querySelector('.diff-computing')?.textContent || '',
      summaryStale: document
        .querySelector('.diff-summary-row')
        ?.classList.contains('diff-results--stale'),
      filterDisabled: document.querySelector('#diff-only-differences')?.disabled
    }
  })

  expect(staleState.banner).toContain('上一次结果')
  expect(staleState.summaryStale).toBe(true)
  expect(staleState.filterDisabled).toBe(true)
  await expect(page.locator('[data-count="changed"]')).toContainText(
    '修改 250',
    { timeout: 15000 }
  )
  await expect(page.locator('.diff-computing')).toHaveCount(0)

  expect(errors).toEqual([])
})

test('bounds pathological large diffs instead of freezing indefinitely', async ({
  page
}) => {
  const errors = collectPageErrors(page)
  await enterDiff(page)

  await page.evaluate(() => {
    const oldText =
      Array.from(
        { length: 20000 },
        (_, index) => `old ${index} ${'x'.repeat(40)}`
      ).join('\n') + '\n'
    const newText =
      Array.from(
        { length: 20000 },
        (_, index) => `new ${index} ${'y'.repeat(40)}`
      ).join('\n') + '\n'
    const setValue = (selector, value) => {
      const textarea = document.querySelector(selector)
      Object.getOwnPropertyDescriptor(
        HTMLTextAreaElement.prototype,
        'value'
      ).set.call(textarea, value)
      textarea.dispatchEvent(
        new InputEvent('input', {
          bubbles: true,
          inputType: 'insertFromPaste'
        })
      )
    }

    setValue('#diff-original', oldText)
    setValue('#diff-revised', newText)
  })

  await expect(page.locator('.diff-computing')).toBeVisible()
  await page.waitForTimeout(500)
  await page.locator('#diff-revised').focus()
  await expect(page.locator('#diff-revised')).toBeFocused({ timeout: 1000 })

  await expect(page.locator('.error-notice')).toContainText(
    '文本差异过大，已停止精确比较',
    { timeout: 15000 }
  )
  await expect(page.locator('.diff-row')).toHaveCount(0)
  await expect(page.locator('.diff-tool')).toHaveAttribute('aria-busy', 'false')

  expect(errors).toEqual([])
})

test('falls back to a bounded synchronous diff when the worker cannot start', async ({
  page
}) => {
  await page.addInitScript(() => {
    window.Worker = class {
      constructor() {
        throw new Error('worker unavailable')
      }
    }
  })

  const errors = collectPageErrors(page)
  await enterDiff(page)

  await page.evaluate(() => {
    const oldText =
      Array.from(
        { length: 5000 },
        (_, index) => `old ${index} ${'x'.repeat(40)}`
      ).join('\n') + '\n'
    const newText =
      Array.from(
        { length: 5000 },
        (_, index) => `new ${index} ${'y'.repeat(40)}`
      ).join('\n') + '\n'
    const setValue = (selector, value) => {
      const textarea = document.querySelector(selector)
      Object.getOwnPropertyDescriptor(
        HTMLTextAreaElement.prototype,
        'value'
      ).set.call(textarea, value)
      textarea.dispatchEvent(
        new InputEvent('input', {
          bubbles: true,
          inputType: 'insertFromPaste'
        })
      )
    }

    setValue('#diff-original', oldText)
    setValue('#diff-revised', newText)
  })

  await expect(page.locator('.error-notice')).toContainText(
    '文本差异过大，已停止精确比较',
    { timeout: 6000 }
  )
  await expect(page.locator('.diff-tool')).toHaveAttribute('aria-busy', 'false')

  expect(errors).toEqual([])
})
