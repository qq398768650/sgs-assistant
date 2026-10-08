// ==UserScript==
// @name         三国杀助手
// @namespace    https://github.com/qq398768650/sgs-assistant
// @version      0.3.1
// @description  透视 · 记牌器 · 自动领奖 · 弹窗治理 · 山河图事件名。只读监听通信，不修改游戏数据。
// @author       qq398768650
// @match        *://*.sanguosha.com/*
// @run-at       document-start
// @grant        none
// @updateURL    https://fastly.jsdelivr.net/gh/qq398768650/sgs-assistant@main/sgs-assistant.user.js
// @downloadURL  https://fastly.jsdelivr.net/gh/qq398768650/sgs-assistant@main/sgs-assistant.user.js
// @require      https://fastly.jsdelivr.net/gh/qq398768650/sgs-assistant@main/data/game-data.js
// @require      https://fastly.jsdelivr.net/gh/qq398768650/sgs-assistant@main/data/rogue-fights.js
// ==/UserScript==

/**
 * 记牌器核心
 *
 * 设计：与具体协议解耦。数据来源有两条：
 *   1. 协议适配器（adapter）把 WebSocket 消息翻译成标准事件 —— 待实现
 *   2. 牌局扫描（noteBoard）：从 Laya 显示树读到的牌面 skin / 动作文本 —— 已可用
 *
 * 标准事件形状：
 *   { kind: 'card-seen',  seat: <0-7>, card: { name, suit, rank } }   牌面进入可见区
 *   { kind: 'card-used',  seat: <0-7>, card: { name, suit, rank } }   有人打出/使用
 *   { kind: 'card-lost',  seat: <0-7>, card: { name, suit, rank } }   弃置/判定消耗
 *   { kind: 'phase',      seat: <0-7>, phase: <string> }              阶段切换
 *   { kind: 'turn',       seat: <0-7> }                               回合开始
 *   { kind: 'reset' }                                                 新一局
 */
(function () {
  'use strict';
  var M = (window.__SGS_MODULES__ = window.__SGS_MODULES__ || {});

  var SUIT_ALIAS = {
    'spade': 'spade', 'spades': 'spade', '黑桃': 'spade', 's': 'spade',
    'heart': 'heart', 'hearts': 'heart', '红桃': 'heart', 'h': 'heart',
    'club': 'club', 'clubs': 'club', '梅花': 'club', 'c': 'club',
    'diamond': 'diamond', 'diamonds': 'diamond', '方块': 'diamond', 'd': 'diamond'
  };

  function normSuit(v) {
    if (v == null) return '';
    var k = String(v).toLowerCase().trim();
    return SUIT_ALIAS[k] || SUIT_ALIAS[String(v).trim()] || k;
  }

  function key(card) {
    return (card.name || '?') + '|' + normSuit(card.suit) + '|' + (card.rank == null ? '?' : card.rank);
  }

  function DeckTracker() {
    this.reset();
  }

  DeckTracker.prototype.reset = function () {
    this.seen = [];
    this.byKey = {};
    this.byName = {};
    this.byRank = {};
    this.turn = 0;
    this.phase = '';
    this.currentSeat = -1;
    this.startedAt = Date.now();
  };

  DeckTracker.prototype.note = function (evt) {
    if (!evt || !evt.kind) return;
    if (evt.kind === 'reset') return this.reset();
    if (evt.kind === 'turn') { this.turn++; this.currentSeat = evt.seat; return; }
    if (evt.kind === 'phase') { this.phase = evt.phase || ''; return; }

    var card = evt.card;
    if (!card) return;
    var k = key(card);
    this.byKey[k] = (this.byKey[k] || 0) + 1;
    if (card.name) this.byName[card.name] = (this.byName[card.name] || 0) + 1;
    if (card.rank != null) this.byRank[card.rank] = (this.byRank[card.rank] || 0) + 1;
    this.seen.push({ seat: evt.seat, card: card, kind: evt.kind, t: Date.now() });
  };

  DeckTracker.prototype.summaryByName = function () {
    var self = this;
    return Object.keys(this.byName)
      .map(function (n) { return { name: n, count: self.byName[n] }; })
      .sort(function (a, b) { return b.count - a.count; });
  };

  DeckTracker.prototype.summaryByRank = function () {
    var order = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
    var self = this;
    return order.map(function (r) { return { rank: r, count: self.byRank[r] || 0 }; });
  };

  DeckTracker.prototype.recent = function (n) {
    return this.seen.slice(-(n || 20)).reverse();
  };

  /* ------------------------------------------------ 牌面 skin → 中文牌名 */
  // 字典 cards 里每条都带 pinyin（如 JueDou / Sha），牌面资源名即由它派生。
  // 协议记牌器则直接用牌 ID（协议 CardIDs 里的值就是字典的 id）。
  var CARD_INDEX = null;
  var CARD_NAME = Object.create(null);   // 牌 ID -> 中文牌名
  var boardKeys = Object.create(null);

  function buildCardIndex(dict) {
    var idx = Object.create(null);
    if (!dict || !dict.cards) return idx;
    Object.keys(dict.cards).forEach(function (id) {
      var c = dict.cards[id];
      if (!c || !c.name) return;
      CARD_NAME[String(id)] = c.name;
      if (!c.pinyin) return;
      var k = String(c.pinyin).toLowerCase();
      if (!idx[k]) idx[k] = c.name;
    });
    return idx;
  }

  function skinToName(skin) {
    if (!CARD_INDEX) return '';
    var base = String(skin).split('?')[0].split('/').pop().replace(/\.(png|jpg|jpeg|webp)$/i, '');
    var k = base.toLowerCase().replace(/[^a-z]/g, '');
    if (!k) return '';
    if (CARD_INDEX[k]) return CARD_INDEX[k];
    var keys = Object.keys(CARD_INDEX);
    for (var i = 0; i < keys.length; i++) {
      if (k.indexOf(keys[i]) === 0) return CARD_INDEX[keys[i]];
    }
    return '';
  }

  M.deck = new DeckTracker();

  M.deck.loadDict = function (cb) {
    if (CARD_INDEX) { if (cb) cb(); return; }
    var d = window.__SGS_GAMEDATA__;
    if (d) CARD_INDEX = buildCardIndex(d);
    if (cb) cb();
  };

  // 消费主世界的牌局扫描：只在牌「新出现」时记一笔（同位置同名的牌不会重复计数）
  M.deck.noteBoard = function (board) {
    if (!board || !board.cards || !CARD_INDEX) return 0;
    var now = Object.create(null);
    var added = 0;
    for (var i = 0; i < board.cards.length; i++) {
      var c = board.cards[i];
      var nm = skinToName(c.skin);
      if (!nm) continue;
      var k = nm + '@' + c.x + ',' + c.y;
      now[k] = 1;
      if (boardKeys[k]) continue;
      M.deck.note({ kind: 'card-used', seat: null, card: { name: nm } });
      added++;
    }
    boardKeys = now;
    return added;
  };

  M.deck.dictReady = function () { return !!CARD_INDEX; };
  M.deck.skinToName = skinToName;
  // 牌 ID → 中文牌名（透视模块用；未知 ID 回退成「未知#id」）
  M.deck.nameOfId = nameOfId;

  /* -------------------------------------------- 协议记牌（inject.js 下发） */
  // 主世界把 PubGsCMoveCard 状态机的结果通过 laya-scan.deck 传过来：
  //   { seen: {cardId: 亮明次数}, recent: [{id,seat,mt,from,to,t}], deck, total, version }
  // 这里只做「牌 ID → 中文牌名」映射与汇总，判定逻辑全在主世界。
  var MOVE_LABEL = {
    1: '发牌', 2: '使用', 3: '打出', 4: '弃置', 5: '选择', 6: '展示', 7: '收回',
    8: '获得', 9: '入弃牌堆', 10: '闪电', 11: '交换', 12: '重铸', 13: '拼点',
    14: '判定弃置', 15: '移动', 16: '使用', 17: '打出', 18: '获得', 19: '移动',
    20: '铸凿', 21: '展示', 22: '换装', 23: '自若', 24: '结束', 27: '给予'
  };
  var protoSeen = Object.create(null);
  var protoRecent = [];
  var protoDeck = null;
  var protoTotal = 0;
  var protoVersion = -1;

  function nameOfId(id) {
    var nm = CARD_NAME[String(id)];
    return nm || ('未知#' + id);
  }

  M.deck.noteProto = function (state) {
    if (!state || typeof state !== 'object') return;
    if (state.version === protoVersion && state.total === protoTotal) return;
    protoVersion = state.version;
    protoTotal = state.total || 0;
    protoSeen = Object.create(null);
    var seen = state.seen || {};
    Object.keys(seen).forEach(function (id) { protoSeen[id] = seen[id]; });
    protoRecent = (state.recent || []).map(function (r) {
      return {
        id: r.id,
        name: nameOfId(r.id),
        seat: r.seat,
        mt: r.mt,
        label: MOVE_LABEL[r.mt] || ('移动' + r.mt),
        t: r.t
      };
    });
    protoDeck = Array.isArray(state.deck) ? state.deck : null;
  };

  // 按牌名汇总（已亮明的牌）
  M.deck.summaryProto = function () {
    var by = Object.create(null);
    Object.keys(protoSeen).forEach(function (id) {
      var nm = nameOfId(id);
      by[nm] = (by[nm] || 0) + protoSeen[id];
    });
    return Object.keys(by)
      .map(function (n) { return { name: n, count: by[n] }; })
      .sort(function (a, b) { return b.count - a.count || a.name.localeCompare(b.name); });
  };

  M.deck.recentProto = function (n) {
    return protoRecent.slice(-(n || 20)).reverse();
  };

  M.deck.protoStats = function () {
    return { total: protoTotal, kinds: Object.keys(protoSeen).length, deck: protoDeck ? protoDeck.length : 0 };
  };

  M.deck.reset = function () {
    DeckTracker.prototype.reset.call(M.deck);
    protoSeen = Object.create(null);
    protoRecent = [];
    protoDeck = null;
    protoTotal = 0;
  };

  M.DeckTracker = DeckTracker;
})();

/**
 * 透视 —— 把「客户端已知的各座位手牌」摊开显示
 *
 * 数据来源（两条，互为补充）：
 *   1. 客户端座位模型（主世界读取，最准）：每个座位的
 *        HandCardIDs       —— 手牌牌面（仅在该座位对你可见时才非空）
 *        HandShowCardIDs   —— 该座位「已公开」的手牌（游戏自己维护的已知集合）
 *        VisibleHandCardIDs—— 新版协议的手牌可见集
 *        AiHandShowCards   —— 明牌（技能/明置公开的手牌）
 *        EquipCards / JudgeCards —— 装备区 / 判定区（本就公开）
 *      游戏里渲染闸门是 seat.CanRenderHandCardFace(card) = CanViewHandCard || IsVisibleHandCard(card)，
 *      也就是说「客户端知道多少」与「界面画出多少」是两件事 —— 本模块读的是前者。
 *   2. 协议状态机（主世界 PEEK.hands）：按 PubGsCMoveCard 逐张记进/记出每个座位的手牌区，
 *      牌面带 ID 的记牌名，不带 ID 的记「未知」。座位模型读不到时（山河图等）靠这条兜底。
 *
 * 已知 / 未知 的语义：`已知` = 这张牌的身份在本局里已经暴露过（打出/弃置/获得/明牌…），
 * `未知 ×N` = 该座位手牌里还没暴露过的牌 —— 服务端不下发它们的牌面，任何客户端插件都读不到，
 * 只能用「牌堆总账 − 已亮明」去推。主世界 probe() 会实测服务端到底给不给暗牌牌面。
 */
(function () {
  'use strict';
  var M = (window.__SGS_MODULES__ = window.__SGS_MODULES__ || {});
  var IS_TOP = window.top === window.self;

  var enabled = true;
  var overlayOn = false;
  var state = null;
  var lastSig = '';
  var overlayEl = null;

  function nameOf(id) {
    if (id == null) return '?';
    if (M.deck && typeof M.deck.nameOfId === 'function') return M.deck.nameOfId(id);
    return '#' + id;
  }

  // 已知集合：{ id: 张数 }
  function expand(list) {
    var out = Object.create(null);
    if (!list || !list.length) return out;
    for (var i = 0; i < list.length; i++) {
      var id = list[i];
      if (id == null || id <= 0) continue;
      out[id] = (out[id] || 0) + 1;
    }
    return out;
  }

  function mergeMax(dst, src) {
    Object.keys(src).forEach(function (k) {
      if (!dst[k] || dst[k] < src[k]) dst[k] = src[k];
    });
    return dst;
  }

  function countOf(mult) {
    var n = 0;
    Object.keys(mult).forEach(function (k) { n += mult[k]; });
    return n;
  }

  function chip(id, cls) {
    var el = document.createElement('span');
    el.className = 'chip' + (cls ? ' ' + cls : '');
    el.textContent = nameOf(id);
    return el;
  }

  function chipText(text, cls) {
    var el = document.createElement('span');
    el.className = 'chip' + (cls ? ' ' + cls : '');
    el.textContent = text;
    return el;
  }

  /* ------------------------------------------------------------- 面板页签 */
  function render(container) {
    if (!container) return;
    container.innerHTML = '';

    var head = document.createElement('div');
    head.className = 'sub';
    if (!state) {
      head.textContent = '等待牌局…（进入对局后自动接管）';
      container.appendChild(head);
      return;
    }

    var seats = state.seats || [];
    var known = 0, unknown = 0;
    seats.forEach(function (s) {
      known += Object.keys(s.known || {}).length;
      unknown += s.unknown || 0;
    });
    head.textContent = '座位 ' + seats.length + ' · 已知手牌 ' + known + ' 张 / 未知 ' + unknown +
      ' 张 · 手牌移动 ' + (state.moves || 0) + ' 次';
    container.appendChild(head);

    var diag = document.createElement('div');
    diag.className = 'sub';
    diag.textContent = state.hiddenIds
      ? ('服务端已下发暗牌牌面 ' + state.hiddenIds + ' 张（暗牌可直接看到）')
      : '服务端未下发暗牌牌面：只能看到已暴露的牌 + 未知张数';
    diag.title = '探测口径：牌堆→他人手牌 且协议里带真实牌 ID 的移动';
    container.appendChild(diag);

    if (!seats.length) {
      var e = document.createElement('div');
      e.className = 'muted';
      e.textContent = '未读到座位（未在对局中，或座位模型尚未创建）';
      container.appendChild(e);
      return;
    }

    seats.forEach(function (s) {
      var box = document.createElement('div');
      box.className = 'seat' + (s.self ? ' me' : '');

      var sh = document.createElement('div');
      sh.className = 'sh';
      var left = document.createElement('span');
      left.textContent = '座位' + s.seat + (s.name ? ' ' + s.name : '') + (s.self ? '（你）' : '') +
        (s.dead ? ' · 阵亡' : '');
      var right = document.createElement('span');
      right.textContent = '手牌 ' + s.count + (s.unknown ? '（未知 ' + s.unknown + '）' : '');
      sh.appendChild(left);
      sh.appendChild(right);
      box.appendChild(sh);

      var cn = document.createElement('div');
      cn.className = 'cn';
      var ids = Object.keys(s.known || {}).map(Number);
      if (!ids.length && !s.unknown) {
        cn.appendChild(chipText('无手牌', 'un'));
      } else {
        ids.sort(function (a, b) { return a - b; });
        ids.forEach(function (id) { cn.appendChild(chip(id, s.mingIds && s.mingIds[id] ? 'ming' : '')); });
        if (s.unknown) cn.appendChild(chipText('未知 ×' + s.unknown, 'un'));
      }
      box.appendChild(cn);

      if ((s.equip && s.equip.length) || (s.judge && s.judge.length)) {
        var en = document.createElement('div');
        en.className = 'cn';
        (s.equip || []).forEach(function (id) { en.appendChild(chip(id, 'eq')); });
        (s.judge || []).forEach(function (id) { en.appendChild(chip(id, 'jd')); });
        box.appendChild(en);
      }

      container.appendChild(box);
    });
  }

  /* ------------------------------------------------------- 座位下方贴牌面 */
  // 对局中不必打开面板：每个座位（除自己）的 UI 矩形正下方贴一条。
  // 座位矩形由主世界用 Bqt.GetSeatUiByIndex(i) + localToGlobal 量出来，是 canvas 内像素坐标；
  // canvas 在页面 (0,0)，加上 canvasRect 的偏移就是页面坐标。
  function labelStyle() {
    return 'position:absolute;transform:translateX(-50%);text-align:center;' +
      'font:11px/1.35 "Microsoft YaHei",sans-serif;color:#f0e2c0;' +
      'background:rgba(18,14,12,.8);border:1px solid #6b5a3a;border-radius:4px;' +
      'padding:1px 5px;white-space:nowrap;max-width:200px;overflow:hidden;text-overflow:ellipsis';
  }

  function renderOverlay() {
    if (!IS_TOP) return;
    var seats = (state && state.seats) || [];
    var any = seats.some(function (s) { return s.rect && s.rect.vis && s.rect.w; });
    if (!enabled || !overlayOn || !any) {
      if (overlayEl) overlayEl.style.display = 'none';
      return;
    }
    if (!overlayEl) {
      overlayEl = document.createElement('div');
      overlayEl.id = 'sgs-peek-seats';
      overlayEl.style.cssText = 'position:fixed;left:0;top:0;width:0;height:0;' +
        'z-index:2147482000;pointer-events:none';
      (document.body || document.documentElement).appendChild(overlayEl);
    }
    overlayEl.style.display = '';
    overlayEl.innerHTML = '';

    var cvs = state.canvas || { left: 0, top: 0 };
    seats.forEach(function (s) {
      if (s.seat === state.mySeat) return;      // 自己的牌自己看得见，不占位置
      if (!s.rect || !s.rect.vis || !s.rect.w) return;

      var box = document.createElement('div');
      box.style.cssText = labelStyle();
      box.style.left = (cvs.left + s.rect.x + s.rect.w / 2) + 'px';
      box.style.top = (cvs.top + s.rect.y + s.rect.h + 3) + 'px';

      var head = document.createElement('div');
      head.textContent = '手牌 ' + s.count + (s.unknown ? ' · 未知 ' + s.unknown : '');
      if (s.unknown) head.style.color = '#d8b871';
      box.appendChild(head);

      var ids = Object.keys(s.known || {}).map(Number).sort(function (a, b) { return a - b; });
      if (ids.length) {
        var line = document.createElement('div');
        ids.forEach(function (id) {
          var sp = document.createElement('span');
          sp.textContent = nameOf(id);
          sp.style.cssText = 'display:inline-block;margin:0 1px;padding:0 3px;border-radius:2px;' +
            'background:#3a2f1e;border:1px solid #6b5a3a' +
            (s.mingIds && s.mingIds[id] ? ';background:#2f4a2a;border-color:#4a7a3a;color:#bfe0a0' : '');
          line.appendChild(sp);
        });
        box.appendChild(line);
      }
      overlayEl.appendChild(box);
    });
  }

  /* ------------------------------------------------------------------ 接口 */
  // 主世界每 1.2s 推一次快照，内容没变就不重建 DOM（座位坐标变了也要重建）
  function signature(st) {
    var parts = [st.moves, st.hiddenIds, st.mySeat];
    (st.seats || []).forEach(function (s) {
      parts.push(s.seat, s.count, s.name, (s.knownIds || []).length, (s.showIds || []).length,
        (s.visibleIds || []).length, (s.mingIds || []).length, (s.equipIds || []).length,
        (s.judgeIds || []).length,
        s.rect ? (s.rect.x + ',' + s.rect.y + ',' + s.rect.w + ',' + s.rect.h + ',' + (s.rect.vis ? 1 : 0)) : '-');
    });
    (st.protoHands || []).forEach(function (p) {
      parts.push('p', p.seat, p.count, (p.knownIds || []).join('.'));
    });
    return parts.join('|');
  }

  var PEEK = {
    note: function (st) {
      if (!st || typeof st !== 'object') return;
      var sig = signature(st);
      if (sig === lastSig) return;
      lastSig = sig;
      state = st;
      state.seats = (st.seats || []).map(function (s) {
        var known = Object.create(null);
        mergeMax(known, expand(s.knownIds));
        mergeMax(known, expand(s.showIds));
        mergeMax(known, expand(s.visibleIds));
        var mingIds = expand(s.mingIds);
        mergeMax(known, mingIds);
        var unknown = Math.max(0, (s.count || 0) - countOf(known));
        return {
          seat: s.seat,
          name: s.name || '',
          count: s.count || 0,
          self: !!s.self,
          dead: !!s.dead,
          known: known,
          mingIds: mingIds,
          unknown: unknown,
          equip: s.equipIds || [],
          judge: s.judgeIds || [],
          rect: s.rect || null
        };
      });
      // 座位模型读不到时，用协议追踪的结果兜底
      var have = {};
      state.seats.forEach(function (s) { have[s.seat] = 1; });
      (st.protoHands || []).forEach(function (p) {
        if (have[p.seat]) {
          var t = null;
          for (var i = 0; i < state.seats.length; i++) if (state.seats[i].seat === p.seat) t = state.seats[i];
          if (t) {
            // 两边合并后重算未知：count 是服务端给的手牌数，known 是已暴露的并集
            mergeMax(t.known, expand(p.knownIds));
            t.unknown = Math.max(0, (t.count || 0) - countOf(t.known));
          }
          return;
        }
        var known = expand(p.knownIds);
        state.seats.push({
          seat: p.seat, name: '', count: p.count, self: !!p.self, dead: false,
          known: known, mingIds: Object.create(null),
          unknown: Math.max(0, p.count - countOf(known)),
          equip: [], judge: []
        });
      });
      state.seats.sort(function (a, b) { return a.seat - b.seat; });
      renderOverlay();
    },
    state: function () { return state; },
    setEnabled: function (v) {
      enabled = !!v;
      if (!enabled && overlayEl) overlayEl.style.display = 'none';
      else renderOverlay();
    },
    setOverlay: function (v) { overlayOn = !!v; renderOverlay(); },
    render: render
  };

  M.peek = PEEK;
})();

