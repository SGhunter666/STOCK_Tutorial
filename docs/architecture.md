# Stock Market Academy — 架构设计说明（Phase 2 基线）

本文档描述当前代码如何组织、状态如何流动、金融计算在哪里发生，以及后续阶段在哪里扩展。Phase 2（Stage 2–4）已完成，未改变分层。

## 1. 技术栈与约束

- 纯前端静态站点：HTML5 / CSS3 / 原生 JavaScript ES Modules，无构建依赖。
- 渲染：DOM + Canvas 2D；数据：JSON；存储：IndexedDB（失败或离线时 localStorage）。
- 无框架、无第三方运行时依赖；本地静态服务器即可运行。
- 离线发布：`tools/build-offline.py` 将 ES Module 图转换为经典脚本注册表并内联 CSS / 词典 / 历史数据，输出单个 HTML。
- 核心约束：确定性种子、可序列化状态、DOM-free 的金融引擎、UI 不直接改写余额、不展示未来数据、不伪装未实现功能。

## 2. 目录与分层

| 层 | 目录 | 职责 |
| --- | --- | --- |
| 应用组合根 | `js/app.js` | 启动、路由、时钟、动作（actions）、存档调度、历史回放联动 |
| 核心 | `js/core/` | 事件总线、状态容器、随机数、格式化、持久化 |
| 数据 | `js/data/` | 40 家虚构公司、板块定义、历史场景元数据 |
| 市场 | `js/market/` | 价格模拟、交易日历、市场时钟、板块解锁 |
| 交易 | `js/trading/` | 账户数学、订单撮合、组合估值 |
| 教学 | `js/education/` | 课程、章节引擎、练习校验、测验评分、解锁、成就、词典 |
| 历史 | `js/history/` | 真实日线回放引擎、数据加载、独立账户动作 |
| UI | `js/ui/` | Shell、Router、组件库、Canvas 图表、演示、页面视图 |
| 国际化 | `js/i18n/`、`locales/` | 词典加载、键值查找、占位符、缺失键报告、运行时切换 |
| 测试 | `tests/` | 浏览器内 harness + 逻辑 / 历史 / 双语覆盖测试 |
| 工具 | `tools/` | 历史数据抓取与离线打包 |

## 3. 启动时序

1. `boot()` 渲染启动屏，加载 `locales/zh-CN.json` 与 `locales/en.json`。
2. 读取存档（`SAVE_KEY`）：校验失败则记录原因并丢弃；成功则 `hydrateState()` 迁移。
3. 无有效存档时显示首启引导（`js/ui/onboarding.js`）：选择语言 → 创建游戏。
4. 创建/恢复 `GameState`，设置语言、主题、减少动画。
5. 建立 `store`、`MarketEngine`，创建 Router 与组件库，挂载 Shell。
6. 订阅状态变化：非 tick 事件刷新 Shell；可持久化事件进入节流保存队列。
7. 启动市场时钟与路由；根据速度暂停或运行。

## 4. 统一状态模型

`GameState`（`js/game/gameState.js`）是唯一可序列化事实来源：

```text
version, createdAt, seed
settings { locale, speed, commission, layout, reducedMotion, theme }
market { day, tick, quotes, history, index, events, news, rngState }
account { cash, initialCash, positions, trades, realizedPnl, feesPaid, equityHistory }
orders[], orderSeq
historyRuns { scenarioId: { dayIndex, account, selectedTicker, ... } }
education { units, xp, achievements, practice, inspections, quizAttempts, ... }
```

- 账户数学使用“价格 × 数量 + 佣金”的整数分思路（内部为浮点，展示层格式化）；所有金额为虚拟美元。
- `SAVE_VERSION = 2`，`validateSave()` 校验市场、账户、订单、教育、设置与价格合理性；`hydrateState()` 补齐缺失字段并迁移旧存档（含 8 → 40 家公司、历史回放默认结构、主题默认值）。

## 5. 状态流与事件

