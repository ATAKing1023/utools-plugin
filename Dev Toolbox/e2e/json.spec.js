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

async function emptyViewportPoint(page) {
  return page
    .locator('[data-testid="json-graph-viewport"]')
    .evaluate((viewport) => {
      const rect = viewport.getBoundingClientRect()
      const candidates = [
        [0.08, 0.25],
        [0.12, 0.4],
        [0.2, 0.2],
        [0.08, 0.55]
      ]

      for (const [xRatio, yRatio] of candidates) {
        const x = rect.left + rect.width * xRatio
        const y = rect.top + rect.height * yRatio
        const element = document.elementFromPoint(x, y)
        if (
          element &&
          viewport.contains(element) &&
          !element.closest('.graph-card')
        ) {
          return { x, y }
        }
      }

      return null
    })
}

function nestedContainers(depth) {
  let value = { leaf: 'end' }
  for (let index = 0; index < depth - 1; index += 1) {
    value = { child: value }
  }
  return value
}

async function activeGraphGeometry(page) {
  return page.evaluate(() => {
    const active = document.activeElement
    const viewport = document
      .querySelector('[data-testid="json-graph-viewport"]')
      .getBoundingClientRect()
    if (
      !active ||
      !(active instanceof Element) ||
      !active.matches('[data-graph-focus-index]')
    ) {
      return {
        valid: false,
        tag: active?.tagName ?? null,
        visibleWidth: 0,
        visibleHeight: 0
      }
    }

    const rect = active.getBoundingClientRect()
    const visibleWidth = Math.max(
      0,
      Math.min(rect.right, viewport.right) - Math.max(rect.left, viewport.left)
    )
    const visibleHeight = Math.max(
      0,
      Math.min(rect.bottom, viewport.bottom) - Math.max(rect.top, viewport.top)
    )
    const tolerance = 0.75
    return {
      valid: true,
      tag: active.tagName,
      path: active.getAttribute('data-graph-path'),
      cardId: active.getAttribute('data-graph-card-id'),
      visibleWidth,
      visibleHeight,
      fullyVisible:
        rect.left >= viewport.left - tolerance &&
        rect.right <= viewport.right + tolerance &&
        rect.top >= viewport.top - tolerance &&
        rect.bottom <= viewport.bottom + tolerance
    }
  })
}

async function expectFocusedInGraph(page) {
  await expect
    .poll(async () => {
      const geometry = await activeGraphGeometry(page)
      return geometry.valid && geometry.visibleWidth > 0 && geometry.visibleHeight > 0
    })
    .toBe(true)
  return activeGraphGeometry(page)
}

async function waitForFrame(page) {
  await page.evaluate(
    () => new Promise((resolve) => requestAnimationFrame(() => resolve()))
  )
}

async function expectClean(errors, requests) {
  expect(errors).toEqual([])
  expect(requests).toEqual([])
}

async function copiedText(page) {
  await expect
    .poll(() =>
      page.evaluate(() => window.__utoolsTest.getCalls().copyText[0] ?? null)
    )
    .not.toBeNull()

  return page.evaluate(() => window.__utoolsTest.getCalls().copyText[0])
}

