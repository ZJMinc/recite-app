// 供 Node 脚本使用：把六个科目文件拼成一个数组。
//
// 静态 import 全部科目在构建时会被打成单个 chunk，但这只影响
// scripts/ 下的校验与导入脚本（它们在 Node 里跑），不影响前端产物。

import { CARDS as pedagogy } from '../../src/data/cards/pedagogy.ts'
import { CARDS as edupsy } from '../../src/data/cards/edupsy.ts'
import { CARDS as psychology } from '../../src/data/cards/psychology.ts'
import { CARDS as law } from '../../src/data/cards/law.ts'
import { CARDS as ethics } from '../../src/data/cards/ethics.ts'
import { CARDS as newcur } from '../../src/data/cards/newcur.ts'

export const SEED_CARDS = [...pedagogy, ...edupsy, ...psychology, ...law, ...ethics, ...newcur]

/** 科目 → 内容文件路径（相对仓库根） */
export const SUBJECT_FILES = {
  pedagogy: 'src/data/cards/pedagogy.ts',
  edupsy: 'src/data/cards/edupsy.ts',
  psychology: 'src/data/cards/psychology.ts',
  law: 'src/data/cards/law.ts',
  ethics: 'src/data/cards/ethics.ts',
  newcur: 'src/data/cards/newcur.ts',
}
