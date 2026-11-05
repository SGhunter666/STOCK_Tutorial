# Stock Market Academy — 架构设计说明（Phase 1–13 完成・Stage 13 基线）

本文档描述当前代码如何组织、状态如何流动、金融计算在哪里发生，以及后续阶段在哪里扩展。Phase 1–3（Stage 1–8）与扩展层（可交易 ETF、6 个专业分支、Sandbox / Challenge、模拟边界、Career Mode、基金经营）均已完成；Phase 4 职业任务 / 投资报告 / 绩效评价 / 证书、Phase 5 基金基准 / 门槛 / 合规 / 运营成本 / 客户预期 / 关键人 / 杠杆、Phase 6 量化实验室、Phase 7 参数优化与 ML 选股、Phase 8 基金策略归因 / 宏观世界 / 债券与外汇、Phase 9 商品与加密资产 / 基金自动再平衡 / 宏观事件冲击 / ML 自动调参与另类数据因子、Phase 10 基金仓位参数研究 / 多因子回归 / 双隐层网络 / 资金流因子、Phase 11 盘中 tick 分时 / 可选外部行情通道 / 组合优化器 / 细粒度归因 / 分析师修正因子、Phase 12 多因子风险模型 / 压力测试 / 交易成本与冲击滑点、Phase 13 简化税费档案 / 征费 / 资本利得税 / 税后计划成本均已补齐。

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
- 覆盖：账户数学、订单撮合与预留、市场确定性与无 NaN、板块解锁与迁移、组合、测验评分、学习进度、实战校验、存档校验、历史数据完整性、日内 tick 路径与成交、回放成交与无未来数据、事件时间线、职业晋升与薪资、基金成立与净值、基金仓位 / 现金限制、管理费与高水位业绩报酬、申购赎回、员工薪资、清盘条件、基金排行榜、基金自动再平衡 / 仓位参数研究 / 组合优化 / 多因子风险与压力测试 / 交易成本与滑点 / 简化税费档案与资本利得税 / 持仓贡献与因子暴露、商品 / 加密资产定价与交易、宏观事件冲击、多因子回归、ML 自动调参 / 双隐层网络 / 资金流 / 分析师修正因子、盘中 tick 分时、外部行情解析与失败回退、英国 2026/27 CGT / 同日 / 30 天 / Section 104 匹配 / 股息税档 / ISA / SDRT / FX / 边界、模拟交易所 50 家公司 / 1 秒时钟 / 9 个周期聚合 / 订单簿部分成交 / 账本 / 确定性与存档恢复、双语结构与页面键覆盖。
- 当前 313 项全部通过。新增能力必须同时补逻辑测试与双语键。

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
| 自动再平衡 | `autoRebalanceFund` + `app.js` 日结 | 仅在基金 active 且 `autoRebalance` 开启时运行；离上次自动日期不足 `rebalanceDays` 则跳过；到期后按同一计划与风控执行，更新 `lastAutoDay`，无交易时也记录尝试日；通过 toast 报告成交 / 失败笔数 |
| 仓位参数研究 | `researchFundPlan` / `FUND_PLAN_RESEARCH_GRID` | 固定当前策略与参数，用 100 组「持仓数 / 现金缓冲 / 间隔」在样本内选优，再以剩余样本外数据验证；输出最优 / 当前配置对比、过拟合标记与候选表；不修改基金 |
| 组合优化器 | `fund/optimizer.js` 的 `optimizeFundPortfolio` / `buildFundWeightPlan` | 从已解锁公司的日收益估计收缩协方差；支持最小方差、逆波动率风险平价与均值方差；权重受单票上限与现金下限约束，输出目标权重与预期收益 / 波动；`buildFundWeightPlan` 将权重转换为买卖建议，执行仍走 `fundBuy` / `fundSell` |
| 收益归因 | `fundAttribution` | 市场（加权 Beta × 基准）+ 板块偏离（组合与基准板块权重差 × 板块收益）+ 现金拖累 + 费用，选股为残差；五项之和等于组合收益；另返回逐持仓权重 / 收益 / 组合贡献，以及 Beta / 动量 / 波动 / P/E 加权暴露 |
| 多因子风险 | `fund/riskModel.js` 的 `buildFundRiskModel` / `portfolioFactorRisk` | 市场 Beta、规模、价值、动量、低波动暴露；因子收益由当前横截面的多空组合构造，协方差收缩；输出因子 / 特异性风险贡献与四类压力情景；当前截面构造属于教学近似 |
| 交易成本 | `fund/costModel.js` 的 `estimateTradeCost` / `targetBuyQuantity` / `summarizePlanCosts` | 佣金、买卖价差与基于成交量参与率的冲击估计；计划按冲击调整下单数量，执行时以 `slippagePct` 调整成交价 |
| 税费档案 | `fund/taxProfiles.js` + `fundEngine.js` / `trading/account.js` | 三种简化档案（不征税 / 15% 资本利得 / 25% + 0.1% 征费）；买入征费计入成本基础，卖出征费与正收益资本利得税从净现金扣除，累计到 `account.taxesPaid`；真实地区税制与申报未建模 |
| 排行榜 | `fundLeaderboard(fund, state)` + `PEER_FUNDS` | 5 只确定性同类模拟基金作为基准，按累计收益排序；玩家基金标为 `is-player`，不生成随机排名 |
| 界面 | `ui/views/fund.js` + `#/fund` + 导航项 | 未解锁显示职业条件；未成立 / 已清盘显示创建或重新成立表单（含基准、门槛、杠杆）；成立后显示净值卡、净值曲线、风险条（含杠杆敞口）、交易区、策略计划（含成本摘要）/ 仓位参数研究 / 组合优化器 / 多因子风险与压力测试、逐持仓贡献与因子暴露、客户（含预期收益）、团队、运营（含成本与基准）、排行榜、研究观点与事件日志 |
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
| 因子研究 | `factorResearch` | 对 40 家公司按动量、低波动、趋势、市盈率、新闻情绪、新闻情绪变化、成交量关注度、资金流强度或分析师修正排序；观察窗口 20–250 日，估值因子只纳入正盈利公司；资金流优先使用当前交易日盘中 tick 成交量，无盘中数据时回退日线；分析师修正累计 upgrade / downgrade 新闻冲击 |
| 参数优化 | `parameterGrid` / `optimizeStrategy` | 内置策略各有参数网格；按夏普 / 累计收益 / 年化 / Calmar 在样本内选优，再用剩余样本外数据运行一次；样本内外差距过大时标记过拟合 |
| 多因子回归 | `factorRegression` / `rankCorrelation` / `solveLinearSystem` | 把 `buildMlPanel` 的横截面因子与前瞻收益做池化 OLS（含截距，极小岭项处理零方差列）；输出各因子系数、平均 Rank IC、截距与 R²；与选股模型共用同一份日期映射，避免前视 |
| 机器学习选股 | `buildMlPanel` / `trainLogisticModel` / `trainMlpModel` / `trainDeepMlpModel` / `mlStockSelection` / `tuneMlpHyperparameters` / `tuneDeepMlpHyperparameters` | 使用动量、低波动、趋势、新闻情绪、新闻情绪变化、分析师修正、成交量与资金流八类因子；按日期做横截面标准化，标签为未来窗口收益上半区；模型可选逻辑回归、MLP 或双隐层网络；神经网络可自动搜索隐藏单元 / 双隐层结构与训练轮数，验证集从训练集内部切出，样本外测试不参与调参；输出准确率、权重 / 特征重要度与样本外选股组合 |
| 状态 | `gameState.js` 的 `quant` + `normalizeQuantConfig` | 保存模式、标的、策略、参数、资金、佣金、优化目标、样本比例、ML 窗口、模型类型与自动调参开关；旧存档自动补默认值并钳制非法参数 |
| 界面 | `ui/views/quant.js` + `#/quant` + 导航项 | 四模式切换：回测 / 参数优化 / 多因子回归 / 机器学习选股；表单、指标卡、权益曲线、交易记录、候选参数表、回归溢价与 IC 表、模型权重、选股表与因子榜单 |

