# Stock Market Academy — 架构设计说明（Phase 1–8 完成・Stage 8 基线）

本文档描述当前代码如何组织、状态如何流动、金融计算在哪里发生，以及后续阶段在哪里扩展。Phase 1–3（Stage 1–8）与扩展层（可交易 ETF、6 个专业分支、Sandbox / Challenge、模拟边界、Career Mode、基金经营）均已完成；Phase 4 职业任务 / 投资报告 / 绩效评价 / 证书、Phase 5 基金基准 / 门槛 / 合规 / 运营成本 / 客户预期 / 关键人 / 杠杆与 Phase 6 量化实验室均已补齐。

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
| 数据 | `js/data/` | 40 家虚构公司 + 5 只 ETF、板块定义、历史场景元数据 |
| 市场 | `js/market/` | 价格模拟、交易日历、市场时钟、板块解锁 |
| 交易 | `js/trading/` | 账户数学、订单撮合、组合估值 |
| 教学 | `js/education/` | 课程、章节引擎、练习校验、测验评分、解锁、成就、词典、分支、挑战与职业晋升 |
| 历史 | `js/history/` | 真实日线回放引擎、数据加载、独立账户动作 |
| UI | `js/ui/` | Shell、Router、组件库、Canvas 图表、演示、页面视图 |
| 国际化 | `js/i18n/`、`locales/` | 词典加载、键值查找、占位符、缺失键报告、运行时切换 |
| 测试 | `tests/` | 浏览器内 harness + 逻辑 / 历史 / 双语覆盖测试 |
| 工具 | `tools/` | 历史数据抓取与离线打包 |

## 3. 启动时序

1. `boot()` 渲染启动屏，加载 `locales/zh-CN.json` 与 `locales/en.json`。
2. 读取当前模式存档：职业模式为 `SAVE_KEY = career-v1`，沙盒模式为 `SANDBOX_KEY = sandbox-v1`；校验失败则记录原因并丢弃；成功则 `hydrateState()` 迁移。
3. 无有效存档时：职业模式显示首启引导（`js/ui/onboarding.js`）选择语言并创建游戏；沙盒模式按 `sma.sandbox-config` 创建独立账户，并从职业存档复制课程解锁，不显示引导。
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
challenges { active { id, startDay, startEquity, startTradeSeq, ... }, completed[], failed[] }
career { rank, promotedAtDay, salaryPaidDay, history[] }
sandbox { cash, seed, difficulty, commission }   // 仅沙盒状态
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
- 止损限价单先等待触发，触发后只在限价或更优价格撮合；OCO 同时挂出止盈限价腿与止损腿，共享 `ocoGroup`，先成交的一腿会取消另一腿；`reservedShares` 对同一 OCO 组去重。
- 佣金每笔 $1（可在状态中配置），买入计入成本基础，卖出从 proceeds 扣除并计算已实现盈亏。
- 账户维护 `cash / reservedCash / positions{qty, costBasis} / trades / realizedPnl / feesPaid / dividends`。
- 股息（Phase 2 Unit 5）：`js/market/dividends.js` 在除息日收盘按「持股 × 每股季度股息」入账，写入 `account.dividends` 台账；同一 `(day, ticker)` 不会重复派发。`app.js` 的日结循环调用它，并发出提示。
- 任何下单都先经过：股票是否解锁 → 数量/价格合法性 → 现金或可用股份 → 订单类型；UI 与业务层双重校验。
- 组合估值 `js/trading/portfolio.js` 汇总持仓市值、未实现盈亏、总权益，并记录权益曲线。

## 8. 教学引擎

- `curriculum.js`：Stage 1–8 共三十二个单元，章节由 block 组成（`paragraph / list / callout / formula / example / term / demo / table`），并附带练习定义与测验题库。
- `lessonEngine.js`：记录已读章节；只有读完必要章节 + 通过实战 + 测验 ≥ 80% 才完成单元。
- `practiceEngine.js`：订阅交易 / 查看 / 课程事件，自动验证真实操作（例如完成一次买入、查看订单状态）。
- `quizEngine.js`：评分、补考、跳级测试；答案与解析均来自双语词典。
- `unlockManager.js` + `marketAccess.js`：工具与市场板块按单元完成度解锁；视图与下单接口都校验。
- `progress.js`：XP、等级、成就评估。
- `glossary.js`：66 个术语，含中英名称、定义、示例、所属单元、相关术语。

