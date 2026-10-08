# 三国杀助手 — 任务交接清单

> 交接给新会话。上一会话因思考区自我循环严重污染，主动终止。
> 新会话请**直接读本文件开工**，不要重新探索。

---

## 一、用户目标（原话）

> 我想写个插件，我记忆力不太好，还有每日需要领取的奖励，弹窗点击的太烦，搞个记牌器，还有自动领取所有奖励
> 补充要求：做的时候最好把山河图随机事件直接显示出名字来

四个功能：**记牌器** / **自动领取每日奖励** / **自动关闭烦人弹窗** / **山河图随机事件名显示在地图上**。
运行环境：**浏览器里直接玩网页版**（H5 客户端）。

> 后续追加需求：**透视**（看到其他座位手里是什么牌）—— 见 4.18。

---

## 二、环境与工具（已就绪）

| 项 | 值 |
| --- | --- |
| 工作区 | `H:\AIWork2026` |
| 插件目录 | `H:\AIWork2026\sgs-assistant` |
| 侦察/工具目录 | `H:\AIWork2026\runs` |
| 游戏地址 | `https://web.sanguosha.com/220/h5_2/index_210000.php` |
| 调试实例 | Edge，CDP 端口 9222，profile `runs\cdp-profile` |
| 扩展 ID | `kdfneahjnhefooebhcicepgeclflhfcg`（**2026-10 实测值**；解压扩展 ID 由绝对路径派生，工作区改过名，旧值 `bhebmkidgibgiolhobkbhklojabgkgbp` 已失效） |

### 启动调试实例

```powershell
$edgeExe = 'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'
$argList = @(
  '--remote-debugging-port=9222',
  '--user-data-dir="H:\AIWork2026\runs\cdp-profile"',
  '--no-first-run', '--no-default-browser-check',
  '--enable-unsafe-extension-debugging',
  '--disable-features=DisableLoadExtensionCommandLineSwitch',
  '--disable-extensions-except="H:\AIWork2026\sgs-assistant"',
  '--load-extension="H:\AIWork2026\sgs-assistant"',
  'https://web.sanguosha.com/220/h5_2/index_210000.php'
)
Start-Process -FilePath $edgeExe -ArgumentList $argList
```

> **路径带空格必须用双引号包住**（写在参数值内部）。否则 Windows 会把
> `--load-extension=H:\Git` / `Work2026\sgs-assistant` 拆成两个参数，
> **扩展静默不加载**（edge://extensions 里根本没有它），且不会报错。
>
> 同一个拆分也会截断 `--user-data-dir`：当时的 profile 参数被切成了
> `H:\Git` + `Work2026\runs\cdp-profile`，于是 Edge 在 `H:\` 下凭空建了个
> 205 MB 的 `Git` profile 目录（已于 2026-10-04 清理）。工作区改名成
> `H:\AIWork2026` 后路径不再含空格，这两种拆分都不会再触发。
>
> 2026-10 实测（Edge 154）：只加 `--load-extension` 时扩展加载后仍是
> `DISABLED`，且 `chrome.management.setEnabled` 报
> `cannot be modified by user`；补上 `--disable-extensions-except=<同一路径>`
> 后即为 `ENABLED`，无需再手动 setEnabled。`ext-refresh.js` 里
> `chrome.developerPrivate.reload` 的回调在新版 Edge 上不触发（会挂起），
> 重载改用 cdp-eval 直接调用 `chrome.developerPrivate.reload(id,{failQuietly:true})`
> 再查 `ext-info.js` 确认状态。

### 改完代码后的固定动作（必须按序）

```powershell
node runs\ext-reload.js kdfneahjnhefooebhcicepgeclflhfcg   # 重载扩展（会临时开一个 edge://extensions 标签页再关掉）
node runs\cdp-eval.js sanguosha "location.reload()"          # 刷新游戏页
```

> `ext-reload.js` 用 `chrome.developerPrivate.reload(id,{failQuietly:true})`，
> **ID 写错不会报错、静默不重载**（本轮踩过）。重载后扩展可能瞬时是 `DISABLED`，
> 脚本会顺带 `getExtensionsInfo` 打印 `state`；若一直是 DISABLED 再跑一次即可。

### 工具清单（`runs/`）

| 脚本 | 用途 |
| --- | --- |
| `cdp-eval.js` | 在页面里执行任意 JS：`node cdp-eval.js sanguosha "<表达式>"`；首参给 `ws://…` 时直接打该 target（service worker 等） |
| `shot.js` | CDP 截图：`node shot.js sanguosha out.png` |
| `click-cdp.js` | CDP 原生鼠标点击（DOM 与 canvas 通用）：`node click-cdp.js sanguosha <x> <y>` |
| `ext-reload.js` | 重载解压扩展：`node ext-reload.js <扩展ID>` |
| `sgs-unpack.js` | 解包游戏包：`sgsGame.sgs`(ZIP) → 内层明文 JS（27.5 MB） |
| `hot-peek.js` | 把 `inject.js` 的透视代码段热注入运行中的页面（不刷新、不打断对局） |
| `peek-test.js` | 离线跑 `peek.js` 的合并/渲染（最小 DOM 桩） |
| `peek-proto-test.js` | 离线跑 `inject.js` 透视段的协议状态机 + 座位模型 |

> 本节其余脚本（`inject-fn.js` / `detail.js` / `tq.js` / `nav.js` / `ext-enable2.js` /
> `test-popup.js` 等）随旧 `runs/` 目录一起丢失，需要时按上表同款写法补。

---

## 三、已完成

### 3.1 配置解密（100% 打通）

`.sgs` = ZIP → AES-128-CFB → gunzip → JSON。138 个配置全部解出到 `runs/game/decoded/`。

```
configKey = [21,51,69,107,85,94,55,120,97,78,63,45,114,101,81,62]
configIV  = [144,101,62,55,36,70,86,69,35,117,67,33,109,85,97,226]
cfbProtocolIVHex = "15FF010034AB4CD355FEA122084F1307"   # 协议用，尚未接通
```

### 3.2 游戏数据字典

`runs/game/sgs-game-data.json` → `sgs-assistant/data/game-data.json`（755 KB）

```
events 1062 条（id/name/desc/options）
cards  2878 条（id/name/pinyin/suit/rank）    ← pinyin 用于牌面 skin 反查
heroes 1631 条
```

### 3.3 插件骨架（可加载，四项功能代码全部就位）

```
sgs-assistant/
├── manifest.json      MV3，MAIN + ISOLATED 双世界，含 background
├── README.md          使用说明
├── data/game-data.json
└── src/
    ├── background.js  后台自检
    ├── inject.js      主世界：通信监听 + Laya 操作层 + 自动化执行体（~700 行）
    ├── content.js     隔离世界：总线 + Shadow DOM 面板 + 设置下发
    └── modules/
        ├── deck.js    记牌器核心 + skin→中文牌名
        ├── rewards.js 界面按钮领奖控制代理（兜底）
        ├── claims.js  内部接口领奖控制代理（主力）
        ├── popup.js   弹窗治理控制代理
        └── rogue.js   山河图事件名 overlay
```

**主世界对外接口**（页面控制台可直接用）：

