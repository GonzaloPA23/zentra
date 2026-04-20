const express = require('express');
const multer = require('multer');
const path = require('path');
const { body, param, query, validationResult } = require('express-validator');
const { pool } = require('../db');
const { authMiddleware, requireRol, empresaMiddleware } = require('../middleware/auth');
const { getWarehouseScope, recordMatchesAssignedWarehouses } = require('../utils/warehouseScope');
const { insertAuditLog } = require('../utils/audit');
const { sendExcelWorkbook } = require('../utils/excel');

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

const TRACKED_FIELDS = [
  'fecha',
  'ciudad_id',
  'almacen_origen_id',
  'almacen_destino_id',
  'categoria_id',
  'accion',
  'tipo_accion',
  'personal_receptor_id',
  'indicador_id',
  'tipo_mercaderia_id',
  'sku_id',
  'lote_id',
  'fecha_vencimiento',
  'cantidad',
  'nro_guia',
  'observaciones',
  'estado',
];

const REGISTRO_SORT_FIELDS = {
  fecha: 'r.fecha',
  almacen_origen: 'ao.nombre',
  almacen_destino: 'ad.nombre',
  categoria: 'ca.nombre',
  tipo_accion: 'r.tipo_accion',
  sku: 'sk.nombre',
  cantidad: 'r.cantidad',
  estado: 'r.estado',
  registrado_por: 'u.nombre',
  nro_guia: 'r.nro_guia',
};

function addLikeFilter(where, params, value, expression) {
  const term = String(value || '').trim();
  if (!term) return where;

  where += ` AND ${expression} LIKE ?`;
  params.push(`%${term}%`);
  return where;
}

async function buildRegistroQuery(req) {
  const {
    fecha_ini,
    fecha_fin,
    almacen_id,
    categoria_id,
    tipo_accion,
    estado,
    q_almacen_origen,
    q_almacen_destino,
    q_categoria,
    q_tipo_accion,
    q_sku,
    q_estado,
    q_registrado_por,
    q_nro_guia,
    sort_by = 'fecha',
    sort_dir = 'desc',
    page = 1,
    limit = 50,
  } = req.query;

  const scope = await getWarehouseScope(req, 'r');
  const fromClause = `FROM registros r
    LEFT JOIN almacenes ao ON ao.id = r.almacen_origen_id
    LEFT JOIN almacenes ad ON ad.id = r.almacen_destino_id
    LEFT JOIN ciudades ci ON ci.id = r.ciudad_id
    LEFT JOIN categorias ca ON ca.id = r.categoria_id
    LEFT JOIN skus sk ON sk.id = r.sku_id
    LEFT JOIN lotes lo ON lo.id = r.lote_id
    LEFT JOIN personal_receptor pr ON pr.id = r.personal_receptor_id
    LEFT JOIN indicadores ind ON ind.id = r.indicador_id
    LEFT JOIN tipos_mercaderia tm ON tm.id = r.tipo_mercaderia_id
    LEFT JOIN usuarios u ON u.id = r.usuario_id`;

  let where = 'WHERE r.empresa_id = ?';
  const params = [req.empresa_id];

  if (fecha_ini) { where += ' AND r.fecha >= ?'; params.push(fecha_ini); }
  if (fecha_fin) { where += ' AND r.fecha <= ?'; params.push(fecha_fin); }
  if (almacen_id) {
    where += ' AND (r.almacen_origen_id = ? OR r.almacen_destino_id = ?)';
    params.push(almacen_id, almacen_id);
  }
  if (categoria_id) { where += ' AND r.categoria_id = ?'; params.push(categoria_id); }
  if (tipo_accion) { where += ' AND r.tipo_accion = ?'; params.push(tipo_accion); }
  if (estado) { where += ' AND r.estado = ?'; params.push(estado); }

  where = addLikeFilter(where, params, q_almacen_origen, 'ao.nombre');
  where = addLikeFilter(where, params, q_almacen_destino, 'ad.nombre');
  where = addLikeFilter(where, params, q_categoria, 'ca.nombre');
  where = addLikeFilter(where, params, q_tipo_accion, 'r.tipo_accion');
  where = addLikeFilter(where, params, q_sku, 'sk.nombre');
  where = addLikeFilter(where, params, q_estado, 'r.estado');
  where = addLikeFilter(where, params, q_registrado_por, "CONCAT(u.nombre,' ',u.apellido)");
  where = addLikeFilter(where, params, q_nro_guia, 'r.nro_guia');

  where += scope.clause;
  params.push(...scope.params);

  const sortField = REGISTRO_SORT_FIELDS[sort_by] || REGISTRO_SORT_FIELDS.fecha;
  const sortDirection = String(sort_dir).toLowerCase() === 'asc' ? 'ASC' : 'DESC';

  return {
    fromClause,
    where,
    params,
    orderBy: `ORDER BY ${sortField} ${sortDirection}, r.id DESC`,
    page: parseInt(page, 10),
    limit: parseInt(limit, 10),
  };
}

