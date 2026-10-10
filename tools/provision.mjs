// 母盘与新盘发放 CLI（制作方使用）。
//
// 唯一要紧的规则：**软件复制，身份不复制。**
//   - 克隆时排除身份（device/**、config/forensic-auth.secret）与每盘运行数据
//     （固证区、案件区、会话/存储/凭据/日志、profile 的 node_modules）；
//   - 新盘发放一枚**全新**设备身份（设备 ID 从母盘台账顺序分配），绝不复制母盘身份。
//
// 用法（用取证包的便携 node 运行）：
//   node provision.mjs plan --source X:\ --json
//   node provision.mjs new-device --source X:\ --target Y:\
//   node provision.mjs device --target Y:\
//   node provision.mjs validate --target Y:\ --expect-identity
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { randomBytes } from "node:crypto";

/** 身份桶：绝不复制；新盘自有一份。 */
const IDENTITY_REL = [/^device(\/|$)/, /^config\/forensic-auth\.secret$/];
/** 每盘运行数据：绝不复制。 */
const PER_STICK_REL = [
  /^固证区(\/|$)/,
  /^案件区(\/|$)/,
  /\/data\/dsh\/sessions(\/|$)/,
  /\/data\/dsh\/storages(\/|$)/,
  /\/data\/dsh\/\.credentials\.yaml$/,
  /\/data\/dsh\/settings\.yaml$/,
  /\/data\/dsh\/profiles\/[^/]+\/node_modules(\/|$)/,
  // profiles/node_modules 是指向 .cache/app/node_modules 的「绝对路径 Junction 镜像」，
  // 直接复制会退化成空占位目录并导致启动报 plugin tree failed to load；
  // 不复制，由 Repair-Stick.ps1 在新盘上重建。
  /\/data\/dsh\/profiles\/node_modules(\/|$)/,
  /\/data\/logs(\/|$)/,
  /\/forensic-out(\/|$)/,
];