```js
__SGS_L__                      // Laya 工具层（walk/pos/size/isButton/isWindow/indexPath/nodeAt/layers/describe）
__SGS_ACT__.findByText([...], opts)   // 按文本找节点（buttonOnly/visibleOnly/maxW/maxH/exact/limit）
__SGS_ACT__.windows(detail)           // 弹窗层里的窗口（含按钮、文本）
__SGS_ACT__.findContainer(idx,minW,minH,maxW,maxH)  // 向上找「弹窗级」容器
__SGS_ACT__.clickNode({idx:[...]})    // 点节点（模拟真实鼠标）
__SGS_ACT__.clickAt(x,y)              // 按 canvas 坐标点
__SGS_ACT__.closeWindow({idx:[...]})  // 调窗口 Close()
__SGS_ACT__.tree()                    // 可见节点全量
__SGS_WIN__                   // 窗口管理器（mgr/names/isOpen/open/close）
__SGS_MGR__                   // 管理器单例捕获（all/one → dJt/_Jt 等）
__SGS_AUTO__.claims / .rewards / .popups   // 自动化配置与命中计数
```

---

## 四、本轮实测的关键事实

### 4.1 坐标系统（已实测确认）

Laya **2.12.2**，`scaleMode = "full"`，`designWidth/Height = 1220x600`，
canvas 属性与 CSS 尺寸都是 **921x642**，`stage.width/height = 921x642`，
`stage._canvasTransform` 与 `stage.transform` **都是单位矩阵**。

**结论**：`node.localToGlobal()` 的结果就是 canvas 内的像素坐标；
页面坐标 = `canvas.getBoundingClientRect().left/top` + 上述坐标（实测 canvas 位于 0,0）。
节点自身缩放不影响左上角坐标，`localToGlobal(0,0)` 直接可用。

> 注意：`AdPushWindow` 这类窗口自身 `scaleX ≈ 0.755`（= 921/1220），所以窗口宽 966 而屏幕只到 921，属正常。

### 4.2 点击机制（已实测打通）

在 canvas 上派发原生事件即可走完整 Laya 命中链路：

```js
cvs.dispatchEvent(new MouseEvent('mousemove', {clientX, clientY, bubbles:true, cancelable:true, view:window, button:0, buttons:0}));
cvs.dispatchEvent(new MouseEvent('mousedown', {... buttons:1}));
cvs.dispatchEvent(new MouseEvent('mouseup',   {... buttons:0}));
cvs.dispatchEvent(new MouseEvent('click',     {... buttons:0}));
```

验证记录：
- 点「信件」按钮（`/Stage/$Bi/bkt/tQt/EVi` @859,45 41x24）→ 打开 `MailWindow` ✅
- 点广告弹窗关闭键（19x20 @803,110）→ `AdPushWindow` 与弹窗层 `Uzt` 一起消失 ✅
- 点提示框「确定」→ 弹窗关闭并跳转登录页 ✅
- `hitTestPoint(中心)` 返回 true，`hitTestPoint(远处)` 返回 false ✅

### 4.3 节点与窗口结构

| 形态 | 特征 |
| --- | --- |
| 按钮基类 | `rjt`（含 `onMouse`/`changeState`/`addClick`/`ResetBtnSkin`） |
| 文字按钮 | `EVi`（继承 `rjt`），子节点 `jSt` 承载文字 |
| 窗口基类 | `tTt`，暴露 `Close()` / `Show()` / `Hide()` / `removeModalBg()` |
| 弹窗层 | stage 直接子节点中带 `modalBg` 遮罩者（类名 `Uzt`），层内子节点是窗口 |
| 窗口实例 | `AdPushWindow`(h0i 966x576)、`MailWindow`(a$i 392x462) |
| 非标准提示框 | 只挂一个 `EVi`「确定」，父链 `HJt` 391x226 → `XBi` |
| 文本读取 | `label` / `text` / `labelText` / `_text` |

`name` 字段只有窗口有（`MailWindow`/`AdPushWindow`），其余节点 name 为空、类名混淆。
**path 会重复**（类名兜底），唯一标识用 `L.indexPath()`（childAt 索引链）。

### 4.4 扩展加载（P4 已解决）

Chromium 137+ 起 `--load-extension` 默认失效，且**加载出来的扩展状态是 DISABLED**。三步走：

1. 启动参数加 `--disable-features=DisableLoadExtensionCommandLineSwitch`
2. 再加 `--enable-unsafe-extension-debugging`
3. 启动后必须启用一次：

```js
// 在 edge://extensions 页面里执行（chrome.management 可用）
chrome.management.setEnabled('bhebmkidgibgiolhobkbhklojabgkgbp', true, cb)
```

**每次 `chrome.developerPrivate.reload()` 之后都会退回 DISABLED，必须重新 setEnabled** —— `runs/ext-refresh.js` 已封装。

验证：`__SGS_BRIDGE__` / `__SGS_ACT__` / `#sgs-assistant-root` 三者都出现即成功。

### 4.5 自动化架构

- **执行体在主世界**（`inject.js` 的 `AUTO`），只有主世界能访问 Laya
- **隔离世界只发开关**：`window.postMessage({__sgsCmd:true, cmd:'set-config', config:{...}})`
- 主世界回传：`auto-log` / `laya-scan` / `windows-dump` / `click-result`
- 主世界 800ms 轮询 `tickRewards()` + `tickPopups()`，1200ms 轮询 `scanAll()`

**关弹窗两条路径**：
1. 标准窗口层（带 `modalBg`）→ 窗口名/正文命中提示特征 + 窗口内有「确定/关闭」按钮 → `Close()`
2. 兜底：只带 1~2 个关闭语义按钮、容器 200x140~1100x720、正文不含危险词与交互词（选择/出牌/弃牌/使用/发动/技能/目标/结算…）→ 点按钮

### 4.6 牌局数据线索（来自 `runs/sgs-handwatch.jsonl`，490 帧）

牌局 UI 文本长这样：

```
座位: 鲁肃 0/0 出杀次数：1/1 … 诸葛亮 1/2 … 界华佗 0/1 … 甘宁 4/4 … 界关羽 4/4
动作: "正在思考 桃" "正在思考 无懈可击" "正在思考 万箭齐发" "正在思考 驱虎技能"
      "诸葛亮使用" "荀彧使用" "曹操使用" "界关羽(您)使用"
其他: "整理手牌" "离开" "您已阵亡，可以离开" "确定" "取消" "擂台 向你发起挑战"
```

牌面本身是图片节点（skin），文本里读不到牌名 → 记牌器走 **skin → pinyin → 中文名** 反查。

### 4.7 关弹窗识别修复（本轮实测发现）

第一次开自动关弹窗时 `AdPushWindow` 没被关掉。根因：它的关闭键是**没有文字的 X 图标**
（`rjt` 19x20，`label` 为空），而判定只认「确定/关闭」这类文字。修复五处：

