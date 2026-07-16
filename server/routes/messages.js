/**
 * 消息路由 - 历史消息 / 未读数 / 会话列表
 */
const express = require('express');
const db = require('../db');
const { apiOk, apiErr } = require('../utils/helpers');
const { auth } = require('../middleware/auth');

const router = express.Router();

// 获取与某用户的历史消息
router.get('/history', auth, (req, res) => {
  const { userId: otherId, before, limit } = req.query;
  if (!otherId) return apiErr(res, '缺少用户参数');

  const lim = Math.min(parseInt(limit) || 50, 100);
  let sql = `
    SELECT id, sender_id, receiver_id, content, msg_type, created_at, read
    FROM messages
    WHERE (sender_id = ? AND receiver_id = ?) OR (sender_id = ? AND receiver_id = ?)
  `;
  const params = [req.userId, otherId, otherId, req.userId];

  if (before) {
    sql += ` AND created_at < ?`;
    params.push(parseInt(before));
  }
  sql += ` ORDER BY created_at DESC LIMIT ?`;
  params.push(lim);

  const msgs = db.prepare(sql).all(...params);
  // 标记发给我的消息为已读
  db.prepare(`UPDATE messages SET read = 1 WHERE sender_id = ? AND receiver_id = ? AND read = 0`)
    .run(otherId, req.userId);

  apiOk(res, msgs.reverse().map(m => ({
    id: m.id,
    senderId: m.sender_id,
    receiverId: m.receiver_id,
    content: m.content,
    msgType: m.msg_type,
    createdAt: m.created_at,
    read: m.read
  })));
});

// 会话列表（最近聊过的人）
router.get('/sessions', auth, (req, res) => {
  // 找出所有和我相关的消息，按对方分组，取最后一条
  const rows = db.prepare(`
    SELECT
      CASE WHEN sender_id = ? THEN receiver_id ELSE sender_id END AS other_id,
      MAX(created_at) AS last_time
    FROM messages
    WHERE sender_id = ? OR receiver_id = ?
    GROUP BY other_id
    ORDER BY last_time DESC
  `).all(req.userId, req.userId, req.userId);

  const results = [];
  for (const row of rows) {
    const user = db.prepare('SELECT id, nid, username, avatar_color, avatar_b64 FROM users WHERE id = ?').get(row.other_id);
    if (!user) continue;

    const lastMsg = db.prepare(`
      SELECT content, msg_type, created_at, sender_id FROM messages
      WHERE (sender_id = ? AND receiver_id = ?) OR (sender_id = ? AND receiver_id = ?)
      ORDER BY created_at DESC LIMIT 1
    `).get(req.userId, row.other_id, row.other_id, req.userId);

    const unread = db.prepare(`SELECT COUNT(*) AS c FROM messages WHERE sender_id = ? AND receiver_id = ? AND read = 0`)
      .get(row.other_id, req.userId);

    results.push({
      user: {
        id: user.id, nid: user.nid, username: user.username,
        avatarColor: user.avatar_color, avatarB64: user.avatar_b64
      },
      lastMessage: lastMsg ? {
        content: lastMsg.content,
        msgType: lastMsg.msg_type,
        createdAt: lastMsg.created_at,
        senderId: lastMsg.sender_id
      } : null,
      unreadCount: unread.c,
      lastTime: row.last_time
    });
  }

  apiOk(res, results);
});

// 未读消息总数
router.get('/unread-count', auth, (req, res) => {
  const row = db.prepare(`SELECT COUNT(*) AS c FROM messages WHERE receiver_id = ? AND read = 0`).get(req.userId);
  apiOk(res, { count: row.c });
});

module.exports = router;