教学闭环：Learn（章节）→ Demonstrate（Canvas 互动演示）→ Practice（真实操作校验）→ Test（测验）→ Unlock（工具 / 板块 / 下一单元）。

## 9. 国际化

- 键值 JSON：`locales/zh-CN.json`、`locales/en.json`；支持 `{name}` 占位符。
- `loadDictionaries()` 在开发模式 fetch JSON；离线模式读取内联词典。
- `I18n.setLocale()` 即时切换；金额、日期与数字按 locale 格式化，但不换算货币。
- 缺失键回退到英文并记录；测试强制中英键集合一致，并对关键页面做键覆盖断言。

## 10. 图表

`js/ui/chart.js`：

- `LineChart`：网格、坐标轴、面积、成本 / 限价参考线、终点标记；颜色从 CSS 主题变量解析。
- `CandlestickChart`：日线开 / 高 / 低 / 收蜡烛 + 成交量柱 + 参考线，用于交易页 45 / 90 日区间与历史实验室的复权日线图。
- `drawSparkline`：市场列表迷你走势线。
- 全部 Canvas 按 `devicePixelRatio` 缩放，使用 `ResizeObserver` 重绘。

## 11. 历史实战实验室

- `replayEngine.js`：逐日推进、`quoteAt`、`summary`、`tradeAtClose`、基准收益；严格只暴露当前 `dayIndex` 及以前的数据。
- 历史页使用与主游戏一致的 `TICKS_PER_DAY = 8` 时钟：`advanceHistoryTick` 每 tick 推进一次，第 8 个 tick 后收盘并进入下一交易日；`quoteAtTick` / `tradeAtTick` / `summaryAtTick` 使用当前 tick 价格。
- 日内路径由真实日线 OHLC 确定性生成：tick 0 = 开盘，tick 2 / 5 触及最高 / 最低，tick 7 = 收盘；成交量按 tick 累积，因此图表与价格每 tick 变化。
- 初始 `dayIndex = HISTORY_WARMUP = 20`、`tick = 0`，进入场景即有 20 根完整日线 + 当前未完成日线；无交易记录的旧存档也会自动迁移。
- 历史页图表使用 `CandlestickChart`，支持 `5m / 15m / 1h / 1d / 1w / 1mo / 1y` 七种周期；日 / 周 / 月 / 年由真实日线聚合，分钟 / 小时 K 由真实日线 OHLC 确定性展开，界面明确标注为模拟盘中路径。
- 图表只显示当前日期及之前的数据，默认展示全部已发生周期；分钟周期只展示当前交易日。
- 历史页的播放 / 暂停 / 1× / 5× / 20× / 下一交易日控制复用主 `MarketClock`；在主时钟 tick 时，应用根根据当前路由调用历史视图的 `onClockTick`，不会推进虚构市场。
- `dataLoader.js`：优先使用 `window.__SMA_HISTORY_DATA__`（离线内联），否则按场景文件名 fetch。
- `replayActions.js`：把每个场景写入 `state.historyRuns`，与学院账户完全隔离；`ensureRunInStore` 会规范化并迁移旧回放进度。
- 数据：11 个板块、115 个真实代码（2020 / 2022）、75 个代码（2015–2026）、12 个代码（2008）；复权日线，NASDAQ / NYSE 混合并在 UI 标注。

## 12. 测试体系

- `tests/index.html` 浏览器内运行，`tests/harness.js` 提供 suite / test / assert。
- 覆盖：账户数学、订单撮合与预留、市场确定性与无 NaN、板块解锁与迁移、组合、测验评分、学习进度、实战校验、存档校验、历史数据完整性、日内 tick 路径与成交、回放成交与无未来数据、事件时间线、职业晋升与薪资、基金成立与净值、基金仓位 / 现金限制、管理费与高水位业绩报酬、申购赎回、员工薪资、清盘条件、基金排行榜、双语结构与页面键覆盖。
- 当前 168 项全部通过。新增能力必须同时补逻辑测试与双语键。