1. `windows(true)` 收集按钮时标记 `direct`（是否窗口的直接子节点）
2. `hasCloser()` 增加通道：**无文字 + 尺寸 <=50x50 + 是窗口直接子节点** → 视为关闭键
3. safe 模式增加「图片类弹窗」放行：**窗口内文字 < 40 字 且尺寸 >= 300x200** → 视为广告/公告
4. 暴露 `AUTO.tickPopups()` / `AUTO.tickRewards()`，便于热更新与测试
5. `content.js`：`keepNames` 为空数组时不再覆盖主世界默认白名单
   （原来面板初始化会把 `MailWindow` 等保护名单清空 —— 实测确实被清空了）

**验证方式**（不刷新页面，避免打断游戏）：用 CDP 热注入同款逻辑 + 造一个受控假窗口：
`Laya.Sprite` 挂 `Close/Show/removeModalBg` 冒充窗口，配 `modalBg` 遮罩，
再挂一个 19x20 无文字 `Laya.Button` 作直接子节点。结果：4 秒后假窗口层被移除，`popups.hits` 0 → 1。
热注入脚本：`runs/hot-fn.js`（页面刷新后失效，届时由源码版本接管）。

### 4.8 左侧入口与红点（本轮实测）

**左侧那排入口不在显示树里**。`/Stage/$Bi/bkt/rOt` 的 `wSt` 子节点 `_children` 长度为 0，
但 `rOt.leftBtns` 是一个 13 元素的数组，元素是 `msi` 对象（游离节点，`parent === null`）。
红点状态挂在按钮的 `redPointIsShow` 属性上，`redPointTex` 是贴图。

按钮清单（局部坐标相对 rOt，尺寸均约 75x75，`name` 即 `"btn" + id`）：

```
i   name        x,y      有红点  exId
0   btn3        0,10     ★     202003   → ActivityWindow（活动，全是折扣/特惠消费入口）
1   btn75       0,80     -     0
2   btn303      0,150    ★     0        → BlessNewWindowView（祈福，只有「查看视频」「查看奖励」）
3   btn24       0,220    ★     202022   → TianGongWindow（天工）
4   btn59       0,290    -     202028
5   btn48       0,360    ★     202023   → 点击无反应
6   btn51       0,430    -     202024
7   btn2        0,500    ★     202002   → 军典界面（左侧二级菜单）
8   btn4        0,570    ★     202004
9   btn10187    0,640    -     -
10  btn302      0,710    -     0
11  btn7018     0,780    ★     202028
12  btn304      0,850    -     0
```

**点击方式**：`rOt` 全局位置 `(11,89)` + 按钮局部中心 → `clickAt`。注意按钮 `y` 会随列表滚动变化，
每次都要重新读。局部 `y > 440` 的按钮落在屏幕外（stage 高 642）。

**`rOt.leftBtnClicked` 的真实签名**是 `switch (t.name)` 分发（`"btn"+Ggt.TASK` → TaskWindow），
但它对多数按钮不生效（前置的 `IsFuncClose` 判断会拦截），**坐标点击才可靠**。

**红点清除**：置 `b.redPointIsShow = false` 即可，游戏会定时重设，所以做成 2s 周期任务。
已实现于 `inject.js` 的 `tickRedpoints()` + `findROt()`（按 `leftBtns` 特征找节点，不依赖索引路径）。
实测：清除 7 个红点，截图红色像素 10781 → 6951。

### 4.9 领奖探索结论（未完成）

二级菜单路径：**军典(btn2) → 左侧菜单 → 任务**，可看到每日任务列表：
`登录游戏 / 在线10分钟 / 胜利1场对局 / 胜利2场对局`，各带奖励数量（x30/x90/x20/x80/x110）。
任务条目布局：任务名 @x=252，奖励数量 @x=243/299/355，y 每行 92px（255/347/439/531）。

**但这些界面里都找不到文本形式的「领取」按钮**（主界面全局搜「领取」也返回空），
推断领取按钮是图片资源，纯文本检索够不到。点击任务条目区域无反应（应属已领状态）。

**已解决**（见 4.10 / 4.11 / 4.12）：领取按钮是图片、文本检索不到 —— 但根本不需要点按钮，
直接调游戏自己的管理器接口即可领到奖励。

---

### 4.10 窗口管理器 Ms（本轮实测打通）

`Ms` 是游戏窗口管理器单例（压缩名），原型上有 `i(name,args)` 开窗、`CloseWindow(name)`、
`windowNameList`、`ShowTextPrompt`、`SwitchScene` 等。外部拿不到引用，但
**它继承 `Laya.EventDispatcher`**，而 `window.InvokeFun` 内部会调 `Ms.I().event(...)`，所以：

```js
var proto = Laya.EventDispatcher.prototype, orig = proto.event, found = null;
proto.event = function () { if (this.constructor.name === 'Ms') found = this; return orig.apply(this, arguments); };
window.InvokeFun('probe');   // 触发一次
proto.event = orig;          // 立刻还原
// found 即 Ms 单例
```

拿到后可直接 `mgr.i('TaskWindow', 2)` / `mgr.CloseWindow('AdPushWindow')`，比坐标点击可靠得多。
已封装为 `__SGS_WIN__`（`mgr/names/isOpen/open/close`）。

### 4.11 管理器单例捕获（本轮核心突破）

游戏所有管理器（任务 `dJt`、活动 `_Jt`、红点 `kjt`、`fJt`…）都是 webpack 模块内单例，
但**都继承 `Laya.EventDispatcher`**。只要在**页面加载早期** hook 该原型的 `on()` 与 `event()`，
任何注册过监听或派发过事件的管理器实例都会被记录：

```js
// inject.js 中 20ms 轮询等 Laya 就绪后立刻 hook（必须早于游戏模块初始化）
proto.event = function () { push(this); return origEvent.apply(this, arguments); };
proto.on    = function () { push(this); return origOn.apply(this, arguments); };
```

**关键**：`on()` 的 hook 必须够早 —— `dJt` 只在初始化时 `on()` 一次，晚一步就永远拿不到。
实测捕获 1200 个实例，含 `dJt` / `_Jt` / `kjt` / `fJt` 等。已封装为 `__SGS_MGR__`。

### 4.12 领奖接口清单与实测领取（P0 已解决）

拿到管理器后，**领奖不再需要点任何界面按钮**：

| 管理器 | 接口 | 用途 |
| --- | --- | --- |
| `dJt` | `N(questId)` | 取任务对象（`CanAward` / `HasAward` / `ToShow`） |
| `dJt` | `W(questId)` | **发送领奖请求** |
| `dJt` | `DailyTasks` | 每日任务列表 `[{Position,TaskId}]` |
| `dJt` | `GetSevenDayCanReceiveDays()` | 七日登录可领天数 |
| `_Jt` | `CheckCurQuestAward()` | 当前节日/福利任务是否可领 |
| `_Jt` | `currentSpringFesQuestID` | 当前福利任务 id |
| `_Jt` | `SendGetJDRewardReq()` / `IsJDCanReward()` | 军典累计活跃奖励 |
| `_Jt` | `SendSevendayprizeReq(day)` | 七日奖励 |
| `_Jt` | `SendClientFestivalSignGetRewardReq()` 等 | 节日 / 累计签到 |
| `_Jt` | `JDHaveRewardList` | 军典已领 id 列表 |

**实测领取成功**：

```
before {CanAward:true,  HasAward:false}
dJt.W(169493)
after  {CanAward:false, HasAward:true}   ← 奖励到账
```

