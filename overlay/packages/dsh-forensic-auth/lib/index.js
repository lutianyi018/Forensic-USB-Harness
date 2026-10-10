/**
 * @deepseek-ai/dsh-forensic-auth
 *
 * 操作员登录：服务端校验「姓名 + 身份证号 + 密码/PIN」，通过后在浏览器种下签名会话 cookie；
 * 并用 index 注入（tapIndex）在主界面加载前做门禁——未登录一律重定向到登录页。
 *
 * 落点：
 *  - 具名路由：GET/POST /forensic/login、GET /forensic/logout
 *  - index 注入：一段内置脚本，检测 cookie，无则 location.replace 到登录页
 *
 * 说明：凭据校验在服务端完成（安全）；`/` 的门禁是前端重定向（体验层）。
 *       网络侧的访问控制由 dsh 自带的 browser-trust token 栅栏承担。
 */
import { Service } from "@deepseek-ai/cordis";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { randomBytes } from "node:crypto";
import z from "@deepseek-ai/schemastery";
import { signSession, verifyOperator, verifySession } from "./verify.js";
import { SPLASH_CSS, SPLASH_JS } from "./assets.js";

const COOKIE_NAME = "forensic-op";
// 供前端门禁（splash.js）判断「是否已登录」的轻量标记 cookie。
// 会话本身是 HttpOnly（JS 读不到，防 XSS 窃取），因此必须另设一个**非 HttpOnly**
// 的标记给前端看——否则前端永远以为未登录，登录成功后会被无限重定向回登录页。
const UI_COOKIE_NAME = "forensic-ui";
const DEFAULT_TTL_MS = 12 * 60 * 60 * 1000; // 12 小时

