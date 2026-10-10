/**
 * @deepseek-ai/dsh-forensic-core
 *
 * 取证层核心服务：提供 ctx.forensic。
 *  - 解析盘上三区路径（工作区 / 固证区 / 案件区）与设备身份目录；
 *  - 提供 forensic 编号语法（CASE/EVD/ART/SS/TRES）的分配；
 *  - 负责在需要时创建三区目录。
 *
 * 设计原则：纯逻辑 + 最少依赖，可被其它取证插件与 UI 复用。
 */
import { Service } from "@deepseek-ai/cordis";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { randomBytes } from "node:crypto";
import z from "@deepseek-ai/schemastery";

/** 编号家族的宽度与前缀。 */
const ID_SPEC = {
  case: { prefix: "CASE", width: 6, year: true },
  evidence: { prefix: "EVD", width: 5, year: false },
  artifact: { prefix: "ART", width: 5, year: false },
  screenshot: { prefix: "SS", width: 6, year: false },
  toolResult: { prefix: "TRES", width: 5, year: false },
};

/** 格式化一个取证编号。 */
function formatForensicId(kind, value, year) {
  const spec = ID_SPEC[kind];
  if (!spec) throw new RangeError(`unknown forensic id kind: ${String(kind)}`);
  if (!Number.isInteger(value) || value < 1) {
    throw new RangeError(`forensic id value must be a positive integer, received ${String(value)}`);
  }
  const digits = String(value).padStart(spec.width, "0");
  if (spec.year) {
    if (!Number.isInteger(year)) throw new RangeError(`forensic id ${kind} requires a year`);
    return `${spec.prefix}-${year}-${digits}`;
  }
  return `${spec.prefix}-${digits}`;
}

/** 从已用编号中分配下一个编号。 */
function nextForensicId(kind, existing, year) {
  const spec = ID_SPEC[kind];
  let max = 0;
  const pattern = new RegExp(`^${spec.prefix}-(\\d{4}-)?(\\d+)$`);
  for (const id of existing) {
    const m = pattern.exec(String(id));
    if (!m) continue;
    if (spec.year && m[1] !== `${year}-`) continue;
    const value = Number(m[2]);
    if (Number.isSafeInteger(value) && value > max) max = value;
  }
  return formatForensicId(kind, max + 1, year);
}

/**
 * 尽力确保目录存在（幂等、容忍只读锁定）。
 *
 * 固证区 / device 会被 NTFS「拒绝写入」ACL 锁定。此时目录其实**已经存在**，
 * 但本进程对它的 mkdir / stat 可能返回 EINVAL / EACCES / EPERM（锁定语义下
 * 连枚举父目录都会失败）。取证层的意图就是「目录存在、内容只读」，因此遇到
 * 这类错误时只要目录已存在就视为就绪，**绝不因为锁着而让整棵插件树加载失败**。
 *
 * @param {string} dir - 目标目录
 * @returns {boolean} 是否可用（true=存在/已创建）
 */
function ensureDirTolerant(dir) {
  try {
    mkdirSync(dir, { recursive: true });
    return true;
  } catch (error) {
    // 目录已存在（锁定）——先直接确认
    if (existsSync(dir)) return true;
    // existsSync 在锁定下同样会失败；改用父目录枚举兜底
    try {
      if (readdirSync(dirname(dir)).includes(basename(dir))) return true;
    } catch {
      /* 父目录也不可枚举：继续按错误码判断 */
    }
    // 只读锁定 / 已存在导致的错误一律容忍，其它错误（如 ENOSPC、路径非法）照旧抛出
    if (error && ["EEXIST", "EACCES", "EPERM", "EINVAL"].includes(error.code)) return false;
    throw error;
  }
}

/**
 * 探测盘根：优先看进程 cwd 或它的上一级是否存在取证盘标记 forensic-stick.json。
 * 便携启动器以盘根为 cwd 时命中 cwd；以工作区为 cwd 时命中上一级。
 * @param {string} cwd - 进程当前目录
 * @returns {string} 盘根绝对路径
 */