已实现于 `inject.js` 的 `tickClaims()`（面板开关「自动领奖（内部接口）」），
优先级：福利任务 → 七日登录 → 军典活跃 → 每日任务；每轮只领一项，冷却 2s。

**同时修掉一个设计错误**：原「清除红点」只是把红点藏起来，奖励一个没领，反而掩盖了
真正可领的入口 —— 现已**默认关闭**，面板开关文案改为「隐藏左侧入口红点（只影响显示）」。

---

### 4.13 旧插件逆向（本轮完成）

对象：`F:\Work2026\SGS_Xiaochao\xiaochao_orign.js`（三国杀打小抄·山河图 v3.4.4.4，作者 孤独尊/haoming，MIT，803,637 字节）

结构解剖：

| 区间 | 内容 |
| --- | --- |
| L1–L171 | 元数据 + 辅助函数（`localGet/localSet/redefine/openWindow/…`） |
| L172–L777 | `window.SGS.mainHTML` —— 设置面板（13 个功能开关 + 工具区） |
| L779–L1997 | 各独立窗口 HTML（战绩/台词/皮肤/布局/山河图手册数据表） |
| L1998–L2833 | `mainScript()` → `Init(SGS)`，内含 `setLayout()` / `loadConfig_w()` |
| L2834 | jsjiami.com.v7 混淆体（619,799 字符）= `Init()` 的返回值，**全部核心逻辑** |

**已完整解混淆** → `runs/xc-deob.js`（11,212 行 / 658 KB），6686 个字符串调用解出 6685 个。

方法：jsjiami v7 标准结构 —— `function _0x24a3(idx, key)`，索引偏移 `0x15f`，字符串表由 `_0xe984()` 返回（6689 项），解码 = `RC4(base64decode(table[idx-0x15f]), key)`。
两个易踩的坑：
1. `_0x303ff2` / `_0x41c852` **不是解码器**（分别是属性代理与属性过滤器），只有 `_0x24a3` 是
2. 混淆体执行会走到依赖 `Laya` 的代码而抛错，须**利用函数声明提升**在 blob 之前把 `_0x24a3` / `_0xe984` 取出（`runs/xc-deob.js` 已这么做）

复跑：`node runs/xc-deob.js`（输出 `xc-deob.js` / `xc-strings.json` / `xc-deob.log`）。
功能全清单与技术对照见 `sgs-assistant/docs/OLD-PLUGIN-FEATURES.md`。

---

### 4.14 协议通道 —— 记牌器地基（本轮打通）

**关键事实：游戏自己把明文协议打出来了。** `runs/game/sgsGame_inner.bin` 内有 2577 处 `console.log`：

```js
// 收帧（无条件执行）
console.log("%o","--------[Received client"+(s.FromSocket2?"2":"1")+"]"+s.ClassName+" ID:"+s.Id+" Size:"+s.Size+" … detail:"), s.Print();
// Print()：IsLog 为真时输出协议对象 JSON
Print(){ if(rs.I().IsLog){ let t={}; swt.DataCopy(this,t,this.printIgnorList); console.log(JSON.stringify(t)); for(let i in t) delete t[i]; } }
// 同处还会派发协议事件
this.InDispatchProtocolProcess=!0; let t=new lF(s.ClassName,s); this.event(s.ClassName,t); this.InDispatchProtocolProcess=!1;
```

`isLog` 来源：`this.isLog = c1t.IsApp ? 1==parseInt(t.IsAppLog) : 1==parseInt(t.IsLog)`（服务端配置），且类定义里默认 `isLog=!0`。

**结论：记牌器不需要解密 WebSocket / protobuf**（`runs/sgs-capture.json` 那 2229 帧加密包是弯路）。

已实现两条通道（均在 `inject.js`）：

1. `PROTO` + `protoInstall()` —— 劫持 `window.console.log`；从描述行 `----[...]` 取 ClassName，从 `{` 开头的实参取协议对象；描述行先出现、JSON 行紧随，用 `PROTO.pending` 配对。因游戏可能整体替换 `console`，`autoTimer` 每 800ms 重装一次。
2. `MGR` 的 `proto.event` hook —— 直接记 `(type, data)`。

名字过滤：只接受 `/^(Client|PubGs|Gds|Ss|Cs|Server|Gs|Pc|Web|Bp|Np)/` 开头或 `Req|Rep|Ntf|Ack|Res|Push` 结尾，滤掉 `Received/Sent/Cached/MessageEvent` 等日志格式词。

实测：
- 登录阶段确实捕获到真实协议：`ClientUserBaseInfoReq` / `ClientGetOfficerRunDataReq` / `GdsGuildWarInfoSsNtf` / `ClientOfflineUserUidRep`
- 大厅阶段协议稀少（正常），此时 `__SGS_MGR__` 为 158 实例 / 130 类，`dJt`/`_Jt` **尚未初始化**（需进对应界面才创建）
- 面板「记牌」页状态行会显示「协议 N 条 / M 类 + 最近协议名」
- 对外接口：`__SGS_PROTO__`（含 `counts` / `samples`）、`__SGS_PROTO_STATS__(n)`；指令 `proto-stats`

**仍待做**：进一局牌（或山河图），用 `__SGS_PROTO_STATS__()` 看 `PubGsCMoveCard` 等牌局协议的字段，据此写记牌器状态机。

---

### 4.15 邮件领取（本轮接入，待真机验证）

`hJt` 是邮件管理器（由 `__SGS_MGR__` 捕获）。接口已**在页面实测存在**：

```
requestMail()  ReadMail(mid)  DeleteMail(mid)  GetGift()  GetSystemMailList()
GetFriendMailList()  GetUnReadCtn()  SendClientDbsGetgmawardReq()  respMailListHandler()
属性：systemMailList / friendMailList
```

已接入 `tickClaims()` 的第 0 步（`tickMail`，见 `inject.js`，对外 `__SGS_AUTO__.tickMail`）：
每 60s `requestMail()` 拉一次列表，然后
- 标题或正文含「道具过期提醒」「不良游戏行为警告」→ `DeleteMail(mid)`
- `hasAttachMent` 为真 → `ReadMail(mid)` 领附件

字段名 `mid` / `title` / `hasAttachMent` 取自旧插件还原代码（`runs/xc-deob.js`），均为**明文**；
删除的判定文案亦与旧插件一致（它同样只删这两类提醒，其余走 `ReadMail`）。

**注意**：`hJt` **只在打开过邮件界面之后才实例化**。实测本会话 `__SGS_MGR__.one('hJt')` 为 `null`，
`__SGS_WIN__.mgr().i('MailWindow', 0)` 也没能开出来，**故本轮未能真机验证** —— 用户手动打开一次
邮件界面（左上「信件」）即可让 `tickMail` 生效。若届时 `hasAttachMent` 不匹配，用
`__SGS_MGR__.one('hJt').systemMailList[0]` 打印实际字段名再对齐。

---

### 4.16 记牌器状态机（P0 已完成，本轮真机验证）

