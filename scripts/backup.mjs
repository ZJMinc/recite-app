import { chromium } from 'playwright'
import fs from 'node:fs'

const OUT = '/tmp/shots3'
fs.mkdirSync(OUT, { recursive: true })
const BACKUP = '/tmp/jiaojibei-backup.json'

const browser = await chromium.launch({ channel: 'chrome', headless: true })
const ctx = await browser.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true,
  locale: 'zh-CN',
  acceptDownloads: true,
})
const page = await ctx.newPage()
const errors = []
page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message))
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(m.text())
})

async function counts() {
  return page.evaluate(async () => {
    const db = await new Promise((res, rej) => {
      const r = indexedDB.open('jiaojibei')
      r.onsuccess = () => res(r.result)
      r.onerror = () => rej(r.error)
    })
    const read = (name) =>
      new Promise((res) => {
        const tx = db.transaction(name, 'readonly')
        const r = tx.objectStore(name).count()
        r.onsuccess = () => res(r.result)
      })
    return { cards: await read('cards'), reviews: await read('reviews'), daily: await read('daily') }
  })
}

await page.goto('http://127.0.0.1:4173/', { waitUntil: 'networkidle' })
await page.waitForTimeout(600)

// 背 3 张，制造学习进度
await page.getByRole('button', { name: /开始背诵/ }).click()
await page.waitForTimeout(500)
for (let i = 0; i < 3; i++) {
  await page.getByRole('button', { name: '显示答案' }).click()
  await page.waitForTimeout(150)
  await page.getByRole('button', { name: /记住/ }).click()
  await page.waitForTimeout(250)
}
console.log('after review:', await counts())
await page.goto('http://127.0.0.1:4173/#/settings')
await page.waitForTimeout(400)

// 导出
const [download] = await Promise.all([
  page.waitForEvent('download'),
  page.getByRole('button', { name: /^导出备份/ }).click(),
])
await download.saveAs(BACKUP)
const raw = JSON.parse(fs.readFileSync(BACKUP, 'utf8'))
console.log('backup:', { cards: raw.cards.length, reviews: raw.reviews.length, daily: raw.daily.length, settings: raw.settings })
await page.screenshot({ path: `${OUT}/01-exported.png`, fullPage: true })

// 重置
await page.getByRole('button', { name: /重置学习进度/ }).click()
await page.waitForTimeout(300)
await page.getByRole('button', { name: '确定清空' }).click()
await page.waitForTimeout(800)
console.log('after reset:', await counts())
await page.screenshot({ path: `${OUT}/02-reset.png`, fullPage: true })

// 导入
await page.setInputFiles('input[type=file]', BACKUP)
await page.waitForTimeout(1200)
console.log('after import:', await counts())
const text = await page.locator('body').innerText()
console.log('settings shows:', text.split('\n').filter((l) => l.includes('条复习记录')).join(' | '))
await page.screenshot({ path: `${OUT}/03-imported.png`, fullPage: true })

// 刷新确认持久化
await page.reload({ waitUntil: 'networkidle' })
await page.waitForTimeout(700)
console.log('after reload:', await counts())

console.log('--- errors ---')
console.log(errors.length ? errors.join('\n') : 'none')
await browser.close()
