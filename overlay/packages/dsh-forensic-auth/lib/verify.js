/**
 * 凭据校验与登录会话签名（纯逻辑，仅依赖 node:crypto）。
 *
 * 被登录插件、制作方建号 CLI 与单元测试共用，保证"建号"与"校验"用的是同一套算法。
 *
 * 存储安全：
 *  - 身份证号不存明文，只存「全局盐 + 身份证号」的 SHA-256；
 *  - 密码/PIN 用 PBKDF2-SHA256 加盐派生，不存明文。
 */
import { createHash, createHmac, pbkdf2Sync, randomBytes, timingSafeEqual } from "node:crypto";

/** 默认 PBKDF2 迭代次数。 */
export const DEFAULT_ITERATIONS = 200000;
/** 派生密钥长度（字节）。 */
export const DEFAULT_KEYLEN = 32;

/** 生成一个空的运算符名单文档。 */
export function createOperatorsDoc() {
  return { version: 1, salt: randomBytes(16).toString("base64"), operators: [] };
}

/** 身份证号摘要：sha256(salt + "|" + idCard)。 */
export function hashIdCard(salt, idCard) {
  return createHash("sha256").update(`${salt}|${String(idCard).trim()}`).digest("hex");
}

/** PBKDF2-SHA256 派生密码摘要（base64）。 */
export function derivePassword(password, saltB64, iterations = DEFAULT_ITERATIONS, keylen = DEFAULT_KEYLEN) {
  return pbkdf2Sync(String(password), Buffer.from(saltB64, "base64"), iterations, keylen, "sha256").toString("base64");
}

/** 常量时间比较两个 base64/hex 字符串。 */
function equalsConstantTime(a, b) {
  const ba = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}

/**
 * 校验一次登录。
 * @param {object} doc - 运算符名单文档
 * @param {{name:string,idCard:string,password:string}} creds
 * @returns {object|undefined} 命中则返回 {operator_id,name,role}，否则 undefined
 */
export function verifyOperator(doc, creds) {
  if (!doc || !Array.isArray(doc.operators)) return undefined;
  const name = String(creds?.name ?? "").trim();
  const idCard = String(creds?.idCard ?? "").trim();
  const password = String(creds?.password ?? "");
  if (!name || !idCard || !password) return undefined;

  const op = doc.operators.find((entry) => entry.name === name);
  if (!op) return undefined;

  const idOk = equalsConstantTime(hashIdCard(doc.salt, idCard), op.id_card_hash);
  const pwOk = equalsConstantTime(
    derivePassword(password, op.password?.salt, op.password?.iterations),
    op.password?.hash,
  );
  if (!idOk || !pwOk) return undefined;
  return { operator_id: op.operator_id, name: op.name, role: op.role };
}

/**
 * 生成一条运算符记录（供建号 CLI 使用）。
 * @param {object} doc - 目标文档（只读其 salt）
 * @param {{operator_id:string,name:string,idCard:string,password:string,role?:string}} input
 */
export function createOperatorRecord(doc, input) {
  const salt = randomBytes(16).toString("base64");
  return {
    operator_id: input.operator_id,
    name: String(input.name).trim(),
    role: input.role || "investigator",
    id_card_hash: hashIdCard(doc.salt, input.idCard),
    password: {
      algo: "pbkdf2-sha256",
      salt,
      iterations: DEFAULT_ITERATIONS,
      hash: derivePassword(input.password, salt),
    },
  };
}

/**
 * 生成登录会话令牌：base64url(JSON payload) + "." + HMAC-SHA256(secret)。
 * @param {string} secret - 会话签名密钥（hex）
 * @param {object} payload - 会话载荷
 */
export function signSession(secret, payload) {
  const body = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  const mac = createHmac("sha256", secret).update(body).digest("base64url");
  return `${body}.${mac}`;
}

/**
 * 校验并解析登录会话令牌。
 * @returns {object|undefined} 有效则返回载荷，否则 undefined
 */
export function verifySession(secret, token, now = Date.now()) {
  if (typeof token !== "string") return undefined;
  const dot = token.lastIndexOf(".");
  if (dot <= 0) return undefined;
  const body = token.slice(0, dot);
  const mac = token.slice(dot + 1);
  const expected = createHmac("sha256", secret).update(body).digest("base64url");
  if (!equalsConstantTime(mac, expected)) return undefined;
  let payload;
  try {
    payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
  } catch {
    return undefined;
  }
  if (payload.exp !== undefined && Number(payload.exp) < now) return undefined;
  return payload;
}
