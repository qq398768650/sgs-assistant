# 旧插件「一键代码观星」与「山河图手册」实现截取

> 来源：`F:\Work2026\SGS_Xiaochao\xiaochao_orign.js`（三国杀打小抄·山河图 v3.4.4.4）
> 还原：`runs/xc-deob.js`（jsjiami.com.v7 还原，脚本 `runs/xc-deob-run.js`，解出字符串 8243 条）
> 约定：标「Lxxx」的行号指向 `xiaochao_orign.js`；标「还原码」的片段取自 `xc-restored.js`（混淆块已还原）。

两个功能同属旧插件主面板「工具区」，入口按钮分别 id `guanxing` / `shanhetu`。
共同的数据来源都是 `loadConfig_w(module)`：从 `Config_w.sgs`（ZIP → `Ctr.Ofb_Dec` → gunzip → JSON）
解析 25 张配置表后，按 `module` 选择性构建数据集，再用 `openWindow(html)` 弹独立窗口或下载 .html。

---

## 一、一键代码观星（id `guanxing`）

把当前**在售 / 活动 / 充值消费 / 夺宝 / 祈福 / 兑换 / 抽奖 / 新品皮肤**等在游戏公告里散落的信息，
抓取并汇总成一张按「日期·活动名」分组的静态 HTML 表，供玩家离线查看。数据全部来自客户端配置表，不请求作者服务器。

### 1.1 入口按钮（L761）

```html
				<button class='calRes btn' id='guanxing' title='点击查看代码观星内容'>一键代码观星</button>
```

### 1.2 点击处理（还原码）

```js
document['getElementById']("guanxing")["onclick"]=async function(){const _0xdc6c66=_0x404369;this["disabled"]=!![],laya['note']("正在读取代码观星数据，请稍候...");let {gxjson:gxjson}=await loadConfig_w("guanxing");this['disabled']=![],openWindow('<html><head><meta\x20charset=\x22utf-8\x22\x20/><title>观星</title></head><body>'+json2html(gxjson)+SGS["water"]+"|QîÚÕÀ»o");},
```

> 逻辑：禁用按钮 → `await loadConfig_w('guanxing')` 取 `gxjson` → `json2html(gxjson)` 序列化 →
> 拼 `SGS.water`（水印层）→ `openWindow` 打开新窗口。
> 尾部 `"|QîÚÕÀ»o"` 是残留的密文装饰串，无实际语义。

### 1.3 数据构建 `loadConfig_w('guanxing')`（L2684–L2828）

```js
					if (typeof module !== 'string' || module == 'guanxing') {
						gxjson = { '代码观星仅供参考，请以最终公告为准！更新时间': new Date().toLocaleString(), '【充值消费】': [] };
						let ignore = ['欢乐豆', '手气卡', '点将卡', '换将卡', '诏令天下', '夺宝券', '夺宝碎片', '夺宝重置券', '绑定元宝', '桃花', '菜篮子', '招募令', '武将包', '皮肤包', '稀有皮肤包', '豪华皮肤包', '朱砂', '灵宝', '功勋', '普通将印宝箱', '稀有将印宝箱', '史诗将印宝箱', '校尉将印', '大将军印']
						let renwu = Config_w['gn_dbs_quest.sgs'].TaskAll.Task.filter(({ _attributes: a }) => a.clientTimeStart >= now).map(({ _attributes: a, Reward }) => {
							let sep = ',';
							if (Reward.SelectReward) { Reward = Reward.SelectReward; sep = '/' };
							if (!Reward.RewardItem.length) Reward.RewardItem = [Reward.RewardItem];
							return {
								id: a.id,
								time: a.timeStart.slice(0, 8) + '-' + a.timeEnd.slice(0, 8),
								desc: `【${a.name}】${a.desc}`,
								reward: Reward.RewardItem.map(({ _attributes: at }) => goodsInfo(at.itemId + ',' + at.count)).join(sep)
							}
						}).concat(Config_w['sys_h5_quest.sgs'].root.Task.filter(a => a.ClientTimeStart >= now).map(({ Id, Name, Desc, Rewards, Count, ClientTimeStart, ExtraRewards, ClientTimeEnd, SelectRewards }) => {
							let sep = SelectRewards ? '/' : ',';
							return {
								id: Id,
								time: ClientTimeStart.slice(0, 8) + '-' + ClientTimeEnd.slice(0, 8),
								desc: `【${Name}】${Desc}`,
								reward: [Rewards + ',' + Count, ...(ExtraRewards?.split(';') ?? [])].map(goodsInfo).join(sep)
							}
						}));
						let tg = Config_w['sys_h5_task.sgs'].TaskAll.TaskNode.filter(({ duration, quest_id }) => quest_id && (!duration || duration?.match(/[0-9]{8}T[0-9]{6}/g)?.[1] >= now)).reduce((acc, { duration, quest_id, name }) => {
							let ids = quest_id.split(';').map(Number).filter(Boolean);
							ids.forEach(id => taskIds.add(id));
							let key = ((duration || renwu.find(({ id, time }) => ids.includes(id) && time)?.time)?.slice(0, 8) + '·【' + name?.replace(/.*盲盒.*/, '盲盒福利') + '】').replace(/.*(充值|消费).*/, '【充值消费】')
							duration?.match(/[0-9]{8}T[0-9]{6}/g)?.[0] < now || ids.forEach(id => { acc[id] = key; });
							return acc;
						}, {});
						renwu.forEach(({ id, ...item }) => { let k = tg[id] ?? (now + '·【其它任务】'); if (!gxjson[k]) gxjson[k] = []; gxjson[k].push(item); });
						((zx) => { if (zx.length > 1) gxjson[zx[0].time?.slice(0, 8) + '·兑换【占星秘宝】'] = zx; })(
							Config_w['ff_dbs_lottery_new.sgs'].root.ShopGoods.filter(({ timeRange }) => timeRange?.match(/[0-9]{8}T[0-9]{6}/g)?.[0] >= now).map(
								({ Id, counts, exchangecount, timeRange }) => ({
									time: timeRange?.replace(/.*?([0-9]+)T[0-9]+,([0-9]+)T[0-9]+/, (s, a, b) => a + '-' + b),
									desc: '消耗·星石币*' + exchangecount,
									reward: goodsInfo(Id + ',' + counts)
								})
							)
						);
						Config_w['ff_exchange_new.sgs'].root.Common.filter(({ duration }) => duration?.match(/[0-9]{8}T[0-9]{6}/g)?.[0] >= now).forEach(({ itemid, goods, duration }) => {
							let key = duration.slice(0, 8) + '·【' + goodsID(itemid).name + '】兑换';
							gxjson[key] = (gxjson[key] || []).concat(goods.sort((a, b) => b.exchangecount1 - a.exchangecount1).map(({ exchangecount1, Id2, counts, limitcounts, itemid2, exchangecount2 }) => {
								let ns = String(counts).split(';');
								return {
									time: duration.slice(0, 8) + '-' + duration.slice(16, 24),
									desc: '消耗·' + goodsInfo((itemid2 ?? itemid) + ',' + (exchangecount2 ?? exchangecount1)) + (limitcounts ? ',限' + limitcounts + '次' : ''),
									reward: String(Id2).split(';').map((id, i) => goodsInfo(id + ',' + ns[i])).join('/')
								};
							}));
						});
						Config_w['sys_treasure_chest.sgs'].root.Common.filter(({ duration }) => Number(duration?.match(/[0-9]{8}T[0-9]{6}/g)?.[0]) >= now).forEach(
							({ itemid, rewards, duration }) => gxjson[duration.slice(0, 8) + '·开启【' + goodsID(itemid).name + '】'] = rewards.map(r => ({
								time: duration.slice(0, 8) + '-' + duration.slice(16, 24),
								desc: '开启·' + goodsInfo(itemid + ',' + r.counts),
								reward: JSON.stringify(r).split(/,"goodsid[0-9]+":" *([0-9,;]+) *"/).filter(s => s?.search(/([0-9]+,[0-9]+);?([0-9]+,[0-9]+)?/) >= 0).map(
									s => s.replace(/([0-9]+,[0-9]+);?([0-9]+,[0-9]+)?/, (s, a, b) => goodsInfo(a) + (b ? '[' + goodsInfo(b) + ']' : ''))
								).join(r.rewardstype == 2 ? '/' : ',')
							}))
						);
						let xz = [], qf = [], sk = [];
						let db = Config_w['sys_h5_dbs_clientserverpub.sgs'].client.DuoBao[0].item.filter(({ BeginTime }) => BeginTime > now).flatMap(({ DropId, ExchangeId, BeginTime, EndTime }) => {
							let time = BeginTime.slice(0, 8) + '-' + EndTime.slice(0, 8);
							let drop = (effectMap.get(Math.abs(DropId)) ?? []).map(goodsID).filter(({ name }) => !ignore.includes(name));
							let dropID = drop.map(({ ID }) => ID);
							let ex = (effectMap.get(Math.abs(ExchangeId)) ?? []).map(goodsID).filter(({ ID, name, TypeID: type }) => dropID.includes(ID) || !(type == 43 && name?.endsWith('动态套装') || type == 36 && name?.startsWith('文和乱武*') || type == 25 && ['赵襄', '沙摩柯(SP)', '孙尚香(界限突破)'].includes(name) || ['枭雄金印', '水晶碎片', '圣魂玄晶', '史诗皮肤锦囊', '传说皮肤锦囊', '至臻皮肤礼盒', '谋定水晶自选礼盒'].includes(name)));
							let exID = ex.map(({ ID, name }) => { let index = drop.findIndex(({ name: n }) => n == name); if (index >= 0) dropID.splice(index, 1, ID); return ID; });
							return Array.from(new Set([...dropID, ...exID])).map(goodsID).map(({ ID: id, TypeID: type, PicID: res, name, returngoods: l, usedeffect: u, info, fragment }) => {
								let good = {
									time,
									name,
									price: [...(dropID.includes(id) ? ['四角'] : []), ...(exID.includes(id) && fragment ? [fragment + '夺宝碎片'] : [])].join('/'),
									...((desc => desc && { desc })(['祈福灯', '圣魂玄晶', '枭雄金印'].includes(name) ? '' : (l && l != '0' && l.split(';').filter(s => s?.search(/[0-9]+,[0-9]+/) >= 0).map(goodsInfo).join(';')) || (u?.search(/^([0-9]+,[0-9]+;?)+$/) >= 0 && u.replace(/([0-9]+),[0-9,]+/g, goodsInfo)) || (u && effect(u)) || info)),
								};
								if (type == 36 || good.name?.search(/\*[^0-9]/) >= 0) sk.push({ name, res });
								return good;
							});
						});
						if (db.length) { gxjson['夺宝行动'] = db; db = db.map(({ name }) => name); }
						let goods = Config_w['sys_gs_dbs_fs_goodsbaseinfo.sgs'].root.goodslist.goods.filter(e => e.x?.match(/[0-9]{8}T[0-9]{6}/g)?.[0] >= now && e.a != 834901).map(({ a, ah, l }) => {
							if (l) l.replace(/([0-9]+),[0-9,]+/g, (s, id) => { if (!ah && ![100301, 200101, 1325201].includes(parseInt(id))) xz.push(parseInt(id)); return s });
							if (ah) qf.push(a);
							else return a;
						}).filter(Boolean).concat(xz).sort((a, b) => a - b).filter((e, i, a) => i == 0 || e != a[i - 1])
						Array.from(new Set(Config_w['cha_gs_dbs_fs_skininfo.sgs'].root.manu.item.filter(e => e.SellTime > now).map(e => e.baseID).concat(goods.concat(goods.filter((e, i, a) => e - a[i - 1] > 1000 && a[i + 1] - e < 1000 && goodsID(e)?.name?.[4] != '*').map(id => Config_w['sys_gs_dbs_fs_goodsbaseinfo.sgs'].root.goodslist.goods.filter(e => e.a - id > 0 && (e.a / 10000 >> 0) == (id / 10000 >> 0)).map(e => e.a)).reduce((obj, temp) => [...obj, ...temp], [])).sort((a, b) => a - b))))
							.map(id => goodsID(id)).filter(e => e && !ignore.concat(db).includes(e.name))
							// .filter(({name, SellTime}) => SellTime?.replace(/.*?([0-9]+)T[0-9]+;([0-9]+)T[0-9]+/, (s, a, b) => a) >= now || !SellTime && name?.[4] != '*')
							.forEach(({ ID: id, TypeID: type, PicID: res, name, maxBuyCount, yuanbao, returngoods: l, SellTime: t, usedeffect: u, info, yuanbaoonly, fragment, exchange, shopvisual }) => {
								let good = ({
									...(typeof t == 'string' ? { time: t?.replace(/.*?([0-9]+)T[0-9]+;([0-9]+)T[0-9]+/, (s, a, b) => a + '-' + b) } : {}),
									name,
									...(exchange?.includes(',') ? { price: goodsInfo(exchange) } : shopvisual && yuanbao != 999999 && {
										price: yuanbaoonly ? yuanbao + '通用元宝' : yuanbao + '元宝',
										...(maxBuyCount && ((d, m) => parseInt(d) > 0 ? { max: m + '个/' + (d == 1 ? '' : d) + '天' } : {})(...maxBuyCount.split(';')))
									}),
									...((desc => desc && { desc })(['祈福灯', '圣魂玄晶', '枭雄金印'].includes(name) ? '' : (l && l != '0' && l.split(';').filter(s => s?.search(/[0-9]+,[0-9]+/) >= 0).map(goodsInfo).join(';')) || (u?.search(/^([0-9]+,[0-9]+;?)+$/) >= 0 && u.replace(/([0-9]+),[0-9,]+/g, goodsInfo)) || (u && effect(u)) || info))
								});
								if (type == 36 || good.name?.search(/\*[^0-9]/) >= 0) sk.push({ name, res });
								if (String(good.price).includes('夺宝') || String(good.price).includes('灵宝')) { if (!gxjson['夺宝行动']) gxjson['夺宝行动'] = []; gxjson['夺宝行动'].push(good); }
								else if (good.max) { if (!gxjson['限购礼包']) gxjson['限购礼包'] = []; gxjson['限购礼包'].push(good); }
								else { if (!gxjson['其它道具']) gxjson['其它道具'] = []; gxjson['其它道具'].push(good); }
							});
						gxjson['其它道具']?.sort((a, b) => !a.price == !b.price ? 0 : a.price ? -1 : 1);
						if (qf.length) gxjson['祈福武将'] = Object.entries(qf.map(id => goodsID(id)).filter(({ returngoods }) => goodsID(returngoods.split(';')[1].split(',')[0])?.TypeID == 25)
							.reduce((acc, { name, lotteryPrice: price }) => { if (!acc[price]) acc[price] = []; acc[price].push(name.replace('武将', '').replace(/\(.*?\)/g, '')); return acc; }, {}))
							.sort((a, b) => b[0] - a[0]).map(([p, g]) => ({ price: p + '同心结', reward: g.join('/') }));
						((qy) => { if (qy.length) gxjson['祈愿台'] = qy; })(Config_w['ff_tiangong.sgs'].root.Drop.reduce((acc, { Id, ItemId, MaxCount }) => {
							if (!acc[Id]) acc[Id] = [];
							((name) => { if (!ignore.concat(['水晶碎片', '圣魂玄晶', '传世玉玺']).some(n => name.startsWith(n))) acc[Id].push(name) })(goodsInfo(ItemId + ',' + MaxCount));
							return acc;
						}, []).reduce(
							(ACC, wj) => { if (wj) { let temp = ACC.find(({ reward }) => wj.includes(reward)); if (temp) temp.reward = wj.join(','); } return ACC; },
							Config_w['ff_tiangong.sgs'].root.Common.slice().reverse().reduce((acc, { Id, Name, bigrewards, Duration2 }) => {
								let time = parseInt(Duration2.slice(0, 8)) + 1;
								if (time < parseInt(now)) return acc;
								let temp = acc.find(({ name }) => name == Name);
								if (temp) temp.time += ';' + time;
								else acc.push({ name: Name, reward: generalDict[bigrewards], time: String(time) });
								return acc;
							}, []).reverse()
						));
						const plan = (() => {
							var plans = {};
							return function (id) {
								if (plans[id]) return plans[id];
								return plans[id] = Config_w['ff_chess.sgs'].root.NewChess.filter(({ PlanId2 }) => PlanId2 == id).reduce((acc, { MaxFloors: n }) => acc + parseInt(n), 0);
							}
						})();
						((hj) => { if (hj.length) gxjson['绘卷'] = hj; })(Config_w['ff_chess.sgs'].root.Common.reduce((acc, { GrandPrize, PlanID2, duration2 }) => {
							let time = parseInt(duration2.slice(0, 8)) + 1;
							if (time < parseInt(now)) return acc;
							acc.push({ time: time + '-' + duration2.slice(16, 24), reward: goodsID(GrandPrize)?.name, '预估价格': plan(PlanID2) / 2 >> 0 });
							return acc;
						}, []));
						gxjson['新品皮肤（点击查看大图）'] = sk.map(({ name }) => ({ name }));
						Object.entries(gxjson).forEach(([k, v]) => gxjson[k] = Array.isArray(v) ? v.map(e => replaceKeys(e, zhCN)) : replaceKeys(v, zhCN));
						function fetchSkin(id, name, base = 'https://web.sanguosha.com/220/h5_2/res/runtime/pc/general/big/bigSkin/') {
							let url = base + id + '.png';
							return fetch(url, { method: 'HEAD' }).then(response => {
								if (response.ok) return { name, desc: `<a target="_blank" href="${url}"><img src="${url.replace('bigSkin', 'static').replace('big/s', 'seat/s')}"></a>` };
								else if (!base.includes('seat')) return fetchSkin(id, name, base.replace('big/s', 'seat/s').replace('bigSkin', 'static'));
							})
						}
						if (!module || module == 'guanxing') Promise.all(sk.map(({ name, res }) => fetchSkin(res, name))).then(r => gxjson['新品皮肤（点击查看大图）'] = r.filter(Boolean))
							.then(() => { Object.entries(gxjson).forEach(([k, v]) => gxjson[k] = Array.isArray(v) ? v.map(e => replaceKeys(e, zhCN)) : replaceKeys(v, zhCN)); return gxjson; });
					}
```

