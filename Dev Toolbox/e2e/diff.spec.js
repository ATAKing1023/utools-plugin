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

test('renders diff rows, counts and a copyable unified patch', async ({ page }) => {
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

  const patchValue = await page.locator('.output-row__value').textContent()
  expect(patchValue).toContain('-old-only')
  expect(patchValue).toContain('-old-change')
  expect(patchValue).toContain('+new-change')
  expect(patchValue).toContain('+new-only')
  expect(patchValue).toContain(' middle')

  await page.evaluate(() => window.__utoolsTest.resetCalls())
  await page.getByRole('button', { name: '复制 统一 DIFF' }).click()
  await expect
    .poll(() =>
      page.evaluate(() => window.__utoolsTest.getCalls().copyText[0] || null)
    )
    .toBe(patchValue)

  await page.evaluate(() => window.__utoolsTest.resetCalls())
  await page.locator('#diff-original').focus()
  await page.keyboard.press('Alt+1')
  await expect
    .poll(() =>
      page.evaluate(() => window.__utoolsTest.getCalls().copyText[0] || null)
    )
    .toBe(patchValue)

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
  await expect(page.getByRole('button', { name: '复制 统一 DIFF' })).toBeVisible()
  await page.locator('#diff-original').fill('mobile')
  await page.locator('#diff-revised').fill('mobile updated')
  await expect(page.locator('[data-row-kind="changed"]')).toHaveCount(1)

  expect(errors).toEqual([])
})

test('filters context rows without changing full counts, patch, or copies', async ({
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

  const patchValue = await page.locator('.output-row__value').textContent()

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

  const filteredPatchValue = await page
    .locator('.output-row__value')
    .textContent()
  expect(filteredPatchValue).toBe(patchValue)
  expect(filteredPatchValue).toContain(' middle')
  expect(filteredPatchValue).toContain(' tail')

  await page.keyboard.press('Space')
  await expect(toggle).not.toBeChecked()
  await expect(page.locator('.diff-row')).toHaveCount(6)
  await expect(page.locator('[data-row-kind="context"]')).toHaveCount(3)
  await expect(page.locator('.diff-filter-note')).toHaveCount(0)

  await page.keyboard.press('Space')
  await expect(toggle).toBeChecked()
  await expect(page.locator('.diff-row')).toHaveCount(3)

  await page.evaluate(() => window.__utoolsTest.resetCalls())
  await page.getByRole('button', { name: '复制 统一 DIFF' }).click()
  await expect
    .poll(() =>
      page.evaluate(() => window.__utoolsTest.getCalls().copyText[0] || null)
    )
    .toBe(patchValue)

  await page.evaluate(() => window.__utoolsTest.resetCalls())
  await page.locator('#diff-original').focus()
  await page.keyboard.press('Alt+1')
  await expect
    .poll(() =>
      page.evaluate(() => window.__utoolsTest.getCalls().copyText[0] || null)
    )
    .toBe(patchValue)

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
