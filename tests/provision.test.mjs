// 母盘发放逻辑单元测试：分桶、克隆排除、身份发放、校验
import { pathToFileURL } from 'node:url'
import { join } from 'node:path'
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'

const pkgDir = process.argv[2]
const p = await import(pathToFileURL(join(pkgDir, 'tools', 'provision.mjs')).href)

let pass = 0, fail = 0
function check(label, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected)
  if (ok) pass++; else fail++
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${ok ? '' : `  (got ${JSON.stringify(actual)}, want ${JSON.stringify(expected)})`}`)
}

// 分桶规则
check('device 归身份', p.classifyRel('device/device.json'), 'identity')
check('会话密钥归身份', p.classifyRel('config/forensic-auth.secret'), 'identity')
check('固证区归每盘数据', p.classifyRel('固证区/a.E01'), 'per-stick')
check('案件区归每盘数据', p.classifyRel('案件区/c.json'), 'per-stick')
check('会话数据归每盘数据', p.classifyRel('USB-Harness-with-runtime/data/dsh/sessions/s.jsonl'), 'per-stick')
check('凭据归每盘数据', p.classifyRel('USB-Harness-with-runtime/data/dsh/.credentials.yaml'), 'per-stick')
check('profile node_modules 归每盘数据', p.classifyRel('USB-Harness-with-runtime/data/dsh/profiles/web/node_modules/x/y.js'), 'per-stick')
check('共享 node_modules 镜像归每盘数据', p.classifyRel('USB-Harness-with-runtime/data/dsh/profiles/node_modules/@deepseek-ai/dsh-llm/index.js'), 'per-stick')
check('操作员名单是软件', p.classifyRel('config/operators.json'), 'software')
check('启动脚本是软件', p.classifyRel('USB-Harness-with-runtime/scripts/launch-windows.ps1'), 'software')

// 构造一个极小的假母盘
const src = mkdtempSync(join(tmpdir(), 'stick-src-'))
const dst = mkdtempSync(join(tmpdir(), 'stick-dst-'))
function put(rel, content = 'x') {
  const full = join(src, rel)
  mkdirSync(join(full, '..'), { recursive: true })
  writeFileSync(full, content)
}
put('forensic-stick.json', '{}')
put('config/operators.json', '{"operators":[]}')
put('config/forensic-auth.secret', 'SECRET')
put('device/device.json', '{"device_id":"FRS-2026-000001"}')
put('device/device.key', 'KEY')
put('固证区/evidence.E01')
put('案件区/case.json')
put('USB-Harness-with-runtime/scripts/launch-windows.ps1')
put('USB-Harness-with-runtime/data/dsh/sessions/s.jsonl')
put('USB-Harness-with-runtime/data/dsh/.credentials.yaml')
put('USB-Harness-with-runtime/data/dsh/profiles/web/node_modules/x/y.js')
put('USB-Harness-with-runtime/data/logs/l.log')
put('USB-Harness-with-runtime/forensic-out/o.txt')

const stats = p.cloneSoftware(src, dst)
p.ensureZones(dst)
const ex = (rel) => existsSync(join(dst, rel))
check('身份未复制 device.json', ex('device/device.json'), false)
check('身份未复制 device.key', ex('device/device.key'), false)
check('会话密钥未复制', ex('config/forensic-auth.secret'), false)
check('固证区内容未复制', ex('固证区/evidence.E01'), false)
check('案件区内容未复制', ex('案件区/case.json'), false)
check('会话数据未复制', ex('USB-Harness-with-runtime/data/dsh/sessions'), false)
check('凭据未复制', ex('USB-Harness-with-runtime/data/dsh/.credentials.yaml'), false)
check('profile node_modules 未复制', ex('USB-Harness-with-runtime/data/dsh/profiles/web/node_modules'), false)
check('共享 node_modules 镜像未复制', ex('USB-Harness-with-runtime/data/dsh/profiles/node_modules'), false)
check('日志未复制', ex('USB-Harness-with-runtime/data/logs'), false)
check('软件已复制：启动脚本', ex('USB-Harness-with-runtime/scripts/launch-windows.ps1'), true)
check('软件已复制：操作员名单', ex('config/operators.json'), true)
check('跳过的身份项计数 > 0', stats.skippedIdentity > 0, true)
check('跳过的每盘项计数 > 0', stats.skippedPerStick > 0, true)

// 发身份
const ledger = join(src, 'provision', 'issued.json')
const id1 = p.issueIdentity(dst, { ledgerPath: ledger })
check('发放的设备 ID 形如 FRS-YYYY-NNNNNN', /^FRS-\d{4}-\d{6}$/.test(id1), true)
check('身份文件已落盘', ex('device/device.json'), true)
check('身份含 device.key', ex('device/device.key'), true)
let threw = false
try { p.issueIdentity(dst, { ledgerPath: ledger }) } catch { threw = true }
check('拒绝覆盖既有身份', threw, true)

// 台账顺序分配
const id2 = p.issueIdentity(mkdtempSync(join(tmpdir(), 'stick-dst2-')), { ledgerPath: ledger })
check('台账递增', Number(id2.split('-')[2]) > Number(id1.split('-')[2]), true)

// 校验
check('校验通过', p.validate(dst, { expectIdentity: true }), [])

rmSync(src, { recursive: true, force: true })
rmSync(dst, { recursive: true, force: true })
console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail === 0 ? 0 : 1)
