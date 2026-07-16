/**
 * 星辰Chat 后端主入口
 * Express + Socket.IO + SQLite
 */
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const db = require('./db');
const { genId, apiOk, apiErr } = require('./utils/helpers');
const { auth, JWT_SECRET } = require('./middleware/auth');
const jwt = require('jsonwebtoken');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*', methods: ['GET', 'POST'] }
});

app.use(cors({ origin: '*' }));
app.use(express.json({ limit: '5mb' }));
app.use(express.static('public'));

// === 路由 ===
app.use('/api/auth', require('./routes/auth'));
app.use('/api/friends', require('./routes/friends'));
app.use('/api/messages', require('./routes/messages'));

// 健康检查
app.get('/api/health', (req, res) => {
  apiOk(res, { status: 'running', time: Date.now() });
});

// === Socket.IO 实时通信 ===
const onlineUsers = new Map(); // userId -> socketId

io.use((socket, next) => {
  const token = socket.handshake.auth?.token;
  if (!token) return next(new Error('未登录'));
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    socket.userId = decoded.userId;
    socket.nid = decoded.nid;
    socket.username = decoded.username;
    next();
  } catch (e) {
    next(new Error('登录已过期'));
  }
});

io.on('connection', (socket) => {
  const userId = socket.userId;
  console.log(`[Socket] 用户上线: ${socket.username} (${userId})`);
  onlineUsers.set(userId, socket.id);

  // 广播上线状态给好友
  broadcastStatus(userId, true);

  // 发送私聊消息
  socket.on('send_message', (data, callback) => {
    const { receiverId, content, msgType } = data;
    if (!receiverId || !content) {
      if (callback) callback({ error: '参数缺失' });
      return;
    }

    const msgId = genId();
    const now = Date.now();
    db.prepare(`
      INSERT INTO messages (id, sender_id, receiver_id, content, msg_type, created_at, read)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(msgId, userId, receiverId, content, msgType || 'text', now, 0);

    const msgData = {
      id: msgId,
      senderId: userId,
      receiverId: receiverId,
      content,
      msgType: msgType || 'text',
      createdAt: now,
      read: 0
    };

    // 发给接收者
    const receiverSocket = onlineUsers.get(receiverId);
    if (receiverSocket) {
      io.to(receiverSocket).emit('new_message', msgData);
      // 标记已读
      db.prepare('UPDATE messages SET read = 1 WHERE id = ?').run(msgId);
      msgData.read = 1;
    }

    // 回执给发送者
    if (callback) callback({ ok: true, message: msgData });

    // 如果接收者不在线，消息已存数据库，上线后通过 API 拉取
  });

  // 已读回执
  socket.on('mark_read', (data) => {
    const { otherId } = data;
    if (!otherId) return;
    db.prepare('UPDATE messages SET read = 1 WHERE sender_id = ? AND receiver_id = ? AND read = 0')
      .run(otherId, userId);
  });

  // 正在输入
  socket.on('typing', (data) => {
    const { receiverId } = data;
    const receiverSocket = onlineUsers.get(receiverId);
    if (receiverSocket) {
      io.to(receiverSocket).emit('typing', { from: userId, username: socket.username });
    }
  });

  // 停止输入
  socket.on('stop_typing', (data) => {
    const { receiverId } = data;
    const receiverSocket = onlineUsers.get(receiverId);
    if (receiverSocket) {
      io.to(receiverSocket).emit('stop_typing', { from: userId });
    }
  });

  // 断开连接
  socket.on('disconnect', () => {
    console.log(`[Socket] 用户离线: ${socket.username} (${userId})`);
    onlineUsers.delete(userId);
    setTimeout(() => broadcastStatus(userId, false), 3000);
  });
});

// 向好友广播上线/离线状态
function broadcastStatus(userId, online) {
  const friends = db.prepare('SELECT friend_id FROM friendships WHERE user_id = ?').all(userId);
  for (const f of friends) {
    const socketId = onlineUsers.get(f.friend_id);
    if (socketId) {
      io.to(socketId).emit('friend_status', { userId, online });
    }
  }
}

// 查询用户是否在线的 API
app.get('/api/online/:userId', auth, (req, res) => {
  const online = onlineUsers.has(req.params.userId);
  apiOk(res, { online });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`\n========================================`);
  console.log(`  星辰Chat 服务器已启动`);
  console.log(`  地址: http://localhost:${PORT}`);
  console.log(`  API:  http://localhost:${PORT}/api/health`);
  console.log(`========================================\n`);
});