**gxjson 分组键**：`【充值消费】` / `其它任务` / `兑换【占星秘宝】` / `开启【宝箱名】` / `夺宝行动` /
`限购礼包` / `其它道具` / `祈福武将` / `祈愿台` / `绘卷` / `新品皮肤（点击查看大图）`。

**依赖的配置表**（均在 `files` 清单内，L2381）：
`gn_dbs_quest` / `sys_h5_quest` / `sys_h5_task` / `ff_dbs_lottery_new` / `ff_exchange_new` /
`sys_treasure_chest` / `sys_h5_dbs_clientserverpub` / `sys_gs_dbs_fs_goodsbaseinfo` /
`cha_gs_dbs_fs_skininfo` / `ff_tiangong` / `ff_chess` / `sys_server_item_drops_templete_config`。
「新品皮肤」用 `fetch HEAD` 探测图片是否存在（L2819–L2825），再按 `zhCN` 映射表把英文字段名换成中文（L2386）。

### 1.4 渲染器 `json2html`（L70–L105）与 `SGS.water`（L779）

```js
function json2html(jsonObj, indentLevel = 0) {
	let html = '';
	const indent = '  '.repeat(indentLevel);
	// if(typeof json === 'string') json = JSON.parse(json);
	if (Array.isArray(jsonObj)) {
		const isInnerMostObject = jsonObj.every(value => typeof value !== 'object' || !value);
		if (isInnerMostObject) {
			html += `${indent}${jsonObj.join('\t')}\n`;
		} else {
			html += `${indent}<ol>\n`;
			jsonObj.forEach(item => {
				html += `${indent}  <li>\n`;
				html += json2html(item, indentLevel + 2);
				html += `${indent}  </li>\n`;
			});
			html += `${indent}</ol>\n`;
		}
	} else if (typeof jsonObj === 'object' && jsonObj !== null) {
		const isInnerMostObject = Object.values(jsonObj).every(value => typeof value !== 'object' || !value);
		if (isInnerMostObject) {
			html += `${indent}${Object.entries(jsonObj).map(([key, value]) => `<strong>${key}:</strong> ${value}`).join(', ')}\n`;
		} else {
			html += `${indent}<ul>\n`;
			for (const key in jsonObj) {
				html += `${indent}  <li>\n`;
				html += `${indent}    <strong>${key}:</strong>\n`;
				html += json2html(jsonObj[key], indentLevel + 2);
				html += `${indent}  </li>\n`;
			}
			html += `${indent}</ul>\n`;
		}
	} else {
		html += `${indent}  ${jsonObj}\n`;
	}
	return html;
}
```

```js
window.SGS.water = ``<div style="position: fixed; top: 0; left: 0; width: 100%; height: 100%; pointer-events: none; z-index: 9999; background-repeat: repeat; background-image: url(&quot;data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='350' height='200'><text x='50%' y='50%' font-size='20' fill='rgba(0,0,0,0.1)' transform='rotate(-30, 100, 100)' text-anchor='middle'>由三国杀打小抄提供</text></svg>&quot;);"></div>``;
```

### 1.5 复刻要点

- **纯读取**：只解析客户端配置 + 探测图片，无任何写操作，符合红线。
- 核心工作量在「按配置表字段拼装活动条目」，可直接照搬 1.3 的分组规则。
- `fetchSkin` 依赖 `web.sanguosha.com/220/h5_2/res/runtime/pc/general/big/bigSkin/<id>.png`（可降级到 `static`/国战 `seat`）。
- 渲染用 `json2html` + `window.open` 即可，无需 Laya。

---

## 二、山河图手册（id `shanhetu`）

生成一份独立的《山河图加点模拟器 / BOSS 技能查询》网页：含战法、技能、卡牌、事件、BOSS、单骑无双
（`wscd/wssp/wszf`）与加点树（`jstf`）等汇总表。**左键弹窗查看，右键下载 .html**。

### 2.1 入口按钮（L760）

```html
				<button class='calRes btn' id='shanhetu' title='点击打开查看山河图加点模拟器，山河图BOSS技能查询，单骑无双山河图战法技能卡牌等汇总&#10;右键点击可以下载最新版山河图手册网页(.html文件)，可以发送到手机端随时查看'>山河图手册</button>
```

### 2.2 点击处理（还原码）

```js
document["getElementById"]("shanhetu")["onclick"]=()=>_0x1ae724['html'](!![]),document['getElementById']("shanhetu")["oncontextmenu"]=()=>_0x1ae724['html']()
```

对应 `_0x1ae724.html(flag)`（山河图模块对象的方法，还原码）：

```js
async 'html'(_0x2dd5c3){const _0x2462e4=_0x51cf3c;if("zsmtQ"!=="OiXKd"){this["disabled"]=!![],laya["note"]("正在读取山河图数据，请稍候...");let {rogejson:rogejson}=await loadConfig_w("roge");this['disabled']=![];let _0x2e3cbc=SGS['shtHTML'](rogejson);if(_0x2dd5c3)return openWindow(_0x2e3cbc);let _0x18311f=new Blob([_0x2e3cbc],{'type':"text/html"}),_0xfb3906=URL["createObjectURL"](_0x18311f);download(_0xfb3906,'山河图手册.html'),URL["revokeObjectURL"](_0xfb3906);}else laya["order"]["splice"](_0x558377,0x1),laya["order"]['push'](_0x50ede0),laya["seatUIs"]();}
```

> `flag=true`（左键）→ `openWindow(SGS.shtHTML(rogejson))`；
> `flag` 假值（右键）→ `new Blob(...)` + `download(url, '山河图手册.html')`。

### 2.3 数据构建 `loadConfig_w('roge')`（L2564–L2683）

构建逻辑在 IIFE 内（L2474 起，`(async function (roge, pvp) {...})(Config_w['hd_roguelike.sgs'], Config_w['hd_1v1_rogue.sgs'])`）：

