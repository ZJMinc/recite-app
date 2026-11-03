/**
 * 听背（TTS）：包一层浏览器 speechSynthesis。
 * 不支持时所有函数安全退化，界面靠 isSpeechSupported() 隐藏入口。
 */

export function isSpeechSupported(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window
}

/** 朗读前清理：展开挖空标记、去掉 markdown 符号与多余空白 */
export function stripForSpeech(text: string): string {
  return text
    .replace(/\{\{([\s\S]*?)\}\}/g, '$1')
    .replace(/[#*_>`~]/g, '')
    .replace(/[ \t\u3000]+/g, ' ')
    .replace(/\n{2,}/g, '\n')
    .trim()
}

export interface SpeakOptions {
  rate?: number
  lang?: string
}

/** 朗读一段文字；每次调用会先取消上一段，避免叠音 */
export function speak(text: string, options: SpeakOptions = {}): boolean {
  if (!isSpeechSupported()) return false
  const clean = stripForSpeech(text)
  if (!clean) return false
  const synth = window.speechSynthesis
  synth.cancel()
  const utterance = new SpeechSynthesisUtterance(clean)
  utterance.lang = options.lang ?? 'zh-CN'
  utterance.rate = options.rate ?? 1
  synth.speak(utterance)
  return true
}

export function stopSpeaking(): void {
  if (isSpeechSupported()) window.speechSynthesis.cancel()
}
