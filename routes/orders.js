const express = require('express');
const router = express.Router();
const db = require('../db/init');
const { authMiddleware } = require('../middleware/auth');

// Tạo đơn hàng
router.post('/', authMiddleware, (req, res) => {
  const { payment_method, shipping_name, shipping_phone, shipping_address, note, items } = req.body;

  if (!['cod', 'deposit', 'qr'].includes(payment_method)) {
    return res.status(400).json({ error: 'Phương thức thanh toán không hợp lệ' });
  }
  if (!shipping_name || !shipping_phone || !shipping_address) {
    return res.status(400).json({ error: 'Thiếu thông tin giao hàng' });
  }

  // Tính tổng từ giỏ hàng hoặc items truyền lên
  let orderItems = items;
  if (!orderItems) {
    const cartItems = db.prepare(`
      SELECT ci.quantity, ci.color, p.id as product_id, p.name, p.price, p.stock
      FROM cart_items ci JOIN products p ON ci.product_id = p.id
      WHERE ci.user_id = ?
    `).all(req.user.id);
    if (cartItems.length === 0) return res.status(400).json({ error: 'Giỏ hàng trống' });
    orderItems = cartItems;
  }

  // Kiểm tra tồn kho
  for (const item of orderItems) {
    const p = db.prepare('SELECT stock FROM products WHERE id=?').get(item.product_id);
    if (!p || p.stock < item.quantity) {
      return res.status(400).json({ error: `Sản phẩm "${item.name}" không đủ hàng` });
    }
  }

  const total = orderItems.reduce((s, i) => s + i.price * i.quantity, 0);

  // Tính cọc
  const depositPct = parseFloat(db.prepare("SELECT value FROM admin_settings WHERE key='deposit_percent'").get()?.value || 30);
  const depositDays = parseInt(db.prepare("SELECT value FROM admin_settings WHERE key='deposit_days'").get()?.value || 14);
  const depositAmount = payment_method === 'deposit' ? total * depositPct / 100 : 0;
  const depositExpires = payment_method === 'deposit' ? new Date(Date.now() + depositDays * 86400000).toISOString() : null;

  const qrRef = payment_method === 'qr' ? `QR${Date.now()}${req.user.id}` : null;

  const result = db.prepare(`
    INSERT INTO orders (user_id, items, total, payment_method, payment_status, deposit_amount, deposit_expires, shipping_name, shipping_phone, shipping_address, note, qr_ref)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    req.user.id,
    JSON.stringify(orderItems),
    total,
    payment_method,
    payment_method === 'cod' ? 'pending' : 'waiting',
    depositAmount, depositExpires,
    shipping_name, shipping_phone, shipping_address, note || '',
    qrRef
  );

  // Trừ tồn kho + xóa giỏ
  orderItems.forEach(item => {
    db.prepare('UPDATE products SET stock = stock - ? WHERE id = ?').run(item.quantity, item.product_id);
  });
  db.prepare('DELETE FROM cart_items WHERE user_id=?').run(req.user.id);

  const order = db.prepare('SELECT * FROM orders WHERE id=?').get(result.lastInsertRowid);
  order.items = JSON.parse(order.items);

  // Thêm thông tin QR nếu thanh toán QR
  if (payment_method === 'qr') {
    const momoQr = db.prepare("SELECT value FROM admin_settings WHERE key='momo_qr'").get()?.value || '';
    const zalopayQr = db.prepare("SELECT value FROM admin_settings WHERE key='zalopay_qr'").get()?.value || '';
    order.qr_images = { momo: momoQr, zalopay: zalopayQr };
    order.payment_note = `Nội dung chuyển khoản: ${qrRef} - Số tiền: ${total.toLocaleString('vi-VN')}₫`;
  }

  if (payment_method === 'deposit') {
    order.deposit_note = `Vui lòng đặt cọc ${depositAmount.toLocaleString('vi-VN')}₫ (${depositPct}%). Máy được giữ tối đa ${depositDays} ngày.`;
  }

  res.json(order);
});

// Lấy đơn hàng của user
router.get('/my', authMiddleware, (req, res) => {
  const orders = db.prepare('SELECT * FROM orders WHERE user_id=? ORDER BY created_at DESC').all(req.user.id);
  orders.forEach(o => { o.items = JSON.parse(o.items || '[]'); });
  res.json(orders);
});

// Chi tiết đơn
router.get('/:id', authMiddleware, (req, res) => {
  const order = db.prepare('SELECT * FROM orders WHERE id=? AND user_id=?').get(req.params.id, req.user.id);
  if (!order) return res.status(404).json({ error: 'Không tìm thấy đơn hàng' });
  order.items = JSON.parse(order.items || '[]');
  res.json(order);
});

module.exports = router;