/**
 * 自动领奖 —— 扩展侧控制代理（ISOLATED world）
 *
 * 真正的扫描/点击逻辑在 MAIN world（src/inject.js 的 AUTO.rewards），
 * 因为只有主世界能访问 Laya 显示树。这里只负责：开关下发 + 日志接收 + 文案表。
 */
(function () {
  'use strict';
  var M = (window.__SGS_MODULES__ = window.__SGS_MODULES__ || {});
  if (M.rewards) return;

  var CONFIG = {
    enabled: false,
    intervalMs: 2500,
    cooldownMs: 1500,
    // 领取按钮的候选文案（主世界按此做文本匹配）
    claimWords: ['一键领取', '领取奖励', '立即领取', '领取', '收下'],
    // 危险词：命中则一律跳过（哪怕文案里含"领取"）
    denyWords: ['支付', '充值', '购买', '元', '人民币', '元宝', '钻石', '开通', '续费',
                '订阅', '绑定', '实名', '身份证', '手机号', '验证码', '删除', '解绑', '注销']
  };

  var log = [];

  function cmd(payload) {
    try {
      window.postMessage(Object.assign({ __sgsCmd: true }, payload), '*');
    } catch (e) {}
  }

  M.rewards = {
    CONFIG: CONFIG,
    log: log,
    applyConfig: function () {
      cmd({ cmd: 'set-config', config: { rewardsEnabled: !!CONFIG.enabled } });
    },
    setEnabled: function (v) {
      CONFIG.enabled = !!v;
      M.rewards.applyConfig();
    },
    // 手动触发一次（面板按钮）
    runOnce: function () { cmd({ cmd: 'auto-now' }); },
    note: function (rec) {
      log.push(rec);
      if (log.length > 200) log.shift();
    },
    recent: function (n) { return log.slice(-(n || 20)).reverse(); }
  };
})();

/**
 * 自动领奖（内部接口版）—— 扩展侧控制代理（ISOLATED world）
 *
 * 真正的领取动作在主世界（src/inject.js 的 AUTO.claims）：用游戏自己的
 * 任务/活动管理器接口领奖，不依赖界面上那些图片形式的「领取」按钮。
 * 这里只负责开关下发。
 */
(function () {
  'use strict';
  var M = (window.__SGS_MODULES__ = window.__SGS_MODULES__ || {});
  if (M.claims) return;

  var CONFIG = {
    enabled: false,
    intervalMs: 3000
  };

  function cmd(payload) {
    try { window.postMessage(Object.assign({ __sgsCmd: true }, payload), '*'); } catch (e) {}
  }

  M.claims = {
    CONFIG: CONFIG,
    applyConfig: function () {
      cmd({ cmd: 'set-config', config: { claimsEnabled: !!CONFIG.enabled } });
    },
    setEnabled: function (v) {
      CONFIG.enabled = !!v;
      M.claims.applyConfig();
    }
  };
})();

/**
 * 弹窗治理 —— 扩展侧控制代理（ISOLATED world）
 *
 * 扫描与关闭逻辑在 MAIN world（src/inject.js 的 AUTO.popups）。
 * 策略：白名单优先 + 危险词否决 + 「窗口内存在关闭语义按钮」才动手，宁可不关也不误关。
 */
(function () {
  'use strict';
  var M = (window.__SGS_MODULES__ = window.__SGS_MODULES__ || {});
  if (M.popups) return;

  var CONFIG = {
    enabled: false,
    intervalMs: 1600,
    cooldownMs: 900,
    mode: 'safe',            // safe=只关提示/公告/广告/奖励类；all=关所有非白名单窗口
    closeWords: ['确定', '关闭', '知道了', '我知道了', '好的', '取消', '下次再说', '残忍拒绝', '不再提示'],
    denyWords: ['支付', '充值', '购买', '元', '人民币', '元宝', '钻石', '绑定', '实名', '身份证',
                '手机号', '验证码', '删除', '解绑', '注销', '退出'],
    // 永不自动关闭的窗口名（按窗口 name 匹配），面板可增删
    keepNames: ['MailWindow', 'ShopWindow', 'PayWindow', 'BattleWindow']
  };

  var log = [];

  function cmd(payload) {
    try {
      window.postMessage(Object.assign({ __sgsCmd: true }, payload), '*');
    } catch (e) {}
  }

  M.popups = {
    CONFIG: CONFIG,
    log: log,
    applyConfig: function () {
      cmd({
        cmd: 'set-config',
        config: {
          popupsEnabled: !!CONFIG.enabled,
          popupMode: CONFIG.mode,
          keepNames: CONFIG.keepNames
        }
      });
    },
    setEnabled: function (v) { CONFIG.enabled = !!v; M.popups.applyConfig(); },
    setMode: function (m) { CONFIG.mode = m === 'all' ? 'all' : 'safe'; M.popups.applyConfig(); },
    keep: function (name) {
      if (!name || CONFIG.keepNames.indexOf(name) >= 0) return;
      CONFIG.keepNames.push(name);
      M.popups.applyConfig();
    },
    unkeep: function (name) {
      var i = CONFIG.keepNames.indexOf(name);
      if (i >= 0) { CONFIG.keepNames.splice(i, 1); M.popups.applyConfig(); }
    },
    dumpWindows: function () { cmd({ cmd: 'dump-windows' }); },
    note: function (rec) {
      log.push(rec);
      if (log.length > 200) log.shift();
    },
    recent: function (n) { return log.slice(-(n || 20)).reverse(); }
  };
})();

/**
 * 山河图事件名显示（ISOLATED world）
 *
 * 数据来源：主世界 inject.js 周期扫描 Laya 显示树 → laya-scan.rogueMap
 * 渲染方式：pointer-events:none 的 DOM 覆盖层，把事件名贴到地图节点上方
 *
 * 坐标换算：inject.js 给的是 Laya 逻辑坐标（localToGlobal），
 *           这里按 canvas 实际渲染尺寸 / stage 逻辑尺寸 的比例映射到屏幕像素。
 */
(function () {
  'use strict';
  var M = (window.__SGS_MODULES__ = window.__SGS_MODULES__ || {});
  if (M.rogue) return;

  var CONFIG = {
    enabled: true,
    showDesc: false,      // 悬停显示事件描述
    showTrigger: true,    // 可触发节点加 ★
    showOptions: true,    // 奇遇：标签里列出各选项及奖励
    showUnits: true,      // 战斗：标签里列出敌方单位
    showRewards: true     // 战斗：标签里列出过关奖励（战法/技能/卡牌/装备多选一 + 铜钱）
  };

  var dict = null;
  var dictState = 'idle';               // idle | loading | ready | failed
  var fights = null;
  var fightsState = 'idle';
  var overlay = null;
  var labels = Object.create(null);
  var stats = { rendered: 0, resolved: 0, missing: 0, lastAt: 0 };

  // ---------------------------------------------------------------- 字典
  function loadDict(cb) {
    if (dictState === 'ready') { if (cb) cb(true); return; }
    if (dictState === 'loading') return;
    dictState = 'loading';
    var d = window.__SGS_GAMEDATA__;
    if (d) {
      dict = d;
      dictState = 'ready';
      if (cb) cb(true);
      return;
    }
    dictState = 'failed';
    if (cb) cb(false);
  }

  function eventOf(evId) {
    if (!dict || !dict.events) return null;
    return dict.events[String(evId)] || null;
  }

  // 战斗字典：山河图地图节点里，战斗节点的 event 其实是 Fight ID
  function loadFights(cb) {
    if (fightsState === 'ready') { if (cb) cb(true); return; }
    if (fightsState === 'loading') return;
    fightsState = 'loading';
    var d = window.__SGS_ROGUEFIGHTS__;
    if (d) {
      fights = (d && d.fights) || {};
      fightsState = 'ready';
      if (cb) cb(true);
      return;
    }
    fightsState = 'failed';
    if (cb) cb(false);
  }

  function fightOf(evId) {
    if (!fights) return null;
    return fights[String(evId)] || null;
  }

  function nameOf(evId) {
    var f = fightOf(evId);
    if (f && f.name) return f.name;
    var e = eventOf(evId);
    return e && e.name ? e.name : '';
  }

  var CIRCLED = '①②③④⑤⑥⑦⑧⑨⑩';
  // 事件名 + 各选项（选项名 → 奖励 / （代价））；战斗则列出敌方单位 + 过关奖励
  function labelText(nm, ev, fight, trigger, reward) {
    var head = (CONFIG.showTrigger && trigger ? '★ ' : '') + nm;
    var lines = [head];
    if (fight) {
      if (CONFIG.showUnits && fight.units && fight.units.length) {
        var counts = Object.create(null), order = [];
        fight.units.forEach(function (u) {
          if (!u) return;
          if (counts[u] === undefined) { counts[u] = 0; order.push(u); }
          counts[u]++;
        });
        var parts = order.map(function (u) { return counts[u] > 1 ? (u + '×' + counts[u]) : u; });
        if (parts.length) lines.push('单位：' + parts.join('、'));
      }
      if (CONFIG.showRewards) {
        // 过关奖励来自运行时配置（inject.js 的 rogueFightReward）
        var bits = [];
        if (reward && reward.rewards && reward.rewards.length) {
          bits = bits.concat(reward.rewards);
        }
        if (reward && reward.tongqian) bits.push('铜钱 ' + reward.tongqian);
        if (bits.length) lines.push('过关奖励：' + bits.join(' · '));
      }
      return lines.join('\n');
    }
    if (CONFIG.showOptions && ev && ev.options && ev.options.length) {
      ev.options.forEach(function (o, i) {
        var num = CIRCLED.charAt(i) || ('(' + (i + 1) + ')');
        var s = num + ' ' + (o.label || '');
        var reward = o.effectText || '';
        var cost = o.effectValue || '';
        if (reward) s += ' → ' + reward;
        if (cost) s += '（' + cost + '）';
        lines.push(s);
      });
    }
    return lines.join('\n');
  }

  // ------------------------------------------------------------ 覆盖层
  function ensureOverlay() {
    if (overlay && overlay.isConnected) return overlay;
    overlay = document.createElement('div');
    overlay.id = 'sgs-rogue-overlay';
    overlay.style.cssText = [
      'position:fixed', 'left:0', 'top:0', 'right:0', 'bottom:0',
      'pointer-events:none', 'z-index:2147482000', 'overflow:hidden'
    ].join(';');
    (document.body || document.documentElement).appendChild(overlay);
    labels = Object.create(null);
    return overlay;
  }

  function makeLabel() {
    var el = document.createElement('div');
    el.style.cssText = [
      'position:absolute', 'left:0', 'top:0', 'transform:translate(0px,0px)',
      'font:600 11px/1.45 "Microsoft YaHei",sans-serif',
      'color:#ffe9b0', 'background:rgba(20,14,10,.88)',
      'border:1px solid rgba(200,164,92,.75)', 'border-radius:4px',
      'padding:2px 6px', 'white-space:pre-line', 'text-align:left',
      'max-width:260px',
      'text-shadow:0 1px 2px #000', 'box-shadow:0 1px 4px rgba(0,0,0,.5)',
      'pointer-events:none'
    ].join(';');
    return el;
  }

  function drop(el) {
    if (el && el.parentNode) el.parentNode.removeChild(el);
  }

  function clearAll() {
    Object.keys(labels).forEach(function (k) { drop(labels[k]); delete labels[k]; });
    stats.rendered = 0;
  }

  // ---------------------------------------------------------------- 渲染
  function render(scan) {
    if (!CONFIG.enabled) { clearAll(); return; }
    if (dictState === 'idle') loadDict();
    if (fightsState === 'idle') loadFights();

    var items = (scan && scan.items) || [];
    var st = (scan && scan.stage) || {};
    var cv = scan && scan.canvas;
    if (!items.length || !cv || !st.w || !st.h) { clearAll(); return; }

    var sx = cv.width / st.w;
    var sy = cv.height / st.h;

    ensureOverlay();

    stats.resolved = 0;
    stats.missing = 0;

    var seen = Object.create(null);
    var shown = 0;

    items.forEach(function (it) {
      if (it.visible === false) return;
      var fight = fightOf(it.event);
      var ev = eventOf(it.event);
      var nm = fight ? fight.name : (ev && ev.name ? ev.name : '');
      if (!nm) { stats.missing++; return; }
      stats.resolved++;

      var key = it.event + '@' + it.location;
      seen[key] = 1;
      var el = labels[key];
      if (!el) { el = labels[key] = makeLabel(); overlay.appendChild(el); }

      // x,y 是节点左上角，bw/bh 是图标绘制尺寸；取图标中心，把标签压在图标上
      var x = cv.left + (it.x + (it.bw || 0) / 2) * sx;
      var y = cv.top + (it.y + (it.bh || 0) / 2) * sy;
      el.style.transform =
        'translate(' + Math.round(x) + 'px,' + Math.round(y) + 'px) translate(-50%,-50%)';
      el.textContent = labelText(nm, ev, fight, it.trigger, it.reward);

      if (CONFIG.showDesc && ev && ev.desc) el.title = ev.desc;

      shown++;
    });

    Object.keys(labels).forEach(function (k) {
      if (seen[k]) return;
      drop(labels[k]);
      delete labels[k];
    });

    stats.rendered = shown;
    stats.lastAt = Date.now();
  }

  M.rogue = {
    CONFIG: CONFIG,
    loadDict: loadDict,
    loadFights: loadFights,
    render: render,
    clear: clearAll,
    nameOf: nameOf,
    fightOf: fightOf,
    stats: function () {
      return {
        dict: dictState,
        events: dict && dict.events ? Object.keys(dict.events).length : 0,
        fights: fightsState,
        fightCount: fights ? Object.keys(fights).length : 0,
        rendered: stats.rendered,
        resolved: stats.resolved,
        missing: stats.missing,
        lastAt: stats.lastAt
      };
    },
    setEnabled: function (v) {
      CONFIG.enabled = !!v;
      if (!CONFIG.enabled) clearAll();
    }
  };
})();

/**
 * 扩展侧主控（ISOLATED world）
 *
 * 职责：接收主世界转发来的数据 → 驱动记牌器 / 山河图 overlay → 渲染面板 → 下发自动化开关。
 * 面板只在顶层 frame 渲染；所有 frame 都参与数据采集。
 *
 * 自动化（领奖 / 弹窗）的执行体在主世界 inject.js，这里只发指令、收日志。
 */
