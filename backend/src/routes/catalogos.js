const express = require('express');
const { body, param, validationResult } = require('express-validator');
const { pool } = require('../db');
const { authMiddleware, requireRol, empresaMiddleware } = require('../middleware/auth');

const router = express.Router();
router.use(authMiddleware, empresaMiddleware);

const validate = (req, res, next) => {
  const e = validationResult(req);
  if (!e.isEmpty()) return res.status(400).json({ ok: false, errores: e.array() });
  next();
};

// Helper: resuelve empresa_id efectiva para queries
// superadmin puede pasar empresa_id en query, si no viene usa null (verá todo)
function resolveEmpresaId(req) {
  if (req.usuario.rol === 'superadmin') {
    const eid = req.query.empresa_id || req.body?.empresa_id;
    return eid ? parseInt(eid) : null;
  }
  return req.usuario.empresa_id;
}

// ── REGIONES ──────────────────────────────────────────────────────────────────
router.get('/regiones', async (req, res) => {
  try {
    const eid = resolveEmpresaId(req);
    let q = 'SELECT * FROM regiones WHERE activo=1';
    const p = [];
    if (eid) { q += ' AND empresa_id=?'; p.push(eid); }
    q += ' ORDER BY nombre';
    const [rows] = await pool.query(q, p);
    res.json({ ok: true, datos: rows });
  } catch { res.status(500).json({ ok: false, mensaje: 'Error interno' }); }
});
router.post('/regiones', requireRol('superadmin','admin'), [body('nombre').trim().notEmpty()], validate, async (req, res) => {
  const eid = resolveEmpresaId(req) || req.empresa_id;
  const [r] = await pool.query('INSERT INTO regiones (empresa_id, nombre) VALUES (?,?)', [eid, req.body.nombre]);
  res.status(201).json({ ok: true, id: r.insertId });
});
router.put('/regiones/:id', requireRol('superadmin','admin'), [param('id').isInt()], validate, async (req, res) => {
  await pool.query('UPDATE regiones SET nombre=?, activo=? WHERE id=?',
    [req.body.nombre, req.body.activo ?? 1, req.params.id]);
  res.json({ ok: true });
});
router.delete('/regiones/:id', requireRol('superadmin','admin'), async (req, res) => {
  await pool.query('UPDATE regiones SET activo=0 WHERE id=?', [req.params.id]);
  res.json({ ok: true });
});

// ── CIUDADES ──────────────────────────────────────────────────────────────────
router.get('/ciudades', async (req, res) => {
  try {
    const eid = resolveEmpresaId(req);
    let q = `SELECT c.*, r.nombre AS region_nombre, r.empresa_id
             FROM ciudades c JOIN regiones r ON r.id = c.region_id
             WHERE c.activo=1`;
    const p = [];
    if (eid) { q += ' AND r.empresa_id=?'; p.push(eid); }
    q += ' ORDER BY r.nombre, c.nombre';
    const [rows] = await pool.query(q, p);
    res.json({ ok: true, datos: rows });
  } catch (err) { console.error(err); res.status(500).json({ ok: false, mensaje: 'Error interno' }); }
});
router.get('/ciudades/por-region/:region_id', async (req, res) => {
  const [rows] = await pool.query(
    'SELECT * FROM ciudades WHERE region_id=? AND activo=1 ORDER BY nombre', [req.params.region_id]);
  res.json({ ok: true, datos: rows });
});