/** 读取请求体（表单）。 */
function readBody(req, limit = 1 << 16) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > limit) {
        req.destroy();
        reject(new Error("request body too large"));
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

/** 解析 cookie 值。 */
function getCookie(req, name) {
  const header = req.headers.cookie;
  if (!header) return undefined;
  for (const part of header.split(";")) {
    const eq = part.indexOf("=");
    if (eq === -1) continue;
    if (part.slice(0, eq).trim() === name) return decodeURIComponent(part.slice(eq + 1).trim());
  }
  return undefined;
}

/** HTML 转义。 */
function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

/** 登录页（含品牌与轻量动画）。 */
function loginPage({ product, deviceId, error } = {}) {
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(product || "ForensicDSH")} · 操作员登录</title>
<style>
  :root{--bg:#0b1020;--card:#141b31;--fg:#e8ecf7;--mut:#9aa6c4;--acc:#4d8dff;--err:#ff6b6b}
  *{box-sizing:border-box}
  body{margin:0;height:100vh;display:grid;place-items:center;background:radial-gradient(1200px 600px at 50% -10%,#1a2450,transparent),var(--bg);color:var(--fg);font:15px/1.5 "Segoe UI",system-ui,sans-serif}
  .card{width:360px;padding:28px 26px;background:var(--card);border:1px solid #26304d;border-radius:16px;box-shadow:0 24px 60px rgba(0,0,0,.45);animation:rise .5s ease both}
  @keyframes rise{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:none}}
  .logo{width:52px;height:52px;margin:0 auto 12px;border-radius:14px;background:linear-gradient(135deg,#4d8dff,#7a5cff);animation:pulse 2.4s ease-in-out infinite}
  @keyframes pulse{0%,100%{transform:scale(1);opacity:1}50%{transform:scale(1.06);opacity:.85}}
  h1{font-size:18px;text-align:center;margin:6px 0 2px}
  .sub{text-align:center;color:var(--mut);font-size:12px;margin-bottom:18px}
  label{display:block;font-size:12px;color:var(--mut);margin:10px 0 4px}
  input{width:100%;padding:10px 12px;border-radius:10px;border:1px solid #2c3556;background:#0e1426;color:var(--fg);outline:none}
  input:focus{border-color:var(--acc)}
  button{width:100%;margin-top:18px;padding:11px;border:0;border-radius:10px;background:var(--acc);color:#fff;font-weight:600;cursor:pointer}
  button:hover{filter:brightness(1.08)}
  .err{color:var(--err);font-size:12px;text-align:center;margin-top:12px;min-height:16px}
</style></head>
<body>
  <form class="card" method="post" action="/forensic/login" autocomplete="off">
    <div class="logo"></div>
    <h1>${escapeHtml(product || "ForensicDSH")}</h1>
    <div class="sub">操作员登录${deviceId ? " · " + escapeHtml(deviceId) : ""}</div>
    <label>姓名</label><input name="name" required autofocus>
    <label>身份证号</label><input name="idCard" required>
    <label>密码 / PIN</label><input name="password" type="password" required>
    <button type="submit">登录</button>
    <div class="err">${error ? escapeHtml(error) : ""}</div>
  </form>
</body></html>`;
}

/**
 * 操作员登录服务，挂载在 `ctx.forensicAuth`。
 */
class ForensicAuth extends Service {
  static Config = z.object({
    enabled: z.boolean(),
    operatorsPath: z.string(),
    product: z.string(),
    sessionTtlMs: z.number(),
  });

  constructor(ctx, config = {}) {
    super(ctx, "forensicAuth");
    this.enabled = config.enabled !== false;
    this.operatorsPath = config.operatorsPath || "";
    this.product = config.product || "ForensicDSH";
    this.sessionTtlMs = config.sessionTtlMs || DEFAULT_TTL_MS;
    this.doc = undefined;
    this.secret = undefined;

    ctx.inject(["forensic"], (c) => {
      const root = c.forensic?.paths?.().root;
      this.root = root;
      if (!this.operatorsPath && root) this.operatorsPath = join(root, "config", "operators.json");
      this.load();
    });

    ctx.inject(["webServer"], (c) => {
      c.webServer.register({ kind: "exact", path: "/forensic/login", handler: (req, res) => this.handleLogin(req, res) });
      c.webServer.register({ kind: "exact", path: "/forensic/logout", handler: (req, res) => this.handleLogout(req, res) });
      c.webServer.register({
        kind: "exact",
        path: "/forensic/splash.css",
        handler: (req, res) => {
          res.writeHead(200, { "content-type": "text/css; charset=utf-8", "cache-control": "no-store" });
          res.end(SPLASH_CSS);
        },
      });
      c.webServer.register({
        kind: "exact",
        path: "/forensic/splash.js",
        handler: (req, res) => {
          res.writeHead(200, { "content-type": "application/javascript; charset=utf-8", "cache-control": "no-store" });
          res.end(SPLASH_JS);
        },
      });
      // index 注入：品牌标题 + 启动动画样式/脚本。登录门禁逻辑在 splash.js 内，
      // 于主界面加载前执行（无会话 cookie 即重定向到 /forensic/login）。
      c.webServer.tapIndex((html) =>
        html.replace(
          /<\/head>/i,
          '<title>ForensicDSH</title><link rel="stylesheet" href="/forensic/splash.css"><script src="/forensic/splash.js"></script></head>',
        ),
      );
    });
  }

  /** 载入名单与会话密钥。名单缺失时禁用门禁（避免把人锁在外面）。 */
  load() {
    this.secret = this.loadSecret();
    if (!this.operatorsPath || !existsSync(this.operatorsPath)) {
      this.enabled = false;
      return;
    }
    try {
      this.doc = JSON.parse(readFileSync(this.operatorsPath, "utf8"));
      if (!Array.isArray(this.doc?.operators) || this.doc.operators.length === 0) this.enabled = false;
    } catch {
      this.enabled = false;
    }
  }

  loadSecret() {
    const file = this.root ? join(this.root, "config", "forensic-auth.secret") : undefined;
    if (!file) return randomBytes(32).toString("hex");
    try {
      if (existsSync(file)) return readFileSync(file, "utf8").trim();
      mkdirSync(dirname(file), { recursive: true });
      const secret = randomBytes(32).toString("hex");
      writeFileSync(file, secret, { encoding: "utf8" });
      return secret;
    } catch {
      return randomBytes(32).toString("hex");
    }
  }

  /** 校验一份凭据，成功返回操作员信息。 */
  verify(creds) {
    if (!this.enabled) return { operator_id: "OP-00000", name: creds?.name || "本机操作员", role: "investigator" };
    return verifyOperator(this.doc, creds);
  }

  /** 读取当前会话的操作员（来自请求 cookie）。 */
  currentOperator(req) {
    const token = req ? getCookie(req, COOKIE_NAME) : undefined;
    if (!token || !this.secret) return undefined;
    return verifySession(this.secret, token);
  }

  async handleLogin(req, res) {
    if (req.method === "GET") {
      res.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" });
      res.end(loginPage({ product: this.product, deviceId: this.deviceId() }));
      return;
    }
    if (req.method !== "POST") {
      res.writeHead(405).end();
      return;
    }
    let fields;
    try {
      const body = await readBody(req);
      fields = Object.fromEntries(new URLSearchParams(body));
    } catch {
      res.writeHead(400).end();
      return;
    }
    const operator = this.verify({ name: fields.name, idCard: fields.idCard, password: fields.password });
    if (!operator) {
      res.writeHead(401, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" });
      res.end(loginPage({ product: this.product, deviceId: this.deviceId(), error: "姓名、身份证号或密码不正确" }));
      return;
    }
    const token = signSession(this.secret, { ...operator, exp: Date.now() + this.sessionTtlMs });
    const maxAge = Math.floor(this.sessionTtlMs / 1000);
    res.writeHead(303, {
      // 两个 cookie：真正的会话 HttpOnly（JS 看不到）；另设非 HttpOnly 的标记给前端门禁用。
      "set-cookie": [
        `${COOKIE_NAME}=${encodeURIComponent(token)}; HttpOnly; Path=/; SameSite=Lax; Max-Age=${maxAge}`,
        `${UI_COOKIE_NAME}=1; Path=/; SameSite=Lax; Max-Age=${maxAge}`,
      ],
      location: "/",
    });
    res.end();
  }

  handleLogout(req, res) {
    res.writeHead(303, {
      "set-cookie": [
        `${COOKIE_NAME}=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0`,
        `${UI_COOKIE_NAME}=; Path=/; SameSite=Lax; Max-Age=0`,
      ],
      location: "/forensic/login",
    });
    res.end();
  }

  deviceId() {
    try {
      return this.ctx.get("forensic")?.device?.()?.device_id;
    } catch {
      return undefined;
    }
  }
}

export { ForensicAuth, loginPage, COOKIE_NAME, UI_COOKIE_NAME };
export default ForensicAuth;