- `createStore` 提供 `get / update / replace / subscribe`；`update` 在 mutator 内修改状态并广播 `meta.type`。
- 视图通过 `viewSubscription(store, view)` 统一订阅：`market:tick` 无成交时走 `view.onTick()` 轻量更新，其余走 `view.render()`。
- `bus` 用于跨模块业务事件：`unit:completed`、`practice:completed`、`achievement:unlocked`、`tool:unlocked`、`progress:updated`、`history:*`。
- 存档节流：普通模式 700 ms，离线模式 1400 ms；行情 tick 不逐 tick 写盘，约 8 秒或成交 / 日结时保存。

## 6. 市场模拟（Level A）

`js/market/marketEngine.js` 为纯函数式、可序列化引擎：

```text
r(t) = drift + beta × marketFactor + sectorFactor + slowCycle + companyNoise + newsShock
P(t+1) = P(t) × exp(r(t))
```

- 每个 tick 更新 `last / bid / ask / high / low / volume / changePct`；点差为价格的固定比例，最低 $0.01。
- 新闻事件（公司级与宏观级）在日界按种子概率触发，并写入 `market.news` 与 `market.events`。
- 每日收盘把当日 OHLCV 追加到 `market.history`（90 日预热 + 运行期），并记录指数历史。
- 所有随机性来自 `seed` + `rngState`，同种子同操作序列可复现；状态保存包含 RNG 状态。
- `HISTORY_DAYS = 90`，用于交易页 K 线与组合曲线；`HISTORY_LIMIT = 220` 限制长期内存。

## 7. 订单与结算

`js/trading/orderEngine.js` + `js/trading/account.js`：

- 市价单按当前卖价（买入）/ 买价（卖出）成交；限价单在价格穿越时成交，否则挂单并预留现金或股份。
- 佣金每笔 $1（可在状态中配置），买入计入成本基础，卖出从 proceeds 扣除并计算已实现盈亏。
- 账户维护 `cash / reservedCash / positions{qty, costBasis} / trades / realizedPnl / feesPaid / dividends`。
- 股息（Phase 2 Unit 5）：`js/market/dividends.js` 在除息日收盘按「持股 × 每股季度股息」入账，写入 `account.dividends` 台账；同一 `(day, ticker)` 不会重复派发。`app.js` 的日结循环调用它，并发出提示。
- 任何下单都先经过：股票是否解锁 → 数量/价格合法性 → 现金或可用股份 → 订单类型；UI 与业务层双重校验。
- 组合估值 `js/trading/portfolio.js` 汇总持仓市值、未实现盈亏、总权益，并记录权益曲线。

## 8. 教学引擎

- `curriculum.js`：Stage 1–4 共十六个单元，章节由 block 组成（`paragraph / list / callout / formula / example / term / demo / table`），并附带练习定义与测验题库。
- `lessonEngine.js`：记录已读章节；只有读完必要章节 + 通过实战 + 测验 ≥ 80% 才完成单元。
- `practiceEngine.js`：订阅交易 / 查看 / 课程事件，自动验证真实操作（例如完成一次买入、查看订单状态）。
- `quizEngine.js`：评分、补考、跳级测试；答案与解析均来自双语词典。
- `unlockManager.js` + `marketAccess.js`：工具与市场板块按单元完成度解锁；视图与下单接口都校验。
- `progress.js`：XP、等级、成就评估。
- `glossary.js`：43 个术语，含中英名称、定义、示例、所属单元、相关术语。

教学闭环：Learn（章节）→ Demonstrate（Canvas 互动演示）→ Practice（真实操作校验）→ Test（测验）→ Unlock（工具 / 板块 / 下一单元）。

## 9. 国际化

- 键值 JSON：`locales/zh-CN.json`、`locales/en.json`；支持 `{name}` 占位符。
- `loadDictionaries()` 在开发模式 fetch JSON；离线模式读取内联词典。
- `I18n.setLocale()` 即时切换；金额、日期与数字按 locale 格式化，但不换算货币。
- 缺失键回退到英文并记录；测试强制中英键集合一致，并对关键页面做键覆盖断言。

## 10. 图表

`js/ui/chart.js`：

- `LineChart`：网格、坐标轴、面积、成本 / 限价参考线、终点标记；颜色从 CSS 主题变量解析。
- `CandlestickChart`：日线开 / 高 / 低 / 收蜡烛 + 成交量柱 + 参考线，用于交易页 45 / 90 日区间。
- `drawSparkline`：市场列表迷你走势线。
- 全部 Canvas 按 `devicePixelRatio` 缩放，使用 `ResizeObserver` 重绘。