// ── ALMACENES ─────────────────────────────────────────────────────────────────
router.get('/almacenes', async (req, res) => {
  try {
    const eid = resolveEmpresaId(req);
    let q = `SELECT a.*, c.nombre AS ciudad_nombre, r.nombre AS region_nombre, r.empresa_id
             FROM almacenes a
             JOIN ciudades c ON c.id = a.ciudad_id
             JOIN regiones r ON r.id = c.region_id
             WHERE a.activo=1`;
    const p = [];
    if (eid) { q += ' AND r.empresa_id=?'; p.push(eid); }
    q += ' ORDER BY r.nombre, c.nombre, a.nombre';
    const [rows] = await pool.query(q, p);
    res.json({ ok: true, datos: rows });
  } catch (err) { console.error(err); res.status(500).json({ ok: false, mensaje: 'Error interno' }); }
});
router.get('/almacenes/:id', async (req, res) => {
  const [rows] = await pool.query(
    `SELECT a.*, c.nombre AS ciudad_nombre FROM almacenes a
     JOIN ciudades c ON c.id = a.ciudad_id WHERE a.id=?`, [req.params.id]);
  if (!rows.length) return res.status(404).json({ ok: false, mensaje: 'No encontrado' });
  res.json({ ok: true, datos: rows[0] });
});
router.post('/almacenes', requireRol('superadmin','admin'), [
  body('nombre').trim().notEmpty(),
  body('ciudad_id').isInt({ min: 1 }),
], validate, async (req, res) => {
  const { nombre, ciudad_id, direccion } = req.body;
  const [r] = await pool.query(
    'INSERT INTO almacenes (ciudad_id, nombre, direccion) VALUES (?,?,?)',
    [ciudad_id, nombre, direccion || null]);
  res.status(201).json({ ok: true, id: r.insertId });
});
router.put('/almacenes/:id', requireRol('superadmin','admin'), [param('id').isInt()], validate, async (req, res) => {
  const { nombre, ciudad_id, direccion, activo } = req.body;
  await pool.query('UPDATE almacenes SET nombre=?, ciudad_id=?, direccion=?, activo=? WHERE id=?',
    [nombre, ciudad_id, direccion || null, activo ?? 1, req.params.id]);
  res.json({ ok: true });
});
router.delete('/almacenes/:id', requireRol('superadmin','admin'), async (req, res) => {
  await pool.query('UPDATE almacenes SET activo=0 WHERE id=?', [req.params.id]);
  res.json({ ok: true });
});

// ── CATEGORIAS ────────────────────────────────────────────────────────────────
router.get('/categorias', async (req, res) => {
  try {
    const eid = resolveEmpresaId(req);
    let q = 'SELECT * FROM categorias WHERE activo=1';
    const p = [];
    if (eid) { q += ' AND empresa_id=?'; p.push(eid); }
    q += ' ORDER BY nombre';
    const [rows] = await pool.query(q, p);
    res.json({ ok: true, datos: rows });
  } catch { res.status(500).json({ ok: false, mensaje: 'Error interno' }); }
});
router.post('/categorias', requireRol('superadmin','admin'), [body('nombre').trim().notEmpty()], validate, async (req, res) => {
  const eid = resolveEmpresaId(req) || req.empresa_id;
  const [r] = await pool.query(
    'INSERT INTO categorias (empresa_id, nombre, descripcion) VALUES (?,?,?)',
    [eid, req.body.nombre, req.body.descripcion || null]);
  res.status(201).json({ ok: true, id: r.insertId });
});
router.put('/categorias/:id', requireRol('superadmin','admin'), [param('id').isInt()], validate, async (req, res) => {
  await pool.query('UPDATE categorias SET nombre=?, descripcion=?, activo=? WHERE id=?',
    [req.body.nombre, req.body.descripcion || null, req.body.activo ?? 1, req.params.id]);
  res.json({ ok: true });
});
router.delete('/categorias/:id', requireRol('superadmin','admin'), async (req, res) => {
  await pool.query('UPDATE categorias SET activo=0 WHERE id=?', [req.params.id]);
  res.json({ ok: true });
});

// ── TIPOS DE MERCADERIA ───────────────────────────────────────────────────────
router.get('/tipos-mercaderia', async (req, res) => {
  try {
    const eid = resolveEmpresaId(req);
    const catId = req.query.categoria_id;
    let q = `SELECT tm.*, c.nombre AS categoria_nombre
             FROM tipos_mercaderia tm
             JOIN categorias c ON c.id = tm.categoria_id
             WHERE tm.activo=1`;
    const p = [];
    if (eid) { q += ' AND c.empresa_id=?'; p.push(eid); }
    if (catId) { q += ' AND tm.categoria_id=?'; p.push(catId); }
    q += ' ORDER BY c.nombre, tm.nombre';
    const [rows] = await pool.query(q, p);
    res.json({ ok: true, datos: rows });
  } catch { res.status(500).json({ ok: false, mensaje: 'Error interno' }); }
});
router.post('/tipos-mercaderia', requireRol('superadmin','admin'), [
  body('nombre').trim().notEmpty(),
  body('categoria_id').isInt({ min: 1 }),
], validate, async (req, res) => {
  const [r] = await pool.query(
    'INSERT INTO tipos_mercaderia (categoria_id, nombre) VALUES (?,?)',
    [req.body.categoria_id, req.body.nombre]);
  res.status(201).json({ ok: true, id: r.insertId });
});
router.put('/tipos-mercaderia/:id', requireRol('superadmin','admin'), [param('id').isInt()], validate, async (req, res) => {
  await pool.query('UPDATE tipos_mercaderia SET nombre=?, activo=? WHERE id=?',
    [req.body.nombre, req.body.activo ?? 1, req.params.id]);
  res.json({ ok: true });
});
router.delete('/tipos-mercaderia/:id', requireRol('superadmin','admin'), async (req, res) => {
  await pool.query('UPDATE tipos_mercaderia SET activo=0 WHERE id=?', [req.params.id]);
  res.json({ ok: true });
});

