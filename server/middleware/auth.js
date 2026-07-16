/**
 * JWT 认证中间件
 */
const jwt = require('jsonwebtoken');
const { apiErr } = require('../utils/helpers');

const JWT_SECRET = process.env.JWT_SECRET || 'xingchen-chat-secret-2024';

function auth(req, res, next) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return apiErr(res, '未登录', 401);

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.userId = decoded.userId;
    req.nid = decoded.nid;
    req.username = decoded.username;
    next();
  } catch (e) {
    return apiErr(res, '登录已过期，请重新登录', 401);
  }
}

function signToken(user) {
  return jwt.sign(
    { userId: user.id, nid: user.nid, username: user.username },
    JWT_SECRET,
    { expiresIn: '30d' }
  );
}

module.exports = { auth, signToken, JWT_SECRET };
