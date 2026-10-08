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
