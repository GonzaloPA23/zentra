const express = require('express');
const multer = require('multer');
const path = require('path');
const { body, param, query, validationResult } = require('express-validator');
const { pool } = require('../db');
const { authMiddleware, requireRol, empresaMiddleware } = require('../middleware/auth');

const router = express.Router();
router.use(authMiddleware, empresaMiddleware);

// Multer config
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = process.env.UPLOAD_PATH || './uploads';
    require('fs').mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const unique = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, unique + path.extname(file.originalname));
  },
});
const upload = multer({
  storage,
  limits: { fileSize: parseInt(process.env.MAX_FILE_SIZE) || 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = /jpeg|jpg|png|pdf/;
    if (allowed.test(path.extname(file.originalname).toLowerCase())) cb(null, true);
    else cb(new Error('Solo se permiten JPG, PNG o PDF'));
  },
});

const validate = (req, res, next) => {
  const e = validationResult(req);
  if (!e.isEmpty()) return res.status(400).json({ ok: false, errores: e.array() });
  next();
};

const ACCIONES = ['MERMA','DESPACHO A CANJISTAS','OTROS MOVIMIENTOS'];
const TIPOS_ACCION = ['ENTRADA','SALIDA','DEGUSTACIÓN','CANJES','CRUCERISMO','MERCADERISMO','ACTIVOS'];

// GET /api/registros
router.get('/', async (req, res) => {
  try {
    const { fecha_ini, fecha_fin, almacen_id, categoria_id, tipo_accion, estado, page = 1, limit = 50 } = req.query;
    let where = 'WHERE r.empresa_id = ?';
    const p = [req.empresa_id];

    if (fecha_ini) { where += ' AND r.fecha >= ?'; p.push(fecha_ini); }
    if (fecha_fin) { where += ' AND r.fecha <= ?'; p.push(fecha_fin); }
    if (almacen_id) { where += ' AND r.almacen_origen_id = ?'; p.push(almacen_id); }
    if (categoria_id) { where += ' AND r.categoria_id = ?'; p.push(categoria_id); }
    if (tipo_accion) { where += ' AND r.tipo_accion = ?'; p.push(tipo_accion); }
    if (estado) { where += ' AND r.estado = ?'; p.push(estado); }

    // Filtro por almacén asignado para almaceneros
    if (req.usuario.rol === 'almacenero') {
      where += ` AND r.almacen_origen_id IN (
        SELECT almacen_id FROM usuario_almacen WHERE usuario_id = ?
      )`;
      p.push(req.usuario.id);
    }

    const offset = (parseInt(page) - 1) * parseInt(limit);
    const [[{ total }]] = await pool.query(`SELECT COUNT(*) AS total FROM registros r ${where}`, p);

    const q = `SELECT r.*,
        ao.nombre AS almacen_origen,
        ad.nombre AS almacen_destino,
        ci.nombre AS ciudad_nombre,
        ca.nombre AS categoria_nombre,
        sk.nombre AS sku_nombre,
        lo.codigo_lote,
        pr.nombre AS personal_receptor_nombre,
        ind.nombre AS indicador_nombre,
        tm.nombre AS tipo_mercaderia_nombre,
        CONCAT(u.nombre,' ',u.apellido) AS registrado_por
      FROM registros r
      LEFT JOIN almacenes ao ON ao.id = r.almacen_origen_id
      LEFT JOIN almacenes ad ON ad.id = r.almacen_destino_id
      LEFT JOIN ciudades ci ON ci.id = r.ciudad_id
      LEFT JOIN categorias ca ON ca.id = r.categoria_id
      LEFT JOIN skus sk ON sk.id = r.sku_id
      LEFT JOIN lotes lo ON lo.id = r.lote_id
      LEFT JOIN personal_receptor pr ON pr.id = r.personal_receptor_id
      LEFT JOIN indicadores ind ON ind.id = r.indicador_id
      LEFT JOIN tipos_mercaderia tm ON tm.id = r.tipo_mercaderia_id
      LEFT JOIN usuarios u ON u.id = r.usuario_id
      ${where}
      ORDER BY r.fecha DESC, r.id DESC
      LIMIT ? OFFSET ?`;

    const [rows] = await pool.query(q, [...p, parseInt(limit), offset]);

    res.json({
      ok: true,
      datos: rows,
      paginacion: { total: parseInt(total), page: parseInt(page), limit: parseInt(limit), pages: Math.ceil(total / limit) },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, mensaje: 'Error interno' });
  }
});

