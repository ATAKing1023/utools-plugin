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
  '时间戳(秒)',
  '时间戳(毫秒)',
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

async function expectNoBoxOverlap(page, firstSelector, secondSelector) {
  const overlap = await page.evaluate(
    ([first, second]) => {
      const firstBox = document.querySelector(first).getBoundingClientRect()
      const secondBox =
        document.querySelector(second).getBoundingClientRect()

      return !(
        firstBox.right <= secondBox.left ||
        firstBox.left >= secondBox.right ||
        firstBox.bottom <= secondBox.top ||
        firstBox.top >= secondBox.bottom
      )
    },
    [firstSelector, secondSelector]
  )
  expect(overlap).toBe(false)
}

async function measureOpenPanelGeometry(page) {
  return page.evaluate(() => {
    const panel = document.querySelector('#timezone-panel')
    const panelRect = panel.getBoundingClientRect()
    const controls = [...document.querySelectorAll('.output-row__copy')]
    const handles = controls.map((control, index) => {
      const rect = control.getBoundingClientRect()
      const centerX = rect.left + rect.width / 2
      const centerY = rect.top + rect.height / 2
      const inViewport =
        centerX >= 0 &&
        centerX <= window.innerWidth &&
        centerY >= 0 &&
        centerY <= window.innerHeight
      const hit = inViewport
        ? document.elementFromPoint(centerX, centerY)
        : null
      const overlap = !(
        rect.right <= panelRect.left ||
        rect.left >= panelRect.right ||
        rect.bottom <= panelRect.top ||
        rect.top >= panelRect.bottom
      )
      const gap = Math.max(
        panelRect.left - rect.right,
        rect.left - panelRect.right,
        panelRect.top - rect.bottom,
        rect.top - panelRect.bottom
      )

      return {
        index: index + 1,
        inViewport,
        covered: inViewport
          ? !(hit === control || control.contains(hit))
          : false,
        overlap,
        gap,
        rect: {
          left: rect.left,
          top: rect.top,
          right: rect.right,
          bottom: rect.bottom
        },
        hit: hit
          ? {
              tagName: hit.tagName,
              className: hit.className,
              ariaLabel: hit.getAttribute?.('aria-label')
            }
          : null
      }
    })

    return {
      viewport: {
        width: window.innerWidth,
        height: window.innerHeight
      },
      panel: {
        left: panelRect.left,
        top: panelRect.top,
        right: panelRect.right,
        bottom: panelRect.bottom
      },
      handleCount: handles.length,
      visibleHandleCount: handles.filter((handle) => handle.inViewport).length,
      coveredCount: handles.filter((handle) => handle.covered).length,
      overlapCount: handles.filter((handle) => handle.overlap).length,
      minGap: Math.min(...handles.map((handle) => handle.gap)),
      handles
    }
  })
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
    .filter({ hasText: '时间戳(秒)' })
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

test('open timezone panel leaves every copy handle clear at 1200, 375, and 320', async ({
  page
}) => {
  const errors = collectPageErrors(page)
  await openApp(page)
  await enterTimestamp(page)

  const trigger = page.locator('.timezone-trigger')
  const panel = page.locator('#timezone-panel')
  const closePanel = page.getByRole('button', {
    name: '关闭其他时区面板'
  })
  const excelCopy = page
    .locator('.output-row')
    .filter({ hasText: 'Excel 序列日期' })
    .locator('.output-row__copy')

  for (const width of [1200, 375, 320]) {
    await page.setViewportSize({ width, height: 800 })
    await page.evaluate(() => window.scrollTo(0, 0))
    if ((await trigger.getAttribute('aria-expanded')) === 'true') {
      await closePanel.click()
    }
    await trigger.click()
    await expect(panel).toBeVisible()

    await trigger.focus()
    await page.keyboard.press('Tab')
    await expect(closePanel).toBeFocused()
    await page.keyboard.press('Tab')
    await expect(page.locator('[data-offset-key="-11"]')).toBeFocused()

    const overflow = await page.evaluate(() => ({
      document:
        document.documentElement.scrollWidth <= window.innerWidth,
      body: document.body.scrollWidth <= window.innerWidth
    }))
    expect(overflow).toEqual({ document: true, body: true })

    const geometry = await measureOpenPanelGeometry(page)
    expect(geometry.handleCount).toBe(6)
    expect(geometry.visibleHandleCount).toBeGreaterThan(0)
    expect(geometry.overlapCount).toBe(0)
    expect(geometry.coveredCount).toBe(0)
    expect(geometry.minGap).toBeGreaterThan(1)
    expect(geometry.minGap).toBeGreaterThanOrEqual(8)

    await test.info().attach(`panel-copy-geometry-${width}x800`, {
      contentType: 'application/json',
      body: Buffer.from(JSON.stringify(geometry, null, 2))
    })

    if (width === 1200) {
      expect(geometry.visibleHandleCount).toBe(6)
      await page.evaluate(() => window.__utoolsTest.resetCalls())
      await excelCopy.click()
      const calls = await page.evaluate(() => window.__utoolsTest.getCalls())
      expect(calls.copyText).toEqual(['46349.404999144'])
      expect(calls.hideMainWindow).toHaveLength(1)
      await expect(panel).toBeVisible()
    }
  }

  expect(errors).toEqual([])
})

test('extra timezone stays row 6, parser resets to Auto, and layouts do not overflow', async ({
  page
}) => {
  const errors = collectPageErrors(page)
  await openApp(page)
  await enterTimestamp(page)

  await page.getByRole('button', { name: /其他时区/ }).click()
  const extraTimezone = page.locator('[data-offset-key="+1"]')
  await extraTimezone.check()

  const labels = page.locator('.output-row__label')
  const copyControls = page.locator('.output-row__copy')
  await expect(page.locator('.output-row')).toHaveCount(7)
  await expect(labels.nth(5)).toHaveText('UTC+1 欧洲中部时区')
  await expect(labels.nth(6)).toHaveText('Excel 序列日期')
  await expect(
    page.locator('.output-row').filter({ hasText: 'UTC+1 欧洲中部时区' })
  ).toContainText('2026-11-23 02:43:11')

  const dbCalls = await page.evaluate(() => window.__utoolsTest.getCalls())
  expect(dbCalls.dbSet).toContainEqual([
    'dev-toolbox.timestamp.timezones',
    ['+1']
  ])

  await page
    .locator('#timestamp-input-type')
    .selectOption('excel')
  await page.locator('#timestamp-input').fill('45000.5')
  await expect(page.locator('#timestamp-input-type')).toHaveValue('excel')

  await page.evaluate(() => window.__utoolsTest.out(false))
  await expect(page.locator('.app-shell')).toHaveAttribute('data-route', 'empty')
  await enterTimestamp(page)
  await expect(page.locator('#timestamp-input-type')).toHaveValue('auto')
  await expect(page.locator('#timestamp-parser-status')).toHaveText(
    '自动识别：Unix 毫秒'
  )
  await expect(page.locator('.output-row')).toHaveCount(7)
  await expect(labels.nth(5)).toHaveText('UTC+1 欧洲中部时区')
  await expect(labels.nth(6)).toHaveText('Excel 序列日期')
  await page.getByRole('button', { name: /其他时区/ }).click()
  await expect(page.locator('[data-offset-key="+1"]')).toBeChecked()

  await page.setViewportSize({ width: 375, height: 700 })
  await expectNoHorizontalOverflow(page)
  await expect(page.locator('#timestamp-input')).toBeVisible()
  await expect(page.locator('#timestamp-input-type')).toBeVisible()
  await expect(page.locator('#timestamp-parser-status')).toBeVisible()
  await expect(page.locator('.timezone-trigger')).toBeVisible()
  await expectNoBoxOverlap(
    page,
    '.timestamp-parser',
    '.timezone-panel'
  )
  await expect
    .poll(() =>
      page
        .locator('.timezone-panel__list')
        .evaluate((element) => element.scrollHeight > element.clientHeight)
    )
    .toBe(true)

  await page.getByRole('button', { name: '关闭其他时区面板' }).click()
  await page.locator('#timestamp-input').fill('1795398191926')
  await expect(page.locator('.output-row')).toHaveCount(7)
  await expect(page.locator('.timezone-trigger')).toBeEnabled()

  await page.setViewportSize({ width: 320, height: 600 })
  await expectNoHorizontalOverflow(page)
  await expect(page.locator('#timestamp-input')).toBeVisible()
  await expect(page.locator('#timestamp-input-type')).toBeVisible()
  await expect(page.locator('.output-row')).toHaveCount(7)
  await expect(labels).toHaveCount(7)
  await expect(copyControls).toHaveCount(7)

  const valueBoxes = await page.locator('.output-row__value').evaluateAll(
    (elements) =>
      elements.map((element) => {
        const box = element.getBoundingClientRect()
        return {
          text: element.textContent,
          width: box.width,
          height: box.height
        }
      })
  )
  expect(valueBoxes).toHaveLength(7)
  for (const box of valueBoxes) {
    expect(box.width).toBeGreaterThanOrEqual(160)
    expect(box.height).toBeGreaterThan(0)
  }

  const controlBoxes = await copyControls.evaluateAll((elements) =>
    elements.map((element) => {
      const box = element.getBoundingClientRect()
      return { width: box.width, height: box.height }
    })
  )
  for (let index = 0; index < 7; index += 1) {
    await expect(labels.nth(index)).toBeVisible()
    await expect(copyControls.nth(index)).toBeVisible()
    await expect(copyControls.nth(index)).toBeEnabled()
    expect(controlBoxes[index].width).toBeGreaterThanOrEqual(48)
    expect(controlBoxes[index].height).toBeGreaterThan(0)
  }

  await expectNoBoxOverlap(
    page,
    '.timestamp-parser',
    '.timezone-trigger'
  )
  await page.getByRole('button', { name: /其他时区/ }).click()
  await expectNoBoxOverlap(
    page,
    '.timestamp-parser',
    '.timezone-panel'
  )
  await page.evaluate(() =>
    window.scrollTo(0, document.documentElement.scrollHeight)
  )
  await expectNoBoxOverlap(
    page,
    '.output-row:last-child .output-row__copy',
    '.timezone-panel'
  )
  await page.getByRole('button', { name: '关闭其他时区面板' }).click()
  await page.evaluate(() =>
    window.scrollTo(0, document.documentElement.scrollHeight)
  )
  await expectNoBoxOverlap(
    page,
    '.output-row:last-child .output-row__copy',
    '.timezone-trigger'
  )

  await page.evaluate(() => window.__utoolsTest.resetCalls())
  await page
    .locator('.output-row')
    .filter({ hasText: 'UTC+1 欧洲中部时区' })
    .locator('.output-row__copy')
    .click()
  const copyCalls = await page.evaluate(() => window.__utoolsTest.getCalls())
  expect(copyCalls.copyText).toEqual(['2026-11-23 02:43:11'])
  expect(copyCalls.hideMainWindow).toHaveLength(1)

  await page.setViewportSize({ width: 1200, height: 800 })
  await expectNoHorizontalOverflow(page)
  await expect(page.locator('#timestamp-input-type')).toBeVisible()
  await expect(page.locator('.timestamp-status')).toBeVisible()
  await expect(page.locator('.timezone-trigger')).toBeVisible()

  expect(errors).toEqual([])
})