**进对局方式（安全、无排位影响）**：大厅「经典场」→ 顶部页签「身份演武」→「快速开始」→ 选将。
演武是 PvE，AI 补位，不碰排位。入口坐标见下，会随窗口尺寸变化，每次用 `findByText` 重新定位：
`经典场` @约(252,300)、`身份演武` 页签 @约(345,83)、`快速开始` @约(558,523)、选将卡 @(452,390)。

**协议对象外面包了一层**：`console.log` 里抓到的是 `{ msg: <协议对象>, socketData: ... }`，
所以 `PROTO` 监听器里要 `obj.msg` 解包。协议对象字段是**旧协议名**（明文），实测：

```
PubGsCMoveCard: { CardIDs:[66], MoveType:2, FromZone:5, ToZone:3,
                  FromID:6, ToID:255, SrcSeatID:6, SpellID:0,
                  CardCount:1, DataCount:1, CardPosition, ... }
PubGsCUseCard:  { SeatID:6, CardID:3, spellID:7, fromZone:5, useType:1, DestSeatIDs:[..] }
MsgGameTurnNtf: { TurnCnt:1 }
GsCGamephaseNtf:{ SeatID:2, Round:0 }
```

**zone 常量（旧协议 `pq`，`class pq` 内 `zoneDict`）**：

```
1 摸牌堆  2 弃牌堆  3 处理区  4 场外  5 手牌区  6 装备区
7 判定区  8 技能区  9 洗牌区  10 临时区  11 弃牌缓存区  12 结束  13 时区
```

**MoveType 常量（旧协议 `O$t`，`class O$t extends Sq`）**：

```
0 无效 1 发牌 2 使用 3 打出 4 弃置 5 选择 6 展示 7 收回 8 获得
9 入弃牌堆 10 闪电 11 交换 12 重铸 13 拼点 14 判定弃置 15 移动
16 使用后弃置 17 打出后弃置 18 获得 19 仅移动 20 铸凿 21 仅展示
22 替换装备 23 自若 24 游戏结束 27 给予
```

**牌 ID = 牌型 ID**，直接查 `data/game-data.json` 的 `cards[id]`（如 73/141/153 都是「杀」，
124 桃 / 128 闪 / 3 顺手牵羊 / 109 无懈可击）。**但同一牌型多张实体牌共用一个 ID**
（`suit`/`rank` 是逗号分隔的多个取值），所以协议层**无法区分具体花色点数**，
记牌器只能按牌名计数。

**判定「这张牌被亮明」**（已实现于 `inject.js` 的 `DECK` 状态机）：
进入公开区 `{2,3,4,6,7,9,13}` 且来源不在公开区，或 MoveType 为展示(6/21)。
这样「手牌→处理区(使用)」记一次，后续「处理区→弃牌堆」不重复；
摸牌(牌堆→手牌)、手牌间转移(获得/给予)不计。开局 `GsCStartGameRep` 重置，
`MsgGamePlayCardNtf.CardList` 存为本局牌堆大小。

**注意**：`MsgGamePlayCardNtf.CardList` 实测是 `[1,2,3,…,161]` 的**槽位序号**，
不是牌型 ID，**不能**据此算「剩余某牌型」。若要「剩余」需另找每局牌堆构成
（`CardsBook` 是跨模式目录，`num` 不能直接当本局数量）。

**对外接口**：`__SGS_DECK__`（`seen`/`recent`/`deck`/`total`/`reset()`）、
`__SGS_DECK_LABEL__`（MoveType→中文）。隔离世界 `deck.js` 的 `noteProto()` 做
牌 ID→牌名映射与汇总，`content.js` 记牌页渲染「已亮明 N 张/M 种 + 按牌名计数 + 最近流水」。

实测：一局演武跑到 44 张亮明，面板正确显示「杀 ×7 / 过河拆桥 ×4 / 闪 ×4 / 火攻 ×2 …」
与「座位N · 牌名 · 动作」。截图 `runs/shot-p1-6.png`、`shot-p1-7.png`。

---

### 4.19 山河图：过关奖励 + 集市入口常显（本轮第三轮）

**需求**：① 战斗节点的标签里也显示「过关奖励」；② 集市功能在每章开头就显示出来。

#### 过关奖励 —— 数据只在运行时配置里

静态 `data/rogue-fights.json` 只有 `{name, units}`，没有奖励。奖励在**运行时配置管理器 `yVi`** 上
（`__SGS_MGR__.one('yVi')` 能直接拿到）：

```js
yVi.GetFightInfo(fightId)        // → FightVo：Name / RewardGroup:[奖励组id] / TongQianCnt / IsElite / EnemyGeneralGroup
yVi.GetRewardGroupInfoById(gid)  // → { rewarddesc:'技能多选一', rewarditem:'可以从三个普通战法中选择一个获取', type, allreward }
```

`FightVo.RewardGroup` 由配置里的 `reward` / `reward2` 字段（分号分隔的 id）解析而来。
实测（第一章 虎牢关）：

| fightID | 名字 | RewardGroup | rewarddesc | TongQianCnt | IsElite |
| --- | --- | --- | --- | --- | --- |
| 2302 | 疑兵之计 | [111] | 技能多选一 | 200 | |
| 2301 | 杀良冒功 | [115] | 技能多选一（普通或稀有） | 200 | |
| 2646 | 文远之威 | [103,123] | 战法多选一（史诗）+ 卡牌多选一（史诗） | 500 | ★ |

**实现**：`inject.js` 的 `scanRogueMap()` 里加了 `rogueFightReward(cfg, evId)`，
`yVi` 提到循环外只取一次（`MGR.one` 会重建 1200 条实例表），同 id 用 `rewardCache` 去重，
结果放进 `items[].reward`；`rogue.js` 的 `labelText()` 多渲染一行
「过关奖励：技能多选一 · 铜钱 200」，开关 `CONFIG.showRewards`（默认开）。

标签最终三行：`疑兵之计 / 单位：张郃 / 过关奖励：技能多选一 · 铜钱 200`。
**实测**：地图上三个战斗节点全部渲染正确（截图 `runs/shot-rogue-reward2.png`）。

#### 集市入口常显

集市按钮是山河图地图「左侧视图」（类 `hAt extends wSt`）的 `shopBtn`，`pos(45,180)`，
可见性完全由它自己的 `UpdateShopData()` 控制：

```js
UpdateShopData(){ ShopData && ShopData.isShow ? shopBtn.visible = true : shopBtn.visible = false }
shopBtnClick(){ if (Ajt.I().ChapterVo) { SetLocalValue(ROGUELIKE_SHOP_SHOW, 章号); Ms.I().i('RogueJiShiWindow') } }
```

服务端只在挑战首领关前那一小段把 `isShow` 置真，所以平时按钮是藏着的。
`inject.js` 新增 `ROGUE_SHOP` 模块（1.5s 周期，跟清红点一个套路）：地图界面在、
且 `Ajt.ChapterVo` 存在时，把 `shopBtn.visible` 重新置真，并在**换章时**补一次
`getShopEff(1,true)`（游戏在 `UpdateShopData` 里播的「集市出现」特效）与一条日志。
面板开关「山河图：集市入口常显」，默认开。

**实测**：手动 `shopBtn.visible = false` 后 4 秒内被自动显示回来（`hits:1, chapter:1`）。
**未验证**：集市窗口在「服务端还没下发 ShopData」时打开会显示成什么样（本轮打开时
`ShopData` 是上一局残留的 6 件商品）。若发现空窗，可在 `tickRogueShop` 里加 `mgr.ShopData` 守卫。