## 13. Phase 2 实现状态

Phase 2（Stage 2–4，Unit 5–16）已完成，不改变上述分层，只在既有接口上追加：

| 能力 | 扩展位置 | 关键约束 |
| --- | --- | --- |
| 股息 | `market/dividends.js` + `account.dividends` 台账 + 除息日结算 | 已实现（Unit 5）：按持股 × 每股股息入账，不重复发放，不改变成本基础 |
| 股票类型 | `data/stockTypes.js` 标签 + 课程解释 + 交易页展示 | 已实现（Unit 6）：40 家公司全部有且只有一个风格标签 |
| ETF / 分散投资 | `data/etfs.js` 5 只 ETF 与成分权重；`market/marketEngine.js` 按成分篮子合成报价；`market/marketAccess.js` 新增第 6 个板块 | 已实现（Unit 7 解锁）：ETF 价格 = 成分股加权篮子 × 固定 divisor，随成分股逐 tick 变动；可买卖与做空；交易页显示费用率、成分权重与 ETF 资料卡 |
| 复利 | 教学演示 + 组合长期曲线 | 已实现（Unit 8）：复利计算器与长期持有实战任务 |
| 技术指标 | `market/indicators.js` 纯函数（SMA / RSI / 波动 / 回撤） | 已实现（Unit 10）：交易页进阶布局与指标实验室，只读取当前及历史数据 |
| 财报 | `data/financials.js` 由公司基础数据生成利润表 / 资产负债表 / 现金流 | 已实现（Unit 11）：保持资产 = 负债 + 权益，明确标注为教学模拟 |
| 估值 / DCF | `education/valuation.js` + DCF 实验室 | 已实现（Unit 12）：显式预测、终值、净债务、每股价值与情景敏感性 |
| 宏观 | `market/macro.js` 确定性宏观快照 + 宏观情景演示 | 已实现（Unit 13）：`macroSnapshot(day, seed)` 由日期与种子生成实际利率、通胀、增长、失业率与周期状态；纯函数，不写状态，明确标注为教学简化 |
| 组合与风险 | `trading/analytics.js` 由权益曲线与当前持仓计算波动、回撤、HHI 与集中度 | 已实现（Unit 14–15）：`portfolioAnalytics(account, quotes, currentTotal)` 只读取真实净值和持仓；组合页风险分析卡展示年化波动率、最大回撤、暴露、最大单一持仓与 HHI |
| 仓位 sizing | 风险演示 + 仓位公式 | 已实现（Unit 15）：按账户规模 × 风险百分比 ÷ 每股风险（入场价 − 止损价）向下取整计算股数、市值与暴露 |
| 投资策略 | `data/stockTypes.js` 风格篮子 + 策略比较演示 | 已实现（Unit 16）：用当前模拟历史比较成长 / 价值 / 收益 / 周期等权组合在 30 / 60 / 90 日窗口的表现，并标注为模拟而非真实回测 |

新增状态一律进入 `GameState` 并纳入 `validateSave()` / `hydrateState()`；新增 UI 一律通过 actions 修改状态，不允许直接写账户；新增文本一律同时进入中英词典。

## 14. Phase 3 Stage 5 实现状态

高级股票交易已在既有账户模型上扩展，持仓改为带符号数量（多头 qty > 0，空头 qty < 0）。

