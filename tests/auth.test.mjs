// 登录凭据校验与会话签名的单元测试
import { pathToFileURL } from 'node:url'
import { join } from 'node:path'

const pkgDir = process.argv[2]
const v = await import(pathToFileURL(join(pkgDir, 'lib', 'verify.js')).href)

let pass = 0
let fail = 0
function check(label, actual, expected) {
  const ok = actual === expected
  if (ok) pass++; else fail++
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${ok ? '' : `  (got ${JSON.stringify(actual)}, want ${JSON.stringify(expected)})`}`)
}

// 建号 + 校验往返
const doc = v.createOperatorsDoc()
doc.operators.push(v.createOperatorRecord(doc, { operator_id: 'OP-00001', name: '张三', idCard: '110101199001011234', password: 'p@ss', role: 'investigator' }))

check('身份证号不落明文', JSON.stringify(doc).includes('110101199001011234'), false)
check('密码不落明文', JSON.stringify(doc).includes('p@ss'), false)

const ok = v.verifyOperator(doc, { name: '张三', idCard: '110101199001011234', password: 'p@ss' })
check('正确凭据通过', ok && ok.operator_id, 'OP-00001')
check('错误密码拒绝', v.verifyOperator(doc, { name: '张三', idCard: '110101199001011234', password: 'wrong' }), undefined)
check('错误身份证拒绝', v.verifyOperator(doc, { name: '张三', idCard: '110101199001019999', password: 'p@ss' }), undefined)
check('未知姓名拒绝', v.verifyOperator(doc, { name: '李四', idCard: '110101199001011234', password: 'p@ss' }), undefined)
check('缺字段拒绝', v.verifyOperator(doc, { name: '张三' }), undefined)

// 会话签名往返与防篡改
const secret = 'a'.repeat(64)
const token = v.signSession(secret, { operator_id: 'OP-00001', name: '张三', exp: Date.now() + 1000 })
check('会话校验通过', v.verifySession(secret, token)?.operator_id, 'OP-00001')
check('错误密钥拒绝', v.verifySession('b'.repeat(64), token), undefined)
check('过期拒绝', v.verifySession(secret, v.signSession(secret, { operator_id: 'OP-00001', exp: Date.now() - 1000 })), undefined)
check('篡改拒绝', v.verifySession(secret, token.slice(0, -2) + 'xx'), undefined)

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail === 0 ? 0 : 1)