边界：回测只覆盖单标的多头策略，不模拟滑点、税费、融资、做空或组合级约束；参数优化仍可能过拟合，样本外结果只描述这一段历史；ML 模型使用价格、新闻、成交量、资金流与分析师修正因子，样本有限，神经网络只是小规模教学网络，自动调参也只在小网格内搜索，不构成选股建议或未来收益预测；因子回归只描述样本内平均关系，零方差列会被岭项压到接近 0。

## 22. 宏观世界（Macro World）

宏观世界在 `market/macro.js` 上扩展确定性指标、经济日历与全球联动；所有数值只依赖种子与交易日，不需要新增存档字段。

| 能力 | 扩展位置 | 关键约束 |
| --- | --- | --- |
| 指标 | `macroWorld(day, seed)` | 在既有政策利率 / 通胀 / 增长 / 失业 / 实际利率 / 周期状态上补充消费者信心、2Y / 10Y 收益率、曲线陡峭度、信用利差与风险偏好 |
| 市场漂移 | `MarketEngine.tick` 调用 `macroSnapshot` | 增长高于趋势、实际利率与通胀偏低时给予极小的正漂移；不改变随机项与个股 / 行业逻辑，保持同种子确定性 |
| 经济日历 | `macroCalendar(day, seed)` | CPI / 非农 / GDP / PMI / 央行议息按 21 个交易日循环；使用确定性预期与意外值，计算预期差与教学用市场影响；事件公布日由 `MarketEngine._applyCalendarShock` 将冲击按 Beta 传导到个股，并写入带 `calendar` 标记的新闻 |
| 全球联动 | `globalMarkets(state, day, seed)` | 美国指数直接使用 `market.index`，欧洲 / 亚洲 / 新兴市场按联动系数与本地周期派生，展示指数、日变动与耦合度 |
| 界面 | `ui/views/macro.js` + `#/macro` + 导航项 | Unit 13 后解锁；展示指标卡、周期解释、90 日增长曲线、经济日历与全球市场表 |