#### 顺带修掉的 bug：座位浮层画到别的界面

山河图地图界面里，对局的座位容器还在、但子节点没布局，`GetSeatUiByIndex()` 返回的坐标恒为
`(0,0)` —— 上一局的透视标签被原样画到了山河图左上角，还正好压在「集市」按钮上。
修法：`peekSeatRect()` 里 `if (!p.x && !p.y) return null;`（未布局即视为不在对局中）。

---

### 4.18 透视（各座位手牌）—— 本轮新增

**用户需求**：看到其他座位手里是什么牌。

**先做静态分析定边界**（本轮无对局可打，故走静态路线）。游戏包已可离线拿到，
路径变了，记下来：

```
https://web.sanguosha.com/220/h5_2/sgsGame.sgs?v=<window.mainVersion>
  = ZIP，内含单条目 sgsGame.sgs（27.5 MB，**明文 JS，无需解密/解压**）
```
`index.html` → `libs/after.js` → `loadZip("sgsGame.sgs?v=" + window.mainVersion)`。
`window.mainVersion` 在 index.html 里（本轮 `2026093001`）。解包脚本 `runs/sgs-unpack.js`
（只做了 ZIP 解条目；旧的 `runs/game/sgsGame_inner.bin` 与整个 `runs/` 目录已丢失，本轮重建）。
`versionConf.js` 只有一行 `window.resourceVersion`。

**关键结论（全部来自 `sgsGame_inner.bin` 检索）**：

| 事实 | 位置 / 依据 |
| --- | --- |
| 座位模型同时持有 `handCards` / `handShowCards` / `aiHandShowCards`，新版座位类另有 `visibleHandCards` | `_this.handCards=[]` 构造处；`VisibleHandCards` 定义 |
| 渲染闸门与「知道多少」分离 | `CanRenderHandCardFace(t){ return this.CanViewHandCard \|\| this.IsVisibleHandCard(t) }` |
| 张数 getter 会因可见性换源 | `HandCardCount: get(){ return this.CanViewHandCard ? this.handCards.length : this.handCardCount }` |
| 其他座位只发**张数** | `GsCUpdateRoleDataNtf` 读取处：`this.HandCardCount=t.readUnsignedShort()`，无牌面数组 |
| 摸牌进他人手牌时，客户端用「未知占位」而不是真牌面 | `DrawCards()`：`(o = !c1t.IsViewer \|\| c1t.CanViewHandCard \|\| c1t.IsMatchOB \|\| c1t.IsMateViewer \|\| a ? L$t.GetInstance(l) : cVi.Borrow())` |
| 「该座位已知手牌」是游戏自己维护的集合 | `HandShowCardIDs` / `VisibleHandCardIDs`；移动处理里对非自己座位 `r.HandShowCards.push(...)` |
| 明牌走单独协议 | `onMingPaiInfoNtf`：`MingPaiInfo_list[].mingbai_cards` → `seat.AiHandShowCards`（**数字数组**，不是对象数组） |
| 旁观等级由服务端授予 | `ClientLookonGradeNtf` → `c1t.CanViewHandCard`；`LookGrade_Normal=1 / SIDCARD=2 / all=99` |
| 新版协议字段 | `PubGsCMoveCard`：`card_ids` / `from_visible_hand_cards` / `to_visible_hand_cards` / `visible_hand_cards` / `IsVisibleHandCardSnapshotOnly`；角色同步字段 50 = `hand_card_list` |
| 结算时全场手牌才公开 | 战绩类 `i.HandCards && (t.handCards = i.HandCardIDs)`；`SetOtherData` 用 `t.handcards` |

**结论**：**暗牌牌面是否下发由服务端决定，客户端侧读不到就是读不到**。所以插件做两件事：
读「客户端已知的全部手牌信息」，并把「服务端到底给不给暗牌」做成可实测的探针。

**实现**（三处改动 + 一个新模块）：

```
src/inject.js        PEEK 模块：协议状态机（按座位记进/记出 ZONE_HAND）+ 座位模型读取
                     + 座位 UI 矩形 + probe()；挂进 PROTO.listeners；scanAll 增加 peek 字段
src/modules/peek.js  隔离世界：快照合并（模型 ∪ 协议）→ 面板「透视」页 + 座位下方浮层
src/modules/deck.js  多一行：导出 M.deck.nameOfId（牌 ID → 中文名）
src/content.js       新增「透视」页签、两个开关、指令转发
manifest.json        ISOLATED 注入列表加 peek.js
```

### 座位下方贴牌面（本轮第二轮，真机验证通过）

**座位屏幕坐标**：座位容器（类名 `Bqt`）上有 `GetSeatUiByIndex(i)`，返回该座位的 UI 节点；
`localToGlobal(0,0)` + `width/height` 就是 canvas 内的矩形。实测 8 个座位：

```
i=0 (246,30,146x172)  i=1 (15,110)  i=2 (15,332)  i=3 (72,536,1220x149 ← 自己的宽条)
i=4 (842,332)         i=5 (842,110) i=6 (616,30)  i=7 (431,30)
```
（不同窗口尺寸会变，所以每次快照重新量。`PEEK.container` 缓存容器节点，
`GetSeatUiByIndex(0)` 取不到就重新 walk 找。）

**浮层**：`peek.js` 的 `renderOverlay()` 在 `document.body` 挂一个 `pointer-events:none` 的
fixed 容器，每个座位（**跳过自己**）画一条 `position:absolute; transform:translateX(-50%)` 的标签：

```
left = canvasRect.left + rect.x + rect.w/2
top  = canvasRect.top  + rect.y + rect.h + 3
```

第一行「手牌 N · 未知 M」，第二行已知牌名（明牌用绿底）。实测贴上去正好盖住游戏自己那行
「手牌 N」，不重叠不挡牌。座位坐标进了 `signature()`，窗口缩放会触发重画。

实测一局（身份演武）：标签随牌局实时更新，某座位获得【藤甲】后其标签第二行出现「藤甲」。

**数据来源 1 —— 客户端座位模型**（最准）：座位实例都是 `Laya.EventDispatcher`（会派发
`Mv.DRAW`、监听 `SHOW_HAND_CARDS`），必然落在 `__SGS_MGR__.cap` 里。按 `Index` 倒序取
**每个座位最新出现的实例**（上一局的残留实例会被后出现的覆盖），读：

```
HandCardIDs（手牌牌面，仅对你可见时非空） / HandShowCardIDs（已公开手牌）
VisibleHandCardIDs（新版可见手牌） / AiHandShowCards（明牌，数字数组）
EquipCards / JudgeCards（本就公开） / IsSelf / IsDead / CanViewHandCard / General.CardName
```

**数据来源 2 —— 协议状态机**（兜底，山河图/模型读不到时用）：`PubGsCMoveCard` 里
`ToZone==5` 记入手牌（带 ID 记牌名，不带的记未知），`FromZone==5` 记出手牌
（已知的按张数扣，剩下从「未知」里扣）。`GsCStartGameRep` 重置。

