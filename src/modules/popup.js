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
