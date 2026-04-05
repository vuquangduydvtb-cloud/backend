const express = require('express');
const router = express.Router();
const db = require('../db/init');

router.get('/', (req, res) => {
  const banners = db.prepare('SELECT * FROM banners WHERE is_active=1 ORDER BY order_num ASC').all();
  res.json(banners);
});

router.get('/settings', (req, res) => {
  const settings = db.prepare('SELECT * FROM admin_settings').all();
  const obj = {};
  settings.forEach(s => { obj[s.key] = s.value; });
  res.json(obj);
});

module.exports = router;