**探针口径**（面板「实测一次」）：`to==ZONE_HAND && from!=ZONE_HAND && toId!=mySeat && 真实 ID 数>0`
→ `hiddenIds`。**`hiddenIds > 0` 就说明服务端确实把暗牌牌面发下来了**，此时协议状态机会自动
把整手牌都记出来，透视就是全亮的；恒为 0 则只能看已暴露的牌 + 未知张数。

**验证**：

离线（无对局）：
- `node runs/peek-proto-test.js` —— 切出 inject.js 的透视代码段跑协议状态机 + 座位模型（假实例），22 条断言全过
- `node runs/peek-test.js` —— 在最小 DOM 桩里跑 peek.js 的合并/渲染，11 条断言全过
- `node --check` 四个 JS 文件 + `manifest.json` JSON 解析 全过

**真机（2026-10，身份演武军争，一局完整跑通）**：

面板「透视」页实际输出：

```
座位 8 · 已知手牌 4 张 / 未知 27 张 · 手牌移动 17 次
服务端未下发暗牌牌面：只能看到已暴露的牌 + 未知张数
座位0 魏延        手牌 4（未知 4）  未知 ×4
座位1 司马朗      手牌 3（未知 3）  未知 ×3
座位2 周泰        手牌 4（未知 4）  未知 ×4
座位3 隐匿        手牌 4（未知 4）  未知 ×4  乐不思蜀（判定区）
座位4 关兴张苞（你）手牌 4          闪 桃 乐不思蜀 铁索连环
座位5 孙策        手牌 4（未知 4）  未知 ×4
座位6 黄忠        手牌 4（未知 4）  未知 ×4  紫騂
座位7 吴国太      手牌 4（未知 4）  未知 ×4
```

`__SGS_PEEK_PROBE__()` → `{mySeat:4, seatModelSeats:8, hiddenCardFaces:0, serverSendsHiddenFaces:false}`

**实测结论（这是本轮最重要的结论）**：

1. **座位模型完全可用** —— 8 个座位、武将名、手牌数、装备区/判定区、明牌全部读到；
   自己的座位靠 `IsSelf` 认出来（本轮是座位 4）。
2. **暗牌牌面服务端不下发**。独立监听 25 秒真实牌局、统计 12 次「进手牌区」的移动：
   只有 1 次（曹操 **获得**一张牌）带真实牌 ID，其余全是 0；8 个座位的 `HandShowCardIDs`
   在自己回合摸牌后也没有新增。→ **透视只能做「已知牌 + 未知张数」，翻不开暗牌。**
3. 反过来，**已暴露的牌一定读得到**：`HandShowCardIDs` 是游戏自己维护的「该座位已知手牌」，
   使用/打出/弃置/获得/明牌都会进这个集合，离开手牌时自动移除。
4. **踩到并修掉的坑**：`MGR.cap` 上限 1200，大厅阶段就被塞满，座位实例再也进不来
   → 座位模型恒为空。改为 `MGR.seats` 单独收（见 `inject.js` MGR.push）。
   另一个坑：探针原先在收到协议时就 `+=`，而 `GAME.mySeat` 只在 `StateID==58` 时置位、
   实战里不触发 → 把自己的发牌当成「暗牌」误报。改为记流水、在 `snapshot()` 里按
   已解析出的 `mySeat` 事后重算。

---

### 4.17 领奖闭环（P1）与弹窗/询问（P2）本轮实测

**邮件（P1-4）**：打开左上「信件」后 `hJt` 实例化（`systemMailList` / `friendMailList`）。字段实测（游戏包 `class uIt.Init`）：`mid` / `title` / `content` / `hasAttachMent` / `Geted`
（`Geted` 由 `gift==1` 得出）。已修 `tickMail`：有附件且 `!Geted` 才 `ReadMail`；
删邮件只按标题命中「道具过期提醒 / 不良游戏行为警告」。本账号当前无邮件，未观察到领取动作。

**领奖接口（P1-5，实测领到）**：`_Jt` 上方法齐全，实测：

```
累计签到：GetAvailableAccumlateSignData() → [{id,awards:[{day,stat}]}]
          GetAccumlateAwdState(id,aw)==2 可领 → SendNewClientAccumlateSignGetRewardReq(id,day)
固定日签到：CheckNewFestivalSignRedDot() 为真 → NewFestivalSignDataDic.elements
          GetFesSignAwdState(aw)==2 → SendNewClientFestivalSignGetRewardReq(id,date)
新军典：HasNewJDRewardRed → ReqDrawAllNewJDRwd()（= SendGetNewJDRewardReq(0,false,true)）
旧军典：HasJDRewardRed → SendGetJDRewardReq()
斗地主：HasDDZTLLRewardRed → SendDDZTLLAwardReq(0,false,true)
```

实测结果：开启 claims 后 `hits:5`（累计签到 1-4 天 + 新军典），
签到状态由 2 变 1、`HasNewJDRewardRed` 转 false，协议收到 `decodeClientNewJDGetAwardRep`。
**注意**：`IsJDCanReward(t,i,s)` 需要参数，无参恒 false —— 已改用红点 getter。

**每日任务（P1-6）**：
```
月卡/周卡/祈福卡：lJt.GetCardDataByType(type)（type 1月卡/2周卡/3尊贵）bActive&&bReward
                → lJt.SendClientPrivilegeRewardReq(rewardDays,type)
斗地主免费豆：fJt.CanGetDdzFreeBean → fJt.SendClientGetWeekFreeBeanReq()
```
**按红线不自动执行**：敲鼓 `SendGuildDrumUse` 要花元宝；元宝树 `SendOpenTreasureCard`、
寻宝阁 `SendClientXunBaoGeDrawReq` 属抽/买；礼包码需用户输入；生日 `BirthDayGetGiftReq`
要选将/皮肤（`birthInfo.giftState` 未置真时不动）。这些只定位了接口，未接自动。

**一键领取（P1-7）**：面板「奖励」页按钮 → `claim-all` 指令 → `AUTO.claimSweep()`，
忽略冷却连跑 14 轮清空当前可领项。

**跳过求桃/助战（P2-8，默认关闭）**：`inject.js` 的 `GAME` 记录我的座位
（`GsCUpdateRoleDataNtf.StateID==58`）与最近询问（`GsCTriggerSpellEnq` /
`SmsgGameAskOperation` / `GsCCurrentAskNtf` 的 `TargetSeatID`/`SpellID`）。
`tickSkips()` 只在**询问目标不是自己**时点掉「取消/否」，保护「救自己」的求桃；
助战（无目标座位）单独放行。面板「设置」页开关 `跳过求桃/助战询问`。
**未真机验证**（需要一个求桃/助战场景）。

**弹窗补齐（P2-9）**：`AUTO.popups.skipNames` 显式关闭名单（不看提示特征，直接关）：
`GameResultWindow`(结算) / `GameZhanJiWindow` / `SevenDayResultWindow` /
`GetPropCommonWindow` / `GetPropSpecialWindow` / `GetPropTreasureWindow` / `GetPropXianDingWindow` /
`RewardWindow` / `NewBieGetAwardsWindow` / `NewbieAutoRewardWindow` /
`DDZRewardWindow` / `DDZJinBiaoRewardWindow` / `SelectSkinWindow` / `SkinInfoWindow` /
`GeneralOpenResultWindow` / `GeneralXBGOpenResultWindow` / `GeneralWishOpenResultWindow` / `TianShuWindow`(天书)。
带选项的窗口（`WuGuFengDengWindow` 五谷、`RogueAwardSelectWindow` 等）**不**在名单内。