async function ensureOrigenPerteneceACiudad(ciudadId, almacenId) {
  const [rows] = await pool.query(
    'SELECT ciudad_id FROM almacenes WHERE id = ?',
    [almacenId]
  );

  if (!rows.length) {
    return { ok: false, mensaje: 'Almacen origen no encontrado' };
  }

  if (String(rows[0].ciudad_id) !== String(ciudadId)) {
    return { ok: false, mensaje: 'El almacen origen no pertenece a la ciudad seleccionada' };
  }

  return { ok: true };
}

function buildChangeSet(before, after) {
  return TRACKED_FIELDS.reduce((changes, field) => {
    const prev = before?.[field] ?? null;
    const next = after?.[field] ?? null;

    if (String(prev) === String(next)) return changes;

    changes.push({ field, from: prev, to: next });
    return changes;
  }, []);
}

function getZonaFromCityName(ciudadNombre) {
  if (!ciudadNombre) return '';
  return String(ciudadNombre).toUpperCase() === 'LIMA' ? 'LIMA' : 'PROVINCIA';
}

function mapRegistroExportRow(row) {
  return {
    fecha: row.fecha ? new Date(row.fecha) : null,
    zona: getZonaFromCityName(row.ciudad_nombre),
    ciudad: row.ciudad_nombre || '',
    almacen_origen: row.almacen_origen || '',
    almacen_destino: row.almacen_destino || '',
    categoria: row.categoria_nombre || '',
    accion: row.accion || '',
    tipo_accion: row.tipo_accion || '',
    personal_receptor: row.personal_receptor_nombre || '',
    indicador: row.indicador_nombre || '',
    tipo_mercaderia: row.tipo_mercaderia_nombre || '',
    sku: row.sku_nombre || '',
    lote: row.codigo_lote || '',
    fecha_vencimiento: row.fecha_vencimiento ? new Date(row.fecha_vencimiento) : null,
    cantidad: row.cantidad !== null && row.cantidad !== undefined ? Number(row.cantidad) : null,
    nro_guia: row.nro_guia || '',
    estado: row.estado || '',
    registrado_por: row.registrado_por || '',
    observaciones: row.observaciones || '',
  };
}