test('defaults to the graph and preserves two-mode state, tree, actions, and copy behavior', async ({
  page
}) => {
  const errors = collectPageErrors(page)
  const requests = collectNetworkRequests(page)
  await enterJson(page)

  await expect(page.locator('[data-state="empty"]')).toBeVisible()
  expect(await page.getByRole('tab').allTextContents()).toEqual([
    '结构树',
    '关系图'
  ])
  await expect(page.getByRole('tab', { name: '关系图' })).toHaveAttribute(
    'aria-selected',
    'true'
  )

  await page.locator('#json-input').fill(JSON.stringify(sample, null, 2))
  await expect(page.locator('[data-tool="json"]')).toHaveAttribute(
    'data-mode',
    'graph'
  )
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

  await page.locator('#json-input').fill(inputValue)
  await page.getByRole('tab', { name: '关系图' }).click()
  await expect(page.locator('[data-tool="json"]')).toHaveAttribute(
    'data-mode',
    'graph'
  )

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

  await page.getByRole('button', { name: '压缩复制' }).click()
  await expect
    .poll(() =>
      page.evaluate(() => window.__utoolsTest.getCalls().copyText[0] || null)
    )
    .toBe(JSON.stringify(sample))

  await page.getByRole('tab', { name: '关系图' }).focus()
  await page.keyboard.press('ArrowRight')
  await expect(page.locator('[data-tool="json"]')).toHaveAttribute(
    'data-mode',
    'tree'
  )
  await page.keyboard.press('ArrowLeft')
  await expect(page.locator('[data-tool="json"]')).toHaveAttribute(
    'data-mode',
    'graph'
  )
  await page.keyboard.press('Home')
  await expect(page.locator('[data-tool="json"]')).toHaveAttribute(
    'data-mode',
    'tree'
  )
  await page.keyboard.press('End')
  await expect(page.locator('[data-tool="json"]')).toHaveAttribute(
    'data-mode',
    'graph'
  )
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
  await expect(page.locator('.graph-card')).toHaveCount(1)
  await expect(page.locator('.json-graph__edge')).toHaveCount(0)
  await page.getByRole('button', { name: '全部展开' }).click()
  await expect(page.locator('.graph-card')).toHaveCount(5)
  await expect(page.locator('.json-graph__edge')).toHaveCount(4)

  await expectClean(errors, requests)
})

test('keeps keyboard-focused items visible in large within-limit graphs', async ({
  page
}) => {
  const errors = collectPageErrors(page)
  const requests = collectNetworkRequests(page)
  await enterJson(page)

  const cases = [
    {
      name: '128 levels',
      cards: 128,
      value: nestedContainers(128)
    },
    {
      name: '2,000 rows',
      cards: 1,
      value: Object.fromEntries(
        Array.from({ length: 2000 }, (_, index) => [`key${index}`, index])
      )
    },
    {
      name: '500 cards',
      cards: 500,
      value: Array.from({ length: 499 }, () => ({}))
    }
  ]

  for (const graphCase of cases) {
    await page.locator('#json-input').fill(JSON.stringify(graphCase.value))
    await expect(page.locator('.graph-card')).toHaveCount(graphCase.cards)
    await waitForFrame(page)

    const viewport = page.locator('[data-testid="json-graph-viewport"]')
    await viewport.focus()
    const scrollBefore = await page.evaluate(() => ({
      x: window.scrollX,
      y: window.scrollY
    }))

    await page.keyboard.press('End')
    let geometry = await expectFocusedInGraph(page)
    expect(geometry.valid).toBe(true)
    expect(geometry.fullyVisible).toBe(true)

    for (let index = 0; index < 3; index += 1) {
      await page.keyboard.press('ArrowLeft')
      geometry = await expectFocusedInGraph(page)
      expect(geometry.valid).toBe(true)
      expect(geometry.fullyVisible).toBe(true)
    }

    expect(
      await page.evaluate(() => ({
        x: window.scrollX,
        y: window.scrollY
      }))
    ).toEqual(scrollBefore)
  }

  await expectClean(errors, requests)
})

