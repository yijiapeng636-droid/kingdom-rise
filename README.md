# 王国崛起 · 网页 MVP

按照用户提供的《王国崛起-MVP项目方案.md》实施的**单机、纯浏览器**可扩展原型。采用 **Vue 3 + TypeScript + Phaser 3 + Vite**，没有服务器、数据库或账号依赖，使用浏览器 localStorage 保存进度。

> 本项目交付的是**完整源码**，不是页面截图。需要首次安装 npm 依赖才能在浏览器启动。素材使用 Phaser Graphics 程序绘制的占位美术，不需要额外下载图片。

## 环境和启动

- Node.js **22.16+**（Node 22 LTS；内置 TypeScript 测试运行能力）
- npm 和能访问 npm 软件源的网络（**首次安装依赖**时）

```bash
# 进入解压后的项目目录
npm install
npm run dev
```

打开终端显示的网址（通常是 `http://localhost:5173`）。也可 Windows 双击 `start.bat`，或 macOS/Linux 执行 `bash start.sh`。

其他命令：

```bash
npm run build             # Vue / TypeScript 检查 + Vite 生产构建
npm run preview           # 预览构建产物
npm run typecheck:domain  # 只检查纯 TS 游戏层，无需 Vue/Phaser 类型依赖
npm test                  # Node 22 原生测试，无第三方测试运行器
```

> 这里的交付环境不能连接 npm registry，因此已对**领域/application 源码执行 tsc 检查，并运行 15 项自动化测试**；依赖安装和实际 Vite/Phaser 浏览器构建尚不能在当前环境完成。这是构建验证限制，而不是声称已经完成浏览器实测。若本机 `npm install` / `npm run build` 报错，请保留错误日志继续修复。

## 现在可以玩什么

- **六边形地图**：24×24 地块，平滑路径移动、A* 寻路、资源点与建筑占格、空地点击/框选单位、镜头平移/缩放/跟随。
- **经营**：开局 1 名领袖、5 名居民，木材 20 / 石料 10 / 食物 30。居民可伐木、采石、务农、施工和休息；岗位工作必须抵达目标。
- **建造**：住房、农田、仓库、木栅栏。绿色/红色预览，扣除配置成本，居民到达后从地基→施工→竣工；完工后生效。
- **生存**：按模拟时间扣除食物，不足降低忠诚度，已完成建筑影响繁荣度，仓库改变资源容量。
- **实时战斗**：第 3 游戏日触发三名强盗，直接在原营地战斗，无场景切换。支持框选我方、右键攻击/移动，防守与劳动同时进行。
- **成长与结算**：劳动、建造、伤害贡献给予居民经验；统一等级提高能力；倒地、超时死亡、战后救援、120 游戏秒恢复；战利品领取一次，敌方俘虏可留押或释放。
- **进度**：暂停、1×/2×速度，自动本地存档、读取和重置。测试按钮可提前触发袭击，无需等待两天。

## 操作

| 操作 | 行为 |
|---|---|
| 左键角色 | 选中一个己方单位；Shift + 左键可以多选 |
| 左键空白区域拖框 | 框选多个己方单位 |
| 右键空地 | 让选中单位移动 |
| 右键树、矿、野果 | 让选中单位采集 |
| 右键强盗 | 让选中单位追击或攻击 |
| 建造面板选建筑 → 左键格子 | 显示预览并确认工地；分配「施工」居民完成施工 |
| 鼠标中键拖动 / WASD / 方向键 | 自由移动镜头 |
| 滚轮 / F | 缩放 / 再次跟随领袖 |
| Esc | 退出建造模式 |

**新手建议**：先建一块农田，在居民面板把「米娅」设为「务农」；让「罗恩」继续施工；然后选中领袖并右键树木采集。需要测试战斗时点左侧的「提前触发袭击」。

## 核心架构（严格隔离）

```text
src/
├── app/               # Vue 入口、布局、gameBridge 薄适配层
├── ui/components/     # 纯管理 UI（只消费状态快照并发送命令）
├── application/       # GameController（唯一可写状态）+ Simulation（20Hz 固定步长）
├── domain/
│   ├── model/          # plain JSON 的 WorldState/Person/Building 等模型
│   ├── navigation/     # 六边形坐标、格子拓扑和 A* 寻路
│   ├── ai/             # 可替换 ResidentPolicy：工作意图+战斗意图
│   ├── combat/         # 独立攻击判定、收集意图、统一伤害
│   ├── progression/    # 经验/升级与属性公式
│   └── rules/          # 库存、容量、扣费
├── game/
│   ├── config/         # balance / buildings / scenario / Phaser 配置
│   ├── scenes/         # WorldScene：只做图形、选中和输入分发
│   ├── entities/       # 绘制人物和建筑的 View
│   ├── map/            # 可替换地图显示层
│   └── camera/         # 独立镜头控制器
└── persistence/        # 可替换的 localStorage 存储接口与存档版本校验
```

应用的数据方向始终是：

```text
鼠标/管理面板 → GameCommand → GameController → Simulation + 领域规则 → WorldState
                                                        ↓            ↓
                                                   Vue 状态快照  Phaser 只读场景
```

领域层和模拟层没有 Vue、Phaser 或 DOM 引用；可以单独执行测试。

## 扩展点

- 新增建筑：`src/game/config/buildings.ts` 配成本、工期、生命、容量/繁荣度等；在 `BuildingView.ts` 添加**仅显示**的绘制方式。新增规则效果时在领域中应用配置，不要在 Vue 里扣资源。
- 调整数值：`src/game/config/balance.ts`（生产时间、每日口粮、等级与袭击属性）。
- 换初始地图与居民：`src/game/config/scenario.ts` 提供可配置初始方案；后续可写 Tiled JSON → `ScenarioDefinition` 的适配器，不必重做经营规则。
- 增加工作种类：扩展 `Job` / `ResidentPolicy.chooseSettlementAction()` / 工作规则和相关 UI；不要写在 Phaser Scene 中。
- 增加 AI：实现 `ResidentPolicy` 并注入 `step(world, dt, policy)`，不要让 AI 直接修改 WorldState。
- 增加战斗动作和兵种：扩展命令、战斗领域函数和单位数值表；渲染类只消费属性结果。
- 增加后端：实现 `SaveRepository` 并由 `GameController` 注入；**不**将 localStorage、HTTP 逻辑塞进域模型。
- 存档升级：修改 `schemaVersion` 并为旧版本增加显式迁移。不要静默用新类型覆盖旧存档。

更详细的设计边界和扩展路线见 `docs/ARCHITECTURE.md` 与 `docs/ROADMAP.md`。

## 目前仍有限制

这是 MVP，刻意没有多人、外交、市场、技术树、Tiled 正式素材、程序化无限地图、复杂武器换装、士气/招募/赎金系统。鼠标中键拖图、框选和右键指令主要面向桌面浏览器。道路、地图美术和寻路以可验证功能为第一目标；后续可增加避让、寻路缓存、寻路失败反馈及移动补间效果。

**实现原则**：保持能运行的小系统，避免预建用不到的 ECS、反射容器、动态插件平台或后端服务。