// GET /api/registros/:id
router.get('/:id', param('id').isInt(), validate, async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT r.*, ao.nombre AS almacen_origen, ad.nombre AS almacen_destino,
       sk.nombre AS sku_nombre, ca.nombre AS categoria_nombre, lo.codigo_lote
       FROM registros r
       LEFT JOIN almacenes ao ON ao.id = r.almacen_origen_id
       LEFT JOIN almacenes ad ON ad.id = r.almacen_destino_id
       LEFT JOIN skus sk ON sk.id = r.sku_id
       LEFT JOIN categorias ca ON ca.id = r.categoria_id
       LEFT JOIN lotes lo ON lo.id = r.lote_id
       WHERE r.id=? AND r.empresa_id=?`,
      [req.params.id, req.empresa_id]
    );
    if (!rows.length) return res.status(404).json({ ok: false, mensaje: 'Registro no encontrado' });
    res.json({ ok: true, datos: rows[0] });
  } catch { res.status(500).json({ ok: false, mensaje: 'Error interno' }); }
});

// POST /api/registros
router.post('/', upload.single('foto_guia'), [
  body('fecha').isISO8601().withMessage('Fecha inválida'),
  body('ciudad_id').isInt({ min: 1 }).withMessage('Ciudad requerida'),
  body('almacen_origen_id').isInt({ min: 1 }).withMessage('Almacén origen requerido'),
  body('categoria_id').isInt({ min: 1 }).withMessage('Categoría requerida'),
  body('accion').isIn(ACCIONES).withMessage('Acción inválida'),
  body('tipo_accion').isIn(TIPOS_ACCION).withMessage('Tipo de acción inválido'),
  body('sku_id').isInt({ min: 1 }).withMessage('SKU requerido'),
  body('cantidad').isFloat({ min: 0.01 }).withMessage('Cantidad debe ser mayor a 0'),
], validate, async (req, res) => {
  try {
    const {
      fecha, ciudad_id, almacen_origen_id, almacen_destino_id,
      categoria_id, accion, tipo_accion, personal_receptor_id,
      indicador_id, tipo_mercaderia_id, sku_id, lote_id,
      fecha_vencimiento, cantidad, nro_guia, observaciones,
    } = req.body;

    const foto_guia = req.file ? req.file.filename : null;

    const [result] = await pool.query(
      `INSERT INTO registros 
       (empresa_id, almacen_origen_id, almacen_destino_id, usuario_id, fecha, ciudad_id,
        categoria_id, accion, tipo_accion, personal_receptor_id, indicador_id,
        tipo_mercaderia_id, sku_id, lote_id, fecha_vencimiento, cantidad,
        nro_guia, foto_guia, observaciones, estado)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [
        req.empresa_id, almacen_origen_id, almacen_destino_id || null, req.usuario.id,
        fecha, ciudad_id, categoria_id, accion, tipo_accion,
        personal_receptor_id || null, indicador_id || null, tipo_mercaderia_id || null,
        sku_id, lote_id || null, fecha_vencimiento || null, cantidad,
        nro_guia || null, foto_guia, observaciones || null, 'pendiente',
      ]
    );

    // Audit log
    await pool.query(
      'INSERT INTO audit_log (empresa_id, usuario_id, accion, tabla, registro_id, ip) VALUES (?,?,?,?,?,?)',
      [req.empresa_id, req.usuario.id, 'CREATE', 'registros', result.insertId, req.ip]
    );

    res.status(201).json({ ok: true, id: result.insertId, mensaje: 'Registro creado exitosamente' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, mensaje: 'Error interno' });
  }
});

// PUT /api/registros/:id
router.put('/:id', requireRol('superadmin','admin','supervisor'), upload.single('foto_guia'), [
  param('id').isInt({ min: 1 }),
  body('cantidad').optional().isFloat({ min: 0.01 }),
], validate, async (req, res) => {
  try {
    const [existing] = await pool.query(
      'SELECT * FROM registros WHERE id=? AND empresa_id=?', [req.params.id, req.empresa_id]);
    if (!existing.length) return res.status(404).json({ ok: false, mensaje: 'No encontrado' });

    const r = existing[0];
    if (r.estado === 'aprobado' && req.usuario.rol !== 'superadmin') {
      return res.status(403).json({ ok: false, mensaje: 'No se puede editar un registro aprobado' });
    }

    const foto_guia = req.file ? req.file.filename : r.foto_guia;
    const {
      fecha, ciudad_id, almacen_origen_id, almacen_destino_id,
      categoria_id, accion, tipo_accion, personal_receptor_id,
      indicador_id, tipo_mercaderia_id, sku_id, lote_id,
      fecha_vencimiento, cantidad, nro_guia, observaciones,
    } = { ...r, ...req.body };

    await pool.query(
      `UPDATE registros SET fecha=?, ciudad_id=?, almacen_origen_id=?, almacen_destino_id=?,
       categoria_id=?, accion=?, tipo_accion=?, personal_receptor_id=?, indicador_id=?,
       tipo_mercaderia_id=?, sku_id=?, lote_id=?, fecha_vencimiento=?, cantidad=?,
       nro_guia=?, foto_guia=?, observaciones=? WHERE id=?`,
      [fecha, ciudad_id, almacen_origen_id, almacen_destino_id || null,
       categoria_id, accion, tipo_accion, personal_receptor_id || null,
       indicador_id || null, tipo_mercaderia_id || null, sku_id, lote_id || null,
       fecha_vencimiento || null, cantidad, nro_guia || null, foto_guia, observaciones || null,
       req.params.id]
    );

    await pool.query(
      'INSERT INTO audit_log (empresa_id, usuario_id, accion, tabla, registro_id, ip) VALUES (?,?,?,?,?,?)',
      [req.empresa_id, req.usuario.id, 'UPDATE', 'registros', req.params.id, req.ip]
    );

    res.json({ ok: true, mensaje: 'Registro actualizado' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, mensaje: 'Error interno' });
  }
});

