import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import { App } from './App'
import { initDB } from './db'
import { restoreThemeBeforeRender } from './lib/theme'

async function bootstrap() {
  // 先定主题再渲染，避免深色模式下闪白
  restoreThemeBeforeRender()
  try {
    await initDB()
  } catch (err) {
    console.error('初始化本地数据库失败', err)
  }
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
}

void bootstrap()
