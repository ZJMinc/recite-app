import { chromium } from 'playwright'
const URL = 'https://zjminc.github.io/recite-app/'
const b = await chromium.launch({ channel: 'chrome', headless: true })
const c = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true })
const p = await c.newPage()
const errors = []
p.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message))
p.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()) })
await p.goto(URL, { waitUntil: 'networkidle' })
await p.waitForTimeout(1200)
console.log('title:', await p.title())
const text = await p.locator('body').innerText()
console.log('home:', text.split('\n').slice(0, 8).join(' | '))
console.log('cards text:', (text.match(/全库进度[\s\S]{0,30}/) || [''])[0].replace(/\n/g, ' '))
await p.getByRole('button', { name: /开始背诵/ }).click()
await p.waitForTimeout(800)
await p.getByRole('button', { name: '显示答案' }).click()
await p.waitForTimeout(400)
await p.screenshot({ path: '/tmp/shots/live.png', fullPage: true })
console.log('sw:', await p.evaluate(async () => {
  if (!('serviceWorker' in navigator)) return 'n/a'
  const r = await navigator.serviceWorker.ready
  return r.active ? 'active' : 'none'
}))
console.log('errors:', errors.length ? errors.join(' | ') : 'none')
await b.close()
