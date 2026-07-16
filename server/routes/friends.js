/**
 * 好友系统路由
 */
const express = require('express');
const db = require('../db');
const { genId, apiOk, apiErr } = require('../utils/helpers');
const { auth } = require('../middleware/auth');

const router = express.Router();

// 搜索用户（按星辰号或用户名）
router.get('/search', auth, (req, res) => {
  const q = (req.query.q || '').trim();
  if (!q) return apiOk(res, []);

  const pattern = `%${q}%`;
  const users = db.prepare(`
    SELECT id, nid, username, avatar_color, avatar_b64 FROM users
    WHERE (nid = ? OR username LIKE ?) AND id != ?
    LIMIT 20
  `).all(q, pattern, req.userId);

  const results = users.map(u => ({
    id: u.id, nid: u.nid, username: u.username,
    avatarColor: u.avatar_color, avatarB64: u.avatar_b64
  }));

  // 标记是否已经是好友
  results.forEach(u => {
    const isFriend = db.prepare('SELECT id FROM friendships WHERE user_id = ? AND friend_id = ?').get(req.userId, u.id);
    u.isFriend = !!isFriend;
    const pendingReq = db.prepare(`SELECT id, status FROM friend_requests WHERE from_id = ? AND to_id = ? AND status = 'pending'`).get(req.userId, u.id);
    u.requestSent = !!pendingReq;
  });

  apiOk(res, results);
});

// 发送好友请求
router.post('/request', auth, (req, res) => {
  const { toId } = req.body;
  if (!toId) return apiErr(res, '缺少目标用户');
  if (toId === req.userId) return apiErr(res, '不能添加自己为好友');

  const target = db.prepare('SELECT id FROM users WHERE id = ?').get(toId);
  if (!target) return apiErr(res, '用户不存在');

  // 已经是好友？
  const isFriend = db.prepare('SELECT id FROM friendships WHERE user_id = ? AND friend_id = ?').get(req.userId, toId);
  if (isFriend) return apiErr(res, '已经是好友了');

  // 已有待处理的请求？
  const existing = db.prepare(`SELECT id FROM friend_requests WHERE from_id = ? AND to_id = ? AND status = 'pending'`).get(req.userId, toId);
  if (existing) return apiErr(res, '已发送过好友请求，等待对方确认');

  // 对方是否也向我发过请求？如果是则直接成为好友
  const reverseReq = db.prepare(`SELECT id FROM friend_requests WHERE from_id = ? AND to_id = ? AND status = 'pending'`).get(toId, req.userId);
  if (reverseReq) {
    // 双向添加好友
    const fId1 = genId(), fId2 = genId();
    db.prepare('INSERT INTO friendships (id, user_id, friend_id) VALUES (?, ?, ?)').run(fId1, req.userId, toId);
    db.prepare('INSERT INTO friendships (id, user_id, friend_id) VALUES (?, ?, ?)').run(fId2, toId, req.userId);
    db.prepare('UPDATE friend_requests SET status = ? WHERE id = ?').run('accepted', reverseReq.id);
    return apiOk(res, { becameFriends: true }, '已互为好友');
  }

  const reqId = genId();
  db.prepare('INSERT INTO friend_requests (id, from_id, to_id, status) VALUES (?, ?, ?, ?)').run(reqId, req.userId, toId, 'pending');
  apiOk(res, { becameFriends: false }, '好友请求已发送');
});

// 好友请求列表（收到的）
router.get('/requests', auth, (req, res) => {
  const requests = db.prepare(`
    SELECT fr.id, fr.status, fr.created_at, u.id AS from_id, u.nid, u.username, u.avatar_color, u.avatar_b64
    FROM friend_requests fr
    JOIN users u ON fr.from_id = u.id
    WHERE fr.to_id = ? AND fr.status = 'pending'
    ORDER BY fr.created_at DESC
  `).all(req.userId);

  apiOk(res, requests.map(r => ({
    requestId: r.id,
    from: { id: r.from_id, nid: r.nid, username: r.username, avatarColor: r.avatar_color, avatarB64: r.avatar_b64 },
    createdAt: r.created_at
  })));
});

// 接受 / 拒绝好友请求
router.post('/request/respond', auth, (req, res) => {
  const { requestId, action } = req.body; // action: 'accept' | 'reject'
  if (!requestId || !action) return apiErr(res, '参数缺失');

  const fr = db.prepare('SELECT * FROM friend_requests WHERE id = ? AND to_id = ?').get(requestId, req.userId);
  if (!fr) return apiErr(res, '请求不存在');
  if (fr.status !== 'pending') return apiErr(res, '该请求已处理');

  if (action === 'accept') {
    const fId1 = genId(), fId2 = genId();
    db.prepare('INSERT OR IGNORE INTO friendships (id, user_id, friend_id) VALUES (?, ?, ?)').run(fId1, req.userId, fr.from_id);
    db.prepare('INSERT OR IGNORE INTO friendships (id, user_id, friend_id) VALUES (?, ?, ?)').run(fId2, fr.from_id, req.userId);
    db.prepare('UPDATE friend_requests SET status = ? WHERE id = ?').run('accepted', requestId);
    apiOk(res, null, '已添加好友');
  } else {
    db.prepare('UPDATE friend_requests SET status = ? WHERE id = ?').run('rejected', requestId);
    apiOk(res, null, '已拒绝');
  }
});

// 好友列表
router.get('/list', auth, (req, res) => {
  const friends = db.prepare(`
    SELECT u.id, u.nid, u.username, u.avatar_color, u.avatar_b64, u.last_active
    FROM friendships f
    JOIN users u ON f.friend_id = u.id
    WHERE f.user_id = ?
    ORDER BY u.username
  `).all(req.userId);

  apiOk(res, friends.map(f => ({
    id: f.id, nid: f.nid, username: f.username,
    avatarColor: f.avatar_color, avatarB64: f.avatar_b64,
    lastActive: f.last_active
  })));
});

// 删除好友
router.post('/delete', auth, (req, res) => {
  const { friendId } = req.body;
  if (!friendId) return apiErr(res, '参数缺失');
  db.prepare('DELETE FROM friendships WHERE user_id = ? AND friend_id = ?').run(req.userId, friendId);
  db.prepare('DELETE FROM friendships WHERE user_id = ? AND friend_id = ?').run(friendId, req.userId);
  apiOk(res, null, '已删除好友');
});

module.exports = router;
