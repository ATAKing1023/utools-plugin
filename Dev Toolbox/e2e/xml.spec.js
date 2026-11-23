import {
  collectPageErrors,
  expect,
  openApp,
  test
} from './fixtures/utools.js'

test.use({ viewport: { width: 1200, height: 800 } })

const sample = [
  '<?xml version="1.0"?>',
  '<root id="1">',
  '  <item kind="a">Alpha</item>',
  '  <!-- note -->',
  '  <![CDATA[raw <value>]]>',
  '  <empty/>',
  '</root>'
].join('\n')

const formattedSample = [
  '<?xml version="1.0"?>',
  '<root id="1">',
  '  <item kind="a">Alpha</item>',
  '  <!-- note -->',
  '  <![CDATA[raw <value>]]>',
  '  <empty/>',
  '</root>'
].join('\n')

async function enterXml(page) {
  await openApp(page)
  await page.evaluate(() => {
    window.__utoolsTest.enter({
      code: 'xml',
      type: 'text',
      payload: 'XML 工具',
      from: 'main'
    })
  })
  await expect(page.locator('.app-shell')).toHaveAttribute('data-route', 'xml')
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

test('shows an open XML tree with attributes, comments and CDATA', async ({
  page
}) => {
  const errors = collectPageErrors(page)
  await enterXml(page)

  await expect(page.locator('[data-state="empty"]')).toBeVisible()
  await expect(page.getByRole('tab', { name: '可视化' })).toHaveAttribute(
    'aria-selected',
    'true'
  )

  await page.locator('#xml-input').fill(sample)

  const tree = page.locator('[data-testid="xml-tree"]')
  await expect(tree).toBeVisible()
  const root = tree.getByRole('treeitem').first()
  await expect(root).toHaveAttribute('aria-expanded', 'true')
  await expect(root).toContainText('root')
  await expect(tree.locator('[data-kind="attribute"]')).toContainText('@id')
  await expect(tree.locator('[data-kind="comment"]')).toContainText('note')
  await expect(tree.locator('[data-kind="cdata"]')).toContainText('raw <value>')
  await expect(tree).toContainText('empty')

  await tree.getByRole('button', { name: '展开 item' }).click()
  await expect(tree).toContainText('Alpha')
  await expect(tree).toContainText('@kind')

  await page.getByRole('tab', { name: '格式化' }).click()
  const output = page.locator('.output-row__value')
  await expect(output).toHaveText(formattedSample)

  await page.evaluate(() => window.__utoolsTest.resetCalls())
  await page.getByRole('button', { name: '复制 格式化结果' }).click()
  await expect
    .poll(() =>
      page.evaluate(() => window.__utoolsTest.getCalls().copyText[0] || null)
    )
    .toBe(formattedSample)

  expect(errors).toEqual([])
})

test('shows XML line and column errors and remains usable at 375px', async ({
  page
}) => {
  const errors = collectPageErrors(page)
  await enterXml(page)

  await page.locator('#xml-input').fill('<root>\n  <item></root>')
  const errorNotice = page.locator('.error-notice')
  await expect(errorNotice).toBeVisible()
  await expect(errorNotice).toContainText(/位置：第 2 行，第 \d+ 列/)
  await expect(page.locator('.empty-state')).toHaveCount(0)

  await page.setViewportSize({ width: 375, height: 700 })
  await expectNoPageOverflow(page)
  await expect(page.locator('#xml-input')).toBeVisible()
  await expect(page.getByRole('tab', { name: '可视化' })).toBeVisible()
  await expect(page.getByRole('tab', { name: '格式化' })).toBeVisible()

  await page.locator('#xml-input').fill('<root><mobile>yes</mobile></root>')
  await expect(page.locator('[data-testid="xml-tree"]')).toBeVisible()
  await page.getByRole('tab', { name: '格式化' }).click()
  await expect(page.locator('.output-row__value')).toHaveText(
    '<root>\n  <mobile>yes</mobile>\n</root>'
  )

  expect(errors).toEqual([])
})
