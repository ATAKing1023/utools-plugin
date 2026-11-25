import {
  collectPageErrors,
  expect,
  openApp,
  test
} from './fixtures/utools.js'

const ROUTES = [
  ['home', '[data-tool="home"]'],
  ['timestamp', '[data-tool="timestamp"]'],
  ['uuid', '[data-tool="uuid"]'],
  ['base64', '[data-tool="base64"]'],
  ['url', '[data-tool="url"]'],
  ['diff', '.diff-tool'],
  ['json', '[data-tool="json"]'],
  ['xml', '[data-tool="xml"]'],
  ['jwt', '[data-tool="jwt"]']
]

test('boots the production build without errors and shows a defined empty state', async ({
  page
}) => {
  const errors = collectPageErrors(page)
  await openApp(page)

  await expect(page.locator('.app-shell')).toHaveAttribute('data-route', 'empty')
  await expect(page.locator('[data-state="empty"]')).toBeVisible()
  await expect(page.locator('[role="status"]')).toContainText(
    '请从 uTools 功能入口打开工具'
  )
  expect(errors).toEqual([])
})

test('shows a safe unknown state and clears the route on plugin exit', async ({
  page
}) => {
  const errors = collectPageErrors(page)
  await openApp(page)

  await page.evaluate(() => {
    window.__utoolsTest.enter({
      code: 'not-a-feature',
      type: 'text',
      payload: 'unknown',
      from: 'main'
    })
  })

  await expect(page.locator('.app-shell')).toHaveAttribute(
    'data-route',
    'not-a-feature'
  )
  await expect(page.locator('[role="status"]')).toContainText(
    '未知功能：not-a-feature'
  )

  await page.evaluate(() => {
    window.__utoolsTest.out(false)
  })

  await expect(page.locator('.app-shell')).toHaveAttribute('data-route', 'empty')
  await expect(page.locator('[role="status"]')).toContainText(
    '请从 uTools 功能入口打开工具'
  )
  expect(errors).toEqual([])
})

test('registers lifecycle callbacks once and exposes only the documented double surface', async ({
  page
}) => {
  await openApp(page)

  const surface = await page.evaluate(() => ({
    listenerCounts: window.__utoolsTest.listenerCounts(),
    keys: Object.keys(window.utools).sort(),
    dbKeys: Object.keys(window.utools.dbStorage).sort(),
    hasPlatform: 'platform' in window.utools,
    calls: window.__utoolsTest.getCalls()
  }))

  expect(surface.listenerCounts).toEqual({ enter: 1, out: 1 })
  expect(surface.keys).toEqual([
    'copyText',
    'dbStorage',
    'hideMainWindow',
    'isMacOS',
    'onPluginEnter',
    'onPluginOut'
  ])
  expect(surface.dbKeys).toEqual(['getItem', 'removeItem', 'setItem'])
  expect(surface.hasPlatform).toBe(false)
  expect(surface.calls.hideMainWindow).toEqual([])
  expect(surface.calls.copyText).toEqual([])
})

test('routes every one of the nine frozen features', async ({ page }) => {
  const errors = collectPageErrors(page)
  await openApp(page)

  for (const [code, selector] of ROUTES) {
    await page.evaluate((routeCode) => {
      window.__utoolsTest.enter({
        code: routeCode,
        type: 'text',
        payload: routeCode,
        from: 'main'
      })
    }, code)

    await expect(page.locator('.app-shell')).toHaveAttribute(
      'data-route',
      code
    )
    await expect(page.locator(selector)).toBeVisible()
  }

  await page.evaluate(() => {
    window.__utoolsTest.enter({
      code: 'not-a-feature',
      type: 'text',
      payload: 'unknown',
      from: 'main'
    })
  })
  await expect(page.locator('[role="status"]')).toContainText(
    '未知功能：not-a-feature'
  )

  await page.evaluate(() => {
    window.__utoolsTest.out(false)
  })
  await expect(page.locator('.app-shell')).toHaveAttribute('data-route', 'empty')
  expect(errors).toEqual([])
})

test('offers a unified entry that lists every tool and navigates in and back', async ({
  page
}) => {
  const errors = collectPageErrors(page)
  await openApp(page)

  await page.evaluate(() => {
    window.__utoolsTest.enter({
      code: 'home',
      type: 'none',
      payload: '',
      from: 'main'
    })
  })

  await expect(page.locator('.app-shell')).toHaveAttribute('data-route', 'home')
  await expect(page.locator('[data-tool="home"]')).toBeVisible()
  await expect(page.locator('[data-tool-code]')).toHaveCount(8)

  await page.locator('[data-tool-code="timestamp"]').click()
  await expect(page.locator('.app-shell')).toHaveAttribute(
    'data-route',
    'timestamp'
  )
  await expect(page.locator('[data-tool="timestamp"]')).toBeVisible()

  await page.getByRole('button', { name: '← 全部工具' }).click()
  await expect(page.locator('.app-shell')).toHaveAttribute('data-route', 'home')
  await expect(page.locator('[data-tool="home"]')).toBeVisible()

  expect(errors).toEqual([])
})