// ── INDICADORES ───────────────────────────────────────────────────────────────
router.get('/indicadores', async (req, res) => {
  try {
    const eid = resolveEmpresaId(req);
    let q = 'SELECT * FROM indicadores WHERE activo=1';
    const p = [];
    if (eid) { q += ' AND empresa_id=?'; p.push(eid); }
    q += ' ORDER BY nombre';
    const [rows] = await pool.query(q, p);
    res.json({ ok: true, datos: rows });
  } catch { res.status(500).json({ ok: false, mensaje: 'Error interno' }); }
});
router.post('/indicadores', requireRol('superadmin','admin'), [body('nombre').trim().notEmpty()], validate, async (req, res) => {
  const eid = resolveEmpresaId(req) || req.empresa_id;
  const [r] = await pool.query('INSERT INTO indicadores (empresa_id, nombre) VALUES (?,?)', [eid, req.body.nombre]);
  res.status(201).json({ ok: true, id: r.insertId });
});
router.put('/indicadores/:id', requireRol('superadmin','admin'), [param('id').isInt()], validate, async (req, res) => {
  await pool.query('UPDATE indicadores SET nombre=?, activo=? WHERE id=?',
    [req.body.nombre, req.body.activo ?? 1, req.params.id]);
  res.json({ ok: true });
});
router.delete('/indicadores/:id', requireRol('superadmin','admin'), async (req, res) => {
  await pool.query('UPDATE indicadores SET activo=0 WHERE id=?', [req.params.id]);
  res.json({ ok: true });
});

// ── PERSONAL RECEPTOR ─────────────────────────────────────────────────────────
router.get('/personal-receptor', async (req, res) => {
  try {
    const eid = resolveEmpresaId(req);
    let q = 'SELECT * FROM personal_receptor WHERE activo=1';
    const p = [];
    if (eid) { q += ' AND empresa_id=?'; p.push(eid); }
    q += ' ORDER BY nombre';
    const [rows] = await pool.query(q, p);
    res.json({ ok: true, datos: rows });
  } catch { res.status(500).json({ ok: false, mensaje: 'Error interno' }); }
});
router.post('/personal-receptor', requireRol('superadmin','admin'), [body('nombre').trim().notEmpty()], validate, async (req, res) => {
  const eid = resolveEmpresaId(req) || req.empresa_id;
  const [r] = await pool.query(
    'INSERT INTO personal_receptor (empresa_id, nombre, cargo) VALUES (?,?,?)',
    [eid, req.body.nombre, req.body.cargo || null]);
  res.status(201).json({ ok: true, id: r.insertId });
});
router.put('/personal-receptor/:id', requireRol('superadmin','admin'), [param('id').isInt()], validate, async (req, res) => {
  await pool.query('UPDATE personal_receptor SET nombre=?, cargo=?, activo=? WHERE id=?',
    [req.body.nombre, req.body.cargo || null, req.body.activo ?? 1, req.params.id]);
  res.json({ ok: true });
});
router.delete('/personal-receptor/:id', requireRol('superadmin','admin'), async (req, res) => {
  await pool.query('UPDATE personal_receptor SET activo=0 WHERE id=?', [req.params.id]);
  res.json({ ok: true });
});

