const express = require('express');
const router = express.Router();
const db = require('../db/init');
const { authMiddleware } = require('../middleware/auth');

// Lấy danh sách sản phẩm + tìm kiếm + filter
router.get('/', (req, res) => {
  const { q, condition, category, model, min_price, max_price, sort, limit = 20, offset = 0 } = req.query;

  // Ghi lịch sử tìm kiếm nếu có user
  const token = req.headers.authorization?.split(' ')[1];
  let userId = null;
  try {
    const jwt = require('jsonwebtoken');
    const { SECRET } = require('../middleware/auth');
    userId = jwt.verify(token, SECRET).id;
  } catch {}

  if (q || condition || category) {
    db.prepare('INSERT INTO search_history (user_id, query, filter_condition, price_min, price_max) VALUES (?,?,?,?,?)').run(userId, q || '', condition || '', min_price || null, max_price || null);
  }

  let sql = 'SELECT * FROM products WHERE is_active = 1';
  const params = [];

  if (q) {
    sql += ' AND (name LIKE ? OR description LIKE ?)';
    params.push(`%${q}%`, `%${q}%`);
  }
  if (condition && condition !== 'all') {
    sql += ' AND condition = ?';
    params.push(condition);
  }
  if (category && category !== 'all') {
    sql += ' AND category = ?';
    params.push(category);
  }
  if (model) {
    sql += ' AND name LIKE ?';
    params.push(`%iPhone ${model}%`);
  }
  if (min_price) { sql += ' AND price >= ?'; params.push(parseFloat(min_price)); }
  if (max_price) { sql += ' AND price <= ?'; params.push(parseFloat(max_price)); }

  if (sort === 'price_asc') sql += ' ORDER BY price ASC';
  else if (sort === 'price_desc') sql += ' ORDER BY price DESC';
  else if (sort === 'newest') sql += ' ORDER BY created_at DESC';
  else sql += ' ORDER BY created_at DESC';

  sql += ' LIMIT ? OFFSET ?';
  params.push(parseInt(limit), parseInt(offset));

  const products = db.prepare(sql).all(...params);
  const total = db.prepare('SELECT COUNT(*) as c FROM products WHERE is_active=1').get().c;

  products.forEach(p => {
    p.images = JSON.parse(p.images || '[]');
    p.colors = JSON.parse(p.colors || '[]');
    p.specs = JSON.parse(p.specs || '{}');
  });

  res.json({ products, total });
});

// Lấy sản phẩm đơn
router.get('/:id', (req, res) => {
  const p = db.prepare('SELECT * FROM products WHERE id = ? AND is_active=1').get(req.params.id);
  if (!p) return res.status(404).json({ error: 'Không tìm thấy sản phẩm' });
  p.images = JSON.parse(p.images || '[]');
  p.colors = JSON.parse(p.colors || '[]');
  p.specs = JSON.parse(p.specs || '{}');

  // Ghi lịch sử xem
  const token = req.headers.authorization?.split(' ')[1];
  try {
    const jwt = require('jsonwebtoken');
    const { SECRET } = require('../middleware/auth');
    const userId = jwt.verify(token, SECRET).id;
    db.prepare('INSERT INTO search_history (user_id, product_id, query) VALUES (?,?,?)').run(userId, p.id, p.name);
  } catch {}

  res.json(p);
});

// Gợi ý sản phẩm dựa theo lịch sử + giỏ hàng
router.get('/recommend/personal', authMiddleware, (req, res) => {
  const userId = req.user.id;

  // Lấy lịch sử tìm kiếm
  const history = db.prepare('SELECT query, product_id FROM search_history WHERE user_id = ? ORDER BY created_at DESC LIMIT 20').all(userId);

  // Lấy sản phẩm trong giỏ
  const cart = db.prepare(`
    SELECT p.price, p.condition FROM cart_items ci
    JOIN products p ON ci.product_id = p.id
    WHERE ci.user_id = ?`).all(userId);

  // Tính giá trung bình giỏ hàng để gợi ý cùng tầm giá
  const avgPrice = cart.length > 0 ? cart.reduce((s, c) => s + c.price, 0) / cart.length : null;

  // Gợi ý: cùng tầm giá ±30% hoặc dựa theo từ khóa đã tìm
  let recommended = [];

  if (history.length > 0) {
    const keywords = history.filter(h => h.query).map(h => h.query).slice(0, 5);
    const viewedIds = history.filter(h => h.product_id).map(h => h.product_id);

    // Tìm theo keyword lịch sử
    for (const kw of keywords) {
      const found = db.prepare('SELECT * FROM products WHERE is_active=1 AND (name LIKE ? OR description LIKE ?) LIMIT 3').all(`%${kw}%`, `%${kw}%`);
      recommended.push(...found);
    }

    // Loại bỏ trùng lặp
    recommended = recommended.filter((p, i, arr) => arr.findIndex(x => x.id === p.id) === i);
  }

  // Nếu chưa đủ 6, fill bằng sản phẩm phổ biến + tầm giá
  if (recommended.length < 6) {
    let sql = 'SELECT * FROM products WHERE is_active=1';
    const params = [];
    if (avgPrice) {
      sql += ' AND price BETWEEN ? AND ?';
      params.push(avgPrice * 0.7, avgPrice * 1.3);
    }
    sql += ' ORDER BY RANDOM() LIMIT 6';
    const fill = db.prepare(sql).all(...params);
    recommended.push(...fill);
    recommended = recommended.filter((p, i, arr) => arr.findIndex(x => x.id === p.id) === i).slice(0, 8);
  }

  recommended.forEach(p => {
    p.images = JSON.parse(p.images || '[]');
    p.colors = JSON.parse(p.colors || '[]');
    p.specs = JSON.parse(p.specs || '{}');
  });

  res.json(recommended);
});

module.exports = router;
