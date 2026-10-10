/**
 * @deepseek-ai/dsh-forensic-tools — 取证工具总线。
 *
 * 启动时扫描 `forensic/tools/**` 下的 manifest.json，校验后把每个工具注册成
 * 模型可见的工具（defineTool）。模型调用时：
 *   1. 只用清单声明的参数名组装 argv（未声明的一律丢弃）；
 *   2. 可执行文件必须落在工具根目录内（防穿越）；
 *   3. 直接运行该可执行文件（不经 shell，无注入面），捕获 stdout/stderr；
 *   4. 执行结果落一份产物文件，返回结构化结果。
 */
import { Service } from "@deepseek-ai/cordis";
import { defineTool } from "@deepseek-ai/dsh-tools";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import z from "@deepseek-ai/schemastery";
import { buildArgv, discoverManifests, parametersFor, resolveExecutable, toolNameFor } from "./discovery.js";
import { decide, freeBytes, probeWritable } from "./preflight.js";

const execFileAsync = promisify(execFile);
const MAX_INLINE = 20000;

/** 截断过长文本。 */
function clip(text) {
  const value = String(text ?? "");
  return value.length > MAX_INLINE ? `${value.slice(0, MAX_INLINE)}\n…（已截断 ${value.length - MAX_INLINE} 字节）` : value;
}

/**
 * 取证工具总线服务，挂载在 `ctx.forensicTools`。
 */
class ForensicTools extends Service {
  static Config = z.object({
    toolsRoot: z.string(),
    maxDepth: z.natural(),
    defaultTimeoutMs: z.natural(),
    reserveBytes: z.natural(),
    sandboxMode: z.string(),
  });

  constructor(ctx, config = {}) {
    super(ctx, "forensicTools");
    this.toolsRoot = resolve(config.toolsRoot || join(process.cwd(), "forensic", "tools"));
    this.maxDepth = config.maxDepth || 4;
    this.defaultTimeoutMs = config.defaultTimeoutMs || 300000;
    // 保留额：低于此剩余空间即拒绝执行，保证产物/日志仍能落盘。
    this.reserveBytes = config.reserveBytes || 256 * 1024 * 1024;
    // 可选沙箱围栏：留空=直接运行清单可执行文件；设为 workspace-write 等则经 ctx.sandbox.confine。
    this.sandboxMode = config.sandboxMode || "";
    this.registered = [];
    ctx.inject(["tools"], (c) => this.mount(c));
  }

  /** 执行前预检：工作区可写、空间不少于保留额。 */
  preflight() {
    const dir = process.cwd();
    return decide({ workspaceWritable: probeWritable(dir), free: freeBytes(dir), reserveBytes: this.reserveBytes });
  }

  /** 扫描并注册全部工具。 */
  mount(c) {
    const found = discoverManifests(this.toolsRoot, this.maxDepth);
    for (const { manifest, dir } of found) {
      const exe = resolveExecutable(this.toolsRoot, manifest, dir);
      if (!exe) continue;
      const name = toolNameFor(manifest.id);
      const self = this;
      try {
        c.tools.register(
          defineTool({
            name,
            description: `${manifest.name}。${manifest.description || ""}`.trim(),
            parameters: parametersFor(manifest),
            output: {
              schema: {
                type: "object",
                additionalProperties: false,
                properties: {
                  tool_id: { type: "string", required: true },
                  exit_code: { type: "number", required: true },
                  stdout: { type: "string", required: true },
                  stderr: { type: "string", required: true },
                  artifact: { required: true, oneOf: [{ type: "string" }, { type: "null" }] },
                  duration_ms: { type: "number", required: true },
                },
              },
              render: (_args, value) =>
                [
                  {
                    type: "text",
                    text: `[${value.tool_id}] exit=${value.exit_code}${value.artifact ? ` artifact=${value.artifact}` : ""}\n${value.stdout}`.trim(),
                  },
                ],
            },
            async execute(args) {
              return self.run(manifest, exe, args);
            },
          }),
        );
        this.registered.push({ name, id: manifest.id, executable: exe });
      } catch {
        /* 重名等注册失败：跳过，不影响启动 */
      }
    }
  }

  /** 已注册的工具列表。 */
  list() {
    return this.registered.map((entry) => ({ name: entry.name, id: entry.id }));
  }

  /** 运行一个工具：组装 argv、执行、捕获、落产物。 */
  async run(manifest, exe, args) {
    const base = { tool_id: manifest.id, exit_code: -1, stdout: "", stderr: "", artifact: null, duration_ms: 0 };

    // 预检失败即拒（不执行）。
    const pre = this.preflight();
    if (!pre.ok) return { ...base, stderr: `PREFLIGHT_DENIED: ${pre.reason}` };

    const argv = buildArgv(manifest, args);
    const timeout = manifest.timeout_ms || this.defaultTimeoutMs;

    // 可选沙箱围栏：启用时经 ctx.sandbox.confine 重新包装 argv；不可用则失败关闭。
    let finalArgv = [exe, ...argv];
    if (this.sandboxMode) {
      const sandbox = this.ctx.get("sandbox");
      if (!sandbox) {
        return { ...base, stderr: `SANDBOX_UNAVAILABLE: 已要求沙箱模式 ${this.sandboxMode}，但未挂载沙箱提供方` };
      }
      try {
        finalArgv = sandbox.confine(finalArgv, { mode: this.sandboxMode, workspaceRoot: process.cwd() }).argv;
      } catch (error) {
        return { ...base, stderr: `SANDBOX_UNAVAILABLE: ${String(error?.message || error)}` };
      }
    }

    const start = Date.now();
    let stdout = "";
    let stderr = "";
    let exitCode = 0;
    try {
      const result = await execFileAsync(finalArgv[0], finalArgv.slice(1), {
        timeout,
        windowsHide: true,
        maxBuffer: 8 * 1024 * 1024,
        cwd: process.cwd(),
      });
      stdout = result.stdout;
      stderr = result.stderr;
    } catch (error) {
      exitCode = typeof error.code === "number" ? error.code : 1;
      stdout = error.stdout || "";
      stderr = `${error.stderr || ""}${error.message || ""}`;
    }
    const duration = Date.now() - start;

    let artifact = null;
    try {
      const dir = join(process.cwd(), "forensic-out");
      mkdirSync(dir, { recursive: true });
      artifact = join(dir, `${manifest.id}-${Date.now()}.txt`);
      writeFileSync(artifact, `TOOL: ${manifest.id}\nEXIT: ${exitCode}\n\nSTDOUT:\n${stdout}\n\nSTDERR:\n${stderr}`, "utf8");
    } catch {
      /* 产物落盘失败不影响返回 */
    }

    return {
      tool_id: manifest.id,
      exit_code: exitCode,
      stdout: clip(stdout),
      stderr: clip(stderr),
      artifact,
      duration_ms: duration,
    };
  }
}

export { ForensicTools };
export default ForensicTools;
