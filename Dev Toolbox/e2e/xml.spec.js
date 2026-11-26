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

async function xmlInputValue(page) {
  return page.getByTestId('xml-editor').getAttribute('data-value')
}

function expectXmlInputValue(page, value) {
  return expect(page.getByTestId('xml-editor')).toHaveAttribute(
    'data-value',
    value
  )
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

async function copiedText(page) {
  await expect
    .poll(() =>
      page.evaluate(() => window.__utoolsTest.getCalls().copyText[0] ?? null)
    )
    .not.toBeNull()

  return page.evaluate(() => window.__utoolsTest.getCalls().copyText[0])
}

test('shows an open XML tree with attributes, comments and CDATA', async ({
  page
}) => {
  const errors = collectPageErrors(page)
  await enterXml(page)

  await expect(page.locator('[data-state="empty"]')).toBeVisible()
  await expect(page.getByRole('tab', { name: '关系图' })).toHaveAttribute(
    'aria-selected',
    'true'
  )

  await page.locator('#xml-input').fill(sample)
  await page.getByRole('tab', { name: '结构树' }).click()

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

  await page.getByRole('button', { name: '格式化' }).click()
  await expectXmlInputValue(page, formattedSample)

  await page.evaluate(() => window.__utoolsTest.resetCalls())
  await page.getByRole('button', { name: '复制 XML' }).click()
  await expect
    .poll(() =>
      page.evaluate(() => window.__utoolsTest.getCalls().copyText[0] || null)
    )
    .toBe(formattedSample)

  expect(errors).toEqual([])
})

test('renders the XML relationship graph and collapses every card', async ({
  page
}) => {
  const errors = collectPageErrors(page)
  await enterXml(page)
  await page.locator('#xml-input').fill(sample)

  const graph = page.locator('[data-testid="xml-graph"]')
  await expect(graph).toBeVisible()
  await expect(graph.locator('.graph-card')).toHaveCount(3)
  await expect(graph.locator('.json-graph__edge')).toHaveCount(2)
  await expect(
    graph.getByRole('group', { name: '元素 卡片 /root', exact: true })
  ).toBeVisible()

  await page.getByRole('button', { name: '全部收起' }).click()
  await expect(graph.locator('.graph-card')).toHaveCount(1)
  await expect(graph.locator('.json-graph__edge')).toHaveCount(0)

  await page.getByRole('button', { name: '全部展开' }).click()
  await expect(graph.locator('.graph-card')).toHaveCount(3)

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
  await expect(page.getByRole('tab', { name: '结构树' })).toBeVisible()
  await expect(page.getByRole('tab', { name: '关系图' })).toBeVisible()
  await expect(page.getByRole('button', { name: '格式化' })).toBeVisible()

  await page.locator('#xml-input').fill('<root><mobile>yes</mobile></root>')
  await page.getByRole('tab', { name: '结构树' }).click()
  await expect(page.locator('[data-testid="xml-tree"]')).toBeVisible()
  await page.getByRole('button', { name: '格式化' }).click()
  await expectXmlInputValue(
    page,
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
  await page.getByRole('button', { name: '格式化' }).click()

  const formatted = await xmlInputValue(page)
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

test('preserves direct CDATA text through production formatting', async ({
  page
}) => {
  const errors = collectPageErrors(page)
  await enterXml(page)

  const input =
    '<root><code><![CDATA[  significant  ]]></code>' +
    '<note><![CDATA[a]]><b>c</b></note></root>'

  await page.locator('#xml-input').fill(input)
  await page.getByRole('button', { name: '格式化' }).click()

  const formatted = await xmlInputValue(page)
  expect(formatted).toBe(
    [
      '<root>',
      '  <code><![CDATA[  significant  ]]></code>',
      '  <note><![CDATA[a]]><b>c</b></note>',
      '</root>'
    ].join('\n')
  )

  const comparison = await page.evaluate(
    ({ inputXml, formattedXml }) => {
      const parse = (xml) => {
        const document = new DOMParser().parseFromString(
          xml,
          'application/xml'
        )
        return {
          error: document.querySelector('parsererror')?.textContent || null,
          code: document.querySelector('code')?.textContent ?? null,
          note: document.querySelector('note')?.textContent ?? null
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
  expect(comparison.output).toMatchObject({
    code: comparison.input.code,
    note: comparison.input.note
  })
  expect(comparison.output.code).toBe('  significant  ')
  expect(comparison.output.note).toBe('ac')
  expect(errors).toEqual([])
})

test('keeps the XML declaration before an xml-stylesheet PI', async ({
  page
}) => {
  const errors = collectPageErrors(page)
  await enterXml(page)

  const declaration = '<?xml version="1.0" encoding="UTF-8"?>'
  const stylesheet =
    '<?xml-stylesheet type="text/xsl" href="style.xsl"?>'
  const input = [
    declaration,
    stylesheet,
    '<root><a>1</a></root>'
  ].join('\n')

  await page.locator('#xml-input').fill(input)
  await page.getByRole('button', { name: '格式化' }).click()

  const formatted = await xmlInputValue(page)
  const lines = formatted.split('\n')
  expect(lines[0]).toBe(declaration)
  expect(lines[1]).toBe(stylesheet)
  expect(formatted.match(/<\?xml\s/g)).toHaveLength(1)

  const reparsed = await page.evaluate((xml) => {
    const document = new DOMParser().parseFromString(xml, 'application/xml')
    return {
      error: document.querySelector('parsererror')?.textContent || null,
      anchorText: document.querySelector('a')?.textContent ?? null,
      stylesheet: Array.from(document.childNodes).some(
        (node) =>
          node.nodeType === Node.PROCESSING_INSTRUCTION_NODE &&
          node.target === 'xml-stylesheet'
      )
    }
  }, formatted)

  expect(reparsed).toEqual({
    error: null,
    anchorText: '1',
    stylesheet: true
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
  await page.getByRole('button', { name: '格式化' }).click()

  const formatted = await xmlInputValue(page)
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

test('hides whitespace-only tree rows while formatting keeps separators', async ({
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
  await page.getByRole('tab', { name: '结构树' }).click()

  const tree = page.locator('[data-testid="xml-tree"]')
  const expandButtons = tree.getByRole('button', { name: '展开 p' })
  const paragraphCount = await expandButtons.count()
  expect(paragraphCount).toBe(4)

  for (let index = 0; index < paragraphCount; index += 1) {
    await tree.getByRole('button', { name: '展开 p' }).first().click()
  }

  expect(await tree.locator('[data-kind="text"]').count()).toBe(0)

  await page.getByRole('button', { name: '格式化' }).click()

  const formatted = await xmlInputValue(page)
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
  await page.getByRole('button', { name: '格式化' }).click()

  const formatted = await xmlInputValue(page)
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
  await page.getByRole('button', { name: '复制 XML' }).click()
  await expect
    .poll(() =>
      page.evaluate(() => window.__utoolsTest.getCalls().copyText[0] || null)
    )
    .toBe(formatted)
  expect(errors).toEqual([])
})

test('converts xml to json and typescript and copies both', async ({
  page
}) => {
  const errors = collectPageErrors(page)
  await enterXml(page)

  const bar = page.locator('[data-testid="tool-action-bar"]')
  await expect(bar).toBeVisible()
  expect(
    await page.locator('[data-action-id]').evaluateAll((elements) =>
      elements.map((element) => element.getAttribute('aria-label'))
    )
  ).toEqual([
    '格式化',
    '折叠全部',
    '展开全部',
    '转 JSON 复制',
    '转 TS 复制',
    '复制 XML'
  ])

  await page
    .locator('#xml-input')
    .fill('<root id="1"><name>Ada</name><tag>a</tag><tag>b</tag></root>')

  await page.evaluate(() => window.__utoolsTest.resetCalls())
  await page.getByRole('button', { name: '转 JSON 复制' }).click()

  const copiedJson = await copiedText(page)

  expect(JSON.parse(copiedJson)).toEqual({
    '@id': '1',
    name: 'Ada',
    tag: ['a', 'b']
  })

  await page.evaluate(() => window.__utoolsTest.resetCalls())
  await page.getByRole('button', { name: '转 TS 复制' }).click()
  await expect
    .poll(() =>
      page.evaluate(() => window.__utoolsTest.getCalls().copyText[0] || null)
    )
    .toContain('export interface RootObject {')

  expect(errors).toEqual([])
})

test('shows line numbers, folds nodes, and keeps the window open for every action', async ({
  page
}) => {
  const errors = collectPageErrors(page)
  await enterXml(page)
  await page.locator('#xml-input').fill(sample)

  const editor = page.getByTestId('xml-editor')
  const lineNumbers = editor.locator('.cm-lineNumbers .cm-gutterElement')
  const foldMarkers = editor.locator('.cm-foldGutter .cm-gutterElement')
  await expect(editor.locator('.cm-lineNumbers')).toBeVisible()
  await expect(editor.locator('.cm-foldGutter')).toBeVisible()
  expect(await lineNumbers.count()).toBeGreaterThan(1)
  expect(await foldMarkers.count()).toBeGreaterThan(0)

  const expandedLineCount = await editor.locator('.cm-line').count()
  await page.locator('[data-action-id="fold-all"]').click()
  await expect
    .poll(() => editor.locator('.cm-line').count())
    .toBeLessThan(expandedLineCount)
  await expect(page.locator('.tool-action-bar__status')).toHaveText(
    '已折叠全部节点'
  )

  await page.locator('[data-action-id="unfold-all"]').click()
  await expect
    .poll(() => editor.locator('.cm-line').count())
    .toBe(expandedLineCount)

  await page.evaluate(() => window.__utoolsTest.resetCalls())
  for (const actionId of [
    'format',
    'fold-all',
    'unfold-all',
    'to-json',
    'to-typescript',
    'to-xml'
  ]) {
    await page.locator(`[data-action-id="${actionId}"]`).click()
  }

  expect(
    await page.evaluate(
      () => window.__utoolsTest.getCalls().hideMainWindow
    )
  ).toEqual([])
  expect(
    await page.evaluate(() => window.__utoolsTest.getCalls().copyText)
  ).toHaveLength(3)
  expect(errors).toEqual([])
})

test('opens an XPath drawer, locates nodes, and selects in both panes', async ({
  page
}) => {
  const errors = collectPageErrors(page)
  await enterXml(page)
  await page.locator('#xml-input').fill(
    [
      '<root>',
      '  <item id="1">Alpha</item>',
      '  <item id="2">Beta</item>',
      '  <meta><count>2</count></meta>',
      '</root>'
    ].join('\n')
  )

  const output = page.locator('.structured-tool__output')
  await expect(output).toHaveCount(0)

  const control = page.locator('.tool-action-bar .expression-input')
  await expect(control.locator('.expression-input__prefix')).toHaveText('XPath')
  await expect(control.locator('svg.tool-action-icon')).toBeVisible()

  const filter = page.locator('#xml-xpath-filter')
  const locate = page.getByRole('button', {
    name: '定位到 XPath 对应节点'
  })
  const editor = page.getByTestId('xml-editor')
  const expandedLineCount = await editor.locator('.cm-line').count()
  await filter.click()
  await page.keyboard.press('Alt+Period')
  await expect(editor.locator('.cm-line')).toHaveCount(expandedLineCount)
  await expect(locate).toBeDisabled()

  await filter.fill('//item[2]')
  await expect(output).toBeVisible()
  await expect(page.getByTestId('xml-filter-output')).toHaveAttribute(
    'data-value',
    /<item id="2">Beta<\/item>/
  )
  await expect(locate).toBeEnabled()
  await locate.click()

  await expect
    .poll(() => page.evaluate(() => window.getSelection()?.toString() ?? ''))
    .toContain('Beta')
  await expect(page.locator('.tool-action-bar__status')).toHaveText(
    '已定位到 XPath 对应节点'
  )

  await filter.fill('count(//item)')
  await expect(page.getByTestId('xml-filter-output')).toHaveAttribute(
    'data-value',
    '2'
  )
  await expect(locate).toBeDisabled()

  await filter.fill('//item[1]/@id')
  await locate.click()
  await expect
    .poll(() => page.evaluate(() => window.getSelection()?.toString() ?? ''))
    .toBe('id="1"')

  await filter.fill('//[')
  await expect(page.getByTestId('xml-filter-output')).toHaveAttribute(
    'data-value',
    /XPath 执行失败/
  )

  await filter.fill('//item[1]')
  await page.locator('#xml-input').click()
  await page.keyboard.press('Control+a')
  expect(
    await page.evaluate(() => window.getSelection()?.toString()?.length ?? 0)
  ).toBeGreaterThan(0)

  await page.locator('#xml-filter-output').click()
  await page.keyboard.press('Control+a')
  expect(
    await page.evaluate(() => window.getSelection()?.toString()?.length ?? 0)
  ).toBeGreaterThan(0)

  await page.getByRole('button', { name: '关闭过滤结果' }).click()
  await expect(output).toHaveCount(0)

  await page.setViewportSize({ width: 320, height: 800 })
  await expectNoPageOverflow(page)
  expect(errors).toEqual([])
})

test('locates entity references and mixed-content text nodes', async ({
  page
}) => {
  const errors = collectPageErrors(page)
  await enterXml(page)
  await page
    .locator('#xml-input')
    .fill('<root><item>x&amp;y<em>z</em>tail</item></root>')

  const filter = page.locator('#xml-xpath-filter')
  const locate = page.getByRole('button', {
    name: '定位到 XPath 对应节点'
  })

  await filter.fill('//item[1]/text()[1]')
  await expect(page.getByTestId('xml-filter-output')).toHaveAttribute(
    'data-value',
    'x&y'
  )
  await locate.click()
  await expect
    .poll(() => page.evaluate(() => window.getSelection()?.toString() ?? ''))
    .toBe('x&amp;y')

  await filter.fill('//item[1]/text()[2]')
  await expect(page.getByTestId('xml-filter-output')).toHaveAttribute(
    'data-value',
    'tail'
  )
  await locate.click()
  await expect
    .poll(() => page.evaluate(() => window.getSelection()?.toString() ?? ''))
    .toBe('tail')

  expect(errors).toEqual([])
})

test('pins the indexed parent path of the top visible XML node', async ({
  page
}) => {
  const errors = collectPageErrors(page)
  await enterXml(page)

  const items = Array.from(
    { length: 200 },
    (_, index) =>
      `  <item id="${index}"><value>v-${index}</value></item>`
  ).join('\n')
  await page.locator('#xml-input').fill(`<root>\n${items}\n</root>`)

  const scrollTo = (scrollTop) =>
    page.evaluate((top) => {
      document.querySelector(
        '[data-testid="xml-editor"] .cm-scroller'
      ).scrollTop = top
    }, scrollTop)
  const sticky = page.locator('[data-testid="code-editor-sticky-path"]')

  await scrollTo(100)
  await expect(sticky).toBeVisible()
  const first = await page.evaluate(() => {
    const scroller = document.querySelector(
      '[data-testid="xml-editor"] .cm-scroller'
    )
    const top = scroller.getBoundingClientRect().top
    const line = Array.from(scroller.querySelectorAll('.cm-line')).find(
      (candidate) => candidate.getBoundingClientRect().bottom > top + 0.5
    )
    return {
      line: line?.textContent ?? '',
      path: document
        .querySelector('[data-testid="code-editor-sticky-path"]')
        ?.textContent?.trim() ?? ''
    }
  })
  const firstId = Number(/<item id="(\d+)"/.exec(first.line)?.[1])
  expect(firstId).not.toBeNaN()
  expect(first.path).toBe(`root › item[${firstId + 1}]`)

  await scrollTo(700)
  await expect(sticky).toBeVisible()
  const second = await page.evaluate(() => {
    const scroller = document.querySelector(
      '[data-testid="xml-editor"] .cm-scroller'
    )
    const top = scroller.getBoundingClientRect().top
    const line = Array.from(scroller.querySelectorAll('.cm-line')).find(
      (candidate) => candidate.getBoundingClientRect().bottom > top + 0.5
    )
    return {
      line: line?.textContent ?? '',
      path: document
        .querySelector('[data-testid="code-editor-sticky-path"]')
        ?.textContent?.trim() ?? ''
    }
  })
  const secondId = Number(/<item id="(\d+)"/.exec(second.line)?.[1])
  expect(secondId).not.toBeNaN()
  expect(second.path).toBe(`root › item[${secondId + 1}]`)
  expect(second.path).not.toBe(first.path)

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
  await page.getByRole('button', { name: '格式化' }).click()

  const formatted = await xmlInputValue(page)
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
  await page.getByRole('button', { name: '复制 XML' }).click()
  await expect
    .poll(() =>
      page.evaluate(() => window.__utoolsTest.getCalls().copyText[0] || null)
    )
    .toBe(formatted)
  expect(errors).toEqual([])
})