(function () {
  'use strict';
  if (window.__SGS_UI__) return;
  window.__SGS_UI__ = true;

  var M = window.__SGS_MODULES__ || {};
  var IS_TOP = window.top === window.self;

  /* ------------------------------------------------------------------ 总线 */
  var bus = {
    handlers: [],
    on: function (fn) { this.handlers.push(fn); },
    emit: function (e) {
      this.handlers.forEach(function (h) {
        try { h(e); } catch (err) { console.error('[SGS]', err); }
      });
    }
  };
  window.__SGS_BUS__ = bus;

  var stats = { wsOpened: 0, wsRecv: 0, wsSend: 0, lastAt: 0, urls: {}, bridgeReady: false, proto: null };

  function send(cmd, extra) {
    try {
      window.postMessage(Object.assign({ __sgsCmd: true, cmd: cmd }, extra || {}), '*');
    } catch (e) {}
  }

  window.addEventListener('message', function (e) {
    if (e.source !== window) return;
    var d = e.data;
    if (!d || !d.__sgsBridge) return;

    if (d.type === 'bridge-ready') {
      stats.bridgeReady = true;
      pushConfig();
    } else if (d.type === 'ws-open') {
      stats.wsOpened++;
      if (d.payload && d.payload.url) stats.urls[d.payload.url] = (stats.urls[d.payload.url] || 0) + 1;
    } else if (d.type === 'ws-recv') {
      stats.wsRecv++;
    } else if (d.type === 'ws-send') {
      stats.wsSend++;
    } else if (d.type === 'auto-log') {
      var k = d.payload && d.payload.kind;
      if (k && (k.indexOf('reward') === 0 || k === 'claim') && M.rewards) M.rewards.note(d.payload);
      else if (d.payload && M.popups) M.popups.note(d.payload);
    } else if (d.type === 'windows-dump') {
      renderWindowList((d.payload && d.payload.windows) || []);
    } else if (d.type === 'find-result') {
      console.log('[SGS] 文本查找', d.payload);
    } else if (d.type === 'peek-probe') {
      if (M.peek && d.payload && d.payload.snapshot) M.peek.note(d.payload.snapshot);
      console.log('[SGS] 透视实测', d.payload && d.payload.probe);
    } else if (d.type === 'click-result' || d.type === 'close-result') {
      console.log('[SGS] 动作结果', d.payload);
    }

    if (d.payload && d.payload.t) stats.lastAt = d.payload.t;
    bus.emit(d);
    if (IS_TOP) scheduleRender();
  });

  /* ------------------------------------------------------- 协议适配（待填） */
  var adapter = {
    enabled: false,
    feed: function () { return null; }
  };
  M.adapter = adapter;

  bus.on(function (evt) {
    if (evt.type !== 'ws-recv' && evt.type !== 'ws-send') return;
    var out;
    try { out = adapter.feed(evt); } catch (e) { out = null; }
    if (!out) return;
    (Array.isArray(out) ? out : [out]).forEach(function (e) {
      if (M.deck) M.deck.note(e);
    });
  });

  // 周期扫描结果：山河图地图节点 → 贴事件名；牌局面板 → 记牌器计数
  bus.on(function (evt) {
    if (evt.type !== 'laya-scan') return;
    var p = evt.payload || {};
    // 奇遇/选择窗口打开时收起地图标签，避免浮在窗口上方
    if (M.rogue) { try { M.rogue.render(p.eventDialog ? null : p.rogueMap); } catch (e) {} }
    if (M.deck && M.deck.noteBoard) { try { M.deck.noteBoard(p.board); } catch (e) {} }
    if (M.deck && M.deck.noteProto) { try { M.deck.noteProto(p.deck); } catch (e) {} }
    if (M.peek && M.peek.note) { try { M.peek.note(p.peek); } catch (e) {} }
    if (p.proto) stats.proto = p.proto;
  });

  /* -------------------------------------------------------------- 设置存储 */
  var SETTINGS_KEY = 'sgs-assistant-settings';
  var settings = {
    deckEnabled: true,
    peekEnabled: true,
    peekOverlay: true,
    rewardsEnabled: true,
    claimsEnabled: true,
    popupsEnabled: false,
    popupMode: 'safe',
    rogueEnabled: true,
    rogueShopEnabled: true,
    redpointsEnabled: false,
    protoEnabled: true,
    skipAskEnabled: false,
    keepNames: []
  };

  function loadSettings(cb) {
    try {
      var raw = localStorage.getItem(SETTINGS_KEY);
      var s = raw ? JSON.parse(raw) : {};
      Object.keys(s).forEach(function (k) { settings[k] = s[k]; });
    } catch (e) {}
    cb();
  }

  function saveSettings() {
    try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); } catch (e) {}
  }

  // 把当前设置下发到主世界（主世界可能比本脚本晚就绪，故多次重试）
  function pushConfig() {
    if (M.rewards) { M.rewards.CONFIG.enabled = !!settings.rewardsEnabled; M.rewards.applyConfig(); }
    if (M.claims) { M.claims.CONFIG.enabled = !!settings.claimsEnabled; M.claims.applyConfig(); }
    if (M.popups) {
      M.popups.CONFIG.enabled = !!settings.popupsEnabled;
      M.popups.CONFIG.mode = settings.popupMode === 'all' ? 'all' : 'safe';
      // 空数组视为「未自定义」，保留主世界的默认白名单
      if (Array.isArray(settings.keepNames) && settings.keepNames.length) M.popups.CONFIG.keepNames = settings.keepNames.slice(0);
      M.popups.applyConfig();
    }
    try {
      window.postMessage({ __sgsCmd: true, cmd: 'set-config', config: {
        redpointsEnabled: !!settings.redpointsEnabled,
        protoEnabled: settings.protoEnabled !== false,
        deckEnabled: settings.deckEnabled !== false,
        peekEnabled: settings.peekEnabled !== false,
        rogueShopEnabled: settings.rogueShopEnabled !== false,
        skipAskEnabled: !!settings.skipAskEnabled
      } }, '*');
    } catch (e) {}
  }

  /* ------------------------------------------------------------------ 样式 */
  var CSS = [
    ':host{all:initial}',
    '*{box-sizing:border-box;margin:0;padding:0}',
    '.fab{position:fixed;right:18px;bottom:18px;width:46px;height:46px;border-radius:50%;',
    'background:linear-gradient(145deg,#8c1f1f,#5a1010);color:#f5e6c8;border:1px solid #c8a45c;',
    'font:600 15px/46px "Microsoft YaHei",sans-serif;text-align:center;cursor:pointer;',
    'box-shadow:0 4px 14px rgba(0,0,0,.45);z-index:2147483000;user-select:none}',
    '.fab:hover{filter:brightness(1.15)}',
    '.panel{position:fixed;right:18px;bottom:74px;width:300px;max-height:70vh;display:none;',
    'flex-direction:column;background:rgba(24,20,18,.96);color:#e8dcc6;border:1px solid #6b5a3a;',
    'border-radius:10px;font:12px/1.5 "Microsoft YaHei",sans-serif;z-index:2147483001;',
    'box-shadow:0 10px 30px rgba(0,0,0,.6);overflow:hidden}',
    '.panel.open{display:flex}',
    '.hd{display:flex;align-items:center;justify-content:space-between;padding:8px 10px;',
    'background:linear-gradient(90deg,#3a2a1c,#241a12);cursor:move;border-bottom:1px solid #6b5a3a}',
    '.hd b{font-size:12px;letter-spacing:1px;color:#d8b871}',
    '.hd span{cursor:pointer;color:#a08b64;padding:0 4px}',
    '.tabs{display:flex;border-bottom:1px solid #4a3d29}',
    '.tabs button{flex:1;padding:6px 0;background:none;border:none;color:#9c8a6a;cursor:pointer;font:12px inherit}',
    '.tabs button.on{color:#e8c98a;background:rgba(200,164,92,.12)}',
    '.body{overflow:auto;padding:8px 10px;flex:1}',
    '.sec{display:none}.sec.on{display:block}',
    '.row{display:flex;justify-content:space-between;padding:3px 0;border-bottom:1px dotted #3a3225}',
    '.muted{color:#8b7c62}',
    '.grid{display:grid;grid-template-columns:repeat(7,1fr);gap:3px;margin:6px 0}',
    '.cell{background:#2a231a;border:1px solid #4a3d29;border-radius:4px;text-align:center;padding:3px 0}',
    '.cell b{display:block;color:#d8b871;font-size:11px}',
    '.cell i{font-style:normal;color:#8fa87a;font-size:11px}',
    '.sw{display:flex;align-items:center;justify-content:space-between;padding:5px 0}',
    '.sw input{accent-color:#8c1f1f}',
    '.btn{width:100%;margin-top:8px;padding:5px;background:#3a2a1c;color:#d8b871;',
    'border:1px solid #6b5a3a;border-radius:5px;cursor:pointer;font:12px inherit}',
    '.btn:hover{background:#4a3624}',
    '.sel{background:#2a231a;color:#d8b871;border:1px solid #4a3d29;border-radius:4px;font:12px inherit;padding:2px}',
    '.log{max-height:130px;overflow:auto;margin-top:6px}',
    '.log div{padding:2px 0;border-bottom:1px dotted #3a3225;color:#a89a7c}',
    '.tag{display:inline-block;padding:0 4px;border-radius:3px;font-size:10px}',
    '.tag.ok{background:#2f4a2a;color:#9fd08a}.tag.no{background:#4a2a2a;color:#d08a8a}',
    '.win{display:flex;justify-content:space-between;align-items:center;gap:6px;padding:3px 0;',
    'border-bottom:1px dotted #3a3225;color:#a89a7c}',
    '.win button{background:#3a2a1c;color:#d8b871;border:1px solid #6b5a3a;border-radius:3px;',
    'cursor:pointer;font:11px inherit;padding:1px 5px;flex:none}',
    '.sub{color:#7d6e56;font-size:11px;margin-top:6px}',
    '.seat{background:#2a231a;border:1px solid #4a3d29;border-radius:5px;padding:5px 6px;margin:5px 0}',
    '.seat.me{border-color:#8c6a2a;background:#302719}',
    '.seat .sh{display:flex;justify-content:space-between;gap:6px;color:#d8b871;font-size:11px}',
    '.seat .cn{display:flex;flex-wrap:wrap;gap:3px;margin-top:4px}',
    '.chip{background:#3a2f1e;border:1px solid #6b5a3a;border-radius:3px;padding:0 4px;font-size:11px;color:#e0cfa8}',
    '.chip.un{background:#241d16;border-style:dashed;color:#8b7c62}',
    '.chip.eq{background:#1f2a33;border-color:#3a5a6b;color:#a8d0e0}',
    '.chip.jd{background:#33202a;border-color:#6b3a5a;color:#e0a8c8}',
    '.chip.ming{background:#2f4a2a;border-color:#4a7a3a;color:#bfe0a0}'
  ].join('');

  /* ------------------------------------------------------------------ 面板 */
  var root = null, els = {};

  function h(tag, cls, text) {
    var el = document.createElement(tag);
    if (cls) el.className = cls;
    if (text != null) el.textContent = text;
    return el;
  }

  function buildPanel() {
    if (root) return;
    root = document.createElement('div');
    root.id = 'sgs-assistant-root';
    var shadow = root.attachShadow({ mode: 'open' });

    var style = document.createElement('style');
    style.textContent = CSS;
    shadow.appendChild(style);

    var fab = h('div', 'fab', '牌');
    var panel = h('div', 'panel');

    var hd = h('div', 'hd');
    hd.appendChild(h('b', null, '三国杀助手'));
    var close = h('span', null, '✕');
    close.title = '收起';
    hd.appendChild(close);
    panel.appendChild(hd);

    var tabs = h('div', 'tabs');
    [['peek', '透视'], ['deck', '记牌'], ['reward', '奖励'], ['setting', '设置']].forEach(function (t, i) {
      var b = h('button', i === 0 ? 'on' : '', t[1]);
      b.dataset.tab = t[0];
      tabs.appendChild(b);
    });
    panel.appendChild(tabs);

    var body = h('div', 'body');

    /* —— 透视页 */
    var secPeek = h('div', 'sec on');
    secPeek.dataset.sec = 'peek';
    els.peekBox = h('div', null, '');
    secPeek.appendChild(els.peekBox);
    els.peekProbe = h('button', 'btn', '实测一次（看服务端给不给暗牌牌面）');
    secPeek.appendChild(els.peekProbe);
    els.peekReset = h('button', 'btn', '重置本局透视');
    secPeek.appendChild(els.peekReset);
    body.appendChild(secPeek);

    /* —— 记牌页 */
    var secDeck = h('div', 'sec');
    secDeck.dataset.sec = 'deck';
    els.statLine = h('div', 'row');
    els.statLine.innerHTML = '<span class="muted">连接</span><span id="sgs-conn">—</span>';
    secDeck.appendChild(els.statLine);
    els.protoLine = h('div', 'sub', '');
    secDeck.appendChild(els.protoLine);
    els.protoList = h('div', 'log');
    secDeck.appendChild(els.protoList);
    els.rankGrid = h('div', 'grid');
    els.rankGrid.style.display = 'none';
    secDeck.appendChild(els.rankGrid);
    els.recent = h('div', 'log');
    secDeck.appendChild(els.recent);
    body.appendChild(secDeck);

    /* —— 奖励页 */
    var secReward = h('div', 'sec');
    secReward.dataset.sec = 'reward';
    var swReward = h('div', 'sw');
    swReward.appendChild(h('span', null, '自动领奖（内部接口）'));
    els.claimToggle = document.createElement('input');
    els.claimToggle.type = 'checkbox';
    swReward.appendChild(els.claimToggle);
    secReward.appendChild(swReward);
    secReward.appendChild(h('div', 'sub', '调用游戏自身的任务/活动接口领奖：七日登录、军典活跃、每日任务。这是真正能领到东西的通道。'));

    var swReward2 = h('div', 'sw');
    swReward2.appendChild(h('span', null, '自动点界面领取按钮'));
    els.rewardToggle = document.createElement('input');
    els.rewardToggle.type = 'checkbox';
    swReward2.appendChild(els.rewardToggle);
    secReward.appendChild(swReward2);
    secReward.appendChild(h('div', 'sub', '兜底：扫描当前界面里的「领取」文字按钮并点击；含支付/充值等危险词的一律跳过。'));
    els.claimAll = h('button', 'btn', '一键领取（内部接口）');
    secReward.appendChild(els.claimAll);
    els.runOnce = h('button', 'btn', '立即扫描一次（界面按钮兜底）');
    secReward.appendChild(els.runOnce);
    els.rewardLog = h('div', 'log');
    secReward.appendChild(els.rewardLog);
    body.appendChild(secReward);

    /* —— 设置页 */
    var secSet = h('div', 'sec');
    secSet.dataset.sec = 'setting';

    function sw(name, key) {
      var row = h('div', 'sw');
      row.appendChild(h('span', null, name));
      var inp = document.createElement('input');
      inp.type = 'checkbox';
      row.appendChild(inp);
      secSet.appendChild(row);
      els[key] = inp;
      return inp;
    }

    sw('记牌器', 'deckToggle');
    sw('透视（各座位手牌）', 'peekToggle');
    sw('座位下方贴牌面（对局中）', 'peekOverlayToggle');
    sw('山河图显示事件名', 'rogueToggle');
    sw('山河图：集市入口常显', 'rogueShopToggle');
    sw('自动关闭提示弹窗', 'popupToggle');
    sw('跳过求桃/助战询问（目标非自己才跳）', 'skipAskToggle');
    sw('隐藏左侧入口红点（只影响显示）', 'redpointToggle');

    var modeRow = h('div', 'sw');
    modeRow.appendChild(h('span', null, '关弹窗范围'));
    els.modeSel = document.createElement('select');
    els.modeSel.className = 'sel';
    [['safe', '仅提示/公告/广告'], ['all', '所有非白名单窗口']].forEach(function (o) {
      var op = document.createElement('option');
      op.value = o[0]; op.textContent = o[1];
      els.modeSel.appendChild(op);
    });
    modeRow.appendChild(els.modeSel);
    secSet.appendChild(modeRow);

    els.dumpBtn = h('button', 'btn', '抓取当前窗口清单');
    secSet.appendChild(els.dumpBtn);
    els.winList = h('div', 'log');
    secSet.appendChild(els.winList);

    els.resetBtn = h('button', 'btn', '重置本局记牌');
    secSet.appendChild(els.resetBtn);
    els.bridgeInfo = h('div', 'log');
    secSet.appendChild(els.bridgeInfo);
    body.appendChild(secSet);

    panel.appendChild(body);
    shadow.appendChild(panel);
    shadow.appendChild(fab);

    els.fab = fab; els.panel = panel; els.tabs = tabs; els.body = body;

    fab.onclick = function () { panel.classList.toggle('open'); };
    close.onclick = function () { panel.classList.remove('open'); };

    tabs.onclick = function (e) {
      var b = e.target.closest('button');
      if (!b) return;
      Array.prototype.forEach.call(tabs.children, function (x) { x.classList.toggle('on', x === b); });
      Array.prototype.forEach.call(body.children, function (s) {
        s.classList.toggle('on', s.dataset.sec === b.dataset.tab);
      });
    };

    els.deckToggle.onchange = function () { settings.deckEnabled = this.checked; saveSettings(); pushConfig(); scheduleRender(); };
    els.rewardToggle.onchange = function () {
      settings.rewardsEnabled = this.checked; saveSettings();
      if (M.rewards) M.rewards.setEnabled(this.checked);
      scheduleRender();
    };
    els.claimToggle.onchange = function () {
      settings.claimsEnabled = this.checked; saveSettings();
      if (M.claims) M.claims.setEnabled(this.checked);
      scheduleRender();
    };
    els.redpointToggle.onchange = function () {
      settings.redpointsEnabled = this.checked; saveSettings();
      pushConfig();
      scheduleRender();
    };
    els.popupToggle.onchange = function () {
      settings.popupsEnabled = this.checked; saveSettings();
      if (M.popups) M.popups.setEnabled(this.checked);
    };
    els.modeSel.onchange = function () {
      settings.popupMode = this.value; saveSettings();
      if (M.popups) M.popups.setMode(this.value);
    };
    els.rogueToggle.onchange = function () {
      settings.rogueEnabled = this.checked; saveSettings();
      if (M.rogue) M.rogue.setEnabled(this.checked);
    };
    els.rogueShopToggle.onchange = function () {
      settings.rogueShopEnabled = this.checked; saveSettings(); pushConfig();
      scheduleRender();
    };
    els.skipAskToggle.onchange = function () {
      settings.skipAskEnabled = this.checked; saveSettings(); pushConfig(); scheduleRender();
    };
    els.resetBtn.onclick = function () { if (M.deck) M.deck.reset(); send('reset-deck'); scheduleRender(); };
    els.peekProbe.onclick = function () { send('peek-probe'); scheduleRender(); };
    els.peekReset.onclick = function () { send('reset-peek'); scheduleRender(); };
    els.peekToggle.onchange = function () {
      settings.peekEnabled = this.checked; saveSettings(); pushConfig();
      if (M.peek) M.peek.setEnabled(this.checked);
      scheduleRender();
    };
    els.peekOverlayToggle.onchange = function () {
      settings.peekOverlay = this.checked; saveSettings();
      if (M.peek) M.peek.setOverlay(this.checked);
    };
    els.runOnce.onclick = function () { if (M.rewards) M.rewards.runOnce(); };
    els.claimAll.onclick = function () {
      if (!settings.claimsEnabled) {
        settings.claimsEnabled = true;
        if (els.claimToggle) els.claimToggle.checked = true;
        saveSettings();
        if (M.claims) M.claims.setEnabled(true);
      }
      send('claim-all', { rounds: 14 });
      scheduleRender();
    };
    els.dumpBtn.onclick = function () {
      els.dumpBtn.textContent = '已请求，等待回传…';
      send('dump-windows');
      setTimeout(function () { els.dumpBtn.textContent = '抓取当前窗口清单'; }, 1500);
    };

    makeDraggable(panel, hd);
    (document.body || document.documentElement).appendChild(root);
  }

  function makeDraggable(box, handle) {
    var sx = 0, sy = 0, ox = 0, oy = 0, dragging = false;
    handle.addEventListener('mousedown', function (e) {
      if (e.target.tagName === 'SPAN') return;
      dragging = true;
      sx = e.clientX; sy = e.clientY;
      var r = box.getBoundingClientRect();
      ox = r.left; oy = r.top;
      box.style.right = 'auto'; box.style.bottom = 'auto';
      box.style.left = ox + 'px'; box.style.top = oy + 'px';
      e.preventDefault();
    });
    window.addEventListener('mousemove', function (e) {
      if (!dragging) return;
      box.style.left = (ox + e.clientX - sx) + 'px';
      box.style.top = (oy + e.clientY - sy) + 'px';
    });
    window.addEventListener('mouseup', function () { dragging = false; });
  }

  /* ------------------------------------------------------- 窗口清单渲染 */
  function renderWindowList(wins) {
    if (!els.winList) return;
    els.winList.innerHTML = '';
    if (!wins.length) {
      els.winList.appendChild(h('div', 'muted', '当前没有打开的窗口'));
      return;
    }
    wins.forEach(function (w) {
      var row = h('div', 'win');
      var label = h('span', null, (w.name || w.cls || '?') + ' ' + w.w + 'x' + w.h +
        (w.buttons && w.buttons.length ? ' · ' + w.buttons.length + '按钮' : ''));
      label.title = (w.texts || []).join(' / ').slice(0, 200);
      row.appendChild(label);
      var b = h('button', null, '不关它');
      b.onclick = function () {
        if (M.popups) {
          M.popups.keep(w.name);
          settings.keepNames = M.popups.CONFIG.keepNames.slice(0);
          saveSettings();
          b.textContent = '已加白';
          b.disabled = true;
        }
      };
      row.appendChild(b);
      els.winList.appendChild(row);
    });
  }

  /* ------------------------------------------------------------------ 渲染 */
  var renderPending = false;
  function scheduleRender() {
    if (renderPending) return;
    renderPending = true;
    setTimeout(function () { renderPending = false; render(); }, 250);
  }

  function render() {
    if (!root || !M.deck) return;

    var conn = els.statLine.querySelector('#sgs-conn');
    if (conn) {
      conn.innerHTML = '';
      var ok = stats.wsOpened > 0;
      conn.appendChild(h('span', 'tag ' + (ok ? 'ok' : 'no'), ok ? '已接管' : '未发现通信'));
      conn.appendChild(document.createTextNode(' 收' + stats.wsRecv + ' 发' + stats.wsSend));
      if (stats.proto) {
        var pr = stats.proto;
        conn.appendChild(document.createTextNode(' · 协议 ' + pr.total + ' 条/' + pr.classes + ' 类'));
        if (pr.lastClass) conn.appendChild(h('span', 'tag ok', pr.lastClass));
      }
    }

    if (els.peekBox && M.peek) { try { M.peek.render(els.peekBox); } catch (e) {} }

    var pstat = M.deck.protoStats ? M.deck.protoStats() : { total: 0, kinds: 0, deck: 0 };    if (els.protoLine) {
      els.protoLine.textContent = pstat.total
        ? ('已亮明 ' + pstat.total + ' 张 / ' + pstat.kinds + ' 种' + (pstat.deck ? ' · 本局牌堆 ' + pstat.deck + ' 张' : ''))
        : '等待牌局（协议 PubGsCMoveCard）';
    }

    if (els.protoList) {
      els.protoList.innerHTML = '';
      var plist = M.deck.summaryProto ? M.deck.summaryProto() : [];
      if (!plist.length) {
        els.protoList.appendChild(h('div', 'muted', '暂无记录'));
      } else {
        plist.forEach(function (p) {
          var row = h('div', 'row');
          row.appendChild(h('span', null, p.name));
          row.appendChild(h('span', null, '×' + p.count));
          els.protoList.appendChild(row);
        });
      }
    }

    // 牌面扫描的按点数汇总（协议无数据时的兜底）
    if (els.rankGrid) {
      els.rankGrid.innerHTML = '';
      if (!pstat.total) {
        els.rankGrid.style.display = '';
        M.deck.summaryByRank().forEach(function (r) {
          var c = h('div', 'cell');
          c.appendChild(h('b', null, r.rank));
          c.appendChild(h('i', null, String(r.count)));
          els.rankGrid.appendChild(c);
        });
      } else {
        els.rankGrid.style.display = 'none';
      }
    }

    els.recent.innerHTML = '';
    var rows = (M.deck.recentProto ? M.deck.recentProto(15) : []);
    if (!rows.length) {
      rows = M.deck.recent(15).map(function (r) {
        var nm = (r.card && (r.card.name || r.card.rank)) || '?';
        return { name: nm, seat: r.seat, label: r.kind };
      });
    }
    if (!rows.length) {
      els.recent.appendChild(h('div', 'muted', '暂无记录'));
    } else {
      rows.forEach(function (r) {
        var d = h('div');
        d.textContent = '座位' + (r.seat != null && r.seat !== 255 ? r.seat : '?') + ' · ' + (r.name || '?') + ' · ' + (r.label || '');
        els.recent.appendChild(d);
      });
    }

    if (els.rewardLog) {
      els.rewardLog.innerHTML = '';
      var rl = M.rewards ? M.rewards.recent(20) : [];
      if (!rl.length) els.rewardLog.appendChild(h('div', 'muted', '暂无动作'));
      rl.forEach(function (r) {
        var d = h('div');
        var tm = new Date(r.t || Date.now());
        var hh = ('0' + tm.getHours()).slice(-2) + ':' + ('0' + tm.getMinutes()).slice(-2) + ':' + ('0' + tm.getSeconds()).slice(-2);
        d.textContent = hh + ' ' + (r.msg || r.kind || '');
        els.rewardLog.appendChild(d);
      });
    }

    if (els.bridgeInfo) {
      els.bridgeInfo.innerHTML = '';
      var urls = Object.keys(stats.urls);
      if (!urls.length) {
        els.bridgeInfo.appendChild(h('div', 'muted', stats.bridgeReady ? '已连接主世界，未捕获到 WebSocket' : '主世界桥接未就绪'));
      } else {
        urls.forEach(function (u) {
          els.bridgeInfo.appendChild(h('div', null, u.slice(0, 46) + ' ×' + stats.urls[u]));
        });
      }
    }
  }

  /* ------------------------------------------------------------------ 启动 */
  function boot() {
    loadSettings(function () {
      if (IS_TOP) buildPanel();
      if (M.rewards) M.rewards.CONFIG.enabled = !!settings.rewardsEnabled;
      if (M.claims) M.claims.CONFIG.enabled = !!settings.claimsEnabled;
      if (M.popups) {
        M.popups.CONFIG.enabled = !!settings.popupsEnabled;
        M.popups.CONFIG.mode = settings.popupMode === 'all' ? 'all' : 'safe';
        if (Array.isArray(settings.keepNames)) M.popups.CONFIG.keepNames = settings.keepNames.slice(0);
      }
      if (M.rogue) {
        M.rogue.setEnabled(settings.rogueEnabled !== false);
        M.rogue.loadDict();
      }
      if (M.deck && M.deck.loadDict) M.deck.loadDict();
      if (M.peek) {
        M.peek.setEnabled(settings.peekEnabled !== false);
        M.peek.setOverlay(!!settings.peekOverlay);
      }
      pushConfig();
      setTimeout(pushConfig, 1200);
      setTimeout(pushConfig, 3000);

      if (IS_TOP && els.deckToggle) {
        els.deckToggle.checked = settings.deckEnabled !== false;
        if (els.peekToggle) els.peekToggle.checked = settings.peekEnabled !== false;
        if (els.peekOverlayToggle) els.peekOverlayToggle.checked = !!settings.peekOverlay;
        els.rewardToggle.checked = !!settings.rewardsEnabled;
        if (els.claimToggle) els.claimToggle.checked = !!settings.claimsEnabled;
        if (els.redpointToggle) els.redpointToggle.checked = !!settings.redpointsEnabled;
        if (els.skipAskToggle) els.skipAskToggle.checked = !!settings.skipAskEnabled;
        els.popupToggle.checked = !!settings.popupsEnabled;
        els.rogueToggle.checked = settings.rogueEnabled !== false;
        if (els.rogueShopToggle) els.rogueShopToggle.checked = settings.rogueShopEnabled !== false;
        els.modeSel.value = settings.popupMode === 'all' ? 'all' : 'safe';
        render();
      }
      console.log('[SGS] assistant booted', { top: IS_TOP, href: location.href });
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();

/**
 * 主世界注入（MAIN world）
 *
 * 职责：
 *   1. 旁路监听游戏通信（WebSocket / XHR / fetch）—— 只读，不改写、不阻断
 *   2. Laya 显示树操作：扫描 / 文本查找 / 点击 / 关窗
 *   3. 自动化：自动领奖、弹窗治理（默认关闭，面板显式开启才动作）
 *
 * 坐标约定（实测 Laya 2.12.2 / scaleMode=full / design 1220x600）：
 *   stage._canvasTransform 为单位矩阵，canvas 尺寸 == stage 尺寸，
 *   故 node.localToGlobal() 的结果就是 canvas 内像素坐标；
 *   页面坐标 = canvas.getBoundingClientRect() 的 left/top + 上述坐标。
 *
 * 点击实现：在 canvas 上派发 mousemove/mousedown/mouseup/click 原生事件，
 *           由 Laya 的 MouseManager 走完整命中链路（已实测可打开/关闭窗口）。
 */
(function () {
  'use strict';
  if (window.__SGS_BRIDGE__) return;
  window.__SGS_BRIDGE__ = true;

  var MAX = 200000;
  var MAX_NODES = 6000;

  function post(type, payload) {
    try { window.postMessage({ __sgsBridge: true, type: type, payload: payload }, '*'); } catch (e) {}
  }

  /* ============================================================ 网络监听 */
  function toText(d, cb) {
    try {
      if (typeof d === 'string') return cb(d.length > MAX ? d.slice(0, MAX) : d);
      if (d instanceof ArrayBuffer || ArrayBuffer.isView(d)) {
        var n = d.byteLength !== undefined ? d.byteLength : d.length;
        return cb('[binary:' + n + ']');
      }
      if (typeof Blob !== 'undefined' && d instanceof Blob) {
        return d.text().then(
          function (t) { cb(t.length > MAX ? t.slice(0, MAX) : t); },
          function () { cb('[blob-fail]'); }
        );
      }
      return cb(String(d));
    } catch (e) {
      return cb('[encode-error]');
    }
  }

  var NativeWS = window.WebSocket;
  var nativeSend = NativeWS.prototype.send;

  function BridgeWS(url, protocols) {
    var ws = protocols === undefined ? new NativeWS(url) : new NativeWS(url, protocols);
    try {
      ws.addEventListener('open', function () {
        post('ws-open', { url: String(url), t: Date.now() });
      });
      ws.addEventListener('message', function (ev) {
        toText(ev.data, function (t) {
          post('ws-recv', { url: String(url), data: t, t: Date.now() });
        });
      });
      ws.addEventListener('close', function (ev) {
        post('ws-close', { url: String(url), code: ev.code, t: Date.now() });
      });
    } catch (e) {}
    return ws;
  }
  BridgeWS.prototype = NativeWS.prototype;
  BridgeWS.CONNECTING = 0; BridgeWS.OPEN = 1; BridgeWS.CLOSING = 2; BridgeWS.CLOSED = 3;
  try { window.WebSocket = BridgeWS; } catch (e) {}

  try {
    NativeWS.prototype.send = function (d) {
      var self = this;
      toText(d, function (t) {
        post('ws-send', { url: String(self.url || ''), data: t, t: Date.now() });
      });
      return nativeSend.apply(this, arguments);
    };
  } catch (e) {}

  /* ========================================================== Laya 工具层 */
  var L = {
    ok: function () { return !!(window.Laya && Laya.stage); },

    cls: function (n) {
      try { return (n.constructor && n.constructor.name) || '?'; } catch (e) { return '?'; }
    },

    nameOf: function (n) {
      try { return String(n.name || ''); } catch (e) { return ''; }
    },

    chainHas: function (n, cn) {
      var p = Object.getPrototypeOf(n), g = 0;
      while (p && g++ < 12) {
        try { if (p.constructor && p.constructor.name === cn) return true; } catch (e) {}
        p = Object.getPrototypeOf(p);
      }
      return false;
    },

    // 节点自身的文本（Laya 里文本可能挂在 label / text / labelText / _text）
    ownText: function (n) {
      try {
        var keys = ['label', 'text', 'labelText', '_text'];
        for (var i = 0; i < keys.length; i++) {
          var v = n[keys[i]];
          if (typeof v === 'string' && v) return v;
        }
      } catch (e) {}
      return '';
    },

    // 自身无文本时，取「唯一」的直接子文本；多子文本的容器一律不认（避免父容器重复命中）
    labelText: function (n) {
      var own = L.ownText(n);
      if (own) return own;
      var k = 0; try { k = n.numChildren || 0; } catch (e) { return ''; }
      var t = '';
      for (var i = 0; i < k; i++) {
        var x = L.ownText(n.getChildAt(i));
        if (!x) continue;
        if (t) return '';
        t = x;
      }
      return t;
    },

    pos: function (n) {
      try {
        var p = n.localToGlobal(new Laya.Point(0, 0));
        return { x: Math.round(p.x), y: Math.round(p.y) };
      } catch (e) { return { x: 0, y: 0 }; }
    },

    size: function (n) {
      try { return { w: Math.round(n.width || 0), h: Math.round(n.height || 0) }; }
      catch (e) { return { w: 0, h: 0 }; }
    },

    visible: function (n) {
      try {
        var cur = n, g = 0;
        while (cur && g++ < 40) {
          if (cur.visible === false) return false;
          cur = cur.parent;
        }
      } catch (e) {}
      return true;
    },

    // 按钮特征：带 onMouse + 状态机/点击注册（实测 EVi/rjt 均满足），类名兜底
    isButton: function (n) {
      try {
        if (typeof n.onMouse === 'function' &&
            (typeof n.changeState === 'function' || typeof n.addClick === 'function')) return true;
        if (L.chainHas(n, 'rjt')) return true;
        if (/Button|Btn/i.test(L.cls(n))) return true;
        if (n.clickHandler || (n._eventMap && n._eventMap.click)) return true;
      } catch (e) {}
      return false;
    },

    // 窗口特征：基类 tTt 暴露的 Close / Show / removeModalBg
    isWindow: function (n) {
      try {
        return typeof n.Close === 'function' &&
               typeof n.Show === 'function' &&
               typeof n.removeModalBg === 'function';
      } catch (e) { return false; }
    },

    // 唯一标识：从 stage 起的 childAt 索引链（path 会因类名兜底而重复，索引链不会）
    indexPath: function (n) {
      var idx = [], cur = n, g = 0;
      while (cur && cur !== Laya.stage && g++ < 40) {
        var p = cur.parent;
        if (!p) return null;
        idx.unshift(p.getChildIndex(cur));
        cur = p;
      }
      return cur === Laya.stage ? idx : null;
    },

    nodeAt: function (idx) {
      if (!idx || !idx.length) return null;
      var cur = Laya.stage;
      for (var i = 0; i < idx.length; i++) {
        try { cur = cur.getChildAt(idx[i]); } catch (e) { return null; }
        if (!cur) return null;
      }
      return cur;
    },

    // 遍历（带节点数上限，防止异常树拖死主线程）
    walk: function (fn, maxDepth) {
      if (!L.ok()) return 0;
      var md = maxDepth || 28, count = 0;
      (function rec(n, d) {
        if (!n || d > md || count > MAX_NODES) return;
        count++;
        if (fn(n, d) === false) return;
        var k = 0; try { k = n.numChildren || 0; } catch (e) { return; }
        for (var i = 0; i < k; i++) { try { rec(n.getChildAt(i), d + 1); } catch (e) {} }
      })(Laya.stage, 0);
      return count;
    },

    // 弹窗层：stage 的直接子节点中，带名为 modalBg 的遮罩者（不依赖被混淆的类名）
    layers: function () {
      var out = [];
      if (!L.ok()) return out;
      var st = Laya.stage, n = 0;
      try { n = st.numChildren || 0; } catch (e) { return out; }
      for (var i = 0; i < n; i++) {
        var c = st.getChildAt(i);
        var k = 0; try { k = c.numChildren || 0; } catch (e) { k = 0; }
        for (var j = 0; j < k; j++) {
          var g = c.getChildAt(j);
          if (g && L.nameOf(g) === 'modalBg') { out.push(c); break; }
        }
      }
      return out;
    },

    describe: function (n) {
      var p = L.pos(n), s = L.size(n);
      return {
        idx: L.indexPath(n),
        cls: L.cls(n),
        name: L.nameOf(n),
        x: p.x, y: p.y, w: s.w, h: s.h,
        visible: L.visible(n),
        text: L.labelText(n).slice(0, 80)
      };
    }
  };

  /* ============================================================== 动作层 */
  var ACT = {
    // 页面内模拟真实鼠标点击（canvas 坐标 = Laya stage 坐标）
    clickAt: function (x, y) {
      var cvs = document.querySelector('canvas');
      if (!cvs) return { ok: false, why: 'no-canvas' };
      var r = cvs.getBoundingClientRect();
      var cx = r.left + x, cy = r.top + y;
      var mk = function (type, buttons) {
        return new MouseEvent(type, {
          clientX: cx, clientY: cy, screenX: cx, screenY: cy,
          bubbles: true, cancelable: true, view: window,
          button: 0, buttons: buttons
        });
      };
      try {
        cvs.dispatchEvent(mk('mousemove', 0));
        cvs.dispatchEvent(mk('mousedown', 1));
        cvs.dispatchEvent(mk('mouseup', 0));
        cvs.dispatchEvent(mk('click', 0));
      } catch (e) {
        return { ok: false, why: 'throw', err: String(e) };
      }
      return { ok: true, x: x, y: y };
    },

    clickNode: function (ref) {
      var n = null;
      if (ref && ref.idx) n = L.nodeAt(ref.idx);
      if (!n) return { ok: false, why: 'not-found' };
      if (!L.visible(n)) return { ok: false, why: 'hidden' };
      var p = L.pos(n), s = L.size(n);
      if (!s.w || !s.h) return { ok: false, why: 'zero-size' };
      return ACT.clickAt(p.x + Math.round(s.w / 2), p.y + Math.round(s.h / 2));
    },

    closeWindow: function (ref) {
      var n = null;
      if (ref && ref.idx) n = L.nodeAt(ref.idx);
      if (!n) return { ok: false, why: 'not-found' };
      try {
        if (typeof n.Close === 'function') { n.Close(); return { ok: true, how: 'Close' }; }
        if (typeof n.Hide === 'function') { n.Hide(); return { ok: true, how: 'Hide' }; }
      } catch (e) {
        return { ok: false, why: 'throw', err: String(e) };
      }
      return { ok: false, why: 'no-close' };
    },

    // 按文本找节点；words 命中即返回
    findByText: function (words, opts) {
      var o = opts || {};
      var out = [];
      L.walk(function (n) {
        if (out.length >= (o.limit || 40)) return false;
        var t = L.labelText(n);
        if (!t) return;
        var hit = false;
        for (var i = 0; i < words.length; i++) {
          if (o.exact ? t === words[i] : t.indexOf(words[i]) >= 0) { hit = true; break; }
        }
        if (!hit) return;
        if (o.buttonOnly && !L.isButton(n)) return;
        if (o.visibleOnly !== false && !L.visible(n)) return;
        var s = L.size(n);
        if (!s.w || !s.h) return;
        if (o.maxW && s.w > o.maxW) return;
        if (o.maxH && s.h > o.maxH) return;
        var d = L.describe(n);
        d.button = L.isButton(n);
        out.push(d);
      }, o.maxDepth || 28);
      return out;
    },

    // 弹窗层里的所有窗口
    windows: function (detail) {
      var out = [];
      L.layers().forEach(function (layer) {
        var k = 0; try { k = layer.numChildren || 0; } catch (e) { return; }
        for (var i = 0; i < k; i++) {
          var c = layer.getChildAt(i);
          if (!c || L.nameOf(c) === 'modalBg') continue;
          if (!L.isWindow(c)) continue;
          var d = L.describe(c);
          d.layerCls = L.cls(layer);
          if (detail) {
            d.buttons = [];
            (function rec(x, dep) {
              if (!x || dep > 8) return;
              if (L.isButton(x) && L.visible(x)) {
                var b = L.describe(x);
                var s = L.size(x);
                if (s.w && s.h && s.w < 400) { b.direct = (dep === 1); d.buttons.push(b); }
              }
              var n2 = 0; try { n2 = x.numChildren || 0; } catch (e) { return; }
              for (var j = 0; j < n2; j++) { try { rec(x.getChildAt(j), dep + 1); } catch (e) {} }
            })(c, 0);
            d.texts = [];
            (function rec2(x, dep) {
              if (!x || dep > 8 || d.texts.length > 30) return;
              var t = L.ownText(x);
              if (t) d.texts.push(t.slice(0, 40));
              var n2 = 0; try { n2 = x.numChildren || 0; } catch (e) { return; }
              for (var j = 0; j < n2; j++) { try { rec2(x.getChildAt(j), dep + 1); } catch (e) {} }
            })(c, 0);
          }
          out.push(d);
        }
      });
      return out;
    },

    // 从按钮向上找「弹窗级」容器：尺寸必须落在 [minW,minH] ~ [maxW,maxH] 之间，
    // 超出上限说明爬到主界面全屏容器了，直接判定为非弹窗。
    findContainer: function (idx, minW, minH, maxW, maxH) {
      var n = L.nodeAt(idx);
      if (!n) return null;
      var mw = minW || 200, mh = minH || 140;
      var xw = maxW || 1100, xh = maxH || 720;
      var cur = n.parent, g = 0;
      while (cur && cur !== Laya.stage && g++ < 10) {
        var sz = L.size(cur);
        if (sz.w >= mw && sz.h >= mh) {
          if (sz.w > xw || sz.h > xh) return null;
          var texts = [], btnCount = 0;
          (function rec(x, d) {
            if (!x || d > 8 || texts.length > 40) return;
            if (L.isButton(x) && L.visible(x)) btnCount++;
            var t = L.ownText(x);
            if (t) texts.push(t.slice(0, 60));
            var k = 0; try { k = x.numChildren || 0; } catch (e) { return; }
            for (var i = 0; i < k; i++) { try { rec(x.getChildAt(i), d + 1); } catch (e) {} }
          })(cur, 0);
          var d2 = L.describe(cur);
          d2.texts = texts;
          d2.body = texts.join(' ');
          d2.buttons = btnCount;
          return d2;
        }
        cur = cur.parent;
      }
      return null;
    },

    // 可见节点全量（调试用）
    tree: function () {
      var out = [];
      L.walk(function (n) {
        if (out.length > 900) return false;
        var s = L.size(n);
        if (!s.w || !s.h || !L.visible(n)) return;
        var d = L.describe(n);
        d.path = (function () {
          var idx = d.idx || [], p = '/Stage';
          var cur = Laya.stage;
          for (var i = 0; i < idx.length; i++) {
            cur = cur.getChildAt(idx[i]);
            p += '/' + (L.nameOf(cur) || L.cls(cur));
          }
          return p;
        })();
        out.push(d);
      }, 26);
      return out;
    }
  };

  /* ======================================================== 窗口管理器 */
  // 游戏窗口管理器是模块内单例（压缩名 Ms），外部拿不到。
  // 但它继承 Laya.EventDispatcher，而 window.InvokeFun 内部会调用 Ms.I().event(...)，
  // 所以临时 hook EventDispatcher.prototype.event 再触发一次 InvokeFun 即可捕获该单例。
  // 拿到后可 open/close 任意窗口（每日任务特权、任务、福利、邮件…），比坐标点击可靠得多。
  var WIN = {
    mgr: function () {
      if (window.__SGS_MS__) return window.__SGS_MS__;
      if (!L.ok()) return null;
      try {
        var proto = Laya.EventDispatcher.prototype;
        var orig = proto.event, found = null;
        proto.event = function () {
          try {
            if (this && this.constructor && this.constructor.name === 'Ms') found = this;
          } catch (e) {}
          return orig.apply(this, arguments);
        };
        try { window.InvokeFun('__sgs_probe__'); } catch (e) {}
        proto.event = orig;
        if (found) window.__SGS_MS__ = found;
      } catch (e) {}
      return window.__SGS_MS__ || null;
    },
    names: function () {
      var m = WIN.mgr();
      if (!m) return [];
      try { return [].slice.call(m.windowNameList); } catch (e) { return []; }
    },
    isOpen: function (name) { return WIN.names().indexOf(name) >= 0; },
    open: function (name, args) {
      var m = WIN.mgr();
      if (!m) return { ok: false, why: 'no-window-mgr' };
      try {
        if (args === undefined) m.i(name); else m.i(name, args);
        return { ok: true, how: 'win-mgr' };
      } catch (e) { return { ok: false, why: String(e.message) }; }
    },
    close: function (name) {
      var m = WIN.mgr();
      if (!m) return { ok: false, why: 'no-window-mgr' };
      try { m.CloseWindow(name); return { ok: true, how: 'win-mgr' }; } catch (e) { return { ok: false, why: String(e.message) }; }
    }
  };
  window.__SGS_WIN__ = WIN;

  /* ==================================================== 管理器单例捕获 */
  // 游戏各管理器（任务 dJt / 活动 _Jt / 红点 kjt …）都是 webpack 模块内单例，
  // 外部拿不到引用。但它们都继承 Laya.EventDispatcher，只要在运行期 hook 一次
  // event()，任何派发过事件的管理器实例都会被记录，之后就能直接调用其内部接口。
  // 这才是真正「领到奖励」的路径 —— 界面上的领取按钮是图片，文本检索够不到。
  var MGR = {
    cap: [],
    // 座位实例单独留一份：cap 会被大厅里上千个实例塞满（上限 1200），塞满后座位再也进不来
    seats: [],
    hooked: false,
    install: function () {
      if (MGR.hooked || !L.ok()) return false;
      try {
        var proto = Laya.EventDispatcher.prototype;
        var push = function (o) {
          try { if (MGR.cap.length < 1200 && MGR.cap.indexOf(o) < 0) MGR.cap.push(o); } catch (e) {}
          try {
            if (o && typeof o.Index === 'number' && typeof o.HandCardCount === 'number' &&
                Array.isArray(o.HandCards)) {
              if (MGR.seats.indexOf(o) < 0) {
                if (MGR.seats.length > 64) MGR.seats.shift();
                MGR.seats.push(o);
              }
            }
          } catch (e) {}
        };
        var origEvent = proto.event;
        // 协议分发通道：游戏 ServerProxy 收到每帧协议后执行
        //   this.event(s.ClassName, new lF(s.ClassName, s))
        // 这里能直接拿到 (协议名, 明文消息对象)，不依赖 console 日志开关。
        proto.event = function (type, data) {
          push(this);
          var P = PROTO;
          if (P && P.enabled && typeof type === 'string' && type.length > 6 &&
              data && typeof data === 'object') {
            try { if (protoValidName(type)) protoRecord(type, data); } catch (e) {}
          }
          return origEvent.apply(this, arguments);
        };
        // 关键：各管理器在初始化时用 on() 注册监听，hook 住 on() 才能拿到任务(dJt)等单例
        var origOn = proto.on;
        proto.on = function () { push(this); return origOn.apply(this, arguments); };
        MGR.hooked = true;
        try { window.InvokeFun('__sgs_probe__'); } catch (e) {}
        return true;
      } catch (e) { return false; }
    },
    all: function () {
      MGR.install();
      var out = [];
      for (var i = 0; i < MGR.cap.length; i++) {
        try { out.push({ name: MGR.cap[i].constructor.name, obj: MGR.cap[i] }); } catch (e) {}
      }
      return out;
    },
    one: function (name) {
      var a = MGR.all();
      for (var i = 0; i < a.length; i++) if (a[i].name === name) return a[i].obj;
      return null;
    }
  };
  window.__SGS_MGR__ = MGR;

  // 尽早安装 hook：游戏模块在 Laya 就绪后才会初始化各管理器并注册监听，
  // 只有赶在那之前 hook 住 on()/event()，才能捕获到任务(dJt)、活动(_Jt)等单例。
  (function earlyInstall() {
    var t = setInterval(function () {
      if (window.Laya && Laya.EventDispatcher && Laya.EventDispatcher.prototype) {
        MGR.install();
        if (MGR.hooked) clearInterval(t);
      }
    }, 20);
    setTimeout(function () { clearInterval(t); }, 180000);
  })();

  /* ============================================ 协议通道（console.log 劫持） */
  // 依据（来自游戏包 runs/game/sgsGame_inner.bin 实测）：
  //   收帧: console.log("%o", "--------[Received client1 PubGsCMoveCard ID:1234 Size:56 detail:"), s.Print();
  //   发帧: console.log("%o", "--------[  Sent  client1 PubGsCMoveCard]  ID:1234 Size:56 detail:"), t.Print();
  //   Print(){ if (rs.I().IsLog) { let t = {}; swt.DataCopy(this, t, this.printIgnorList); console.log(JSON.stringify(t)); } }
  // 即：游戏自己把「已解析的明文协议对象」打到了 console.log。
  // 所以劫持 console.log 就能拿到牌局数据，无需解密 WebSocket / protobuf。
  // 旧插件（三国杀打小抄）用的就是这个通道：redefine(window.console, '<attr>', { get: () => logic })，logic 取最后一个实参。
  var PROTO = {
    enabled: true,
    total: 0,
    counts: {},          // ClassName -> 次数
    samples: {},         // ClassName -> 一条裁剪样本
    pending: null,       // 描述行先出现、JSON 行紧随，用它对上 ClassName
    lastAt: 0,
    lastClass: '',
    installs: 0,
    listeners: []
  };

  // 描述行：--------[Cached client1][Received] PubGsCMoveCard ID:...
  //         --------[  Sent  client1 PubGsCMoveCard]  ID:...
  var PROTO_DESC_RE = /-{3,}\[([^\]]{0,80})\]\s*([A-Za-z][A-Za-z0-9_]{2,40})?/;
  var PROTO_TAIL_RE = /([A-Z][A-Za-z0-9_]{2,40})\s*$/;
  // 只认「像协议名」的标识符，滤掉日志格式词（Received / Sent / MessageEvent 等）
  var PROTO_HEAD_RE = /^(Client|PubGs|Gds|Ss|Cs|Server|Gs|Pc|Web|Bp|Np)[A-Za-z0-9_]{2,50}$/;
  var PROTO_TAIL_NAME_RE = /(Req|Rep|Ntf|Ack|Res|Push)$/;
  var PROTO_BAD = {
    Received: 1, Sent: 1, Cached: 1, Resume: 1, MessageEvent: 1,
    client1: 1, client2: 1, detail: 1, ID: 1, Size: 1, StartCache: 1, StopCache: 1
  };

  function protoValidName(n) {
    if (!n || PROTO_BAD[n]) return false;
    return PROTO_HEAD_RE.test(n) || PROTO_TAIL_NAME_RE.test(n);
  }

  function protoShape(o, depth) {
    if (o === null || o === undefined) return o;
    var t = typeof o;
    if (t === 'number' || t === 'boolean') return o;
    if (t === 'string') return o.length > 64 ? o.slice(0, 64) + '...' : o;
    if (depth > 2) return Array.isArray(o) ? '[..' + o.length + ']' : '{...}';
    if (Array.isArray(o)) {
      var a = [], i;
      for (i = 0; i < o.length && i < 8; i++) a.push(protoShape(o[i], depth + 1));
      if (o.length > 8) a.push('...+' + (o.length - 8));
      return a;
    }
    var r = {}, n = 0, k;
    for (k in o) {
      if (!Object.prototype.hasOwnProperty.call(o, k)) continue;
      if (n++ > 40) { r['...'] = 'more'; break; }
      r[k] = protoShape(o[k], depth + 1);
    }
    return r;
  }

  function protoRecord(cls, obj) {
    PROTO.total++;
    PROTO.lastAt = Date.now();
    if (cls) {
      PROTO.counts[cls] = (PROTO.counts[cls] || 0) + 1;
      PROTO.lastClass = cls;
      if (!PROTO.samples[cls]) PROTO.samples[cls] = protoShape(obj, 0);
    }
    for (var i = 0; i < PROTO.listeners.length; i++) {
      try { PROTO.listeners[i](cls, obj); } catch (e) {}
    }
  }

  function protoScanArgs(args) {
    var cls = null, obj = null, i, a, m;
    for (i = 0; i < args.length; i++) {
      a = args[i];
      if (typeof a === 'string') {
        if (a.length > 3 && a.indexOf('----[') >= 0) {
          m = PROTO_DESC_RE.exec(a);
          if (m) {
            if (m[2]) cls = m[2];
            else {
              var t = PROTO_TAIL_RE.exec(m[1]);
              if (t) cls = t[1];
            }
            continue;
          }
        }
        if (a.length > 8 && a.charAt(0) === '{') {
          try {
            var o = JSON.parse(a);
            if (o && typeof o === 'object' && !Array.isArray(o)) obj = o;
          } catch (e) {}
        }
      } else if (a && typeof a === 'object' && (a.ClassName || a.ProtoObj)) {
        obj = a;
        if (a.ClassName) cls = a.ClassName;
      }
    }
    if (cls && !obj) { if (protoValidName(cls)) PROTO.pending = cls; return; }
    if (obj) {
      if (!cls) cls = PROTO.pending || obj.ClassName || '';
      PROTO.pending = null;
      if (!protoValidName(cls)) cls = '';
      protoRecord(cls, obj);
    }
  }

  // 游戏可能整体替换 window.console，所以周期性重装
  function protoInstall() {
    var con = window.console;
    if (!con || typeof con.log !== 'function') return false;
    if (con.log.__sgsProto) return true;
    var orig = con.log;
    var hooked = function () {
      if (PROTO.enabled) { try { protoScanArgs(arguments); } catch (e) {} }
      return orig.apply(con, arguments);
    };
    hooked.__sgsProto = true;
    hooked.__orig = orig;
    try {
      Object.defineProperty(con, 'log', { value: hooked, configurable: true, writable: true });
      PROTO.installs++;
      return true;
    } catch (e) {
      try { con.log = hooked; PROTO.installs++; return true; } catch (e2) {}
    }
    return false;
  }
  protoInstall();

  function protoStats(top) {
    var list = [];
    for (var k in PROTO.counts) list.push([k, PROTO.counts[k]]);
    list.sort(function (a, b) { return b[1] - a[1]; });
    return {
      enabled: PROTO.enabled,
      total: PROTO.total,
      installs: PROTO.installs,
      lastClass: PROTO.lastClass,
      lastAt: PROTO.lastAt,
      classes: list.length,
      top: list.slice(0, top || 40)
    };
  }

  /* ============================================ 记牌器状态机（协议驱动） */
  // 数据源：PubGsCMoveCard（牌在区域间移动）。字段来自游戏包实测：
  //   {CardIDs:[66], MoveType:2, FromZone:5, ToZone:3, FromID:6, ToID:255,
  //    SrcSeatID:6, SpellID:0, CardCount:1, DataCount:1}
  // zone 常量（旧协议 pq）：1 摸牌堆 / 2 弃牌堆 / 3 处理区 / 4 场外 / 5 手牌区
  //                        6 装备区 / 7 判定区 / 8 技能区 / 9 洗牌区 / 10 临时区
  // MoveType 常量（旧协议 O$t）：1 发牌 2 使用 3 打出 4 弃置 5 选择 6 展示 7 收回
  //   8 获得 9 入弃牌堆 10 闪电 11 交换 12 重铸 13 拼点 14 判定弃置 15 移动
  //   16 使用后弃置 17 打出后弃置 18 获得 19 仅移动 20 铸凿 21 仅展示 22 替换装备
  // 判定「这张牌被亮明」：进入公开区(2/3/4/6/7/9/13) 且来源不是公开区，
  // 或 MoveType 为展示(6/21)。这样同一次使用(手牌→处理区)只记一次，
  // 之后的「处理区→弃牌堆」不会重复计数；摸牌(牌堆→手牌)与手牌间转移不计。
  var PUB_ZONE = { 2: 1, 3: 1, 4: 1, 6: 1, 7: 1, 9: 1, 13: 1 };
  var MOVE_LABEL = {
    1: '发牌', 2: '使用', 3: '打出', 4: '弃置', 5: '选择', 6: '展示', 7: '收回',
    8: '获得', 9: '入弃牌堆', 10: '闪电', 11: '交换', 12: '重铸', 13: '拼点',
    14: '判定弃置', 15: '移动', 16: '使用', 17: '打出', 18: '获得', 19: '移动',
    20: '铸凿', 21: '展示', 22: '换装', 23: '自若', 24: '结束', 27: '给予'
  };

  var DECK = {
    enabled: true,
    seen: {},        // cardId -> 亮明次数
    lastZone: {},    // cardId -> 最近所在 zone
    recent: [],      // 最近亮明/动作流水
    deck: null,      // 开局牌堆 cardId 列表（若可用）
    total: 0,
    version: 0,
    resetAt: 0,
    reset: function () {
      this.seen = {};
      this.lastZone = {};
      this.recent = [];
      this.total = 0;
      this.version++;
      this.resetAt = Date.now();
    },
    snapshot: function () {
      return {
        seen: this.seen,
        recent: this.recent.slice(-40),
        deck: this.deck,
        total: this.total,
        version: this.version,
        resetAt: this.resetAt
      };
    }
  };

  function deckUnwrap(obj) {
    return (obj && obj.msg) ? obj.msg : obj;
  }

  function deckOnProto(cls, obj) {
    if (!DECK.enabled) return;
    var m = deckUnwrap(obj);
    if (!m || typeof m !== 'object') return;
    var name = m.className || m._className_ || cls || '';

    // 新一局：重置（reset 不清 deck，避免开局包顺序不同把牌堆信息冲掉）
    if (name === 'GsCStartGameRep') { DECK.reset(); return; }
    if (name === 'MsgGamePlayCardNtf') {
      if (Array.isArray(m.CardList) && m.CardList.length) DECK.deck = m.CardList.slice(0);
      return;
    }
    if (name === 'GsCFirstPhaseRole') return;

    if (name !== 'PubGsCMoveCard') return;

    var ids = Array.isArray(m.CardIDs) && m.CardIDs.length
      ? m.CardIDs
      : (m.data && m.data.protoObj && Array.isArray(m.data.protoObj.data) ? m.data.protoObj.data : []);
    if (!ids.length) return;

    var from = m.FromZone, to = m.ToZone, mt = m.MoveType;
    var seat = (m.SrcSeatID !== undefined && m.SrcSeatID !== 255) ? m.SrcSeatID : m.FromID;
    var now = Date.now();

    for (var i = 0; i < ids.length; i++) {
      var id = ids[i];
      if (!id) continue;
      var prev = DECK.lastZone[id];
      var reveal = false;
      if (PUB_ZONE[to]) {
        if (mt === 6 || mt === 21) reveal = true;          // 展示
        else if (!PUB_ZONE[from]) reveal = true;            // 非公开区 → 公开区
      }
      DECK.lastZone[id] = to;
      if (reveal) {
        DECK.seen[id] = (DECK.seen[id] || 0) + 1;
        DECK.total++;
        DECK.recent.push({ id: id, seat: seat, mt: mt, from: from, to: to, t: now });
        if (DECK.recent.length > 200) DECK.recent.shift();
      }
    }
  }
  PROTO.listeners.push(deckOnProto);

  window.__SGS_DECK__ = DECK;
  window.__SGS_DECK_LABEL__ = MOVE_LABEL;

  /* ===================================== 对局状态（我的座位 / 最近询问） */
  // 供 P2「跳过求桃/助战」判定用：只有询问目标不是自己时才跳，
  // 避免把「救自己」的求桃也点掉。
  // 我的座位：GsCUpdateRoleDataNtf.StateID == 58（0x3a，旧插件 setMyID 的判据）
  // 询问：GsCTriggerSpellEnq / SmsgGameAskOperation / GsCCurrentAskNtf
  var GAME = { mySeat: -1, lastAsk: null };
  var ASK_CLASSES = { GsCTriggerSpellEnq: 1, SmsgGameAskOperation: 1, GsCCurrentAskNtf: 1, CmsgGameAskOperationRsp: 1 };

  function gameOnProto(cls, obj) {
    var m = deckUnwrap(obj);
    if (!m || typeof m !== 'object') return;
    var name = m.className || m._className_ || cls || '';
    if (name === 'GsCUpdateRoleDataNtf' && m.StateID === 58 && m.SeatID !== undefined) {
      GAME.mySeat = m.SeatID;
      return;
    }
    if (!ASK_CLASSES[name]) return;
    var target = (m.TargetSeatID !== undefined) ? m.TargetSeatID
               : (m.targetSeatID !== undefined) ? m.targetSeatID
               : (m.TargetSeatId !== undefined) ? m.TargetSeatId : undefined;
    GAME.lastAsk = {
      cls: name,
      spell: (m.SpellID !== undefined) ? m.SpellID : (m.spellID !== undefined ? m.spellID : m.SpellId),
      target: target,
      seat: m.SeatID,
      t: Date.now()
    };
  }
  PROTO.listeners.push(gameOnProto);
  window.__SGS_GAME__ = GAME;

  /* ================================================ 透视：各座位手牌 */
  // 依据（游戏包 sgsGame_inner.bin 静态分析）：
  //   · 座位模型（旧 Gts / 新 ins）持有 handCards / handShowCards / visibleHandCards /
  //     aiHandShowCards，渲染闸门是 seat.CanRenderHandCardFace(card) =
  //     CanViewHandCard || IsVisibleHandCard(card) —— 「客户端知道多少」与「界面画出多少」是两件事。
  //     seat.HandShowCardIDs / VisibleHandCardIDs 就是游戏自己维护的「该座位已知手牌」集合。
  //   · 暗牌牌面是否下发由服务端决定：PubGsCMoveCard 的 CardIDs（新版 card_ids /
  //     *_visible_hand_cards）与角色同步里的 hand_card_list（字段 50）都可能带真实牌 ID。
  //     所以这里既读座位模型，也自己按协议记一份，并用 probe 实测暗牌到底给不给。
  var ZONE_HAND = 5;
  var ZONE_EQUIP = 6;
  var ZONE_JUDGE = 7;

  var PEEK = {
    enabled: true,
    hands: {},        // seat -> { known:{id:张数}, unknown:张数 }
    entries: [],      // 进手牌区的移动流水 [{seat, from, real, t}]，用于事后按 mySeat 重算探针
    moves: 0,         // 涉及手牌区的移动条数
    realIdMoves: 0,   // 其中带真实牌 ID 的条数
    container: null,  // 座位容器节点（有 GetSeatUiByIndex）
    version: 0,
    lastAt: 0,
    reset: function () {
      this.hands = {};
      this.entries = [];
      this.moves = 0;
      this.realIdMoves = 0;
      this.container = null;
      this.version++;
      this.lastAt = 0;
    }
  };

  function peekHand(seat) {
    var h = PEEK.hands[seat];
    if (!h) h = PEEK.hands[seat] = { known: {}, unknown: 0 };
    return h;
  }

  function peekValidSeat(s) {
    return typeof s === 'number' && s >= 0 && s <= 7;
  }

  // 牌离手：已知的按张数扣，剩下的从「未知」里扣
  function peekTakeFrom(seat, ids, n) {
    var h = peekHand(seat), matched = 0, i, id;
    for (i = 0; i < ids.length; i++) {
      id = ids[i];
      if (h.known[id]) {
        h.known[id]--;
        if (!h.known[id]) delete h.known[id];
        matched++;
      }
    }
    var rest = n - matched;
    if (rest > 0) h.unknown = Math.max(0, h.unknown - rest);
  }

  // 牌入手：带 ID 的记牌名，不带 ID 的记未知
  function peekPutInto(seat, ids, n) {
    var h = peekHand(seat), i;
    for (i = 0; i < ids.length; i++) h.known[ids[i]] = (h.known[ids[i]] || 0) + 1;
    h.unknown += Math.max(0, n - ids.length);
  }

  function peekOnProto(cls, obj) {
    if (!PEEK.enabled) return;
    var m = deckUnwrap(obj);
    if (!m || typeof m !== 'object') return;
    var name = m.className || m._className_ || cls || '';
    if (name === 'GsCStartGameRep') { PEEK.reset(); return; }
    if (name !== 'PubGsCMoveCard') return;

    PEEK.lastAt = Date.now();

    var ids = Array.isArray(m.CardIDs) ? m.CardIDs
            : (Array.isArray(m.card_ids) ? m.card_ids : []);
    var real = [];
    for (var i = 0; i < ids.length; i++) {
      var v = ids[i];
      if (typeof v === 'number' && v > 0) real.push(v);
    }

    var fz = m.FromZone, tz = m.ToZone;
    if (fz === undefined && m.from_zone_info) fz = m.from_zone_info.zone_type;
    if (tz === undefined && m.to_zone_info) tz = m.to_zone_info.zone_type;
    var fromId = (m.FromID !== undefined) ? m.FromID : (m.from_zone_info && m.from_zone_info.seat_id);
    var toId = (m.ToID !== undefined) ? m.ToID : (m.to_zone_info && m.to_zone_info.seat_id);
    var n = m.CardCount || m.card_num || ids.length;

    if (fz === ZONE_HAND || tz === ZONE_HAND) {
      PEEK.moves++;
      if (real.length) PEEK.realIdMoves++;
    }
    // 记流水：进手牌区的移动。是否为「暗牌」要等 mySeat 确定后才知道（见 snapshot）
    if (tz === ZONE_HAND && peekValidSeat(toId)) {
      if (PEEK.entries.length > 400) PEEK.entries.shift();
      PEEK.entries.push({ seat: toId, from: fz, real: real.length, t: Date.now() });
    }
    if (fz === ZONE_HAND && peekValidSeat(fromId)) peekTakeFrom(fromId, real, n);
    if (tz === ZONE_HAND && peekValidSeat(toId)) peekPutInto(toId, real, n);
  }
  PROTO.listeners.push(peekOnProto);

  /* ---- 客户端座位模型读取（MGR 捕获到的座位实例） ---- */
  function peekIds(list) {
    var r = [];
    if (!Array.isArray(list)) return r;
    for (var i = 0; i < list.length; i++) {
      var c = list[i];
      if (c == null) continue;
      var id = (typeof c === 'number') ? c : c.CardId;
      if (typeof id === 'number' && id > 0) r.push(id);
    }
    return r;
  }

  function peekTry(fn, dflt) {
    try { var v = fn(); return (v === undefined || v === null) ? dflt : v; } catch (e) { return dflt; }
  }

  // 座位容器（类名 Bqt）：有 GetSeatUiByIndex(i) 就能拿到每个座位的 UI 节点，
  // 再 localToGlobal 就是 canvas 内的像素坐标 —— 用来把牌面贴到座位下面。
  function peekSeatContainer() {
    var c = PEEK.container;
    if (c) {
      try { if (c.GetSeatUiByIndex(0)) return c; } catch (e) {}
    }
    c = null;
    L.walk(function (n) {
      if (c) return false;
      try { if (n && typeof n.GetSeatUiByIndex === 'function') c = n; } catch (e) {}
    }, 26);
    PEEK.container = c;
    return c;
  }

  function peekSeatRect(idx) {
    var c = peekSeatContainer();
    if (!c) return null;
    var ui = null;
    try { ui = c.GetSeatUiByIndex(idx); } catch (e) { return null; }
    if (!ui) return null;
    var p = L.pos(ui), s = L.size(ui);
    if (!s.w || !s.h) return null;
    // 不在对局场景时，座位容器还在、但子节点没布局，坐标恒为 (0,0)。
    // 不排掉的话上一局的坐标会被画到山河图等其它界面上（实测踩过）。
    if (!p.x && !p.y) return null;
    return { x: p.x, y: p.y, w: s.w, h: s.h, vis: L.visible(ui) !== false };
  }

  function peekReadSeat(o, idx, count) {
    return {
      seat: idx,
      count: count,
      self: !!peekTry(function () { return o.IsSelf; }, false),
      dead: !!peekTry(function () { return o.IsDead; }, false),
      canView: !!peekTry(function () { return o.CanViewHandCard; }, false),
      rect: peekSeatRect(idx),
      name: String(peekTry(function () {
        var g = o.General;
        if (g) { var a = g.CardName || g.Name || g.ShowName; if (a) return a; }
        var p = o.PlayerInfo;
        if (p) { var b = p.NickName || p.ShowName || p.nickName; if (b) return b; }
        var c = o.nickName || o.showName;
        return c || '';
      }, '')),
      knownIds: peekIds(peekTry(function () { return o.HandCardIDs; }, [])),
      showIds: peekIds(peekTry(function () { return o.HandShowCardIDs; }, [])),
      visibleIds: peekIds(peekTry(function () { return o.VisibleHandCardIDs; }, [])),
      mingIds: peekIds(peekTry(function () { return o.AiHandShowCards; }, [])),
      equipIds: peekIds(peekTry(function () { return o.EquipCards; }, [])),
      judgeIds: peekIds(peekTry(function () { return o.JudgeCards; }, []))
    };
  }

  // 座位实例都是 Laya.EventDispatcher（会派发 Mv.DRAW / 监听 SHOW_HAND_CARDS），
  // 因此一定落在 MGR.seats 里（MGR.cap 会被大厅塞满，座位必须单独收）。
  // 倒序取「每个座位最新出现的那个实例」，避免拿到上一局的残留。
  function peekSeatModel() {
    var out = [];
    if (!window.Laya) return out;
    var pool = (window.__SGS_MGR__ && window.__SGS_MGR__.seats) || [];
    var seen = {};
    for (var i = pool.length - 1; i >= 0; i--) {
      var o = pool[i];
      if (!o) continue;
      var idx = peekTry(function () { return o.Index; }, -1);
      if (!peekValidSeat(idx) || seen[idx]) continue;
      var hc = peekTry(function () { return o.HandCardCount; }, null);
      if (typeof hc !== 'number') continue;
      if (!Array.isArray(peekTry(function () { return o.HandCards; }, null))) continue;
      seen[idx] = 1;
      out.push(peekReadSeat(o, idx, hc));
    }
    out.sort(function (a, b) { return a.seat - b.seat; });
    return out;
  }

  // 我的座位：座位模型的 IsSelf 最可靠（GAME.mySeat 只在收到 StateID==58 时才置位）
  function peekMySeat(seats) {
    for (var i = 0; i < seats.length; i++) if (seats[i].self) return seats[i].seat;
    return GAME.mySeat;
  }

  PEEK.snapshot = function () {
    var seats = peekSeatModel();
    var mySeat = peekMySeat(seats);

    // 探针：从非手牌区进「别人」手牌、且协议里带真实牌 ID 的张数。
    // 我自己的发牌当然带牌面，所以必须先把 mySeat 认出来再统计。
    var hidden = 0;
    for (var e = 0; e < PEEK.entries.length; e++) {
      var it = PEEK.entries[e];
      if (it.from !== ZONE_HAND && it.seat !== mySeat) hidden += it.real;
    }

    var protoHands = [];
    for (var k in PEEK.hands) {
      if (!Object.prototype.hasOwnProperty.call(PEEK.hands, k)) continue;
      var h = PEEK.hands[k];
      var ids = [];
      for (var id in h.known) {
        for (var c = 0; c < h.known[id]; c++) ids.push(Number(id));
      }
      protoHands.push({
        seat: Number(k),
        knownIds: ids,
        count: ids.length + h.unknown,
        self: Number(k) === mySeat
      });
    }
    return {
      version: PEEK.version,
      at: Date.now(),
      enabled: PEEK.enabled,
      mySeat: mySeat,
      moves: PEEK.moves,
      realIdMoves: PEEK.realIdMoves,
      hiddenIds: hidden,
      canvas: canvasRect(),
      seats: seats,
      protoHands: protoHands
    };
  };

  // 实测口径：服务端到底有没有把「暗牌」的牌面发下来
  PEEK.probe = function () {
    var snap = PEEK.snapshot();
    return {
      at: snap.at,
      mySeat: snap.mySeat,
      seatModelSeats: snap.seats.length,
      seatModelWithFace: snap.seats.filter(function (s) { return s.knownIds.length > 0; }).length,
      seatModelVisible: snap.seats.filter(function (s) { return s.visibleIds.length > 0; }).length,
      protoHandSeats: snap.protoHands.length,
      handMoves: snap.moves,
      movesWithRealId: snap.realIdMoves,
      hiddenCardFaces: snap.hiddenIds,
      serverSendsHiddenFaces: snap.hiddenIds > 0
    };
  };

  window.__SGS_PEEK__ = PEEK;
  window.__SGS_PEEK_PROBE__ = PEEK.probe;

  /* ================================================ 山河图：集市入口常显 */
  // 依据（sgsGame_inner.bin 静态分析）：
  //   集市按钮是山河图地图「左侧视图」（类 hAt extends wSt）的 shopBtn，pos(45,180)，
  //   可见性完全由它自己的 UpdateShopData() 控制：
  //     ShopData && ShopData.isShow ? shopBtn.visible = true : shopBtn.visible = false
  //   服务端只在挑战首领关前那一小段把 isShow 置真，所以平时按钮是藏着的。
  //   点击 shopBtnClick：Ajt.I().ChapterVo 存在时 → Ms.I().i('RogueJiShiWindow') 开窗，
  //   并把本章号写进本地值 ROGUELIKE_SHOP_SHOW（用来去掉「新」红点）。
  // 这里做的：只要地图界面在、且有进行中的章节，就把 shopBtn 重新显示出来
  //（游戏下一次 UpdateShopData 会再藏，所以做成 1.5s 周期任务，跟清红点一个套路）。
  var ROGUE_SHOP = {
    enabled: true,
    intervalMs: 1500,
    last: 0,
    hits: 0,
    chapter: -1,
    lastAt: 0,
    reset: function () { this.hits = 0; this.chapter = -1; this.lastAt = 0; }
  };

  // 左侧视图是场景内的节点，只在山河图地图界面存在；进战斗窗口后找不到
  function findShopView() {
    var hit = null;
    L.walk(function (n) {
      if (hit) return false;
      try { if (n && n.shopBtn && typeof n.shopBtn.on === 'function') hit = n; } catch (e) {}
    }, 26);
    return hit;
  }

  function tickRogueShop() {
    var c = ROGUE_SHOP;
    if (!c.enabled || !L.ok()) return;
    var now = Date.now();
    if (now - c.last < c.intervalMs) return;
    c.last = now;

    var view = findShopView();
    if (!view) return;                        // 不在山河图地图界面

    var mgr = MGR.one('Ajt');
    if (!mgr || !mgr.ChapterVo) return;       // 没有进行中的章节，别乱开

    var btn = view.shopBtn;
    if (btn.visible === true) return;         // 游戏自己已经显示了，不动它

    btn.visible = true;
    c.hits++;
    c.lastAt = now;

    var ch = mgr.CurrentChapterNumber;
    if (ch !== c.chapter) {
      c.chapter = ch;
      AUTO.log('rogue', '第' + ch + '章：集市入口已显示');
      // 补一次「集市出现」特效（游戏在 UpdateShopData 里播的那个）
      try { if (typeof view.getShopEff === 'function') view.getShopEff(1, true); } catch (e) {}
    }
  }

  ROGUE_SHOP.tick = tickRogueShop;
  ROGUE_SHOP.find = findShopView;
  window.__SGS_ROGUE_SHOP__ = ROGUE_SHOP;

  /* ============================================================= 自动化 */
  var DENY_WORDS = ['支付', '充值', '购买', '元', '人民币', '元宝', '钻石', '开通', '续费',
                    '订阅', '绑定', '实名', '身份证', '手机号', '验证码', '删除', '解绑', '注销',
                    '投降', '放弃', '认输', '离开', '解散'];

  // 牌局交互类文本：出现这些说明是操作确认框，不是单纯提示，安全模式下不碰
  var INTERACT_PATTERN = /选择|请选择|出牌|弃牌|使用|发动|技能|目标|结算|装备|判定|摸牌|弃置|弃牌阶段|响应/;

  function hasDeny(text) {
    for (var i = 0; i < DENY_WORDS.length; i++) {
      if (text.indexOf(DENY_WORDS[i]) >= 0) return true;
    }
    return false;
  }

  // 弹窗治理：默认只处理「提示 / 公告 / 广告 / 奖励」类，白名单内的窗口一律不碰
  var AUTO = {
    rewards: {
      enabled: false,
      intervalMs: 2500,
      cooldownMs: 1500,
      claimWords: ['一键领取', '领取奖励', '立即领取', '领取', '收下'],
      last: 0,
      hits: 0
    },
    popups: {
      enabled: false,
      intervalMs: 1600,
      cooldownMs: 900,
      mode: 'safe',           // safe=只关提示类；all=关所有非白名单
      closeWords: ['确定', '关闭', '知道了', '我知道了', '好的', '知道了。', '取消', '下次再说', '残忍拒绝', '不再提示'],
      // 窗口名白名单（永不自动关闭），面板可增删
      keepNames: [
        'MailWindow', 'ShopWindow', 'PayWindow', 'BattleWindow',
        'RogueFightWindow', 'RogueMarketWindow', 'RogueCityWindow',
        'RogueAdventureSelectWindow', 'RogueAwardSelectWindow', 'RogueShopWindow'
      ],
      // 硬保护：名字命中即绝不自动关闭（玩法/交互窗口），不受名单与模式影响
      protectedPattern: /Rogue|Fight|Battle|Market|Trade|Arena|Duel|Mail|Shop|Pay|Chat/i,
      // 显式关闭名单：纯展示/奖励/结算类窗口，名字命中即关（不看提示特征）
      // 依据游戏窗口注册表 + 旧插件 skipQ：结算/战绩/获取道具/开包动画/选皮肤/天书
      skipNames: [
        'GameResultWindow', 'GameZhanJiWindow', 'SevenDayResultWindow',
        'GetPropCommonWindow', 'GetPropSpecialWindow', 'GetPropTreasureWindow', 'GetPropXianDingWindow',
        'RewardWindow', 'NewBieGetAwardsWindow', 'NewbieAutoRewardWindow',
        'DDZRewardWindow', 'DDZJinBiaoRewardWindow',
        'SelectSkinWindow', 'SkinInfoWindow',
        'GeneralOpenResultWindow', 'GeneralXBGOpenResultWindow', 'GeneralWishOpenResultWindow',
        'TianShuWindow'
      ],
      // safe 模式下额外要求：窗口名或正文命中提示特征
      hintPattern: /AdPush|Notice|Tips|Tip|Alert|Msg|Message|Gift|Reward|Sign|Announce|恭喜|提示|公告|奖励|成功|失败|未|请/,
      last: 0,
      hits: 0
    },
    redpoints: {
      // 默认关闭：清红点只是「看不见」，并不等于领到奖励，反而会掩盖真正可领的入口
      enabled: false,
      intervalMs: 2000,
      cleared: 0,
      last: 0
    },
    claims: {
      // 用游戏内部接口直接领奖（不依赖界面上的图片按钮）
      enabled: false,
      intervalMs: 3000,
      cooldownMs: 2000,
      mailAt: 0,
      last: 0,
      hits: 0
    },
    skips: {
      // 跳过求桃 / 助战询问（默认关闭；仅当目标是别人时才跳，保护「救自己」）
      enabled: false,
      intervalMs: 500,
      cooldownMs: 300,
      declineWords: ['取消', '否', '放弃', '不用', '不救'],
      last: 0,
      hits: 0
    },
    log: function (kind, msg, extra) {
      var rec = { t: Date.now(), kind: kind, msg: msg };
      if (extra) rec.extra = extra;
      post('auto-log', rec);
    }
  };

  function tickRewards() {
    var c = AUTO.rewards;
    if (!c.enabled || !L.ok()) return;
    var now = Date.now();
    if (now - c.last < c.cooldownMs) return;
    var btns = ACT.findByText(c.claimWords, { buttonOnly: true, maxW: 400, maxH: 120, limit: 12 });
    for (var i = 0; i < btns.length; i++) {
      var b = btns[i];
      if (!b.text || hasDeny(b.text)) continue;
      var r = ACT.clickNode(b);
      c.last = now;
      if (r.ok) {
        c.hits++;
        AUTO.log('reward', '点击「' + b.text + '」', { x: b.x, y: b.y, w: b.w, h: b.h, cls: b.cls });
      } else {
        AUTO.log('reward-miss', '点击失败 ' + b.text + ' → ' + r.why);
      }
      return;
    }
  }

  /* ---------------------------------------------- 用游戏内部接口领奖 */
  // 界面上的「领取」按钮是图片，文本检索够不到；但游戏自己的管理器暴露了领奖接口：
  //   dJt(任务) : GetSevenDayCanReceiveDays() / CollectTaskCanAward() / W(taskId)
  //   _Jt(活动) : IsJDCanReward() / SendGetJDRewardReq() / SendSevendayprizeReq(day)
  // 每轮只领一项，领到即进入冷却，避免连点与服务端报错。
  // 邮件：hJt 是邮件管理器（由 MGR 捕获）。先 requestMail 拉列表，再
  //   · 标题/正文含「道具过期提醒」「不良游戏行为警告」→ DeleteMail
  //   · hasAttachMent 为真 → ReadMail（附件即奖励）
  // 字段名依据旧插件还原代码（runs/xc-deob.js）：mid / title / hasAttachMent 均为明文。
  var MAIL_JUNK = ['道具过期提醒', '不良游戏行为警告'];
  function tickMail(c) {
    var mail = MGR.one('hJt');
    if (!mail) return false;
    var now = Date.now();
    if (!c.mailAt || now - c.mailAt > 60000) {
      c.mailAt = now;
      try { if (typeof mail.requestMail === 'function') mail.requestMail(); } catch (e) {}
      return false;
    }
    var lists = [], i, m;
    try { if (mail.systemMailList) lists = lists.concat(mail.systemMailList); } catch (e) {}
    try { if (mail.friendMailList) lists = lists.concat(mail.friendMailList); } catch (e) {}
    for (i = 0; i < lists.length; i++) {
      m = lists[i];
      if (!m || !m.mid) continue;
      // 字段实测（游戏包 uIt.Init）：mid / title / content / hasAttachMent / Geted
      // 判定文案只看标题（正文可能引用，避免误删）
      var title = String(m.title || '');
      var junk = false, k;
      for (k = 0; k < MAIL_JUNK.length; k++) {
        if (title.indexOf(MAIL_JUNK[k]) >= 0) { junk = true; break; }
      }
      try {
        if (junk) { mail.DeleteMail(m.mid); return true; }
        // 有附件且尚未领取 → ReadMail（服务端在 read 时发放附件，Geted 随之置真）
        if (m.hasAttachMent && !m.Geted) { mail.ReadMail(m.mid); return true; }
      } catch (e) {}
    }
    return false;
  }

  function tickClaims() {
    var c = AUTO.claims;
    if (!c.enabled || !L.ok()) return;
    var now = Date.now();
    if (now - c.last < c.cooldownMs) return;

    // 0) 邮件（不依赖任务/活动管理器）
    if (tickMail(c)) { c.last = now; c.hits++; return; }

    var task = MGR.one('dJt');
    var act = MGR.one('_Jt');
    if (!task && !act) return;

    // 0) 当前节日/福利任务（任务 id 挂在活动管理器上）
    if (task && act) {
      try {
        if (typeof act.GetSpringFesQuestId === 'function') act.GetSpringFesQuestId();
        var qid = act.currentSpringFesQuestID;
        if (qid) {
          var qvo = task.N(qid);
          if (qvo && qvo.CanAward && !qvo.HasAward) {
            task.W(qid);
            c.last = now; c.hits++;
            AUTO.log('claim', '福利任务领奖 id=' + qid);
            return;
          }
        }
      } catch (e) {}
    }

    // 1) 七日登录奖励
    if (task && act && typeof task.GetSevenDayCanReceiveDays === 'function') {
      try {
        var days = task.GetSevenDayCanReceiveDays() || [];
        if (days.length) {
          act.SendSevendayprizeReq(days[0]);
          c.last = now; c.hits++;
          AUTO.log('claim', '七日登录奖励 day=' + days[0]);
          return;
        }
      } catch (e) {}
    }

    // 2) 军典活跃奖励（旧/新都用红点判断，避免空发请求）
    //    IsJDCanReward(t,i,s) 需要参数，无参调用恒 false —— 改用红点 getter
    if (act) {
      try {
        if (act.HasNewJDRewardRed && typeof act.ReqDrawAllNewJDRwd === 'function') {
          act.ReqDrawAllNewJDRwd();
          c.last = now; c.hits++;
          AUTO.log('claim', '新军典活跃奖励（一键）');
          return;
        }
        if (act.HasJDRewardRed && typeof act.SendGetJDRewardReq === 'function') {
          act.SendGetJDRewardReq();
          c.last = now; c.hits++;
          AUTO.log('claim', '军典活跃奖励');
          return;
        }
      } catch (e) {}
    }

    // 3) 每日任务列表：逐个查状态，领第一个可领的
    if (task) {
      try {
        var daily = task.DailyTasks || [];
        for (var i = 0; i < daily.length; i++) {
          var tid = daily[i] && (daily[i].TaskId || daily[i].Id);
          if (!tid) continue;
          var dvo = task.N(tid);
          if (dvo && dvo.CanAward && !dvo.HasAward) {
            task.W(tid);
            c.last = now; c.hits++;
            AUTO.log('claim', '每日任务领奖 id=' + tid);
            return;
          }
        }
      } catch (e) {}
    }

    // 4) 节日累计签到（按天）：GetAccumlateAwdState == 2 才领
    //    SendNewClientAccumlateSignGetRewardReq(signId, day)
    if (act && typeof act.GetAvailableAccumlateSignData === 'function') {
      try {
        var avail = act.GetAvailableAccumlateSignData() || [];
        for (var ai = 0; ai < avail.length; ai++) {
          var cfg = avail[ai];
          if (!cfg || !cfg.awards) continue;
          for (var aj = 0; aj < cfg.awards.length; aj++) {
            var aw = cfg.awards[aj];
            if (act.GetAccumlateAwdState(cfg.id, aw) === 2) {
              act.SendNewClientAccumlateSignGetRewardReq(cfg.id, aw.day);
              c.last = now; c.hits++;
              AUTO.log('claim', '累计签到 id=' + cfg.id + ' day=' + aw.day);
              return;
            }
          }
        }
      } catch (e) {}
    }

    // 5) 节日固定日签到：仅当红点判定有可领时才发
    //    SendNewClientFestivalSignGetRewardReq(signId, date)
    if (act && typeof act.CheckNewFestivalSignRedDot === 'function') {
      try {
        if (act.CheckNewFestivalSignRedDot()) {
          var elems = (act.NewFestivalSignDataDic && act.NewFestivalSignDataDic.elements) || [];
          for (var ei = 0; ei < elems.length; ei++) {
            var sid = elems[ei].key;
            var sdata = act.GetNewFestivalSignData(sid);
            if (!sdata || !sdata.awards) continue;
            for (var si = 0; si < sdata.awards.length; si++) {
              var aw2 = sdata.awards[si];
              if (act.GetFesSignAwdState(aw2) === 2) {
                act.SendNewClientFestivalSignGetRewardReq(sid, aw2.date);
                c.last = now; c.hits++;
                AUTO.log('claim', '节日签到 id=' + sid + ' date=' + aw2.date);
                return;
              }
            }
          }
        }
      } catch (e) {}
    }

    // 6) 斗地主军典：红点判定，一键领全部
    //    SendDDZTLLAwardReq(id=0, is_bp=false, is_all=true)
    if (act && act.HasDDZTLLRewardRed && typeof act.SendDDZTLLAwardReq === 'function') {
      try {
        act.SendDDZTLLAwardReq(0, false, true);
        c.last = now; c.hits++;
        AUTO.log('claim', '斗地主军典奖励（一键）');
        return;
      } catch (e) {}
    }

    // 7) 月卡 / 周卡 / 祈福卡元宝：lJt 的卡数据 bActive && bReward 才领
    //    SendClientPrivilegeRewardReq(rewardDays, type)
    //    type: 1 月卡 / 2 周卡 / 3 月卡·尊贵（祈福）
    var priv = MGR.one('lJt');
    if (priv && typeof priv.GetCardDataByType === 'function') {
      try {
        var ptypes = [1, 2, 3];
        for (var pi = 0; pi < ptypes.length; pi++) {
          var cd = priv.GetCardDataByType(ptypes[pi]);
          if (cd && cd.bActive && cd.bReward) {
            priv.SendClientPrivilegeRewardReq(cd.rewardDays, cd.type);
            c.last = now; c.hits++;
            AUTO.log('claim', '特权卡奖励 type=' + cd.type + ' day=' + cd.rewardDays);
            return;
          }
        }
      } catch (e) {}
    }

    // 8) 斗地主每日免费豆：fJt.CanGetDdzFreeBean 为真才领
    var ddz = MGR.one('fJt');
    if (ddz && ddz.CanGetDdzFreeBean && typeof ddz.SendClientGetWeekFreeBeanReq === 'function') {
      try {
        ddz.SendClientGetWeekFreeBeanReq();
        c.last = now; c.hits++;
        AUTO.log('claim', '斗地主每日免费豆');
        return;
      } catch (e) {}
    }
  }

  // 跳过求桃 / 助战询问：在询问框里点「取消/否」。
  // 安全前提：只跳「目标不是自己」的询问；助战（无目标座位）单独放行。
  function tickSkips() {
    var c = AUTO.skips;
    if (!c.enabled || !L.ok()) return;
    var now = Date.now();
    if (now - c.last < c.cooldownMs) return;
    var ask = GAME.lastAsk;
    if (!ask || now - ask.t > 8000) return;

    var btns = ACT.findByText(c.declineWords, { buttonOnly: true, maxW: 220, maxH: 90, limit: 8 });
    for (var i = 0; i < btns.length; i++) {
      var b = btns[i];
      if (!b.text || hasDeny(b.text)) continue;
      var box = ACT.findContainer(b.idx, 150, 90);
      var body = box ? (box.body || '') : '';
      var isAssist = /助战/.test(body);
      var isSave = /是否使用/.test(body) && /桃|酒/.test(body);
      if (!isAssist && !isSave) continue;
      // 求桃/求酒：目标是别人（或明确不是自己）才跳
      if (isSave) {
        if (GAME.mySeat < 0) continue;
        if (ask.target === undefined || ask.target === GAME.mySeat) continue;
      }
      var r = ACT.clickNode(b);
      c.last = now;
      if (r.ok) {
        c.hits++;
        AUTO.log('skip', (isAssist ? '跳过助战询问' : '跳过求桃询问') +
          '「' + b.text + '」目标=' + (ask.target === undefined ? '?' : ask.target) + ' 我=' + GAME.mySeat);
      }
      return;
    }
  }

  // 钩窗口管理器的开窗方法：结算/奖励/开包等窗口不一定挂在 modal 层里，
  // 单靠扫描 ACT.windows() 会漏。开窗瞬间按名字命中名单就直接关（同旧插件 skipQ）。
  function hookWinOpen() {
    var m = WIN.mgr();
    if (!m || m.__sgsHooked) return;
    var origI = m.i;
    if (typeof origI !== 'function') return;
    m.i = function (name, args) {
      var r = origI.apply(this, arguments);
      try {
        var c = AUTO.popups;
        if (c.enabled && !(c.protectedPattern && c.protectedPattern.test(name || '')) && c.keepNames.indexOf(name) < 0 && c.skipNames.indexOf(name) >= 0) {
          setTimeout(function () {
            try { m.CloseWindow(name); c.hits++; AUTO.log('popup', '关闭窗口 ' + name + '（开窗钩子）'); } catch (e) {}
          }, 60);
        }
      } catch (e) {}
      return r;
    };
    m.__sgsHooked = true;
  }

  // 窗口是否带「可关闭」特征：
  //   1) 有文字且命中关闭语义（确定/关闭/知道了…）
  //   2) 无文字的小按钮（<=50x50）且是窗口的直接子节点 —— 广告/公告窗右上角的 X 图标
  function hasCloser(w) {
    var btns = w.buttons || [];
    for (var i = 0; i < btns.length; i++) {
      var b = btns[i];
      var t = b.text || '';
      if (hasDeny(t)) continue;
      if (t) {
        for (var j = 0; j < AUTO.popups.closeWords.length; j++) {
          if (t.indexOf(AUTO.popups.closeWords[j]) >= 0) return true;
        }
      } else if (b.direct && b.w > 0 && b.w <= 50 && b.h > 0 && b.h <= 50) {
        return true;
      }
    }
    return false;
  }

  function tickPopups() {
    var c = AUTO.popups;
    if (!c.enabled || !L.ok()) return;
    var now = Date.now();
    if (now - c.last < c.cooldownMs) return;

    // 路径 1：标准窗口层（带 modalBg 遮罩）——直接调窗口自己的 Close()
    var wins = ACT.windows(true);
    for (var i = 0; i < wins.length; i++) {
      var w = wins[i];
      if (c.keepNames.indexOf(w.name) >= 0) continue;
      if (c.protectedPattern && c.protectedPattern.test(w.name || '')) continue;
      // 显式名单：结算/奖励/开包/选皮肤/天书等，直接关（不受正文危险词与提示特征限制）
      if (c.skipNames && c.skipNames.indexOf(w.name) >= 0) {
        var rs = ACT.closeWindow(w);
        c.last = now;
        if (rs.ok) { c.hits++; AUTO.log('popup', '关闭窗口 ' + w.name + '（名单）', { how: rs.how }); }
        return;
      }
      var wbody = (w.name || '') + ' ' + ((w.texts || []).join(' '));
      if (hasDeny(wbody)) continue;
      if (!hasCloser(w)) continue;
      // safe 模式放行条件：窗口名/正文命中提示特征，或名字明确是广告/公告的图片弹窗
      var textLen = (w.texts || []).join('').length;
      var isImagePop = textLen < 40 && w.w >= 300 && w.h >= 200 && /Ad|Notice|Announce|Banner|公告|广告/i.test(w.name || '');
      if (c.mode === 'safe' && !c.hintPattern.test(wbody) && !isImagePop) continue;
      var r1 = ACT.closeWindow(w);
      c.last = now;
      if (r1.ok) {
        c.hits++;
        AUTO.log('popup', '关闭窗口 ' + (w.name || w.cls), { how: r1.how, idx: w.idx });
      }
      return;
    }

    // 路径 2：兜底——没有独立窗口对象、只挂着一个「确定」按钮的提示框
    var btns = ACT.findByText(c.closeWords, { buttonOnly: true, maxW: 320, maxH: 110, limit: 20 });
    for (var j = 0; j < btns.length; j++) {
      var b = btns[j];
      if (!b.text || hasDeny(b.text)) continue;
      var box = ACT.findContainer(b.idx, 200, 140);
      if (!box) continue;
      var body = box.body || '';
      if (!body || body.length > 300) continue;
      if (hasDeny(body)) continue;
      if ((box.buttons || 0) > 2) continue;
      if (c.mode === 'safe' && INTERACT_PATTERN.test(body)) continue;
      var r2 = ACT.clickNode(b);
      c.last = now;
      if (r2.ok) {
        c.hits++;
        AUTO.log('popup', '点击「' + b.text + '」关闭提示', { at: [b.x, b.y], body: body.slice(0, 60) });
      }
      return;
    }
  }

  /* ========================================================== 牌局探测 */
  // 牌面在 Laya 里是图片节点（skin 指向牌面资源），文本节点承载「XX使用 / 正在思考 X」等动作信息。
  // 这里只做原始采集，牌名归一化交给扩展侧（能拿字典）。
  var CARD_RE = /(sha|shan|tao|jiu|juedou|wuxie|guohe|shunshou|nanman|wanjian|taoyuan|wugu|jiedao|wuzhong|lebu|shandian|bingliang|tieSuo|huogong|yiyi|huosha|leisha|bingsha|zhuque|qinggang|cixiong|bagua|renwang|tengjia|guoding|zhuge|fangtian|qilin|jueying|dilu|zhuahuang|guding)/i;

  function scanBoard() {
    if (!L.ok()) return null;
    var out = { cards: [], texts: [], seats: [] };
    L.walk(function (n) {
      var s = L.size(n), p = L.pos(n);
      if (!s.w || !s.h) return;
      var t = L.ownText(n);
      if (t && t.length <= 30) {
        if (/使用|打出|正在思考|弃置|阵亡|装备|判定|目标|响应/.test(t)) {
          if (out.texts.length < 60) out.texts.push({ t: t, x: p.x, y: p.y });
        }
        if (/^[\u4e00-\u9fa5A-Za-z]{1,6}$/.test(t) && s.w >= 30 && s.w <= 120 && s.h >= 14 && s.h <= 40) {
          if (out.seats.length < 40) out.seats.push({ t: t, x: p.x, y: p.y, w: s.w, h: s.h });
        }
      }
      if (s.w >= 40 && s.w <= 180 && s.h >= 60 && s.h <= 260 && out.cards.length < 120) {
        var skin = "";
        try { var sk = n.skin; skin = typeof sk === "string" ? sk : (sk && sk.url ? String(sk.url) : ""); } catch (e) {}
        if (skin && CARD_RE.test(skin)) {
          out.cards.push({ cls: L.cls(n), skin: skin.slice(-90), x: p.x, y: p.y, w: s.w, h: s.h });
        }
      }
    }, 24);
    return out;
  }

  /* ============================================================ 红点清除 */
  // 左侧入口容器：类名 rOt，内部 leftBtns 数组持有全部入口按钮对象。
  // 这些按钮是「游离」节点（不在显示树里），红点状态挂在 redPointIsShow 上。
  function findROt() {
    var found = null;
    L.walk(function (n) {
      if (found) return false;
      try { if (n.leftBtns && n.leftBtns.length) { found = n; return false; } } catch (e) {}
    }, 8);
    return found;
  }

  function tickRedpoints() {
    var c = AUTO.redpoints;
    if (!c.enabled || !L.ok()) return;
    var now = Date.now();
    if (now - c.last < c.intervalMs) return;
    c.last = now;

    var n = 0;
    var rOt = findROt();
    if (rOt) {
      rOt.leftBtns.forEach(function (b) {
        try { if (b.redPointIsShow) { b.redPointIsShow = false; n++; } } catch (e) {}
      });
    }
    // 通用兜底：窗口/面板里带红点接口的按钮
    L.walk(function (x) {
      try {
        if (typeof x.RedPointIsShow === 'function' && x.RedPointIsShow() &&
            typeof x.RemoveRedPoint === 'function') { x.RemoveRedPoint(); n++; }
      } catch (e) {}
    }, 20);

    if (n) {
      c.cleared += n;
      AUTO.log('redpoint', '清除红点 ' + n + ' 个');
    }
  }

  /* ====================================================== 山河图地图扫描 */
  // 战斗节点的过关奖励（拿不到就返回 null，前端会退回只显示名字/单位）
  function rogueFightReward(cfg, evId) {
    if (!cfg || typeof cfg.GetFightInfo !== 'function') return null;
    var f = null;
    try { f = cfg.GetFightInfo(Number(evId) || evId); } catch (e) { return null; }
    if (!f) return null;
    var out = { name: '', rewards: [], tongqian: 0, elite: false };
    try { out.name = f.Name || ''; } catch (e) {}
    try { out.tongqian = f.TongQianCnt || 0; } catch (e) {}
    try { out.elite = !!f.IsElite; } catch (e) {}
    var g = [];
    try { g = f.RewardGroup || []; } catch (e) {}
    for (var i = 0; i < g.length; i++) {
      var v = null;
      try { v = cfg.GetRewardGroupInfoById(g[i]); } catch (e) {}
      if (v && (v.rewarddesc || v.rewarditem)) out.rewards.push(v.rewarddesc || v.rewarditem);
    }
    if (!out.name && !out.rewards.length && !out.tongqian) return null;
    return out;
  }

  function canvasRect() {    try {
      var c = document.querySelector('canvas');
      if (c && c.getBoundingClientRect) {
        var r = c.getBoundingClientRect();
        return { left: r.left, top: r.top, width: r.width, height: r.height };
      }
    } catch (e) {}
    return null;
  }

  function scanRogueMap() {
    if (!L.ok()) return null;
    var items = [];
    // 战斗节点的「过关奖励」只存在于运行时配置里（静态 JSON 只有名字和单位）：
    //   yVi.GetFightInfo(fightId) → { Name, RewardGroup:[奖励组id], TongQianCnt, IsElite }
    //   yVi.GetRewardGroupInfoById(组id) → { rewarddesc:'技能多选一', rewarditem:'可以从三个…', type }
    // yVi 是山河图配置管理器，由 __SGS_MGR__ 捕获；MGR.one 会重建实例表，所以提到循环外只取一次。
    var cfg = null;
    try { cfg = MGR.one('yVi'); } catch (e) {}
    var rewardCache = {};
    L.walk(function (n) {
      if (items.length > 60) return false;
      var nm = L.nameOf(n);
      if (nm !== 'RogueCityItemUI' && L.cls(n) !== 'G5t') return;
      var data = n.data;
      if (!data || (data.event === undefined && data.location === undefined)) return;
      var p = L.pos(n), s = L.size(n);
      // 图标真实绘制边界（节点自身 + 子节点）；x,y 只是左上角，标签要贴图标中心
      var b = null;
      try { if (typeof n.getBounds === 'function') b = n.getBounds(); } catch (e) {}
      var evId = data.event !== undefined ? String(data.event) : '';
      if (!(evId in rewardCache)) rewardCache[evId] = rogueFightReward(cfg, evId);
      items.push({
        event: evId,
        location: data.location,
        trigger: !!data.IsTrigger,
        x: p.x, y: p.y, w: s.w, h: s.h,
        bw: b && b.width ? b.width : s.w,
        bh: b && b.height ? b.height : s.h,
        reward: rewardCache[evId],
        visible: L.visible(n)
      });
    }, 20);
    return {
      items: items,
      stage: { w: Math.round(Laya.stage.width || 0), h: Math.round(Laya.stage.height || 0) },
      canvas: canvasRect()
    };
  }

  function scanEventDialog() {
    if (!L.ok()) return null;
    // 窗口是否遮挡地图：以显示树为准（windowNameList 会残留已关闭的窗口名，
    // 不可靠）。找到任一可见、尺寸够大的 *Window 节点即视为遮挡。
    // content.js 据此收起地图标签，避免浮在战斗/奇遇/集市等窗口上。
    var found = null;
    L.walk(function (n) {
      if (found && found.vo) return false;
      var nm = L.nameOf(n) || '';
      if (nm.slice(-6) !== 'Window') return;
      if (L.visible(n) === false) return;
      var s = L.size(n);
      if (s.w < 200 || s.h < 150) return;
      if (!found) found = { cover: true, name: nm, vo: null };
      if (nm === 'RogueAdventureSelectWindow') {
        try { found.vo = JSON.parse(JSON.stringify(n.vo)); } catch (e) {}
      }
    }, 26);
    return found;
  }

  /* ================================================== 对外接口与指令通道 */
  window.__SGS_ACT__ = ACT;
  window.__SGS_L__ = L;
  AUTO.tickPopups = tickPopups;
  AUTO.tickRedpoints = tickRedpoints;
  AUTO.findROt = findROt;
  AUTO.tickRewards = tickRewards;
  AUTO.tickClaims = tickClaims;
  AUTO.tickMail = tickMail;
  AUTO.tickSkips = tickSkips;
  AUTO.tickRogueShop = tickRogueShop;
  AUTO.GAME = GAME;
  // 一键领取：忽略冷却连续跑几轮，把当前所有可领项清空（面板按钮 / 指令）
  AUTO.claimSweep = function (rounds) {
    var n = rounds || 12, i = 0, got = 0;
    var step = function () {
      if (i++ >= n) { AUTO.log('claim', '一键领取完成（本轮 ' + got + ' 项）'); return; }
      var before = AUTO.claims.hits;
      AUTO.claims.last = 0;
      try { tickClaims(); } catch (e) {}
      if (AUTO.claims.hits > before) got++;
      setTimeout(step, 350);
    };
    step();
  };
  window.__SGS_AUTO__ = AUTO;
  window.__SGS_TREE__ = function () { return ACT.tree(); };
  window.__SGS_BUTTONS__ = function () { return ACT.windows(true).concat(ACT.findByText([''], { buttonOnly: true, limit: 80 })); };
  window.__SGS_CLICK__ = function (sel) { return ACT.clickNode(sel || {}); };
  window.__SGS_PROTO__ = PROTO;
  window.__SGS_PROTO_STATS__ = protoStats;

  var scanning = false;
  function scanAll() {
    if (scanning || !L.ok()) return;
    scanning = true;
    try {
      post('laya-scan', {
        t: Date.now(),
        rogueMap: scanRogueMap(),
        eventDialog: scanEventDialog(),
        board: scanBoard(),
        proto: protoStats(20),
        deck: DECK.snapshot(),
        peek: PEEK.snapshot(),
        windows: ACT.windows(false)
      });
    } catch (e) {
      post('laya-scan-error', { message: String(e) });
    }
    scanning = false;
  }
  window.__SGS_SCAN_NOW__ = scanAll;

  var scanTimer = setInterval(scanAll, 1200);
  var autoTimer = setInterval(function () {
    try { tickClaims(); } catch (e) {}
    try { tickRewards(); } catch (e) {}
    try { tickPopups(); } catch (e) {}
    try { tickRedpoints(); } catch (e) {}
    try { tickSkips(); } catch (e) {}
    try { tickRogueShop(); } catch (e) {}
    try { hookWinOpen(); } catch (e) {}
    try { protoInstall(); } catch (e) {}
  }, 800);

  window.addEventListener('beforeunload', function () {
    clearInterval(scanTimer);
    clearInterval(autoTimer);
  });

  window.addEventListener('message', function (e) {
    if (e.source !== window || !e.data || !e.data.__sgsCmd) return;
    var cmd = e.data.cmd, out;
    try {
      if (cmd === 'set-config') {
        var cfg = e.data.config || {};
        if (cfg.rewardsEnabled !== undefined) AUTO.rewards.enabled = !!cfg.rewardsEnabled;
        if (cfg.popupsEnabled !== undefined) AUTO.popups.enabled = !!cfg.popupsEnabled;
        if (cfg.popupMode) AUTO.popups.mode = cfg.popupMode;
        if (Array.isArray(cfg.keepNames) && cfg.keepNames.length) AUTO.popups.keepNames = cfg.keepNames.slice(0, 50);
        if (cfg.redpointsEnabled !== undefined) AUTO.redpoints.enabled = !!cfg.redpointsEnabled;
        if (cfg.claimsEnabled !== undefined) AUTO.claims.enabled = !!cfg.claimsEnabled;
        if (cfg.protoEnabled !== undefined) PROTO.enabled = !!cfg.protoEnabled;
        if (cfg.deckEnabled !== undefined) DECK.enabled = !!cfg.deckEnabled;
        if (cfg.peekEnabled !== undefined) PEEK.enabled = !!cfg.peekEnabled;
        if (cfg.rogueShopEnabled !== undefined) ROGUE_SHOP.enabled = !!cfg.rogueShopEnabled;
        if (cfg.skipAskEnabled !== undefined) AUTO.skips.enabled = !!cfg.skipAskEnabled;
        post('config-applied', {
          rewards: AUTO.rewards.enabled,
          popups: AUTO.popups.enabled,
          mode: AUTO.popups.mode,
          keep: AUTO.popups.keepNames.length
        });
      } else if (cmd === 'dump-windows') {
        post('windows-dump', { t: Date.now(), windows: ACT.windows(true) });
      } else if (cmd === 'dump-tree') {
        post('tree-dump', { t: Date.now(), tree: ACT.tree() });
      } else if (cmd === 'find-text') {
        out = ACT.findByText(e.data.words || [], e.data.opts || {});
        post('find-result', { t: Date.now(), words: e.data.words, result: out });
      } else if (cmd === 'click') {
        post('click-result', { t: Date.now(), result: ACT.clickNode(e.data.ref || {}) });
      } else if (cmd === 'click-at') {
        post('click-result', { t: Date.now(), result: ACT.clickAt(e.data.x, e.data.y) });
      } else if (cmd === 'close-window') {
        post('close-result', { t: Date.now(), result: ACT.closeWindow(e.data.ref || {}) });
      } else if (cmd === 'proto-stats') {
        post('proto-stats', { t: Date.now(), stats: protoStats(60), samples: PROTO.samples });
      } else if (cmd === 'reset-deck') {
        DECK.reset();
        post('deck-reset', { t: Date.now() });
      } else if (cmd === 'peek-probe') {
        post('peek-probe', { t: Date.now(), probe: PEEK.probe(), snapshot: PEEK.snapshot() });
      } else if (cmd === 'reset-peek') {
        PEEK.reset();
        post('peek-reset', { t: Date.now() });
      } else if (cmd === 'auto-now') {
        tickRewards();
        tickPopups();
        post('auto-now-done', { t: Date.now() });
      } else if (cmd === 'claim-all') {
        AUTO.claimSweep(e.data.rounds || 12);
        post('claim-all-started', { t: Date.now() });
      }
    } catch (err) {
      post('cmd-error', { cmd: cmd, message: String(err) });
    }
  });

  post('bridge-ready', {
    href: location.href,
    inIframe: window.top !== window.self,
    hasLaya: !!window.Laya
  });
})();
