import {
  collectPageErrors,
  expect,
  openApp,
  test
} from './fixtures/utools.js'

const URL_ACTION = {
  code: 'url',
  type: 'text',
  payload: 'URL 编解码',
  from: 'main'
}

async function enterUrl(page) {
  await page.evaluate((action) => {
    window.__utoolsTest.enter(action)
  }, URL_ACTION)
  await expect(page.locator('[data-tool="url"]')).toBeVisible()
}

async function pressAltOne(page) {
  await page.keyboard.down('Alt')
  await page.keyboard.press('Digit1')
  await page.keyboard.up('Alt')
}

test('encodes, decodes literal pluses, rejects bad percents, copies, and resizes', async ({
  page
}) => {
  const errors = collectPageErrors(page)
  await openApp(page)
  await expect(page.locator('[data-state="empty"]')).toBeVisible()
  await enterUrl(page)

  const textarea = page.locator('#url-input')
  await expect(page.getByRole('tab', { name: '编码' })).toHaveAttribute(
    'aria-selected',
    'true'
  )
  await expect(page.locator('[data-state="empty"]')).toBeVisible()

  await textarea.fill('a b+中文/?=&')
  const encoded = 'a%20b%2B%E4%B8%AD%E6%96%87%2F%3F%3D%26'
  await expect(page.locator('.output-row__label')).toHaveText('编码结果')
  await expect(page.locator('.output-row__value')).toHaveText(encoded)

  await page.evaluate(() => window.__utoolsTest.resetCalls())
  await page.locator('.output-row__copy').click()
  let calls = await page.evaluate(() => window.__utoolsTest.getCalls())
  expect(calls.copyText).toEqual([encoded])
  expect(calls.hideMainWindow).toHaveLength(1)

  await page.evaluate(() => window.__utoolsTest.resetCalls())
  await pressAltOne(page)
  calls = await page.evaluate(() => window.__utoolsTest.getCalls())
  expect(calls.copyText).toEqual([encoded])
  expect(calls.hideMainWindow).toHaveLength(1)

  await page.getByRole('tab', { name: '解码' }).click()
  await textarea.fill('a+b%20c%E4%B8%AD')
  await expect(page.locator('.output-row__label')).toHaveText('解码结果')
  await expect(page.locator('.output-row__value')).toHaveText('a+b c中')

  await textarea.fill('%ZZ')
  await expect(page.getByRole('alert')).toContainText('无效的百分号编码')
  await expect(page.locator('.output-row')).toHaveCount(0)

  await textarea.fill('')
  await expect(page.locator('[data-state="empty"]')).toBeVisible()

  await page.setViewportSize({ width: 375, height: 700 })
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth
    )
  ).toBe(true)
  await expect(textarea).toBeVisible()
  await expect(page.getByRole('tab', { name: '编码' })).toBeVisible()
  await page.getByRole('tab', { name: '编码' }).click()
  await textarea.fill('hello world')
  await expect(page.locator('.output-row__value')).toHaveText('hello%20world')
  await expect(page.locator('.output-row__copy')).toBeEnabled()

  await page.setViewportSize({ width: 320, height: 600 })
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth
    )
  ).toBe(true)
  await expect(textarea).toBeVisible()
  await expect(page.locator('.output-row__copy')).toBeEnabled()
  expect(errors).toEqual([])
})