```js
						if (!module || module == 'roge') {
							function idParse(id) { id = String(id); return id.startsWith('2063') && id.length == 8 ? String(id - 20010000) : id.length == 8 ? id.slice(-6) : id.length < 6 ? id.slice(-3) : id.slice(0, 2) !== '99' ? id.slice(-5, -2) + '>' : '*' + id.slice(2, 3) + id.slice(-2); }
							var fgp = Object.entries(gp).reduce((acc, [fid, generals]) => {
								let key = idParse(fid);
								let lv = fid.startsWith('2063') && fid.length == 8 ? 10 : fid.length == 8 ? (fid.slice(0, 2) - 20) * 2 : fid.length < 6 ? fid.slice(0, -3) - 2 : fid.slice(0, 2) !== '99' ? fid.slice(0, -5) - 2 : fid.slice(3, 4) - (fid.slice(2, 3) == '8' ? -1 : 0);
								// if (['新年大吉'].includes(Rfight[fid]?.name ?? Rfight[parseInt(key) + 4000]?.name)) return acc;
								if (!acc[key]) acc[key] = { fight: Rfight[fid]?.name ?? Rfight[parseInt(key) + 4000]?.name ?? '', generals: {} };
								if (sj.has(fid)) acc[key].event = sj.get(fid)
								let gns = acc[key].generals;
								(Rfight[fid]?.generals ?? generals).forEach(g => {
									let gKey = (key.startsWith('*') ? lv : '') + (g.stage || '') + '#' + (g.generalID == 5102 ? 4861 : g.generalID); // 程昱充粮
									while (true) {
										if (!gns[gKey]) gns[gKey] = { general: (g.info.pre ? '>' : '') + g.generalname + (g.info.next ? '>' : ''), info: infoStr(g.info), levels: [], infos: {}, spell: {}, card: {}, zhanfa: {}, ad: {} };
										else if (gns[gKey].levels.includes(lv)) { gKey += '@'; continue; }
										break;
									}
									let gn = gns[gKey];

									if (lv % 10 < 6 && lv < 20) { gn.levels.push(lv); if (g.start) gn.start = 3; }
									gn.infos[lv] = g.info;
									if (g.otherad) gn.ad[lv] = g.otherad;
									if (g.hide) gn.hide = true;
									g.spells?.forEach(({ spellid, level, name, desc }) => {
										if (!gn.spell[spellid]) gn.spell[spellid] = { name, desc, levels: [], level: undefined };
										if (lv % 10 < 6 && lv < 20) gn.spell[spellid].levels.push(lv + (level ?? 0));
									});
									g.zhanfas?.forEach(({ id, level, name, desc }) => {
										if (!gn.zhanfa[id]) gn.zhanfa[id] = { name, desc, levels: [], level: undefined };
										if (lv % 10 < 6 && lv < 20) gn.zhanfa[id].levels.push(lv + (level ?? 0));
									});
									// let lc=levelcount[fid.length < 6 ?0:fid.slice(0, 2) !== '99'?1:2]; if(!lc[level]) lc[level]={}; if(!lc[level][key])lc[level][key]=gns;
									g.cards?.forEach(({ id, level, ncn: name }) => {
										if (!gn.card[id]) gn.card[id] = { name, levels: [], level: undefined };
										if (lv % 10 < 6 && lv < 20) gn.card[id].levels.push(lv + (level ?? 0));
									});
								});
								return acc;
							}, {});
							Object.entries(fgp).forEach(([key, p]) => {
								fgp[key].shift = key.startsWith('*') && Math.min(...Object.values(p.generals).flatMap(g => g.levels)) == 1 ? 1 : 0;
								p.generals = Object.values(p.generals).map(g => {
									g.level = Math.min(...g.levels.sort((a, b) => b - a)) - fgp[key].shift;
									g.level = g.level;
									g.spell = Object.values(g.spell).concat(Object.values(g.zhanfa)).map(s => {
										let lv = Math.min(...s.levels.sort((a, b) => b - a));
										// ((m) => { if (m % 10 < g.levels[0] % 10 && g.levels.includes(m + 1) && p.fight) s.level = [lv, m % 10] })(s.levels[0]); // 不持续到最高难度的技能(最高level不是5)[nn,m]
										// ((arr) => { if (arr.length) s.level = [lv, arr]; })(g.levels.filter(i => i < 10 && !s.levels.includes(i) && i > lv && i < s.levels[0] % 10)); // 低难度有而高难度没有的技能[nn,[a,b]]
										if (s.levels.some((l, i, a) => l < 10 && !a.includes(l + 10) && (g.levels.includes(l + 10) || g.levels.length == 2 && g.levels.includes(10)))) s.level = [lv]; // 普通有而精英没有的技能[n]
										if (s.levels.some(l => l < 10)) ((a) => { if (a.length) s.level = [lv, a[a.length - 1]]; })(s.levels.filter((l, i, a) => l >= 10 && !a.includes(l - 10))) // 普通、精英难度不同的技能[n,1m]
										s.level = (s.level ?? lv) - fgp[key].shift;
										delete s.levels;
										return s;
									}).sort((a, b) => { let f = ((l) => (l[1] >= 10 ? l[1] : (l[0] ?? l))); return (f(a.level) % 10 - f(b.level) % 10) || f(a.level) - f(b.level) });
									g.card = Object.values(g.card).map(c => {
										let lv = Math.min(...c.levels.sort((a, b) => b - a));
										// ((m) => { if (m % 10 < g.levels[0] % 10 && g.levels.includes(m + 1) && p.fight) c.level = [lv, m % 10] })(c.levels[0]); // 不持续到最高难度的技能(最高level不是4)[nn,m]
										// ((arr) => { if (arr.length) c.level = [lv, arr]; })(g.levels.filter(i => i < 10 && !c.levels.includes(i) && i > lv && i < c.levels[0] % 10)); // 低难度有而高难度没有的技能[nn,[a,b]]
										if (c.levels.some((l, i, a) => l < 10 && !a.includes(l + 10) && (g.levels.includes(l + 10) || g.levels.length == 2 && g.levels.includes(10)))) c.level = [lv]; // 普通有而精英没有的技能[n]
										if (c.levels.some(l => l < 10)) ((a) => { if (a.length) c.level = [lv, a[a.length - 1]]; })(c.levels.filter((l, i, a) => l >= 10 && !a.includes(l - 10))) // 普通、精英难度不同的技能[n,1m]
										c.level = (c.level ?? lv) - fgp[key].shift;
										delete c.levels;
										return c;
									}).sort((a, b) => { let f = ((l) => (l[1] >= 10 ? l[1] : (l[0] ?? l))); return (f(a.level) % 10 - f(b.level) % 10) || f(a.level) - f(b.level) });
									if (!g.card.length) delete g.card;
									g.info = Object.values(g.infos).reduce((acc, i) => { Object.keys(acc).forEach(k => { if (i[k] > acc[k]) acc[k] = i[k]; }); return acc; }, ({ hp: 0, card: 0, draw: 0, sha: 0 }));
									if (Object.keys(g.ad).length) Object.keys(g.ad).sort((a, b) => b - a).forEach((lv, i, a) => { if (lv >= 10 && g.ad[lv] == g.ad[lv % 10] || g.ad[lv] == g.ad[a[i + 1]]) delete g.ad[lv]; }); else delete g.ad;
									// if (g.start.length) g.start = Math.ceil(Math.min(...g.start) / 5) - 1; else delete g.start;
									delete g.infos;
									delete g.levels;
									delete g.zhanfa;
									return g;
								}).sort((a, b) => a.level - b.level)
							});
							var uv = Object.entries(roge.Root.UniversalGroup.filter(e => e.fightgroup !== undefined).reduce((acc, item) => {
								if (!acc[item.fightID]) acc[item.fightID] = [];
								let key = idParse(item.fightgroup);
								if (!acc[item.fightID].includes(key)) acc[item.fightID].push(key);
								return acc;
							}, {}));
							var ugg = Array.from(new Set(uv.flatMap(e => e[1]))).map(f => ([f, uv.filter(e => e[1].includes(f)).map(e => e[0])])).filter(e => e[1].length > 1).map(([u, v]) => ([u, v.join(',')])).reduce((acc, [u, v]) => { if (!acc[v]) acc[v] = []; acc[v].push(u); return acc; }, {});
							var un = Object.values(ugg).flat();
							var ug = { ...Object.fromEntries(uv.map(([u, v]) => ([u, v.filter(i => !un.includes(i))]))), ...ugg };
							var umap = roge.Root.Level.reduce((acc, { cityID, eventfight, universalfight, startshow }) => {
								mp(universalfight);
								mp(eventfight?.split(';')?.map(idParse)?.filter((s, i, a) => a.indexOf(s) == i));
								function mp(key) {
									if (!key || key.length == 0) return;
									let org = acc.get(key);
									if (!org) acc.set(key, [cp[cityID]]);
									else if (!org.includes(cp[cityID])) org.push(cp[cityID]);
								}
								return acc;
							}, new Map());
							Object.keys(ugg).forEach(g => umap.set(g, g.split(',').flatMap(u => umap.get(Number(u)))));
							var ct = Object.fromEntries(Array.from(Array.from(umap.entries()).reduce((acc, [gk, ct]) => {
								let key = ct.length > 1 && new Set(ct.map(c => c.slice(0, 3))).size < 2 ? ct.map((c, i) => c.slice(i ? 3 : 0)).join('/') : String(ct);
								if (!acc.get(key)) acc.set(key, new Set());
								(ug[gk] ? ug[gk] : gk).forEach(f => acc.get(key).add(f));
								return acc;
							}, new Map()).entries(), ([ct, fid]) => [ct, Array.from(fid, f => fgp[f])]).filter(e => e[1].length)
								.sort((a, b) => a[0].slice(0, 3).localeCompare(b[0].slice(0, 3)) || (a[0].endsWith('BOSS') ^ b[0].endsWith('BOSS') ? b[0].endsWith('BOSS') ? -1 : 1 : 0) || (a[0].includes('/') && b[0].includes('/') ? b[0].length - a[0].length : a[0].includes('/') ? -1 : b[0].includes('/') ? 1 : 0)));
							rogejson.jsbs = JSON.stringify(Object.entries(ct).filter(e => e[0].startsWith(season + '-')).reduce((acc, [k, gk]) => { let key = k.slice(2); if (!acc[key]) acc[key] = []; gk.forEach(f => { if (f.fight != '新年大吉') acc[key].push(f); }); return acc; }, {}));
							rogejson.jsft = JSON.stringify(Object.entries(fgp).filter(([f, p]) => false && f.startsWith('*7') || false && p.event == '强力帮手' || ['天涯故交', '招兵买马', '万众敬仰'].includes(p.event) || p.event && p.fight && !['江边遇袭', '集市乱斗', '战前练兵', '战前练将'].includes(p.event)).reduce((acc, [fid, { event, generals, fight }]) => { if (!acc[event]) acc[event] = []; acc[event].push({ ...(fight ? { fight } : {}), generals }); return acc; }, {}));
							rogejson.wscd = JSON.stringify(Object.values(pvp.Card.map(({ CitationID, money }) => ({ ...Rplot[CitationID], money })).reduce((acc, { level, money, name, color, number, desc, rType }) => { let k = level + name + number; if (!acc[k]) acc[k] = { cl: [], level: money, name, number, type: rType, desc }; acc[k].cl.push(color); return acc; }, {})).sort(msort('type', 'level')));
							rogejson.wssp = JSON.stringify(pvp.Spell.map(({ CitationID, money }) => ({ ...Rplot[CitationID], money })).sort(msort('money', 'level', 'spellid')).map(({ level, money, name, desc }) => ({ level: money, name, desc })));
							rogejson.wszf = JSON.stringify(pvp.Tactics.map(({ CitationID, money }) => ({ ...Rplot[CitationID], money }))
								.filter(e => (e.name = e.name?.replace('·新', '')) && !e.name.includes('废弃') && !e.desc.includes('备用') && !/(游戏|战斗)开始/.test(e.desc))
								.sort((a, b) => (!a.money ^ !b.money ? (!a.money ? -1 : 1)
									: a.name.slice(0, 2).localeCompare(b.name.slice(0, 2)) != 0 ? a.name.slice(0, 2).localeCompare(b.name.slice(0, 2))
										: msort('money', 'level', 'name.length')(a, b))) // .sort(msort('money', 'level'))
								.map(({ level, money, name, desc }) => ({ level: money, name, desc })).filter((v, i, a) => JSON.stringify(v) != JSON.stringify(a[i + 1])));
							rogejson.jssp = JSON.stringify(Rplot.filter(p => p?.type == 3).sort(msort('level', 'money', 'spellid')).map(({ level, money, name, desc }) => ({ name, level, desc })));
							rogejson.jscd = JSON.stringify(Object.values(Rplot.filter(p => p?.type >= 4).reduce((acc, { level, money, name, color, number, type, desc, rType }) => { let k = level + name + number; let d = ([33, 34].includes(Math.floor(rType / 100)) || (name == '诸葛连弩' && level == 4)); if (!acc[k]) acc[k] = { cl: [], level: d ? 0 : level, money, name, number, type: rType + (d ? 6 : 0), desc }; acc[k].cl.push(color); return acc; }, {})).sort(msort('type', 'level', 'money')).sort((a, b) => (a.level > 0 && b.level == 0) ? -1 : 0));
							rogejson.jsss = JSON.stringify(Object.entries(Object.values(Rcity).reduce((acc, { cp, spell: s }) => { let cn = cp.replace('BOSS', ''); if (s && cn.startsWith(season + '-')) { if (!acc[s]) acc[s] = new Set(); acc[s].add(cn.slice(2)) }; return acc; }, {})).map(([k, v]) => { let { name, desc } = spellDict[k]; let ct = Array.from(v); let key = ct.length > 1 && new Set(ct.map(c => c.slice(0, 1))).size < 2 ? ct.map((c, i) => c.slice(i ? 1 : 0)).join('/') : String(ct); return { name, desc, key } }).sort((a, b) => a.key.localeCompare(b.key)));
							rogejson.jssd = JSON.stringify(roge.Root.seed.sort(msort('level', 'seed')).map(({ name, desc, level, huchijineng }) => { let jineng = desc?.match(/.*获得【([^【】]*)】.*/)?.[1]; if (jineng) desc += (spellDict[huchijineng]?.desc ?? spellDict.find(s => s?.name == jineng)?.desc); return { name, level, desc }; }))
							rogejson.jssc = JSON.stringify(roge.Root.school.map(({ school, name, effect, needputong, needxiyou, needshishi, needchuanshuo }) => ({ school, name, need: [needputong, needxiyou, needshishi, needchuanshuo], desc: Rplot[effect].desc.replaceAll(' ', '') }))).replace('（', '(').replace('）', ')').replace('）', ')');
							rogejson.jszf = JSON.stringify(Rplot.filter(p => p?.type == 2 && p.season?.includes(season)).filter(e => !e.name.includes('废弃') && !e.desc.includes('备用') && !e.name.includes('套装')).sort((a, b) => (a.name.slice(0, 2).localeCompare(b.name.slice(0, 2)) != 0 ? a.name.slice(0, 2).localeCompare(b.name.slice(0, 2)) : msort('level', 'money', 'name.length')(a, b))).map(({ level, money, name, desc, school }) => ({ ...(school < 100 ? { school } : {}), name, level, desc })).filter((v, i, a) => JSON.stringify(v) != JSON.stringify(a[i + 1])));
							rogejson.jstf = JSON.stringify(roge.Root.saijitianfu.filter(e => e.seasonID == season).reduce((acc, { tfid: id, ceng: y, type: x, cost, plot, preposition }) => { acc[id] = ({ id, x, y, cost, pre: (preposition?.split(/,|;/)?.map(Number)?.filter(Boolean) ?? []), ...(Rplot[plot]) }); return acc; }, [{ id: 0, x: 0, y: 0, cost: 0, pre: [], name: '', level: 0, type: 0 }]));
						} rogejson.jstk = JSON.stringify(roge.Root.Seasonstory.filter(e => e.seasonID == season).map(({ name, quest }) => ({ name, task: quest.split(';').map(id => { let { Name, Desc, Rewards, Count, ExtraRewards, paramstr2 } = Config_w['sys_h5_quest.sgs'].root.Task.find(({ Id }) => Id == id); if (Desc.includes('关卡<font')) paramstr2?.split(';')?.map(Number)?.forEach(i => { if (!Rex.includes(i)) Rex.push(i); }); return { name: Name, desc: Desc.replace(/<[^<>]+>/g, ''), rewards: [Rewards + ',' + Count, ...(ExtraRewards?.split(';') ?? [])].map(goodsInfo).join(',') } }) })));
					})(Config_w['hd_roguelike.sgs'], Config_w['hd_1v1_rogue.sgs']);
```

