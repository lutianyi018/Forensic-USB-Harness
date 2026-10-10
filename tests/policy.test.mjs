// 固证区只读守卫的纯逻辑单元测试
import { pathToFileURL } from 'node:url'
import { join } from 'node:path'
import { resolve } from 'node:path'

const pkgDir = process.argv[2]
const { isUnder, commandTouches, evaluate } = await import(pathToFileURL(join(pkgDir, 'lib', 'index.js')).href)

const EVIDENCE = resolve('X:/固证区')
const policy = {
  evidenceRoot: EVIDENCE,
  mutatingTools: new Set(['write', 'edit', 'apply_patch', 'mkdir', 'remove']),
  shellTools: new Set(['pwsh', 'bash', 'run_code']),
  denyShellTouch: true,
}

let pass = 0
let fail = 0
function check(label, actual, expected) {
  const ok = actual === expected
  if (ok) pass++; else fail++
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${ok ? '' : `  (got ${JSON.stringify(actual)}, want ${JSON.stringify(expected)})`}`)
}

// 路径包含判定
check('isUnder 子路径', isUnder(EVIDENCE, 'X:/固证区/Evidence-1/img.E01'), true)
check('isUnder 同级相似前缀', isUnder(EVIDENCE, 'X:/固证区2/x'), false)
check('isUnder 上级', isUnder(EVIDENCE, 'X:/工作区/x'), false)

// 写类工具：固证区 → 拒绝
check('write 到固证区', typeof evaluate({ name: 'write', arguments: { file_path: 'X:/固证区/a.txt' } }, policy), 'string')
check('edit 到固证区', typeof evaluate({ name: 'edit', arguments: { file_path: 'X:/固证区/a.txt' } }, policy), 'string')
// 写类工具：工作区 → 放行
check('write 到工作区', evaluate({ name: 'write', arguments: { file_path: 'X:/工作区/out.txt' } }, policy), undefined)
// 读类工具：固证区 → 放行（只读可分析）
check('read 固证区', evaluate({ name: 'read', arguments: { file_path: 'X:/固证区/a.txt' } }, policy), undefined)

// shell：命令触及固证区 → 拒绝；否则放行
check('pwsh 触固证区', typeof evaluate({ name: 'pwsh', arguments: { command: 'cd X:/固证区; del *.E01' } }, policy), 'string')
check('pwsh 正常命令', evaluate({ name: 'pwsh', arguments: { command: 'Get-Date' } }, policy), undefined)
check('commandTouches 目录名', commandTouches('Remove-Item 固证区\\a', EVIDENCE), true)

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail === 0 ? 0 : 1)
