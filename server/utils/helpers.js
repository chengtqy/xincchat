/**
 * 工具函数
 */
const crypto = require('crypto');

/** 生成唯一 ID */
function genId() {
  return crypto.randomBytes(12).toString('hex');
}

/** 生成 6 位用户 ID（星辰号） */
function genNid() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

/** 统一 API 响应 */
function apiOk(res, data, msg) {
  res.json({ code: 0, msg: msg || 'ok', data });
}

function apiErr(res, msg, code) {
  res.json({ code: code || 1, msg, data: null });
}

module.exports = { genId, genNid, apiOk, apiErr };
