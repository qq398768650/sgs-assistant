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

  // 四字及以上牌名只显示前两字（乐不思蜀→乐不），省浮层宽度
  function shortName(id) {
    var nm = nameOf(id);
    return nm.length >= 4 ? nm.slice(0, 2) : nm;
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

  function chip(id, cls, short) {
    var el = document.createElement('span');
    el.className = 'chip' + (cls ? ' ' + cls : '');
    el.textContent = short ? shortName(id) : nameOf(id);
    el.title = nameOf(id);
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
    head.textContent = '场上 ' + seats.length + ' 人 · 已知手牌 ' + known + ' 张 / 未知 ' + unknown +
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
      left.textContent = s.no + '号位' + (s.name ? ' ' + s.name : '') + (s.self ? '（你）' : '') +
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
        ids.forEach(function (id) { cn.appendChild(chip(id, s.mingIds && s.mingIds[id] ? 'ming' : '', true)); });
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
      // 紧贴座位号下面：优先量座位号小图，其次按头像底边推，最后才退回座位 UI 底边
      var anchorX, anchorY;
      if (s.seatNo) {
        anchorX = s.seatNo.x + s.seatNo.w / 2;
        anchorY = s.seatNo.y + s.seatNo.h + 2;
      } else if (s.avatar) {
        // 座位号小图贴在头像正下方（AVATAR_MAX_HEIGHT + 5），估一个号位带高度
        anchorX = s.avatar.x + s.avatar.w / 2;
        anchorY = s.avatar.y + s.avatar.h + 26;
      } else {
        anchorX = s.rect.x + s.rect.w / 2;
        anchorY = s.rect.y + s.rect.h + 3;
      }
      box.style.left = (cvs.left + anchorX) + 'px';
      box.style.top = (cvs.top + anchorY) + 'px';

      var head = document.createElement('div');
      head.textContent = '手牌 ' + s.count + (s.unknown ? ' · 未知 ' + s.unknown : '');
      if (s.unknown) head.style.color = '#d8b871';
      box.appendChild(head);

      var ids = Object.keys(s.known || {}).map(Number).sort(function (a, b) { return a - b; });
      if (ids.length) {
        var line = document.createElement('div');
        var MAX = 6;                                  // 牌数过多就折叠：只列前 6 张，其余并成 +N
        ids.slice(0, MAX).forEach(function (id) {
          var sp = document.createElement('span');
          sp.textContent = shortName(id);
          sp.title = nameOf(id);
          sp.style.cssText = 'display:inline-block;margin:0 1px;padding:0 3px;border-radius:2px;' +
            'background:#3a2f1e;border:1px solid #6b5a3a' +
            (s.mingIds && s.mingIds[id] ? ';background:#2f4a2a;border-color:#4a7a3a;color:#bfe0a0' : '');
          line.appendChild(sp);
        });
        if (ids.length > MAX) {
          var more = document.createElement('span');
          more.textContent = '+' + (ids.length - MAX);
          more.style.cssText = 'display:inline-block;margin:0 1px;padding:0 3px;border-radius:2px;' +
            'background:#241d16;border:1px dashed #6b5a3a;color:#d8b871';
          line.appendChild(more);
        }
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
      parts.push(s.seat, s.fixedViewId, s.count, s.name, (s.knownIds || []).length, (s.showIds || []).length,
        (s.visibleIds || []).length, (s.mingIds || []).length, (s.equipIds || []).length,
        (s.judgeIds || []).length,
      s.rect ? (s.rect.x + ',' + s.rect.y + ',' + s.rect.w + ',' + s.rect.h + ',' + (s.rect.vis ? 1 : 0)) : '-',
      s.seatNo ? (s.seatNo.x + ',' + s.seatNo.y + ',' + s.seatNo.w + ',' + s.seatNo.h) : '-',
      s.avatar ? (s.avatar.x + ',' + s.avatar.y + ',' + s.avatar.w + ',' + s.avatar.h) : '-');
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
          // 游戏界面显示的号位：FixedViewId（1 起）优先，取不到退回 Index+1
          no: (s.fixedViewId > 0 ? s.fixedViewId : (s.seat + 1)),
          name: s.name || '',
          count: s.count || 0,
          self: !!s.self,
          dead: !!s.dead,
          known: known,
          mingIds: mingIds,
          unknown: unknown,
          equip: s.equipIds || [],
          judge: s.judgeIds || [],
          rect: s.rect || null,
          seatNo: s.seatNo || null,
          avatar: s.avatar || null
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
          seat: p.seat, no: p.seat + 1, name: '', count: p.count, self: !!p.self, dead: false,
          known: known, mingIds: Object.create(null),
          unknown: Math.max(0, p.count - countOf(known)),
          equip: [], judge: [], seatNo: null, avatar: null
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