| 能力 | 扩展位置 | 关键约束 |
| --- | --- | --- |
| 做空 / 平空 | `trading/account.js` 的 `short()` / `cover()`；`orderEngine` 方向扩展为 buy / sell / short / cover | 卖空按股数 × 价格 50% 抵押；空头成本基础为净卖出所得，回补时按比例确认已实现盈亏 |
| 融资与保证金 | `trading/margin.js`：`financingCharge` / `applyFinancing` / `marginStatus` / `forceLiquidation` | 负现金按 8% 年化、252 交易日每日计息；维持保证金为多头 25% + 空头 30%；日结检查并强制平仓、取消未成交订单 |
| 止损 / 追踪止损 | `trading/orderEngine.js`：`placeConditionalOrder`、`processOpenOrders` 的触发与追踪逻辑 | 止损触发后按市价（买价 / 卖价）成交；追踪止损只向有利方向收紧；条件单在下单时只校验方向与股份 |
| 订单簿与滑点 | `market/orderBook.js`：`buildOrderBook` / `estimateMarketFill` | 五档深度由当前报价与 ticker 哈希确定性生成；大单逐档成交、计算加权均价与滑点；仅用于教学与进阶布局展示 |

边界：借券费未单独收取；融资利率与维持保证金比例为固定教学假设；强制平仓在日结执行，不模拟盘中逐笔强平；订单簿不代表真实挂单。

## 15. Phase 3 Stage 6 实现状态

期权为只做多（买入）的欧式合约，权利金与结算都走同一个现金账户。

| 能力 | 扩展位置 | 关键约束 |
| --- | --- | --- |
| 期权定价 | `options/pricing.js`：`blackScholes`、`normCdf`、`payoffAtExpiry` | 固定 4% 无风险利率；Theta 按交易日、Vega / Rho 按 1 个点；到期时只保留内在价值 |
| 期权链 | `options/chains.js`：`buildOptionChain`、`strikeGrid`、`findContract` | 30 / 60 / 90 天、7 档行权价、Call / Put；波动率微笑由公司模拟波动率推导；结果确定性 |
| 持仓与结算 | `options/optionsEngine.js`：`buyOption`、`markOptions`、`closeOption`、`settleOptions` | 每张合约 100 股；买入扣现金，盯市更新当前价值；平仓按模型价值；到期按内在价值现金结算并记入 `optionTrades` |
| 账户权益 | `trading/account.js`：`optionValue` / `optionUnrealizedPnl` 计入 `equity` 与组合汇总 | 期权市值影响保证金检查、组合市值与未实现盈亏；期权不参与股票持仓行 |
| 界面 | `ui/views/options.js` + `#/options` | 期权链、买入票、Greeks、持仓与平仓；未解锁时显示第 21 单元解锁说明 |

边界：Stage 6 只覆盖买入；卖出、指派与多腿策略在 Stage 7 实现；到期按现金内在价值结算；扩展层再加入深度实值期权的近似提前指派；模型价格不是真实报价。

## 16. Phase 3 Stage 7 实现状态

期权持仓扩展为带符号数量：正数为买入，负数为卖出；空头需要担保并在到期时支付内在价值。

| 能力 | 扩展位置 | 关键约束 |
| --- | --- | --- |
| 卖出期权 | `options/optionsEngine.js` 的 `sellOption`、`closeOption`、`settleOptions` | 卖出收取权利金并记负持仓；平仓按模型价值；到期为空头支付内在价值，记为指派 |
| 担保 | `optionCollateral`、`availableOptionCash`、`availableCoveredShares` | 现金担保 Put = 行权价 × 100；持股或买入 Call 可覆盖卖出 Call；裸 Call 收 20% 名义保证金 |
| 策略卡片 | `options/strategies.js`：`STRATEGY_DEFS`、`buildStrategy`、`strategyEconomics`、`strategyPayoff` | 6 种预设：Covered Call、CSP、Bull Call / Bear Put Spread、Long Straddle / Strangle；按当前链解析行权价与到期 |
| 多腿成交 | `executeOptionLegs` + `actions.openOptionStrategy` | 先卖后买以减少现金峰值；任一条腿失败即整体失败；按净支出 / 担保校验 |
| 界面 | `ui/views/options.js` 的卖出模式、策略卡片与策略损益实验室 | 卖出与策略在 Unit 25 第一节后解锁；未解锁时显示提示 |

边界：到期时空头期权按内在价值现金结算；扩展层 `assignEarlyOptions` 对深度实值且 10 天内到期的空头期权做确定性提前指派并按行权价交割股票；价差担保为简化规则；策略仅限预设的 6 种；提前指派不是概率模型。

