// 一键运行全部单元测试。
// 用法：node run-all.mjs <harnessRoot>
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const stick = join(here, "..");
const harness = process.argv[2];
if (!harness) {
  console.error("用法：node run-all.mjs <harnessRoot>");
  process.exit(2);
}

const nm = join(harness, ".cache", "app", "node_modules", "@deepseek-ai");
const node = process.execPath;

const cases = [
  ["policy", "policy.test.mjs", join(nm, "dsh-forensic-policy")],
  ["auth", "auth.test.mjs", join(nm, "dsh-forensic-auth")],
  ["tools", "tools.test.mjs", join(stick, "overlay", "packages", "dsh-forensic-tools")],
  ["preflight", "preflight.test.mjs", join(stick, "overlay", "packages", "dsh-forensic-tools")],
  ["provision", "provision.test.mjs", stick],
];

let failed = 0;
for (const [name, file, arg] of cases) {
  const result = spawnSync(node, [join(here, file), arg], { encoding: "utf8" });
  const lines = (result.stdout || "").trim().split("\n");
  const summary = lines[lines.length - 1] || "";
  const ok = result.status === 0;
  if (!ok) failed++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name.padEnd(10)} ${summary}`);
  if (!ok) console.log(result.stdout, result.stderr);
}

console.log(failed === 0 ? "\n全部通过。" : `\n${failed} 套失败。`);
process.exit(failed === 0 ? 0 : 1);