// ── SKUS ──────────────────────────────────────────────────────────────────────
router.get('/skus', async (req, res) => {
  try {
    const eid = resolveEmpresaId(req);
    const { categoria_id, tipo_mercaderia_id, zona } = req.query;
    let q = `SELECT s.*, c.nombre AS categoria_nombre, tm.nombre AS tipo_mercaderia_nombre
             FROM skus s
             JOIN categorias c ON c.id = s.categoria_id
             LEFT JOIN tipos_mercaderia tm ON tm.id = s.tipo_mercaderia_id
             WHERE s.activo=1`;
    const p = [];
    if (eid) { q += ' AND s.empresa_id=?'; p.push(eid); }
    if (categoria_id) { q += ' AND s.categoria_id=?'; p.push(categoria_id); }
    if (tipo_mercaderia_id) { q += ' AND s.tipo_mercaderia_id=?'; p.push(tipo_mercaderia_id); }
    if (zona) { q += ' AND s.zona=?'; p.push(zona); }
    q += ' ORDER BY c.nombre, s.nombre';
    const [rows] = await pool.query(q, p);
    res.json({ ok: true, datos: rows });
  } catch (err) { console.error(err); res.status(500).json({ ok: false, mensaje: 'Error interno' }); }
});
router.get('/skus/:id', async (req, res) => {
  const [rows] = await pool.query('SELECT * FROM skus WHERE id=?', [req.params.id]);
  if (!rows.length) return res.status(404).json({ ok: false, mensaje: 'SKU no encontrado' });
  res.json({ ok: true, datos: rows[0] });
});
router.post('/skus', requireRol('superadmin','admin'), [
  body('nombre').trim().notEmpty().withMessage('Nombre requerido'),
  body('categoria_id').isInt({ min: 1 }).withMessage('Categoría requerida'),
  body('zona').isIn(['LIMA','PROVINCIA']).withMessage('Zona inválida'),
], validate, async (req, res) => {
  const eid = resolveEmpresaId(req) || req.empresa_id;
  const { nombre, categoria_id, tipo_mercaderia_id, zona, codigo, unidad, tiene_lote, tiene_vencimiento } = req.body;
  const [r] = await pool.query(
    'INSERT INTO skus (empresa_id, categoria_id, tipo_mercaderia_id, zona, codigo, nombre, unidad, tiene_lote, tiene_vencimiento) VALUES (?,?,?,?,?,?,?,?,?)',
    [eid, categoria_id, tipo_mercaderia_id || null, zona || 'LIMA', codigo || null, nombre, unidad || null, tiene_lote ? 1 : 0, tiene_vencimiento ? 1 : 0]);
  res.status(201).json({ ok: true, id: r.insertId });
});
router.put('/skus/:id', requireRol('superadmin','admin'), [param('id').isInt()], validate, async (req, res) => {
  const { nombre, categoria_id, tipo_mercaderia_id, zona, codigo, unidad, tiene_lote, tiene_vencimiento, activo } = req.body;
  await pool.query(
    'UPDATE skus SET nombre=?, categoria_id=?, tipo_mercaderia_id=?, zona=?, codigo=?, unidad=?, tiene_lote=?, tiene_vencimiento=?, activo=? WHERE id=?',
    [nombre, categoria_id, tipo_mercaderia_id || null, zona || 'LIMA', codigo || null, unidad || null,
     tiene_lote ? 1 : 0, tiene_vencimiento ? 1 : 0, activo ?? 1, req.params.id]);
  res.json({ ok: true });
});
router.delete('/skus/:id', requireRol('superadmin','admin'), async (req, res) => {
  await pool.query('UPDATE skus SET activo=0 WHERE id=?', [req.params.id]);
  res.json({ ok: true });
});

// ── LOTES ─────────────────────────────────────────────────────────────────────
router.get('/lotes', async (req, res) => {
  const { sku_id } = req.query;
  if (!sku_id) return res.status(400).json({ ok: false, mensaje: 'sku_id requerido' });
  const [rows] = await pool.query(
    'SELECT * FROM lotes WHERE sku_id=? AND activo=1 ORDER BY codigo_lote', [sku_id]);
  res.json({ ok: true, datos: rows });
});
router.post('/lotes', [
  body('sku_id').isInt({ min: 1 }),
  body('codigo_lote').trim().notEmpty(),
  body('fecha_vencimiento').optional().isISO8601(),
], validate, async (req, res) => {
  const { sku_id, codigo_lote, fecha_vencimiento } = req.body;
  const [r] = await pool.query(
    'INSERT INTO lotes (sku_id, codigo_lote, fecha_vencimiento) VALUES (?,?,?)',
    [sku_id, codigo_lote, fecha_vencimiento || null]);
  res.status(201).json({ ok: true, id: r.insertId });
});
router.put('/lotes/:id', [param('id').isInt()], validate, async (req, res) => {
  const { codigo_lote, fecha_vencimiento, activo } = req.body;
  await pool.query('UPDATE lotes SET codigo_lote=?, fecha_vencimiento=?, activo=? WHERE id=?',
    [codigo_lote, fecha_vencimiento || null, activo ?? 1, req.params.id]);
  res.json({ ok: true });
});
router.delete('/lotes/:id', async (req, res) => {
  await pool.query('UPDATE lotes SET activo=0 WHERE id=?', [req.params.id]);
  res.json({ ok: true });
});

module.exports = router;
