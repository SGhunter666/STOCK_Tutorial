# Phase 0 审计报告：虚构证券市场重构

日期：2026-11-04  
基线：`main` / `ef9cf65`，316 项测试通过，工作区干净。

## 1. 现有技术栈与基线

- 纯前端 ES Modules + Canvas，无 Node/npm 运行时依赖。
- 本地开发：`python3 -m http.server 8123 --bind 127.0.0.1`。
- 测试：`tests/index.html`，Edge headless 运行，当前 **368 项全部通过**。
- 离线构建：`python3 tools/build-offline.py`，当前 **110 个模块 / 约 15.95 MB**，冒烟通过。
- 存档：IndexedDB 优先，localStorage 降级；键为 `career-v1`、`sandbox-v1`，DB 版本 1。

## 2. 现有市场与公司

- `js/data/companies.js` 有 **40 家虚构公司**，5 个 segment，每段 8 家：
  `core / growth / consumer / industry / frontier`。
- 全部为原创虚构名称，例如 AURA、HLIX、VRDN；不是真实上市公司映射。
- 每家公司已有价格、股本、Beta、波动率、营收、净利润、每股账面价值、股息率、平均成交量。
- `js/data/financials.js` 从上述字段派生简化财务报表；`stockTypes.js` 提供风格标签；`etfs.js` 提供虚构 ETF。
- 教学、课程、解锁、税务、期权、期货、基金、量化、挑战等模块均建立在这 40 家公司之上。

**与 Phase 1 的差距**：目标为 50 家；当前 40 家。直接替换成规范中的 50 个名称会破坏大量课程、测试和存档；需要选择“补 10 家”或“新开 50 家市场”。

## 3. 现有市场引擎与时间

- `js/market/marketEngine.js`
  - 确定性种子 RNG。
  - 每个交易日 **8 个 tick**；`tick >= TICKS_PER_DAY` 时关市并生成日线。
  - 状态包含 `seed/rngState/day/tick/quotes/history/intraday/etfDivisors/index/news`。
  - 日线由 `buildHistory()` 生成；盘中价格由 `intradayPath()` 从日线 OHLC 派生。
- `js/market/clock.js`
  - `SPEED_MS = { 1: 2000, 5: 800, 20: 250 }`，即 1× 每 2 秒一个 tick。
  - 已支持 `setTickMs()` 覆盖间隔（分钟历史场景用它实现 1 秒 = 1 分钟）。
  - 暂停时停止 `onTick`；但当前没有“单步 1 秒 / 1 分钟”语义。
- `js/market/calendar.js` 固定 `TICKS_PER_DAY = 8`，`sessionClock(tick)` 输出盘中时间。

**与 Phase 2 的差距**：目标为 1 现实秒 = 1 模拟秒、60 秒形成一根 1 分钟 K、暂停/恢复/单步/多档速度。当前核心市场是 8 tick/日，只有历史分钟场景接近目标。

## 4. 现有 K 线与图表

- `js/ui/chart.js` 的 `CandlestickChart` 使用 Canvas 2D 绘制 `{o,h,l,c,v}`，无第三方图表库。
- 默认市场：日线由 `buildHistory()` 生成；盘中 5m/15m/1h 由 `minutePath()` / `buildIntradayCandles()` 从日线 OHLC 合成。
- 历史日线场景：内置或本地日线数据 + 合成盘中。
- 2022 真实分钟试点：`js/history/minuteData.js` 解析 Alpaca 1Min CSV，`aggregateCompletedMinutes()` 生成 5m/15m/1h；390 分钟步、1 秒 = 1 分钟；这是唯一真实分钟链路。
- 图表周期：`5m/15m/1h/1d/1w/1mo/1y`；规范要求还包括 `30m/4h/1M`，且所有周期必须追溯到同一组成交。

**与 Phase 2 的差距**：核心市场没有“每秒成交 → 当前分钟 K → 多周期聚合”的统一链路；当前是日线 OHLC 派生盘中路径。

## 5. 现有订单与账本

- `js/trading/orderEngine.js`
  - 支持市价、限价、止损、追踪止损、止损限价、OCO。
  - 市价单立即成交；限价单在 `quote.ask/bid` 交叉时整单成交。
  - 订单状态只有 `open/filled/cancelled/rejected`，**没有部分成交**。
  - `processOpenOrders()` 每个 tick 处理挂单、触发条件单、OCO 互取消。
- `js/market/orderBook.js`
  - `buildOrderBook()` 从 quote 派生展示用 L2 深度；`estimateMarketFill()` 可估算吃单滑点。
  - 订单簿不是持久撮合队列，不参与真实成交。
