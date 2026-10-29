import { chromium } from 'playwright'
const b = await chromium.launch({ channel: 'chrome', headless: true })
const c = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true })
const p = await c.newPage()
await p.goto('http://127.0.0.1:4173/', { waitUntil: 'networkidle' })
await p.waitForTimeout(700)
await p.screenshot({ path: '/tmp/shots/final-home.png' })
await b.close()
