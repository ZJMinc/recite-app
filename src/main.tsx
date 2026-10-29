import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import { App } from './App'
import { initDB } from './db'

async function bootstrap() {
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