- `js/trading/account.js`
  - 买入/卖出/空头回补更新 `cash/positions/feesPaid/taxesPaid/realizedPnl/trades`。
  - 已有市值、未实现盈亏、权益、购买力、空头容量。
- `js/trading/margin.js` 已有融资费用、保证金状态和强平。
- `js/core/persistence.js` 保存整个 store 快照。

**与 Phase 3 的差距**：没有持久订单簿、模拟交易者、做市商库存/报价、部分成交、订单队列优先级；订单簿只是显示层。

## 6. 真实数据运行依赖

- `/realdata` 只读查看器：`js/ui/views/realdata.js` + `js/history/realData.js`，读取本地 `data/real/alpaca/2020`。
- 历史场景 `real-2016-2026` 与 `2022-hikes-minutes`：`js/data/historyScenarios.js` 中的 `realDataPath` 指向 `data/real/...`。
- `data/real` 未纳入 Git；离线构建不嵌入这些数据。
- 运行时**没有** Alpaca API 调用；密钥只被 `tools` 下载器使用。
- `js/ui/shell.js` 中 `/realdata` 导航项标记 `realDataOnly`，离线单文件版隐藏。

**迁移原则**：先移除运行依赖（导航、场景加载、构建入口），保留本地原始文件作为归档/可选实验，不直接删除未追踪数据。

## 7. 教学与测试耦合

- `tests/logic.test.js`、`ui.test.js`、`history.test.js`、`locale.test.js` 等依赖：
  - 40 家公司的 ticker/segment 解锁；
  - 8 tick/日的市场节奏；
  - 历史场景列表与卡片；
  - 现有订单状态与账本字段。
- 改造核心时钟、公司池或订单状态会牵动大量测试；必须逐阶段更新并保持测试基线不回退。

## 8. 迁移清单

### Phase 1：完全虚构化

1. 决定 50 家公司方案（补 10 家 vs 新开 50 家市场）。
2. 移除 `/realdata` 运行时导航与视图注册。
3. 从运行时场景列表移除 `real-2016-2026`、`2022-hikes-minutes`，保留代码/数据作为归档实验。
4. 移除 `historyScenarios` 的 `realDataPath` 加载分支与 `dataLoader` 的真实路径分支。
5. 校验无任何运行时 `fetch` 指向外部行情；离线构建不嵌入真实数据。
6. 扩展公司字段到规范要求：上市日期、业务简介、现金流、负债、股息/回购政策、流动性、价差、价格冲击系数等。
7. 更新公司唯一性校验与测试，确保初始 50 家。

### Phase 2：时间与 K 线

1. 新增统一 `SimulationClock`：模拟秒为最小步长，60 秒一根 1 分钟 K。
2. 支持暂停、恢复、前进 1 秒/1 分钟、1×/5×/10×/30×/60×。
3. 每分钟严格处理 60 个模拟秒，左闭右开 `[09:30:00, 09:31:00)`。
4. 建立统一成交事件 → 1 分钟 OHLCV → 5m/15m/30m/1h/4h/1D/1W/1M 聚合。
5. 暂停期间禁止价格、新闻、成交、公司事件变化；订单只能进入待激活队列。
6. 存档记录模拟时间与引擎状态，恢复不补算现实时间。
7. 图表只读取当前模拟时间之前的数据。

### Phase 3：模拟交易所

1. 持久订单簿：每只股票买卖档位、队列优先级、成交量。
2. 模拟交易者：噪声交易者、趋势跟随者、基本面交易者、做市商。
3. 做市商库存与报价：价差、库存偏移、价格冲击。
4. 撮合引擎：市价/限价/止损、部分成交、剩余数量、成交回报。
5. 统一账本：订单 → 成交 → 现金/持仓/费用/已实现盈亏，可完整追踪。
6. 流动性约束：大单吃多档、滑点、成交量上限。
7. 暂停/加速下撮合结果一致；同一 seed + 同一指令得到同一状态。

## 9. 风险清单

| 风险 | 影响 | 缓解 |
|---|---|---|
| 直接替换 40 家公司 | 课程、解锁、测试、存档大面积失败 | 先补 10 家；或新市场与旧市场隔离 |
| 8 tick 改 1 秒 | 所有教学节奏、UI 时钟、测试断言变化 | 先加新时钟适配层，再逐页迁移 |
| 订单状态新增 partial | 现有订单测试与 UI 假设整单成交 | 保持旧状态兼容，新增 `partiallyFilled` 与 `remainingQty` |
| 移除真实数据 | 2022 分钟试点与查看器不可用 | 保留文件与代码为归档实验，仅移除运行时入口 |
| 存档不兼容 | 旧存档加载失败 | 增加 snapshot schema 版本与迁移函数 |
| 过度一次性重构 | 难以定位回归 | 按 Phase 1→2→3 小步提交，每步跑全量测试 |

