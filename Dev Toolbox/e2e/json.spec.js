import {
  collectPageErrors,
  expect,
  openApp,
  test
} from './fixtures/utools.js'

test.use({ viewport: { width: 1200, height: 800 } })

const sample = {
  name: 'Dev Toolbox',
  nested: { enabled: true, deeper: { count: 2 } },
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

function collectNetworkRequests(page) {
  const requests = []
  page.on('request', (request) => {
    if (/^(https?|wss?):/i.test(request.url())) requests.push(request.url())
  })
  return requests
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

async function graphTransform(page) {
  return page
    .locator('[data-testid="json-graph-surface"]')
    .evaluate((element) => ({
      scale: Number(element.dataset.scale),
      x: Number(element.dataset.x),
      y: Number(element.dataset.y)
    }))
}

async function expectClean(errors, requests) {
  expect(errors).toEqual([])
  expect(requests).toEqual([])
}

test('defaults to the graph and preserves three-mode state, tree, format, and copy behavior', async ({
  page
}) => {
  const errors = collectPageErrors(page)
  const requests = collectNetworkRequests(page)
  await enterJson(page)

  await expect(page.locator('[data-state="empty"]')).toBeVisible()
  expect(await page.getByRole('tab').allTextContents()).toEqual([
    '结构树',
    '关系图',
    '格式化'
  ])
  await expect(page.getByRole('tab', { name: '关系图' })).toHaveAttribute(
    'aria-selected',
    'true'
  )

  await page.locator('#json-input').fill(JSON.stringify(sample, null, 2))
  await expect(page.locator('.json-tool')).toHaveAttribute('data-mode', 'graph')
  await expect(page.getByRole('tab', { name: '关系图' })).toHaveAttribute(
    'aria-selected',
    'true'
  )
  await expect(page.locator('.graph-card')).toHaveCount(5)
  const inputValue = await page.locator('#json-input').inputValue()

  await page.locator('#json-input').fill('{ "name": 1, }')
  const errorNotice = page.locator('.error-notice')
  await expect(errorNotice).toBeVisible()
  await expect(errorNotice).toContainText(/位置：第 \d+ 行，第 \d+ 列/)
  await page.getByRole('tab', { name: '结构树' }).click()
  await expect(errorNotice).toBeVisible()
  await page.getByRole('tab', { name: '格式化' }).click()
  await expect(errorNotice).toBeVisible()

  await page.locator('#json-input').fill(inputValue)
  await page.getByRole('tab', { name: '关系图' }).click()
  await expect(page.locator('.json-tool')).toHaveAttribute('data-mode', 'graph')

  await page.getByRole('tab', { name: '结构树' }).click()
  const tree = page.locator('[data-testid="json-tree"]')
  await expect(tree).toBeVisible()
  const root = tree.getByRole('treeitem').first()
  await expect(root).toHaveAttribute('aria-expanded', 'true')
  await expect(root).toContainText('$')
  await tree.getByRole('button', { name: '展开 nested' }).click()
  await expect(tree).toContainText('enabled')
  await tree.getByRole('button', { name: '展开 items' }).click()
  await expect(tree).toContainText('[0]')
  await expect(page.locator('#json-input')).toHaveValue(inputValue)

  await page.getByRole('tab', { name: '关系图' }).click()
  await expect(page.locator('.graph-card')).toHaveCount(5)
  await expect(page.locator('#json-input')).toHaveValue(inputValue)

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

  await page.getByRole('tab', { name: '关系图' }).focus()
  await page.keyboard.press('ArrowRight')
  await expect(page.locator('.json-tool')).toHaveAttribute('data-mode', 'format')
  await page.keyboard.press('ArrowLeft')
  await expect(page.locator('.json-tool')).toHaveAttribute('data-mode', 'graph')
  await page.keyboard.press('Home')
  await expect(page.locator('.json-tool')).toHaveAttribute('data-mode', 'tree')
  await page.keyboard.press('End')
  await expect(page.locator('.json-tool')).toHaveAttribute('data-mode', 'format')
  await expect(page.locator('#json-input')).toHaveValue(inputValue)

  await expectClean(errors, requests)
})

test('renders deterministic graph structure and supports hover, focus, inspect, and collapse', async ({
  page
}) => {
  const errors = collectPageErrors(page)
  const requests = collectNetworkRequests(page)
  await enterJson(page)
  await page.locator('#json-input').fill(JSON.stringify(sample))

  await expect(page.locator('.graph-card')).toHaveCount(5)
  await expect(page.locator('.graph-row')).toHaveCount(10)
  await expect(page.locator('.json-graph__edge')).toHaveCount(4)
  await expect(
    page.getByRole('group', {
      name: 'object 卡片 $["nested"]',
      exact: true
    })
  ).toBeVisible()
  expect(await page.locator('.json-graph__edge text').allTextContents()).toEqual(
    ['nested', 'deeper', 'items', '[1]']
  )
  await expect(page.locator('[data-testid="json-graph"] img')).toHaveCount(0)
  await expect(page.locator('[data-testid="json-graph"] script')).toHaveCount(0)
  expect(await page.evaluate(() => window.__jsonXss)).toBeUndefined()

  const countRow = page.getByRole('button', {
    name: 'number $["nested"]["deeper"]["count"]',
    exact: true
  })
  await countRow.hover()
  const tooltip = page.getByRole('tooltip')
  await expect(tooltip).toBeVisible()
  await expect(tooltip).toContainText('$["nested"]["deeper"]["count"]')
  await expect(tooltip).toContainText('number')
  await page.mouse.move(2, 2)
  await expect(tooltip).toHaveCount(0)

  await countRow.focus()
  await expect(tooltip).toBeVisible()
  await expect(tooltip).toContainText('$["nested"]["deeper"]["count"]')
  await page.keyboard.press('Escape')
  await expect(tooltip).toHaveCount(0)

  await countRow.click()
  const inspector = page.locator('[data-testid="json-graph-inspector"]')
  await expect(inspector).toBeVisible()
  await expect(inspector).toContainText('$["nested"]["deeper"]["count"]')
  await expect(inspector).toContainText('number')
  await expect(inspector.locator('pre')).toHaveText('2')
  await page.keyboard.press('Escape')
  await expect(inspector).toHaveCount(0)

  await countRow.click()
  await expect(inspector).toBeVisible()
  await inspector.getByRole('button', { name: '关闭检查器' }).click()
  await expect(inspector).toHaveCount(0)

  const viewport = page.locator('[data-testid="json-graph-viewport"]')
  await viewport.focus()
  expect(
    await page.evaluate(() =>
      document.activeElement?.getAttribute('data-graph-path')
    )
  ).toBe('$')
  await page.keyboard.press('ArrowDown')
  expect(
    await page.evaluate(() =>
      document.activeElement?.getAttribute('data-graph-path')
    )
  ).toBe('$["name"]')
  await page.keyboard.press('Enter')
  await expect(inspector).toBeVisible()
  await expect(inspector).toContainText('$["name"]')
  await page.keyboard.press('Escape')
  await expect(inspector).toHaveCount(0)
  await page.keyboard.press('Home')
  await page.keyboard.press(' ')
  await expect(page.locator('.graph-card')).toHaveCount(1)
  await page.keyboard.press(' ')
  await expect(page.locator('.graph-card')).toHaveCount(5)

  const nestedToggle = page.getByRole('button', {
    name: '收起卡片 $["nested"]',
    exact: true
  })
  await expect(nestedToggle).toHaveAttribute('aria-expanded', 'true')
  await nestedToggle.click()
  await expect(
    page.getByRole('button', {
      name: '展开卡片 $["nested"]',
      exact: true
    })
  ).toHaveAttribute('aria-expanded', 'false')
  await expect(
    page.getByRole('group', {
      name: 'object 卡片 $["nested"]["deeper"]',
      exact: true
    })
  ).toHaveCount(0)
  await expect(page.locator('.json-graph__edge')).toHaveCount(3)
  await page
    .getByRole('button', {
      name: '展开卡片 $["nested"]',
      exact: true
    })
    .click()
  await expect(page.locator('.graph-card')).toHaveCount(5)

  await page.getByRole('button', { name: '全部收起' }).click()
  await expect(page.locator('.graph-card')).toHaveCount(3)
  await expect(page.locator('.json-graph__edge')).toHaveCount(2)
  await page.getByRole('button', { name: '全部展开' }).click()
  await expect(page.locator('.graph-card')).toHaveCount(5)
  await expect(page.locator('.json-graph__edge')).toHaveCount(4)

  await expectClean(errors, requests)
})

test('pans, zooms around the pointer, fits, and resets without page scrolling', async ({
  page
}) => {
  const errors = collectPageErrors(page)
  const requests = collectNetworkRequests(page)
  await enterJson(page)
  await page.locator('#json-input').fill(JSON.stringify(sample, null, 2))
  const viewport = page.locator('[data-testid="json-graph-viewport"]')
  await expect(page.locator('.graph-card').first()).toBeVisible()

  const box = await viewport.boundingBox()
  expect(box).not.toBeNull()
  const start = await graphTransform(page)
  await page.mouse.move(box.x + box.width * 0.7, box.y + box.height * 0.55)
  await page.mouse.down()
  await page.mouse.move(
    box.x + box.width * 0.7 + 70,
    box.y + box.height * 0.55 + 28,
    { steps: 5 }
  )
  await page.mouse.up()
  const panned = await graphTransform(page)
  expect(panned.x).not.toBe(start.x)
  expect(panned.y).not.toBe(start.y)
  await expect(page.locator('[data-testid="json-graph-inspector"]')).toHaveCount(
    0
  )

  await page.getByRole('button', { name: '重置视图' }).click()
  await expect.poll(async () => (await graphTransform(page)).scale).toBe(1)
  const reset = await graphTransform(page)
  const scrollBefore = await page.evaluate(() => window.scrollY)
  await page.mouse.move(box.x + box.width * 0.55, box.y + box.height * 0.45)
  await page.mouse.wheel(0, -220)
  await expect
    .poll(async () => (await graphTransform(page)).scale)
    .toBeGreaterThan(reset.scale)
  expect(await page.evaluate(() => window.scrollY)).toBe(scrollBefore)
  await expectNoPageOverflow(page)

  await page.getByRole('button', { name: '放大关系图' }).click()
  await expect
    .poll(async () => (await graphTransform(page)).scale)
    .toBeGreaterThan(1)
  await page.getByRole('button', { name: '适应视图' }).click()
  const fitted = await graphTransform(page)
  expect(fitted.scale).toBeLessThanOrEqual(1)
  expect(fitted.scale).toBeGreaterThanOrEqual(0.25)
  await expectNoPageOverflow(page)

  await page.getByRole('button', { name: '重置视图' }).click()
  await expect.poll(async () => (await graphTransform(page)).scale).toBe(1)
  await page.getByRole('button', { name: '缩小关系图' }).click()
  await expect
    .poll(async () => (await graphTransform(page)).scale)
    .toBeLessThan(1)

  await expectClean(errors, requests)
})

test('shows a graph-only limited state and keeps tree and format usable', async ({
  page
}) => {
  const errors = collectPageErrors(page)
  const requests = collectNetworkRequests(page)
  await enterJson(page)
  const overLimitValue = 'x'.repeat(4097)
  const overLimitInput = JSON.stringify(overLimitValue)
  await page.locator('#json-input').fill(overLimitInput)

  const limited = page.locator('[data-testid="json-graph-limited"]')
  await expect(limited).toBeVisible()
  await expect(limited).toContainText('单个字面量字符数')
  await expect(limited).toContainText('4,096 个字符')
  await expect(page.getByRole('tab', { name: '关系图' })).toHaveAttribute(
    'aria-selected',
    'true'
  )
  await expect(page.locator('.graph-card')).toHaveCount(0)

  await limited.getByRole('button', { name: '切换到结构树' }).click()
  await expect(page.locator('.json-tool')).toHaveAttribute('data-mode', 'tree')
  await expect(page.locator('[data-testid="json-tree"]')).toBeVisible()
  await expect(page.locator('[data-testid="json-tree"]')).toContainText(
    'xxxxxxxxxx'
  )

  await page.getByRole('tab', { name: '格式化' }).click()
  await expect(page.locator('.output-row__value')).toHaveText(overLimitInput)
  await page.evaluate(() => window.__utoolsTest.resetCalls())
  await page.getByRole('button', { name: '复制 格式化结果' }).click()
  await expect
    .poll(() =>
      page.evaluate(() => window.__utoolsTest.getCalls().copyText[0] || null)
    )
    .toBe(overLimitInput)

  await page.getByRole('tab', { name: '关系图' }).click()
  await expect(limited).toBeVisible()
  await expect(page.locator('.json-tool')).toHaveAttribute('data-mode', 'graph')
  await expectNoPageOverflow(page)

  await expectClean(errors, requests)
})

test('reflows the inspector and avoids page overflow at 320, 375, and 1200px', async ({
  page
}) => {
  const errors = collectPageErrors(page)
  const requests = collectNetworkRequests(page)
  await enterJson(page)
  await page.locator('#json-input').fill(JSON.stringify(sample))
  await page
    .getByRole('button', {
      name: 'string $["name"]',
      exact: true
    })
    .click()
  const inspector = page.locator('[data-testid="json-graph-inspector"]')
  const viewport = page.locator('[data-testid="json-graph-viewport"]')
  await expect(inspector).toBeVisible()

  await page.setViewportSize({ width: 1200, height: 900 })
  await expectNoPageOverflow(page)
  let boxes = await page.evaluate(() => {
    const viewportRect = document
      .querySelector('[data-testid="json-graph-viewport"]')
      .getBoundingClientRect()
    const inspectorRect = document
      .querySelector('[data-testid="json-graph-inspector"]')
      .getBoundingClientRect()
    return {
      viewport: viewportRect.toJSON(),
      inspector: inspectorRect.toJSON()
    }
  })
  expect(boxes.inspector.left).toBeGreaterThanOrEqual(boxes.viewport.right)

  for (const width of [375, 320]) {
    await page.setViewportSize({ width, height: 800 })
    await expectNoPageOverflow(page)
    await expect(viewport).toBeVisible()
    await expect(inspector).toBeVisible()
    const toolbarButtons = page.getByRole('toolbar').getByRole('button')
    await expect(toolbarButtons).toHaveCount(6)
    for (const button of await toolbarButtons.all()) {
      await expect(button).toBeVisible()
    }
    boxes = await page.evaluate(() => {
      const viewportRect = document
        .querySelector('[data-testid="json-graph-viewport"]')
        .getBoundingClientRect()
      const inspectorRect = document
        .querySelector('[data-testid="json-graph-inspector"]')
        .getBoundingClientRect()
      return {
        viewport: viewportRect.toJSON(),
        inspector: inspectorRect.toJSON()
      }
    })
    expect(boxes.inspector.top).toBeGreaterThanOrEqual(
      boxes.viewport.bottom - 1
    )
    await page.getByRole('button', { name: '重置视图' }).click()
    await expect.poll(async () => (await graphTransform(page)).scale).toBe(1)
    await expectNoPageOverflow(page)
  }

  await expectClean(errors, requests)
})
