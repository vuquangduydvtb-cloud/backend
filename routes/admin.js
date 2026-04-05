const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const db = require('../db/init');
const { adminMiddleware } = require('../middleware/auth');

// Upload config
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(__dirname, '../uploads');
    if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, Date.now() + '-' + Math.random().toString(36).substr(2, 9) + ext);
  }
});
const upload = multer({ storage, limits: { fileSize: 5 * 1024 * 1024 } });

// === THỐNG KÊ ===
router.get('/stats', adminMiddleware, (req, res) => {
  const totalOrders = db.prepare('SELECT COUNT(*) as c FROM orders').get().c;
  const totalRevenue = db.prepare("SELECT COALESCE(SUM(total),0) as t FROM orders WHERE status NOT IN ('cancelled')").get().t;
  const totalUsers = db.prepare('SELECT COUNT(*) as c FROM users WHERE role=?').get('user').c;
  const totalProducts = db.prepare('SELECT COUNT(*) as c FROM products WHERE is_active=1').get().c;
  const pendingOrders = db.prepare("SELECT COUNT(*) as c FROM orders WHERE status='pending'").get().c;
  const lowStock = db.prepare('SELECT COUNT(*) as c FROM products WHERE stock <= 3 AND is_active=1').get().c;

  // Doanh thu 7 ngày gần nhất
  const revenueByDay = db.prepare(`
    SELECT DATE(created_at) as date, SUM(total) as revenue, COUNT(*) as orders
    FROM orders WHERE created_at >= DATE('now', '-7 days') AND status != 'cancelled'
    GROUP BY DATE(created_at) ORDER BY date ASC
  `).all();

  // Đơn hàng gần đây
  const recentOrders = db.prepare(`
    SELECT o.*, u.name as user_name, u.email
    FROM orders o JOIN users u ON o.user_id = u.id
    ORDER BY o.created_at DESC LIMIT 10
  `).all();
  recentOrders.forEach(o => { o.items = JSON.parse(o.items || '[]'); });

  // Sản phẩm bán chạy
  const topProducts = db.prepare(`
    SELECT p.name, SUM(json_extract(oi.value, '$.quantity')) as sold
    FROM orders o, json_each(o.items) oi
    JOIN products p ON json_extract(oi.value, '$.product_id') = p.id
    WHERE o.status != 'cancelled'
    GROUP BY p.id ORDER BY sold DESC LIMIT 5
  `).all();

  res.json({ totalOrders, totalRevenue, totalUsers, totalProducts, pendingOrders, lowStock, revenueByDay, recentOrders, topProducts });
});

// === SẢN PHẨM ===
router.get('/products', adminMiddleware, (req, res) => {
  const { q, page = 1, limit = 20 } = req.query;
  let sql = 'SELECT * FROM products WHERE 1=1';
  const params = [];
  if (q) { sql += ' AND name LIKE ?'; params.push(`%${q}%`); }
  sql += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
  params.push(parseInt(limit), (parseInt(page) - 1) * parseInt(limit));
  const products = db.prepare(sql).all(...params);
  const total = db.prepare('SELECT COUNT(*) as c FROM products').get().c;
  products.forEach(p => {
    p.images = JSON.parse(p.images || '[]');
    p.colors = JSON.parse(p.colors || '[]');
    p.specs = JSON.parse(p.specs || '{}');
  });
  res.json({ products, total });
});

