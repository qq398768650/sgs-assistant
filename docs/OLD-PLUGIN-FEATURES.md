# 旧插件功能盘点（三国杀打小抄·山河图 v3.4.4.4）

> 来源：`F:\Work2026\SGS_Xiaochao\xiaochao_orign.js`（803,637 字节，2883 行）
> 作者：孤独尊 / haoming，`@namespace http://home.ustc.edu.cn/~haoming`，MIT
> 基线：小麦原版打小抄（`https://goka.top:8080/sgs/script.user.js`）
> 本轮已完整解出核心代码，见 `runs/xc-deob.js`（669 KB）

---

## 一、文件结构（已解剖）

| 区间 | 内容 |
| --- | --- |
| L1–L171 | 元数据头 + 辅助函数（`localGet/localSet/localDel/localSend/openWindow/json2html/array2table/n2C/n2N/download/sleep/randomOne/retry/wait/msort/del/redefine`） |
| L172–L777 | `window.SGS.mainHTML` —— 设置面板 HTML（13 个功能开关 + 礼包/充值/互助/激活/道具记录/工具区） |
| L779–L1997 | 各独立窗口 HTML 生成器：`water` / `recordHTML`(战绩) / `taiciHTML`(台词) / `skinHTML`(皮肤) / `layoutTemplate`(布局) / 山河图手册数据表 |
| L1998–L2833 | `mainScript()` —— `resized`(尺寸 hook) / `Exit()` / `Init(SGS)`；`Init` 内只有 `setLayout()`(226 行) 与 `loadConfig_w()`(456 行) |
| L2834 | jsjiami.com.v7 混淆块 = `Init()` 的返回值，**全部核心逻辑** |

**混淆块已还原**：8243 个字符串调用全部解出（3 个未解），产物 `runs/xc-deob.js` + `runs/xc-strings.json`（脚本 `runs/xc-deob-run.js`）。
解混淆方法：jsjiami v7 标准结构 —— `function _0x24a3(idx, key)`，索引偏移 `0x15f`，字符串表由 `_0xe984()` 返回（6689 项），解码 = `RC4(base64decode(table[idx-0x15f]), key)`。
**注意**：只有 `_0x24a3` 是解码器；`_0x303ff2` 是属性代理器、`_0x41c852` 是属性过滤器，均非解码函数。

---

## 二、功能开关（`#switch` 区，13 项）

| id | 名称 | 说明（原文） | 归属 |
| --- | --- | --- | --- |
| `listQ` | 侧栏卡牌 | 把游戏过程中记录卡牌的显示窗口固定在侧边栏，而不分散在游戏界面内 | 记牌器 |
| `rogeQ` | 收起地图 | 收起游戏界面内的山河图关卡事件，仅展示在侧边栏 | 山河图 |
| `markQ` | 牌局标记 | 标记每张手牌来源 / 可区分是否明牌 / 显示读条剩余时间 | 记牌器 |
| `redQ` | 清除红点 | 永久屏蔽红点提示（双击或右键单次触发） | 通用 |
| `dailyQ` | 每日任务 | 免费敲鼓 ×3 / 武将免费一抽 / 自选领取武将次卡 / 月卡周卡元宝 / 砍元宝树拾取 / 礼包码兑换 | 领奖 |
| `mailQ` | 领取邮件 | 自动领取邮件奖励并删除邮件（右键单次触发） | 领奖 |
| （无 id） | 连点辅助 | 一键全选/反选手牌；连点极奢/狂骨良助自动摸牌；自动御策回血、清弦回血崩血；长按技能按钮连点；双击锁定出牌自动确定；智能选牌避免误出无懈 | 对局辅助 |
| `taskQ` | 自动领奖 | 每局结束后领取军典活跃任务奖励（VIP） | 领奖 |
| `autoQ` | AI 挂机 | 接管刷酒馆 30 亲密度 / 自动建演武房 / 双击无限刷百胜 / 国战刷福卡 / 单骑无双刷 MVP（VIP） | 挂机 |
| （无 id） | 盖主速刷 | 小号主公点将黄盖，一分钟苦肉自杀速刷百胜（VIP） | 挂机 |
| `skinQ` | 皮肤替换 | 换肤窗口可选任意皮肤穿戴（**源码中已注释停用**） | 外观 |
| `sqkQ` | 刷手气卡 | 山河图/斗地主自动连刷手气卡到目标牌（VIP） | 自动化 |
| `blockQ` | 屏蔽特效 | 屏蔽锦囊特效 / 他人动态皮肤 / 传说秀进场动画 / 山河图首领出现 / 回血击杀连杀 | 性能 |
| `skipQ` | 跳过弹窗 | 自动关获取奖励弹窗 / 军典广告 / 跳过结算界面 / 跳过开局选皮肤 / 跳过武将包皮肤包动画 / 关南华老仙天书弹窗 | 弹窗 |
| `getrecordQ` | 录像下载 | 七日战绩界面保存多视角录像（**源码中已注释停用**） | 战绩 |
| `getskinQ` | 皮肤壁纸 | 动静态皮肤设为游戏壁纸 / 静态皮肤存本地 / 锁定后局外也显示 | 外观 |