**rogejson 键 → 手册板块**：

| 键 | 含义 |
| --- | --- |
| `jsbs` | 关卡/BOSS 编组（按章节） |
| `jsft` | 事件 · 武将组 |
| `wscd` | 单骑无双 · 卡牌 |
| `wssp` | 单骑无双 · 技能 |
| `wszf` | 单骑无双 · 战法 |
| `jssp` | 山河图 · 技能 |
| `jscd` | 山河图 · 卡牌 |
| `jsss` | 山河图 · 事件 |
| `jssd` | 山河图 · 种子/奇遇 |
| `jssc` | 山河图 · 流派 |
| `jstf` | 加点天赋树 |
| `jstk` | 赛季剧情任务 |

数据源：`hd_roguelike.sgs` / `hd_1v1_rogue.sgs`（`Root.seed/school/UniversalGroup/Level/saijitianfu/Seasonstory` 等）。

### 2.4 渲染器 `SGS.shtHTML`（L918–L1730，共 813 行）

```js
window.SGS.shtHTML = ({ wscd, wssp, wszf, jscd, jssp, jszf, jssd, jsss, jssc, jstf, jsft, jsbs, jstk }) => !(wscd && wssp && wszf && jscd && jssp && jszf && jssd && jssc && jstf && jsft && jsbs) ? '' : String.raw`
<!DOCTYPE html>
<html>
<head>
	<meta http-equiv="Content-Type" content="text/html; charset=utf-8" />
	<title>山河图加点模拟器 BOSS技能查询</title>
	<style>
		table, th, td { writing-mode: horizontal-tb; border: 1px solid black; border-collapse: collapse; text-align: center; }
		thead { background: white; position: sticky; top: 51px; z-index: 996; }
		td:empty {  border: 0; }
		td.zf { box-shadow: 0 0 12px black inset; }
		td.zb { border: 0; box-shadow: 0 0 2px black inset; border-radius: 50%; }
		td.jn { border: 0; clip-path: polygon(0% 50%, 30% 0%, 70% 0%,100% 50% , 70% 100%, 30% 100%); }
		.left { text-align: left; }
		.right { text-align: right; }
		.bold { font-weight: bolder; }
		.light { background: rgba(255,255,255,0.3); box-shadow: 0 0 5px black inset; }
		.lv0 { background: white; }
		.gray { background: rgba(224,224,224); }
		.lv1 { background: rgb(144,238,144); }
		.lv2 { background: rgb(123,104,238); }
		.lv2 { background: rgb(64,128,255); }
		.lv3 { background: rgb(238,238,0); }
		.lv4 { background: rgb(255,16,0); }
		.lv5 { background: rgb(128, 0, 128); }
		#tianfu { writing-mode: vertical-lr; }
		#tianfu span { user-select: none; text-orientation: upright; }
		#tianfu.trans { writing-mode: horizontal-tb; }
		#tianfu.trans span{ writing-mode: vertical-lr;  }
		#tianfu.trans tr{ height: 140px; }
		#tianfu.trans td.jn{ clip-path: polygon(50% 0%, 0% 30%, 0% 70%, 50% 100%, 100% 70%, 100% 30%); }
		b { padding-left: 8px; padding-right: 8px }
		a, a:visited {color: blue; margin: 0 0 0 8px; }
		input { margin: 8px; transform: scale(2); }
		.content { display: contents; font-size: 1rem;}
		.hidden { display: none; }
		.button {  display: none; } 
		.button + .label { display: inline-block; user-select: none; border: solid 1px black; border-radius: 5px; padding: 0 4px;}
		.button[name=table] + .label { font-size: 30px; }
		.button[name=boss] + .label, .button[name=pvp] + .label { font-size: 24px; }
		.button:checked + .label { background: rgb(64,160,255); } 
	</style>
	
	<script>
		let levelDesc = ['传说', '普通', '稀有', '史诗', '传说'];
		let levels = ['普通','中等','困难','噩梦','炼狱','炼狱四'];
		function mod(id = false, enable = true) {
			if (!id) {
				tianfu.filter(e => e.enable).map(e => e.id).reverse().forEach(i => mod(i, false));
				document.getElementById('result').textContent = '所需点数：0';
				return;
			}
			tianfu[id].enable = enable
			document.getElementById(id).checked = enable;
			if (enable) tianfu[id].pre.filter(i => tianfu[i].enable != enable).forEach(i => { mod(i, enable); })
			else tianfu[id].post.filter(i => tianfu[i].enable != enable).forEach(i => { mod(i, enable); })
		}
		function trans() {
			document.getElementById('tianfu').classList.toggle('trans');
		}
		function display(id) {
			if (['zhanfa', 'jineng', 'kapai', 'shijian', 'boss', 'pvp'].includes(id)){
				['zhanfa', 'jineng', 'kapai', 'shijian', 'boss', 'pvp'].forEach(e => document.getElementById(e).classList.add('hidden'));
			} else if (['spell', 'tactic', 'card'].includes(id)){
				document.getElementById('pvpbtn').click();
				Array.from(document.querySelectorAll('#pvp>table')).forEach(e=>e.classList.add('hidden'));
			} else {
				document.getElementById('bossbtn').click();
				Array.from(document.querySelectorAll('#boss>table')).forEach(e=>e.classList.add('hidden'));
			}
			document.getElementById(id).classList.remove('hidden');
			document.getElementById('tabsec').scrollIntoView();
		}
		
		function copy(text) {
			let textarea = document.createElement('textarea');
			textarea.value = text;
			document.body.appendChild(textarea);
			textarea.select();
			try {
				let successful = document.execCommand('copy');
				let msg = successful ? '成功复制到剪贴板' : '复制失败';
				console.log(msg);
			} catch (err) {
				console.error('无法复制', err);
			}
			document.body.removeChild(textarea);
		}
		window.onload=function(){
			if (window.innerHeight < window.innerWidth) trans();
		}
	</script>
</head>

