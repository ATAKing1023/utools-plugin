import {
  collectPageErrors,
  expect,
  openApp,
  test
} from './fixtures/utools.js'

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
