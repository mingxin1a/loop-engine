// ───────────────────────────────────────────────────────────────────────────
// LoopEngine 示例 Workflow —— 硬循环(propose → 独立 judge → 反馈回填 → 重试)
//
// 这是「示例,不是模板」。它演示如何把 loopengine 的迭代闭环落成 Workflow 的真实
// 控制流:循环由代码 `for` 强制(不靠模型自觉),judge 是独立 agent 且用 schema 强制
// 结构化打分,达阈值或用完轮数才停。换任务时请改 RUBRIC / SCORE_SCHEMA / THRESHOLD /
// propose 提示词,别照搬本文件的 ERP 措辞。
//
// 实跑记录(2026-06-30,见 ../examples/erp-summary-design.md):
//   R1/R2 propose 因 API 连接中断产出 null → judge 判 0;R3 一次写成 → judge 判 94 达标。
//   ⇒ 证明了:硬循环控制流、独立裁判、阈值停止、对失败的韧性。
//   ⇒ 未证明:用裁判反馈"打磨"一版真草稿(因前两轮是空的)——该能力由推送文案那次测试证明。
// 用法:Workflow({ scriptPath: '.../example-loop.workflow.js' })
// ───────────────────────────────────────────────────────────────────────────
export const meta = {
  name: 'loopengine-erp-hld',
  description: '目标驱动硬循环:迭代产出一份达标的 ERP 概要设计文档,独立裁判按 rubric 判分,不达标回填反馈再改',
  phases: [{ title: 'Loop', detail: 'propose(撰写/修订) → judge(独立打分) 循环到达标或用完轮数' }],
}

// ── 评分标准(propose 要满足它,judge 按它打分;两边看同一份 rubric)──
const RUBRIC = `ERP 概要设计文档评分标准(总分 100,阈值 ≥ 85 且无致命缺失):
1. 文档结构完整性 (15):标准概要设计章节齐全——引言(目的/范围/术语/参考)、总体设计、功能模块设计、数据设计、接口设计、非功能性设计、部署与运行环境、附录。
2. ERP 领域覆盖 (20):核心模块齐全且职责清晰——采购(P2P)、销售(O2C)、库存、财务(总账/应收/应付/成本)、生产(MRP/BOM)、基础主数据(物料/客户/供应商/组织)。
3. 总体架构 (15):分层架构 + 技术架构 + 部署架构,有架构描述/图说明,技术选型具体合理(非泛泛而谈)。
4. 关键业务流程 (15):至少覆盖 O2C(订单到收款)、P2P(采购到付款)、产销存联动等端到端流程,跨模块协作说清。
5. 数据与接口设计 (15):核心实体/ER 概要 + 主数据 + 内部模块接口 + 外部系统接口(银行/税务/电商/MES)。
6. 非功能性设计 (10):性能、安全、权限角色、可用性、可扩展性,以及 ERP 特有点(多组织/多币种/审计)。
7. 一致性与可落地 (10):各章节自洽、术语统一,能指导后续详细设计,无空话堆砌。`

const SCORE_SCHEMA = {
  type: 'object',
  required: ['total', 'pass', 'criteria', 'feedback'],
  additionalProperties: false,
  properties: {
    total: { type: 'number', description: '0-100 总分' },
    pass: { type: 'boolean', description: 'total>=85 且无致命缺失时为 true' },
    criteria: {
      type: 'array',
      items: {
        type: 'object',
        required: ['name', 'score', 'max', 'note'],
        additionalProperties: false,
        properties: {
          name: { type: 'string' },
          score: { type: 'number' },
          max: { type: 'number' },
          note: { type: 'string' },
        },
      },
    },
    feedback: {
      type: 'array',
      description: '若未达标:逐条、具体、可执行的修订建议;达标则空数组',
      items: { type: 'string' },
    },
  },
}

const THRESHOLD = 85
const MAX_ROUNDS = 3

let doc = null
let lastFeedback = []
const trace = []

phase('Loop')
for (let round = 1; round <= MAX_ROUNDS; round++) {
  // ① propose:撰写(首轮)或按反馈修订(后续轮)。独立的"作者"agent。
  const proposePrompt = round === 1
    ? `你是资深 ERP 解决方案架构师。撰写一份**标准的 ERP 系统概要设计文档**(Markdown,完整成文,不要省略章节)。
目标读者是开发团队,文档要能指导后续详细设计。产出必须满足下面评分标准:

${RUBRIC}

直接输出完整文档正文。`
    : `这是上一版 ERP 概要设计文档:

<<<DOC
${doc}
DOC

独立评审按 rubric 给出了以下**未达标项的修订建议**,请逐条落实,并输出**完整的新版文档**(Markdown,不要只给 diff,不要省略未改动章节):

${lastFeedback.map((f, i) => `${i + 1}. ${f}`).join('\n')}

评分标准(供对照):
${RUBRIC}`

  doc = await agent(proposePrompt, { label: `propose:r${round}`, phase: 'Loop' })

  // propose 失败(终端 API 错误/被 skip → doc 为 null):本轮直接记 0,
  // 省掉一次注定判 0 的 judge 调用,带反馈进下一轮。
  if (!doc) {
    trace.push({ round, total: 0, pass: false, criteria: [], top_issues: ['propose agent 未返回文档(API 中断或被跳过)'] })
    log(`R${round}: propose 未返回 → 记 0 分,进入下一轮`)
    lastFeedback = ['上一轮未能产出文档(API 中断或被跳过),请基于 rubric 从头产出完整文档。']
    continue
  }

  // ② judge:独立评审 agent,只看 rubric + 文档,schema 强制结构化打分。
  const judge = await agent(
    `你是严格、独立的评审。只依据下面 rubric 给这份 ERP 概要设计文档逐项打分。不替作者辩护,有疑义从严。

${RUBRIC}

达标条件:total ≥ ${THRESHOLD} 且无致命缺失(任一核心模块/章节整体缺失即视为致命)。
未达标时,feedback 给出逐条、具体、可执行的修订建议(指明缺什么、加在哪)。

待评文档:
<<<DOC
${doc}
DOC`,
    { label: `judge:r${round}`, phase: 'Loop', schema: SCORE_SCHEMA }
  )

  // judge 可能为 null:终端 API 错误重试耗尽、或用户中途 skip 该 agent。
  // 优雅降级——本轮记 0 分、带一条反馈进下一轮,而不是让 judge.total 抛 TypeError 崩掉整个循环。
  if (!judge) {
    trace.push({ round, total: 0, pass: false, criteria: [], top_issues: ['judge agent 未返回(API 中断或被跳过)'] })
    log(`R${round}: judge 未返回 → 记 0 分,进入下一轮`)
    lastFeedback = ['上一轮独立评审未能返回评分(API 中断或被跳过),请基于 rubric 自查并补全所有章节后重新产出完整文档。']
    continue
  }

  trace.push({ round, total: judge.total, pass: judge.pass, criteria: judge.criteria, top_issues: judge.feedback.slice(0, 4) })
  log(`R${round}: ${judge.total}/100  pass=${judge.pass}  待改 ${judge.feedback.length} 条`)

  if (judge.pass && judge.total >= THRESHOLD) {
    return { status: 'passed', round, score: judge.total, threshold: THRESHOLD, doc, trace }
  }
  lastFeedback = judge.feedback
}

return { status: 'exhausted', rounds: MAX_ROUNDS, score: trace[trace.length - 1].total, threshold: THRESHOLD, doc, trace }