**工具区按钮**（`#tools`）：我要当狗托（随机武将，纯娱乐）/ 功能使用说明 / 三国锦绣搭配 / 山河图手册（右键下载 .html）/ 一键代码观星 / 战绩胜率统计 / 百胜战功进度 / 皮肤收集进度 / 皮肤台词语音 / 解析皮肤壁纸 / 恢复默认设置 / 重启脚本。

**其他面板**：礼包兑换码 / 9.5 折充值 / 邀请互助 / 界小抄激活（VIP 激活码）/ 道具获取记录。

---

## 三、混淆块（核心）实际覆盖的功能

从 `runs/xc-deob-cn.txt`（467 个中文串）+ 关键函数定位：

- **山河图**：城池 / 关卡 / 事件 / 奇遇 / 战法 / 技能 / 手牌 / 装备 / 队友 / 可选武将 / 初始手牌·铜币·携带 / 铜币 / 商店 / 销毁 / 重铸 / 通关时间 / 精英 / 难度 / 营地 / 营房 / 首杀。分类常量：`{0x2:'战法',0x3:'技能',0x4:'手牌',0x5:'装备'}`，属性映射 `uExSpellCount / uExUseShaNum(出杀) / uDrawNum(摸牌) / uInitCardNum(初始手牌) / uInitHp(体力) / uMaxHp`
- **自动秒杀**（山河图商店自动购买，`分钟后自动秒杀：` 提示）
- **酒馆自动挂机**（`5秒后开始酒馆自动挂机` / `切换到脚本接管挂机...` / `公会共享挂机` / 亲密度）
- **刷百胜**（`神将刷百胜` / `黄盖主公小号刷百胜功能可用` / `速刷已关闭`）
- **自动苦肉**（`启动黄盖主公自动苦肉模式`）
- **跳过询问**（`开启后自动跳过其他角色求桃` / `开启后自动跳过应变助战询问`）
- **连点**（`连点准备就绪，长按技能按钮开启`）
- **一键领取** / **观星** / **助力**（邀请互助）
- **张昌蒲分牌**（左键分左 / 右键分右 / 中键全收回）
- **弹窗治理**（`弹窗被功能关闭拦截` / `道具过期提醒` / `不良游戏行为警告`）
- **战绩**（`正在获取战绩胜率信息` / 通关时间 / 完成时间 / 总时间）
- **隐藏密码房**、**脚本登录/连接状态**、**界小抄会员校验**（付费）

> 大量属性名在还原后仍是密文（如 `button["Æ\u0004(\u001d3"]`），属 jsjiami 属性名加密层，**不影响语义理解**：它们是脚本内部对象的约定属性，运行期自洽。

---

## 四、关键技术机制（本轮打通）

### 4.1 记牌器数据源 —— 劫持 `console.log`

**游戏无条件输出每帧协议**（`runs/game/sgsGame_inner.bin` 内 2577 处 `console.log`）：

