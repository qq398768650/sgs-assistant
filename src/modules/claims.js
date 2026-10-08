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
