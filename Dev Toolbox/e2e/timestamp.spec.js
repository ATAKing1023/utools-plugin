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

const ORACLE_LABELS = [
  'UTC+8 中国标准时间(本地时间)',
  'UTC+8 中国标准时间(本地时间),日期',
  'Unix 时间戳(秒)',
  'Unix 时间戳(毫秒)',
  '标准时间(UTC)',
  'Excel 序列日期'
]

const ORACLE_VALUES = [
  '2026-11-23 09:43:11',
  '2026-11-23',
  '1795398191',
  '1795398191926',
  '2026-11-23 01:43:11',
  '46349.404999144'
]

async function enterTimestamp(page, action = TIMESTAMP_ACTION) {
  await page.evaluate((nextAction) => {
    window.__utoolsTest.enter(nextAction)
  }, action)
  await expect(page.locator('[data-tool="timestamp"]')).toBeVisible()
}

async function pressAltDigit(page, digit) {
  await page.keyboard.down('Alt')
  await page.keyboard.press(`Digit${digit}`)
  await page.keyboard.up('Alt')
}

async function expectNoHorizontalOverflow(page) {
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth
    )
  ).toBe(true)
}

async function expectNoVerticalOverflow(page) {
  const metrics = await page.evaluate(() => ({
    scrollHeight: document.documentElement.scrollHeight,
    viewportHeight: window.innerHeight
  }))

  expect(metrics.scrollHeight).toBeLessThanOrEqual(metrics.viewportHeight)
}

test('renders the six-row oracle and copies Excel with Alt+6', async ({
  page
}) => {
  const errors = collectPageErrors(page)
  await openApp(page)
  await expect(page.locator('[data-state="empty"]')).toBeVisible()

  await enterTimestamp(page)
  const input = page.locator('#timestamp-input')
  const select = page.locator('#timestamp-input-type')

  await expect(input).toHaveValue('1795398191926')
  await expect(select).toHaveValue('auto')
  await expect(page.locator('#timestamp-parser-status')).toHaveText(
    '自动识别：Unix 毫秒'
  )
  await expect
    .poll(() =>
      select.locator('option').evaluateAll((options) =>
        options.map((option) => option.textContent)
      )
    )
    .toEqual([
      '自动识别',
      'Unix 秒',
      'Unix 毫秒',
      'Excel 序列日期',
      '日期时间文本'
    ])
  await expect(page.locator('.output-row')).toHaveCount(6)
  await expect
    .poll(() => page.locator('.output-row__label').allTextContents())
    .toEqual(ORACLE_LABELS)
  await expect
    .poll(() => page.locator('.output-row__value').allTextContents())
    .toEqual(ORACLE_VALUES)

  await input.fill('1795398191')
  await expect(page.locator('#timestamp-parser-status')).toHaveText(
    '自动识别：Unix 秒'
  )
  await expect(page.locator('.output-row__value').nth(3)).toHaveText(
    '1795398191000'
  )
  await expect(page.locator('.output-row__value').nth(5)).toHaveText(
    '46349.404988426'
  )

  await input.fill('1795398191926')
  await page.evaluate(() => window.__utoolsTest.resetCalls())
  await page
    .locator('.output-row')
    .filter({ hasText: 'Unix 时间戳(秒)' })
    .locator('.output-row__copy')
    .click()
  let calls = await page.evaluate(() => window.__utoolsTest.getCalls())
  expect(calls.copyText).toEqual(['1795398191'])
  expect(calls.hideMainWindow).toHaveLength(1)

  await page.evaluate(() => window.__utoolsTest.resetCalls())
  await pressAltDigit(page, 6)
  calls = await page.evaluate(() => window.__utoolsTest.getCalls())
  expect(calls.copyText).toEqual(['46349.404999144'])
  expect(calls.hideMainWindow).toHaveLength(1)

  await page.evaluate(() => window.__utoolsTest.resetCalls())
  await pressAltDigit(page, 1)
  calls = await page.evaluate(() => window.__utoolsTest.getCalls())
  expect(calls.copyText).toEqual(['2026-11-23 09:43:11'])

  await input.fill('   ')
  await expect(page.locator('[data-state="empty"]')).toBeVisible()
  await expect(page.locator('.output-row')).toHaveCount(0)

  await input.fill('not a date')
  await expect(page.locator('#timestamp-parser-status')).toHaveText(
    '无法自动识别，请手动选择类型'
  )
  await expect(page.getByRole('alert')).toContainText(
    '无法自动识别，请手动选择类型'
  )
  await expect(page.locator('.output-row')).toHaveCount(0)

  await input.fill('1795398191926')
  await expect(page.locator('.output-row')).toHaveCount(6)
  expect(errors).toEqual([])
})

