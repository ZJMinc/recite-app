export interface SyncConfig {
  /** PocketBase 根地址，例如 https://nas.tailnet-name.ts.net */
  baseUrl: string
  email: string
  password: string
}

const CONFIG_KEY = 'jiaojibei:sync-config'
const TOKEN_KEY = 'jiaojibei:sync-token'

function readStorage(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

function writeStorage(key: string, value: string | null) {
  try {
    if (value === null) localStorage.removeItem(key)
    else localStorage.setItem(key, value)
  } catch {
    // 隐私模式下写入失败，退化成「本次会话有效」
  }
}

export function loadConfig(): SyncConfig | null {
  const raw = readStorage(CONFIG_KEY)
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as Partial<SyncConfig>
    if (!parsed.baseUrl || !parsed.email || !parsed.password) return null
    return {
      baseUrl: parsed.baseUrl.replace(/\/+$/, ''),
      email: parsed.email,
      password: parsed.password,
    }
  } catch {
    return null
  }
}

export function saveConfig(config: SyncConfig) {
  writeStorage(
    CONFIG_KEY,
    JSON.stringify({ ...config, baseUrl: config.baseUrl.replace(/\/+$/, '') }),
  )
  // 账号或地址变了，旧 token 立即失效
  writeStorage(TOKEN_KEY, null)
}

export function clearConfig() {
  writeStorage(CONFIG_KEY, null)
  writeStorage(TOKEN_KEY, null)
}

export function isSyncConfigured(): boolean {
  return loadConfig() !== null
}

export function loadToken(): string | null {
  return readStorage(TOKEN_KEY)
}

export function saveToken(token: string | null) {
  writeStorage(TOKEN_KEY, token)
}