test('restores inspector focus by identity and falls back when hidden', async ({
  page
}) => {
  const errors = collectPageErrors(page)
  const requests = collectNetworkRequests(page)
  await enterJson(page)
  await page.locator('#json-input').fill(
    JSON.stringify({
      a: { deep: { value: 1 } },
      b: { value: 2 },
      c: { tail: true }
    })
  )

  const inspector = page.locator('[data-testid="json-graph-inspector"]')
  const rowB = page.getByRole('button', {
    name: 'object $["b"]',
    exact: true
  })
  await rowB.click()
  await expect(inspector).toBeVisible()
  await inspector.locator('pre').focus()
  await page.keyboard.press('Escape')
  await expect(inspector).toHaveCount(0)
  await expect
    .poll(() =>
      page.evaluate(() =>
        document.activeElement?.getAttribute('data-graph-path')
      )
    )
    .toBe('$["b"]')

  const cardB = page.getByRole('group', {
    name: 'object 卡片 $["b"]',
    exact: true
  })
  await cardB.click({ position: { x: 80, y: 20 } })
  await expect(inspector).toBeVisible()
  await page.getByRole('button', {
    name: '收起卡片 $["a"]',
    exact: true
  }).click()
  await expect(inspector).toBeVisible()
  await inspector.getByRole('button', { name: '关闭检查器' }).click()
  await expect
    .poll(() =>
      page.evaluate(() =>
        document.activeElement?.getAttribute('data-graph-card-id')
      )
    )
    .toBe('$["b"]')

  await cardB.click({ position: { x: 80, y: 20 } })
  await expect(inspector).toBeVisible()
  await inspector.locator('pre').focus()
  await page.evaluate(() => {
    document.querySelector('[aria-label="收起卡片 $"]')?.click()
  })
  await expect(inspector).toHaveCount(0)
  await expect
    .poll(() =>
      page.evaluate(() =>
        document.activeElement?.getAttribute('data-graph-card-id')
      )
    )
    .toBe('$')
  expect(
    await page.evaluate(() => document.activeElement === document.body)
  ).toBe(false)

  await expectClean(errors, requests)
})

