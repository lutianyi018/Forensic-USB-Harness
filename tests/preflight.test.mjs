// 工具总线预检的单元测试
import { pathToFileURL } from 'node:url'
import { join } from 'node:path'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'

const pkgDir = process.argv[2]
const p = await import(pathToFileURL(join(pkgDir, 'lib', 'preflight.js')).href)

let pass = 0, fail = 0
function check(label, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected)
  if (ok) pass++; else fail++
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${ok ? '' : `  (got ${JSON.stringify(actual)}, want ${JSON.stringify(expected)})`}`)
}

// 判定（纯函数）
check('不可写即拒', p.decide({ workspaceWritable: false }).ok, false)
check('空间不足即拒', p.decide({ workspaceWritable: true, free: 100, reserveBytes: 1000 }).ok, false)
check('空间充足通过', p.decide({ workspaceWritable: true, free: 5000, reserveBytes: 1000 }).ok, true)
check('未知空间时放行（仅探测不到才忽略）', p.decide({ workspaceWritable: true, free: undefined, reserveBytes: 1000 }).ok, true)

// 真实探测
const dir = mkdtempSync(join(tmpdir(), 'pf-'))
check('临时目录可写', p.probeWritable(dir), true)
check('剩余空间为正数', typeof p.freeBytes(dir) === 'number' && p.freeBytes(dir) > 0, true)

// 指向一个文件（不能当目录建）→ 不可写
const file = join(dir, 'afile')
writeFileSync(file, 'x')
check('文件路径不可写', p.probeWritable(file), false)

rmSync(dir, { recursive: true, force: true })
console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail === 0 ? 0 : 1)