**弹窗误关修复（重要）**：曾出现「点进战斗/集市窗口秒关」。根因两点：
① `keepNames` 被空数组覆盖——`inject.js` 原 `if (cfg.keepNames) ...` 空数组也是 truthy，把默认白名单清空了；
② `mode:'all'` 会关掉所有非白名单窗口，且 `safe` 模式的「大窗少文字」`isImagePop` 规则会命中 canvas 玩法窗口。
修复：`keepNames` 仅在非空数组时覆盖；新增 `protectedPattern=/Rogue|Fight|Battle|Market|Trade|Arena|Duel|Mail|Shop|Pay|Chat/i` 硬保护（命中即绝不自动关）；`isImagePop` 额外要求窗口名是 Ad/Notice/Announce/Banner。默认 `mode:'safe'`。

**屏蔽特效（P2-10，暂缓）**：旧插件 hook 的是运行时动态特效类的 `playEffect`
（还原码见 `runs/xc-deob.js` L10367-10383），该类不在 `Laya.ClassUtils._classMap` 的
`playEffect` 名单里（那里只有官阶/UI 窗口），**离线无法可靠定位**；盲 hook 有破坏渲染风险，
留待进对局后按运行时节点特征定位。

---

## 五、待办

> **权威清单在 `docs/OLD-PLUGIN-FEATURES.md` 第五节**（25 项逐条 + 状态 + 位置 + 不还原理由）。
> 下面是执行顺序，改完任何一项都要同步更新那份清单与本节。

### P0 — 打通记牌器（用户需求 3/4）

1. ✅ 已抓 `PubGsCMoveCard` / `PubGsCUseCard` 等字段（见 4.16）
2. ✅ 记牌器状态机已写（`inject.js` `DECK` + `deck.js` `noteProto` + 面板），真机验证通过
3. ⬜ 侧栏卡牌布局（对应旧插件 `listQ`）—— 现为面板内「已亮明」列表；若要固定侧栏卡片格另做
4. ⬜ 「剩余某牌型」：需每局牌堆构成（`CardList` 是槽位号，暂不可用）

### P0.5 — 透视（用户需求 5）

15. ✅ 静态分析定边界 + `PEEK` 协议状态机 + 座位模型读取 + 面板「透视」页 + 座位下方贴牌面（见 4.18）
16. ✅ **真机验证**：一局身份演武跑通，8 座位全读到，`serverSendsHiddenFaces = false`（服务端不下发暗牌牌面）
17. ⬜ 按牌堆总账反推：**已确认做不了** —— 客户端拿不到本局牌堆构成（`cardsBookDic` 是图鉴：各模式合计 585/220/585/156/52/160/209/40，本局牌堆 161 对不上；`MsgGamePlayCardNtf.CardList` 只是 `[1..161]` 槽位号）
18. ✅ 桌面浮层：已改成贴在各座位正下方（`Bqt.GetSeatUiByIndex` + `localToGlobal`）

### P1 — 领奖闭环（用户需求 1/4）

4. ✅ 邮件：`hJt` 实例化 + 字段核对完成，`tickMail` 已修（见 4.17）；本账号无邮件，未观察领取
5. ✅ 累计签到 + 新军典**实测领到**；生日/斗地主/固定日签到已接红点守卫（见 4.17）
6. 🟡 月卡/周卡 + 斗地主免费豆已接；敲鼓(花元宝)/元宝树/寻宝阁/礼包码**按红线不自动执行**
7. ✅ 一键领取：面板按钮 + `AUTO.claimSweep`

### P2 — 低风险纯增益

8. 🟡 跳过求桃 / 助战：协议目标判定 + 面板开关，默认关闭，**待真机验证**（见 4.17）
9. 🟡 弹窗补齐：结算/获取道具/开包/选皮肤/天书加入 `skipNames`（见 4.17），待真机验证
10. ⬜ 屏蔽特效（`blockQ`）：特效类离线无法可靠定位，留待进对局定位（见 4.17）

### P3 — 读取类工具

11. 战绩胜率统计窗口
12. 皮肤台词 / 收集进度 / 百胜战功
13. 道具获取记录 / 代码观星 / 布局配置

### P4 — 对局辅助（需谨慎）

14. 连点 / 智能选牌 / 出牌自动确定

### 待实测

- ✅ 山河图 overlay（用户需求 4/4）：已在真实山河图验证（事件 1524「白玉耳铛」节点，坐标 653,251 对齐）。标签除事件名外，已列出各选项及奖励/代价（`events[id].options[].label/effectText/effectValue`）。奇遇/选择窗口打开时自动收起标签（`content.js` 检测 `eventDialog` → `render(null)`）。
- ✅ 山河图战斗单位：地图节点 `data.event` 为奇遇 ID 时为 Adventure，为战斗时其实是 **Fight ID**（如 22809→「猎场之围」单位 羽林军×2/羽林大将）。生成 `data/rogue-fights.json`（`Fight.fightID → {name(Text 解析), units(General.a==Ggroup 的 c)}`，3633 条），`rogue.js` 战斗节点显示「战斗名 + 单位：…」。manifest 已把该文件加入 `web_accessible_resources`。**待真机战斗节点验证**（本次卡在服务端大厅加载，未进图）。
- ✅ 面板自检：右下角「牌」按钮 → 状态行显示「已接管 + 协议 N 条/M 类 + 最近协议名」，记牌页正常
- 弹窗治理在真机对局里的表现（结算界面 / 皮肤包动画 / 天书弹窗尚未覆盖）

### 已作废

原「协议解密」路线（12 字节头 + `AesProtocolCfbDe` + protobuf）**不必再走** —— 见 4.14。
`runs/sgs-capture.json`（2229 帧）仅作历史样本；`runs/game/sgsGame_inner.bin`（22.5 MB）
仍是最有用的静态参考（可直接 rg 搜中文与 `console.log`）。

---

## 六、红线与注意事项

- **账号信息**：`pk2587289` / 昵称 `我爱吃花椒`。不要随意打印到输出里。
- **只读原则**：不改游戏数据、不伪造流量、不阻断通信。点击类操作只针对用户明确要求的领奖 / 关弹窗。
- **危险词硬拦截**：支付/充值/购买/元宝/钻石/开通/续费/订阅/绑定/实名/身份证/手机号/验证码/删除/解绑/注销/退出/投降/放弃/认输/离开/解散 —— 命中一律跳过。
- **`copy()` 被游戏页面占用**，DevTools 里直接调用会报错；用 `console.log(JSON.stringify(...))` 或走文件。
- **PowerShell here-string 回显会污染输出**，写文件时把命令与回显分开；`$args` 是自动变量，脚本里别用它当变量名。
- **用户对空转零容忍**：思考区不要写"好/执行/写"这类零信息自我催促词，得出动作立刻发工具调用。
