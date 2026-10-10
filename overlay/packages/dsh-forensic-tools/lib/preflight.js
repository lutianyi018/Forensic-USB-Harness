/**
 * 工具执行前的预检（失败即拒，不执行）。纯逻辑 + 少量真实 fs 探测，可独立测试。
 *
 * 覆盖取证盘的典型故障（§31 对应项）：U 盘被拔出 / 只读、空间不足（保留额不能动）。
 */
import { mkdirSync, statfsSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";

/**
 * 目录剩余空间（字节）。探测失败返回 undefined。
 * @param {string} dir
 * @returns {number|undefined}
 */
export function freeBytes(dir) {
  try {
    const s = statfsSync(dir);
    return Number(s.bavail) * Number(s.bsize);
  } catch {
    return undefined;
  }
}

/**
 * 写探针：能创建并删除一个临时文件即视为可写。
 * @param {string} dir
 * @returns {boolean}
 */
export function probeWritable(dir) {
  try {
    mkdirSync(dir, { recursive: true });
    const probe = join(dir, `.fs-probe-${process.pid}-${Date.now()}`);
    writeFileSync(probe, "x");
    unlinkSync(probe);
    return true;
  } catch {
    return false;
  }
}

/**
 * 预检判定（纯函数）。
 * @param {{workspaceWritable:boolean, free?:number, reserveBytes?:number}} facts
 * @returns {{ok:true}|{ok:false, reason:string}}
 */
export function decide(facts) {
  if (!facts.workspaceWritable) return { ok: false, reason: "工作区不可写（U 盘被拔出或为只读介质）" };
  const { free, reserveBytes } = facts;
  if (typeof free === "number" && reserveBytes && free < reserveBytes) {
    return { ok: false, reason: `空间不足：剩余 ${free} 字节，低于必须保留的 ${reserveBytes} 字节` };
  }
  return { ok: true };
}
