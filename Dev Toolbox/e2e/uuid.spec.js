import {
  collectPageErrors,
  expect,
  openApp,
  test
} from './fixtures/utools.js'

const UUID_V4_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
const UUID_ACTION = {
  code: 'uuid',
  type: 'text',
  payload: 'UUID 生成',
  from: 'main'
}

async function enterUuid(page) {
  await page.evaluate((action) => {
    window.__utoolsTest.enter(action)
  }, UUID_ACTION)
  await expect(page.locator('[data-tool="uuid"]')).toBeVisible()
}

async function pressAltOne(page) {
  await page.keyboard.down('Alt')
  await page.keyboard.press('Digit1')
  await page.keyboard.up('Alt')
}

test('generates four UUID rows, copies, regenerates, and resizes cleanly', async ({
  page
}) => {
  const errors = collectPageErrors(page)
  await openApp(page)
  await expect(page.locator('[data-state="empty"]')).toBeVisible()

  await enterUuid(page)
  await expect(page.locator('.output-row')).toHaveCount(4)
  await expect
    .poll(() => page.locator('.output-row__label').allTextContents())
    .toEqual(['小写', '大写', '去掉[-]小写', '去掉[-]大写'])

  const firstValues = await page.locator('.output-row__value').allTextContents()
  const lower = firstValues[0]
  expect(lower).toMatch(UUID_V4_PATTERN)
  expect(firstValues).toEqual([
    lower,
    lower.toUpperCase(),
    lower.replace(/-/g, ''),
    lower.replace(/-/g, '').toUpperCase()
  ])

  await page.evaluate(() => window.__utoolsTest.resetCalls())
  await page.locator('.output-row__copy').first().click()
  let calls = await page.evaluate(() => window.__utoolsTest.getCalls())
  expect(calls.copyText).toEqual([lower])
  expect(calls.hideMainWindow).toHaveLength(1)

  await page.evaluate(() => window.__utoolsTest.resetCalls())
  await pressAltOne(page)
  calls = await page.evaluate(() => window.__utoolsTest.getCalls())
  expect(calls.copyText).toEqual([lower])
  expect(calls.hideMainWindow).toHaveLength(1)

  const regenerate = page.getByRole('button', { name: '重新生成' })
  await regenerate.click()
  await expect(page.locator('.output-row__value').first()).not.toHaveText(lower)
  const regenerated = await page.locator('.output-row__value').first().textContent()
  expect(regenerated).toMatch(UUID_V4_PATTERN)

  await page.setViewportSize({ width: 375, height: 700 })
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth
    )
  ).toBe(true)
  await expect(regenerate).toBeVisible()
  await expect(page.locator('.output-row')).toHaveCount(4)

  await regenerate.click()
  await expect(page.locator('.output-row__value').first()).not.toHaveText(
    regenerated
  )

  await page.setViewportSize({ width: 320, height: 600 })
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth
    )
  ).toBe(true)
  await expect(regenerate).toBeVisible()
  expect(errors).toEqual([])
})