## 11. 历史实战实验室

- `replayEngine.js`：逐日推进、`quoteAt`、`summary`、`tradeAtClose`、基准收益；严格只暴露当前 `dayIndex` 及以前的数据。
- `dataLoader.js`：优先使用 `window.__SMA_HISTORY_DATA__`（离线内联），否则按场景文件名 fetch。
- `replayActions.js`：把每个场景写入 `state.historyRuns`，与学院账户完全隔离。
- 数据：11 个板块、115 个真实代码（2020 / 2022）、75 个代码（2015–2026）、12 个代码（2008）；复权日线，NASDAQ / NYSE 混合并在 UI 标注。

## 12. 测试体系

- `tests/index.html` 浏览器内运行，`tests/harness.js` 提供 suite / test / assert。
- 覆盖：账户数学、订单撮合与预留、市场确定性与无 NaN、板块解锁与迁移、组合、测验评分、学习进度、实战校验、存档校验、历史数据完整性、回放成交与无未来数据、事件时间线、双语结构与页面键覆盖。
- 当前 94 项全部通过。新增能力必须同时补逻辑测试与双语键。

## 13. Phase 2 实现状态

Phase 2（Stage 2–4，Unit 5–16）已完成，不改变上述分层，只在既有接口上追加：

| 能力 | 扩展位置 | 关键约束 |
| --- | --- | --- |
| 股息 | `market/dividends.js` + `account.dividends` 台账 + 除息日结算 | 已实现（Unit 5）：按持股 × 每股股息入账，不重复发放，不改变成本基础 |
| 股票类型 | `data/stockTypes.js` 标签 + 课程解释 + 交易页展示 | 已实现（Unit 6）：40 家公司全部有且只有一个风格标签 |
| ETF / 分散投资 | `data/` 新增 ETF 标的与成分权重；`market` 按成分合成报价 | 教学已实现（Unit 7）：用自建 3–5 只股票组合 + 波动率演示；可交易 ETF 产品待后续 |
| 复利 | 教学演示 + 组合长期曲线 | 已实现（Unit 8）：复利计算器与长期持有实战任务 |
| 技术指标 | `market/indicators.js` 纯函数（SMA / RSI / 波动 / 回撤） | 已实现（Unit 10）：交易页进阶布局与指标实验室，只读取当前及历史数据 |
| 财报 | `data/financials.js` 由公司基础数据生成利润表 / 资产负债表 / 现金流 | 已实现（Unit 11）：保持资产 = 负债 + 权益，明确标注为教学模拟 |
| 估值 / DCF | `education/valuation.js` + DCF 实验室 | 已实现（Unit 12）：显式预测、终值、净债务、每股价值与情景敏感性 |
| 宏观 | `market/macro.js` 确定性宏观快照 + 宏观情景演示 | 已实现（Unit 13）：`macroSnapshot(day, seed)` 由日期与种子生成实际利率、通胀、增长、失业率与周期状态；纯函数，不写状态，明确标注为教学简化 |
| 组合与风险 | `trading/analytics.js` 由权益曲线与当前持仓计算波动、回撤、HHI 与集中度 | 已实现（Unit 14–15）：`portfolioAnalytics(account, quotes, currentTotal)` 只读取真实净值和持仓；组合页风险分析卡展示年化波动率、最大回撤、暴露、最大单一持仓与 HHI |
| 仓位 sizing | 风险演示 + 仓位公式 | 已实现（Unit 15）：按账户规模 × 风险百分比 ÷ 每股风险（入场价 − 止损价）向下取整计算股数、市值与暴露 |
| 投资策略 | `data/stockTypes.js` 风格篮子 + 策略比较演示 | 已实现（Unit 16）：用当前模拟历史比较成长 / 价值 / 收益 / 周期等权组合在 30 / 60 / 90 日窗口的表现，并标注为模拟而非真实回测 |

新增状态一律进入 `GameState` 并纳入 `validateSave()` / `hydrateState()`；新增 UI 一律通过 actions 修改状态，不允许直接写账户；新增文本一律同时进入中英词典。
