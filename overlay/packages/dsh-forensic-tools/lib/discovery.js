/**
 * 证据工具总线的纯逻辑：清单发现、校验、argv 组装。
 * 与 Cordis 无关，可独立测试。
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { isAbsolute, join, resolve, sep } from "node:path";

/** 允许的参数类型。 */
const ARG_TYPES = new Set(["string", "number", "boolean"]);

/** 把工具 id 规范为模型可见的工具名。 */
export function toolNameFor(id) {
  return `forensic_${String(id).toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "")}`;
}

/**
 * 校验一份工具清单。
 * @returns {{ok:true, manifest:object}|{ok:false, errors:string[]}}
 */
export function validateManifest(raw) {
  const errors = [];
  if (!raw || typeof raw !== "object") return { ok: false, errors: ["manifest 不是对象"] };
  if (!raw.id || typeof raw.id !== "string") errors.push("缺少 id");
  if (!raw.name || typeof raw.name !== "string") errors.push("缺少 name");
  if (!raw.executable || typeof raw.executable !== "object") errors.push("缺少 executable");
  else if (!raw.executable.windows || typeof raw.executable.windows !== "string") errors.push("缺少 executable.windows");
  if (raw.args !== undefined) {
    if (!Array.isArray(raw.args)) errors.push("args 必须是数组");
    else
      for (const [i, arg] of raw.args.entries()) {
        if (!arg || typeof arg !== "object") { errors.push(`args[${i}] 不是对象`); continue; }
        if (!arg.name || typeof arg.name !== "string") errors.push(`args[${i}].name 缺失`);
        if (!ARG_TYPES.has(arg.type)) errors.push(`args[${i}].type 非法`);
        if (arg.flag !== undefined && typeof arg.flag !== "string") errors.push(`args[${i}].flag 必须是字符串`);
        if (arg.style !== undefined && arg.style !== "space" && arg.style !== "equals") errors.push(`args[${i}].style 只能是 space 或 equals`);
      }
  }
  return errors.length === 0 ? { ok: true, manifest: raw } : { ok: false, errors };
}

/**
 * 递归扫描工具根目录下的 manifest.json。
 * @param {string} toolsRoot - 工具根目录
 * @param {number} maxDepth - 最大递归深度
 * @returns {Array<{manifest:object, dir:string}>}
 */
export function discoverManifests(toolsRoot, maxDepth = 4) {
  const found = [];
  if (!toolsRoot || !existsSync(toolsRoot)) return found;
  const walk = (dir, depth) => {
    if (depth > maxDepth) return;
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    const manifest = entries.find((e) => e.isFile() && e.name === "manifest.json");
    if (manifest) {
      try {
        const parsed = JSON.parse(readFileSync(join(dir, "manifest.json"), "utf8"));
        const result = validateManifest(parsed);
        if (result.ok) found.push({ manifest: result.manifest, dir });
      } catch {
        /* 忽略坏清单 */
      }
    }
    for (const entry of entries) if (entry.isDirectory()) walk(join(dir, entry.name), depth + 1);
  };
  walk(toolsRoot, 0);
  return found;
}

/**
 * 解析并校验可执行文件路径，确保其落在工具根目录之内（防目录穿越）。
 * @returns {string|undefined} 绝对路径，或 undefined
 */
export function resolveExecutable(toolsRoot, manifest, toolDir) {
  const rel = manifest.executable?.windows;
  if (!rel) return undefined;
  const base = resolve(toolsRoot);
  const full = isAbsolute(rel) ? resolve(rel) : resolve(toolDir, rel);
  if (full !== base && !full.startsWith(base + sep)) return undefined;
  try {
    return statSync(full).isFile() ? full : undefined;
  } catch {
    return undefined;
  }
}

/**
 * 按清单声明顺序，把模型给出的参数值组装成 argv。
 * 只接受清单声明的参数名，未声明的忽略。支持三种形态：
 *   - 位置参数（默认）：只输出值，如 ["image.dd"]
 *   - 带值选项：`flag` + `style:"space"`（默认）→ ["--csv", "out"]；`style:"equals"` → ["--csv=out"]
 *   - 开关（boolean）：值为 true 时输出 `flag`（缺省用参数名），如 ["-accepteula"]
 * @returns {string[]}
 */
export function buildArgv(manifest, values) {
  const argv = [];
  for (const arg of manifest.args ?? []) {
    const value = values?.[arg.name];
    if (arg.type === "boolean") {
      if (value === true) argv.push(arg.flag || arg.name);
      continue;
    }
    if (value === undefined || value === null || value === "") {
      if (arg.required) throw new Error(`缺少必需参数：${arg.name}`);
      continue;
    }
    if (arg.flag) {
      if (arg.style === "equals") argv.push(`${arg.flag}=${value}`);
      else argv.push(arg.flag, String(value));
    } else {
      argv.push(String(value));
    }
  }
  return argv;
}

/**
 * 由清单的 args 声明生成 defineTool 的 parameters DSL。
 */
export function parametersFor(manifest) {
  const parameters = {};
  for (const arg of manifest.args ?? []) {
    parameters[arg.name] = {
      type: arg.type === "number" ? "number" : "string",
      ...arg.required ? { required: true } : {},
      description: arg.description || arg.name,
    };
  }
  return parameters;
}
