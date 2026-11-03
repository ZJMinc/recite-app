import type { SeedCard, SubjectId } from '../types'

/**
 * 内置卡片按科目拆分存放于 src/data/cards/*.ts，按需动态加载。
 *
 * 这样做的原因：卡片是打包进 JS 的，628 张已经约 720 KB。
 * 如果全部静态 import，扩到 1500 张时首屏要下载上兆字节；
 * 拆成科目后，Vite 会为每个科目生成独立 chunk，只加载用到的部分。
 */

export const CARD_SUBJECTS = [
  'pedagogy',
  'edupsy',
  'psychology',
  'law',
  'ethics',
  'newcur',
] as const satisfies readonly SubjectId[]

/**
 * 内置卡片总数。内容变动时由 scripts/import-content.mjs 自动同步。
 * 单独存一个数字，是为了让「关于」这类地方显示数量时不必加载全部内容。
 */
export const BUILTIN_CARD_COUNT = 1000

/** 按科目加载；未知科目返回空数组 */
export async function loadCardsForSubject(subjectId: SubjectId): Promise<SeedCard[]> {
  switch (subjectId) {
    case 'pedagogy':
      return (await import('./cards/pedagogy')).CARDS
    case 'edupsy':
      return (await import('./cards/edupsy')).CARDS
    case 'psychology':
      return (await import('./cards/psychology')).CARDS
    case 'law':
      return (await import('./cards/law')).CARDS
    case 'ethics':
      return (await import('./cards/ethics')).CARDS
    case 'newcur':
      return (await import('./cards/newcur')).CARDS
    default:
      return []
  }
}

/** 全量加载（首次建库、重置、内容校验时使用） */
export async function loadAllCards(): Promise<SeedCard[]> {
  const lists = await Promise.all(CARD_SUBJECTS.map(loadCardsForSubject))
  return lists.flat()
}
