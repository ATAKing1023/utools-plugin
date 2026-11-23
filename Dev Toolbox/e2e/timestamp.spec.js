import {
  collectPageErrors,
  expect,
  openApp,
  test
} from './fixtures/utools.js'

test.use({ timezoneId: 'Asia/Shanghai' })

const TIMESTAMP_ACTION = {
  code: 'timestamp',
  type: 'regex',
  payload: '1795398191926',
  from: 'main'
}

async function enterTimestamp(page, action = TIMESTAMP_ACTION) {
  await page.evaluate((nextAction) => {
    window.__utoolsTest.enter(nextAction)
  }, action)
  await expect(page.locator('[data-tool="timestamp"]')).toBeVisible()
}

async function pressAltOne(page) {
  await page.keyboard.down('Alt')
  await page.keyboard.press('Digit1')
  await page.keyboard.up('Alt')
}

async function expectNoHorizontalOverflow(page) {
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth
    )
  ).toBe(true)
}

test('renders the verified timestamp oracle and copies full values', async ({
  page
}) => {
  const errors = collectPageErrors(page)
  await openApp(page)
  await expect(page.locator('[data-state="empty"]')).toBeVisible()

  await enterTimestamp(page)
  const input = page.locator('#timestamp-input')
  await expect(input).toHaveValue('1795398191926')
  await expect(page.locator('.output-row')).toHaveCount(5)

  await expect
    .poll(() => page.locator('.output-row__label').allTextContents())
    .toEqual([
      'UTC+8 中国标准时间(本地时间)',
      'UTC+8 中国标准时间(本地时间),日期',
      '时间戳(秒)',
      '时间戳(毫秒)',
      '标准时间(UTC)'
    ])
  await expect
    .poll(() => page.locator('.output-row__value').allTextContents())
    .toEqual([
      '2026-11-23 09:43:11',
      '2026-11-23',
      '1795398191',
      '1795398191926',
      '2026-11-23 01:43:11'
    ])

  await input.fill('1795398191')
  await expect(page.locator('.output-row__value').nth(3)).toHaveText(
    '1795398191000'
  )
  await input.fill('1795398191926')

  await page.evaluate(() => window.__utoolsTest.resetCalls())
  await page
    .locator('.output-row')
    .filter({ hasText: '时间戳(秒)' })
    .locator('.output-row__copy')
    .click()
  let calls = await page.evaluate(() => window.__utoolsTest.getCalls())
  expect(calls.copyText).toEqual(['1795398191'])
  expect(calls.hideMainWindow).toHaveLength(1)

  await page.evaluate(() => window.__utoolsTest.resetCalls())
  await pressAltOne(page)
  calls = await page.evaluate(() => window.__utoolsTest.getCalls())
  expect(calls.copyText).toEqual(['2026-11-23 09:43:11'])
  expect(calls.hideMainWindow).toHaveLength(1)

  await input.fill('   ')
  await expect(page.locator('[data-state="empty"]')).toBeVisible()
  await expect(page.locator('.output-row')).toHaveCount(0)

  await input.fill('not a date')
  await expect(page.getByRole('alert')).toContainText('无法解析日期或时间戳')
  await expect(page.locator('.output-row')).toHaveCount(0)

  await input.fill('1795398191926')
  await expect(page.locator('.output-row')).toHaveCount(5)
  expect(errors).toEqual([])
})

test('persists an extra timezone through out/enter and stays usable at 375px', async ({
  page
}) => {
  const errors = collectPageErrors(page)
  await openApp(page)
  await enterTimestamp(page)

  await page.getByRole('button', { name: /其他时区/ }).click()
  const extraTimezone = page.locator('[data-offset-key="+1"]')
  await extraTimezone.check()
  await expect(page.locator('.output-row')).toHaveCount(6)
  await expect(
    page.locator('.output-row').filter({ hasText: 'UTC+1 欧洲中部时区' })
  ).toContainText('2026-11-23 02:43:11')

  const dbCalls = await page.evaluate(() => window.__utoolsTest.getCalls())
  expect(dbCalls.dbSet).toContainEqual([
    'dev-toolbox.timestamp.timezones',
    ['+1']
  ])

  await page.evaluate(() => window.__utoolsTest.out(false))
  await expect(page.locator('.app-shell')).toHaveAttribute('data-route', 'empty')
  await enterTimestamp(page)
  await expect(page.locator('.output-row')).toHaveCount(6)
  await page.getByRole('button', { name: /其他时区/ }).click()
  await expect(page.locator('[data-offset-key="+1"]')).toBeChecked()

  await page.setViewportSize({ width: 375, height: 700 })
  await expectNoHorizontalOverflow(page)
  await expect(page.locator('#timestamp-input')).toBeVisible()
  await expect(page.locator('.timezone-trigger')).toBeVisible()
  await expect
    .poll(() =>
      page
        .locator('.timezone-panel__list')
        .evaluate((element) => element.scrollHeight > element.clientHeight)
    )
    .toBe(true)

  await page.getByRole('button', { name: '关闭其他时区面板' }).click()
  await page.locator('#timestamp-input').fill('1795398191926')
  await expect(page.locator('.output-row')).toHaveCount(6)
  await expect(page.locator('.timezone-trigger')).toBeEnabled()

  await page.setViewportSize({ width: 320, height: 600 })
  await expectNoHorizontalOverflow(page)
  await expect(page.locator('#timestamp-input')).toBeVisible()
  await expect(page.locator('.output-row')).toHaveCount(6)
  await expect(page.locator('.timezone-trigger')).toBeVisible()
  expect(errors).toEqual([])
})
