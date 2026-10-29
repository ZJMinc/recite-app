import { chromium } from 'playwright'
import fs from 'node:fs'

const OUT = '/tmp/shots'
fs.mkdirSync(OUT, { recursive: true })

const browser = await chromium.launch({ channel: 'chrome', headless: true })
const ctx = await browser.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true,
  locale: 'zh-CN',
  timezoneId: 'Asia/Shanghai',
})
const page = await ctx.newPage()

const errors = []
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(m.text())
})
page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message))

await page.goto('http://127.0.0.1:4173/', { waitUntil: 'networkidle' })
await page.waitForTimeout(800)
await page.screenshot({ path: `${OUT}/01-home.png`, fullPage: true })

const start = page.getByRole('button', { name: /开始背诵/ })
console.log('start button:', await start.count(), await start.first().innerText().catch(() => ''))
await start.first().click()
await page.waitForTimeout(900)
await page.screenshot({ path: `${OUT}/02-review-front.png`, fullPage: true })

// 第一张：揭示 + 记住
await page.getByRole('button', { name: '显示答案' }).click()
await page.waitForTimeout(500)
await page.screenshot({ path: `${OUT}/03-review-back.png`, fullPage: true })
await page.getByRole('button', { name: /记住/ }).click()
await page.waitForTimeout(600)
await page.screenshot({ path: `${OUT}/04-next.png`, fullPage: true })

// 第二张：显示答案 + 简单
await page.getByRole('button', { name: '显示答案' }).click()
await page.waitForTimeout(300)
await page.getByRole('button', { name: /简单/ }).click()
await page.waitForTimeout(500)

// 第三张：显示答案 + 忘记
await page.getByRole('button', { name: '显示答案' }).click()
await page.waitForTimeout(300)
await page.getByRole('button', { name: /忘记/ }).click()
await page.waitForTimeout(500)
await page.screenshot({ path: `${OUT}/05-after-again.png`, fullPage: true })

// 快速评完剩余卡片（用键盘）
for (let i = 0; i < 40; i++) {
  const reveal = page.getByRole('button', { name: '显示答案' })
  if ((await reveal.count()) === 0) break
  await reveal.click()
  await page.waitForTimeout(60)
  await page.getByRole('button', { name: /记住/ }).click()
  await page.waitForTimeout(120)
}
await page.waitForTimeout(500)
await page.screenshot({ path: `${OUT}/06-done.png`, fullPage: true })

const bodyText = await page.locator('body').innerText()
console.log('--- done screen text ---')
console.log(bodyText.slice(0, 400))

// 知识树
await page.goto('http://127.0.0.1:4173/#/browse', { waitUntil: 'networkidle' })
await page.waitForTimeout(500)
await page.screenshot({ path: `${OUT}/07-browse.png`, fullPage: true })

// 打开第一个章节
const chap = page.getByRole('button', { name: /教育与教育学/ })
if (await chap.count()) {
  await chap.first().click()
  await page.waitForTimeout(400)
  await page.screenshot({ path: `${OUT}/08-chapter.png`, fullPage: true })
}

// 统计
await page.goto('http://127.0.0.1:4173/#/stats', { waitUntil: 'networkidle' })
await page.waitForTimeout(500)
await page.screenshot({ path: `${OUT}/09-stats.png`, fullPage: true })

// 设置
await page.goto('http://127.0.0.1:4173/#/settings', { waitUntil: 'networkidle' })
await page.waitForTimeout(400)
await page.screenshot({ path: `${OUT}/10-settings.png`, fullPage: true })

console.log('--- console errors ---')
console.log(errors.length ? errors.join('\n') : 'none')

await browser.close()
