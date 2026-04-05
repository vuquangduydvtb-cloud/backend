const express = require('express');
const router = express.Router();
const db = require('../db/init');
const { authMiddleware } = require('../middleware/auth');

// Lấy giỏ hàng
router.get('/', authMiddleware, (req, res) => {
  const items = db.prepare(`
    SELECT ci.id, ci.quantity, ci.color, p.id as product_id, p.name, p.price, p.images, p.stock, p.condition
    FROM cart_items ci
    JOIN products p ON ci.product_id = p.id
    WHERE ci.user_id = ?
  `).all(req.user.id);

  items.forEach(i => { i.images = JSON.parse(i.images || '[]'); });
  const total = items.reduce((s, i) => s + i.price * i.quantity, 0);
  res.json({ items, total, count: items.length });
});

// Thêm vào giỏ
router.post('/', authMiddleware, (req, res) => {
  const { product_id, quantity = 1, color = '' } = req.body;
  const product = db.prepare('SELECT * FROM products WHERE id=? AND is_active=1').get(product_id);
  if (!product) return res.status(404).json({ error: 'Sản phẩm không tồn tại' });

  const existing = db.prepare('SELECT * FROM cart_items WHERE user_id=? AND product_id=? AND color=?').get(req.user.id, product_id, color);
  if (existing) {
    db.prepare('UPDATE cart_items SET quantity=quantity+? WHERE id=?').run(quantity, existing.id);
  } else {
    db.prepare('INSERT INTO cart_items (user_id, product_id, quantity, color) VALUES (?,?,?,?)').run(req.user.id, product_id, quantity, color);
  }

  // Ghi lịch sử giỏ hàng để cải thiện gợi ý
  db.prepare('INSERT INTO search_history (user_id, product_id, query) VALUES (?,?,?)').run(req.user.id, product_id, 'cart:' + product.name);

  res.json({ success: true });
});

// Cập nhật số lượng
router.put('/:id', authMiddleware, (req, res) => {
  const { quantity } = req.body;
  if (quantity < 1) {
    db.prepare('DELETE FROM cart_items WHERE id=? AND user_id=?').run(req.params.id, req.user.id);
  } else {
    db.prepare('UPDATE cart_items SET quantity=? WHERE id=? AND user_id=?').run(quantity, req.params.id, req.user.id);
  }
  res.json({ success: true });
});

// Xóa khỏi giỏ
router.delete('/:id', authMiddleware, (req, res) => {
  db.prepare('DELETE FROM cart_items WHERE id=? AND user_id=?').run(req.params.id, req.user.id);
  res.json({ success: true });
});

// Xóa toàn bộ giỏ
router.delete('/', authMiddleware, (req, res) => {
  db.prepare('DELETE FROM cart_items WHERE user_id=?').run(req.user.id);
  res.json({ success: true });
});

module.exports = router;