router.post('/products', adminMiddleware, upload.array('images', 5), (req, res) => {
  const { name, description, price, original_price, stock, condition, category, colors, specs } = req.body;
  if (!name || !price) return res.status(400).json({ error: 'Thiếu tên hoặc giá' });

  const images = req.files?.map(f => `/uploads/${f.filename}`) || [];
  const result = db.prepare(`
    INSERT INTO products (name, description, price, original_price, stock, condition, category, images, colors, specs)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(name, description || '', parseFloat(price), parseFloat(original_price || price),
    parseInt(stock || 0), condition || 'new', category || 'iphone',
    JSON.stringify(images), colors || '[]', specs || '{}');
  res.json({ id: result.lastInsertRowid, success: true });
});

router.put('/products/:id', adminMiddleware, upload.array('images', 5), (req, res) => {
  const { name, description, price, original_price, stock, condition, category, colors, specs, is_active, keep_images } = req.body;
  const existing = db.prepare('SELECT * FROM products WHERE id=?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Không tìm thấy sản phẩm' });

  let images = JSON.parse(keep_images || existing.images || '[]');
  if (req.files?.length > 0) {
    images = [...images, ...req.files.map(f => `/uploads/${f.filename}`)];
  }

  db.prepare(`
    UPDATE products SET name=?, description=?, price=?, original_price=?, stock=?, condition=?, category=?, images=?, colors=?, specs=?, is_active=?
    WHERE id=?
  `).run(name || existing.name, description ?? existing.description,
    parseFloat(price || existing.price), parseFloat(original_price || existing.original_price),
    parseInt(stock ?? existing.stock), condition || existing.condition,
    category || existing.category, JSON.stringify(images),
    colors || existing.colors, specs || existing.specs,
    is_active !== undefined ? parseInt(is_active) : existing.is_active,
    req.params.id);
  res.json({ success: true });
});

router.delete('/products/:id', adminMiddleware, (req, res) => {
  db.prepare('UPDATE products SET is_active=0 WHERE id=?').run(req.params.id);
  res.json({ success: true });
});

// === BANNER ===
router.get('/banners', adminMiddleware, (req, res) => {
  res.json(db.prepare('SELECT * FROM banners ORDER BY order_num ASC').all());
});

router.post('/banners', adminMiddleware, upload.single('image'), (req, res) => {
  const { title, subtitle, link, order_num } = req.body;
  const image = req.file ? `/uploads/${req.file.filename}` : '';
  db.prepare('INSERT INTO banners (title, subtitle, image, link, order_num) VALUES (?,?,?,?,?)').run(title || '', subtitle || '', image, link || '', parseInt(order_num || 0));
  res.json({ success: true });
});

router.put('/banners/:id', adminMiddleware, upload.single('image'), (req, res) => {
  const { title, subtitle, link, order_num, is_active } = req.body;
  const existing = db.prepare('SELECT * FROM banners WHERE id=?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Không tìm thấy banner' });
  const image = req.file ? `/uploads/${req.file.filename}` : existing.image;
  db.prepare('UPDATE banners SET title=?, subtitle=?, image=?, link=?, order_num=?, is_active=? WHERE id=?').run(
    title ?? existing.title, subtitle ?? existing.subtitle, image, link ?? existing.link,
    parseInt(order_num ?? existing.order_num), is_active !== undefined ? parseInt(is_active) : existing.is_active,
    req.params.id);
  res.json({ success: true });
});

router.delete('/banners/:id', adminMiddleware, (req, res) => {
  db.prepare('DELETE FROM banners WHERE id=?').run(req.params.id);
  res.json({ success: true });
});

// === ĐƠN HÀNG (admin) ===
router.get('/orders', adminMiddleware, (req, res) => {
  const { status, page = 1, limit = 20 } = req.query;
  let sql = 'SELECT o.*, u.name as user_name, u.email, u.phone as user_phone FROM orders o JOIN users u ON o.user_id=u.id WHERE 1=1';
  const params = [];
  if (status) { sql += ' AND o.status=?'; params.push(status); }
  sql += ' ORDER BY o.created_at DESC LIMIT ? OFFSET ?';
  params.push(parseInt(limit), (parseInt(page) - 1) * parseInt(limit));
  const orders = db.prepare(sql).all(...params);
  orders.forEach(o => { o.items = JSON.parse(o.items || '[]'); });
  const total = db.prepare('SELECT COUNT(*) as c FROM orders').get().c;
  res.json({ orders, total });
});

router.put('/orders/:id/status', adminMiddleware, (req, res) => {
  const { status, payment_status } = req.body;
  const updates = [];
  const params = [];
  if (status) { updates.push('status=?'); params.push(status); }
  if (payment_status) { updates.push('payment_status=?'); params.push(payment_status); }
  updates.push('updated_at=CURRENT_TIMESTAMP');
  params.push(req.params.id);
  db.prepare(`UPDATE orders SET ${updates.join(',')} WHERE id=?`).run(...params);
  res.json({ success: true });
});

// === USERS (admin) ===
router.get('/users', adminMiddleware, (req, res) => {
  const users = db.prepare('SELECT id, name, email, phone, role, created_at FROM users ORDER BY created_at DESC').all();
  res.json(users);
});

// === SETTINGS ===
router.get('/settings', adminMiddleware, (req, res) => {
  const settings = db.prepare('SELECT * FROM admin_settings').all();
  const obj = {};
  settings.forEach(s => { obj[s.key] = s.value; });
  res.json(obj);
});

router.put('/settings', adminMiddleware, upload.fields([
  { name: 'momo_qr_file', maxCount: 1 },
  { name: 'zalopay_qr_file', maxCount: 1 },
  { name: 'bank_qr_file', maxCount: 1 }
]), (req, res) => {
  const allowed = ['store_phone', 'store_zalo', 'store_email', 'deposit_percent', 'deposit_days', 'momo_qr', 'zalopay_qr', 'bank_qr'];
  const upd = db.prepare('INSERT OR REPLACE INTO admin_settings (key, value) VALUES (?, ?)');
  const batch = db.transaction((data) => { data.forEach(d => upd.run(d.key, d.value)); });

  const updates = [];
  allowed.forEach(k => {
    if (req.body[k] !== undefined) updates.push({ key: k, value: req.body[k] });
  });

  ['momo_qr_file', 'zalopay_qr_file', 'bank_qr_file'].forEach(field => {
    if (req.files?.[field]?.[0]) {
      const key = field.replace('_file', '');
      updates.push({ key, value: `/uploads/${req.files[field][0].filename}` });
    }
  });

  batch(updates);
  res.json({ success: true });
});

module.exports = router;