/** 把相对路径归桶：identity / per-stick / software。 */
export function classifyRel(rel) {
  const p = String(rel).replace(/\\/g, "/").replace(/^\.\//, "");
  if (IDENTITY_REL.some((re) => re.test(p))) return "identity";
  if (PER_STICK_REL.some((re) => re.test(p))) return "per-stick";
  return "software";
}

/** 是否应复制（软件与身份模板复制，身份与每盘数据不复制）。 */
export function shouldCopy(rel) {
  return classifyRel(rel) === "software";
}

/** 下一枚设备 ID（由母盘台账顺序分配）。 */
export function nextDeviceId(ledgerPath, year = new Date().getFullYear()) {
  let last = 0;
  let issued = [];
  if (ledgerPath && existsSync(ledgerPath)) {
    try {
      const ledger = JSON.parse(readFileSync(ledgerPath, "utf8"));
      last = Number(ledger.last) || 0;
      issued = Array.isArray(ledger.issued) ? ledger.issued : [];
    } catch {
      /* 台账损坏则从头开始 */
    }
  }
  const next = last + 1;
  return { id: `FRS-${year}-${String(next).padStart(6, "0")}`, seq: next, prevIssued: issued };
}

/** 给一枚新盘发放设备身份（拒绝覆盖已存在的身份）。 */
export function issueIdentity(target, { ledgerPath } = {}) {
  const deviceDir = join(target, "device");
  const idFile = join(deviceDir, "device.json");
  if (existsSync(idFile)) throw new Error(`目标已存在设备身份，拒绝覆盖：${idFile}`);
  const { id, seq, prevIssued } = nextDeviceId(ledgerPath);
  mkdirSync(deviceDir, { recursive: true });
  writeFileSync(
    idFile,
    JSON.stringify(
      {
        device_id: id,
        product: "ForensicDSH",
        version: "0.1.0",
        created_at: new Date().toISOString(),
        capabilities: ["ai", "forensics", "login"],
      },
      null,
      2,
    ),
    "utf8",
  );
  writeFileSync(join(deviceDir, "device.key"), randomBytes(32).toString("hex"), "utf8");
  if (ledgerPath) {
    mkdirSync(dirname(ledgerPath), { recursive: true });
    writeFileSync(
      ledgerPath,
      JSON.stringify({ last: seq, issued: [...prevIssued, { device_id: id, at: new Date().toISOString() }] }, null, 2),
      "utf8",
    );
  }
  return id;
}

/** 克隆软件到新盘：按桶过滤，身份与每盘数据一律不复制。返回复制/跳过统计。 */
export function cloneSoftware(source, target) {
  const stats = { copied: 0, skippedIdentity: 0, skippedPerStick: 0 };
  if (!existsSync(source)) throw new Error(`源盘不存在：${source}`);
  mkdirSync(target, { recursive: true });
  cpSync(source, target, {
    recursive: true,
    filter: (src) => {
      const rel = relative(source, src);
      if (rel === "") return true;
      const bucket = classifyRel(rel);
      if (bucket === "identity") {
        stats.skippedIdentity++;
        return false;
      }
      if (bucket === "per-stick") {
        stats.skippedPerStick++;
        return false;
      }
      try {
        if (statSync(src).isFile()) stats.copied++;
      } catch {
        /* 忽略 */
      }
      return true;
    },
  });
  return stats;
}

/** 校验一枚取证盘。 */
export function validate(target, { expectIdentity } = {}) {
  const problems = [];
  if (!existsSync(join(target, "forensic-stick.json"))) problems.push("缺少盘标记 forensic-stick.json");
  for (const d of ["固证区", "案件区", "device", "config"]) {
    if (!existsSync(join(target, d))) problems.push(`缺少目录 ${d}`);
  }
  if (!existsSync(join(target, "config", "operators.json"))) problems.push("缺少操作员名单 config/operators.json");
  const hasIdentity = existsSync(join(target, "device", "device.json"));
  if (expectIdentity && !hasIdentity) problems.push("缺少设备身份 device/device.json");
  return problems;
}

/** 确保三区与 config 目录存在（空目录也算，便于校验与首次启动）。 */
export function ensureZones(root) {
  for (const d of ["固证区", "案件区", "device", "config"]) mkdirSync(join(root, d), { recursive: true });
}

/** 写出/新建盘标记。 */
export function writeMarker(root, version = "0.1.0") {
  const marker = join(root, "forensic-stick.json");
  if (existsSync(marker)) return false;
  mkdirSync(root, { recursive: true });
  writeFileSync(
    marker,
    JSON.stringify({ product: "ForensicDSH", version, created_at: new Date().toISOString(), zones: ["固证区", "案件区", "device"] }, null, 2),
    "utf8",
  );
  return true;
}

// ── CLI ─────────────────────────────────────────────────────────────────────
function parseArgs(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const key = a.slice(2);
      out[key] = argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[++i] : true;
    } else out._.push(a);
  }
  return out;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const command = args._[0];
  if (command === "plan") {
    const source = args.source;
    if (!source) throw new Error("plan 需要 --source");
    const counts = { identity: 0, "per-stick": 0, software: 0 };
    const walk = (dir) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = join(dir, entry.name);
        const bucket = classifyRel(relative(source, full));
        counts[bucket]++;
        if (entry.isDirectory() && bucket === "software" && entry.name !== "node_modules") walk(full);
      }
    };
    walk(source);
    const decision = {
      source,
      mustCopy: counts.software,
      willNotCopy: { identity: counts.identity, "per-stick": counts["per-stick"] },
      identityEntriesCopied: 0,
    };
    if (args.json) console.log(JSON.stringify(decision, null, 2));
    else console.log(`将复制 ${counts.software} 项软件；不复制 身份 ${counts.identity} 项、每盘数据 ${counts["per-stick"]} 项（身份复制数必须为 0）。`);
    return;
  }
  if (command === "new-device") {
    const { source, target } = args;
    if (!source || !target) throw new Error("new-device 需要 --source 与 --target");
    const stats = cloneSoftware(source, target);
    ensureZones(target);
    writeMarker(target);
    const ledger = existsSync(join(source, "provision", "issued.json"))
      ? join(source, "provision", "issued.json")
      : join(target, "provision", "issued.json");
    const id = issueIdentity(target, { ledgerPath: ledger });
    console.log(`新盘已发放：${id}`);
    console.log(`复制软件 ${stats.copied} 项；跳过 身份 ${stats.skippedIdentity} 项、每盘数据 ${stats.skippedPerStick} 项（身份复制数 0）。`);
    return;
  }
  if (command === "device") {
    const target = args.target;
    if (!target) throw new Error("device 需要 --target");
    const ledger = join(target, "provision", "issued.json");
    console.log(`已发放设备身份：${issueIdentity(target, { ledgerPath: ledger })}`);
    return;
  }
  if (command === "validate") {
    const target = args.target;
    if (!target) throw new Error("validate 需要 --target");
    const problems = validate(target, { expectIdentity: args["expect-identity"] === true });
    if (problems.length === 0) {
      console.log(`校验通过：${target}`);
      return;
    }
    for (const p of problems) console.error(`FAIL : ${p}`);
    process.exit(1);
  }
  console.error("用法：provision.mjs <plan|new-device|device|validate> [...]");
  process.exit(2);
}

// 仅在作为脚本直接运行时执行 CLI（被 import 时可测试纯函数）。
if (process.argv[1] && resolve(process.argv[1]).endsWith("provision.mjs")) {
  main();
}