```js
// 协议对象自打印（IsLog 为真时）—— 真正可用的数据源
Print(){ if(rs.I().IsLog){ let t={}; swt.DataCopy(this,t,this.printIgnorList); console.log(JSON.stringify(t)); ... } }

// 收发帧摘要（%o 无对应参数，只是描述行）
console.log("%o","--------[Received client"+(s.FromSocket2?"2":"1")+"]"+s.ClassName+" ID:"+s.Id+" Size:"+s.Size+" detail:"), s.Print();
```

- `isLog` 来源：`this.isLog = c1t.IsApp ? 1==parseInt(t.IsAppLog) : 1==parseInt(t.IsLog)`（服务端配置下发），**默认值 `isLog=!0`**
- 旧插件做法：`redefine(window.console, '<attr>', { get: () => logic, set: () => {} })`，`logic()` 取 `Array.prototype.slice.call(arguments,-1)[0]`
- 消息字段（`logic` 解构）：`{ ProtoObj, ClassName, SeatID, SrcSeatID, targetSeatID, SpellID, Param, Params, Datas }`
- 另有一条更干净的通道：`this.event(s.ClassName, new lF(s.ClassName, s))` —— 协议分发事件

**结论**：记牌器**不需要**走 WebSocket 解密 + protobuf 路线（`runs/sgs-capture.json` 那 2229 帧加密包是弯路）。

### 4.2 记牌器 UI —— `setLayout()` + `#cellContainer`

- `#cellContainer .cell` 是格子容器，每个 cell 承载一个记牌窗口（手牌 / 牌堆 / 弃牌堆 / 判定区 / 处理区 / 回收区 / 交换临时区…）
- 布局方案存 `layout.scheme[name]`，`layout.default` 为当前生效样式，`layout.current` 为方案名
- 座位映射：`room.mySeats.map(id => 'shoupai'+id)`、`room.getID(i)`
- `listQ` 开启时全部 cell 收进侧边栏（`#list-<id>`），关闭时按 `styles[element.id]` 还原到游戏界面内
- cell 可拖拽（`move()`：header 上 `mousedown/mousemove`，拖到右边缘 50px 内自动吸附侧栏）

### 4.3 其他机制

- 尺寸适配：`redefine(window,'innerWidth'/'innerHeight')` + `SystemContext.gameScreenType/gameScale`
- 键盘：`document.onkeydown`（一键全选/反选等）
- 布局持久化：`localGet/localSet`（微端走 `electron.ipcRenderer`，网页走 `localStorage`）
- 外部窗口：`openWindow(html)` —— 微端用 `ipcRenderer.send('open', html)`，网页用 `Blob` + `window.open`

---

## 五、还原清单（逐项状态）

状态：✅ 已完成并实测 ｜ 🟡 已实现待验证 ｜ ⬜ 未开始 ｜ ⛔ 不还原
「位置」指向 `sgs-assistant/src/` 内的实现；旧插件实现见 `runs/xc-deob.js`。

### 5.1 用户原始四项需求

| # | 功能 | 旧插件出处 | 状态 | 位置 / 备注 |
| --- | --- | --- | --- | --- |
| 1 | 自动领取每日奖励 | `taskQ` / `dailyQ` / `mailQ` | 🟢 | `tickClaims()`：七日 / 每日任务 / **累计签到 / 新军典 / 军典 / 斗地主军典**（红点守卫）；`tickMail()` 字段已核对。**未自动**（按红线/需输入）：敲鼓、元宝树、寻宝阁、礼包码、生日（要选将/皮肤） |
| 2 | 自动关闭烦人弹窗 | `skipQ` | 🟢 | `tickPopups()` 关 `AdPushWindow` 已实测；`skipNames` 加入结算/获取道具/开包/选皮肤/天书等（待真机验证） |
| 3 | 记牌器 | `listQ` + `markQ` + 协议通道 | 🟡 | 协议状态机已写并真机验证（`inject.js` `DECK` + `deck.js` `noteProto`，面板「已亮明」按牌名计数）；**缺**侧栏卡片格、按花色点数（协议只给牌型 ID） |
| 4 | 山河图随机事件名 | 内置 | 🟢 | `modules/rogue.js`：真机验证（事件 1524「白玉耳铛」节点坐标对齐）；标签含事件名 + 各选项及奖励/代价（`events[id].options`） |