test('auto-detects Excel and text, then manual selection overrides auto', async ({
  page
}) => {
  const errors = collectPageErrors(page)
  await openApp(page)
  await enterTimestamp(page)

  const input = page.locator('#timestamp-input')
  const select = page.locator('#timestamp-input-type')
  const status = page.locator('#timestamp-parser-status')
  const values = page.locator('.output-row__value')

  await input.fill('45000')
  await expect(status).toHaveText(
    '自动识别：Excel 序列日期 · 也可解释为 Unix 秒'
  )
  await expect(page.locator('.output-row')).toHaveCount(6)
  await expect(values.nth(0)).toHaveText('2023-03-15 00:00:00')
  await expect(values.nth(3)).toHaveText('1678809600000')
  await expect(values.nth(5)).toHaveText('45000')

  await input.fill('45000.5')
  await expect(status).toHaveText(
    '自动识别：Excel 序列日期 · 也可解释为 Unix 秒'
  )
  await expect(values.nth(0)).toHaveText('2023-03-15 12:00:00')
  await expect(values.nth(3)).toHaveText('1678852800000')
  await expect(values.nth(5)).toHaveText('45000.5')

  await input.fill('2026-11-23T09:43:11.926+08:00')
  await expect(status).toHaveText('自动识别：日期时间文本')
  await expect(values.nth(3)).toHaveText('1795398191926')
  await expect(values.nth(5)).toHaveText('46349.404999144')

  await input.fill('Mon, 23 Nov 2026 01:43:11 GMT')
  await expect(status).toHaveText('自动识别：日期时间文本')
  await expect(values.nth(0)).toHaveText('2026-11-23 09:43:11')
  await expect(values.nth(4)).toHaveText('2026-11-23 01:43:11')

  await input.fill('45000')
  await select.selectOption('unix-seconds')
  await expect(status).toHaveText(
    '手动解析：Unix 秒 · 自动检测：Excel 序列日期'
  )
  await expect(values.nth(0)).toHaveText('1970-01-01 20:30:00')
  await expect(values.nth(3)).toHaveText('45000000')
  await expect(values.nth(5)).not.toHaveText('45000')

  await input.fill('45001')
  await expect(select).toHaveValue('unix-seconds')
  await expect(status).toContainText('手动解析：Unix 秒')
  await expect(values.nth(3)).toHaveText('45001000')

  await select.selectOption('excel')
  await input.fill('45000.5')
  await expect(status).toHaveText(
    '手动解析：Excel 序列日期 · 自动检测：Excel 序列日期'
  )
  await expect(values.nth(0)).toHaveText('2023-03-15 12:00:00')
  await expect(values.nth(5)).toHaveText('45000.5')

  await select.selectOption('datetime-text')
  await input.fill('45000')
  await expect(status).toContainText('手动解析：日期时间文本')
  await expect(page.getByRole('alert')).toContainText(
    '日期时间文本解析失败'
  )
  await expect(page.locator('.output-row')).toHaveCount(0)

  expect(errors).toEqual([])
})

