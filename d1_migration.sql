-- Cloudflare D1 数据库迁移脚本
-- 为留言板添加回复功能

-- 1. 添加parent_id字段用于回复（D1 SQLite语法）
ALTER TABLE messages ADD COLUMN parent_id INTEGER;

-- 2. 添加reply_count字段用于统计回复数量
ALTER TABLE messages ADD COLUMN reply_count INTEGER DEFAULT 0;

-- 3. 创建索引以提高查询性能
CREATE INDEX IF NOT EXISTS idx_parent_id ON messages(parent_id);
CREATE INDEX IF NOT EXISTS idx_thread_order ON messages(parent_id, created_at);

-- 4. 注意：D1 SQLite不支持外键约束和触发器
-- 需要在应用层面实现引用完整性和计数更新

-- 5. 更新现有数据的reply_count（如果有的话）
UPDATE messages 
SET reply_count = (
  SELECT COUNT(*) 
  FROM messages AS replies 
  WHERE replies.parent_id = messages.id
)
WHERE parent_id IS NULL;