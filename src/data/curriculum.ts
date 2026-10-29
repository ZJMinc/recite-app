import type { Chapter, Subject } from '../types'

export const SUBJECTS: Subject[] = [
  {
    id: 'pedagogy',
    title: '教育学',
    short: '教育学',
    desc: '教育与教育学、课程、教学、德育、班级管理',
    color: '#2e6b58',
  },
  {
    id: 'edupsy',
    title: '教育心理学',
    short: '教心',
    desc: '学习理论、学习动机、迁移、知识学习、品德',
    color: '#8a5a2b',
  },
  {
    id: 'psychology',
    title: '心理学基础',
    short: '心理学',
    desc: '认知过程、记忆遗忘、情绪意志、个性心理',
    color: '#4a5fa5',
  },
  {
    id: 'law',
    title: '教育法律法规',
    short: '法规',
    desc: '教育法、义务教育法、教师法、未成年人保护法',
    color: '#9b3d4e',
  },
  {
    id: 'ethics',
    title: '教师职业道德',
    short: '师德',
    desc: '职业道德规范、职业行为十项准则',
    color: '#6a4c93',
  },
  {
    id: 'newcur',
    title: '新课改',
    short: '新课改',
    desc: '课程改革、核心素养、双减与五项管理',
    color: '#2f7f8a',
  },
]

export const CHAPTERS: Chapter[] = [
  // 教育学
  { id: 'p1', subjectId: 'pedagogy', title: '教育与教育学', order: 1 },
  { id: 'p2', subjectId: 'pedagogy', title: '教育与社会发展', order: 2 },
  { id: 'p3', subjectId: 'pedagogy', title: '教育与人的发展', order: 3 },
  { id: 'p4', subjectId: 'pedagogy', title: '教育目的与教育制度', order: 4 },
  { id: 'p5', subjectId: 'pedagogy', title: '课程', order: 5 },
  { id: 'p6', subjectId: 'pedagogy', title: '教学', order: 6 },
  { id: 'p7', subjectId: 'pedagogy', title: '德育', order: 7 },
  { id: 'p8', subjectId: 'pedagogy', title: '班级管理与班主任工作', order: 8 },
  { id: 'p9', subjectId: 'pedagogy', title: '教师与学生', order: 9 },
  { id: 'p10', subjectId: 'pedagogy', title: '教育研究方法', order: 10 },

  // 心理学
  { id: 'ps1', subjectId: 'psychology', title: '心理学概述', order: 1 },
  { id: 'ps2', subjectId: 'psychology', title: '感知觉与注意', order: 2 },
  { id: 'ps3', subjectId: 'psychology', title: '记忆与遗忘', order: 3 },
  { id: 'ps4', subjectId: 'psychology', title: '思维与想象', order: 4 },
  { id: 'ps5', subjectId: 'psychology', title: '情绪情感与意志', order: 5 },
  { id: 'ps6', subjectId: 'psychology', title: '需要与动机', order: 6 },
  { id: 'ps7', subjectId: 'psychology', title: '能力、气质与性格', order: 7 },
  { id: 'ps8', subjectId: 'psychology', title: '社会心理', order: 8 },

  // 教育心理学
  { id: 'ep1', subjectId: 'edupsy', title: '学生心理发展与教育', order: 1 },
  { id: 'ep2', subjectId: 'edupsy', title: '学习与学习理论', order: 2 },
  { id: 'ep3', subjectId: 'edupsy', title: '学习动机', order: 3 },
  { id: 'ep4', subjectId: 'edupsy', title: '学习迁移', order: 4 },
  { id: 'ep5', subjectId: 'edupsy', title: '知识的学习', order: 5 },
  { id: 'ep6', subjectId: 'edupsy', title: '技能的形成', order: 6 },
  { id: 'ep7', subjectId: 'edupsy', title: '问题解决与创造性', order: 7 },
  { id: 'ep8', subjectId: 'edupsy', title: '学习策略', order: 8 },
  { id: 'ep9', subjectId: 'edupsy', title: '品德发展', order: 9 },
  { id: 'ep10', subjectId: 'edupsy', title: '心理健康与教师心理', order: 10 },

  // 法律法规
  { id: 'l1', subjectId: 'law', title: '教育法', order: 1 },
  { id: 'l2', subjectId: 'law', title: '义务教育法', order: 2 },
  { id: 'l3', subjectId: 'law', title: '教师法', order: 3 },
  { id: 'l4', subjectId: 'law', title: '未成年人保护法', order: 4 },
  { id: 'l5', subjectId: 'law', title: '学生伤害事故处理办法', order: 5 },
  { id: 'l6', subjectId: 'law', title: '其他教育法规', order: 6 },

  // 职业道德
  { id: 'm1', subjectId: 'ethics', title: '教师职业道德规范', order: 1 },
  { id: 'm2', subjectId: 'ethics', title: '新时代职业行为准则', order: 2 },

  // 新课改
  { id: 'c1', subjectId: 'newcur', title: '基础教育课程改革', order: 1 },
  { id: 'c2', subjectId: 'newcur', title: '核心素养与双减', order: 2 },
]

export const CHAPTER_MAP = new Map(CHAPTERS.map((c) => [c.id, c]))
export const SUBJECT_MAP = new Map(SUBJECTS.map((s) => [s.id, s]))

export function chaptersOf(subjectId: string): Chapter[] {
  return CHAPTERS.filter((c) => c.subjectId === subjectId).sort(
    (a, b) => a.order - b.order,
  )
}
