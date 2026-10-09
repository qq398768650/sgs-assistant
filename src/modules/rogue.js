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
      'color:#ffe9b0', 'background:rgba(20,14,10,.5)',
      'border:1px solid rgba(200,164,92,.5)', 'border-radius:4px',
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