test('clears aborted pointer presses outside the viewport and on cancellation', async ({
  page
}) => {
  const errors = collectPageErrors(page)
  const requests = collectNetworkRequests(page)
  await enterJson(page)
  await page.locator('#json-input').fill(JSON.stringify(sample))
  const viewport = page.locator('[data-testid="json-graph-viewport"]')
  await expect(page.locator('.graph-card').first()).toBeVisible()
  const box = await viewport.boundingBox()
  expect(box).not.toBeNull()
  await waitForFrame(page)
  await waitForFrame(page)

  await page.mouse.move(box.x + box.width * 0.6, box.y + box.height * 0.5)
  await page.mouse.down()
  await page.mouse.move(
    box.x + box.width * 0.6 + 2,
    box.y + box.height * 0.5 + 1
  )
  await waitForFrame(page)
  const armed = await graphTransform(page)
  await page.mouse.move(box.x + box.width * 0.4, box.y - 30)
  await page.mouse.up()
  await page.mouse.move(box.x + box.width * 0.4, box.y + box.height * 0.4)
  await page.mouse.move(
    box.x + box.width * 0.4 + 90,
    box.y + box.height * 0.4 + 35,
    { steps: 4 }
  )
  await waitForFrame(page)
  expect(await graphTransform(page)).toEqual(armed)

  await page.evaluate(() => {
    const target = document.querySelector(
      '[data-testid="json-graph-viewport"]'
    )
    const options = {
      bubbles: true,
      cancelable: true,
      pointerId: 71,
      pointerType: 'mouse',
      button: 0,
      buttons: 1,
      clientX: 320,
      clientY: 500
    }
    target.dispatchEvent(new PointerEvent('pointerdown', options))
    target.dispatchEvent(
      new PointerEvent('pointermove', {
        ...options,
        clientX: 350,
        clientY: 500
      })
    )
  })
  await expect
    .poll(async () => (await graphTransform(page)).x !== armed.x)
    .toBe(true)
  await page.evaluate(() => {
    const target = document.querySelector(
      '[data-testid="json-graph-viewport"]'
    )
    target.dispatchEvent(
      new PointerEvent('pointercancel', {
        bubbles: true,
        pointerId: 71,
        pointerType: 'mouse',
        button: 0,
        buttons: 0,
        clientX: 350,
        clientY: 500
      })
    )
  })
  const afterCancel = await graphTransform(page)
  await page.evaluate(() => {
    const target = document.querySelector(
      '[data-testid="json-graph-viewport"]'
    )
    target.dispatchEvent(
      new PointerEvent('pointermove', {
        bubbles: true,
        pointerId: 71,
        pointerType: 'mouse',
        button: 0,
        buttons: 0,
        clientX: 460,
        clientY: 500
      })
    )
  })
  await waitForFrame(page)
  expect(await graphTransform(page)).toEqual(afterCancel)

  await page.evaluate(() => {
    const target = document.querySelector(
      '[data-testid="json-graph-viewport"]'
    )
    const options = {
      bubbles: true,
      cancelable: true,
      pointerId: 72,
      pointerType: 'mouse',
      button: 0,
      buttons: 1,
      clientX: 320,
      clientY: 500
    }
    target.dispatchEvent(new PointerEvent('pointerdown', options))
    target.dispatchEvent(
      new PointerEvent('pointermove', {
        ...options,
        clientX: 340,
        clientY: 500
      })
    )
  })
  await expect
    .poll(async () => (await graphTransform(page)).x !== afterCancel.x)
    .toBe(true)
  await page.evaluate(() => {
    const target = document.querySelector(
      '[data-testid="json-graph-viewport"]'
    )
    target.dispatchEvent(
      new PointerEvent('lostpointercapture', {
        bubbles: true,
        pointerId: 72,
        pointerType: 'mouse'
      })
    )
  })
  const afterLostCapture = await graphTransform(page)
  await page.evaluate(() => {
    const target = document.querySelector(
      '[data-testid="json-graph-viewport"]'
    )
    target.dispatchEvent(
      new PointerEvent('pointermove', {
        bubbles: true,
        pointerId: 72,
        pointerType: 'mouse',
        button: 0,
        buttons: 0,
        clientX: 430,
        clientY: 500
      })
    )
  })
  await waitForFrame(page)
  expect(await graphTransform(page)).toEqual(afterLostCapture)

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

test('does not auto-pan when pressing the graph background after panning', async ({
  page
}) => {
  const errors = collectPageErrors(page)
  const requests = collectNetworkRequests(page)
  await enterJson(page)
  await page.locator('#json-input').fill(JSON.stringify(sample, null, 2))
  await expect(page.locator('.graph-card').first()).toBeVisible()

  const viewport = page.locator('[data-testid="json-graph-viewport"]')
  const box = await viewport.boundingBox()
  expect(box).not.toBeNull()
  const point = await emptyViewportPoint(page)
  expect(point).not.toBeNull()
  const initial = await graphTransform(page)

  await page.mouse.move(point.x, point.y)
  await page.mouse.down()
  await page.mouse.move(box.x + box.width - 24, point.y + 36, { steps: 8 })
  await page.mouse.up()
  const panned = await graphTransform(page)
  expect(panned.x).toBeGreaterThan(initial.x + box.width * 0.5)

  await page.mouse.move(point.x, point.y)
  await page.mouse.down()
  await waitForFrame(page)
  expect(await graphTransform(page)).toEqual(panned)
  await page.mouse.up()

  await expect(
    page.locator('[data-testid="json-graph-inspector"]')
  ).toHaveCount(0)
  await expectClean(errors, requests)
})

test('shows a graph-only limited state and keeps tree and format usable', async ({
  page
}) => {
  const errors = collectPageErrors(page)
  const requests = collectNetworkRequests(page)
  await enterJson(page)
  const overLimitValue = 'x'.repeat(3 * 1024 * 1024)
  const overLimitInput = JSON.stringify(overLimitValue)
  await page.locator('#json-input').fill(overLimitInput)

  const limited = page.locator('[data-testid="json-graph-limited"]')
  await expect(limited).toBeVisible()
  await expect(limited).toContainText('UTF-8 输入大小')
  await expect(limited).toContainText('2 MiB')
  await expect(page.getByRole('tab', { name: '关系图' })).toHaveAttribute(
    'aria-selected',
    'true'
  )
  await expect(page.locator('.graph-card')).toHaveCount(0)

  await limited.getByRole('button', { name: '切换到结构树' }).click()
  await expect(page.locator('[data-tool="json"]')).toHaveAttribute(
    'data-mode',
    'tree'
  )
  await expect(page.locator('[data-testid="json-tree"]')).toBeVisible()
  await expect(page.locator('[data-testid="json-tree"]')).toContainText(
    'xxxxxxxxxx'
  )

  await page.evaluate(() => window.__utoolsTest.resetCalls())
  await page.getByRole('button', { name: '压缩复制' }).click()
  await expect
    .poll(() =>
      page.evaluate(() => window.__utoolsTest.getCalls().copyText[0] || null)
    )
    .toBe(JSON.stringify('x'.repeat(3 * 1024 * 1024)))

  await page.getByRole('tab', { name: '关系图' }).click()
  await expect(limited).toBeVisible()
  await expect(page.locator('[data-tool="json"]')).toHaveAttribute(
    'data-mode',
    'graph'
  )
  await expectNoPageOverflow(page)

  await expectClean(errors, requests)
})

test('offers editor actions under the input and copies derived formats', async ({
  page
}) => {
  const errors = collectPageErrors(page)
  await enterJson(page)

  const bar = page.locator('[data-testid="tool-action-bar"]')
  await expect(bar).toBeVisible()
  expect(
    await page.locator('[data-action-id]').allTextContents()
  ).toEqual(['格式化', '去注释', '压缩复制', '压缩转义复制', '转 XML 复制', '转 TS 复制'])

  await page.locator('#json-input').fill('{"name":"Ada","tags":["a"]}')

  await page.evaluate(() => window.__utoolsTest.resetCalls())
  await page.getByRole('button', { name: '压缩复制' }).click()
  await expect
    .poll(() =>
      page.evaluate(() => window.__utoolsTest.getCalls().copyText[0] || null)
    )
    .toBe('{"name":"Ada","tags":["a"]}')

  await page.evaluate(() => window.__utoolsTest.resetCalls())
  await page.getByRole('button', { name: '转 XML 复制' }).click()
  await expect
    .poll(() =>
      page.evaluate(() => window.__utoolsTest.getCalls().copyText[0] || null)
    )
    .toContain('<name>Ada</name>')

  await page.evaluate(() => window.__utoolsTest.resetCalls())
  await page.getByRole('button', { name: '转 TS 复制' }).click()
  await expect
    .poll(() =>
      page.evaluate(() => window.__utoolsTest.getCalls().copyText[0] || null)
    )
    .toContain('name: string')

  await page.getByRole('button', { name: '格式化' }).click()
  await expect(page.locator('#json-input')).toHaveValue(
    JSON.stringify({ name: 'Ada', tags: ['a'] }, null, 2)
  )

  await page.locator('#json-input').fill('{\n  // comment\n  "a": 1\n}')
  await page.getByRole('button', { name: '去注释' }).click()
  await expect(page.locator('#json-input')).toHaveValue('{\n  "a": 1\n}')

  expect(errors).toEqual([])
})

test('compresses without losing number literals and escapes the result', async ({
  page
}) => {
  const errors = collectPageErrors(page)
  await enterJson(page)

  const input = page.locator('#json-input')
  await input.fill('{\n  "a": 1,\n  "b": 2.50,\n  "c": 1e3,\n  "text": "keep  space"\n}')

  await page.evaluate(() => window.__utoolsTest.resetCalls())
  await page.getByRole('button', { name: '压缩复制' }).click()
  await expect
    .poll(() =>
      page.evaluate(() => window.__utoolsTest.getCalls().copyText[0] || null)
    )
    .toBe('{"a":1,"b":2.50,"c":1e3,"text":"keep  space"}')

  await page.evaluate(() => window.__utoolsTest.resetCalls())
  await page.getByRole('button', { name: '压缩转义复制' }).click()
  await expect
    .poll(() =>
      page.evaluate(() => window.__utoolsTest.getCalls().copyText[0] || null)
    )
    .toBe('{\\"a\\":1,\\"b\\":2.50,\\"c\\":1e3,\\"text\\":\\"keep  space\\"}')

  expect(errors).toEqual([])
})

test('copies a valid typescript interface with quoted keys', async ({
  page
}) => {
  const errors = collectPageErrors(page)
  await enterJson(page)

  await page
    .locator('#json-input')
    .fill('{"name":"Ada","age":36,"a-b":1,"tags":["x"],"nested":{"k":1}}')

  await page.evaluate(() => window.__utoolsTest.resetCalls())
  await page.getByRole('button', { name: '转 TS 复制' }).click()

  const copied = await copiedText(page)

  expect(copied).toContain('export interface RootObject {')
  expect(copied).toContain('name: string;')
  expect(copied).toContain('age: number;')
  expect(copied).toContain('"a-b": number;')
  expect(copied).toContain('tags: string[];')
  expect(copied).toContain('nested: {')

  expect(errors).toEqual([])
})

test('auto-converts URL params, XML and YAML and evaluates JS filters', async ({
  page
}) => {
  const errors = collectPageErrors(page)
  await enterJson(page)

  const input = page.locator('#json-input')
  await input.fill('name=Ada&role=admin')
  await expect(
    page.getByText('已识别为 URL Params，已自动转为 JSON')
  ).toBeVisible()
  await page.getByRole('button', { name: '格式化' }).click()
  await expect(input).toHaveValue(
    JSON.stringify({ name: 'Ada', role: 'admin' }, null, 2)
  )

  await input.fill('<root id="1"><name>Ada</name></root>')
  await expect(page.getByText('已识别为 XML，已自动转为 JSON')).toBeVisible()
  await page.getByRole('button', { name: '格式化' }).click()
  await expect(input).toHaveValue(
    JSON.stringify({ '@id': '1', name: 'Ada' }, null, 2)
  )

  await input.fill('name: Ada\nactive: true')
  await expect(page.getByText('已识别为 YAML，已自动转为 JSON')).toBeVisible()
  await page.getByRole('button', { name: '格式化' }).click()
  await expect(input).toHaveValue(
    JSON.stringify({ name: 'Ada', active: true }, null, 2)
  )

  await input.fill('{"rows":[{"val":1},{"val":2}]}')
  await page.locator('#json-js-filter').fill('.rows.map(x=>x.val)')
  await expect(page.locator('[data-testid="json-filter-output"]')).toHaveText(
    '[\n  1,\n  2\n]'
  )

  expect(errors).toEqual([])
})

test('exports the relationship graph as a PNG image to the clipboard', async ({
  page
}) => {
  const errors = collectPageErrors(page)
  await enterJson(page)
  await page.locator('#json-input').fill('{"a":{"b":1},"c":[1,2]}')

  const copied = await page.evaluate(async () => {
    let received = null
    window.utools.copyImage = (dataUrl) => {
      received = dataUrl
      return true
    }
    document.querySelector('[data-testid="graph-export-image"]').click()
    await new Promise((resolve) => setTimeout(resolve, 1500))
    return received
  })

  expect(copied).toBeTruthy()
  expect(copied.startsWith('data:image/png;base64,')).toBe(true)
  expect(copied.length).toBeGreaterThan(1000)

  expect(errors).toEqual([])
})

test('keeps the json structure through the xml tool round trip', async ({
  page
}) => {
  const errors = collectPageErrors(page)
  await enterJson(page)

  const original = {
    version: '3.0.0-SNAPSHOT',
    exportTime: 1794906742098,
    active: true,
    description: '',
    emptyList: [],
    emptyObject: {},
    dashboardList: [
      {
        id: 'dashboard-a',
        config: {
          componentList: [{ id: 'c1', chartsetList: [] }]
        }
      }
    ]
  }

  await page.locator('#json-input').fill(JSON.stringify(original))
  await page.evaluate(() => window.__utoolsTest.resetCalls())
  await page.getByRole('button', { name: '转 XML 复制' }).click()
  const copiedXml = await copiedText(page)

  expect(copiedXml).toContain('tb:type="number"')
  expect(copiedXml).toContain('tb:array="1"')

  await page.evaluate((xml) => {
    window.__utoolsTest.enter({
      code: 'xml',
      type: 'text',
      payload: xml,
      from: 'main'
    })
  }, copiedXml)
  await expect(page.locator('.app-shell')).toHaveAttribute('data-route', 'xml')
  await page.locator('#xml-input').fill(copiedXml)

  await page.evaluate(() => window.__utoolsTest.resetCalls())
  await page.getByRole('button', { name: '转 JSON 复制' }).click()
  const copiedJson = await copiedText(page)

  expect(JSON.parse(copiedJson)).toEqual(original)
  expect(errors).toEqual([])
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
    await expect(toolbarButtons).toHaveCount(7)
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