## 17. Phase 3 Stage 8 实现状态

期货为单只股票合约，保证金占用、每日盯市、到期现金结算；Stage 8 同时收束前期工具。

| 能力 | 扩展位置 | 关键约束 |
| --- | --- | --- |
| 期货合约 | `futures/futuresEngine.js`：`buildFuturesChain`、`futuresPrice` | 30 / 60 / 90 天；每张 100 股；价格 = 现货 × (1 + 4% × 剩余天数 / 365)；保证金 15% |
| 开仓 / 平仓 | `openFuture`、`closeFuture` | 保证金只占用不扣除；平仓释放保证金并按入场价确认已实现盈亏 |
| 每日盯市 | `markFutures`、`applyFuturesVariation`、`settleFutures` | 每个交易日收盘把浮动盈亏转入现金并重置结算价；到期按现货现金结算 |
| 账户权益 | `account.futuresPnl` 计入 `equity` | 盘中浮动盈亏进入权益；结算后归零 |
| 界面 | `ui/views/futures.js` + `#/futures` + 导航项 | 合约链、多空开仓、保证金、持仓与平仓；Unit 29 第一节后解锁 |
| 对冲 / 压力测试 | 演示 `hedge`、`stressTest` + Unit 29–32 课程 | 对冲比率、残余暴露、杠杆冲击与生存检查；毕业任务要求股票 / 期权 / 期货各一笔真实交易 |

边界：期货为现金结算、不交割股票；保证金率与持有成本固定；对冲演示假设完全相关；毕业任务只检查真实交易记录，不评价收益。

## 18. 扩展层（ETF、专业分支、模式与边界）

| 能力 | 扩展位置 | 关键约束 |
| --- | --- | --- |
| 可交易 ETF | `data/etfs.js`、`data/companies.js`、`market/marketEngine.js`、`market/marketAccess.js` | 5 只 ETF、权重合计 100%；ETF 不参与独立随机游走或公司新闻冲击；`etfDivisors` 固定比例，重载后保留累计价格变化；旧存档自动补齐 ETF 报价与历史 |
| ETF 交易页 | `ui/views/trading.js` 的 `etfProfileCard` / `etfHoldingsCard` | 显示费用率、模拟 AUM、成分权重与篮子净值；ETF 不调用公司财报模型；风格演示过滤 ETF |
| 专业分支 | `education/curriculum.js` 的 `BRANCHES / BRANCH_UNITS`、`ui/views/branches.js`、`#/branches` | 6 个可选单元（b1–b6），各 4 节 + 演示 + 实践 + 6 题测验；先修 Unit 32；`optional` 单元不计入核心 32 单元完成度；分支导航在 u32 前显示锁定 |
| 分支术语 | `education/glossary.js` 新增 19 个术语 | NAV、风险预算、归因、夏普、前视偏差、因子模型、过拟合、波动率微笑、Delta 对冲、Gamma Scalping、WACC、Comps、稀释、IPO、收益率曲线、套息、做市商、价格冲击、逆向选择 |
| Sandbox | `core/persistence.js` 的 `SANDBOX_KEY`、`app.js` 的 `appMode` / `readSandboxConfig`、`ui/views/sandbox.js` | 独立存档与账户；可配置资金、种子、难度（佣金）；职业课程解锁复制到沙盒；交易、订单、成就不会写回职业账户；退出 / 重开通过切换存档键并刷新 |
| Challenge | `education/challenges.js`、`ui/views/challenges.js`、`app.js` 的 `checkChallenge` | 6 个目标；启动时记录权益、日期与股票 / 期权 / 期货交易序号；按启动后的活动计算收益、回撤、对冲、收入、波动率与全能目标；完成 XP 只发一次；超时或放弃后清空进行中状态 |
| 模拟边界 | `ui/views/boundaries.js` + `#/boundaries`、期货 / 期权页提示 | 期货现金结算不交割股票；空头期权深度实值 + 10 天内到期时确定性提前指派并按行权价交割股票；历史样本包含幸存者偏差并在界面与文档中明示 |