<body style="margin: 0 8px;">
	<section>
		<div style="padding: 4px; background: white; position: sticky; top: 0; z-index: 998;">
			<span id="result" style="font-size: 40px; writing-mode: horizontal-tb;">所需点数：0</span>
			<span style="right: 10px; position: absolute; writing-mode: horizontal-tb;">
				<button style="font-size: 30px;" onclick="trans()">切换横竖</button>
				<button style="font-size: 40px;" onclick="mod(0,false)">清空</button>
			</span>
		</div>
		<table id="tianfu" style="width: 98%;">
			<tbody></tbody>
		</table>
	</section>
	<section id="tabsec">
		<div style="padding: 5px; background: white; position: sticky; top: 0; z-index: 998;">
			<label><input type='radio' class='button' name="table" onclick="display('shijian')"><span class='label'>事件</span></label>
			<label><input type='radio' class='button' name="table" onclick="display('zhanfa')"><span class='label'>战法</span></label>
			<label><input type='radio' class='button' name="table" onclick="display('jineng')"><span class='label'>技能</span></label>
			<label><input type='radio' class='button' name="table" onclick="display('kapai')"><span class='label'>卡牌</span></label>
			<label><input type='radio' class='button' name="table" onclick="display('boss')" id="bossbtn" checked><span class='label'>关卡</span></label>
			<label><input type='radio' class='button' name="table" onclick="display('pvp')" id="pvpbtn"><span class='label'>单骑无双</span></label>
			<a style="font-size: 30px;" target="_blank" href="https://club.sanguosha.com/thread-1305188-1-1.html?fromuid=102322">社区</a>
			<a style="font-size: 30px;" target="_blank" href="https://www.sanguosha.com/news/list/id/1000">公告</a>
		</div>
		<table id="zhanfa" class="content hidden">
			<thead>
				<th style="min-width: calc(2rem);">套装</th>
				<th style="min-width: calc(2rem);">品质</th>
				<th style="min-width: calc(6rem);">战法</th>
				<th class="left">效果</th>
			</thead>
			<tbody></tbody>
		</table>
		<table id="jineng" class="content hidden">
			<thead>
				<th style="min-width: calc(2rem);">品质</th>
				<th style="min-width: calc(2rem);">技能</th>
				<th class="left">效果</th>
			</thead>
			<tbody></tbody>
		</table>
		<table id="kapai" class="content hidden">
			<thead>
				<th style="min-width: calc(2rem);">品质</th>
				<th style="min-width: calc(2rem);">铜币</th>
				<th style="min-width: calc(6rem);">装备</th>
				<th class="left">效果</th>
			</thead>
			<tbody></tbody>
		</table>
		<div id="boss" class="">
			<div style="padding-bottom: 2px; background: white; position: sticky; top: 52px; z-index: 997;">
				<label><input type='radio' class='button' name="boss" onclick="display('assist')"><span class='label'>队友</span></label>
				<label><input type='radio' class='button' name="boss" onclick="display('fight')" checked id="fightbtn"><span class='label'>事件</span></label>
			</div>
			<table id="assist" class="content hidden">
				<thead style="top: 87px">
					<th style="min-width: calc(2rem);">事件</th>
					<th style="min-width: calc(2rem);">关卡</th>
					<th style="min-width: calc(7rem);">名称</th>
					<th style="min-width: calc(2rem);">技能</th>
					<th class="left" style="padding-left: 1%;">说明：<span class="lv1">绿色</span>技能仅在消耗400铜币升级队友后才能获得。</th>
				</thead>
				<tbody></tbody>
			</table>
			<table id="fight" class="content">
				<thead style="top: 87px">
					<th style="min-width: calc(2rem);">事件</th>
					<th style="min-width: calc(2rem);">关卡</th>
					<th style="min-width: calc(7rem);">名称</th>
					<th style="min-width: calc(2rem);">技能</th>
					<th class="left" style="padding-left: 1%;">说明：<span class="lv1">绿色</span>、<span class="lv2">蓝色</span>、<span class="lv3">黄色</span>、<span class="lv4">红色</span>分别表示从<span class="lv1">中等</span>、<span class="lv2">困难</span>、<span class="lv3">噩梦</span>、<span class="lv4">炼狱</span>难度开始出现的怪物、技能、装备或初始手牌；<span class="bold">粗体</span>表示仅限精英战斗；符号<b>></b>表示阵亡后变身；<b>( )</b>表示初始不登场。摸牌出杀加伤数据仅供参考</th>
				</thead>
				<tbody></tbody>
			</table>
		</div>
		<div id="pvp" class="hidden">
			<div style="padding-bottom: 2px; background: white; position: sticky; top: 52px; z-index: 997;">
				<label><input type='radio' class='button' name="pvp" onclick="display('spell')" checked><span class='label'>技能</span></label>
				<label><input type='radio' class='button' name="pvp" onclick="display('tactic')"><span class='label'>战法</span></label>
				<label><input type='radio' class='button' name="pvp" onclick="display('card')"><span class='label'>卡牌</span></label>
			</div>
			<table id="spell" class="content">
				<thead style="top: 87px">
					<th style="min-width: calc(2rem);">虎符</th>
					<th style="min-width: calc(2rem);">技能</th>
					<th class="left">效果</th>
				</thead>
				<tbody></tbody>
			</table>
			<table id="tactic" class="content hidden">
				<thead style="top: 87px">
					<th style="min-width: calc(2rem);">虎符</th>
					<th style="min-width: calc(6rem);">战法</th>
					<th class="left">效果</th>
				</thead>
				<tbody></tbody>
			</table>
			<table id="card" class="content hidden">
				<thead style="top: 87px">
					<th style="min-width: calc(2rem);">虎符</th>
					<th style="min-width: calc(6rem);">卡牌</th>
					<th class="left">效果</th>
				</thead>
				<tbody></tbody>
			</table>
		</div>
		
		<table id="shijian"  class="content hidden">
			<thead>
				<tr>
					<th style="min-width: calc(4rem);">奇遇</th>
					<th>选项一【普通战斗】获胜+200铜币</th>
					<th>选项二【精英战斗】获胜+300铜币</th>
					<th>放弃</th>
				</tr>
			</thead>
			<tbody>
				<tr>
					<td rowspan="3">突来危机</td>
					<td>族吴乔4421→自选普通战法</td>
					<td>族吴乔5531→自选普通战法</td>
					<td rowspan="3">105铜币</td>
				</tr>
				<tr>
					<td>吴懿4421→自选技能技能</td>
					<td>吴懿5531→自选技能技能</td>
				</tr>
				<tr>
					<td>段颎4421→自选稀有技能</td>
					<td>段颎5531→自选稀有技能</td>
				</tr>
				<tr>
					<td rowspan="3">战事推演</td>
					<td>夏侯霸4421→自选普通战法</td>
					<td>夏侯霸5531→自选普通战法</td>
					<td rowspan="6">120铜币</td>
				</tr>
				<tr>
					<td>黄盖4421→自选普通装备</td>
					<td>黄盖5531→自选普通装备</td>
				</tr>
				<tr>
					<td>颜良文丑4421→自选普通卡牌</td>
					<td>颜良文丑5531→自选普通卡牌</td>
				</tr>
				<tr>
					<td rowspan="3">赛前演习</td>
					<td>李异4421+关兴张苞4421→自选普通/稀有战法</td>
					<td>李异5531+关兴张苞5531→自选普通/稀有战法</td>
				</tr>
				<tr>
					<td>吕蒙4421→自选普通/稀有装备</td>
					<td>吕蒙5531→自选普通/稀有装备</td>
				</tr>
				<tr>
					<td>步骘3421+夏侯霸4421→自选普通/稀有卡牌</td>
					<td>步骘4531+夏侯霸5531→自选普通/稀有卡牌</td>
				</tr>
				<tr>
					<td rowspan="3">擂台比武</td>
					<td colspan="2">朱儁4421→自选普通战法</td>
					<td rowspan="3">105铜币</td>
				</tr>
				<tr>
					<td colspan="2">韩遂4421→自选普通技能</td>
				</tr>
				<tr>
					<td colspan="2">凌操4421→自选稀有技能</td>
				</tr>
				<tr>
					<td rowspan="3">为民除害</td>
					<td colspan="2">界孙策4421+张燕4421→自选普通战法</td>
					<td rowspan="6">120铜币</td>
				</tr>
				<tr>
					<td colspan="2">界马超4421+界赵云4421→自选普通装备</td>
				</tr>
				<tr>
					<td colspan="2">吕布5421+关平4421→自选普通卡牌</td>
				</tr>
				<tr>
					<td rowspan="3">宵小叫嚣</td>
					<td colspan="2">程普4421+韩当4421+界黄盖4421→自选普通/稀有战法</td>
				</tr>
				<tr>
					<td colspan="2">彻里吉4421+2*弓兵2421→自选普通/稀有装备</td>
				</tr>
				<tr>
					<td colspan="2">郝昭4421+麹义4421+界徐盛4421→自选普通/稀有卡牌</td>
				</tr>
				<tr>
					<td>天涯故交</td>
					<td colspan="2">郭嘉/法正/诸葛恪/SP姜维/石苞/阚泽</td>
					<td rowspan="3">200铜币</td>
				</tr>
				<tr>
					<td>招兵买马</td>
					<td colspan="2">华佗/界孙坚/李典/关平/钟琰/马良</td>
				</tr>
				<tr>
					<td>万众敬仰</td>
					<td colspan="2">界袁绍/界刘禅/界黄盖/曹叡/司马师/界蔡文姬</td>
				</tr>
				<tr>
					<td rowspan="3">残宫巫蛊</td>
					<td>史诗/传说随机战法</td>
					<td>史诗随机技能</td>
					<td rowspan="3">无</td>
				</tr>
				<tr>
					<td>史诗/传说随机装备</td>
					<td>史诗随机技能</td>
				</tr>
				<tr>
					<td>史诗/传说随机手牌</td>
					<td>史诗随机技能</td>
				</tr>
				<tr>
					<td>怀璧其罪</td>
					<td>特定普通/稀有战法</td>
					<td>特定普通/稀有装备</td>
					<td>140/210铜币</td>
				</tr>
				<tr>
					<td>山中隐士</td>
					<td>随机普通/稀有战法</td>
					<td>自选普通/稀有技能</td>
					<td>120/180铜币</td>
				</tr>
				<tr>
					<td>沾沾喜气</td>
					<td>随机普通/稀有战法</td>
					<td>随机普通/稀有手牌</td>
					<td>120/180铜币</td>
				</tr>
				<tr>
					<td>巨贾从军</td>
					<td>特定普通/稀有战法</td>
					<td>特定普通/稀有战法</td>
					<td>140/210铜币</td>
				</tr>
				<tr>
					<td>熟能生巧</td>
					<td>特定稀有/史诗技能</td>
					<td>特定稀有/史诗技能</td>
					<td>210/420铜币</td>
				</tr>
				<tr>
					<td>助人为乐</td>
					<td>特定普通/稀有装备</td>
					<td>特定普通/稀有装备</td>
					<td>70/140铜币</td>
				</tr>
				<tr>
					<td>相信则灵</td>
					<td>特定普通/稀有手牌</td>
					<td>特定普通/稀有手牌</td>
					<td>105/175铜币</td>
				</tr>
				<tr>
					<td>民生多艰</td>
					<td colspan="2">随机普通/稀有战法</td>
					<td>120/180铜币</td>
				</tr>
				<tr>
					<td>奇门遁甲</td>
					<td colspan="2">随机普通/稀有/史诗技能</td>
					<td>80/120/240铜币</td>
				</tr>
				<tr>
					<td>轻装上阵</td>
					<td colspan="2">随机普通/稀有/史诗装备</td>
					<td>40/80/160铜币</td>
				</tr>
				<tr>
					<td>路遗白骨</td>
					<td colspan="2">随机普通/稀有/史诗手牌</td>
					<td>75/125/175铜币</td>
				</tr>
				<tr>
					<td>狭路相逢</td>
					<td colspan="2">自选普通/稀有战法</td>
					<td>140/210铜币</td>
				</tr>
				<tr>
					<td>祸福相依</td>
					<td colspan="2">自选普通/稀有/史诗技能</td>
					<td>100/150/300铜币</td>
				</tr>
				<tr>
					<td>湖中有灵</td>
					<td colspan="2">自选普通/稀有装备</td>
					<td>50/100铜币</td>
				</tr>
				<tr>
					<td>通力合作</td>
					<td colspan="2">自选普通/稀有手牌</td>
					<td>105/175铜币</td>
				</tr>
				<tr>
					<td>商人甩卖</td>
					<td colspan="2">90/150/210铜币→随机稀有/史诗/传说战法</td>
					<td rowspan="2">60/100/140铜币</td>
				</tr>
				<tr>
					<td>百年老店</td>
					<td colspan="2">150/250/350铜币→特定|自选稀有/史诗/传说战法</td>
				</tr>
				<tr>
					<td>升米之恩</td>
					<td colspan="2">75/105/135铜币→随机稀有/史诗/传说手牌</td>
					<td rowspan="2">50/70/90铜币</td>
				</tr>
				<tr>
					<td>手牌商人</td>
					<td colspan="2">125/175/225铜币→特定|自选稀有/史诗/传说手牌</td>
				</tr>
				<tr>
					<td>技不压身</td>
					<td colspan="2">90/180/300铜币→特定|自选稀有/史诗/传说技能</td>
					<td>60/120/200铜币</td>
				</tr>
				<tr>
					<td>装备打造</td>
					<td colspan="2">60/120/180铜币→特定|自选稀有/史诗/传说装备</td>
					<td>40/80/120铜币</td>
				</tr>
				<tr>
					<td rowspan="4">山中奇人</td>
					<td>随机普通战法→特定|自选稀有战法</td>
					<td>随机稀有战法→特定|自选史诗战法</td>
					<td rowspan="4">200铜币</td>
				</tr>
				<tr>
					<td>随机普通技能→特定|自选稀有技能</td>
					<td>随机稀有技能→特定|自选史诗技能</td>
				</tr>
				<tr>
					<td>随机普通装备→特定|自选稀有装备</td>
					<td>随机稀有装备→特定|自选史诗装备</td>
				</tr>
				<tr>
					<td>随机普通卡牌→特定|自选稀有卡牌</td>
					<td>随机稀有卡牌→特定|自选史诗卡牌</td>
				</tr>
				<!-- <tr class="bold">
					<td>事件</td>
					<td style="width: auto;">【普通战斗】获胜+200铜币</td>
					<td style="width: auto;">【精英战斗】获胜+200铜币</td>
					<td>放弃</td>
				</tr> -->
				<tr>
					<td class="right">说明：</td>
					<td colspan="7" class="left">怪物名称旁的四位数字依次是体力值、初始手牌数、摸牌数、出杀次数（未包含难度加成），各难度怪物技能见<a href="javascript:;" onclick="document.getElementById('fightbtn').click()">【怪物-事件】</a>一栏。</td>
				</tr>
			</tbody>
		</table>
	</section>
	<script>
		const tianfu = ${jstf};
		const cards=${wscd};
		const spells=${wssp};
		const tactics=${wszf};
		const tasks = ${jstk};
		const jineng = ${jssp};
		const kapai = ${jscd};
		const events = ${jsft};
		const boss = ${jsbs};
		const scene = ${jsss};
		const seed = ${jssd};
		const zhanfa = ${jszf};
		const school = ${jssc}
		.reduce((acc,{school,name,need,desc})=>({...acc,[school]:{name,level:need.reduce((a,n,lv)=>({...a,[lv+1]:{need:n,all:[]}}),{}),desc}}),{100:{name:'非套装',level:{1:{need:0,all:[]},2:{need:0,all:[]},3:{need:0,all:[]},4:{need:0,all:[]}},desc:'无套装效果'}});
	</script>
	<script>
		let pvppaidui = {"杀":{"1":[10,10,11],"2":[6,7,8,9,10,13],"3":[7,8,8,9,9,10,10],"4":[2,3,4,5,6,7,8,8,9,9,10,10,11,11]},"闪":{"1":[2,2,8,9,11,12,13],"2":[2,2,3,4,5,6,6,7,7,8,8,9,10,10,11,11,11]},"桃":{"1":[3,4,5,6,6,7,8,9,12],"2":[2,3,12]},"酒":{"2":[9],"3":[3,9],"4":[3,9]},"火杀":{"1":[4,7,10],"2":[4,5]},"雷杀":{"3":[4,5,6,7,8],"4":[5,6,7,8]},"顺手牵羊":{"2":[3,4],"3":[3,4,11]},"过河拆桥":{"1":[12],"3":[3,4,12],"4":[3,4]},"五谷丰登":{"1":[3,4]},"无中生有":{"1":[7,8,9,11]},"决斗":{"2":[1],"3":[1],"4":[1]},"南蛮入侵":{"3":[7,13],"4":[7]},"万箭齐发":{"1":[1]},"桃园结义":{"1":[1]},"无懈可击":{"1":[1,13],"2":[12],"3":[11,13],"4":[12,13]},"借刀杀人":{"4":[12,13]},"火攻":{"1":[2,3],"2":[12]},"铁索连环":{"3":[11,12],"4":[10,11,12,13]},"闪电":{"1":[12],"3":[1]},"乐不思蜀":{"1":[6],"3":[6],"4":[6]},"兵粮寸断":{"3":[10],"4":[4]},"诸葛连弩":{"2":[1],"4":[1]},"雌雄双股剑":{"3":[2]},"青釭剑":{"3":[6]},"青龙偃月刀":{"3":[5]},"丈八蛇矛":{"3":[12]},"贯石斧":{"2":[5]},"方天画戟":{"2":[12]},"麒麟弓":{"1":[5]},"古锭刀":{"3":[1]},"朱雀羽扇":{"2":[1]},"寒冰剑":{"3":[2]},"八卦阵":{"3":[2],"4":[2]},"藤甲":{"3":[2],"4":[2]},"白银狮子":{"4":[1]},"仁王盾":{"4":[2]}};
		let pvpcolors = Object.entries(pvppaidui).reduce((acc,[name,cn])=>{Object.entries(cn).forEach(([c, nums]) => nums.forEach(n=>{acc[n][c].push(name);acc[0][c-1]++;acc[n][0]++;}));return acc;},Array.from({length:14},(_,n)=>n==0?Array(4).fill(0):Array.from({length:5},(_,c)=>c==0?0:[])));

		let cardTable = document.getElementById('card');
		cardTable.insertAdjacentHTML('afterbegin', '<div style="display: flex; flex-wrap: wrap; font-size: clamp(0.75rem, 0.125rem + 1.67vw, 1.25rem);"></div>');
		let cardName = cardTable.firstElementChild;
		Object.entries(cards.reduce((acc, { cl, number, name, level, type, desc }) => { if (type % 100 == 0) acc['手牌'].push({ cl, number, name, level, desc }); else if (type % 100 <= 3) acc['装备'].push({ cl, number, name, level, desc }); else acc['高级装备'].push({ cl, number, name, level, desc }); return acc;},{ '手牌': [], '装备': [], '高级装备': [] })).forEach(([type,card]) => cardName.insertAdjacentHTML('beforeend', ${'`'}<table style="margin: 0 5px 0 0;">
			<thead style="top: 86px"><tr><th>虎符</th> <th>${'$'}{type}</th> <th>点数</th> <th>花色</th></tr> </thead>
			<tbody>${'`'} + card.map(({ cl, number, name, level, desc }) => ${'`'}
			<tr class="lv${'$'}{level}" title="${'$'}{desc}">
				<td>${'$'}{level}</td>
				<td class="bold">${'$'}{name}</td>
				<td>${'$'}{{1:'A',11:'J',12:'Q',13:'K'}[number]??number}</td>
				<td>${'$'}{cl.map(i => ' ♥♦♠♣'[i]).join(' ')}</td>
			</tr>${'`'}).join('') + ${'`'}
			</tbody></table>${'`'}));

		cardName.insertAdjacentHTML('beforeend', ${'`'}<table class="gray light" style="margin: 0 5px 0 0;">
		<thead class="gray" style="top: 86px"><tr><th>牌堆</th>${'$'}{pvpcolors[0].map((n,c)=>${'`'}<th>${'$'}{'♥♦♠♣'[c]}(${'$'}{n})</th>${'`'}).join('')}</thead><tbody>${'`'} + 
		Object.entries(pvppaidui).map(([name,cn]) => {
			let sum = 0;
			let tds = [1,2,3,4].map(c => { sum += cn[c]?.length??0; return ${'`'}<td style="border: 1px solid black;">${'$'}{(cn[c]??[]).map(n=>({1:'A',11:'J',12:'Q',13:'K'}[n]??n)).join().replace(/([A-Z0-9,]{8,9}),/g,'$1<br>')}</td>${'`'} }).join('');
			return ${'`'}<tr><td>${'$'}{name}(${'$'}{sum})</td>${'$'}{tds}</tr>${'`'}
		}).join('') + ${'`'}
		</tbody></table>${'`'});

		cardName.insertAdjacentHTML('beforeend', ${'`'}<table class="gray light" style="margin: 0 5px 0 0;">
		<thead class="gray" style="top: 86px"><tr><th>牌堆</th>${'$'}{pvpcolors[0].map((n,c)=>${'`'}<th>${'$'}{'♥♦♠♣'[c]}(${'$'}{n})</th>${'`'}).join('')}</thead><tbody>${'`'} + 
		pvpcolors.slice(1).map(([number,...c],n) => ${'`'}<tr><td>${'$'}{({1:'A',11:'J',12:'Q',13:'K'}[n+1]??(n+1))}<br>(${'$'}{number})</td>${'$'}{c.map(m=>${'`'}<td style="vertical-align: top; border: 1px solid black";>${'$'}{m.join('<br>')}</td>${'`'}).join('')}</tr>${'`'}).join('') + ${'`'}</tbody></table>${'`'});

		let cardDesc = document.querySelector('#card>tbody');
		cards.sort((a,b)=>(a.type%100-1)%3-(b.type%100-1)%3||a.level-b.level).forEach(({name,desc,level})=>{
			cardDesc.insertAdjacentHTML('beforeend',${'`'}
			<tr class="lv${'$'}{level}">
				<td>${'$'}{level}</td>
				<td class="bold">${'$'}{name}</td>
				<td class="left">${'$'}{desc}</td>
			</tr>${'`'})
		});
	</script>

	<script>
		let spellTable = document.getElementById('spell');
		spellTable.insertAdjacentHTML('afterbegin','<div style="display: flex; align-items: flex-start; font-size: clamp(1rem, 2.22vw, 1.5rem);"></div>');
		let spellName = spellTable.firstElementChild
		Object.entries(spells.reduce((acc,jn) => { if(!acc[jn.level]) acc[jn.level]=[]; acc[jn.level].push(jn); return acc; }, {})).forEach(([lv, spell],i,a) => {
			if(lv==0) return;
			else if(lv==1&&a[0][0]==0)spell=a[0][1].concat(spell);
			let cols = [1,4,5,4,3][lv] // Math.ceil(spell.length/14);
			spellName.insertAdjacentHTML('beforeend',${'`'}<table class="lv${'$'}{lv}" style="flex:${'$'}{cols};">
			<thead class="lv${'$'}{lv}" style="top: 86px"><tr> <th colspan="${'$'}{cols}">${'$'}{[0, 1, 2, 3, 4][lv] + '虎符  ' + levelDesc[lv]}</th></tr></thead>
			<tbody class="bold">${'`'} +
			// (lv>1||a[0][0]!=0?'':${'`'}<tr class="lv0"><td class="bold" colspan="2">0虎符→</td>${'$'}{a[0][1].map(({ name, desc }) => ${'`'}<td title="${'$'}{desc}"${'$'}{(/获得【|拥有|限定|觉醒/.test(desc)) ? ' class="light"' : ''}>${'$'}{name}</td>${'`'}).join('')}</tr>${'`'}) +
			spell.map(({ name, desc, level }) => ${'`'}<td title="${'$'}{ level ==0 ? '【0虎符免费】' : ''}${'$'}{desc}" class="${'$'}{(/获得【|拥有|限定|觉醒/.test(desc)) ? 'light' : ''}${'$'}{ level ==0 ? ' lv0' : ''}">${'$'}{name}</td>${'`'})
			.reduce((rows, row, index) => {
				if (index % cols === 0) rows.push([]);
				rows[rows.length - 1].push(row);
				return rows;
			}, []).map(row => ${'`'}<tr>${'$'}{row.join('')}</tr>${'`'}).join('') + ${'`'}
			</tbody></table>${'`'});
		});

		let spellDesc = document.querySelector('#spell>tbody');
		spells.forEach(({ name, desc, level }) => {
			spellDesc.insertAdjacentHTML('beforeend',${'`'}
			<tr class="lv${'$'}{level}">
				<td>${'$'}{level}</td>
				<td class="bold">${'$'}{name}</td>
				<td class="left">${'$'}{desc}</td>
			</tr>${'`'})
		});
	</script>

	<script>
		let tacticTable = document.getElementById('tactic');
		tacticTable.insertAdjacentHTML('afterbegin','<div style="display: flex; align-items: flex-start; font-size: clamp(0.75rem, 0.125rem + 1.67vw, 1.25rem);"></div>');
		let tacticName = tacticTable.firstElementChild
		Object.entries(tactics.reduce((acc,zf) => { if(!acc[zf.level]) acc[zf.level]=[]; if(!zf.name.includes('套装'))acc[zf.level].push(zf); return acc; }, {})).forEach(([lv, zfs],j,b) => {
			if(lv==0) return;
			else if(lv==1&&b[0][0]==0)zfs=b[0][1].concat(zfs);
			let short = zfs.filter(({ name }) => name.length <= 4);
			let long = zfs.filter(({ name }) => name.length > 4);
			let cols = [1,3,3,3,2][lv] // Math.ceil(zfs.length/18);
			let gap = Math.ceil(long.length/Math.ceil(zfs.length/cols))*0+1;
			let trs=[];
			while(short.length || long.length){
				trs.push(${'`'}<tr>${'$'}{(!long.length?short.splice(0,cols):!short.length?long.splice(0,Math.ceil((cols-0.5)/2)):long.splice(0,1).concat(short.splice(0,cols-1))).map(({name,desc,level},i,a) => ${'`'}<td title="${'$'}{level==0?'【0虎符免费】':''}${'$'}{desc}" ${'$'}{a.length<cols&&i>0&&name.length>5?' colspan="2"':''} class="${'$'}{/(游戏|战斗|第[0-9]轮)开始/.test(desc)?'light':''}${'$'}{level==0?' lv0':''}">${'$'}{name}</td>${'`'}).join('')}</tr>${'`'});
			}
			tacticName.insertAdjacentHTML('beforeend',${'`'}<table class="lv${'$'}{lv}" style="flex:${'$'}{cols};">
			<thead class="lv${'$'}{lv}" style="top: 86px"><tr><th colspan="${'$'}{cols}">${'$'}{[0, 1, 2, 3, 4][lv] + '虎符  ' + levelDesc[lv]}</th> </tr></thead>
			<tbody class="bold">${'`'} +
			// (lv>1||b[0][0]!=0?'':${'`'}<tr class="lv0"><td class="bold">0虎符→</td>${'$'}{b[0][1].map(({ name, desc }) => ${'`'}<td title="${'$'}{desc}" ${'$'}{/(游戏|战斗|第[5-9]轮)开始/.test(desc)?' class="light"':''}>${'$'}{name}</td>${'`'}).join('')}</tr>${'`'}) +
			trs.join('') + ${'`'}
			</tbody></table>${'`'});
		});

		let tacticDesc = document.querySelector('#tactic>tbody');
		tactics.forEach(({ name, level, desc, }) => {
			tacticDesc.insertAdjacentHTML('beforeend',${'`'}
			<tr class="lv${'$'}{level}">
				<td>${'$'}{level}</td>
				<td class="bold">${'$'}{name}</td>
				<td class="left">${'$'}{desc}</td>
			</tr>${'`'})
		})
	</script>

	<script>
		let maxY = Math.max(...tianfu.map(e=>e.y));
		let tf = tianfu.reduce((acc,e) => {
			acc[e.x][e.y] = e;
			e.enable = false;
			e.post = [];
			e.pre.forEach(i => { if (!tianfu[i].post) tianfu[i].post = []; tianfu[i].post.push(e.id); });
			return acc;
		},Array.from({length:6}, ()=>[]));
		
		let tianfuTable = document.querySelector('#tianfu>tbody');
		for (let i = 1; i <= 5; i++) {
			let row = document.createElement('tr');
			for (let j = 1; j <= maxY; j++) {
				if (tf[i][j]) { 
					row.insertAdjacentHTML('beforeend', ${'`'}
					<td title="${'$'}{tf[i][j].desc??''}" class="${'$'}{['','','zf','jn','zb','zb'][tf[i][j].type]??'zb'} lv${'$'}{tf[i][j].level}">
						<input type="checkbox" id="${'$'}{tf[i][j].id}">
						<b>${'$'}{tf[i][j].cost}</b>
						<span>${'$'}{tf[i][j].name}</span>
					</td>${'`'});
					row.lastElementChild.querySelector('input').onchange = function () {
						mod(tf[i][j].id, this.checked);
						document.getElementById('result').textContent = '所需点数：' + (tianfu[1].enable || tianfu[2].enable ? tianfu.filter(e => e.enable).map(e => e.cost).reduce((a, b) => a + b) : 0);
					};
				}
				else row.insertAdjacentHTML('beforeend', ${'`'}<td></td>${'`'});
			}
			tianfuTable.appendChild(row);
		}
	</script>
	<script>
		let sceneseed = document.createElement('div');
		document.getElementById('shijian').insertAdjacentElement('afterbegin', sceneseed);
		if (scene?.length) sceneseed.innerHTML += '<table><thead><th style="min-width: calc(6rem);">关卡</th><th style="min-width: calc(6rem);">场景</th><th class="left">效果</th></thead><tbody>'
			+ scene.map(({ name, desc, key }, index, arr) => ${'`'}<tr>
						<td>${'$'}{key}</td>
						<td class="bold">${'$'}{name}</td>
						<td class="left">${'$'}{desc}</td>
					</tr>${'`'}).join('')
			+ '</tbody></table>';
		if (tasks?.length) sceneseed.innerHTML += '<table><thead><th style="min-width: calc(6rem);">章回</th><th style="min-width: calc(6rem);">奖励</th><th style="min-width: calc(6rem);">任务</th><th class="left">条件</th></thead><tbody>'
			+ tasks.flatMap(({ name:NAME, task }) => task.map(({ name, desc, rewards }, index, arr) => ${'`'}<tr>
						${'$'}{index == 0 ? ${'`'}<td rowspan="${'$'}{arr.length}">${'$'}{NAME.replace('：','<br>')}</td>${'`'} : ''}
						<td>${'$'}{rewards}</td>
						<td>${'$'}{name}</td>
						<td class="left">${'$'}{desc.replace('(无双奉先)','(第一章[虎牢关]BOSS随机出现[无双奉先])').replace('(黄巾余孽)','(第二章所有城池的小怪随机出现)').replace('(强拉壮丁)','(第二章除[荥阳]、[颍川郡]外的小怪随机出现)').replace('(檄文雄才/俊乂张郃/谋士争衡/群贤逐鹿)','(第三章[河内]BOSS)').replace('(权奸董贼/董氏乱朝/凤仪情仇/西凉霸主)','(第三章[崤函道]BOSS)')}</td>
					</tr>${'`'})).join('')
			+ '</tbody></table>';
		if (seed?.length) sceneseed.innerHTML += '<table><thead><th style="min-width: calc(6rem);">额外奖励</th><th style="min-width: calc(6rem);">突变</th><th class="left">效果</th></thead><tbody>'
			+ seed.map(({ name, desc, level }, index, arr) => ${'`'}<tr class="lv${'$'}{level}">
						${'$'}{(index == 0 || level != arr[index - 1].level) ? ${'`'}<td rowspan="${'$'}{arr.filter(e => e.level == level).length}">通关宝箱+${'$'}{level - 1}</td>${'`'} : ''}
						<td class="bold">${'$'}{name}</td>
						<td class="left">${'$'}{desc}</td>
					</tr>${'`'}).join('')
			+ '</tbody></table>';
	</script>
	<script>
		let tfzf=tianfu.filter(({type})=>type==2).map(({name,desc})=>name+desc);
		let zhanfaTable = document.getElementById('zhanfa');
		zhanfaTable.insertAdjacentHTML('afterbegin','<div style="display: flex; align-items: flex-start; font-size: clamp(0.75rem, 0.125rem + 1.67vw, 1.25rem);"></div>');
		let zhanfaName = zhanfaTable.firstElementChild
		Object.entries(zhanfa.reduce((acc,zf) => { if(!acc[zf.level])acc[zf.level]=[]; acc[zf.level].push(zf); school[zf.school||100].level[zf.level].all.push(zf); return acc; }, {})).forEach(([lv, zfs]) => {
			let short = zfs.filter(({ name }) => name.length <= 4);
			let long = zfs.filter(({ name }) => name.length > 4);
			let cols = Math.ceil(zfs.length/30);
			let gap = Math.ceil(long.length/Math.ceil(zfs.length/cols))*0+1;
			let trs=[];
			while(short.length || long.length){
				trs.push(${'`'}<tr>${'$'}{(!long.length?short.splice(0,cols):!short.length?long.splice(0,Math.ceil((cols-0.5)/2)):long.splice(0,1).concat(short.splice(0,cols-1))).map(({name,desc,school},i,a) => ${'`'}<td title="${'$'}{desc}" ${'$'}{a.length<cols&&i>0&&name.length>5?' colspan="2"':''} class="${'$'}{tfzf.includes(name+desc)?'gray':''} ${'$'}{school?'light':''}">${'$'}{name}</td>${'`'}).join('')}</tr>${'`'});
			}
			zhanfaName.insertAdjacentHTML('beforeend',${'`'}<table class="lv${'$'}{lv}" style="flex:${'$'}{cols};">
			<thead class="lv${'$'}{lv}"><tr><th colspan="${'$'}{cols}">${'$'}{levelDesc[lv] + ' ' + [0, 200, 300, 500, 700][lv] + '铜币'}</th> </tr></thead>
			<tbody class="bold">${'`'} +
			trs.join('') + ${'`'}
			</tbody></table>${'`'});
		});

		
		let zhanfaDesc = document.querySelector('#zhanfa>tbody');
		zhanfaTable.insertAdjacentHTML('afterbegin',${'`'}<div style="display: flex; align-items: flex-start; font-size: clamp(0.75rem, 0.125rem + 1.67vw, 1.25rem);"></div>${'`'});
		zhanfaTable.firstElementChild.insertAdjacentHTML('afterbegin',${'`'}<table><thead><tr><th>套装</th><th>所需/总数</th>${'$'}{[1,2,3,4].map(lv=>'<th class="lv'+lv+'">'+levelDesc[lv]+'</th>').join('')}<th>效果</th></tr></thead><tbody></tbody></table>${'`'});
		let zhanfaDiv = zhanfaTable.firstElementChild.lastElementChild.lastElementChild
		Object.values(school).forEach(({name:Tname,level:Tlevel,desc:Tdesc})=>{
			let len=((lens)=>[lens.reduce((a,[n,l])=>[a[0]+n,a[1]+l],[0,0]),...lens])(Object.values(Tlevel).map(({need,all})=>([need,all.length])));
			zhanfaDiv.insertAdjacentHTML('beforeend',${'`'}<tr><td>${'$'}{Tname}</td>${'$'}{len.map(([need,all],l)=>${'`'}<td class="lv${'$'}{l}">${'$'}{need}/${'$'}{all}</td>${'`'}).join('')}<td class="left">${'$'}{Tdesc}</td></tr>${'`'})
			zhanfaDesc.insertAdjacentHTML('beforeend',${'`'}<tr class="gray" style="top: 76px; position: sticky;"><td colspan="4" class="left">【${'$'}{Tname}】${'$'}{len.map(([need,all],l)=>${'`'}<span class="lv${'$'}{l}">[${'$'}{l?levelDesc[l]:'总数'}${'$'}{need}/${'$'}{all}]</span>${'`'}).join('')}：${'$'}{Tdesc}</td></tr>${'`'});
			Object.values(Tlevel).flatMap(({all})=>all).forEach(({name,desc,level},i)=>{
				zhanfaDesc.insertAdjacentHTML('beforeend',${'`'}
				<tr class="lv${'$'}{level}">
					${'$'}{i===0?${'`'}<td rowspan="${'$'}{len[0][1]}" style="background: white; writing-mode: vertical-lr;">${'$'}{Tname}</td>${'`'}:''}
					<td>${'$'}{levelDesc[level]}</td>
					<td class="bold${'$'}{tfzf.includes(name+desc)?' gray':''}">${'$'}{name}</td>
					<td class="left">${'$'}{desc}</td>
				</tr>${'`'})
			})
		});
	
	</script>

	<script>
		let jinengTable = document.getElementById('jineng');
		jinengTable.insertAdjacentHTML('afterbegin','<div style="display: flex; align-items: flex-start; font-size: clamp(1rem, 2.22vw, 1.5rem);"></div>');
		let jinengName = jinengTable.firstElementChild
		Object.entries(jineng.reduce((acc,jn) => { if(!acc[jn.level]) acc[jn.level]=[]; acc[jn.level].push(jn); return acc; }, {})).forEach(([lv, spells]) => {
			let cols = Math.ceil(spells.length/20);
			jinengName.insertAdjacentHTML('beforeend',${'`'}<table class="lv${'$'}{lv}" style="flex:${'$'}{cols};">
			<thead class="lv${'$'}{lv}"><tr> <th colspan="${'$'}{cols}">${'$'}{levelDesc[lv] + ' ' + [0, 100, 300, 600, 1000][lv] + '铜币'}</th></tr></thead>
			<tbody class="bold">${'`'} +
			spells.map(({ name, desc }) => ${'`'}<td title="${'$'}{desc}"${'$'}{(/点(雷电|火焰)?伤害(?!后)/.test(desc) ? ' class="light"' : '')}>${'$'}{name}</td>${'`'})
			.reduce((rows, row, index) => {
				if (index % cols === 0) rows.push([]);
				rows[rows.length - 1].push(row);
				return rows;
			}, []).map(row => ${'`'}<tr>${'$'}{row.join('')}</tr>${'`'}).join('') + ${'`'}
			</tbody></table>${'`'});
		});

		let jinengDesc = document.querySelector('#jineng>tbody');
		jineng.forEach(({ name, desc, level }) => {
			jinengDesc.insertAdjacentHTML('beforeend',${'`'}
			<tr class="lv${'$'}{level}">
				<td>${'$'}{levelDesc[level]}</td>
				<td class="bold">${'$'}{name}</td>
				<td class="left">${'$'}{desc}</td>
			</tr>${'`'})
		});
	</script>


	<script>
		let paidui = {"杀":{"1":[10,10,11],"2":[6,7,8,9,10,13],"3":[7,8,8,9,9,10,10],"4":[2,3,4,5,6,7,8,8,9,9,10,10,11,11]},"闪":{"1":[2,2,8,9,11,12,13],"2":[2,2,3,4,5,6,6,7,7,8,8,9,10,10,11,11,11]},"桃":{"1":[3,4,5,6,6,7,8,9,12],"2":[2,3,12]},"酒":{"2":[9],"3":[3,9],"4":[3,9]},"火杀":{"1":[4,7,10],"2":[4,5]},"雷杀":{"3":[4,5,6,7,8],"4":[5,6,7,8]},"顺手牵羊":{"2":[3,4],"3":[3,4,11]},"过河拆桥":{"1":[12],"3":[3,4,12],"4":[3,4]},"五谷丰登":{"1":[3,4]},"无中生有":{"1":[7,8,9,11]},"决斗":{"2":[1,1],"3":[1],"4":[1,1]},"南蛮入侵":{"3":[7,13],"4":[7]},"万箭齐发":{"1":[1]},"桃园结义":{"1":[1]},"无懈可击":{"1":[1,13],"2":[12],"3":[11,13],"4":[12,13]},"火攻":{"1":[2,3],"2":[12]},"铁索连环":{"3":[11,12],"4":[10,11,12,13]},"闪电":{"1":[12],"3":[1]},"乐不思蜀":{"1":[6],"3":[6],"4":[6]},"兵粮寸断":{"3":[10],"4":[4]}};
		let colors = Object.entries(paidui).reduce((acc,[name,cn])=>{Object.entries(cn).forEach(([c, nums]) => nums.forEach(n=>{acc[n][c].push(name);acc[0][c-1]++;acc[n][0]++;}));return acc;},Array.from({length:14},(_,n)=>n==0?Array(4).fill(0):Array.from({length:5},(_,c)=>c==0?0:[])));

		let kapaiTable = document.getElementById('kapai');
		kapaiTable.insertAdjacentHTML('afterbegin', '<div style="display: flex; flex-wrap: wrap; font-size: clamp(0.75rem, 0.125rem + 1.67vw, 1.25rem);"></div>');
		let kapaiName = kapaiTable.firstElementChild;
		Object.entries(kapai.reduce((acc, { cl, number, name, money, level, type, desc }) => { if (type % 100 == 0) acc['手牌'].push({ cl, number, name, money, level, desc }); else if (type % 100 <= 3) acc['装备'].push({ cl, number, name, money, level, desc }); else acc['高级装备'].push({ cl, number, name, money, level, desc }); return acc;},{ '手牌': [], '装备': [], '高级装备': [] })).forEach(([type,card]) => kapaiName.insertAdjacentHTML('beforeend', ${'`'}<table style="margin: 0 5px 0 0;">
			<thead><tr><th>品质</th> <th>铜币</th> <th>${'$'}{type}</th> <th>点数</th> <th>花色</th></tr> </thead>
			<tbody>${'`'} + card.map(({ cl, number, name, money, level, desc }) => ${'`'}
			<tr class="${'$'}{level?'lv'+level:'gray'}" title="${'$'}{desc}">
				<td>${'$'}{levelDesc[level]}</td>
				<td>${'$'}{money}</td>
				<td class="bold">${'$'}{name}</td>
				<td>${'$'}{{1:'A',11:'J',12:'Q',13:'K'}[number]??number}</td>
				<td class="light">${'$'}{cl.map(i => ' ♥♦♠♣'[i]).join(' ')}</td>
			</tr>${'`'}).join('') + ${'`'}
			</tbody></table>${'`'}));

		kapaiName.insertAdjacentHTML('beforeend', ${'`'}<table class="gray light" style="margin: 0 5px 0 0;">
		<thead class="gray"><tr><th>牌堆</th>${'$'}{colors[0].map((n,c)=>${'`'}<th>${'$'}{'♥♦♠♣'[c]}(${'$'}{n})</th>${'`'}).join('')}</thead><tbody>${'`'} + 
		Object.entries(paidui).map(([name,cn]) => {
			let sum = 0;
			let tds = [1,2,3,4].map(c => { sum += cn[c]?.length??0; return ${'`'}<td style="border: 1px solid black;">${'$'}{(cn[c]??[]).map(n=>({1:'A',11:'J',12:'Q',13:'K'}[n]??n)).join().replace(/([A-Z0-9,]{8,9}),/g,'$1<br>')}</td>${'`'} }).join('');
			return ${'`'}<tr><td>${'$'}{name}(${'$'}{sum})</td>${'$'}{tds}</tr>${'`'}
		}).join('') + ${'`'}
		</tbody></table>${'`'});

		kapaiName.insertAdjacentHTML('beforeend', ${'`'}<table class="gray light" style="margin: 0 5px 0 0;">
		<thead class="gray"><tr><th>牌堆</th>${'$'}{colors[0].map((n,c)=>${'`'}<th>${'$'}{'♥♦♠♣'[c]}(${'$'}{n})</th>${'`'}).join('')}</thead><tbody>${'`'} + 
		colors.slice(1).map(([number,...c],n) => ${'`'}<tr><td>${'$'}{({1:'A',11:'J',12:'Q',13:'K'}[n+1]??(n+1))}<br>(${'$'}{number})</td>${'$'}{c.map(m=>${'`'}<td style="vertical-align: top; border: 1px solid black";>${'$'}{m.join('<br>')}</td>${'`'}).join('')}</tr>${'`'}).join('') + ${'`'}</tbody></table>${'`'});

		let kapaiDesc = document.querySelector('#kapai>tbody');
		kapai.filter(kp=>kp.type % 100).sort((a,b)=>(a.type%100-1)%3-(b.type%100-1)%3||a.level-b.level).forEach(({name,desc,level,money})=>{
			kapaiDesc.insertAdjacentHTML('beforeend',${'`'}
			<tr class="${'$'}{level?'lv'+level:'gray'}">
				<td>${'$'}{levelDesc[level]}</td>
				<td>${'$'}{money}</td>
				<td class="bold">${'$'}{name}</td>
				<td class="left">${'$'}{desc}</td>
			</tr>${'`'})
		});
	</script>


	<script>
		let assistTable = document.querySelector('#assist>tbody');
		let fightTable = document.querySelector('#fight>tbody');
		Object.entries(events).forEach(([even,fights])=>{
			let length = fights.reduce((acc,{generals})=>acc+generals.reduce((acc,{spell})=>acc+spell.length,0),0);
			fights.forEach(({fight,generals}, i)=>{
				let len = generals.reduce((acc,{spell})=>acc+(spell.length||1),0);
				let event = even != 'undefined' ? even : fight ? '奇遇战斗' : '奇遇队友';
				generals.forEach(({general,spell,card,info,start,ad,hide,level:lv}, j)=>{
					if (!spell.length) spell = [{name: '无', desc: '', level: 0}];
					spell.forEach(({name, desc, level}, k, arr) => {
						let l1=level?.[0]??level??0, l2=level?.[1];
						(fight?fightTable:assistTable).insertAdjacentHTML('beforeend',${'`'}
						<tr class="lv${'$'}{l2>=10?l2%10:l1%10}${'$'}{lv>=10?' bold':''}">
							${'$'}{i===0&&j===0&&k===0?${'`'}<td rowspan="${'$'}{length}" style="background: white; writing-mode: vertical-lr;">${'$'}{event}</td>${'`'}:''}
							${'$'}{j===0&&k===0?${'`'}<td rowspan="${'$'}{len}" style="background: white; writing-mode: vertical-lr;">${'$'}{fight||event}</td>${'`'}:''}
							${'$'}{k===0?${'`'}<td rowspan="${'$'}{arr.length}" class="lv${'$'}{lv%10}${'$'}{hide||general.slice(0,1)==='>'?' gray':''}">${'$'}{start?${'`'}<span class="lv${'$'}{start} light">[${'$'}{levels[start]}起先手]</span><br>${'`'}:''}${'$'}{hide?'(':''}${'$'}{general}${'$'}{hide?')':''}<br>${'$'}{info.hp}血${'$'}{info.card}牌摸${'$'}{info.draw}杀${'$'}{info.sha}${'$'}{ad?'<br>'+Object.entries(ad).map(([l,d])=>${'`'}<span class="lv${'$'}{l%10}">+${'$'}{d}伤</span>${'`'}).join('/'):''}${'$'}{card?card.map(c=>${'`'}<br><span class="lv${'$'}{(c.level?.[0]??c.level??0)%10}${'$'}{(c.level?.[0]??c.level??0)>=10?' bold':''}">${'$'}{c.name}</span>${'`'}).join('').replace(/(<span[^>]*>[^<>]{0,4}<.span>)<br>(<span[^>]*>[^<>]{0,4}<.span>)/g,'$1$2'):''}</td>${'`'}:''}
							<td${'$'}{l1>=10||l2>=10?' class="bold"':''}>${'$'}{name}</td>
							<td class="left${'$'}{(/你死亡(时|后)/.test(desc)?' light':'')}">${'$'}{level?.length==1?${'`'}<span class="bold lv0">[精英战斗无此技能]</span>${'`'}:l1>=10?${'`'}<span class="lv4">[仅精英战斗有此技能]</span>${'`'}:l2?.length>0?${'`'}<span class="bold lv4">[${'$'}{l2.map(l=>levels[l]).join('、')}难度无此技能]</span>${'`'}:l2>=10?${'`'}<span class="lv${'$'}{l1}">[非精英战斗从${'$'}{levels[l1]}难度起有此技能]</span>${'`'}:l2<10?${'`'}<span class="bold lv${'$'}{l2}">[${'$'}{levels[l2+1]}及以上难度无此技能]</span>${'`'}:''}${'$'}{desc}</td>
						</tr>${'`'});
					});
				})
			})
		})

		let bossDiv = document.querySelector('#boss');
		Object.entries(boss).forEach(([label,fights], i)=>{
			bossDiv.firstElementChild.insertAdjacentHTML('beforeend',${'`'}
				<label><input type='radio' class='button' name="boss" onclick="display('boss${'$'}{i}')"><span class='label lv${'$'}{[0,1,3,4][label[0]]} ${'$'}{label.endsWith('BOSS')?'bold':''}'>${'$'}{label}</span></label>${'`'})
			bossDiv.insertAdjacentHTML('beforeend',${'`'}
			<table id="boss${'$'}{i}" class="content hidden">
				<thead style="top: 87px">
					<th style="min-width: calc(2rem);">关卡</th>
					<th style="min-width: calc(7rem);">名称</th>
					<th style="min-width: calc(2rem);">技能</th>
					<th class="left" style="padding-left: 1%;"><span class="lv1">绿色</span>、<span class="lv2">蓝色</span>、<span class="lv3">黄色</span>、<span class="lv4">红色</span>分别表示从<span class="lv1">中等</span>、<span class="lv2">困难</span>、<span class="lv3">噩梦</span>、<span class="lv4">炼狱</span>难度开始出现的怪物、技能、装备或初始手牌；<span class="bold">粗体</span>表示仅限精英战斗；符号<b>></b>表示阵亡后变身；<b>( )</b>表示初始不登场。摸牌出杀加伤数据仅供参考</th>
				</thead>
				<tbody></tbody>
			</table>${'`'})
			let bossTable = bossDiv.lastElementChild.lastElementChild;
			fights.forEach(({fight,generals,event})=>{
				let len = generals.reduce((acc,{spell})=>acc+(spell.length||1),0);
				generals.forEach(({general,spell,card,info,start,ad,hide,level:lv}, j)=>{
					if (!spell.length) spell = [{name: '无', desc: '', level: 0}];
					spell.forEach(({name, desc, level}, k, arr) => {
						let l1=level?.[0]??level??0, l2=level?.[1];
						bossTable.insertAdjacentHTML('beforeend',${'`'}
					<tr class="lv${'$'}{l2>=10?l2%10:l1%10}${'$'}{lv>=10?' bold':''}">
							${'$'}{j===0&&k===0?${'`'}<td rowspan="${'$'}{len}" style="background: white; writing-mode: vertical-lr;">${'$'}{fight}</td>${'`'}:''}
							${'$'}{k===0?${'`'}<td rowspan="${'$'}{arr.length}" class="lv${'$'}{lv%10}${'$'}{hide||general.slice(0,1)==='>'?' gray':''}">${'$'}{start?${'`'}<span class="lv${'$'}{start} light">[${'$'}{levels[start]}起先手]</span><br>${'`'}:''}${'$'}{hide?'(':''}${'$'}{general}${'$'}{hide?')':''}<br>${'$'}{info.hp}血${'$'}{info.card}牌摸${'$'}{info.draw}杀${'$'}{info.sha}${'$'}{ad?'<br>'+Object.entries(ad).map(([l,d])=>${'`'}<span class="lv${'$'}{l%10}">+${'$'}{d}伤</span>${'`'}).join('/'):''}${'$'}{card?card.map(c=>${'`'}<br><span class="lv${'$'}{(c.level?.[0]??c.level??0)%10}${'$'}{(c.level?.[0]??c.level??0)>=10?' bold':''}">${'$'}{c.name}</span>${'`'}).join('').replace(/(<span[^>]*>[^<>]{0,4}<.span>)<br>(<span[^>]*>[^<>]{0,4}<.span>)/g,'$1$2'):''}</td>${'`'}:''}
							<td${'$'}{l1>=10||l2>=10?' class="bold"':''}>${'$'}{name}</td>
							<td class="left${'$'}{(/你死亡(时|后)/.test(desc)?' light':'')}">${'$'}{level?.length==1?${'`'}<span class="bold lv0">[精英战斗无此技能]</span>${'`'}:l1>=10?${'`'}<span class="lv4">[仅精英战斗有此技能]</span>${'`'}:l2?.length>0?${'`'}<span class="bold lv4">[${'$'}{l2.map(l=>levels[l]).join('、')}难度无此技能]</span>${'`'}:l2>=10?${'`'}<span class="lv${'$'}{l1}">[非精英战斗从${'$'}{levels[l1]}难度起有此技能]</span>${'`'}:l2<10?${'`'}<span class="bold lv${'$'}{l2}">[${'$'}{levels[l2+1]}及以上难度无此技能]</span>${'`'}:''}${'$'}{desc}</td>
						</tr>${'`'})
					});
				})
			})
		})
	</script>
