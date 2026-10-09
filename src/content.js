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
    [['peek', '透视/记牌'], ['reward', '奖励'], ['setting', '设置']].forEach(function (t, i) {
      var b = h('button', i === 0 ? 'on' : '', t[1]);
      b.dataset.tab = t[0];
      tabs.appendChild(b);
    });
    panel.appendChild(tabs);

    var body = h('div', 'body');

    /* —— 透视 / 记牌页（合并：各座位手牌 + 已亮明牌汇总 + 出牌流水） */
    var secPeek = h('div', 'sec on');
    secPeek.dataset.sec = 'peek';
    els.statLine = h('div', 'row');
    els.statLine.innerHTML = '<span class="muted">连接</span><span id="sgs-conn">—</span>';
    secPeek.appendChild(els.statLine);
    els.peekBox = h('div', null, '');
    secPeek.appendChild(els.peekBox);
    els.protoLine = h('div', 'sub', '');
    secPeek.appendChild(els.protoLine);
    els.protoList = h('div', 'log');
    secPeek.appendChild(els.protoList);
    els.rankGrid = h('div', 'grid');
    els.rankGrid.style.display = 'none';
    secPeek.appendChild(els.rankGrid);
    els.recent = h('div', 'log');
    secPeek.appendChild(els.recent);
    els.peekProbe = h('button', 'btn', '实测一次（看服务端给不给暗牌牌面）');
    secPeek.appendChild(els.peekProbe);
    els.resetBtn = h('button', 'btn', '重置本局透视 / 记牌');
    secPeek.appendChild(els.resetBtn);
    body.appendChild(secPeek);

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

    sw('透视 / 记牌（各座位手牌 + 已亮明牌）', 'deckToggle');
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

    els.deckToggle.onchange = function () {
      settings.deckEnabled = this.checked;
      settings.peekEnabled = this.checked;
      saveSettings(); pushConfig();
      if (M.peek) M.peek.setEnabled(this.checked);
      scheduleRender();
    };
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
    els.resetBtn.onclick = function () {
      if (M.deck) M.deck.reset();
      send('reset-deck');
      send('reset-peek');
      scheduleRender();
    };
    els.peekProbe.onclick = function () { send('peek-probe'); scheduleRender(); };
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
        els.deckToggle.checked = settings.deckEnabled !== false && settings.peekEnabled !== false;
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