### 5.2 记牌器细分

| # | 子功能 | 旧插件 | 状态 | 备注 |
| --- | --- | --- | --- | --- |
| 5 | 协议通道 | `console.log` 劫持 + `event` 分发 | ✅ | `PROTO` 模块，登录阶段实测捕获 4 个真实协议名 |
| 6 | 牌局状态机 | `logic()` | ✅ | `PubGsCMoveCard` 字段/zone/MoveType 常量已抓（见 `TASK.md` 4.16），亮明判定已实测 |
| 7 | 侧栏卡牌布局 | `listQ` + `setLayout()` | ⬜ | 旧插件用 `#cellContainer .cell` + 布局方案持久化 |
| 8 | 牌局标记 | `markQ` | ⬜ | 每张手牌来源 / 是否明牌 / 读条剩余时间 |

### 5.3 领奖与自动化

| # | 功能 | 旧插件 | 状态 | 备注 |
| --- | --- | --- | --- | --- |
| 9 | 邮件领取 + 删提醒邮件 | `mailQ` | 🟡 | `tickMail()`：`mid/title/content/hasAttachMent/Geted` 已核对；`!Geted` 才 `ReadMail`，删两类提醒 |
| 10 | 道具过期提醒拦截 | 内置 | 🟡 | 已并入 `tickMail()` 的删除分支 |
| 11 | 一键领取 | 内置 | ✅ | 面板「奖励」页按钮 → `AUTO.claimSweep()`；另有文字按钮扫描兜底 |
| 12 | 每日任务（敲鼓 / 免费一抽 / 次卡 / 月卡周卡 / 元宝树 / 礼包码） | `dailyQ` | 🟡 | 月卡/周卡 `SendClientPrivilegeRewardReq`、斗地主免费豆 `fJt.SendClientGetWeekFreeBeanReq` 已接；敲鼓/元宝树/抽卡/礼包码按红线不自动 |
| 13 | 清红点（仅隐藏） | `redQ` | ✅ | `tickRedpoints()`，**默认关闭**（只藏不领，会掩盖可领入口） |

### 5.4 对局辅助

| # | 功能 | 旧插件 | 状态 | 备注 |
| --- | --- | --- | --- | --- |
| 14 | 跳过求桃 | 内置 `0x3` 桃条目 | 🟡 | `tickSkips()`：协议记目标座位，非自己才点「取消/否」，默认关闭，**待真机验证** |
| 15 | 跳过助战询问 | 内置 `0xbc3` 助战条目 | 🟡 | 同上，正文含「助战」即点「取消/否」，默认关闭 |
| 16 | 连点 / 智能选牌 / 出牌自动确定 | 内置 | ⬜ | P4，需谨慎 |
| 17 | 张昌蒲分牌（左/右/中键） | 内置 | ⬜ | 低优先级 |
| 18 | 屏蔽特效 | `blockQ` | ⬜ | 锦囊特效 / 他人动态皮肤 / 传说秀进场 / 首领出现 / 连杀 |

### 5.5 读取类工具

| # | 功能 | 旧插件 | 状态 | 备注 |
| --- | --- | --- | --- | --- |
| 19 | 战绩胜率统计 | 独立窗口 `recordHTML` | ⬜ | 纯读取 |
| 20 | 皮肤台词语音（搜索/试听/下载） | 独立窗口 `taiciHTML` | ⬜ | 纯读取 |
| 21 | 皮肤收集进度（朱砂合成） | 独立窗口 | ⬜ | 纯读取 |
| 22 | 百胜战功进度 | 独立窗口 | ⬜ | 纯读取 |
| 23 | 道具获取记录 | `hintQ` | ⬜ | 记录 + 清空 |
| 24 | 一键代码观星 | 工具区 `#guanxing` | ⬜ | 汇总在售/活动/充值消费/夺宝/祈福/兑换/新品皮肤 → `json2html` 独立窗口；实现已截取，见 `OLD-PLUGIN-GUANXING-SHANHETU.md` §1 |
| 25 | 山河图手册 | 工具区 `#shanhetu` | ⬜ | `SGS.shtHTML(rogejson)` 生成《加点模拟器/BOSS查询》网页，左键弹窗/右键下载 .html；实现已截取，见 `OLD-PLUGIN-GUANXING-SHANHETU.md` §2 |
| 26 | 布局配置（左顶右底 / 拖拽 / 持久化） | `layoutTemplate` | ⬜ | 面板已存在，未接布局系统 |

