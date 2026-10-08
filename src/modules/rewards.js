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