边界：宏观指标、事件、预期差与联动均为教学模拟，不是实时数据、官方统计或预测模型；事件冲击是确定性的教学传导，按 Beta 放大且单股冲击封顶 ±4%，不代表真实事件研究结果。

## 23. 多资产：债券、外汇、商品与加密资产

多资产共用学院现金账户和权益曲线；价格全部由宏观曲线、种子与交易日决定，扩展 `account.bonds / fx / commodities / crypto`，并在 `gameState.hydrateState` 为旧存档补齐空数组与已实现盈亏字段。

| 能力 | 扩展位置 | 关键约束 |
| --- | --- | --- |
| 债券定价 | `assets/bonds.js` 的 `bondPrice` | 8 只国债 / 公司债 / 市政债；政府曲线在 2Y 与 10Y 之间插值，30Y 外推，公司债加信用利差；半年度票息现金流贴现 |
| 债券交易 | `buyBond` / `sellBond` | 按当前价格成交，每笔佣金进入现金账；成本基础按比例分摊，卖出记录已实现盈亏 |
| 票息与盯市 | `applyBondCoupons` / `markBonds` | 每 63 个交易日支付一次季度票息；日终按新收益率重估 `currentPrice` |
| 外汇报价 | `assets/fx.js` 的 `fxRate` / `fxRates` | 4 个货币对，报价为 1 单位外币的美元价格；实际利率与本地周期驱动，日终重估 |
| 外汇交易 | `buyFx` / `sellFx` | 单位整数、现金约束、成本基础分摊、已实现盈亏；`markFx` 更新 `currentRate` |
| 商品定价 | `assets/commodities.js` 的 `commodityPrice` | 黄金 / 白银 / 原油 / 铜 / 天然气；金属受实际利率与风险偏好驱动，能源与铜受增长驱动；价格由日期的多周期正弦与宏观倾斜确定 |
| 商品交易 | `buyCommodity` / `sellCommodity` / `markCommodities` | 整数份、现金约束、成本基础分摊、日终盯市；卖出写入 `commodityRealized` |
| 加密资产 | `assets/crypto.js` 的 `cryptoPrice` / `buyCrypto` / `sellCrypto` | BTC / ETH / SOL；支持 1e-6 单位精度、现金约束、成本基础分摊与已实现盈亏；风险偏好与实际利率驱动，波动显著高于股票 |
| 权益 | `trading/account.js` 的 `equity` | 现金 + 股票 + 期权 + 期货 + 债券 + 外汇 + 商品 + 加密资产市值；日终 `snapshotEquity` 自动记录 |
| 结算挂接 | `app.js` 日结 | 期货结算后依次执行债券盯市 / 票息、外汇重估、商品盯市与加密资产盯市，再写入权益曲线 |
| 界面 | `ui/views/multiasset.js` + `#/multiasset` + 导航项 | Unit 13 后解锁；债券 / 外汇 / 商品 / 加密资产的行情、持仓、买卖与盈亏表；共用现金 |

边界：债券模型忽略应计利息、违约、赎回条款与真实交易场所；外汇是美元计价的合成敞口，不模拟真实多币种现金账户、点差或隔夜掉期；商品与加密资产是确定性教学定价，不模拟合约展期、资金费率、托管或链上风险；所有价格均为教学模拟。

## 24. Phase 9 变更摘要

| 方向 | 主要改动 |
| --- | --- |
| 商品与加密资产 | 新增 `assets/commodities.js` 与 `assets/crypto.js`，账户新增 `commodities / commodityRealized / crypto / cryptoRealized`，权益与日终盯市接入；多资产页新增两组行情 / 持仓卡 |
| 基金自动再平衡 | `fundStrategy` 新增 `autoRebalance` / `lastAutoDay` 与 `autoRebalanceFund`，日结在基金 active 时按间隔执行并 toast；基金策略表单新增开关与最近自动日期 |
| 宏观事件冲击 | `MarketEngine._applyCalendarShock` 在 21 日事件发布日把预期差按 Beta 传导到个股并写入新闻；单股冲击封顶 ±4%；宏观页说明更新 |
| ML 自动调参与另类数据 | `ML_FACTORS` 增至 6 类（新增新闻情绪变化、成交量关注度）；因子研究增至 7 类；`tuneMlpHyperparameters` 在训练集内部切验证集搜索隐藏单元 / 轮数，测试集不参与调参；量化 UI 新增自动调参开关与验证结果 |
| 测试与构建 | 221 项浏览器测试；离线单文件构建为 85 个模块、约 15.4 MB，新增模块自动内联（`All 221 tests passed`、`python3 tools/build-offline.py`） |

## 25. Phase 10 变更摘要