### 5.6 明确不还原

| 功能 | 原因 |
| --- | --- |
| AI 接管挂机（`autoQ`） | VIP + 自动对战 |
| 黄盖苦肉速刷百胜 | VIP + 自动对战 |
| 自动秒杀 | VIP + 自动购买 |
| 刷手气卡（`sqkQ`） | VIP + 自动重开 |
| 皮肤替换（`skinQ`） | 旧插件源码中已注释停用 |
| 录像下载（`getrecordQ`） | 旧插件源码中已注释停用 |
| 9.5 折充值 | 付费 |
| 界小抄激活码 | 付费授权 |
| 邀请互助 | 请求作者服务器 |
| 三国锦绣搭配网页 | 作者外部站点 |
| 山河图手册的「在线版」 | 作者外部站点；本地生成版（`SGS.shtHTML`）已截取，见 `OLD-PLUGIN-GUANXING-SHANHETU.md` §2 |
| 皮肤壁纸（`getskinQ`） | 依赖微端，浏览器版无意义 |

### 5.7 已具备的地基（旧插件没有或更弱）

| 能力 | 位置 | 说明 |
| --- | --- | --- |
| 管理器单例捕获 | `__SGS_MGR__` | 130+ 类实例；领奖 / 邮件都靠它 |
| 窗口管理器 | `__SGS_WIN__` | `mgr.i(name)` 开窗 / `CloseWindow(name)` |
| 节点操作层 | `__SGS_L__` / `__SGS_ACT__` | 找节点 / 坐标点击 / 关窗 |
| 协议通道 | `__SGS_PROTO__` | 明文协议，旧插件的核心依赖 |
| 游戏数据字典 | `data/game-data.json` | events 1062 / cards 2878 / heroes 1631 |

---

## 六、实现优先级

**P0 — 打通记牌器（用户需求 3/4）**
1. 进对局抓协议字段（`__SGS_PROTO_STATS__()`）
2. 记牌器状态机 + 侧栏面板

**P1 — 领奖闭环（用户需求 1/4）**
3. 邮件真机验证（打开一次邮件界面即可）
4. 生日礼 / 斗地主 / 节日签到接口补齐
5. 每日任务（敲鼓 / 免费一抽 / 次卡 / 月卡周卡 / 元宝树 / 礼包码）
6. 一键领取

**P2 — 低风险纯增益**
7. 跳过求桃 / 助战询问
8. 弹窗补齐（结算 / 皮肤包动画 / 天书 / 军典广告）
9. 屏蔽特效

**P3 — 读取类工具**
10. 战绩胜率统计
11. 皮肤台词 / 收集进度 / 百胜战功
12. 道具获取记录 / 代码观星 / 布局配置

**P4 — 对局辅助（需谨慎）**
13. 连点 / 智能选牌 / 出牌自动确定

**待实测**：山河图 overlay（用户需求 4/4）、面板界面自检

---

## 七、参考产物

| 文件 | 内容 |
| --- | --- |
| `runs/xc-deob.js` | **还原后的核心代码（本轮重生成，669 KB）** |
| `runs/xc-strings.json` | 8243 条 `index → 明文` 映射 |
| `runs/xc-deob-cn.txt` | 还原后代码里的 177 个中文串 |
| `runs/xc-deob.log` | 解混淆过程日志 |
| `runs/xc-deob-run.js` | 解混淆脚本（可复跑：`node runs/xc-deob-run.js`） |
| `sgs-assistant/docs/OLD-PLUGIN-GUANXING-SHANHETU.md` | **一键代码观星 / 山河图手册 两段实现截取** |
| `runs/xc-gen-doc.js` | 上述截取文档的生成脚本 |