</body>
</html>
`;
```

### 2.5 复刻要点

- 手册本质是**静态数据表生成器**，`shtHTML` 里内嵌了整套加点模拟器的前端 JS（`mod/trans/display/copy`）。
- 入口守卫：`shtHTML` 只在 12 个键全部非空时才输出，否则返回空串（L918）。
- 与 sgs-assistant 已有 `modules/rogue.js` 的区别：`rogue.js` 只把事件名/奖励贴到地图节点上，
  本手册是**离线汇总网页**，两者可并存（手册数据可复用同一份 `hd_roguelike.sgs` 解析结果）。
- 依赖旧插件自带的 `item()`/`goodsInfo()`/`Rplot`/`Rcity` 等中间结构，移植时需一并带上（见 L2476 起的 IIFE）。

---

## 三、对接建议（sgs-assistant）

| 项 | 建议 |
| --- | --- |
| 数据层 | 复用 4.1 的 `Config_w.sgs` 解密链路（ZIP → `Ctr.Ofb_Dec` → gunzip → JSON），已在本项目跑通 |
| 观星 | 直接照搬 1.3 分组规则，渲染换成面板页签或 `openWindow`；不涉及 Laya |
| 手册 | 照搬 `shtHTML` 模板 + `rogejson` 构建；数据与 `rogue.js` 共享解析结果 |
| 风险 | 均为只读；唯二外部请求是「新品皮肤」`HEAD` 探图（可关） |