| 方向 | 主要改动 |
| --- | --- |
| 基金仓位参数研究 | `fundStrategy.js` 新增 `FUND_PLAN_RESEARCH_GRID`、`researchFundPlan`、横截面信号构建与 `simulateFundConfig`；100 组「持仓数 / 现金缓冲 / 间隔」网格在样本内按夏普等目标选优，再用剩余样本外验证，输出最优 / 基准对比、过拟合标记与候选表；基金页新增研究卡与「应用最优仓位参数」动作，应用只更新仓位参数并清除旧计划 |
| 多因子回归 | `backtestEngine.js` 新增 `factorRegression`、`rankCorrelation` 与 `solveLinearSystem`；对 `buildMlPanel` 的因子横截面做带截距池化 OLS，极小岭项保证零方差列可解，输出系数、平均 Rank IC 与 R²；量化页新增第四种模式与因子溢价表 |
| 深层网络 | 新增 `trainDeepMlpModel`、`predictDeepMlp`、`tuneDeepMlpHyperparameters` 与 `DEEP_TUNING_GRID`；双 tanh 隐层 + sigmoid 输出，手写反向传播与确定性初始化；`mlStockSelection` 支持 `deep` 模型，验证集仍从训练集内部切出 |
| 资金流因子 | `ML_FACTORS` 增至 7 类，因子研究增至 8 类；新增 `moneyFlow`，按涨跌方向累计成交量并换算为净买入压力百分比；UI 与双语键同步 |
| 测试与构建 | 225 项浏览器测试全部通过；新增基金参数研究、多因子回归、双隐层自动调参与资金流因子断言 |

## 26. Phase 11 变更摘要

| 方向 | 主要改动 |
| --- | --- |
| 盘中 tick 数据 | `MarketEngine.tick` 为每个公司 / ETF 记录 `{ d, t, o, h, l, c, v }` 盘中蜡烛，保留最近两个交易日；交易页新增日 K / 分时切换，分时使用 `sessionClock` 标注当前会话，图表、标签和说明均更新 |
| 外部行情通道 | 新增 `market/liveFeed.js`：接受裸报价 map、`quotes` 对象 / 数组与 `updatedAt`；只允许 http(s)，支持超时、CORS / HTTP / 解析失败回退；设置页保存 URL 与 15 / 30 / 60 秒间隔，市场页轮询并显示参考报价，**不修改模拟市场或账户** |
| 组合优化器 | 新增 `fund/optimizer.js`：用已完成日收益构建收缩协方差，提供最小方差、逆波动率风险平价与均值方差；投影梯度 + 回溯线搜索保证约束内下降；`buildFundWeightPlan` 把目标权重转换为买卖建议，`fundApplyOptimizer` 写入策略计划 |
| 细粒度归因 | `fundAttribution` 新增逐持仓权重 / 收益 / 组合贡献，以及 Beta / 动量 / 年化波动 / P/E 加权暴露；UI 新增持仓贡献与暴露区 |
| 另类数据因子 | `ML_FACTORS` 增至 8 类，因子研究增至 9 类；新增分析师修正（upgrade / downgrade 新闻冲击）与盘中资金流（无盘中数据时回退日线） |
| 测试与构建 | 239 项浏览器测试全部通过；新增组合优化器、外部行情解析、盘中 tick、分析师修正、盘中资金流、归因暴露与 UI 冒烟断言 |

## 27. Phase 12 变更摘要

| 方向 | 主要改动 |
| --- | --- |
| 多因子风险模型 | 新增 `fund/riskModel.js`：市场 Beta（回归）、规模（市值）、价值（盈利收益率）、动量、低波动暴露；用当前横截面的多空组合构造因子收益，估计收缩协方差与特异性残差；`portfolioFactorRisk` 输出因子 / 特异性风险贡献和四类压力情景 |
| 交易成本模型 | 新增 `fund/costModel.js`：佣金、半价差与基于成交量参与率的冲击估计；`targetBuyQuantity` 按冲击调整目标数量；`summarizePlanCosts` 汇总计划成本 |
| 执行成本 | `fundBuy` / `fundSell` 接收 `slippagePct` 调整成交价；`executeFundPlan` 传递计划的冲击估计；策略与优化计划增加成本摘要，基金页显示成本与成本占净值 |
| 测试与构建 | 243 项浏览器测试全部通过；新增多因子风险、压力情景、成本估计、成本感知数量、执行滑点与 UI 风险卡断言 |

## 28. Phase 13 变更摘要

| 方向 | 主要改动 |
| --- | --- |
| 简化税费档案 | 新增 `fund/taxProfiles.js`：不征税、15% 资本利得税、25% 资本利得税 + 0.1% 交易征费；`setupFund` 保存档案，`normalizeFund` 兼容旧存档 |
| 账户税费 | `trading/account.js` 的 `buy` / `sell` 接收 `levyRate` 与 `capitalGainsRate`；买入征费计入成本基础，卖出征费与正收益税从净现金扣除，写入 `taxesPaid` 与交易明细 |
| 基金集成 | `fundBuy` / `fundSell` 按基金档案传入税率；策略计划与优化计划的成本摘要新增征费 / 资本利得税，并按税后现金计算预期现金 |
| 界面与测试 | 基金成立表单新增税制选择，运营卡显示税费档案与累计税费；244 项测试全部通过 |

## 29. Phase 14 变更摘要

英国税务实验室是只读估算层，不修改账户、订单或存档。所有输入来自当前存档的股票交易与股息记录，金额按固定教学汇率从虚拟美元换算为英镑。

