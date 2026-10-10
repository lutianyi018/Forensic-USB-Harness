// 操作员建号 CLI（制作方使用）——与登录插件共用同一套哈希算法。
//
// 用法（用取证包的便携 node 运行）：
//   node operator-cli.mjs --root X:\ add --name 张三 --id 110101199001011234 --password 1234 [--role investigator] [--operator-id OP-00001]
//   node operator-cli.mjs --root X:\ list
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { createOperatorRecord, createOperatorsDoc } from "../overlay/packages/dsh-forensic-auth/lib/verify.js";

function parseArgs(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const key = a.slice(2);
      const val = argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[++i] : "true";
      out[key] = val;
    } else out._.push(a);
  }
  return out;
}

const args = parseArgs(process.argv.slice(2));
const command = args._[0];
const root = args.root;
if (!root || !command) {
  console.error("用法：node operator-cli.mjs --root <盘根> <add|list> [...]");
  process.exit(2);
}

const configDir = join(root, "config");
const operatorsPath = join(configDir, "operators.json");

function loadDoc() {
  if (existsSync(operatorsPath)) {
    try {
      const doc = JSON.parse(readFileSync(operatorsPath, "utf8"));
      if (doc && Array.isArray(doc.operators) && typeof doc.salt === "string") return doc;
    } catch {
      /* 落回新建 */
    }
  }
  return createOperatorsDoc();
}

function saveDoc(doc) {
  mkdirSync(dirname(operatorsPath), { recursive: true });
  writeFileSync(operatorsPath, JSON.stringify(doc, null, 2), "utf8");
}

if (command === "add") {
  let input = {
    name: args.name,
    idCard: args.id,
    password: args.password,
    role: args.role,
    operatorId: args["operator-id"],
  };
  if (args["from-json"]) {
    try {
      input = { ...input, ...JSON.parse(readFileSync(args["from-json"], "utf8")) };
    } catch (error) {
      console.error(`读取 --from-json 失败：${error.message}`);
      process.exit(2);
    }
  }
  if (!input.name || !input.idCard || !input.password) {
    console.error("缺少参数：--name / --id / --password（或 --from-json）");
    process.exit(2);
  }
  const doc = loadDoc();
  const operatorId = input.operatorId || `OP-${String(doc.operators.length + 1).padStart(5, "0")}`;
  doc.operators.push(
    createOperatorRecord(doc, {
      operator_id: operatorId,
      name: input.name,
      idCard: input.idCard,
      password: input.password,
      role: input.role || "investigator",
    }),
  );
  saveDoc(doc);
  console.log(`已新增操作员 ${operatorId}（${input.name}），当前共 ${doc.operators.length} 人。`);
  console.log(`名单：${operatorsPath}`);
} else if (command === "list") {
  const doc = loadDoc();
  console.log(`名单：${operatorsPath}`);
  console.log(`共 ${doc.operators.length} 人：`);
  for (const op of doc.operators) console.log(`  ${op.operator_id}  ${op.name}  [${op.role}]`);
} else {
  console.error(`未知命令：${command}`);
  process.exit(2);
}