## 19. Phase 7 Career Mode

职业模式把学习、交易与挑战记录收束为一条八级晋升路线；不新增独立货币，也不重置账户。

| 能力 | 扩展位置 | 关键约束 |
| --- | --- | --- |
| 职级定义 | `education/career.js` 的 `CAREER_RANKS` | 8 级：个人投资者、独立交易员、研究分析师、量化分析师、组合经理、对冲基金经理、基金创始人、金融集团 CEO；每级含薪资与晋升 XP |
| 晋升条件 | `careerProgress` / `requirementProgress` | 条件类型包括单元、交易、查看公司、演示、权益、期权 / 期货交易、挑战、专业分支、XP、投资报告、绩效评价与证书；全部读取真实 `GameState`，没有手动完成按钮 |
| 研究任务 | `refreshResearchTasks` / `acceptResearchTask` | 独立交易员起每天补充 2 个可接取任务，标的来自已解锁股票；任务有截止日、XP 与现金奖励，过期后标记 `expired` |
| 投资报告 | `gradeInvestmentReport` / `submitInvestmentReport` | 报告包含观点 / 信心 / 目标价 / 摘要；评分综合摘要长度、是否查看公司、目标价偏离、趋势一致性、财务单元与量化表述；≥60 分才算合格并发放奖励 |
| 绩效评价 | `evaluateCareerPerformance` | 每 21 个交易日按区间收益、最大回撤、合格报告数与平均报告分给出 A–D 评分与 XP，写入 `evaluations` 并推进 `lastEvalDay` |
| 证书 | `CAREER_CERTIFICATES` / `syncCareerCertificates` | 5 类证书覆盖基础单元、交易技术、研究报告、绩效评价与职级；条件达成后在日结或晋升时自动写入 `career.certificates` |
| 晋升 | `promoteCareer(store, bus)` + `actions.promoteCareer` | 检查最高职级与全部条件；成功后写入 `career.rank`、`promotedAtDay`、`history`，并用 `awardXp(education, 'career:rank:N', xp)` 防重复发奖；广播 `career:promoted` |
| 薪资 | `applyCareerSalary(account, career, day)`，由 `runSimulation` 日结调用 | 每 21 个交易日发放一次；现金与 `account.careerIncome` 同时增加；`salaryPaidDay` 防止同一天重复发放；沙盒模式跳过 |
| 状态与存档 | `gameState.js` / `hydrateState` | `career` 有默认值并在旧存档中补 `rank / promotedAtDay / salaryPaidDay / history / tasks / reports / evaluations / certificates / lastEvalDay / seq`；`normalizeCareer` 对非法 rank、日期、分数与任务状态做钳制 |
| 界面 | `ui/views/career.js` + `#/career` + 导航项 | 当前职级、下一职级条件进度、薪资倒计时、职业收入、总 XP、研究任务板与报告表单、报告 / 评价历史、证书面板与 8 级职业阶梯；仪表盘同步展示证书；沙盒模式显示「不发放薪资」提示 |

边界：薪资是教学用固定金额，不代表真实薪酬；晋升只看可验证的记录，不评价收益率；职业收入计入现金与权益，但不计入交易已实现盈亏。

## 20. 基金经营（Fund Management）

基金经营建立在 Career Mode 之上：职业等级 5（Portfolio Manager）解锁 `/fund`，基金与个人学院账户完全隔离，不共享现金、持仓或订单。

