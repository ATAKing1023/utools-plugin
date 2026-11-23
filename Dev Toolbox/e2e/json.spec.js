import {
  collectPageErrors,
  expect,
  openApp,
  test
} from './fixtures/utools.js'

test.use({ viewport: { width: 1200, height: 800 } })

const sample = {
  name: 'Dev Toolbox',
  nested: { enabled: true },
  items: ['alpha', { deep: null }],
  html: '<img src=x onerror="window.__jsonXss=1"><script>bad()</script>'
}

async function enterJson(page) {
  await openApp(page)
  await page.evaluate(() => {
    window.__utoolsTest.enter({
      code: 'json',
      type: 'text',
      payload: 'JSON 工具',
      from: 'main'
    })
  })
  await expect(page.locator('.app-shell')).toHaveAttribute('data-route', 'json')
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

test('defaults to a nested tree and switches modes by click and keyboard', async ({
  page
}) => {
  const errors = collectPageErrors(page)
  await enterJson(page)

  await expect(page.locator('[data-state="empty"]')).toBeVisible()
  await expect(page.getByRole('tab', { name: '可视化' })).toHaveAttribute(
    'aria-selected',
    'true'
  )

  await page.locator('#json-input').fill(JSON.stringify(sample, null, 2))

  const tree = page.locator('[data-testid="json-tree"]')
  await expect(tree).toBeVisible()
  const root = tree.getByRole('treeitem').first()
  await expect(root).toHaveAttribute('aria-expanded', 'true')
  await expect(root).toContainText('$')
  await expect(tree.locator('img')).toHaveCount(0)
  await expect(tree.locator('script')).toHaveCount(0)
  expect(await page.evaluate(() => window.__jsonXss)).toBeUndefined()

  await tree
    .getByRole('button', { name: '展开 nested' })
    .click()
  await expect(tree).toContainText('enabled')
  await expect(tree).toContainText('items')
  await tree.getByRole('button', { name: '展开 items' }).click()
  await expect(tree).toContainText('[0]')

  await page.getByRole('tab', { name: '格式化' }).click()
  await expect(page.locator('.json-tool')).toHaveAttribute('data-mode', 'format')
  const output = page.locator('.output-row__value')
  await expect(output).toBeVisible()
  const formatted = await output.textContent()
  expect(JSON.parse(formatted)).toEqual(sample)
  expect(formatted.split('\n')[1].startsWith('  ')).toBe(true)

  await page.evaluate(() => window.__utoolsTest.resetCalls())
  await page.getByRole('button', { name: '复制 格式化结果' }).click()
  await expect
    .poll(() =>
      page.evaluate(() => window.__utoolsTest.getCalls().copyText[0] || null)
    )
    .toBe(formatted)

  await page.getByRole('tab', { name: '格式化' }).focus()
  await page.keyboard.press('ArrowLeft')
  await expect(page.locator('.json-tool')).toHaveAttribute('data-mode', 'tree')
  await expect(page.getByRole('tab', { name: '可视化' })).toHaveAttribute(
    'aria-selected',
    'true'
  )

  expect(errors).toEqual([])
})

test('shows positioned invalid JSON errors and remains usable at 375px', async ({
  page
}) => {
  const errors = collectPageErrors(page)
  await enterJson(page)

  await page.locator('#json-input').fill('{ "name": 1, }')
  const errorNotice = page.locator('.error-notice')
  await expect(errorNotice).toBeVisible()
  await expect(errorNotice).toContainText(/位置：第 \d+ 行，第 \d+ 列/)
  await expect(page.locator('.empty-state')).toHaveCount(0)

  await page.setViewportSize({ width: 375, height: 700 })
  await expectNoPageOverflow(page)
  await expect(page.locator('#json-input')).toBeVisible()
  await expect(page.getByRole('tab', { name: '可视化' })).toBeVisible()
  await expect(page.getByRole('tab', { name: '格式化' })).toBeVisible()

  await page.locator('#json-input').fill('{"mobile":true}')
  await expect(page.locator('[data-testid="json-tree"]')).toBeVisible()
  await page.getByRole('tab', { name: '格式化' }).click()
  await expect(page.locator('.output-row__value')).toHaveText(
    '{\n  "mobile": true\n}'
  )

  expect(errors).toEqual([])
})
