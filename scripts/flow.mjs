import { chromium } from 'playwright'
import fs from 'node:fs'

const OUT = '/tmp/shots2'
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
page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message))
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(m.text())
})

async function openDB() {
  return page.evaluate(async () => {
    const db = await new Promise((res, rej) => {
      const r = indexedDB.open('jiaojibei')
      r.onsuccess = () => res(r.result)
      r.onerror = () => rej(r.error)
    })
    const tx = db.transaction('cards', 'readwrite')
    const store = tx.objectStore('cards')
    const all = await new Promise((res) => {
      const r = store.getAll()
      r.onsuccess = () => res(r.result)
    })
    return { count: all.length, types: all.reduce((a, c) => ((a[c.type] = (a[c.type] || 0) + 1), a), {}) }
  })
}

await page.goto('http://127.0.0.1:4173/', { waitUntil: 'networkidle' })
await page.waitForTimeout(600)
console.log('seed info:', await openDB())

// 模拟：把 12 张卡变成"已到期的复习卡"
await page.evaluate(async () => {
  const db = await new Promise((res, rej) => {
    const r = indexedDB.open('jiaojibei')
    r.onsuccess = () => res(r.result)
    r.onerror = () => rej(r.error)
  })
  const tx = db.transaction('cards', 'readwrite')
  const store = tx.objectStore('cards')
  const all = await new Promise((res) => {
    const r = store.getAll()
    r.onsuccess = () => res(r.result)
  })
  const now = Date.now()
  let i = 0
  for (const c of all) {
    if (i >= 12) break
    if (c.type === 'choice' && c.id === 'ep2-c1') continue
    c.state = 2
    c.stability = 12
    c.difficulty = 5
    c.reps = 3
    c.due = now - 3600_000
    store.put(c)
    i++
  }
  // 单独留一张选择题作为第一张到期卡
  const choice = all.find((c) => c.id === 'ep2-c1')
  if (choice) {
    choice.state = 2
    choice.stability = 12
    choice.difficulty = 5
    choice.reps = 3
    choice.due = now - 7200_000
    store.put(choice)
  }
  await new Promise((res) => (tx.oncomplete = res))
})

await page.reload({ waitUntil: 'networkidle' })
await page.waitForTimeout(700)
await page.screenshot({ path: `${OUT}/01-home-due.png`, fullPage: true })
console.log('home:', await page.locator('header').innerText())

await page.getByRole('button', { name: /开始背诵/ }).click()
await page.waitForTimeout(700)
await page.screenshot({ path: `${OUT}/02-choice-front.png`, fullPage: true })

// 选择选项 B（负强化）
await page.getByRole('button', { name: /撤销厌恶刺激/ }).click()
await page.waitForTimeout(500)
await page.screenshot({ path: `${OUT}/03-choice-revealed.png`, fullPage: true })

// 评"记住"
await page.getByRole('button', { name: /记住/ }).click()
await page.waitForTimeout(600)
await page.screenshot({ path: `${OUT}/04-next.png`, fullPage: true })

// 键盘：空格 + 3
await page.keyboard.press('Space')
await page.waitForTimeout(300)
await page.keyboard.press('3')
await page.waitForTimeout(400)

// 退出，查看知识树的卡片详情
await page.goto('http://127.0.0.1:4173/#/browse', { waitUntil: 'networkidle' })
await page.waitForTimeout(400)
await page.locator('input[placeholder*="搜知识点"]').fill('负强化')
await page.waitForTimeout(500)
await page.screenshot({ path: `${OUT}/05-search.png`, fullPage: true })
const result = page.getByText('负强化的含义').first()
if (await result.count()) {
  await result.click()
  await page.waitForTimeout(600)
  await page.screenshot({ path: `${OUT}/06-sheet.png`, fullPage: true })
  await page.getByRole('button', { name: '展开答案' }).click()
  await page.waitForTimeout(400)
  await page.screenshot({ path: `${OUT}/07-sheet-open.png`, fullPage: true })
}

// PWA 离线测试
const swReady = await page.evaluate(async () => {
  if (!('serviceWorker' in navigator)) return 'no-sw-api'
  const reg = await navigator.serviceWorker.ready
  return reg.active ? 'active' : 'none'
})
console.log('service worker:', swReady)
await page.waitForTimeout(1500)
await ctx.setOffline(true)
await page.reload({ waitUntil: 'domcontentloaded' })
await page.waitForTimeout(1200)
const offlineText = await page.locator('body').innerText()
console.log('offline render:', offlineText.slice(0, 60).replace(/\n/g, ' | '))
await page.screenshot({ path: `${OUT}/08-offline.png`, fullPage: true })
await ctx.setOffline(false)

console.log('--- errors ---')
console.log(errors.length ? errors.join('\n') : 'none')
await browser.close()