| 能力 | 扩展位置 | 关键约束 |
| --- | --- | --- |
| 解锁与成立 | `fund/fundEngine.js` 的 `fundUnlocked` / `setupFund` | 要求 `career.rank >= 5`；名称 2–24 字符且不能与现有基金重复；同一时间只能有一只活动基金 |
| 基金账户 | `createFundState` 内的独立 `account`（`createAccount`） | AUM 进入基金账户现金；基金交易不写入 `state.account`，个人账户也不受基金盈亏影响 |
| 资料来源 | `FUND_STRATEGIES`、`FUND_RISK_PROFILES`、`FUND_AUM_OPTIONS`、`FUND_BENCHMARKS`、`FUND_HURDLE_OPTIONS` | 4 个策略模板各自给出 `maxPosition` 与 `minCash`；3 档 AUM（25 万 / 100 万 / 500 万）；风险偏好给出杠杆上限与客户预期收益；基准可选市场指数 / MKT ETF / 现金，业绩门槛可选 0% / 2% / 4% |
| 单位净值 | `fundMetrics(fund, state)` | `NAV = 现金 + 持仓市值 - 应付费用`，`NAV per unit = NAV / units`；同时计算所选基准收益、Alpha、杠杆敞口、客户加权预期收益与现金 / 杠杆下限 |
| 交易 | `fundBuy` / `fundSell` | 复用市场 `quotes` 的 ask / bid；每笔固定 $1 交易费；买入前检查单票仓位上限、总敞口杠杆上限与现金 / 杠杆下限，卖出释放现金 |
| 管理费 | `advanceFundDay` 每 `FUND_FEE_INTERVAL = 21` 个交易日 | 年费率 × NAV × (21/252)，从基金账户划入管理公司现金，记录 `managementFees` |
| 业绩报酬 | 同 `advanceFundDay` | 需同时超过高水位与该期业绩门槛（`hurdleRate / 12`）才按超额部分 × 费率计提；计提后更新高水位，平盘或回撤不重复收费 |
| 运营成本 | 同 `advanceFundDay` | 每期计提 `FUND_OPERATING_BASE + 在职员工 × FUND_OPERATING_PER_HEAD`，优先从管理公司现金支付，不足部分进入 `operatingDue` |
| 客户 | `CLIENT_POOL`、`acceptClient`、`settleRedemption` | 客户按当前单位净值申购 / 赎回；申购增加 `units` 与现金、不改变单位净值；赎回按份额折算并支付现金；客户带信任度、风险偏好与预期年化收益，未达预期会降低信任并提高赎回概率 |
| 赎回流程 | `advanceFundDay` | 到期赎回自动结算；新请求有 `FUND_REDEMPTION_DAYS = 5` 持有期与 `FUND_REDEMPTION_GRACE = 3` 宽限；现金不足时记录流动性事件 |
| 团队 | `FUND_ROLES`、`hireEmployee` / `fireEmployee` | 7 类角色各有人名、月薪与能力分；研究员 / 量化 / 宏观 / 风控提供观点，交易员降低费用，运营与合规官提升信任；合规官把无合规风险清盘日从 10 天延后到 15 天；薪资每日计提、每 21 日支付 |
| 风险限制 | `FUND_MAX_DRAWDOWN = 40`、`FUND_MAX_UNPAID_DAYS = 10`、`FUND_MAX_RISK_DAYS = 15`、`FUND_KEY_PERSON_DAYS = 5`、`FUND_MAX_LEVERAGE_DAYS = 3` | 单票上限、现金 / 杠杆下限在交易时拒绝；回撤、连续风险触线、欠薪、关键人员离职、杠杆连续失控与客户全部赎回都会触发清盘 |
| 清盘 | `advanceFundDay` 的 `closeReason` | `drawdown` / `liquidity` / `payroll` / `risk` / `compliance` / `keyPerson` / `leverage` / `redeemed`；清盘后基金变为 `closed`，不再交易或收费，但保留历史与统计，并可直接重新成立 |
| 重开 | `setupFund` | 只拒绝 `active` 基金；`closed` 状态可重新成立，表单标题与按钮切换为「重新成立」 |
| 策略计划 | `fund/fundStrategy.js` 的 `buildFundPlan` / `executeFundPlan` | 用 `strategyRegime` 在已解锁公司上生成目标前 N 名，按 NAV、现金缓冲与仓位上限给出买卖建议；执行仍调用 `fundBuy` / `fundSell`，逐笔报告失败 |
| 收益归因 | `fundAttribution` | 市场（加权 Beta × 基准）+ 板块偏离（组合与基准板块权重差 × 板块收益）+ 现金拖累 + 费用，选股为残差；五项之和等于组合收益 |
| 排行榜 | `fundLeaderboard(fund, state)` + `PEER_FUNDS` | 5 只确定性同类模拟基金作为基准，按累计收益排序；玩家基金标为 `is-player`，不生成随机排名 |
| 界面 | `ui/views/fund.js` + `#/fund` + 导航项 | 未解锁显示职业条件；未成立 / 已清盘显示创建或重新成立表单（含基准、门槛、杠杆）；成立后显示净值卡、净值曲线、风险条（含杠杆敞口）、交易区、客户（含预期收益）、团队、运营（含成本与基准）、排行榜、研究观点与事件日志 |
| 存档 | `gameState.js` 的 `fund` 字段与 `normalizeFund` | 旧存档自动补 `benchmarkId / hurdleRate / leverage / operating / keyPerson` 等默认值；损坏的 `status` / `account` / 数值会被钳制回安全态，避免 NaN 进入存档 |

