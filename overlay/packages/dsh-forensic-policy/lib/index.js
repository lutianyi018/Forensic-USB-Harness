/**
 * @deepseek-ai/dsh-forensic-policy
 *
 * 固证区只读守卫。注册一个**单调**工具守卫（ctx.tools.guard）：
 *  - 读类工具（read / read_image / glob / grep ...）一律放行；
 *  - 写类工具（write / edit ...）的参数路径落在固证区 → 拒绝；
 *  - shell 类工具（pwsh / bash / run_code）的命令文本触及固证区 → 拒绝。
 *
 * 「单调」意味着任一守卫给出的拒绝，后续监听器无法翻回允许——这正是硬约束所需。
 * 该守卫是**策略层**；内核级的落盘约束由 NTFS ACL 与 dsh 沙箱共同承担。
 */
import { Service } from "@deepseek-ai/cordis";
import { resolve, sep } from "node:path";
import z from "@deepseek-ai/schemastery";

/** 默认视为「写入类」的工具名。 */
const DEFAULT_MUTATING_TOOLS = [
  "write",
  "edit",
  "apply_patch",
  "create_file",
  "mkdir",
  "move",
  "rename",
  "copy",
  "remove",
  "delete",
];

/** 默认视为「shell 类」的工具名。 */
const DEFAULT_SHELL_TOOLS = ["bash", "pwsh", "run_code"];

/** 默认受保护的凭据文件名（后缀匹配）。 */
const DEFAULT_SENSITIVE_FILES = ["device.key", ".credentials.yaml"];

/**
 * 判断 `target` 是否落在 `root` 之内（含自身）。
 * @param {string} root - 根目录（绝对路径）
 * @param {string} target - 待判定路径
 * @returns {boolean}
 */
export function isUnder(root, target) {
  if (!root || !target) return false;
  const base = root.endsWith(sep) ? root.slice(0, -1) : root;
  const full = resolve(target);
  return full === base || full.startsWith(base + sep);
}

/**
 * 判断一段命令文本是否触及受保护目录（按绝对路径或目录名匹配）。
 * @param {string} command - shell 命令文本
 * @param {string} root - 受保护根目录
 * @returns {boolean}
 */
export function commandTouches(command, root) {
  if (!command || !root) return false;
  const text = command.replace(/\\/g, "/").toLowerCase();
  const abs = root.replace(/\\/g, "/").toLowerCase();
  if (text.includes(abs)) return true;
  const leaf = abs.split("/").filter(Boolean).pop();
  return leaf !== undefined && leaf.length >= 2 && text.includes(leaf);
}

/**
 * 纯函数形式的守卫判定，便于单元测试。
 * @returns {string|undefined} 返回拒绝理由则拒绝，返回 undefined 则放行。
 */
export function evaluate(exec, policy) {
  const name = exec?.name;
  const args = exec?.arguments ?? {};
  const candidate = args.file_path ?? args.path;

  // 凭据文件：读或写一律拒绝（不依赖证据根是否已知）。
  if (typeof candidate === "string" && policy.sensitiveNames?.length) {
    const low = candidate.toLowerCase();
    if (policy.sensitiveNames.some((n) => low.endsWith(n.toLowerCase()))) {
      return `SENSITIVE_PATH_DENIED: 拒绝访问受保护的凭据文件 ${candidate}`;
    }
  }

  const root = policy.evidenceRoot;
  if (!root) return undefined;

  if (policy.mutatingTools.has(name)) {
    if (typeof candidate === "string" && isUnder(root, candidate)) {
      return `EVIDENCE_WRITE_DENIED: 固证区为只读，禁止通过工具 "${name}" 修改 ${candidate}`;
    }
  }

  if (policy.denyShellTouch && policy.shellTools.has(name)) {
    const command = typeof args.command === "string" ? args.command : "";
    if (commandTouches(command, root)) {
      return `EVIDENCE_WRITE_DENIED: 命令触及只读固证区，已拒绝`;
    }
  }

  return undefined;
}

/**
 * 取证策略服务，挂载在 `ctx.forensicPolicy`。
 */
class ForensicPolicy extends Service {
  static Config = z.object({
    evidenceRoot: z.string(),
    mutatingTools: z.array(z.string()),
    shellTools: z.array(z.string()),
    sensitiveFiles: z.array(z.string()),
    denyShellTouch: z.boolean(),
  });

  constructor(ctx, config = {}) {
    super(ctx, "forensicPolicy");
    this.evidenceRoot = config.evidenceRoot ? resolve(config.evidenceRoot) : undefined;
    this.mutatingTools = new Set(
      config.mutatingTools && config.mutatingTools.length ? config.mutatingTools : DEFAULT_MUTATING_TOOLS,
    );
    this.shellTools = new Set(
      config.shellTools && config.shellTools.length ? config.shellTools : DEFAULT_SHELL_TOOLS,
    );
    this.denyShellTouch = config.denyShellTouch !== false;
    this.sensitiveNames =
      config.sensitiveFiles && config.sensitiveFiles.length ? config.sensitiveFiles : DEFAULT_SENSITIVE_FILES;

    ctx.inject(["tools", "forensic"], (c) => {
      // 证据根优先取取证核心服务的布局，其次取本包配置。
      const fromCore = c.forensic?.paths?.().evidence;
      if (fromCore) this.evidenceRoot = resolve(fromCore);
      c.tools.guard((exec) => evaluate(exec, this));
    });
  }
}

export { ForensicPolicy, DEFAULT_MUTATING_TOOLS, DEFAULT_SHELL_TOOLS };
export default ForensicPolicy;
