import {
  collectPageErrors,
  expect,
  openApp,
  test
} from './fixtures/utools.js'

test.use({ viewport: { width: 1200, height: 800 } })

const sample = [
  '<?xml version="1.0"?>',
  '<root id="1">',
  '  <item kind="a">Alpha</item>',
  '  <!-- note -->',
  '  <![CDATA[raw <value>]]>',
  '  <empty/>',
  '</root>'
].join('\n')

const formattedSample = [
  '<?xml version="1.0"?>',
  '<root id="1">',
  '  <item kind="a">Alpha</item>',
  '  <!-- note -->',
  '  <![CDATA[raw <value>]]>',
  '  <empty/>',
  '</root>'
].join('\n')

async function enterXml(page, action = null) {
  await openApp(page)
  await page.evaluate((enterAction) => {
    window.__utoolsTest.enter(
      enterAction || {
        code: 'xml',
        type: 'text',
        payload: 'XML 工具',
        from: 'main'
      }
    )
  }, action)
  await expect(page.locator('.app-shell')).toHaveAttribute('data-route', 'xml')
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

test('shows an open XML tree with attributes, comments and CDATA', async ({
  page
}) => {
  const errors = collectPageErrors(page)
  await enterXml(page)

  await expect(page.locator('[data-state="empty"]')).toBeVisible()
  await expect(page.getByRole('tab', { name: '可视化' })).toHaveAttribute(
    'aria-selected',
    'true'
  )

  await page.locator('#xml-input').fill(sample)

  const tree = page.locator('[data-testid="xml-tree"]')
  await expect(tree).toBeVisible()
  const root = tree.getByRole('treeitem').first()
  await expect(root).toHaveAttribute('aria-expanded', 'true')
  await expect(root).toContainText('root')
  await expect(tree.locator('[data-kind="attribute"]')).toContainText('@id')
  await expect(tree.locator('[data-kind="comment"]')).toContainText('note')
  await expect(tree.locator('[data-kind="cdata"]')).toContainText('raw <value>')
  await expect(tree).toContainText('empty')

  await tree.getByRole('button', { name: '展开 item' }).click()
  await expect(tree).toContainText('Alpha')
  await expect(tree).toContainText('@kind')

  await page.getByRole('tab', { name: '格式化' }).click()
  const output = page.locator('.output-row__value')
  await expect(output).toHaveText(formattedSample)

  await page.evaluate(() => window.__utoolsTest.resetCalls())
  await page.getByRole('button', { name: '复制 格式化结果' }).click()
  await expect
    .poll(() =>
      page.evaluate(() => window.__utoolsTest.getCalls().copyText[0] || null)
    )
    .toBe(formattedSample)

  expect(errors).toEqual([])
})

test('shows XML line and column errors and remains usable at 375px', async ({
  page
}) => {
  const errors = collectPageErrors(page)
  await enterXml(page)

  await page.locator('#xml-input').fill('<root>\n  <item></root>')
  const errorNotice = page.locator('.error-notice')
  await expect(errorNotice).toBeVisible()
  await expect(errorNotice).toContainText(/位置：第 2 行，第 \d+ 列/)
  await expect(page.locator('.empty-state')).toHaveCount(0)

  await page.setViewportSize({ width: 375, height: 700 })
  await expectNoPageOverflow(page)
  await expect(page.locator('#xml-input')).toBeVisible()
  await expect(page.getByRole('tab', { name: '可视化' })).toBeVisible()
  await expect(page.getByRole('tab', { name: '格式化' })).toBeVisible()

  await page.locator('#xml-input').fill('<root><mobile>yes</mobile></root>')
  await expect(page.locator('[data-testid="xml-tree"]')).toBeVisible()
  await page.getByRole('tab', { name: '格式化' }).click()
  await expect(page.locator('.output-row__value')).toHaveText(
    '<root>\n  <mobile>yes</mobile>\n</root>'
  )

  expect(errors).toEqual([])
})

test('preserves mixed and preserve-space text in the production formatter', async ({
  page
}) => {
  const errors = collectPageErrors(page)
  await enterXml(page)

  await page.locator('#xml-input').fill(
    '<root><p xml:space="preserve">Hello <b>world</b> <i>again</i>!</p><code xml:space="preserve">  leading and trailing  </code></root>'
  )
  await page.getByRole('tab', { name: '格式化' }).click()

  const output = page.locator('.output-row__value')
  const formatted = await output.textContent()
  expect(formatted).toBe(
    [
      '<root>',
      '  <p xml:space="preserve">Hello <b>world</b> <i>again</i>!</p>',
      '  <code xml:space="preserve">  leading and trailing  </code>',
      '</root>'
    ].join('\n')
  )

  const reparsed = await page.evaluate((xml) => {
    const document = new DOMParser().parseFromString(xml, 'application/xml')
    return {
      error: document.querySelector('parsererror')?.textContent || null,
      paragraph: document.querySelector('p')?.textContent ?? '',
      code: document.querySelector('code')?.textContent ?? ''
    }
  }, formatted)

  expect(reparsed).toEqual({
    error: null,
    paragraph: 'Hello world again!',
    code: '  leading and trailing  '
  })
  expect(errors).toEqual([])
})

test('preserves newline-plus-indent mixed text after production formatting', async ({
  page
}) => {
  const errors = collectPageErrors(page)
  await enterXml(page)

  const input = [
    '<root>',
    '  <p id="newline-space"><b>Hello</b>',
    ' <i>world</i></p>',
    '  <p id="newline-indent"><b>Hello</b>',
    '  <i>world</i></p>',
    '</root>'
  ].join('\n')

  await page.locator('#xml-input').fill(input)
  await page.getByRole('tab', { name: '格式化' }).click()

  const formatted = await page.locator('.output-row__value').textContent()
  expect(formatted).toContain('<b>Hello</b>\n <i>world</i>')
  expect(formatted).toContain('<b>Hello</b>\n  <i>world</i>')

  const comparison = await page.evaluate(
    ({ inputXml, formattedXml }) => {
      const parse = (xml) => {
        const document = new DOMParser().parseFromString(
          xml,
          'application/xml'
        )
        return {
          error: document.querySelector('parsererror')?.textContent || null,
          paragraphs: Array.from(document.querySelectorAll('p')).map(
            (paragraph) => paragraph.textContent
          )
        }
      }

      return {
        input: parse(inputXml),
        output: parse(formattedXml)
      }
    },
    { inputXml: input, formattedXml: formatted }
  )

  expect(comparison.input.error).toBeNull()
  expect(comparison.output.error).toBeNull()
  expect(comparison.output.paragraphs).toEqual(
    comparison.input.paragraphs
  )
  expect(comparison.output.paragraphs).toEqual([
    'Hello\n world',
    'Hello\n  world'
  ])
  expect(errors).toEqual([])
})

test('preserves empty-inline separators through production tree and formatting', async ({
  page
}) => {
  const errors = collectPageErrors(page)
  const input =
    '<root>' +
    '<p><b></b>\n <i></i></p>' +
    '<p><b></b>\n  <i></i></p>' +
    '<p><b></b>\r\n <i></i></p>' +
    '<p><b></b>\n\t<i></i></p>' +
    '</root>'
  const normalizedSeparators = ['\n ', '\n  ', '\n ', '\n\t']

  await enterXml(page, {
    code: 'xml',
    type: 'over',
    payload: input,
    from: 'main'
  })

  const tree = page.locator('[data-testid="xml-tree"]')
  const expandButtons = tree.getByRole('button', { name: '展开 p' })
  const paragraphCount = await expandButtons.count()
  expect(paragraphCount).toBe(4)

  for (let index = 0; index < paragraphCount; index += 1) {
    await tree.getByRole('button', { name: '展开 p' }).first().click()
  }

  const treeTextValues = await tree
    .locator('[data-kind="text"] .tree-node__value')
    .allTextContents()
  expect(treeTextValues).toEqual(normalizedSeparators)

  await page.getByRole('tab', { name: '格式化' }).click()

  const formatted = await page.locator('.output-row__value').textContent()
  expect(formatted).toContain('<p><b/>\n <i/></p>')
  expect(formatted).toContain('<p><b/>\n  <i/></p>')
  expect(formatted).toContain('<p><b/>\n\t<i/></p>')

  const comparison = await page.evaluate(
    ({ inputXml, formattedXml }) => {
      const parse = (xml) => {
        const document = new DOMParser().parseFromString(
          xml,
          'application/xml'
        )
        return {
          error: document.querySelector('parsererror')?.textContent || null,
          paragraphs: Array.from(document.querySelectorAll('p')).map(
            (paragraph) => paragraph.textContent
          )
        }
      }

      return {
        input: parse(inputXml),
        output: parse(formattedXml)
      }
    },
    { inputXml: input, formattedXml: formatted }
  )

  expect(comparison.input.error).toBeNull()
  expect(comparison.output.error).toBeNull()
  expect(comparison.output.paragraphs).toEqual(
    comparison.input.paragraphs
  )
  expect(comparison.output.paragraphs).toEqual(normalizedSeparators)
  expect(errors).toEqual([])
})

test('keeps quote-bearing DOCTYPE output parsable and copyable', async ({
  page
}) => {
  const errors = collectPageErrors(page)
  await enterXml(page)

  await page.locator('#xml-input').fill(
    '<!DOCTYPE root SYSTEM \'a"b\'><root/>'
  )
  await page.getByRole('tab', { name: '格式化' }).click()

  const output = page.locator('.output-row__value')
  const formatted = await output.textContent()
  expect(formatted).toBe('<!DOCTYPE root SYSTEM \'a"b\'>\n<root/>')

  const reparsed = await page.evaluate((xml) => {
    const document = new DOMParser().parseFromString(xml, 'application/xml')
    return {
      error: document.querySelector('parsererror')?.textContent || null,
      systemId: document.doctype?.systemId ?? null
    }
  }, formatted)

  expect(reparsed).toEqual({ error: null, systemId: 'a"b' })

  await page.evaluate(() => window.__utoolsTest.resetCalls())
  await page.getByRole('button', { name: '复制 格式化结果' }).click()
  await expect
    .poll(() =>
      page.evaluate(() => window.__utoolsTest.getCalls().copyText[0] || null)
    )
    .toBe(formatted)
  expect(errors).toEqual([])
})

test('ignores DOCTYPE-like comment and PI text in production formatting', async ({
  page
}) => {
  const errors = collectPageErrors(page)
  await enterXml(page)

  const input = [
    '<!-- fake <!DOCTYPE root SYSTEM "from-comment"> -->',
    '<?probe fake <!DOCTYPE root PUBLIC "from-pi" "from-pi-system">?>',
    '<!DOCTYPE root PUBLIC "pub\'id" \'sys"id\'><root/>'
  ].join('\n')

  await page.locator('#xml-input').fill(input)
  await page.getByRole('tab', { name: '格式化' }).click()

  const formatted = await page.locator('.output-row__value').textContent()
  expect(formatted).toContain(
    '<!DOCTYPE root PUBLIC "pub\'id" \'sys"id\'>'
  )
  expect(formatted).toContain('from-comment')
  expect(formatted).toContain('from-pi')

  const reparsed = await page.evaluate((xml) => {
    const document = new DOMParser().parseFromString(xml, 'application/xml')
    return {
      error: document.querySelector('parsererror')?.textContent || null,
      publicId: document.doctype?.publicId ?? null,
      systemId: document.doctype?.systemId ?? null
    }
  }, formatted)

  expect(reparsed).toEqual({
    error: null,
    publicId: "pub'id",
    systemId: 'sys"id'
  })

  await page.evaluate(() => window.__utoolsTest.resetCalls())
  await page.getByRole('button', { name: '复制 格式化结果' }).click()
  await expect
    .poll(() =>
      page.evaluate(() => window.__utoolsTest.getCalls().copyText[0] || null)
    )
    .toBe(formatted)
  expect(errors).toEqual([])
})