// GET /api/registros
router.get('/', async (req, res) => {
  try {
    const { fromClause, where, params, orderBy, page, limit } = await buildRegistroQuery(req);
    const offset = (page - 1) * limit;
    const [[{ total }]] = await pool.query(`SELECT COUNT(*) AS total ${fromClause} ${where}`, params);


    // Filtro por almacén asignado para almaceneros


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
      ${fromClause}
      ${where}
      ${orderBy}
      LIMIT ? OFFSET ?`;

    const [rows] = await pool.query(q, [...params, limit, offset]);

    res.json({
      ok: true,
      datos: rows,
      paginacion: { total: parseInt(total, 10), page, limit, pages: Math.ceil(total / limit) },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, mensaje: 'Error interno' });
  }
});

// GET /api/registros/:id
router.get('/:id', param('id').isInt(), validate, async (req, res) => {
  try {
    const scope = await getWarehouseScope(req, 'r');
    const [rows] = await pool.query(
      `SELECT r.*, ao.nombre AS almacen_origen, ad.nombre AS almacen_destino,
       ci.nombre AS ciudad_nombre, rg.nombre AS region_nombre,
       sk.nombre AS sku_nombre, ca.nombre AS categoria_nombre, lo.codigo_lote
       FROM registros r
       LEFT JOIN almacenes ao ON ao.id = r.almacen_origen_id
       LEFT JOIN almacenes ad ON ad.id = r.almacen_destino_id
       LEFT JOIN ciudades ci ON ci.id = r.ciudad_id
       LEFT JOIN regiones rg ON rg.id = ci.region_id
       LEFT JOIN skus sk ON sk.id = r.sku_id
       LEFT JOIN categorias ca ON ca.id = r.categoria_id
       LEFT JOIN lotes lo ON lo.id = r.lote_id
       WHERE r.id=? AND r.empresa_id=?`,
      [req.params.id, req.empresa_id]
    );
    if (!rows.length) return res.status(404).json({ ok: false, mensaje: 'Registro no encontrado' });
    if (!recordMatchesAssignedWarehouses(rows[0], scope.ids)) {
      return res.status(403).json({ ok: false, mensaje: 'Sin acceso a este registro' });
    }
    res.json({ ok: true, datos: rows[0] });
  } catch { res.status(500).json({ ok: false, mensaje: 'Error interno' }); }
});

// POST /api/registros
router.post('/', requireRol('superadmin','admin','almacenero'), upload.single('foto_guia'), [
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
    const scope = await getWarehouseScope(req, 'r');
    const ciudadValidacion = await ensureOrigenPerteneceACiudad(ciudad_id, almacen_origen_id);
    const origenODestinoAsignado = scope.ids.some((id) =>
      id === Number(almacen_origen_id) || id === Number(almacen_destino_id)
    );

    if (!ciudadValidacion.ok) {
      return res.status(400).json({ ok: false, mensaje: ciudadValidacion.mensaje });
    }
    if (scope.ids.length && !origenODestinoAsignado) {
      return res.status(403).json({ ok: false, mensaje: 'El registro no pertenece a tus almacenes asignados' });
    }

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

    await insertAuditLog(pool, {
      empresa_id: req.empresa_id,
      usuario_id: req.usuario.id,
      accion: 'CREATE',
      tabla: 'registros',
      registro_id: result.insertId,
      detalle: {
        summary: 'Creo un registro',
        estado: 'pendiente',
        almacen_origen_id: Number(almacen_origen_id),
        almacen_destino_id: almacen_destino_id ? Number(almacen_destino_id) : null,
        sku_id: Number(sku_id),
        cantidad: Number(cantidad),
      },
      ip: req.ip,
    });

    res.status(201).json({ ok: true, id: result.insertId, mensaje: 'Registro creado exitosamente' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, mensaje: 'Error interno' });
  }
});

// PUT /api/registros/:id
router.put('/:id', requireRol('superadmin','admin'), upload.single('foto_guia'), [
  param('id').isInt({ min: 1 }),
  body('cantidad').optional().isFloat({ min: 0.01 }),
], validate, async (req, res) => {
  try {
    const scope = await getWarehouseScope(req, 'r');
    const [existing] = await pool.query(
      'SELECT * FROM registros WHERE id=? AND empresa_id=?', [req.params.id, req.empresa_id]);
    if (!existing.length) return res.status(404).json({ ok: false, mensaje: 'No encontrado' });

    const r = existing[0];
    if (!recordMatchesAssignedWarehouses(r, scope.ids)) {
      return res.status(403).json({ ok: false, mensaje: 'Sin acceso a este registro' });
    }
    if (r.estado === 'aprobado') {
      return res.status(403).json({ ok: false, mensaje: 'No se puede editar un registro aprobado' });
    }

    const foto_guia = req.file ? req.file.filename : r.foto_guia;
    const {
      fecha, ciudad_id, almacen_origen_id, almacen_destino_id,
      categoria_id, accion, tipo_accion, personal_receptor_id,
      indicador_id, tipo_mercaderia_id, sku_id, lote_id,
      fecha_vencimiento, cantidad, nro_guia, observaciones,
    } = { ...r, ...req.body };
    const ciudadValidacion = await ensureOrigenPerteneceACiudad(ciudad_id, almacen_origen_id);
    const origenODestinoAsignado = scope.ids.some((id) =>
      id === Number(almacen_origen_id) || id === Number(almacen_destino_id)
    );

    if (!ciudadValidacion.ok) {
      return res.status(400).json({ ok: false, mensaje: ciudadValidacion.mensaje });
    }
    if (scope.ids.length && !origenODestinoAsignado) {
      return res.status(403).json({ ok: false, mensaje: 'El registro no pertenece a tus almacenes asignados' });
    }

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

    await insertAuditLog(pool, {
      empresa_id: req.empresa_id,
      usuario_id: req.usuario.id,
      accion: 'UPDATE',
      tabla: 'registros',
      registro_id: Number(req.params.id),
      detalle: {
        summary: 'Edito un registro',
        changes: buildChangeSet(r, {
          ...r,
          fecha,
          ciudad_id,
          almacen_origen_id,
          almacen_destino_id: almacen_destino_id || null,
          categoria_id,
          accion,
          tipo_accion,
          personal_receptor_id: personal_receptor_id || null,
          indicador_id: indicador_id || null,
          tipo_mercaderia_id: tipo_mercaderia_id || null,
          sku_id,
          lote_id: lote_id || null,
          fecha_vencimiento: fecha_vencimiento || null,
          cantidad,
          nro_guia: nro_guia || null,
          observaciones: observaciones || null,
        }),
      },
      ip: req.ip,
    });

    res.json({ ok: true, mensaje: 'Registro actualizado' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, mensaje: 'Error interno' });
  }
});

// PATCH /api/registros/:id/estado  (aprobación/rechazo)
router.patch('/:id/estado', requireRol('superadmin','admin','almacenero'), [
  param('id').isInt({ min: 1 }),
  body('estado').isIn(['pendiente','en_transito','aprobado','rechazado']),
], validate, async (req, res) => {
  try {
    const { estado } = req.body;
    const scope = await getWarehouseScope(req, 'r');
    const [existing] = await pool.query(
      'SELECT id, estado, almacen_origen_id, almacen_destino_id FROM registros WHERE id=? AND empresa_id=?',
      [req.params.id, req.empresa_id]
    );
    if (!existing.length) return res.status(404).json({ ok: false, mensaje: 'No encontrado' });
    if (!recordMatchesAssignedWarehouses(existing[0], scope.ids)) {
      return res.status(403).json({ ok: false, mensaje: 'Sin acceso a este registro' });
    }
    if (existing[0].estado === 'aprobado' && existing[0].estado !== estado) {
      return res.status(403).json({ ok: false, mensaje: 'Un registro aprobado ya no puede cambiar de estado' });
    }

    const actorEstado = ['aprobado', 'rechazado'].includes(estado) ? req.usuario.id : null;
    const fechaEstado = ['aprobado', 'rechazado'].includes(estado) ? 'NOW()' : 'NULL';
    await pool.query(
      `UPDATE registros
       SET estado=?, aprobado_por=?, fecha_aprobacion=${fechaEstado}
       WHERE id=? AND empresa_id=?`,
      [estado, actorEstado, req.params.id, req.empresa_id]
    );

    await insertAuditLog(pool, {
      empresa_id: req.empresa_id,
      usuario_id: req.usuario.id,
      accion: 'STATUS_CHANGE',
      tabla: 'registros',
      registro_id: Number(req.params.id),
      detalle: {
        summary: `Cambio el estado a ${estado}`,
        from: existing[0].estado,
        to: estado,
      },
      ip: req.ip,
    });
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
    await insertAuditLog(pool, {
      empresa_id: req.empresa_id,
      usuario_id: req.usuario.id,
      accion: 'DELETE',
      tabla: 'registros',
      registro_id: Number(req.params.id),
      detalle: { summary: 'Elimino un registro' },
      ip: req.ip,
    });
    res.json({ ok: true, mensaje: 'Registro eliminado' });
  } catch { res.status(500).json({ ok: false, mensaje: 'Error interno' }); }
});

// GET /api/registros/export/csv
router.get('/export/csv', requireRol('superadmin','admin','supervisor'), async (req, res) => {
  try {
    const { fromClause, where, params, orderBy } = await buildRegistroQuery(req);
    const [rows] = await pool.query(
      `SELECT r.fecha, ao.nombre AS almacen_origen, ad.nombre AS almacen_destino,
       ci.nombre AS ciudad, ca.nombre AS categoria, r.accion, r.tipo_accion,
       pr.nombre AS personal_receptor, ind.nombre AS indicador,
       tm.nombre AS tipo_mercaderia, sk.nombre AS sku, lo.codigo_lote,
       r.fecha_vencimiento, r.cantidad, r.nro_guia, r.estado,
       CONCAT(u.nombre,' ',u.apellido) AS registrado_por, r.created_at
       ${fromClause}
       ${where}
       ${orderBy}`,
      params
    );

    const headers = Object.keys(rows[0] || {}).join(',');
    const csv = [headers, ...rows.map(r => Object.values(r).map(v =>
      v === null ? '' : `"${String(v).replace(/"/g, '""')}"`
    ).join(','))].join('\n');

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="zentra_registros_${Date.now()}.csv"`);
    res.send('\uFEFF' + csv);
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, mensaje: 'Error al exportar' });
  }
});

// GET /api/registros/export/excel
router.get('/export/excel', requireRol('superadmin','admin','supervisor'), async (req, res) => {
  try {
    const { fromClause, where, params, orderBy } = await buildRegistroQuery(req);
    const [rows] = await pool.query(
      `SELECT r.fecha, r.accion, r.tipo_accion, r.fecha_vencimiento, r.cantidad, r.nro_guia,
       r.estado, r.observaciones,
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
       ${fromClause}
       ${where}
       ${orderBy}`,
      params
    );

    const estadoBase = String(req.query.estado || '').toLowerCase();
    const exportName = estadoBase === 'en_transito'
      ? 'guias_en_camino'
      : estadoBase === 'pendiente'
        ? 'aprobacion_ingresos'
        : 'registros';

    await sendExcelWorkbook(res, {
      fileName: `zentra_${exportName}_${Date.now()}`,
      sheetName: estadoBase === 'en_transito'
        ? 'Guias En Camino'
        : estadoBase === 'pendiente'
          ? 'Aprobacion Ingresos'
          : 'Registros',
      columns: [
        { header: 'FECHA', key: 'fecha', width: 14, type: 'date' },
        { header: 'ZONA', key: 'zona', width: 14 },
        { header: 'CIUDAD', key: 'ciudad', width: 18 },
        { header: 'ALMACEN ORIGEN', key: 'almacen_origen', width: 24 },
        { header: 'ALMACEN DESTINO', key: 'almacen_destino', width: 24 },
        { header: 'CATEGORIA', key: 'categoria', width: 18 },
        { header: 'ACCION', key: 'accion', width: 24 },
        { header: 'TIPO ACCION', key: 'tipo_accion', width: 16 },
        { header: 'PERSONAL RECEPTOR', key: 'personal_receptor', width: 26 },
        { header: 'INDICADOR', key: 'indicador', width: 28 },
        { header: 'TIPO MERCADERIA', key: 'tipo_mercaderia', width: 20 },
        { header: 'SKU', key: 'sku', width: 36 },
        { header: 'LOTE', key: 'lote', width: 18 },
        { header: 'FECHA VENCIMIENTO', key: 'fecha_vencimiento', width: 18, type: 'date' },
        { header: 'CANTIDAD', key: 'cantidad', width: 14, type: 'number' },
        { header: 'NRO GUIA', key: 'nro_guia', width: 18 },
        { header: 'ESTADO', key: 'estado', width: 16 },
        { header: 'REGISTRADO POR', key: 'registrado_por', width: 24 },
        { header: 'OBSERVACION', key: 'observaciones', width: 34 },
      ],
      rows: rows.map(mapRegistroExportRow),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, mensaje: 'Error al exportar excel' });
  }
});

module.exports = router;