| 方向 | 主要改动 |
| --- | --- |
| 税年与税率 | 新增 `tax/ukTaxEngine.js`：2026/27（2026-04-06 至 2027-04-05）；CGT 年度免税额 £3,000、18% / 24%；股息免税额 £500、10.75% / 35.75% / 39.35%；基本税率带 £37,700、附加税率门槛 £125,140；ISA £20,000；SDRT 0.5%；每条结果附 HMRC 来源 URL |
| 股票匹配 | 按同日、30 天后买入、Section 104 成本池的顺序匹配；未来买入在卖出时预先占用，不进入成本池；同日多笔买卖按先进先出并明确标注为教学简化 |
| 税务计算 | 亏损先抵扣盈利，再使用年度免税额；剩余收益按基本税率带拆分为 18% / 24%；股息作为收入顶层，免税额占用税率带但按 0% 计税 |
| ISA 与 SDRT | ISA 账户的 CGT 与股息税为 0，仍显示 £20,000 额度与超额提示；SDRT 只对显式标记为英国股票的买入计收 0.5%，并计入成本基础，ETF 与未标记标的默认不计 |
| 数据边界 | 交易日志上限 250 笔、股息记录上限 160 笔；做空 / 期权 / 期货 / 基金 / 债券 / FX / 商品 / 加密资产不参与估算；成本池不足时输出警告而不是伪造成本；结果明确标记 `educationalOnly` |
| 界面 | 新增 `/tax` 税务实验室与导航项；表单可切换 GIA / ISA、税率档、应纳税所得额、汇率、ISA 投入与英国股票假设；结果展示 CGT / 股息 / SDRT 汇总、卖出与股息明细、匹配方式、警告、限制与来源链接 |
| 双语与测试 | 新增 `tax.*`、`error.ukTax*`、`roadmap.p14 / p15` 中英键；`tests/ukTax.test.js` 覆盖同日 / 30 天 / 31 天 / 成本池、AEA、18% / 24%、股息三档、ISA、SDRT、FX、税年过滤与输入错误；当前 350 项测试全部通过 |

**尚未完成**：真实行情供应商、服务端 API Proxy、完整分钟历史与全部公司行为、美国税制 / Wash Sale、数据授权看板与监管课程仍需外部凭证、授权与后端运行环境；在缺少这些条件时不会伪造连接或真实数据。

## 30. Phase 1：移除真实行情依赖与 50 家规范市场

按 Phase 0 的三个决策，项目移除了所有真实行情运行时入口，同时保留旧 40 家虚构公司与独立的历史日线实验室。

| 方向 | 主要改动 |
| --- | --- |
| 删除真实数据入口 | 删除 `ui/views/realdata.js`、`history/realData.js`、`history/minuteData.js`、`history/minuteReplayEngine.js`、对应测试与构建脚本；`historyScenarios.js` 只保留 2008 / 2015 / 2020 / 2022 四个历史日线场景，`dataLoader.js` 只读取 `data/history/*.json` |
| 导航与路由 | 从 `shell.js` 与 `app.js` 移除 `/realdata` 导航、视图注册与离线过滤；新增 `/exchange` 独立导航项 |
| 历史实验室 | 保留真实美股日线与拆股调整；删除真实分钟模式与 1m 周期入口，历史页回到 8 tick 日线回放；`data/real/` 仍被 `.gitignore` 忽略 |
| 规范市场 | 新增 `js/sim/companies50.js`：50 家虚构公司，20 家参考现实行业结构、30 家完全原创；4 位唯一代码，覆盖科技、消费、金融、工业、能源、医疗、通信、公用事业与材料 |
| 公司字段 | 每家公司包含名称、板块、行业、初始价格、流通股、市值、收入 / 净利润 / 资产 / 负债 / 现金流、EPS / ROE / ROIC / PE / PB、股息与回购政策、机构 / 散户占比、风险标签与描述 |
| 校验 | `validateSimUniverse()` 强制 50 家、20 + 30 构成、代码唯一、价格与财务字段有效；测试覆盖重复代码、错误混合与 49 家拒绝 |

## 31. Phase 2：模拟时钟与多周期行情

| 方向 | 主要改动 |
| --- | --- |
| 独立时钟 | 新增 `js/sim/simulationClock.js`：1× / 5× / 10× / 30× / 60× 对应 1000 / 200 / 100 / 33 / 16 ms；支持启动、暂停、切换、单步 1 秒、单步 1 分钟；与旧 8 tick 市场时钟完全隔离 |
| 会话模型 | `SIM_SESSION_SECONDS = 23,400`（09:30:00–16:00:00），`SIM_SESSION_MINUTES = 390`；每 60 个秒回调触发一次分钟回调 |
| 行情序列 | 新增 `js/sim/minuteSeries.js`：每个交易日 390 根 1 分钟 OHLCV，按成交更新开 / 高 / 低 / 收 / 量；跨分钟自动 finalize，`finalizeDay()` 生成日线并清空盘中序列 |
| 多周期 | 1m / 5m / 15m / 30m / 1h / 4h 按 09:30 起点分桶；1D / 1W / 1M 由日线聚合；当前桶标记 `partial`；缺失分钟不补成交量、不泄露未来数据 |
| 页面 | 新增 `/exchange`：独立时钟面板、50 家公司选择、9 个周期 Canvas K 线、报价与订单簿；暂停时也可提交订单，保存 / 重置使用 `localStorage` 键 `sma.sim-exchange-v1` |
| 存档 | 保存公司公允价 / 最新价 / 序列 / 账户 / 订单 / 模拟挂单，恢复时重建订单簿与挂单；时间、日索引与 RNG 状态一起持久化 |

