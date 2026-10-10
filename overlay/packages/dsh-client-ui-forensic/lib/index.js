/**
 * @deepseek-ai/dsh-client-ui-forensic — 取证侧边栏面板（宿主半侧）。
 *
 * 浏览器半侧（lib/client.js）渲染面板；宿主半侧只负责提供一个数据接口
 * `GET /forensic/info`：设备身份、三区路径、已注册工具与技能。
 *
 * 注意：这里的“工具”判定必须与工具总线一致——**可执行文件真实存在**才算已就绪；
 * 只有清单（manifest.json）而缺二进制时，列到 pendingTools（待投放）。
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { isAbsolute, join, resolve, sep } from "node:path";

/** 解析可执行文件路径（与工具总线同规则：必须落在工具根之内）。 */
function resolveExe(toolsRoot, manifest, dir) {
  const rel = manifest?.executable?.windows;
  if (!rel) return undefined;
  const base = resolve(toolsRoot);
  const full = isAbsolute(rel) ? resolve(rel) : resolve(dir, rel);
  if (full !== base && !full.startsWith(base + sep)) return undefined;
  try {
    return statSync(full).isFile() ? full : undefined;
  } catch {
    return undefined;
  }
}

/** 递归收集工具清单（含是否就绪）。 */
function scanTools(root, toolsRoot, depth = 0) {
  const out = [];
  if (depth > 4) return out;
  let entries;
  try {
    entries = readdirSync(root, { withFileTypes: true });
  } catch {
    return out;
  }
  if (entries.some((e) => e.isFile() && e.name === "manifest.json")) {
    try {
      const m = JSON.parse(readFileSync(join(root, "manifest.json"), "utf8"));
      if (m && m.id) out.push({ id: m.id, name: m.name || m.id, ready: !!resolveExe(toolsRoot, m, root) });
    } catch {
      /* 忽略坏清单 */
    }
  }
  for (const entry of entries) if (entry.isDirectory()) out.push(...scanTools(join(root, entry.name), toolsRoot, depth + 1));
  return out;
}

/** 收集技能目录名（<domain>/<name>/SKILL.md）。 */
function scanSkills(root, depth = 0) {
  const out = [];
  if (depth > 3) return out;
  let entries;
  try {
    entries = readdirSync(root, { withFileTypes: true });
  } catch {
    return out;
  }
  if (entries.some((e) => e.isFile() && e.name === "SKILL.md")) out.push(root.split(/[\\/]/).pop());
  for (const entry of entries) if (entry.isDirectory()) out.push(...scanSkills(join(root, entry.name), depth + 1));
  return out;
}

/** 宿主半侧：注册数据接口。 */
export function apply(ctx) {
  ctx.inject(["webServer", "forensic"], (c) => {
    c.webServer.register({
      kind: "exact",
      path: "/forensic/info",
      handler: (req, res) => {
        const workspace = process.cwd();
        const toolsRoot = join(workspace, "forensic", "tools");
        const all = scanTools(toolsRoot, toolsRoot);
        const zones = c.forensic?.paths?.() ?? null;
        const device = c.forensic?.device?.() ?? null;
        // 检测签名密钥是否已存在（用于 UI 上的“签名就绪”徽标）。
        let hasKey = false;
        if (zones?.device) {
          try { hasKey = statSync(join(zones.device, "device.key")).isFile(); } catch { /* noop */ }
        }
        const payload = {
          product: "ForensicDSH",
          // 返回给前端时把后端 snake_case 字段折叠为 camelCase，
          // 保持 UI 代码一致；device 对象本身也保留原字段以防旧消费者。
          device: device
            ? {
                id: device.device_id,
                deviceId: device.device_id,
                issuedAt: device.created_at,
                createdAt: device.created_at,
                capabilities: device.capabilities,
                product: device.product,
                version: device.version,
                hasKey,
                // 原字段（便于外部脚本直接消费）
                device_id: device.device_id,
                created_at: device.created_at,
              }
            : null,
          zones: zones
            ? {
                root: zones.root,
                workspace: zones.workspace,
                evidence: zones.evidence,       // 固证区
                cases: zones.cases,             // 案件区（原字段，外部脚本使用）
                casework: zones.cases,          // 案件区（同义 camelCase，UI 直接读）
                device: zones.device,
              }
            : null,
          tools: all.filter((t) => t.ready).map((t) => ({ id: t.id, name: t.name })),
          pendingTools: all.filter((t) => !t.ready).map((t) => t.name || t.id),
          skills: scanSkills(join(workspace, "forensic", "skills")),
        };
        const body = JSON.stringify(payload);
        res.writeHead(200, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
        res.end(body);
      },
    });
  });
}

export default { apply };
