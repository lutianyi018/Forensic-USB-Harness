/**
 * 启动动画（splash）资源：CSS 与 JS 以字符串形式内联，由登录插件注册为
 * `/forensic/splash.css` 与 `/forensic/splash.js`，再经 index 注入标签。
 * 拆成静态资源可避免在 tapIndex 的替换串里做大量转义。
 */

/** 启动动画样式。 */
export const SPLASH_CSS = `#forensic-splash{position:fixed;inset:0;z-index:99999;display:grid;place-items:center;gap:14px;background:radial-gradient(1200px 600px at 50% -10%,#1a2450,transparent),#0b1020;color:#e8ecf7;font:15px/1.5 "Segoe UI",system-ui,sans-serif;transition:opacity .5s ease}
#forensic-splash.fs-hide{opacity:0;pointer-events:none}
#forensic-splash .fs-logo{width:64px;height:64px;border-radius:18px;background:linear-gradient(135deg,#4d8dff,#7a5cff);animation:fs-pulse 1.6s ease-in-out infinite}
#forensic-splash .fs-name{font-size:20px;font-weight:600;letter-spacing:.04em}
#forensic-splash .fs-tip{color:#9aa6c4;font-size:13px}
#forensic-splash .fs-bar{width:180px;height:4px;border-radius:3px;background:rgba(255,255,255,.12);overflow:hidden}
#forensic-splash .fs-bar i{display:block;height:100%;width:40%;background:#4d8dff;border-radius:3px;animation:fs-slide 1.2s ease-in-out infinite}
@keyframes fs-pulse{0%,100%{transform:scale(1);opacity:1}50%{transform:scale(1.06);opacity:.85}}
@keyframes fs-slide{0%{transform:translateX(-120%)}100%{transform:translateX(320%)}}`;

/** 启动动画脚本：先做登录门禁，再显示 splash，主界面挂载后淡出。 */
export const SPLASH_JS = `(function(){try{if(!/(^|;\\s*)forensic-ui=/.test(document.cookie)){location.replace('/forensic/login');return;}}catch(e){}
function show(){if(document.getElementById('forensic-splash'))return;
var el=document.createElement('div');el.id='forensic-splash';
el.innerHTML='<div class="fs-logo"></div><div class="fs-name">ForensicDSH</div><div class="fs-bar"><i></i></div><div class="fs-tip">正在启动取证工作站…</div>';
document.body.appendChild(el);var t0=Date.now();
function done(){var e2=document.getElementById('forensic-splash');if(!e2)return;e2.classList.add('fs-hide');setTimeout(function(){e2.remove();},520);}
var obs=new MutationObserver(function(){var r=document.getElementById('root')||document.body;if(r&&r.children&&r.children.length>0&&Date.now()-t0>350){obs.disconnect();done();}});
obs.observe(document.body,{childList:true,subtree:true});setTimeout(function(){obs.disconnect();done();},15000);}
if(document.readyState==='loading'){document.addEventListener('DOMContentLoaded',show);}else{show();}})();`;
