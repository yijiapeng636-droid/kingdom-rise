# 结构与扩展指南

## 1. 哪些地方可以修改状态？

权威状态是 `WorldState`，由 `GameController` 独占持有。Vue 的订阅拿到 `structuredClone` 快照，Phaser 通过 `getViewState()` 获得只读引用（TypeScript 类型为 Readonly），不要在 Scene 里写领域属性。

新增交互应优先定义一个 `GameCommand` 并在 `application/Simulation.ts` 的 `execute()` 做业务校验和状态改变。需要长期推进的效果应放进 `step()` 使用固定 dt。模拟以 20Hz 推进，UI 每约 150ms 刷新，渲染帧率与资源结算无关。

在 `GameController` 中统一触发本地存档和状态快照通知。生产、建造、战斗、伤口和扣粮使用同一个模拟时间，不能在组件里额外写 `setInterval` 触发规则。

## 2. 模块职责

| 模块 | 职责与可替换边界 |
|---|---|
| `domain/model/` | 状态实体、命令类型，不引用浏览器 API |
| `domain/navigation/hex.ts` | 网格转换、相邻格、占格、A*；可抽成 `Pathfinder` 接口切换正交格或导航网格 |
| `domain/ai/ResidentPolicy.ts` | 居民工作/自动作战的决策接口，可替换智能策略 |
| `domain/combat/CombatSystem.ts` | 战斗意图收集和同步伤害应用，不依赖视觉动画 |
| `domain/progression/` | 单等级经验和战斗参数派生，保留伤情状态 |
| `domain/rules/inventory.ts` | 扣费、存储上限、入库（返回实际入库量） |
| `application/Simulation.ts` | 按顺序调度所有领域模块、验证命令、产生日志 |
| `game/scenes/WorldScene.ts` | 地图画面、选中、拖框、点击/快捷键，发送命令，不做经济计算 |
| `persistence/` | JSON 存取与版本防护；可通过 `SaveRepository` 替换 |

## 3. 关键不变量

1. 人物稳定 ID，身份与生命状态改变不能新建同一个人物。
2. 不允许低于 0 的库存；仓库满了，未能领取的战利品保留在 encounter.loot。
3. 命令由应用层统一校验。AI 产生命令意图，不能直接改内部规则。
4. 两个单位同时攻击：先收集当步所有命中意图，再应用；避免迭代顺序改变本回合互相攻击结果。
5. `Building` 每个格子只能有一个建筑；施工入口必须可达。建筑竣工后效果生效。
6. 已经扣过的生命、资源、伤亡不能在袭击汇总中再扣一次。
7. `lootClaimed` 持久化，避免刷新后重复领取。升级不自动治疗角色。
8. `WorldState` 中不能存 Phaser Sprite、Vue reactive proxy、DOM Node 或回调。

## 4. 常见扩展操作

**增加建筑**：新增 BuildingKind → BUILDINGS 配置 → BuildingView 的形状/素材映射 →（需要时）扩展 `domain/rules` 效果。建造、库存和施工流程不必复制。

**增加敌对单位**：新的 `role`/属性定义 → 初始场景或关卡刷怪规则 → DefaultResidentPolicy 选敌规则（或单独 EnemyPolicy） → UnitView 映射外观。未来角色模板建议从平衡表中抽出 `unitDefinitions.ts`。

**换地图**：保留 domain 的轴坐标 q,r；为 Tiled 编写 loader 将交错行列转换为轴坐标，导出地图尺寸、阻挡单元格、资源点和出生点。只有 MapView / navigation 格拓扑需要适配。无需换经营、战斗状态。

**接数据库/云存档**：实现 `SaveRepository` 读取和写入 `WorldState` JSON，并对异步存档改造 controller.save() 的返回类型、错误处理。建议使用存档版本、校验和冲突处理，而非把最新存档覆盖旧档。

## 5. 当前权衡

- 原型地形为程序画出的六边形色块和简单装饰，地形格全部通行（资源点、栅栏等占格阻挡）。正式 Tiled 地图与河流阻挡是后续开发工作。
- 单一 `WorldState`，没有提前抽象大型 ECS 或网络同步协议。若人物达到数百，先对 A*、射程筛选和视图更新做缓存和空间索引，再考虑 ECS。
- 使用 `structuredClone` 降低 Vue 与领域耦合；后续可改为差分事件或 selector/patch 发布，以降低大地图 UI 刷新成本。
- 目前的遭遇仅一轮袭击。下一版新增遭遇管理器时，把单个 encounter 变成历史数组 + 当前 ID，并同步升级存档 schema。