test('Excel errors are distinct and local-wall-clock values round-trip', async ({
  page
}) => {
  const errors = collectPageErrors(page)
  await openApp(page)
  await enterTimestamp(page)

  const input = page.locator('#timestamp-input')
  const select = page.locator('#timestamp-input-type')
  const status = page.locator('#timestamp-parser-status')
  const values = page.locator('.output-row__value')

  await select.selectOption('excel')
  await input.fill('45000.5')
  await expect(status).toHaveText(
    '手动解析：Excel 序列日期 · 自动检测：Excel 序列日期'
  )
  await expect(values.nth(0)).toHaveText('2023-03-15 12:00:00')
  await expect(values.nth(3)).toHaveText('1678852800000')
  await expect(values.nth(5)).toHaveText('45000.5')

  await input.fill('60')
  await expect(page.getByRole('alert')).toContainText('虚构日期')
  await expect(page.getByRole('alert')).toContainText('序列 60')
  await expect(page.locator('.output-row')).toHaveCount(0)

  await input.fill('-1')
  await expect(page.getByRole('alert')).toContainText(
    '不支持负数序列'
  )
  await expect(page.locator('.output-row')).toHaveCount(0)

  await input.fill('2958466')
  await expect(page.getByRole('alert')).toContainText(
    '超出 1900 日期系统范围'
  )
  await expect(page.locator('.output-row')).toHaveCount(0)

  await input.fill('0')
  await expect(values.nth(0)).toHaveText('1899-12-31 00:00:00')
  await expect(values.nth(5)).toHaveText('0')

  await input.fill('45000.5')
  const milliseconds = await values.nth(3).textContent()
  expect(milliseconds).toBe('1678852800000')

  await select.selectOption('unix-milliseconds')
  await input.fill(milliseconds)
  await expect(status).toHaveText(
    '手动解析：Unix 毫秒 · 自动检测：Unix 毫秒'
  )
  await expect(values.nth(0)).toHaveText('2023-03-15 12:00:00')
  await expect(values.nth(3)).toHaveText(milliseconds)
  await expect(values.nth(5)).toHaveText('45000.5')

  expect(errors).toEqual([])
})

test('keeps the timestamp layout compact without timezone controls', async ({
  page
}) => {
  const errors = collectPageErrors(page)
  await openApp(page)
  await enterTimestamp(page)

  await expect(page.locator('.timezone-trigger')).toHaveCount(0)
  await expect(page.locator('#timezone-panel')).toHaveCount(0)
  await expect(page.locator('.output-row')).toHaveCount(6)

  for (const height of [800, 700, 600]) {
    await page.setViewportSize({ width: 1200, height })
    await page.evaluate(() => window.scrollTo(0, 0))
    await expectNoHorizontalOverflow(page)
    await expectNoVerticalOverflow(page)
  }

  for (const width of [1200, 900, 700]) {
    await page.setViewportSize({ width, height: 700 })
    await expectNoHorizontalOverflow(page)
    const parserBox = await page.locator('.timestamp-parser').boundingBox()
    expect(parserBox.height).toBeLessThan(48)
  }

  await page.locator('#timestamp-input-type').selectOption('excel')
  await page.locator('#timestamp-input').fill('45000.5')
  await expect(page.locator('#timestamp-input-type')).toHaveValue('excel')

  await page.evaluate(() => window.__utoolsTest.out(false))
  await expect(page.locator('.app-shell')).toHaveAttribute('data-route', 'empty')
  await enterTimestamp(page)
  await expect(page.locator('#timestamp-input-type')).toHaveValue('auto')
  await expect(page.locator('#timestamp-parser-status')).toHaveText(
    '自动识别：Unix 毫秒'
  )
  await expect(page.locator('.output-row')).toHaveCount(6)

  for (const width of [375, 320]) {
    await page.setViewportSize({ width, height: 700 })
    await expectNoHorizontalOverflow(page)
    await expect(page.locator('#timestamp-input')).toBeVisible()
    await expect(page.locator('#timestamp-input-type')).toBeVisible()
    await expect(page.locator('.output-row')).toHaveCount(6)

    const valueBoxes = await page
      .locator('.output-row__value')
      .evaluateAll((elements) =>
        elements.map((element) => {
          const box = element.getBoundingClientRect()
          return { width: box.width, height: box.height }
        })
      )
    expect(valueBoxes).toHaveLength(6)
    for (const box of valueBoxes) {
      expect(box.width).toBeGreaterThanOrEqual(160)
      expect(box.height).toBeGreaterThan(0)
    }

    const controlBoxes = await page
      .locator('.output-row__copy')
      .evaluateAll((elements) =>
        elements.map((element) => {
          const box = element.getBoundingClientRect()
          return { width: box.width, height: box.height }
        })
      )
    for (const box of controlBoxes) {
      expect(box.width).toBeGreaterThanOrEqual(48)
      expect(box.height).toBeGreaterThan(0)
    }
  }

  await page.setViewportSize({ width: 1200, height: 800 })
  await expectNoHorizontalOverflow(page)
  await expect(page.locator('#timestamp-input-type')).toBeVisible()
  await expect(page.locator('.timestamp-status')).toBeVisible()

  expect(errors).toEqual([])
})