## 32. Phase 3：订单簿、做市商与交易账本

| 方向 | 主要改动 |
| --- | --- |
| 订单簿 | 新增 `js/sim/orderBook.js`：做市商 bid / ask 多档报价、玩家限价挂单、价格优先撮合、跨档吃掉深度、部分成交与剩余挂单 |
| 撮合 | `js/sim/exchangeEngine.js` 的 `submitOrder()` 支持市价 / 限价、买卖双向；市价剩余取消，限价剩余挂单；限价单先检查可预留现金 / 可卖持股 |
| 订单状态 | `pending` / `open` / `partiallyFilled` / `filled` / `cancelled` / `rejected`；暂停时提交的玩家订单进入待激活队列，下一个模拟秒激活；模拟订单 300 秒过期，订单列表裁剪但保留所有可追踪的玩家订单 |
| 账本 | 现金、持仓、平均成本、已实现盈亏、累计费用与完整成交记录；买入按成交金额加费用扣现金，卖出按平均成本结算已实现盈亏 |
| 模拟交易者 | `noise` / `momentum` / `value` 三类交易者按公司特征、市场因子、板块因子与特异性因子报价与下单；每 30 秒更新一次因子 |
| 做市商库存 | 成交时更新做市商库存，下一次报价按库存与公司 impact 偏移；库存净卖出抬高中价，净买入压低中价 |
| 确定性 | `createRng` / `rngState` 贯穿价格、交易者与订单；同种子 + 同指令序列得到相同状态；存档同时保存订单簿 mm 档位与所有活动挂单 |
| 测试 | `tests/simExchange.test.js` 覆盖时钟、9 个周期聚合、未完成分钟隔离、缺失分钟、多档撮合、部分成交、剩余数量、待激活订单、限价挂单 / 取消、买卖账本、做市商库存、订单追踪保留、确定性与存档恢复；当前 **350 项测试全部通过** |

**后续阶段**：回购 / 增发 / 并购 / 破产等高级公司行为、Phase 5 高级金融与 Phase 6 双模式 / 时间旅行教学复盘。Phase 1–3 的目标是先把「能正确交易的市场」做可靠，再在其上叠加教学与高级资产。

## 33. Phase 4：公司经营与市场经济

