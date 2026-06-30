# LoopEngine

一个 **Claude Code skill**:目标驱动的多智能体编排引擎。

你**只给一个可衡量的目标,不写提示词**。引擎自动:

```
目标 ──► 生成/改提示词 ──► 跑出输出 ──► 独立裁判按目标打分 ──► 达标?──┐
            ▲                                                 │否   │是
            └──────────── 把裁判反馈喂回去 ◄────────────────────┘     ▼
                                                                   交付
                          (命中阈值 或 用完预算 才停)
```

核心原则:**裁判必须独立于生成端**——出题、答题、判卷不能是同一个 agent,否则会自评过高、提前收手。

## 它能做什么

- **纵向迭代**:对目标反复 propose → run → judge,收敛到达标。
- **横向分工**:把交付物拆给多个专责 agent(串行 / 并行 / DAG),每段独立质检,最后合成 + 终判。
- **领域无关**:写文档、软件开发、研究报告、数据管线……都从任务自身的接缝现推拆法,**不套模具**。

## 引擎的 12 个维度(正交旋钮,按任务组合)

| 组 | 维度 |
|---|---|
| 结构 | 分解 · 拓扑 · 递归 · 接口契约 |
| 收敛 | 迭代 · 收敛判据 · 反馈路由 |
| 质检 | 校验强度 · 视角多样性 |
| 资源/状态 | 预算分配 · 上下文记忆 |
| 治理 | 自治度 & 人工闸门(L1 报告 → L2 协助 → L3 无人值守) |

> **维度卫生**:只拨会真正改变做法的旋钮,其余留默认。精细化是手段不是目的。

## 安装

把本仓库克隆到 Claude Code 的 skills 目录,目录名即 skill 名:

```bash
# macOS / Linux
git clone https://github.com/<you>/loopengine.git ~/.claude/skills/loopengine

# Windows (PowerShell)
git clone https://github.com/<you>/loopengine.git $env:USERPROFILE\.claude\skills\loopengine
```

之后在 Claude Code 里直接说目标即可触发,或显式 `/loopengine <目标>`。

## 目录结构

```
loopengine/
├── SKILL.md                          # 引擎主体:12 维模型 + 拆分方法 + 迭代闭环
├── references/
│   ├── instances.md                  # 拆分实例参考(示例,不是模板)
│   └── example-loop.workflow.js      # 可运行的硬循环示例(真实跑过)
└── examples/
    └── erp-summary-design.md         # 示例产物:引擎跑出的 ERP 概要设计文档(94/100)
```

`references/example-loop.workflow.js` 是把迭代闭环落成 Workflow **真实控制流**的最小示例:
循环由代码 `for` 强制(不靠模型自觉),judge 是独立 agent 且 schema 强制结构化打分,
达阈值或用完轮数才停。`examples/erp-summary-design.md` 是它一次实跑的产物。

## 用法示例

> 「帮我把这个 prompt 调到能稳定输出合法 JSON,直到 20 个测试用例全过」
> 「写一份 X 报告,文字/表格/图表分开做,最后合成并质检」
> 「做出满足这些需求且测试通过的功能」

只要给的是「可衡量的目标 + 怎么算达标」,引擎就会跑闭环并交付:最终产物 + 裁判评分 + 迭代轨迹。

## 相关工作 / 灵感来源

- [cobusgreyling/loop-engineering](https://github.com/cobusgreyling/loop-engineering) ——
  一个更**宏观的 loop 运维框架**(调度/cadence、worktree、状态文件、成本核算、上线分级、运维 pattern)。
  本项目与之**互补**:它管"让 loop 长期、安全地跑起来",LoopEngine 管"单个 loop 内部怎么拆解、判分、迭代到达标"。
  本项目的"自治度 & 人工闸门"维度、状态持久化(STATE.md)思路即参考自该框架的 L1→L3 分级与状态文件实践。

## License

MIT