边界：基金是教学用简化模型，不模拟真实监管、托管、侧袋或投资者适当性；杠杆只提供风险偏好上限与失败条件，不接入真实融资；同类基金收益是确定性基准，不是真实业绩；管理费与业绩报酬仅用于解释费用结构，不代表真实费率谈判。

## 21. 量化实验室（Quant Lab）

量化实验室独立于交易账户：只读取市场历史与公司资料，产出回测结果与因子排名，不修改现金、持仓或订单。

| 能力 | 扩展位置 | 关键约束 |
| --- | --- | --- |
| 解锁 | `ui/views/quant.js` + `isUnitComplete(state, 'u16')` | 完成第 16 单元「投资策略」后解锁 `/quant`；导航显示锁定状态 |
| 策略 | `quant/backtestEngine.js` 的 `QUANT_STRATEGIES` | 买入持有、均线交叉、RSI 均值回归、动量与区间突破 5 个预设；参数有明确上下限 |
| 成交模型 | `runBacktest` | 信号使用截至上一根已完成日线的收盘数据，在下一根日线的开盘价成交；只做多、单一时点一个仓位、每笔固定佣金，不含滑点与融资 |
| 指标 | `equityMetrics` | 累计 / 年化收益、最大回撤、年化波动、夏普、胜率、盈亏比、交易数、持仓时间，并与买入持有基准对照 |
| 交易记录 | `runBacktest` 返回 `trades` | 记录买入 / 卖出索引、价格、股数、盈亏、收益率与持有天数；未平仓交易标为 `open` |
| 因子研究 | `factorResearch` | 对 40 家公司按动量、低波动、趋势或市盈率排序；观察窗口 20–250 日，估值因子只纳入正盈利公司 |
| 参数优化 | `parameterGrid` / `optimizeStrategy` | 内置策略各有参数网格；按夏普 / 累计收益 / 年化 / Calmar 在样本内选优，再用剩余样本外数据运行一次；样本内外差距过大时标记过拟合 |
| 机器学习选股 | `buildMlPanel` / `trainLogisticModel` / `mlStockSelection` | 仅使用价格衍生因子（动量、低波动、趋势）；按日期做横截面标准化，标签为未来窗口收益上半区；用时间切分训练 / 测试，输出准确率、权重与样本外选股组合 |
| 状态 | `gameState.js` 的 `quant` + `normalizeQuantConfig` | 保存模式、标的、策略、参数、资金、佣金、优化目标、样本比例与 ML 窗口；旧存档自动补默认值并钳制非法参数 |
| 界面 | `ui/views/quant.js` + `#/quant` + 导航项 | 三模式切换：回测 / 参数优化 / 机器学习选股；表单、指标卡、权益曲线、交易记录、候选参数表、模型权重、选股表与因子榜单 |

边界：回测只覆盖单标的多头策略，不模拟滑点、税费、融资、做空或组合级约束；参数优化仍可能过拟合，样本外结果只描述这一段历史；ML 模型只使用价格衍生因子、样本有限，不构成选股建议或未来收益预测。