| 方向 | 主要改动 |
| --- | --- |
| 财报模型 | 新增 `js/sim/fundamentals.js`：每个季度生成利润表 / 资产负债表 / 现金流；保持资产 = 负债 + 权益（误差 ≤ 0.05）并让现金流净变动与现金余额勾稽 |
| 财报日历 | 季度 = 63 个交易日；财报在季度结束后第 14 个交易日发布；`reportQuarterForDay()` 保证 UI 和引擎只看到已发布季度，不读取未来财报 |
| 财报发布 | 发布日按 EPS 相对上一季度的意外产生最高 ±8% 的确定性价格跳变；事件写入 `state.reports`，可在公司事件卡查看 |
| 分红 | 每季度第一个交易日除息，按持仓数量 × 每股季度股息派发现金；公司报价同步下调股息金额；`account.dividends` 记录逐笔分红；存档保留 |
| 拆股 | 固定计划覆盖 APLA / NVDO / TSLO / METO / NCRT / VCFD，并包含 QVAL 的 1:2 反向拆股；拆股日调整持仓数量与平均成本、公司价格 / 成交量 / 做市商库存，取消该股票全部活动订单并记录 `corporateActions`。反向拆股产生的零股按拆股后价格折算为现金补偿并计入已实现盈亏 |
| 存档 | 保存每家公司 `splitFactor` / `lastReportQuarter`、财报事件、公司行为与分红台账；旧存档缺少字段时以当前交易日为基线迁移，避免重放历史事件 |
| 界面 | `/exchange` 新增公司资料、最新财报、四季度历史、新闻、分红台账与公司事件卡；阶段 / 风险 / 市场标签中英双语；控制栏支持单步 1 秒、1 分钟与推进 1 个完整交易日，便于观察财报、分红、拆股与新闻 |
| 新闻 | 新增 `js/sim/news.js`：每个交易日生成 1–2 条确定性新闻，覆盖公司、板块与全市场；使用独立新闻 RNG，不改变市场 / 交易者序列；新闻在发布日按情绪和 beta 传导到公允价值与报价，并写入存档；板块新闻还会按 `industryModel.js` 的关联权重外溢 |
| 宏观 | 新增 `js/sim/macroEconomy.js`：政策利率、通胀、失业率、GDP、信贷、消费者信心、能源价格与风险偏好缓慢均值回归；每 21 个交易日按 CPI → 非农 → 央行 → GDP → 能源的顺序发布，使用独立 `macro:<seed>:<day>` RNG；公布值与预期之差通过利率 / 增长 / 能源 / 风险渠道传导，并派生出牛市、熊市、高波动、危机、流动性、行业泡沫、衰退与复苏等状态。宏观只影响当前估值、指引与后续预期，不回溯重写已发布财报 |
| 行业相关性 | 新增 `js/sim/industryModel.js`：11 个板块分别定义增长 / 利率 / 能源 / 风险敏感度；宏观冲击按板块差异定价，科技与通信、金融与房地产、能源与材料等板块存在显式关联，避免所有股票同涨同跌 |
| 业绩指引 | 季度第 35 个交易日发布 2–4 家公司的 EPS 指引，记录到 `state.guidance` 与 `corporateActions`；下一次财报以指引值作为预期，实际 EPS 相对指引形成盈利意外；指引发布当下产生有限价格反应 |
| 回购与增发 | 季度第 20 个交易日按固定计划执行：回购使用公司现金、减少流通股并小幅抬价；增发新股、募集现金但稀释 EPS 并压低价格。`capitalActions` 记录实际股数因子与现金变动，后续季度报表同步调整现金、总资产、权益、融资现金流、EPS 与每股净资产；已发布季度不回溯重写 |
| 并购与分拆 | 季度第 45 个交易日执行：并购以 40% 现金 + 60% 债务收购私人业务，动作季度起并入收入、利息、资产与负债；分拆 / 剥离出售部分业务，报表减少对应收入与资产，现有股东按持仓获得特别现金分配。`structuralActions` 保存一次性资产负债表变动、后续季度损益与现金流，历史季度不重写 |
| 停牌 | 季度第 10 个交易日按计划停牌：取消该股票全部活动订单、冻结报价、阻止新订单与模拟交易；`haltedUntilDay` 存档，停牌期结束后自动恢复 |
| 供股 | 季度第 25 个交易日开放供股：按持仓比例计算可认购股数，认购价 = 公告前价格 × 折扣；玩家可在截止日前参与或放弃，参与时扣现金、增加持仓并写入成交账本，未使用权利到期失效。公司总股本与认购款同步进入报表 |
| 破产 / 退市 | 季度第 55 个交易日触发：取消订单、核销玩家持仓、把报价写至 0.01 并标记 `delisted`；持仓成本计入已实现亏损，后续财报 / 分红 / 拆股 / 供股跳过该公司，新订单返回 `order.delisted` |
| 三表明细 | 新增 `js/ui/views/exchangeStatements.js` 与 `/exchange/statements/<ticker>`：从最近一次交易所存档读取公司，按季度查看利润表、资产负债表、现金流量表和关键比率的全部行项目；交易所切换到明细页前会自动保存当前状态 |
| 测试 | 新增 `tests/simFundamentals.test.js`、`tests/simNews.test.js` 与 `tests/simMacro.test.js`：财报可见性、三表恒等式、现金流勾稽、拆股后每股值、分红除息、拆股持仓 / 订单 / 权益、反向拆股零股补偿、财报发布价格、新闻确定性 / 价格冲击 / 不读取未来 / 存档、宏观日历 / 慢变指标 / 板块敏感度 / 行业关联 / 事件传导 / 存档、业绩指引与财报预期、回购 / 增发的报表勾稽、并购 / 分拆的报表勾稽与股东分配、停牌订单 / 冻结 / 恢复、供股参与 / 放弃 / 到期、破产退市核销与存档；当前 **350 项测试全部通过** |

**后续阶段**：Phase 5 高级金融与 Phase 6 双模式 / 时间旅行教学。

## 34. Phase 5：融资融券与卖空

