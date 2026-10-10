// 取证工具总线发现/校验/组装的单元测试
import { pathToFileURL } from 'node:url'
import { join } from 'node:path'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'

const pkgDir = process.argv[2]
const d = await import(pathToFileURL(join(pkgDir, 'lib', 'discovery.js')).href)

let pass = 0, fail = 0
function check(label, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected)
  if (ok) pass++; else fail++
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${ok ? '' : `  (got ${JSON.stringify(actual)}, want ${JSON.stringify(expected)})`}`)
}

// 工具名派生
check('toolNameFor', d.toolNameFor('USB-History'), 'forensic_usb_history')

// 清单校验
check('缺失 id 报错', d.validateManifest({ name: 'x', executable: { windows: 'a.exe' } }).ok, false)
check('合法清单通过', d.validateManifest({ id: 'a', name: 'A', executable: { windows: 'a.exe' } }).ok, true)
check('非法参数类型报错', d.validateManifest({ id: 'a', name: 'A', executable: { windows: 'a.exe' }, args: [{ name: 'p', type: 'object' }] }).ok, false)

// 临时目录：一个合法工具 + 一个越权工具
const root = mkdtempSync(join(tmpdir(), 'ft-'))
const goodDir = join(root, 'external', 'good')
mkdirSync(goodDir, { recursive: true })
writeFileSync(join(goodDir, 'good.exe'), 'x')
writeFileSync(join(goodDir, 'manifest.json'), JSON.stringify({
  id: 'good', name: 'Good', executable: { windows: 'good.exe' },
  args: [{ name: 'a', type: 'string', required: true }, { name: 'flag', type: 'boolean' }, { name: 'n', type: 'number' }],
}))
const badDir = join(root, 'external', 'bad')
mkdirSync(badDir, { recursive: true })
writeFileSync(join(badDir, 'manifest.json'), JSON.stringify({
  id: 'bad', name: 'Bad', executable: { windows: '../../../Windows/System32/cmd.exe' },
}))

const found = d.discoverManifests(root, 4)
check('发现清单数', found.length, 2)

const good = found.find((f) => f.manifest.id === 'good')
check('合法工具可执行文件可解析', typeof d.resolveExecutable(root, good.manifest, good.dir), 'string')

const bad = found.find((f) => f.manifest.id === 'bad')
check('越权可执行文件被拒', d.resolveExecutable(root, bad.manifest, bad.dir), undefined)

// argv 组装
check('argv 顺序与类型', d.buildArgv(good.manifest, { a: 'X', n: 3, flag: true }), ['X', 'flag', '3'])
let threw = false
try { d.buildArgv(good.manifest, {}) } catch { threw = true }
check('缺必需参数抛错', threw, true)
check('未声明参数被丢弃', d.buildArgv(good.manifest, { a: 'X', zzz: 'evil' }), ['X'])

// 带值选项（flag / style）
const flagManifest = {
  id: 'f', name: 'F', executable: { windows: 'f.exe' },
  args: [
    { name: 'file', type: 'string', required: true },
    { name: 'csv', type: 'string', flag: '--csv' },
    { name: 'eq', type: 'string', flag: '--json', style: 'equals' },
    { name: 'accept', type: 'boolean', flag: '-accepteula' },
  ],
}
check('flag 空格分隔', d.buildArgv(flagManifest, { file: 'a.dd', csv: 'out' }), ['a.dd', '--csv', 'out'])
check('flag 等号分隔', d.buildArgv(flagManifest, { file: 'a.dd', eq: 'x' }), ['a.dd', '--json=x'])
check('布尔使用 flag 名', d.buildArgv(flagManifest, { file: 'a.dd', accept: true }), ['a.dd', '-accepteula'])
check('flag/style 清单合法', d.validateManifest(flagManifest).ok, true)
check('非法 style 报错', d.validateManifest({ id: 'a', name: 'A', executable: { windows: 'a.exe' }, args: [{ name: 'x', type: 'string', style: 'weird' }] }).ok, false)
check('非法 flag 类型报错', d.validateManifest({ id: 'a', name: 'A', executable: { windows: 'a.exe' }, args: [{ name: 'x', type: 'string', flag: 5 }] }).ok, false)

// parameters DSL
const params = d.parametersFor(good.manifest)
check('parameters 含必填', params.a.required, true)

rmSync(root, { recursive: true, force: true })
console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail === 0 ? 0 : 1)
