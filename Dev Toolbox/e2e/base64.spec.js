import {
  collectPageErrors,
  expect,
  openApp,
  test
} from './fixtures/utools.js'

const BASE64_ACTION = {
  code: 'base64',
  type: 'text',
  payload: 'Base64 编解码',
  from: 'main'
}
const UNICODE_TEXT = '你好, 🌍\nline 2'
const UNICODE_BASE64 = '5L2g5aW9LCDwn4yNCmxpbmUgMg=='

async function enterBase64(page) {
  await page.evaluate((action) => {
    window.__utoolsTest.enter(action)
  }, BASE64_ACTION)
  await expect(page.locator('[data-tool="base64"]')).toBeVisible()
}

async function pressAltOne(page) {
  await page.keyboard.down('Alt')
  await page.keyboard.press('Digit1')
  await page.keyboard.up('Alt')
}

test('round-trips Unicode, validates decode input, copies, and resizes', async ({
  page
}) => {
  const errors = collectPageErrors(page)
  await openApp(page)
  await expect(page.locator('[data-state="empty"]')).toBeVisible()
  await enterBase64(page)

  const textarea = page.locator('#base64-input')
  await expect(page.locator('[data-state="empty"]')).toBeVisible()
  await expect(page.locator('.output-row')).toHaveCount(0)

  await textarea.fill(UNICODE_TEXT)
  await expect(page.locator('.output-row__label')).toHaveText('编码结果')
  await expect(page.locator('.output-row__value')).toHaveText(UNICODE_BASE64)

  await page.evaluate(() => window.__utoolsTest.resetCalls())
  await page.locator('.output-row__copy').click()
  let calls = await page.evaluate(() => window.__utoolsTest.getCalls())
  expect(calls.copyText).toEqual([UNICODE_BASE64])
  expect(calls.hideMainWindow).toHaveLength(1)

  await page.evaluate(() => window.__utoolsTest.resetCalls())
  await pressAltOne(page)
  calls = await page.evaluate(() => window.__utoolsTest.getCalls())
  expect(calls.copyText).toEqual([UNICODE_BASE64])
  expect(calls.hideMainWindow).toHaveLength(1)

  await page.getByRole('tab', { name: '解码' }).click()
  await textarea.fill(UNICODE_BASE64)
  await expect(page.locator('.output-row__label')).toHaveText('解码结果')
  expect(await page.locator('.output-row__value').textContent()).toBe(
    UNICODE_TEXT
  )

  await textarea.fill('@@@')
  await expect(page.getByRole('alert')).toContainText('Base64 格式无效')
  await expect(page.locator('.output-row')).toHaveCount(0)

  await textarea.fill('/w==')
  await expect(page.getByRole('alert')).toContainText('不是有效的 UTF-8')
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
  await textarea.fill('hello')
  await expect(page.locator('.output-row__value')).toHaveText('aGVsbG8=')
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