## 10. 需要确认的三个决策

1. **真实数据功能**：从运行时移除并归档，还是保留为独立“真实数据实验室”？
2. **50 家公司**：保留现有 40 家并新增 10 家，还是采用规范中的 50 个名称（会破坏课程/测试）？
3. **时钟**：核心游戏直接改为 1 秒 = 1 秒，还是保留 8 tick 教学模式并新增独立的“模拟交易所”模式？

在这三个决策确定前，不应进行破坏性重构。

## 11. 实施结果（Phase 0–3）

用户决策：

1. 真实数据功能：**彻底删除相关视图与加载器**。
2. 50 家公司：**新开 50 家规范市场，旧 40 家保留**。
3. 时钟：**新增独立“模拟交易所”模式**。

### Phase 0

- 完成现有项目审计、测试基线（313 项）、模块依赖与迁移清单。
- 明确旧 8 tick 教学模式与新 1 秒模拟交易所并存的边界。

### Phase 1

- 删除 `/realdata` 导航、视图与路由；删除 `realData.js`、`minuteData.js`、`minuteReplayEngine.js`、对应测试与真实数据构建脚本。
- `historyScenarios.js` 只保留四个历史日线场景；`dataLoader.js` 只读取 `data/history/*.json`；离线包不嵌入 `data/real`。
- 新增 `js/sim/companies50.js`：20 家参考现实行业结构 + 30 家完全原创，4 位唯一代码与完整财务派生字段；`validateSimUniverse()` 与 4 项测试。
- 旧 40 家公司、课程、解锁、存档与历史日线实验室保持不变。

### Phase 2

- 新增 `js/sim/simulationClock.js`：1× / 5× / 10× / 30× / 60×、暂停 / 恢复 / 单步 1 秒 / 单步 1 分钟，与旧市场时钟隔离。
- 新增 `js/sim/minuteSeries.js`：390 分钟会话、1 分钟 OHLCV、1m–1M 九周期聚合、当前桶 `partial`、日线 finalize。
- 新增 `/exchange` 独立页面，默认暂停；保存 / 恢复使用 `sma.sim-exchange-v1`；存档保留模拟时间、日索引与 RNG 状态。

### Phase 3

- 新增 `js/sim/orderBook.js` 与 `js/sim/exchangeEngine.js`：做市商多档报价、限价挂单、价格优先撮合、跨档深度、部分成交、订单状态、现金 / 持仓预留、费用与已实现盈亏。
- 模拟交易者覆盖 noise / momentum / value；每 30 秒更新市场、板块与特异性因子；同 seed + 同指令可复现。
- 订单 300 秒过期、列表裁剪 500 条，限制长时间运行的内存增长。

### 当前验证

- 浏览器内 **368 项测试全部通过**（删除真实数据测试时为 288 项，此后补充了订单簿、待激活订单、库存、存档、财报、新闻、宏观、指引、回购增发、并购分拆、停牌、反向拆股、供股、破产退市、融资融券、卖空、ETF、期权、公司债、挑战模式、时间旅行与高级订单回归测试）。
- 额外修复：闲置订单剩余量重复成交、模拟订单跨交易日不失效、存档丢失模拟挂单、市价单残余被错误列为活动订单并占用现金、做市商库存不更新、日/周/月 K 的 `partial` 标记、交换页缺少 `render` 订阅钩子。
- 离线构建：110 个模块、4 套历史数据、15.95 MB；不包含 `realdata` / `realDataPath` / `minuteDataPath` 代码。
- Phase 4 已完成：季度三表财报、财报发布价格联动、完整三表明细页、确定性新闻系统、季度分红与计划拆股、反向拆股、宏观数据与市场状态、行业相关性、业绩指引、股份回购与增发、并购、分拆 / 剥离、停牌、供股与破产 / 退市。
- Phase 5 已完成：融资融券、卖空与买入平空、初始 / 维持保证金、融资利息与借券费、保证金追缴、强制平仓、空头分红与拆股调整、破产买回、ETF 净值与篮子交易、Black-Scholes 期权链 / 买卖平仓 / 保证金 / 到期实物交割与行权、6 只公司债 / 买卖 / 季度票息，以及多产品联合存档。
- Phase 6 已完成：交易所挑战模式（规则、评分、评级）、时间旅行复盘（日开盘快照、回退与分支）、止损 / 止损限价 / 追踪止损 / OCO、期权到期实物交割与手动行权，以及可选的期权美式提前指派。
- 交易统计与归因：交易所复盘卡汇总收益、胜率、盈亏比、回撤、费用与股息票息，并按标的拆分已实现 / 未实现盈亏；股票平仓成交新增 `realized` 字段。
