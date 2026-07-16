/**
 * 用户认证路由 - 注册 / 登录
 */
const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../db');
const { genId, genNid, apiOk, apiErr } = require('../utils/helpers');
const { auth, signToken } = require('../middleware/auth');

const router = express.Router();

// 注册
router.post('/register', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return apiErr(res, '用户名和密码不能为空');
  if (username.trim().length < 2 || username.trim().length > 16) return apiErr(res, '用户名需要2-16个字符');
  if (password.length < 6) return apiErr(res, '密码至少6位');

  // 检查用户名是否已存在
  const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(username.trim());
  if (existing) return apiErr(res, '该用户名已被注册');

  const id = genId();
  let nid = genNid();
  // 确保 nid 唯一
  while (db.prepare('SELECT id FROM users WHERE nid = ?').get(nid)) {
    nid = genNid();
  }

  const hash = bcrypt.hashSync(password, 10);
  const colors = ['#3b82f6', '#8b5cf6', '#ec4899', '#f59e0b', '#10b981', '#06b6d4', '#ef4444'];
  const avatarColor = colors[Math.floor(Math.random() * colors.length)];

  db.prepare(`INSERT INTO users (id, nid, username, password, avatar_color) VALUES (?, ?, ?, ?, ?)`)
    .run(id, nid, username.trim(), hash, avatarColor);

  const token = signToken({ id, nid, username: username.trim() });
  apiOk(res, {
    token,
    user: { id, nid, username: username.trim(), avatarColor, avatarB64: null, bio: '' }
  }, '注册成功');
});

// 登录
router.post('/login', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return apiErr(res, '用户名和密码不能为空');

  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username.trim());
  if (!user) return apiErr(res, '用户不存在');
  if (!bcrypt.compareSync(password, user.password)) return apiErr(res, '密码错误');

  const token = signToken(user);
  apiOk(res, {
    token,
    user: {
      id: user.id, nid: user.nid, username: user.username,
      avatarColor: user.avatar_color, avatarB64: user.avatar_b64, bio: user.bio || ''
    }
  }, '登录成功');
});

// 获取当前用户信息
router.get('/me', auth, (req, res) => {
  const user = db.prepare('SELECT id, nid, username, avatar_color, avatar_b64, bio FROM users WHERE id = ?').get(req.userId);
  if (!user) return apiErr(res, '用户不存在', 401);
  apiOk(res, {
    id: user.id, nid: user.nid, username: user.username,
    avatarColor: user.avatar_color, avatarB64: user.avatar_b64, bio: user.bio || ''
  });
});

// 更新个人资料
router.post('/profile', auth, (req, res) => {
  const { username, avatarColor, avatarB64, bio } = req.body;
  const updates = [];
  const params = [];

  if (username) {
    if (username.trim().length < 2 || username.trim().length > 16) return apiErr(res, '用户名需要2-16个字符');
    const existing = db.prepare('SELECT id FROM users WHERE username = ? AND id != ?').get(username.trim(), req.userId);
    if (existing) return apiErr(res, '该用户名已被占用');
    updates.push('username = ?'); params.push(username.trim());
  }
  if (avatarColor) { updates.push('avatar_color = ?'); params.push(avatarColor); }
  if (avatarB64 !== undefined) { updates.push('avatar_b64 = ?'); params.push(avatarB64); }
  if (bio !== undefined) { updates.push('bio = ?'); params.push(bio); }

  if (updates.length === 0) return apiErr(res, '没有需要更新的内容');
  params.push(req.userId);
  db.prepare(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`).run(...params);

  const user = db.prepare('SELECT id, nid, username, avatar_color, avatar_b64, bio FROM users WHERE id = ?').get(req.userId);
  apiOk(res, {
    id: user.id, nid: user.nid, username: user.username,
    avatarColor: user.avatar_color, avatarB64: user.avatar_b64, bio: user.bio || ''
  }, '资料已更新');
});

module.exports = router;
