/**
 * 后台服务（MV3 service worker）
 *
 * 目前只做两件事：
 *   1. 安装/启动自检，便于确认扩展是否真的被浏览器加载
 *   2. 汇总各 frame 上报的状态（游戏可能把逻辑放进 iframe）
 */
chrome.runtime.onInstalled.addListener(function (d) {
  console.log('[SGS] installed', d && d.reason);
});

chrome.runtime.onStartup.addListener(function () {
  console.log('[SGS] browser startup');
});

var lastReport = null;
chrome.runtime.onMessage.addListener(function (msg, sender, reply) {
  if (msg && msg.__sgs === 'status') {
    lastReport = { t: Date.now(), frame: sender && sender.url, data: msg.data };
    reply({ ok: true });
  }
  return true;
});

console.log('[SGS] service worker alive');