| 方向 | 主要改动 |
| --- | --- |
| 保证金模型 | 新增 `js/sim/margin.js`：初始保证金多头 / 空头 50%，维持保证金多头 25%、空头 30%；权益 = 现金 + 多头市值 − 空头市值，维持余量 = 权益 − 维持要求；可买额度按剩余初始保证金计算 |
| 账户结构 | `account.shorts[ticker] = { qty, avgPrice, openedDay }`；`account.margin = { accruedInterest, accruedBorrowFees, lastAccrualDay, call, calls, charges, forcedLiquidations }`。旧存档缺少字段时由 `normalizeAccount()` 补齐，不破坏多头持仓与交易账本 |
| 订单方向 | `submitOrder()` 支持 `buy` / `sell` / `short` / `cover`，并写入 `order.action`（`openLong` / `closeLong` / `openShort` / `closeShort`）与 `order.bookSide`；撮合、挂单与做市商库存仍只看到买 / 卖，语义方向只用于账户记账与 UI |
| 卖空记账 | 开空收到卖出款并记录借券负债；平空支付买入款，按开空均价计算已实现盈亏；卖空期间持有现金可产生融资借款，借券费用按空头市值计提 |
| 利息与费用 | 每个交易日切换时按上一次计提日至当前日计算：负现金按 6.5% 年利率计息，空头市值按 3% 年费率计借券费；写入 `margin.charges` 并从现金扣除，同一天重复调用不会重复计提 |
| 追缴与强平 | 维持余量 < 0 时生成 `margin.call`，默认给 1 个交易日补足；权益 ≤ 0 立即触发。到期仍不足时 `checkMargin()` 撤销玩家活动挂单，按市值从大到小卖出多头 / 买入平空，直到恢复维持保证金，并写入 `margin.forcedLiquidations` |
| 公司行为 | 空头需支付现金分红与分拆特别分配；拆股 / 反向拆股按同一比例调整空头数量与开空均价；破产退市时按 0.01 买回借券并计入已实现盈亏 |
| 界面 | `/exchange` 下单方向扩展为买入 / 卖出 / 卖空 / 买入平空；新增空头持仓表、保证金面板（多空市值、初始 / 维持保证金、维持余量、可买额度、融资借款、累计费用）、追缴提示、费用明细与强平记录 |
| 存档兼容 | 存档仍为 `version: 1`；`account.shorts` / `account.margin` 随账户整体保存。恢复时补齐缺失字段，并为旧订单推断 `action` / `bookSide`，旧挂单继续有效 |
| 测试 | 新增 `tests/simMargin.test.js`：开空 / 平空账本、方向冲突、初始保证金、保证金快照、融资利息与借券费、追缴宽限、到期强平、负权益立即强平、空头股份预留、空头分红与拆股、破产买回、存档与旧存档迁移、旧订单方向推断；当前 **350 项测试全部通过** |

## 35. Phase 5：ETF、期权与公司债

| 方向 | 主要改动 |
| --- | --- |
| ETF 产品 | 新增 `js/sim/etfs.js`：4 只 ETF（MKT / TECH / DIV / SMAL），每只由 50 家公司的加权篮子构成；ETF 状态与股票一起进入 `state.companies`，使用同一订单簿、做市商、交易者、账户与存档 |
| ETF 净值 | `etfNav()` 按成分股价格相对初始价格的加权收益计算净值，锚定基金起始价；成分股拆股时使用 `splitFactor` 复权，避免净值被错误减半。引擎每秒按 NAV 重估 ETF 报价并刷新做市商阶梯 |
| ETF 边界 | 财报、分红、指引、宏观冲击与新闻外溢对 ETF 跳过；ETF 没有季度财报、公司行为或停牌，但可做多、做空、融资买入并进入保证金计算 |
| 期权产品 | 新增 `js/sim/options.js`：7 / 30 / 90 个交易日、5 档行权价的欧式看涨 / 看跌链；复用 `js/options/pricing.js` 的 Black-Scholes 与 Greeks，叠加标的波动率微笑与动态买卖价 |
| 期权账户 | `account.options` 保存合约键、方向、数量、成本与开仓日；买入借记现金，卖出贷记权利金；平仓按做市商 bid / ask 结算并计入 `realizedPnl`。交易写入 `account.trades` 的 `asset: 'option'` 记录，与股票账本共用 |
| 期权保证金 | `optionCollateral()` 对未覆盖空头看涨按 20% 名义本金、未覆盖空头看跌按行权价计担保；股票或反向期权可覆盖。担保计入 `marginSnapshot` 的初始 / 维持要求，强平时按市值从大到小平掉空头期权 |
| 期权到期 | 每个交易日切换时，`settleExpiredOptions()` 按标的上一收盘价计算内在价值，现金结算并写入 `account.optionSettlements`；不模拟提前指派与实物交割 |
| 公司债 | 新增 `js/sim/bonds.js`：6 只与虚构发行人关联的公司债，按政策利率 + 期限溢价 + 信用利差折现定价，提供 bid / ask、YTM、票息与评级 |
| 债券账户 | `account.bonds` 保存数量、成本、票息与上次付息日；债券仅使用现金买卖，不适用融资。每 63 个交易日按票面利率 1/4 支付季度票息，写入 `account.coupons` 并直接增加现金 |
| 账户权益 | `equity()` 与 `marginSnapshot()` 同时计入股票、空头、期权市值、期权担保与债券市值；保证金追缴、利息与强平逻辑继续使用同一账户 |
| 界面 | `/exchange` 公司选择器扩展到 54 个标的；ETF 资料卡显示 NAV、溢折价、费率与成分贡献；新增期权链 + 期权下单 / 持仓 / 结算卡，以及债券报价 / 下单 / 持仓 / 票息卡；保证金面板增加期权与债券市值 |
| 测试 | 新增 `tests/simPhase5Assets.test.js`：ETF 净值 / 篮子交易 / 存档、期权链确定性 / put-call parity、期权买卖平仓 / 保证金 / 覆盖 / 到期结算 / 强平、债券报价 / 买卖 / 季度票息 / 保证金市值、ETF+期权+债券联合存档；当前 **350 项测试全部通过** |

**仍待完成**：Phase 6 双模式与时间旅行教学复盘。
