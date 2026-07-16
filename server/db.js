/**
 * 数据库初始化 - SQLite
 * 开发环境用 SQLite（零配置），部署时切换到 MongoDB Atlas
 */
const Database = require('better-sqlite3');
const path = require('path');

const DB_PATH = path.join(__dirname, '..', 'data', 'xingchen.db');
const fs = require('fs');
const dir = path.dirname(DB_PATH);
if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');

// === 建表 ===
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    nid TEXT UNIQUE NOT NULL,
    username TEXT NOT NULL,
    password TEXT NOT NULL,
    avatar_color TEXT DEFAULT '#3b82f6',
    avatar_b64 TEXT,
    bio TEXT DEFAULT '',
    created_at INTEGER DEFAULT (strftime('%s','now') * 1000),
    last_active INTEGER DEFAULT (strftime('%s','now') * 1000)
  );

  CREATE TABLE IF NOT EXISTS friendships (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    friend_id TEXT NOT NULL,
    created_at INTEGER DEFAULT (strftime('%s','now') * 1000),
    UNIQUE(user_id, friend_id)
  );

  CREATE TABLE IF NOT EXISTS friend_requests (
    id TEXT PRIMARY KEY,
    from_id TEXT NOT NULL,
    to_id TEXT NOT NULL,
    status TEXT DEFAULT 'pending',
    created_at INTEGER DEFAULT (strftime('%s','now') * 1000),
    UNIQUE(from_id, to_id)
  );

  CREATE TABLE IF NOT EXISTS messages (
    id TEXT PRIMARY KEY,
    sender_id TEXT NOT NULL,
    receiver_id TEXT NOT NULL,
    content TEXT NOT NULL,
    msg_type TEXT DEFAULT 'text',
    created_at INTEGER DEFAULT (strftime('%s','now') * 1000),
    read INTEGER DEFAULT 0
  );

  CREATE INDEX IF NOT EXISTS idx_messages_receiver ON messages(receiver_id, read);
  CREATE INDEX IF NOT EXISTS idx_messages_pair ON messages(sender_id, receiver_id);
  CREATE INDEX IF NOT EXISTS idx_friendships_user ON friendships(user_id);
`);

module.exports = db;
