/// <reference path="../pb_data/types.d.ts" />

// 同步后端的最小集合集。设计取舍见 docs/SYNC.md。
//
//   cards    内容，服务端权威，客户端按 content_ver 增量拉取
//   reviews  只追加的复习日志，(card_id, at, rating) 唯一 → 重复推送天然幂等
//   states   每张卡的 FSRS 状态，按 last_review 做 last-write-wins
//   settings 单条设置记录，按 updated 做 last-write-wins
//
// 单用户部署：users 关闭公开注册，只有手动创建的那个账号能读写。

const AUTHED = "@request.auth.id != ''"

function authed() {
  return {
    listRule: AUTHED,
    viewRule: AUTHED,
    createRule: AUTHED,
    updateRule: AUTHED,
    deleteRule: null,
  }
}

migrate(
  (app) => {
    // ---- 内容：只由管理员写入，客户端只读 ----
    const cards = new Collection({
      type: 'base',
      name: 'cards',
      listRule: AUTHED,
      viewRule: AUTHED,
      createRule: null,
      updateRule: null,
      deleteRule: null,
      fields: [
        { name: 'card_id', type: 'text', required: true },
        { name: 'subject_id', type: 'text', required: true },
        { name: 'chapter_id', type: 'text', required: true },
        { name: 'kp', type: 'text', required: true },
        { name: 'type', type: 'text', required: true },
        { name: 'front', type: 'text' },
        { name: 'back', type: 'text', required: true },
        { name: 'options', type: 'json' },
        { name: 'answer', type: 'json' },
        { name: 'analysis', type: 'text' },
        { name: 'mnemonic', type: 'text' },
        { name: 'confusables', type: 'text' },
        { name: 'importance', type: 'number', min: 1, max: 5 },
        { name: 'tags', type: 'json' },
        // 同样不能标 required：首个内容版本可以是 0
        { name: 'content_ver', type: 'number', min: 0 },
        { name: 'deleted', type: 'bool' },
      ],
      indexes: ['CREATE UNIQUE INDEX `idx_cards_card_id` ON `cards` (`card_id`)'],
    })
    app.save(cards)

    // ---- 复习日志：只增不改 ----
    const reviews = new Collection({
      type: 'base',
      name: 'reviews',
      ...authed(),
      fields: [
        { name: 'card_id', type: 'text', required: true },
        { name: 'at', type: 'number', required: true, min: 1 },
        { name: 'rating', type: 'number', required: true, min: 1, max: 4 },
        // prev_state 合法值包含 0（新卡），而 PB 把 0 当空值判 required，
        // 所以这里不能标 required，只靠取值范围约束。
        { name: 'prev_state', type: 'number', min: 0, max: 3 },
        { name: 'device', type: 'text' },
      ],
      indexes: [
        'CREATE UNIQUE INDEX `idx_reviews_dedupe` ON `reviews` (`card_id`, `at`, `rating`)',
        'CREATE INDEX `idx_reviews_at` ON `reviews` (`at`)',
      ],
    })
    app.save(reviews)

    // ---- FSRS 状态：每卡一行，按 last_review 覆盖 ----
    const states = new Collection({
      type: 'base',
      name: 'states',
      ...authed(),
      fields: [
        { name: 'card_id', type: 'text', required: true },
        { name: 'due', type: 'number' },
        { name: 'stability', type: 'number' },
        { name: 'difficulty', type: 'number' },
        { name: 'scheduled_days', type: 'number' },
        { name: 'learning_steps', type: 'number' },
        { name: 'reps', type: 'number' },
        { name: 'lapses', type: 'number' },
        { name: 'state', type: 'number' },
        { name: 'last_review', type: 'number' },
        { name: 'updated', type: 'number', required: true },
        { name: 'device', type: 'text' },
      ],
      indexes: [
        'CREATE UNIQUE INDEX `idx_states_card_id` ON `states` (`card_id`)',
        'CREATE INDEX `idx_states_updated` ON `states` (`updated`)',
      ],
    })
    app.save(states)

    // ---- 设置：单用户下只有一条 ----
    const settings = new Collection({
      type: 'base',
      name: 'settings',
      ...authed(),
      fields: [
        { name: 'daily_new_limit', type: 'number', min: 0 },
        { name: 'target_retention', type: 'number', min: 0, max: 1 },
        { name: 'exam_date', type: 'text' },
        { name: 'updated', type: 'number', required: true },
        { name: 'device', type: 'text' },
      ],
    })
    app.save(settings)

    // ---- 锁死内置 users：不开放注册，不给匿名读写 ----
    const users = app.findCollectionByNameOrId('users')
    users.createRule = null
    users.listRule = AUTHED
    users.viewRule = AUTHED
    users.updateRule = "@request.auth.id = id"
    users.deleteRule = null
    app.save(users)
  },
  (app) => {
    for (const name of ['settings', 'states', 'reviews', 'cards']) {
      try {
        app.delete(app.findCollectionByNameOrId(name))
      } catch {
        // 已经不存在，忽略
      }
    }
  },
)