// PATCH /api/registros/:id/estado  (aprobación/rechazo)
router.patch('/:id/estado', requireRol('superadmin','admin','supervisor'), [
  param('id').isInt({ min: 1 }),
  body('estado').isIn(['pendiente','en_transito','aprobado','rechazado']),
], validate, async (req, res) => {
  try {
    const { estado } = req.body;
    await pool.query(
      'UPDATE registros SET estado=?, aprobado_por=?, fecha_aprobacion=NOW() WHERE id=? AND empresa_id=?',
      [estado, req.usuario.id, req.params.id, req.empresa_id]
    );
    res.json({ ok: true, mensaje: `Estado actualizado a: ${estado}` });
  } catch { res.status(500).json({ ok: false, mensaje: 'Error interno' }); }
});

// DELETE /api/registros/:id
router.delete('/:id', requireRol('superadmin','admin'), param('id').isInt(), validate, async (req, res) => {
  try {
    const [existing] = await pool.query(
      'SELECT estado FROM registros WHERE id=? AND empresa_id=?', [req.params.id, req.empresa_id]);
    if (!existing.length) return res.status(404).json({ ok: false, mensaje: 'No encontrado' });
    if (existing[0].estado === 'aprobado' && req.usuario.rol !== 'superadmin') {
      return res.status(403).json({ ok: false, mensaje: 'No se puede eliminar un registro aprobado' });
    }
    await pool.query('DELETE FROM registros WHERE id=? AND empresa_id=?', [req.params.id, req.empresa_id]);
    await pool.query(
      'INSERT INTO audit_log (empresa_id, usuario_id, accion, tabla, registro_id, ip) VALUES (?,?,?,?,?,?)',
      [req.empresa_id, req.usuario.id, 'DELETE', 'registros', req.params.id, req.ip]
    );
    res.json({ ok: true, mensaje: 'Registro eliminado' });
  } catch { res.status(500).json({ ok: false, mensaje: 'Error interno' }); }
});

// GET /api/registros/export/csv
router.get('/export/csv', requireRol('superadmin','admin','supervisor'), async (req, res) => {
  try {
    const { fecha_ini, fecha_fin, almacen_id } = req.query;
    let where = 'WHERE r.empresa_id = ?';
    const p = [req.empresa_id];
    if (fecha_ini) { where += ' AND r.fecha >= ?'; p.push(fecha_ini); }
    if (fecha_fin) { where += ' AND r.fecha <= ?'; p.push(fecha_fin); }
    if (almacen_id) { where += ' AND r.almacen_origen_id = ?'; p.push(almacen_id); }

    const [rows] = await pool.query(
      `SELECT r.fecha, ao.nombre AS almacen_origen, ad.nombre AS almacen_destino,
       ci.nombre AS ciudad, ca.nombre AS categoria, r.accion, r.tipo_accion,
       pr.nombre AS personal_receptor, ind.nombre AS indicador,
       tm.nombre AS tipo_mercaderia, sk.nombre AS sku, lo.codigo_lote,
       r.fecha_vencimiento, r.cantidad, r.nro_guia, r.estado,
       CONCAT(u.nombre,' ',u.apellido) AS registrado_por, r.created_at
       FROM registros r
       LEFT JOIN almacenes ao ON ao.id = r.almacen_origen_id
       LEFT JOIN almacenes ad ON ad.id = r.almacen_destino_id
       LEFT JOIN ciudades ci ON ci.id = r.ciudad_id
       LEFT JOIN categorias ca ON ca.id = r.categoria_id
       LEFT JOIN skus sk ON sk.id = r.sku_id
       LEFT JOIN lotes lo ON lo.id = r.lote_id
       LEFT JOIN personal_receptor pr ON pr.id = r.personal_receptor_id
       LEFT JOIN indicadores ind ON ind.id = r.indicador_id
       LEFT JOIN tipos_mercaderia tm ON tm.id = r.tipo_mercaderia_id
       LEFT JOIN usuarios u ON u.id = r.usuario_id
       ${where} ORDER BY r.fecha DESC, r.id DESC`,
      p
    );

    const headers = Object.keys(rows[0] || {}).join(',');
    const csv = [headers, ...rows.map(r => Object.values(r).map(v =>
      v === null ? '' : `"${String(v).replace(/"/g, '""')}"`
    ).join(','))].join('\n');

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="zentra_registros_${Date.now()}.csv"`);
    res.send('\uFEFF' + csv); // BOM para Excel
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, mensaje: 'Error al exportar' });
  }
});

module.exports = router;