export function detectStickRoot(cwd) {
  try {
    if (existsSync(join(cwd, "forensic-stick.json"))) return cwd;
    const parent = resolve(cwd, "..");
    if (existsSync(join(parent, "forensic-stick.json"))) return parent;
  } catch {
    /* 忽略探测失败，回落 cwd */
  }
  return cwd;
}

/**
 * 取证层核心服务，挂载在 `ctx.forensic`。
 */
class ForensicCore extends Service {
  /** 组合层可覆盖的配置。 */
  static Config = z.object({
    root: z.string(),
    productVersion: z.string(),
    workspaceDir: z.string(),
    evidenceDir: z.string(),
    casesDir: z.string(),
    deviceDir: z.string(),
  });

  constructor(ctx, config = {}) {
    super(ctx, "forensic");
    const root = resolve(config.root || process.env.FORENSIC_ROOT || detectStickRoot(process.cwd()));
    this.layout = {
      root,
      // 工作区默认即进程工作目录（便携启动器以取证包根为 cwd，也就是 AI 框架所在处）。
      workspace: config.workspaceDir ? resolve(config.workspaceDir) : resolve(process.cwd()),
      evidence: resolve(root, config.evidenceDir || "固证区"),
      cases: resolve(root, config.casesDir || "案件区"),
      device: resolve(root, config.deviceDir || "device"),
    };
    this.productVersion = config.productVersion || "0.1.0";
    // 首启兜底：确保三区存在；若本盘尚未发放设备身份则就地生成一枚唯一身份。
    this.ensureLayout();
    this.identityIssued = this.issueIdentityIfMissing();
  }

  /** 返回三区与设备目录的绝对路径。 */
  paths() {
    return { ...this.layout };
  }

  /** 确保三区目录存在（容忍固证区/device 的只读锁定），返回布局。 */
  ensureLayout() {
    for (const dir of [
      this.layout.workspace,
      this.layout.evidence,
      this.layout.cases,
      this.layout.device,
    ]) {
      ensureDirTolerant(dir);
    }
    return this.paths();
  }

  /**
   * 若本盘尚无设备身份则生成一枚唯一身份（首启兜底）。
   * 固证区/device 若被 NTFS ACL 锁定，写入会失败并被吞掉——此时由制作方在母盘阶段预发身份。
   * @returns {boolean} 本次是否新发放了身份
   */
  issueIdentityIfMissing() {
    const idFile = join(this.layout.device, "device.json");
    try {
      if (existsSync(idFile)) return false;
    } catch {
      return false;
    }
    try {
      mkdirSync(this.layout.device, { recursive: true });
      const year = new Date().getFullYear();
      const suffix = randomBytes(3).toString("hex").toUpperCase();
      const deviceId = `FRS-${year}-${suffix}`;
      writeFileSync(
        idFile,
        JSON.stringify(
          {
            device_id: deviceId,
            product: "ForensicDSH",
            version: this.productVersion,
            created_at: new Date().toISOString(),
            capabilities: ["ai", "forensics", "login"],
          },
          null,
          2,
        ),
        "utf8",
      );
      writeFileSync(join(this.layout.device, "device.key"), randomBytes(32).toString("hex"), "utf8");
      return true;
    } catch {
      return false;
    }
  }

  /** 读取本盘设备身份（device.json），未发放时返回 undefined。 */
  device() {
    const file = join(this.layout.device, "device.json");
    try {
      if (!existsSync(file)) return undefined;
      return JSON.parse(readFileSync(file, "utf8"));
    } catch {
      return undefined;
    }
  }

  /** 分配下一个取证编号。 */
  nextId(kind, existing, year) {
    return nextForensicId(kind, existing, year);
  }

  /** 格式化取证编号。 */
  formatId(kind, value, year) {
    return formatForensicId(kind, value, year);
  }
}

export { ForensicCore, formatForensicId, nextForensicId, ID_SPEC, ensureDirTolerant };
export default ForensicCore;
