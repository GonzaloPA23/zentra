const express = require('express');
const { pool } = require('../db');
const { authMiddleware, requireRol, empresaMiddleware } = require('../middleware/auth');
const { getWarehouseScope } = require('../utils/warehouseScope');
const { parseAuditDetail, describeAuditAction } = require('../utils/audit');
const { sendExcelWorkbook } = require('../utils/excel');

const router = express.Router();
router.use(authMiddleware, empresaMiddleware);

const AUDIT_SORT_FIELDS = {
  fecha: 'a.created_at',
  usuario: 'u.nombre',
  accion: 'a.accion',
  registro: 'a.registro_id',
  sku: 'sk.nombre',
  almacen: 'ao.nombre',
};

function addLikeFilter(where, params, value, expression) {
  const term = String(value || '').trim();
  if (!term) return where;

  where += ` AND ${expression} LIKE ?`;
  params.push(`%${term}%`);
  return where;
}

async function buildAuditQuery(req) {
  const {
    accion,
    usuario_id,
    registro_id,
    q_usuario,
    q_sku,
    q_almacen,
    q_detalle,
    sort_by = 'fecha',
    sort_dir = 'desc',
    page = 1,
    limit = 50,
  } = req.query;

  const scope = await getWarehouseScope(req, 'r');
  let where = `WHERE a.tabla = 'registros'`;
  const params = [];

  if (req.empresa_id) {
    where += ' AND a.empresa_id = ?';
    params.push(req.empresa_id);
  }
  if (accion) {
    where += ' AND a.accion = ?';
    params.push(accion);
  }
  if (usuario_id) {
    where += ' AND a.usuario_id = ?';
    params.push(usuario_id);
  }
  if (registro_id) {
    where += ' AND a.registro_id = ?';
    params.push(registro_id);
  }

  where = addLikeFilter(where, params, q_usuario, "CONCAT(u.nombre, ' ', u.apellido)");
  where = addLikeFilter(where, params, q_sku, 'sk.nombre');
  where = addLikeFilter(where, params, q_almacen, "CONCAT(COALESCE(ao.nombre, ''), ' ', COALESCE(ad.nombre, ''))");
  where = addLikeFilter(where, params, q_detalle, 'a.detalle');

  where += scope.clause;
  params.push(...scope.params);

  const sortField = AUDIT_SORT_FIELDS[sort_by] || AUDIT_SORT_FIELDS.fecha;
  const sortDirection = String(sort_dir).toLowerCase() === 'asc' ? 'ASC' : 'DESC';

  return {
    where,
    params,
    orderBy: `ORDER BY ${sortField} ${sortDirection}, a.id DESC`,
    page: parseInt(page, 10),
    limit: parseInt(limit, 10),
  };
}

router.get('/registros', requireRol('superadmin', 'admin', 'supervisor'), async (req, res) => {
  try {
    const { where, params, orderBy, page, limit } = await buildAuditQuery(req);
    const offset = (page - 1) * limit;
    const [[{ total }]] = await pool.query(
      `SELECT COUNT(*) AS total
       FROM audit_log a
       LEFT JOIN usuarios u ON u.id = a.usuario_id
       LEFT JOIN registros r ON r.id = a.registro_id
       LEFT JOIN almacenes ao ON ao.id = r.almacen_origen_id
       LEFT JOIN almacenes ad ON ad.id = r.almacen_destino_id
       LEFT JOIN skus sk ON sk.id = r.sku_id
       ${where}`,
      params
    );

    const [rows] = await pool.query(
      `SELECT a.*,
              CONCAT(u.nombre, ' ', u.apellido) AS actor_nombre,
              r.estado AS estado_actual,
              ao.nombre AS almacen_origen,
              ad.nombre AS almacen_destino,
              sk.nombre AS sku_nombre
       FROM audit_log a
       LEFT JOIN usuarios u ON u.id = a.usuario_id
       LEFT JOIN registros r ON r.id = a.registro_id
       LEFT JOIN almacenes ao ON ao.id = r.almacen_origen_id
       LEFT JOIN almacenes ad ON ad.id = r.almacen_destino_id
       LEFT JOIN skus sk ON sk.id = r.sku_id
       ${where}
       ${orderBy}
       LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );

    const datos = rows.map((row) => {
      const detalle_json = parseAuditDetail(row.detalle);
      return {
        ...row,
        detalle_json,
        descripcion: describeAuditAction(row.accion, detalle_json),
      };
    });

    res.json({
      ok: true,
      datos,
      paginacion: {
        total: Number(total),
        page,
        limit,
        pages: Math.ceil(Number(total) / limit),
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, mensaje: 'Error interno' });
  }
});

router.get('/registros/export/excel', requireRol('superadmin', 'admin', 'supervisor'), async (req, res) => {
  try {
    const { where, params, orderBy } = await buildAuditQuery(req);
    const [rows] = await pool.query(
      `SELECT a.*,
              CONCAT(u.nombre, ' ', u.apellido) AS actor_nombre,
              r.estado AS estado_actual,
              ao.nombre AS almacen_origen,
              ad.nombre AS almacen_destino,
              sk.nombre AS sku_nombre
       FROM audit_log a
       LEFT JOIN usuarios u ON u.id = a.usuario_id
       LEFT JOIN registros r ON r.id = a.registro_id
       LEFT JOIN almacenes ao ON ao.id = r.almacen_origen_id
       LEFT JOIN almacenes ad ON ad.id = r.almacen_destino_id
       LEFT JOIN skus sk ON sk.id = r.sku_id
       ${where}
       ${orderBy}`,
      params
    );

    const excelRows = rows.map((row) => {
      const detalle_json = parseAuditDetail(row.detalle);
      return {
        fecha: row.created_at ? new Date(row.created_at) : null,
        usuario: row.actor_nombre || 'Sistema',
        accion: row.accion,
        registro: row.registro_id ? `#${row.registro_id}` : '',
        estado_actual: row.estado_actual || '',
        sku: row.sku_nombre || '',
        almacen_origen: row.almacen_origen || '',
        almacen_destino: row.almacen_destino || '',
        detalle: describeAuditAction(row.accion, detalle_json),
      };
    });

    await sendExcelWorkbook(res, {
      fileName: `zentra_historial_${Date.now()}`,
      sheetName: 'Historial',
      columns: [
        { header: 'FECHA', key: 'fecha', width: 18, type: 'datetime' },
        { header: 'USUARIO', key: 'usuario', width: 26 },
        { header: 'ACCION', key: 'accion', width: 18 },
        { header: 'REGISTRO', key: 'registro', width: 14 },
        { header: 'ESTADO ACTUAL', key: 'estado_actual', width: 18 },
        { header: 'SKU', key: 'sku', width: 34 },
        { header: 'ALMACEN ORIGEN', key: 'almacen_origen', width: 24 },
        { header: 'ALMACEN DESTINO', key: 'almacen_destino', width: 24 },
        { header: 'DETALLE', key: 'detalle', width: 48 },
      ],
      rows: excelRows,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, mensaje: 'Error al exportar historial' });
  }
});

module.exports = router;
