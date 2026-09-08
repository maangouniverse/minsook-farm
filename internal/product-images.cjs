const crypto = require('node:crypto');
module.exports = function registerProductImages(app, db, authenticateAdmin) {
  const run = (sql, args = []) => new Promise((ok, fail) => db.run(sql, args, error => error ? fail(error) : ok()));
  const get = (sql, args) => new Promise((ok, fail) => db.get(sql, args, (error, row) => error ? fail(error) : ok(row)));
  let ready;
  const ensure = () => ready ||= run('CREATE TABLE IF NOT EXISTS product_images (id TEXT PRIMARY KEY, mime TEXT NOT NULL, image_base64 TEXT NOT NULL)').catch(error => { ready = null; throw error; });
  app.post('/api/admin/product-images', authenticateAdmin, async (req, res) => {
    const match = typeof req.body.dataUrl === 'string' && req.body.dataUrl.match(/^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/);
    if (!match) return res.status(400).json({ error: 'JPG, PNG, WebP 사진만 저장할 수 있습니다.' });
    const bytes = Buffer.from(match[2], 'base64');
    if (!bytes.length || bytes.length > 900000) return res.status(413).json({ error: '사진이 너무 큽니다. 작은 사진으로 다시 선택해 주세요.' });
    const valid = match[1] === 'image/jpeg' ? bytes[0] === 255 && bytes[1] === 216 : match[1] === 'image/png' ? bytes.subarray(0,8).toString('hex') === '89504e470d0a1a0a' : bytes.toString('ascii',0,4) === 'RIFF' && bytes.toString('ascii',8,12) === 'WEBP';
    if (!valid) return res.status(400).json({ error: '사진 파일을 읽을 수 없습니다. 다른 사진을 선택해 주세요.' });
    try {
      await ensure();
      const id = crypto.createHash('sha256').update(bytes).digest('hex');
      await run('INSERT INTO product_images (id, mime, image_base64) VALUES (?, ?, ?) ON CONFLICT (id) DO NOTHING', [id, match[1], match[2]]);
      res.status(201).json({ success: true, url: `/api/product-images/${id}` });
    } catch { res.status(503).json({ error: '사진을 서버에 저장하지 못했습니다. 잠시 후 다시 시도해 주세요.' }); }
  });
  app.get('/api/product-images/:id', async (req, res) => {
    if (!/^[a-f0-9]{64}$/.test(req.params.id)) return res.sendStatus(404);
    try {
      await ensure();
      const row = await get('SELECT mime, image_base64 FROM product_images WHERE id = ?', [req.params.id]);
      if (!row) return res.sendStatus(404);
      res.set({ 'Content-Type': row.mime, 'Cache-Control': 'public, max-age=31536000, immutable', 'X-Content-Type-Options': 'nosniff' }).send(Buffer.from(row.image_base64, 'base64'));
    } catch { res.sendStatus(503); }
  });
};
