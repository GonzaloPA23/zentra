const express = require('express');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const { pool } = require('../db');
const { authMiddleware, requireRol, empresaMiddleware } = require('../middleware/auth');
const {
  getAssignedWarehouseIds,
  getWarehouseScope,
  recordMatchesAssignedWarehouses,
} = require('../utils/warehouseScope');
const { insertAuditLog, buildRegistroAuditSnapshot } = require('../utils/audit');
const { sendExcelWorkbook } = require('../utils/excel');

const router = express.Router();
router.use(authMiddleware, empresaMiddleware);

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = process.env.UPLOAD_PATH || './uploads';
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const unique = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, unique + path.extname(file.originalname));
  },
});

const upload = multer({
  storage,
  limits: { fileSize: parseInt(process.env.MAX_FILE_SIZE || '', 10) || 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = /jpeg|jpg|png|pdf/;
    if (allowed.test(path.extname(file.originalname).toLowerCase())) cb(null, true);
    else cb(new Error('Solo se permiten JPG, PNG o PDF'));
  },
});

const ACCIONES = ['MERMA', 'DESPACHO A CANJISTAS', 'OTROS MOVIMIENTOS'];
const TIPOS_ACCION = ['ENTRADA', 'SALIDA'];
const ESTADOS = ['pendiente', 'en_transito', 'aprobado', 'rechazado'];
const ZONAS = ['LIMA', 'PROVINCIA'];
const STOCK_MOVEMENT_EFFECTS = {
  APROBACION: { originDelta: -1, destinationDelta: 1 },
  SALIDA_TRANSITO: { originDelta: -1, destinationDelta: 0 },
  INGRESO_APROBADO: { originDelta: 0, destinationDelta: 1 },
  REVERSA_RECHAZO: { originDelta: 1, destinationDelta: 0 },
};

const DETAIL_COUNT_EXPR = 'COALESCE((SELECT COUNT(*) FROM registro_detalles rd_count WHERE rd_count.registro_id = r.id), 0)';
const TOTAL_CANTIDAD_EXPR = 'COALESCE((SELECT SUM(rd_total.cantidad) FROM registro_detalles rd_total WHERE rd_total.registro_id = r.id), r.cantidad, 0)';
const PRIMARY_SKU_EXPR = `COALESCE((
  SELECT MIN(sk_detail.nombre)
  FROM registro_detalles rd_sku
  JOIN skus sk_detail ON sk_detail.id = rd_sku.sku_id
  WHERE rd_sku.registro_id = r.id
), sk.nombre, '')`;
const ZONA_EXPR = "CASE WHEN UPPER(ci.nombre)='LIMA' THEN 'LIMA' ELSE 'PROVINCIA' END";

const REGISTRO_SORT_FIELDS = {
  fecha: 'r.fecha',
  almacen_origen: 'ao.nombre',
  almacen_destino: 'ad.nombre',
  categoria: 'ca.nombre',
  tipo_accion: 'r.tipo_accion',
  sku: PRIMARY_SKU_EXPR,
  cantidad: TOTAL_CANTIDAD_EXPR,
  estado: 'r.estado',
  registrado_por: 'u.nombre',
  nro_guia: 'r.nro_guia',
};

function cleanupUploadedFile(fileName) {
  if (!fileName) return;
  const uploadDir = process.env.UPLOAD_PATH || './uploads';
  const fullPath = path.resolve(uploadDir, fileName);
  fs.unlink(fullPath, () => {});
}

function sendBadRequest(res, mensaje) {
  return res.status(400).json({ ok: false, mensaje });
}

function sendForbidden(res, mensaje) {
  return res.status(403).json({ ok: false, mensaje });
}

function getZonaFromCityName(ciudadNombre) {
  return String(ciudadNombre || '').toUpperCase() === 'LIMA' ? 'LIMA' : 'PROVINCIA';
}

function normalizeOptionalString(value) {
  if (value === null || value === undefined) return null;
  const normalized = String(value).trim();
  return normalized ? normalized : null;
}

function padDateSegment(value) {
  return String(value).padStart(2, '0');
}

function normalizeDateInputValue(value) {
  if (value === null || value === undefined || value === '') return null;

  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;
    return `${value.getUTCFullYear()}-${padDateSegment(value.getUTCMonth() + 1)}-${padDateSegment(value.getUTCDate())}`;
  }

  const raw = String(value).trim();
  if (!raw || raw === '0000-00-00' || raw === '0000-00-00 00:00:00') return null;

  const isoMatch = raw.match(/^(\d{4}-\d{2}-\d{2})/);
  if (isoMatch) {
    return isoMatch[1];
  }

  const parsedDate = new Date(raw);
  if (Number.isNaN(parsedDate.getTime())) return null;

  return `${parsedDate.getUTCFullYear()}-${padDateSegment(parsedDate.getUTCMonth() + 1)}-${padDateSegment(parsedDate.getUTCDate())}`;
}

function isValidDateInput(value) {
  return !!normalizeDateInputValue(value);
}

function parsePositiveInt(value) {
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function parsePositiveFloat(value) {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function parseFlag(value) {
  return value === true || value === 1 || value === '1';
}

function ensureArray(value) {
  if (Array.isArray(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    return JSON.parse(value);
  }
  return [];
}

function buildFallbackDetailsFromBody(body = {}) {
  if (!body?.sku_id && !body?.tipo_mercaderia_id && !body?.lote_id && !body?.cantidad) {
    return [];
  }

  return [{
    tipo_mercaderia_id: body.tipo_mercaderia_id,
    sku_id: body.sku_id,
    lote_id: body.lote_id,
    fecha_vencimiento: body.fecha_vencimiento,
    cantidad: body.cantidad,
  }];
}

function parseRegistroBody(body = {}, fallback = {}) {
  let detalles = [];

  try {
    detalles = ensureArray(body.detalles);
  } catch (error) {
    throw new Error('El detalle del registro no tiene un formato válido');
  }

  if (!detalles.length) {
    detalles = buildFallbackDetailsFromBody(body);
  }
  if (!detalles.length && Array.isArray(fallback.detalles)) {
    detalles = fallback.detalles;
  }

  return {
    fecha: String(body.fecha ?? fallback.fecha ?? '').trim(),
    zona: String(body.zona ?? fallback.zona ?? '').trim().toUpperCase(),
    ciudad_id: body.ciudad_id ?? fallback.ciudad_id ?? '',
    almacen_origen_id: body.almacen_origen_id ?? fallback.almacen_origen_id ?? '',
    almacen_destino_id: body.almacen_destino_id ?? fallback.almacen_destino_id ?? '',
    categoria_id: body.categoria_id ?? fallback.categoria_id ?? '',
    accion: String(body.accion ?? fallback.accion ?? '').trim(),
    tipo_accion: String(body.tipo_accion ?? fallback.tipo_accion ?? '').trim().toUpperCase(),
    personal_receptor_id: body.personal_receptor_id ?? fallback.personal_receptor_id ?? '',
    indicador_id: body.indicador_id ?? fallback.indicador_id ?? '',
    nro_guia: String(body.nro_guia ?? fallback.nro_guia ?? '').trim(),
    observaciones: String(body.observaciones ?? fallback.observaciones ?? '').trim(),
    detalles,
  };
}

function addLikeFilter(where, params, value, expression) {
  const term = String(value || '').trim();
  if (!term) return where;

  where += ` AND ${expression} LIKE ?`;
  params.push(`%${term}%`);
  return where;
}

async function getStockScope(req, alias = 'sa', executor = pool) {
  if (!req?.usuario || !['almacenero', 'supervisor'].includes(req.usuario.rol)) {
    return { clause: '', params: [] };
  }

  const ids = await getAssignedWarehouseIds(req.usuario.id, executor);
  if (!ids.length) return { clause: '', params: [] };

  const placeholders = ids.map(() => '?').join(',');
  return {
    clause: ` AND ${alias}.almacen_id IN (${placeholders})`,
    params: ids,
  };
}

async function buildRegistroQuery(req, executor = pool) {
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

  const scope = await getWarehouseScope(req, 'r', executor);
  const fromClause = `FROM registros r
    LEFT JOIN almacenes ao ON ao.id = r.almacen_origen_id
    LEFT JOIN almacenes ad ON ad.id = r.almacen_destino_id
    LEFT JOIN ciudades ci ON ci.id = r.ciudad_id
    LEFT JOIN categorias ca ON ca.id = r.categoria_id
    LEFT JOIN personal_receptor pr ON pr.id = r.personal_receptor_id
    LEFT JOIN indicadores ind ON ind.id = r.indicador_id
    LEFT JOIN usuarios u ON u.id = r.usuario_id
    LEFT JOIN skus sk ON sk.id = r.sku_id`;

  let where = req.empresa_id ? 'WHERE r.empresa_id = ?' : 'WHERE 1=1';
  const params = req.empresa_id ? [req.empresa_id] : [];

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
  where = addLikeFilter(where, params, q_estado, 'r.estado');
  where = addLikeFilter(where, params, q_registrado_por, "CONCAT(COALESCE(u.nombre,''),' ',COALESCE(u.apellido,''))");
  where = addLikeFilter(where, params, q_nro_guia, 'r.nro_guia');

  const skuTerm = String(q_sku || '').trim();
  if (skuTerm) {
    where += ` AND (
      EXISTS (
        SELECT 1
        FROM registro_detalles rd_q
        JOIN skus sk_q ON sk_q.id = rd_q.sku_id
        WHERE rd_q.registro_id = r.id
          AND sk_q.nombre LIKE ?
      )
      OR (
        NOT EXISTS (SELECT 1 FROM registro_detalles rd_empty WHERE rd_empty.registro_id = r.id)
        AND sk.nombre LIKE ?
      )
    )`;
    params.push(`%${skuTerm}%`, `%${skuTerm}%`);
  }

  where += scope.clause;
  params.push(...scope.params);

  const sortField = REGISTRO_SORT_FIELDS[sort_by] || REGISTRO_SORT_FIELDS.fecha;
  const sortDirection = String(sort_dir).toLowerCase() === 'asc' ? 'ASC' : 'DESC';

  return {
    fromClause,
    where,
    params,
    orderBy: `ORDER BY ${sortField} ${sortDirection}, r.id DESC`,
    page: Math.max(1, Number.parseInt(page, 10) || 1),
    limit: Math.min(500, Math.max(1, Number.parseInt(limit, 10) || 50)),
  };
}

async function attachRegistroDetails(executor, registros) {
  if (!Array.isArray(registros) || !registros.length) return registros;

  const ids = registros.map((registro) => Number(registro.id)).filter(Boolean);
  const placeholders = ids.map(() => '?').join(',');
  const detailsByRegistro = new Map();

  const [detailRows] = await executor.query(
    `SELECT rd.id, rd.registro_id, rd.tipo_mercaderia_id, rd.sku_id, rd.lote_id,
            rd.fecha_vencimiento, rd.cantidad,
            tm.nombre AS tipo_mercaderia_nombre,
            sk.nombre AS sku_nombre,
            sk.codigo AS sku_codigo,
            lo.codigo_lote,
            lo.fecha_vencimiento AS lote_fecha_vencimiento
     FROM registro_detalles rd
     LEFT JOIN tipos_mercaderia tm ON tm.id = rd.tipo_mercaderia_id
     LEFT JOIN skus sk ON sk.id = rd.sku_id
     LEFT JOIN lotes lo ON lo.id = rd.lote_id
     WHERE rd.registro_id IN (${placeholders})
     ORDER BY rd.registro_id, rd.id`,
    ids
  );

  detailRows.forEach((row) => {
    const list = detailsByRegistro.get(Number(row.registro_id)) || [];
    list.push({
      id: row.id,
      registro_id: Number(row.registro_id),
      tipo_mercaderia_id: row.tipo_mercaderia_id ? Number(row.tipo_mercaderia_id) : null,
      tipo_mercaderia_nombre: row.tipo_mercaderia_nombre || '',
      sku_id: row.sku_id ? Number(row.sku_id) : null,
      sku_nombre: row.sku_nombre || '',
      sku_codigo: row.sku_codigo || '',
      lote_id: row.lote_id ? Number(row.lote_id) : null,
      codigo_lote: row.codigo_lote || '',
      fecha_vencimiento: row.fecha_vencimiento || row.lote_fecha_vencimiento || null,
      cantidad: Number(row.cantidad || 0),
    });
    detailsByRegistro.set(Number(row.registro_id), list);
  });

  const registrosSinDetalle = ids.filter((id) => !detailsByRegistro.has(id));
  if (registrosSinDetalle.length) {
    const fallbackPlaceholders = registrosSinDetalle.map(() => '?').join(',');
    const [legacyRows] = await executor.query(
      `SELECT r.id AS registro_id, r.tipo_mercaderia_id, r.sku_id, r.lote_id, r.fecha_vencimiento, r.cantidad,
              tm.nombre AS tipo_mercaderia_nombre,
              sk.nombre AS sku_nombre,
              sk.codigo AS sku_codigo,
              lo.codigo_lote,
              lo.fecha_vencimiento AS lote_fecha_vencimiento
       FROM registros r
       LEFT JOIN tipos_mercaderia tm ON tm.id = r.tipo_mercaderia_id
       LEFT JOIN skus sk ON sk.id = r.sku_id
       LEFT JOIN lotes lo ON lo.id = r.lote_id
       WHERE r.id IN (${fallbackPlaceholders})`,
      registrosSinDetalle
    );

    legacyRows.forEach((row) => {
      detailsByRegistro.set(Number(row.registro_id), [{
        id: null,
        registro_id: Number(row.registro_id),
        tipo_mercaderia_id: row.tipo_mercaderia_id ? Number(row.tipo_mercaderia_id) : null,
        tipo_mercaderia_nombre: row.tipo_mercaderia_nombre || '',
        sku_id: row.sku_id ? Number(row.sku_id) : null,
        sku_nombre: row.sku_nombre || '',
        sku_codigo: row.sku_codigo || '',
        lote_id: row.lote_id ? Number(row.lote_id) : null,
        codigo_lote: row.codigo_lote || '',
        fecha_vencimiento: row.fecha_vencimiento || row.lote_fecha_vencimiento || null,
        cantidad: Number(row.cantidad || 0),
      }]);
    });
  }

  return registros.map((registro) => {
    const detalles = detailsByRegistro.get(Number(registro.id)) || [];
    const cantidadTotal = detalles.reduce((acc, detail) => acc + Number(detail.cantidad || 0), 0) || Number(registro.cantidad_total || 0);
    const skuPrincipal = detalles[0]?.sku_nombre || registro.sku_principal_nombre || '';
    const skuResumen = !detalles.length
      ? '-'
      : detalles.length === 1
        ? skuPrincipal
        : `${skuPrincipal} +${detalles.length - 1} más`;

    return {
      ...registro,
      cantidad_total: cantidadTotal,
      detalles_count: detalles.length || Number(registro.detalles_count || 0) || 1,
      sku_principal_nombre: skuPrincipal,
      sku_resumen: skuResumen,
      detalles,
    };
  });
}

async function fetchRegistroRows(executor, req, { paginate = true } = {}) {
  const { fromClause, where, params, orderBy, page, limit } = await buildRegistroQuery(req, executor);
  const baseSelect = `SELECT r.*,
      ao.nombre AS almacen_origen,
      ad.nombre AS almacen_destino,
      ci.nombre AS ciudad_nombre,
      ${ZONA_EXPR} AS zona,
      ca.nombre AS categoria_nombre,
      pr.nombre AS personal_receptor_nombre,
      ind.nombre AS indicador_nombre,
      CONCAT(COALESCE(u.nombre,''),' ',COALESCE(u.apellido,'')) AS registrado_por,
      ${PRIMARY_SKU_EXPR} AS sku_principal_nombre,
      ${TOTAL_CANTIDAD_EXPR} AS cantidad_total,
      GREATEST(${DETAIL_COUNT_EXPR}, 1) AS detalles_count
    ${fromClause}
    ${where}
    ${orderBy}`;

  let rows = [];
  let paginacion = null;

  if (paginate) {
    const offset = (page - 1) * limit;
    const [[{ total }]] = await executor.query(
      `SELECT COUNT(*) AS total ${fromClause} ${where}`,
      params
    );

    const [queryRows] = await executor.query(
      `${baseSelect} LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );

    rows = queryRows;
    paginacion = {
      total: Number(total || 0),
      page,
      limit,
      pages: Math.max(1, Math.ceil(Number(total || 0) / limit)),
    };
  } else {
    const [queryRows] = await executor.query(baseSelect, params);
    rows = queryRows;
  }

  const enrichedRows = await attachRegistroDetails(executor, rows);
  return { rows: enrichedRows, paginacion };
}

async function getRegistroById(executor, req, id) {
  let query = `SELECT r.*,
      ao.nombre AS almacen_origen,
      ad.nombre AS almacen_destino,
      ci.nombre AS ciudad_nombre,
      ${ZONA_EXPR} AS zona,
      ca.nombre AS categoria_nombre,
      pr.nombre AS personal_receptor_nombre,
      ind.nombre AS indicador_nombre,
      CONCAT(COALESCE(u.nombre,''),' ',COALESCE(u.apellido,'')) AS registrado_por
    FROM registros r
    LEFT JOIN almacenes ao ON ao.id = r.almacen_origen_id
    LEFT JOIN almacenes ad ON ad.id = r.almacen_destino_id
    LEFT JOIN ciudades ci ON ci.id = r.ciudad_id
    LEFT JOIN categorias ca ON ca.id = r.categoria_id
    LEFT JOIN personal_receptor pr ON pr.id = r.personal_receptor_id
    LEFT JOIN indicadores ind ON ind.id = r.indicador_id
    LEFT JOIN usuarios u ON u.id = r.usuario_id
    WHERE r.id=?`;
  const params = [id];

  if (req.empresa_id) {
    query += ' AND r.empresa_id=?';
    params.push(req.empresa_id);
  }

  const [rows] = await executor.query(query, params);
  if (!rows.length) return null;

  const scope = await getWarehouseScope(req, 'r', executor);
  if (!recordMatchesAssignedWarehouses(rows[0], scope.ids)) {
    const error = new Error('Sin acceso a este registro');
    error.statusCode = 403;
    throw error;
  }

  const [registro] = await attachRegistroDetails(executor, rows);
  return registro;
}

async function upsertStock(executor, { empresa_id, almacen_id, sku_id, lote_id, cantidad }) {
  if (!almacen_id || !sku_id || !cantidad) return;

  const normalizedCantidad = Number(cantidad || 0);
  if (!normalizedCantidad) return;

  const normalizedLoteId = parsePositiveInt(lote_id) || null;
  const [existingRows] = await executor.query(
    normalizedLoteId
      ? `SELECT id, cantidad
         FROM stock_almacen
         WHERE empresa_id=? AND almacen_id=? AND sku_id=? AND lote_id=?
         LIMIT 1`
      : `SELECT id, cantidad
         FROM stock_almacen
         WHERE empresa_id=? AND almacen_id=? AND sku_id=? AND lote_id IS NULL
         LIMIT 1`,
    normalizedLoteId
      ? [empresa_id, almacen_id, sku_id, normalizedLoteId]
      : [empresa_id, almacen_id, sku_id]
  );

  if (existingRows.length) {
    const stockId = existingRows[0].id;
    const nextCantidad = Number(existingRows[0].cantidad || 0) + normalizedCantidad;

    if (Math.abs(nextCantidad) < 0.000001) {
      await executor.query('DELETE FROM stock_almacen WHERE id=?', [stockId]);
      return;
    }

    await executor.query(
      'UPDATE stock_almacen SET cantidad=?, updated_at=CURRENT_TIMESTAMP WHERE id=?',
      [nextCantidad, stockId]
    );
    return;
  }

  await executor.query(
    `INSERT INTO stock_almacen (empresa_id, almacen_id, sku_id, lote_id, cantidad)
     VALUES (?,?,?,?,?)`,
    [empresa_id, almacen_id, sku_id, normalizedLoteId, normalizedCantidad]
  );
}

function getMovementEffects(tipoMovimiento = 'APROBACION') {
  return STOCK_MOVEMENT_EFFECTS[tipoMovimiento] || STOCK_MOVEMENT_EFFECTS.APROBACION;
}

async function insertStockMovement(executor, movement) {
  await executor.query(
    `INSERT INTO stock_movimientos
     (empresa_id, registro_id, registro_detalle_id, almacen_origen_id, almacen_destino_id, sku_id, lote_id, cantidad, tipo_movimiento, usuario_id)
     VALUES (?,?,?,?,?,?,?,?,?,?)`,
    [
      movement.empresa_id,
      movement.registro_id,
      movement.registro_detalle_id || null,
      movement.almacen_origen_id,
      movement.almacen_destino_id,
      movement.sku_id,
      parsePositiveInt(movement.lote_id) || null,
      movement.cantidad,
      movement.tipo_movimiento,
      movement.usuario_id || null,
    ]
  );
}

async function applyStockMovementBatch(executor, registro, tipoMovimiento, usuarioId) {
  const detalles = Array.isArray(registro.detalles) ? registro.detalles : [];
  const effects = getMovementEffects(tipoMovimiento);

  for (const detail of detalles) {
    const cantidad = Number(detail.cantidad || 0);
    if (!cantidad) continue;

    if (effects.originDelta && registro.almacen_origen_id) {
      await upsertStock(executor, {
        empresa_id: registro.empresa_id,
        almacen_id: registro.almacen_origen_id,
        sku_id: detail.sku_id,
        lote_id: detail.lote_id,
        cantidad: cantidad * effects.originDelta,
      });
    }

    if (effects.destinationDelta && registro.almacen_destino_id) {
      await upsertStock(executor, {
        empresa_id: registro.empresa_id,
        almacen_id: registro.almacen_destino_id,
        sku_id: detail.sku_id,
        lote_id: detail.lote_id,
        cantidad: cantidad * effects.destinationDelta,
      });
    }

    await insertStockMovement(executor, {
      empresa_id: registro.empresa_id,
      registro_id: registro.id,
      registro_detalle_id: detail.id || null,
      almacen_origen_id: registro.almacen_origen_id,
      almacen_destino_id: registro.almacen_destino_id,
      sku_id: detail.sku_id,
      lote_id: detail.lote_id,
      cantidad,
      tipo_movimiento: tipoMovimiento,
      usuario_id: usuarioId || registro.usuario_id,
    });
  }
}

async function reverseRecordedStockMovements(executor, registroId) {
  const [movimientos] = await executor.query(
    'SELECT * FROM stock_movimientos WHERE registro_id=? ORDER BY id DESC',
    [registroId]
  );

  if (!movimientos.length) {
    return;
  }

  for (const movimiento of movimientos) {
    const cantidad = Number(movimiento.cantidad || 0);
    const effects = getMovementEffects(movimiento.tipo_movimiento);

    if (effects.originDelta && movimiento.almacen_origen_id) {
      await upsertStock(executor, {
        empresa_id: movimiento.empresa_id,
        almacen_id: movimiento.almacen_origen_id,
        sku_id: movimiento.sku_id,
        lote_id: movimiento.lote_id,
        cantidad: cantidad * effects.originDelta * -1,
      });
    }

    if (effects.destinationDelta && movimiento.almacen_destino_id) {
      await upsertStock(executor, {
        empresa_id: movimiento.empresa_id,
        almacen_id: movimiento.almacen_destino_id,
        sku_id: movimiento.sku_id,
        lote_id: movimiento.lote_id,
        cantidad: cantidad * effects.destinationDelta * -1,
      });
    }
  }

  await executor.query('DELETE FROM stock_movimientos WHERE registro_id=?', [registroId]);
}

async function registroHasStockMovements(executor, registroId) {
  const [[row]] = await executor.query(
    'SELECT EXISTS(SELECT 1 FROM stock_movimientos WHERE registro_id=? LIMIT 1) AS has_movimientos',
    [registroId]
  );
  return !!row?.has_movimientos;
}

function ensureEstadoTransitionAllowed(actual, next) {
  if (actual === next) return;

  const allowedTransitions = {
    pendiente: ['en_transito', 'aprobado', 'rechazado'],
    en_transito: ['aprobado', 'rechazado'],
    rechazado: [],
    aprobado: [],
  };

  if (!allowedTransitions[actual]?.includes(next)) {
    const error = new Error(`No se puede pasar de ${actual} a ${next}`);
    error.statusCode = 400;
    throw error;
  }
}

async function applyApprovalStock(executor, registro) {
  const detalles = Array.isArray(registro.detalles) ? registro.detalles : [];
  if (!detalles.length) return;
  await applyStockMovementBatch(executor, registro, 'SALIDA_TRANSITO', registro.aprobado_por || registro.usuario_id);
  await applyStockMovementBatch(executor, registro, 'INGRESO_APROBADO', registro.aprobado_por || registro.usuario_id);
}

async function reverseApprovalStock(executor, registro) {
  await reverseRecordedStockMovements(executor, registro.id);
}

function buildHeaderValues(payload, detalles) {
  const firstDetail = detalles[0] || {};
  const totalCantidad = detalles.reduce((acc, detail) => acc + Number(detail.cantidad || 0), 0);

  return {
    fecha: payload.fecha,
    ciudad_id: payload.ciudad_id,
    almacen_origen_id: payload.almacen_origen_id,
    almacen_destino_id: payload.almacen_destino_id,
    categoria_id: payload.categoria_id,
    accion: payload.accion,
    tipo_accion: payload.tipo_accion,
    personal_receptor_id: payload.personal_receptor_id,
    indicador_id: payload.indicador_id,
    tipo_mercaderia_id: firstDetail.tipo_mercaderia_id || null,
    sku_id: firstDetail.sku_id || null,
    lote_id: firstDetail.lote_id || null,
    fecha_vencimiento: firstDetail.fecha_vencimiento || null,
    cantidad: totalCantidad,
    nro_guia: payload.nro_guia,
    observaciones: payload.observaciones,
  };
}

async function syncRegistroDetails(executor, registroId, detalles) {
  await executor.query('DELETE FROM registro_detalles WHERE registro_id=?', [registroId]);
  if (!detalles.length) return;

  const values = [];
  const placeholders = detalles.map((detail) => {
    values.push(
      registroId,
      detail.tipo_mercaderia_id,
      detail.sku_id,
      detail.lote_id,
      detail.fecha_vencimiento,
      detail.cantidad
    );
    return '(?,?,?,?,?,?)';
  }).join(',');

  await executor.query(
    `INSERT INTO registro_detalles
     (registro_id, tipo_mercaderia_id, sku_id, lote_id, fecha_vencimiento, cantidad)
     VALUES ${placeholders}`,
    values
  );
}

async function persistMissingLoteDates(executor, details) {
  const pendingUpdates = new Map();

  details.forEach((detail) => {
    if (detail.should_update_lote_fecha && detail.lote_id && detail.fecha_vencimiento) {
      pendingUpdates.set(detail.lote_id, detail.fecha_vencimiento);
    }
  });

  for (const [loteId, fechaVencimiento] of pendingUpdates.entries()) {
    await executor.query(
      'UPDATE lotes SET fecha_vencimiento=? WHERE id=? AND (fecha_vencimiento IS NULL OR fecha_vencimiento="")',
      [fechaVencimiento, loteId]
    );
  }
}

async function validateRegistroPayloadV2(executor, req, payload, { currentFotoGuia = null } = {}) {
  if (!isValidDateInput(payload.fecha)) {
    throw new Error('Fecha invalida');
  }
  if (!ZONAS.includes(payload.zona)) {
    throw new Error('Zona invalida');
  }
  if (!ACCIONES.includes(payload.accion)) {
    throw new Error('Accion invalida');
  }
  if (!TIPOS_ACCION.includes(payload.tipo_accion)) {
    throw new Error('Tipo de accion invalido');
  }

  const ciudadId = parsePositiveInt(payload.ciudad_id);
  const almacenOrigenId = parsePositiveInt(payload.almacen_origen_id);
  const almacenDestinoId = parsePositiveInt(payload.almacen_destino_id);
  const categoriaId = parsePositiveInt(payload.categoria_id);
  const personalReceptorId = parsePositiveInt(payload.personal_receptor_id);
  const indicadorId = parsePositiveInt(payload.indicador_id);

  if (!ciudadId) throw new Error('Ciudad requerida');
  if (!almacenOrigenId) throw new Error('Almacen origen requerido');
  if (!almacenDestinoId) throw new Error('Almacen destino requerido');
  if (!categoriaId) throw new Error('Categoria requerida');
  if (!personalReceptorId) throw new Error('Personal receptor requerido');
  if (!indicadorId) throw new Error('Indicador requerido');
  if (!normalizeOptionalString(payload.nro_guia)) throw new Error('Numero de guia requerido');
  if (!normalizeOptionalString(payload.observaciones)) throw new Error('Observaciones requeridas');
  if (!req.file && !currentFotoGuia) throw new Error('Foto guia requerida');

  if (!Array.isArray(payload.detalles) || !payload.detalles.length) {
    throw new Error('Debe registrar al menos una linea de detalle');
  }

  const scope = await getWarehouseScope(req, 'r', executor);
  if (scope.ids.length && !scope.ids.some((id) => id === almacenOrigenId || id === almacenDestinoId)) {
    const error = new Error('El registro no pertenece a tus almacenes asignados');
    error.statusCode = 403;
    throw error;
  }

  let cityQuery = `SELECT c.id, c.nombre,
                          CASE WHEN UPPER(c.nombre)='LIMA' THEN 'LIMA' ELSE 'PROVINCIA' END AS zona
                   FROM ciudades c
                   JOIN regiones r ON r.id = c.region_id
                   WHERE c.id=? AND c.activo=1`;
  const cityParams = [ciudadId];
  if (req.empresa_id) {
    cityQuery += ' AND r.empresa_id=?';
    cityParams.push(req.empresa_id);
  }
  const [cityRows] = await executor.query(cityQuery, cityParams);
  const city = cityRows[0];
  if (!city) throw new Error('Ciudad no encontrada');
  if (city.zona !== payload.zona) {
    throw new Error('La ciudad seleccionada no pertenece a la zona indicada');
  }

  const warehouseIds = [...new Set([almacenOrigenId, almacenDestinoId])];
  const warehousePlaceholders = warehouseIds.map(() => '?').join(',');
  let warehouseQuery = `SELECT a.id, a.ciudad_id,
                               CASE WHEN UPPER(c.nombre)='LIMA' THEN 'LIMA' ELSE 'PROVINCIA' END AS zona
                        FROM almacenes a
                        JOIN ciudades c ON c.id = a.ciudad_id
                        JOIN regiones r ON r.id = c.region_id
                        WHERE a.id IN (${warehousePlaceholders}) AND a.activo=1`;
  const warehouseParams = [...warehouseIds];
  if (req.empresa_id) {
    warehouseQuery += ' AND r.empresa_id=?';
    warehouseParams.push(req.empresa_id);
  }
  const [warehouseRows] = await executor.query(warehouseQuery, warehouseParams);
  const warehouseMap = new Map(warehouseRows.map((row) => [Number(row.id), row]));
  if (!warehouseMap.has(almacenOrigenId)) throw new Error('Almacen origen no encontrado');
  if (!warehouseMap.has(almacenDestinoId)) throw new Error('Almacen destino no encontrado');
  if (Number(warehouseMap.get(almacenOrigenId).ciudad_id) !== ciudadId) {
    throw new Error('El almacen origen no pertenece a la ciudad seleccionada');
  }
  if (String(warehouseMap.get(almacenDestinoId).zona || '').toUpperCase() !== payload.zona) {
    throw new Error('El almacen destino no pertenece a la zona seleccionada');
  }

  let categoryQuery = 'SELECT id FROM categorias WHERE id=? AND activo=1';
  const categoryParams = [categoriaId];
  if (req.empresa_id) {
    categoryQuery += ' AND empresa_id=?';
    categoryParams.push(req.empresa_id);
  }
  const [categoryRows] = await executor.query(categoryQuery, categoryParams);
  if (!categoryRows.length) throw new Error('Categoria no encontrada');

  let indicatorQuery = 'SELECT id FROM indicadores WHERE id=? AND activo=1';
  const indicatorParams = [indicadorId];
  if (req.empresa_id) {
    indicatorQuery += ' AND empresa_id=?';
    indicatorParams.push(req.empresa_id);
  }
  const [indicatorRows] = await executor.query(indicatorQuery, indicatorParams);
  if (!indicatorRows.length) throw new Error('Indicador no encontrado');

  const allowedPersonalWarehouseIds = [...new Set([almacenOrigenId, almacenDestinoId])];
  let personalQuery = `SELECT id
                       FROM personal_receptor
                       WHERE id=? AND activo=1
                         AND almacen_id IN (${allowedPersonalWarehouseIds.map(() => '?').join(',')})
                         AND categoria_id=?`;
  const personalParams = [personalReceptorId, ...allowedPersonalWarehouseIds, categoriaId];
  if (req.empresa_id) {
    personalQuery += ' AND empresa_id=?';
    personalParams.push(req.empresa_id);
  }
  const [personalRows] = await executor.query(personalQuery, personalParams);
  if (!personalRows.length) {
    throw new Error('El personal receptor debe pertenecer al almacen origen o destino y a la categoria seleccionada');
  }

  const normalizedDetails = [];
  const typeIds = [];
  const skuIds = [];
  const loteIds = [];

  payload.detalles.forEach((detail) => {
    if (detail?.tipo_mercaderia_id) typeIds.push(Number(detail.tipo_mercaderia_id));
    if (detail?.sku_id) skuIds.push(Number(detail.sku_id));
    if (detail?.lote_id) loteIds.push(Number(detail.lote_id));
  });

  const uniqueTypeIds = [...new Set(typeIds.filter(Boolean))];
  const uniqueSkuIds = [...new Set(skuIds.filter(Boolean))];
  const uniqueLoteIds = [...new Set(loteIds.filter(Boolean))];

  let typesMap = new Map();
  if (uniqueTypeIds.length) {
    const [typeRows] = await executor.query(
      `SELECT id, categoria_id, nombre
       FROM tipos_mercaderia
       WHERE id IN (${uniqueTypeIds.map(() => '?').join(',')}) AND activo=1`,
      uniqueTypeIds
    );
    typesMap = new Map(typeRows.map((row) => [Number(row.id), row]));
  }

  let skuMap = new Map();
  if (uniqueSkuIds.length) {
    let skuQuery = `SELECT *
                    FROM skus
                    WHERE id IN (${uniqueSkuIds.map(() => '?').join(',')}) AND activo=1`;
    const skuParams = [...uniqueSkuIds];
    if (req.empresa_id) {
      skuQuery += ' AND empresa_id=?';
      skuParams.push(req.empresa_id);
    }
    const [skuRows] = await executor.query(skuQuery, skuParams);
    skuMap = new Map(skuRows.map((row) => [Number(row.id), row]));
  }

  let loteMap = new Map();
  if (uniqueLoteIds.length) {
    let loteQuery = `SELECT l.*, s.empresa_id
                     FROM lotes l
                     JOIN skus s ON s.id = l.sku_id
                     WHERE l.id IN (${uniqueLoteIds.map(() => '?').join(',')}) AND l.activo=1`;
    const loteParams = [...uniqueLoteIds];
    if (req.empresa_id) {
      loteQuery += ' AND s.empresa_id=?';
      loteParams.push(req.empresa_id);
    }
    const [loteRows] = await executor.query(loteQuery, loteParams);
    loteMap = new Map(loteRows.map((row) => [Number(row.id), row]));
  }

  payload.detalles.forEach((detail, index) => {
    const lineNumber = index + 1;
    const tipoMercaderiaId = parsePositiveInt(detail?.tipo_mercaderia_id);
    const skuId = parsePositiveInt(detail?.sku_id);
    const loteId = parsePositiveInt(detail?.lote_id);
    const cantidad = parsePositiveFloat(detail?.cantidad);

    if (!tipoMercaderiaId) throw new Error(`Tipo de mercaderia requerido en la linea ${lineNumber}`);
    if (!skuId) throw new Error(`SKU requerido en la linea ${lineNumber}`);
    if (!cantidad) throw new Error(`Cantidad invalida en la linea ${lineNumber}`);

    const type = typesMap.get(tipoMercaderiaId);
    if (!type || Number(type.categoria_id) !== categoriaId) {
      throw new Error(`Tipo de mercaderia invalido en la linea ${lineNumber}`);
    }

    const sku = skuMap.get(skuId);
    if (!sku || Number(sku.categoria_id) !== categoriaId) {
      throw new Error(`SKU invalido en la linea ${lineNumber}`);
    }

    const skuManejaLote = parseFlag(sku.tiene_lote);
    const skuManejaVencimiento = parseFlag(sku.tiene_vencimiento);

    if (sku.zona !== payload.zona) {
      throw new Error(`El SKU de la linea ${lineNumber} no pertenece a la zona seleccionada`);
    }
    if (sku.tipo_mercaderia_id && Number(sku.tipo_mercaderia_id) !== tipoMercaderiaId) {
      throw new Error(`El SKU de la linea ${lineNumber} no corresponde al tipo de mercaderia elegido`);
    }

    let lote = null;
    let resolvedDate = null;

    if (skuManejaLote) {
      if (!loteId) {
        throw new Error(`Lote requerido en la linea ${lineNumber}`);
      }

      lote = loteMap.get(loteId);
      if (!lote || Number(lote.sku_id) !== skuId) {
        throw new Error(`El lote de la linea ${lineNumber} no pertenece al SKU seleccionado`);
      }

      resolvedDate = normalizeDateInputValue(lote.fecha_vencimiento);
      if (skuManejaVencimiento) {
        if (!resolvedDate || !isValidDateInput(resolvedDate)) {
          throw new Error(`El lote de la linea ${lineNumber} debe tener fecha de vencimiento`);
        }
      } else if (resolvedDate && !isValidDateInput(resolvedDate)) {
        throw new Error(`La fecha de vencimiento del lote en la linea ${lineNumber} no es valida`);
      }
    }

    normalizedDetails.push({
      tipo_mercaderia_id: tipoMercaderiaId,
      tipo_mercaderia_nombre: type.nombre,
      sku_id: skuId,
      sku_nombre: sku.nombre,
      lote_id: skuManejaLote ? loteId : null,
      codigo_lote: lote?.codigo_lote || '',
      fecha_vencimiento: resolvedDate,
      cantidad,
      should_update_lote_fecha: false,
    });
  });

  return {
    ...payload,
    ciudad_id: ciudadId,
    almacen_origen_id: almacenOrigenId,
    almacen_destino_id: almacenDestinoId,
    categoria_id: categoriaId,
    personal_receptor_id: personalReceptorId,
    indicador_id: indicadorId,
    nro_guia: normalizeOptionalString(payload.nro_guia),
    observaciones: normalizeOptionalString(payload.observaciones),
    detalles: normalizedDetails,
  };
}

async function validateRegistroPayload(executor, req, payload, { currentFotoGuia = null } = {}) {
  return validateRegistroPayloadV2(executor, req, payload, { currentFotoGuia });
  if (!isValidDateInput(payload.fecha)) {
    throw new Error('Fecha inválida');
  }
  if (!ZONAS.includes(payload.zona)) {
    throw new Error('Zona inválida');
  }
  if (!ACCIONES.includes(payload.accion)) {
    throw new Error('Acción inválida');
  }
  if (!TIPOS_ACCION.includes(payload.tipo_accion)) {
    throw new Error('Tipo de acción inválido');
  }

  const ciudadId = parsePositiveInt(payload.ciudad_id);
  const almacenOrigenId = parsePositiveInt(payload.almacen_origen_id);
  const almacenDestinoId = parsePositiveInt(payload.almacen_destino_id);
  const categoriaId = parsePositiveInt(payload.categoria_id);
  const personalReceptorId = parsePositiveInt(payload.personal_receptor_id);
  const indicadorId = parsePositiveInt(payload.indicador_id);

  if (!ciudadId) throw new Error('Ciudad requerida');
  if (!almacenOrigenId) throw new Error('Almacén origen requerido');
  if (!almacenDestinoId) throw new Error('Almacén destino requerido');
  if (!categoriaId) throw new Error('Categoría requerida');
  if (!personalReceptorId) throw new Error('Personal receptor requerido');
  if (!indicadorId) throw new Error('Indicador requerido');
  if (!normalizeOptionalString(payload.nro_guia)) throw new Error('Número de guía requerido');
  if (!normalizeOptionalString(payload.observaciones)) throw new Error('Observaciones requeridas');
  if (!req.file && !currentFotoGuia) throw new Error('Foto guía requerida');

  if (!Array.isArray(payload.detalles) || !payload.detalles.length) {
    throw new Error('Debe registrar al menos una línea de detalle');
  }

  const scope = await getWarehouseScope(req, 'r', executor);
  if (scope.ids.length && !scope.ids.some((id) => id === almacenOrigenId || id === almacenDestinoId)) {
    const error = new Error('El registro no pertenece a tus almacenes asignados');
    error.statusCode = 403;
    throw error;
  }

  let cityQuery = `SELECT c.id, c.nombre,
                      ${ZONA_EXPR} AS zona
                   FROM ciudades c
                   JOIN regiones r ON r.id = c.region_id
                   WHERE c.id=? AND c.activo=1`;
  const cityParams = [ciudadId];
  if (req.empresa_id) {
    cityQuery += ' AND r.empresa_id=?';
    cityParams.push(req.empresa_id);
  }
  const [cityRows] = await executor.query(cityQuery, cityParams);
  const city = cityRows[0];
  if (!city) throw new Error('Ciudad no encontrada');
  if (city.zona !== payload.zona) {
    throw new Error('La ciudad seleccionada no pertenece a la zona indicada');
  }

  const warehouseIds = [...new Set([almacenOrigenId, almacenDestinoId])];
  const warehousePlaceholders = warehouseIds.map(() => '?').join(',');
  let warehouseQuery = `SELECT a.id, a.ciudad_id
                        FROM almacenes a
                        JOIN ciudades c ON c.id = a.ciudad_id
                        JOIN regiones r ON r.id = c.region_id
                        WHERE a.id IN (${warehousePlaceholders}) AND a.activo=1`;
  const warehouseParams = [...warehouseIds];
  if (req.empresa_id) {
    warehouseQuery += ' AND r.empresa_id=?';
    warehouseParams.push(req.empresa_id);
  }
  const [warehouseRows] = await executor.query(warehouseQuery, warehouseParams);
  const warehouseMap = new Map(warehouseRows.map((row) => [Number(row.id), row]));
  if (!warehouseMap.has(almacenOrigenId)) throw new Error('Almacén origen no encontrado');
  if (!warehouseMap.has(almacenDestinoId)) throw new Error('Almacén destino no encontrado');
  if (Number(warehouseMap.get(almacenOrigenId).ciudad_id) !== ciudadId) {
    throw new Error('El almacén origen no pertenece a la ciudad seleccionada');
  }
  if (Number(warehouseMap.get(almacenDestinoId).ciudad_id) !== ciudadId) {
    throw new Error('El almacén destino no pertenece a la ciudad seleccionada');
  }

  let categoryQuery = 'SELECT id FROM categorias WHERE id=? AND activo=1';
  const categoryParams = [categoriaId];
  if (req.empresa_id) {
    categoryQuery += ' AND empresa_id=?';
    categoryParams.push(req.empresa_id);
  }
  const [categoryRows] = await executor.query(categoryQuery, categoryParams);
  if (!categoryRows.length) throw new Error('Categoría no encontrada');

  let indicatorQuery = 'SELECT id FROM indicadores WHERE id=? AND activo=1';
  const indicatorParams = [indicadorId];
  if (req.empresa_id) {
    indicatorQuery += ' AND empresa_id=?';
    indicatorParams.push(req.empresa_id);
  }
  const [indicatorRows] = await executor.query(indicatorQuery, indicatorParams);
  if (!indicatorRows.length) throw new Error('Indicador no encontrado');

  let personalQuery = 'SELECT id FROM personal_receptor WHERE id=? AND activo=1 AND almacen_id=? AND categoria_id=?';
  const personalParams = [personalReceptorId, almacenDestinoId, categoriaId];
  if (req.empresa_id) {
    personalQuery += ' AND empresa_id=?';
    personalParams.push(req.empresa_id);
  }
  const [personalRows] = await executor.query(personalQuery, personalParams);
  if (!personalRows.length) {
    throw new Error('El personal receptor debe pertenecer al almacén destino y a la categoría seleccionada');
  }

  const normalizedDetails = [];
  const typeIds = [];
  const skuIds = [];
  const loteIds = [];

  payload.detalles.forEach((detail) => {
    if (detail?.tipo_mercaderia_id) typeIds.push(Number(detail.tipo_mercaderia_id));
    if (detail?.sku_id) skuIds.push(Number(detail.sku_id));
    if (detail?.lote_id) loteIds.push(Number(detail.lote_id));
  });

  const uniqueTypeIds = [...new Set(typeIds.filter(Boolean))];
  const uniqueSkuIds = [...new Set(skuIds.filter(Boolean))];
  const uniqueLoteIds = [...new Set(loteIds.filter(Boolean))];

  let typesMap = new Map();
  if (uniqueTypeIds.length) {
    let typeQuery = `SELECT id, categoria_id, nombre
                     FROM tipos_mercaderia
                     WHERE id IN (${uniqueTypeIds.map(() => '?').join(',')}) AND activo=1`;
    const typeParams = [...uniqueTypeIds];
    const [typeRows] = await executor.query(typeQuery, typeParams);
    typesMap = new Map(typeRows.map((row) => [Number(row.id), row]));
  }

  let skuMap = new Map();
  if (uniqueSkuIds.length) {
    let skuQuery = `SELECT *
                    FROM skus
                    WHERE id IN (${uniqueSkuIds.map(() => '?').join(',')}) AND activo=1`;
    const skuParams = [...uniqueSkuIds];
    if (req.empresa_id) {
      skuQuery += ' AND empresa_id=?';
      skuParams.push(req.empresa_id);
    }
    const [skuRows] = await executor.query(skuQuery, skuParams);
    skuMap = new Map(skuRows.map((row) => [Number(row.id), row]));
  }

  let loteMap = new Map();
  if (uniqueLoteIds.length) {
    let loteQuery = `SELECT l.*, s.empresa_id
                     FROM lotes l
                     JOIN skus s ON s.id = l.sku_id
                     WHERE l.id IN (${uniqueLoteIds.map(() => '?').join(',')}) AND l.activo=1`;
    const loteParams = [...uniqueLoteIds];
    if (req.empresa_id) {
      loteQuery += ' AND s.empresa_id=?';
      loteParams.push(req.empresa_id);
    }
    const [loteRows] = await executor.query(loteQuery, loteParams);
    loteMap = new Map(loteRows.map((row) => [Number(row.id), row]));
  }

  payload.detalles.forEach((detail, index) => {
    const lineNumber = index + 1;
    const tipoMercaderiaId = parsePositiveInt(detail?.tipo_mercaderia_id);
    const skuId = parsePositiveInt(detail?.sku_id);
    const loteId = parsePositiveInt(detail?.lote_id);
    const cantidad = parsePositiveFloat(detail?.cantidad);

    if (!tipoMercaderiaId) throw new Error(`Tipo de mercadería requerido en la línea ${lineNumber}`);
    if (!skuId) throw new Error(`SKU requerido en la línea ${lineNumber}`);
    if (!loteId) throw new Error(`Lote requerido en la línea ${lineNumber}`);
    if (!cantidad) throw new Error(`Cantidad inválida en la línea ${lineNumber}`);

    const type = typesMap.get(tipoMercaderiaId);
    if (!type || Number(type.categoria_id) !== categoriaId) {
      throw new Error(`Tipo de mercadería inválido en la línea ${lineNumber}`);
    }

    const sku = skuMap.get(skuId);
    if (!sku || Number(sku.categoria_id) !== categoriaId) {
      throw new Error(`SKU inválido en la línea ${lineNumber}`);
    }
    if (sku.zona !== payload.zona) {
      throw new Error(`El SKU de la línea ${lineNumber} no pertenece a la zona seleccionada`);
    }
    if (sku.tipo_mercaderia_id && Number(sku.tipo_mercaderia_id) !== tipoMercaderiaId) {
      throw new Error(`El SKU de la línea ${lineNumber} no corresponde al tipo de mercadería elegido`);
    }

    const lote = loteMap.get(loteId);
    if (!lote || Number(lote.sku_id) !== skuId) {
      throw new Error(`El lote de la línea ${lineNumber} no pertenece al SKU seleccionado`);
    }

    const incomingDate = normalizeOptionalString(detail?.fecha_vencimiento);
    const resolvedDate = lote.fecha_vencimiento || incomingDate;
    if (!resolvedDate || !isValidDateInput(resolvedDate)) {
      throw new Error(`Fecha de vencimiento requerida en la línea ${lineNumber}`);
    }

    normalizedDetails.push({
      tipo_mercaderia_id: tipoMercaderiaId,
      tipo_mercaderia_nombre: type.nombre,
      sku_id: skuId,
      sku_nombre: sku.nombre,
      lote_id: loteId,
      codigo_lote: lote.codigo_lote,
      fecha_vencimiento: resolvedDate,
      cantidad,
      should_update_lote_fecha: !lote.fecha_vencimiento && !!incomingDate,
    });
  });

  return {
    ...payload,
    ciudad_id: ciudadId,
    almacen_origen_id: almacenOrigenId,
    almacen_destino_id: almacenDestinoId,
    categoria_id: categoriaId,
    personal_receptor_id: personalReceptorId,
    indicador_id: indicadorId,
    nro_guia: normalizeOptionalString(payload.nro_guia),
    observaciones: normalizeOptionalString(payload.observaciones),
    detalles: normalizedDetails,
  };
}

function mapRegistroExportRows(registros = []) {
  const rows = [];

  registros.forEach((registro) => {
    const detalles = Array.isArray(registro.detalles) && registro.detalles.length
      ? registro.detalles
      : [{
          tipo_mercaderia_nombre: '',
          sku_nombre: registro.sku_principal_nombre || '',
          codigo_lote: '',
          fecha_vencimiento: registro.fecha_vencimiento || null,
          cantidad: Number(registro.cantidad_total || 0),
        }];

    detalles.forEach((detail, index) => {
      rows.push({
        fecha: registro.fecha ? new Date(registro.fecha) : null,
        zona: registro.zona || getZonaFromCityName(registro.ciudad_nombre),
        ciudad: registro.ciudad_nombre || '',
        almacen_origen: registro.almacen_origen || '',
        almacen_destino: registro.almacen_destino || '',
        categoria: registro.categoria_nombre || '',
        accion: registro.accion || '',
        tipo_accion: registro.tipo_accion || '',
        personal_receptor: registro.personal_receptor_nombre || '',
        indicador: registro.indicador_nombre || '',
        item: index + 1,
        total_items: detalles.length,
        tipo_mercaderia: detail.tipo_mercaderia_nombre || '',
        sku: detail.sku_nombre || '',
        lote: detail.codigo_lote || '',
        fecha_vencimiento: detail.fecha_vencimiento ? new Date(detail.fecha_vencimiento) : null,
        cantidad: Number(detail.cantidad || 0),
        nro_guia: registro.nro_guia || '',
        estado: registro.estado || '',
        registrado_por: registro.registrado_por || '',
        observaciones: registro.observaciones || '',
      });
    });
  });

  return rows;
}

function buildStockReportMovementLabel(row, delta) {
  const accion = String(row.accion || '').trim().toUpperCase();
  const indicador = String(row.indicador_nombre || '').trim().toUpperCase();
  const direction = delta >= 0 ? 'INGRESO' : 'SALIDA';

  if (accion === 'MERMA') {
    return 'MERMA';
  }
  if (indicador) {
    return `${direction} ${indicador}`;
  }
  if (accion) {
    return `${direction} ${accion}`;
  }
  return direction;
}

function toMovementDateTime(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function isBeforeDate(date, isoDate) {
  if (!date || !isoDate) return false;
  return date < new Date(`${isoDate}T00:00:00`);
}

function isAfterDate(date, isoDate) {
  if (!date || !isoDate) return false;
  return date > new Date(`${isoDate}T23:59:59.999`);
}

function buildStockReportRows(movements = [], { fechaIni = '', fechaFin = '', warehouseScopeIds = [] } = {}) {
  const scopedWarehouseIds = Array.isArray(warehouseScopeIds) && warehouseScopeIds.length
    ? new Set(warehouseScopeIds.map((id) => Number(id)))
    : null;
  const reportMap = new Map();
  const movementLabels = [];
  const movementLabelSet = new Set();

  movements.forEach((movement) => {
    const movementDate = toMovementDateTime(movement.movimiento_fecha);
    const effects = getMovementEffects(movement.tipo_movimiento);
    const quantity = Number(movement.cantidad || 0);
    if (!quantity) return;

    const warehouseEntries = [];
    if (effects.originDelta && movement.almacen_origen_id) {
      warehouseEntries.push({
        almacen_id: Number(movement.almacen_origen_id),
        almacen_nombre: movement.almacen_origen_nombre || '',
        delta: quantity * effects.originDelta,
      });
    }
    if (effects.destinationDelta && movement.almacen_destino_id) {
      warehouseEntries.push({
        almacen_id: Number(movement.almacen_destino_id),
        almacen_nombre: movement.almacen_destino_nombre || '',
        delta: quantity * effects.destinationDelta,
      });
    }

    warehouseEntries.forEach((entry) => {
      if (scopedWarehouseIds && !scopedWarehouseIds.has(Number(entry.almacen_id))) {
        return;
      }

      const loteKey = movement.lote_id ? String(movement.lote_id) : 'sin-lote';
      const key = [
        entry.almacen_id,
        movement.sku_id,
        loteKey,
      ].join('|');

      if (!reportMap.has(key)) {
        reportMap.set(key, {
          almacen: entry.almacen_nombre || '',
          categoria: movement.categoria_nombre || '',
          tipo_mercaderia: movement.tipo_mercaderia_nombre || '',
          sku_codigo: movement.sku_codigo || '',
          sku: movement.sku_nombre || '',
          lote: movement.codigo_lote || 'SIN LOTE',
          fecha_vencimiento: movement.lote_fecha_vencimiento ? new Date(movement.lote_fecha_vencimiento) : null,
          stock_inicial: 0,
          stock_final: 0,
          _period_delta: 0,
        });
      }

      const reportRow = reportMap.get(key);
      if (isBeforeDate(movementDate, fechaIni)) {
        reportRow.stock_inicial += entry.delta;
        return;
      }
      if (isAfterDate(movementDate, fechaFin)) {
        return;
      }

      const label = buildStockReportMovementLabel(movement, entry.delta);
      if (!movementLabelSet.has(label)) {
        movementLabelSet.add(label);
        movementLabels.push(label);
      }

      reportRow[label] = Number(reportRow[label] || 0) + Math.abs(entry.delta);
      reportRow._period_delta += entry.delta;
    });
  });

  const rows = [...reportMap.values()]
    .map((row) => ({
      ...row,
      stock_inicial: Number(row.stock_inicial || 0),
      stock_final: Number(row.stock_inicial || 0) + Number(row._period_delta || 0),
    }))
    .filter((row) => {
      const hasMovementValues = movementLabels.some((label) => Number(row[label] || 0) !== 0);
      return hasMovementValues || Number(row.stock_inicial || 0) !== 0 || Number(row.stock_final || 0) !== 0;
    })
    .sort((a, b) => (
      String(a.almacen).localeCompare(String(b.almacen))
      || String(a.categoria).localeCompare(String(b.categoria))
      || String(a.sku).localeCompare(String(b.sku))
      || String(a.lote).localeCompare(String(b.lote))
    ));

  return { rows, movementLabels };
}

router.get('/', async (req, res) => {
  try {
    const { rows, paginacion } = await fetchRegistroRows(pool, req, { paginate: true });
    res.json({
      ok: true,
      datos: rows,
      paginacion,
    });
  } catch (err) {
    console.error(err);
    res.status(err.statusCode || 500).json({ ok: false, mensaje: err.message || 'Error interno' });
  }
});

router.get('/export/lotes/excel', requireRol('superadmin', 'admin', 'supervisor'), async (req, res) => {
  try {
    const stockScope = await getStockScope(req, 'sa');
    let query = `SELECT
        sa.almacen_id,
        sa.sku_id,
        sa.lote_id,
        sa.cantidad,
        a.nombre AS almacen_nombre,
        c.nombre AS ciudad_nombre,
        ${"CASE WHEN UPPER(c.nombre)='LIMA' THEN 'LIMA' ELSE 'PROVINCIA' END"} AS zona,
        ca.nombre AS categoria_nombre,
        tm.nombre AS tipo_mercaderia_nombre,
        sk.nombre AS sku_nombre,
        lo.codigo_lote,
        lo.fecha_vencimiento
      FROM stock_almacen sa
      JOIN almacenes a ON a.id = sa.almacen_id
      JOIN ciudades c ON c.id = a.ciudad_id
      JOIN skus sk ON sk.id = sa.sku_id
      JOIN categorias ca ON ca.id = sk.categoria_id
      LEFT JOIN tipos_mercaderia tm ON tm.id = sk.tipo_mercaderia_id
      JOIN lotes lo ON lo.id = sa.lote_id
      WHERE sa.cantidad <> 0`;
    const params = [];

    if (req.empresa_id) {
      query += ' AND sa.empresa_id = ?';
      params.push(req.empresa_id);
    }

    query += stockScope.clause;
    params.push(...stockScope.params);

    query += ' ORDER BY zona, ciudad_nombre, almacen_nombre, categoria_nombre, sku_nombre, codigo_lote';

    const [rows] = await pool.query(query, params);
    await sendExcelWorkbook(res, {
      fileName: `zentra_lotes_${Date.now()}`,
      sheetName: 'Lotes',
      columns: [
        { header: 'ZONA', key: 'zona', width: 14 },
        { header: 'CIUDAD', key: 'ciudad', width: 18 },
        { header: 'ALMACEN', key: 'almacen', width: 24 },
        { header: 'CATEGORIA', key: 'categoria', width: 18 },
        { header: 'TIPO MERCADERIA', key: 'tipo_mercaderia', width: 20 },
        { header: 'SKU', key: 'sku', width: 34 },
        { header: 'LOTE', key: 'lote', width: 18 },
        { header: 'FECHA VENCIMIENTO', key: 'fecha_vencimiento', width: 18, type: 'date' },
        { header: 'STOCK ACTUAL', key: 'stock_actual', width: 14, type: 'number' },
      ],
      rows: rows.map((row) => ({
        zona: row.zona,
        ciudad: row.ciudad_nombre,
        almacen: row.almacen_nombre,
        categoria: row.categoria_nombre,
        tipo_mercaderia: row.tipo_mercaderia_nombre || '',
        sku: row.sku_nombre,
        lote: row.codigo_lote,
        fecha_vencimiento: row.fecha_vencimiento ? new Date(row.fecha_vencimiento) : null,
        stock_actual: Number(row.cantidad || 0),
      })),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, mensaje: 'Error al exportar lotes' });
  }
});

router.get('/export/excel', requireRol('superadmin', 'admin', 'supervisor'), async (req, res) => {
  try {
    const { rows } = await fetchRegistroRows(pool, req, { paginate: false });
    const exportRows = mapRegistroExportRows(rows);
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
        { header: 'ITEM', key: 'item', width: 10, type: 'integer' },
        { header: 'TOTAL ITEMS', key: 'total_items', width: 12, type: 'integer' },
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
      rows: exportRows,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, mensaje: 'Error al exportar registros' });
  }
});

router.get('/export/stock/excel', requireRol('superadmin', 'admin', 'supervisor'), async (req, res) => {
  try {
    const fechaIni = String(req.query.fecha_ini || '').trim();
    const fechaFin = String(req.query.fecha_fin || '').trim();
    const categoriaId = parsePositiveInt(req.query.categoria_id);
    const requestedWarehouseId = parsePositiveInt(req.query.almacen_id);

    if (fechaIni && !isValidDateInput(fechaIni)) {
      return sendBadRequest(res, 'Fecha inicial invalida');
    }
    if (fechaFin && !isValidDateInput(fechaFin)) {
      return sendBadRequest(res, 'Fecha final invalida');
    }

    let query = `SELECT
        sm.id,
        sm.created_at AS movimiento_fecha,
        sm.tipo_movimiento,
        sm.cantidad,
        sm.almacen_origen_id,
        sm.almacen_destino_id,
        sm.sku_id,
        sm.lote_id,
        r.accion,
        r.tipo_accion,
        ind.nombre AS indicador_nombre,
        sk.codigo AS sku_codigo,
        sk.nombre AS sku_nombre,
        ca.nombre AS categoria_nombre,
        tm.nombre AS tipo_mercaderia_nombre,
        lo.codigo_lote,
        lo.fecha_vencimiento AS lote_fecha_vencimiento,
        ao.nombre AS almacen_origen_nombre,
        ad.nombre AS almacen_destino_nombre
      FROM stock_movimientos sm
      JOIN registros r ON r.id = sm.registro_id
      JOIN skus sk ON sk.id = sm.sku_id
      JOIN categorias ca ON ca.id = sk.categoria_id
      LEFT JOIN tipos_mercaderia tm ON tm.id = sk.tipo_mercaderia_id
      LEFT JOIN indicadores ind ON ind.id = r.indicador_id
      LEFT JOIN lotes lo ON lo.id = sm.lote_id
      LEFT JOIN almacenes ao ON ao.id = sm.almacen_origen_id
      LEFT JOIN almacenes ad ON ad.id = sm.almacen_destino_id
      WHERE 1=1`;
    const params = [];

    if (req.empresa_id) {
      query += ' AND sm.empresa_id=?';
      params.push(req.empresa_id);
    }
    if (categoriaId) {
      query += ' AND sk.categoria_id=?';
      params.push(categoriaId);
    }
    if (requestedWarehouseId) {
      query += ' AND (sm.almacen_origen_id=? OR sm.almacen_destino_id=?)';
      params.push(requestedWarehouseId, requestedWarehouseId);
    }
    if (fechaFin) {
      query += ' AND DATE(sm.created_at) <= ?';
      params.push(fechaFin);
    }

    const scopedWarehouseIds = ['almacenero', 'supervisor'].includes(req.usuario.rol)
      ? await getAssignedWarehouseIds(req.usuario.id, pool)
      : [];
    if (scopedWarehouseIds.length) {
      const placeholders = scopedWarehouseIds.map(() => '?').join(',');
      query += ` AND (sm.almacen_origen_id IN (${placeholders}) OR sm.almacen_destino_id IN (${placeholders}))`;
      params.push(...scopedWarehouseIds, ...scopedWarehouseIds);
    }

    query += ' ORDER BY sm.created_at, sm.id';

    const [movements] = await pool.query(query, params);
    const effectiveWarehouseScopeIds = requestedWarehouseId
      ? scopedWarehouseIds.length
        ? scopedWarehouseIds.filter((id) => Number(id) === requestedWarehouseId)
        : [requestedWarehouseId]
      : scopedWarehouseIds;

    const { rows, movementLabels } = buildStockReportRows(movements, {
      fechaIni,
      fechaFin,
      warehouseScopeIds: effectiveWarehouseScopeIds,
    });

    const columns = [
      { header: 'ALMACEN', key: 'almacen', width: 24 },
      { header: 'CATEGORIA', key: 'categoria', width: 18 },
      { header: 'TIPO MERCADERIA', key: 'tipo_mercaderia', width: 22 },
      { header: 'COD. SKU', key: 'sku_codigo', width: 14 },
      { header: 'SKU', key: 'sku', width: 34 },
      { header: 'LOTE', key: 'lote', width: 18 },
      { header: 'FECHA VENCIMIENTO', key: 'fecha_vencimiento', width: 18, type: 'date' },
      { header: 'STOCK INICIAL', key: 'stock_inicial', width: 14, type: 'number' },
      ...movementLabels.map((label) => ({
        header: label,
        key: label,
        width: Math.max(16, label.length + 4),
        type: 'number',
      })),
      { header: 'STOCK FINAL', key: 'stock_final', width: 14, type: 'number' },
    ];

    await sendExcelWorkbook(res, {
      fileName: `zentra_stock_sku_lote_${Date.now()}`,
      sheetName: 'Stock SKU Lote',
      columns,
      rows: rows.map((row) => {
        const exportRow = { ...row };
        movementLabels.forEach((label) => {
          exportRow[label] = Number(row[label] || 0);
        });
        return exportRow;
      }),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, mensaje: 'Error al exportar el reporte de stock' });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const id = parsePositiveInt(req.params.id);
    if (!id) return sendBadRequest(res, 'Id inválido');

    const registro = await getRegistroById(pool, req, id);
    if (!registro) {
      return res.status(404).json({ ok: false, mensaje: 'Registro no encontrado' });
    }

    res.json({ ok: true, datos: registro });
  } catch (err) {
    console.error(err);
    res.status(err.statusCode || 500).json({ ok: false, mensaje: err.message || 'Error interno' });
  }
});

router.get('/:id/export/excel', async (req, res) => {
  try {
    const id = parsePositiveInt(req.params.id);
    if (!id) return sendBadRequest(res, 'Id inválido');

    const registro = await getRegistroById(pool, req, id);
    if (!registro) {
      return res.status(404).json({ ok: false, mensaje: 'Registro no encontrado' });
    }

    await sendExcelWorkbook(res, {
      fileName: `zentra_registro_${registro.id}_${Date.now()}`,
      sheetName: `Registro ${registro.id}`,
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
        { header: 'ITEM', key: 'item', width: 10, type: 'integer' },
        { header: 'TOTAL ITEMS', key: 'total_items', width: 12, type: 'integer' },
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
      rows: mapRegistroExportRows([registro]),
    });
  } catch (err) {
    console.error(err);
    res.status(err.statusCode || 500).json({ ok: false, mensaje: err.message || 'Error al exportar el detalle' });
  }
});

router.post('/', requireRol('superadmin', 'admin', 'almacenero'), upload.single('foto_guia'), async (req, res) => {
  const uploadedFileName = req.file?.filename || null;
  const connection = await pool.getConnection();

  try {
    const payload = parseRegistroBody(req.body);
    const validated = await validateRegistroPayload(connection, req, payload, { currentFotoGuia: null });

    await connection.beginTransaction();

    const headerValues = buildHeaderValues(validated, validated.detalles);
    const [result] = await connection.query(
      `INSERT INTO registros
       (empresa_id, almacen_origen_id, almacen_destino_id, usuario_id, fecha, ciudad_id,
        categoria_id, accion, tipo_accion, personal_receptor_id, indicador_id,
        tipo_mercaderia_id, sku_id, lote_id, fecha_vencimiento, cantidad,
        nro_guia, foto_guia, observaciones, estado)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [
        req.empresa_id,
        headerValues.almacen_origen_id,
        headerValues.almacen_destino_id,
        req.usuario.id,
        headerValues.fecha,
        headerValues.ciudad_id,
        headerValues.categoria_id,
        headerValues.accion,
        headerValues.tipo_accion,
        headerValues.personal_receptor_id,
        headerValues.indicador_id,
        headerValues.tipo_mercaderia_id,
        headerValues.sku_id,
        headerValues.lote_id,
        headerValues.fecha_vencimiento,
        headerValues.cantidad,
        headerValues.nro_guia,
        uploadedFileName,
        headerValues.observaciones,
        'pendiente',
      ]
    );

    await syncRegistroDetails(connection, result.insertId, validated.detalles);
    await persistMissingLoteDates(connection, validated.detalles);

    const createdRegistro = await getRegistroById(connection, req, result.insertId);

    await insertAuditLog(connection, {
      empresa_id: req.empresa_id,
      usuario_id: req.usuario.id,
      accion: 'CREATE',
      tabla: 'registros',
      registro_id: result.insertId,
      detalle: buildRegistroAuditSnapshot(createdRegistro, {
        summary: 'Creo un registro',
        estado: 'pendiente',
      }),
      ip: req.ip,
    });

    await connection.commit();
    res.status(201).json({ ok: true, id: result.insertId, mensaje: 'Registro creado exitosamente' });
  } catch (err) {
    await connection.rollback();
    if (uploadedFileName) cleanupUploadedFile(uploadedFileName);
    console.error(err);
    res.status(err.statusCode || 400).json({ ok: false, mensaje: err.message || 'No se pudo crear el registro' });
  } finally {
    connection.release();
  }
});

router.put('/:id', requireRol('superadmin', 'admin'), upload.single('foto_guia'), async (req, res) => {
  const uploadedFileName = req.file?.filename || null;
  const connection = await pool.getConnection();

  try {
    const id = parsePositiveInt(req.params.id);
    if (!id) return sendBadRequest(res, 'Id inválido');

    const existing = await getRegistroById(connection, req, id);
    if (!existing) {
      if (uploadedFileName) cleanupUploadedFile(uploadedFileName);
      return res.status(404).json({ ok: false, mensaje: 'Registro no encontrado' });
    }
    if (existing.estado === 'aprobado') {
      if (uploadedFileName) cleanupUploadedFile(uploadedFileName);
      return sendForbidden(res, 'No se puede editar un registro aprobado');
    }
    if (await registroHasStockMovements(connection, id)) {
      if (uploadedFileName) cleanupUploadedFile(uploadedFileName);
      return sendForbidden(res, 'No se puede editar un registro que ya movio stock');
    }

    const payload = parseRegistroBody(req.body, existing);
    const validated = await validateRegistroPayload(connection, req, payload, {
      currentFotoGuia: existing.foto_guia || null,
    });

    await connection.beginTransaction();

    const headerValues = buildHeaderValues(validated, validated.detalles);
    await connection.query(
      `UPDATE registros SET
         fecha=?,
         ciudad_id=?,
         almacen_origen_id=?,
         almacen_destino_id=?,
         categoria_id=?,
         accion=?,
         tipo_accion=?,
         personal_receptor_id=?,
         indicador_id=?,
         tipo_mercaderia_id=?,
         sku_id=?,
         lote_id=?,
         fecha_vencimiento=?,
         cantidad=?,
         nro_guia=?,
         foto_guia=?,
         observaciones=?
       WHERE id=?`,
      [
        headerValues.fecha,
        headerValues.ciudad_id,
        headerValues.almacen_origen_id,
        headerValues.almacen_destino_id,
        headerValues.categoria_id,
        headerValues.accion,
        headerValues.tipo_accion,
        headerValues.personal_receptor_id,
        headerValues.indicador_id,
        headerValues.tipo_mercaderia_id,
        headerValues.sku_id,
        headerValues.lote_id,
        headerValues.fecha_vencimiento,
        headerValues.cantidad,
        headerValues.nro_guia,
        uploadedFileName || existing.foto_guia || null,
        headerValues.observaciones,
        id,
      ]
    );

    await syncRegistroDetails(connection, id, validated.detalles);
    await persistMissingLoteDates(connection, validated.detalles);

    const updatedRegistro = await getRegistroById(connection, req, id);

    await insertAuditLog(connection, {
      empresa_id: req.empresa_id,
      usuario_id: req.usuario.id,
      accion: 'UPDATE',
      tabla: 'registros',
      registro_id: id,
      detalle: buildRegistroAuditSnapshot(updatedRegistro, {
        summary: 'Edito un registro',
        previous_estado: existing.estado,
      }),
      ip: req.ip,
    });

    await connection.commit();
    res.json({ ok: true, mensaje: 'Registro actualizado' });
  } catch (err) {
    await connection.rollback();
    if (uploadedFileName) cleanupUploadedFile(uploadedFileName);
    console.error(err);
    res.status(err.statusCode || 400).json({ ok: false, mensaje: err.message || 'No se pudo actualizar el registro' });
  } finally {
    connection.release();
  }
});

router.patch('/:id/estado', requireRol('superadmin', 'admin', 'almacenero'), async (req, res) => {
  const connection = await pool.getConnection();

  try {
    const id = parsePositiveInt(req.params.id);
    const estado = String(req.body?.estado || '').trim();
    if (!id) return sendBadRequest(res, 'Id inválido');
    if (!ESTADOS.includes(estado)) return sendBadRequest(res, 'Estado inválido');

    const existing = await getRegistroById(connection, req, id);
    if (!existing) {
      return res.status(404).json({ ok: false, mensaje: 'Registro no encontrado' });
    }
    ensureEstadoTransitionAllowed(existing.estado, estado);

    await connection.beginTransaction();

    if (existing.estado !== estado) {
      if (existing.estado === 'pendiente' && estado === 'en_transito') {
        await applyStockMovementBatch(connection, existing, 'SALIDA_TRANSITO', req.usuario.id);
      } else if (existing.estado === 'pendiente' && estado === 'aprobado') {
        await applyStockMovementBatch(connection, existing, 'SALIDA_TRANSITO', req.usuario.id);
        await applyStockMovementBatch(connection, existing, 'INGRESO_APROBADO', req.usuario.id);
      } else if (existing.estado === 'en_transito' && estado === 'aprobado') {
        await applyStockMovementBatch(connection, existing, 'INGRESO_APROBADO', req.usuario.id);
      } else if (existing.estado === 'en_transito' && estado === 'rechazado') {
        await applyStockMovementBatch(connection, existing, 'REVERSA_RECHAZO', req.usuario.id);
      }
    }

    const actorEstado = ['aprobado', 'rechazado'].includes(estado) ? req.usuario.id : null;
    const fechaEstado = ['aprobado', 'rechazado'].includes(estado) ? 'NOW()' : 'NULL';

    await connection.query(
      `UPDATE registros
       SET estado=?, aprobado_por=?, fecha_aprobacion=${fechaEstado}
       WHERE id=?${req.empresa_id ? ' AND empresa_id=?' : ''}`,
      req.empresa_id
        ? [estado, actorEstado, id, req.empresa_id]
        : [estado, actorEstado, id]
    );

    await insertAuditLog(connection, {
      empresa_id: req.empresa_id,
      usuario_id: req.usuario.id,
      accion: 'STATUS_CHANGE',
      tabla: 'registros',
      registro_id: id,
      detalle: buildRegistroAuditSnapshot(existing, {
        summary: `Cambio el estado a ${estado}`,
        from: existing.estado,
        to: estado,
        estado,
      }),
      ip: req.ip,
    });

    await connection.commit();
    res.json({ ok: true, mensaje: `Estado actualizado a: ${estado}` });
  } catch (err) {
    await connection.rollback();
    console.error(err);
    res.status(err.statusCode || 400).json({ ok: false, mensaje: err.message || 'No se pudo actualizar el estado' });
  } finally {
    connection.release();
  }
});

router.delete('/:id', requireRol('superadmin', 'admin'), async (req, res) => {
  const connection = await pool.getConnection();

  try {
    const id = parsePositiveInt(req.params.id);
    if (!id) return sendBadRequest(res, 'Id inválido');

    const existing = await getRegistroById(connection, req, id);
    if (!existing) {
      return res.status(404).json({ ok: false, mensaje: 'Registro no encontrado' });
    }
    if (existing.estado === 'aprobado' && req.usuario.rol !== 'superadmin') {
      return sendForbidden(res, 'No se puede eliminar un registro aprobado');
    }

    await connection.beginTransaction();

    if (await registroHasStockMovements(connection, id)) {
      await reverseRecordedStockMovements(connection, id);
    }

    await connection.query('DELETE FROM registro_detalles WHERE registro_id=?', [id]);
    await connection.query(
      `DELETE FROM registros WHERE id=?${req.empresa_id ? ' AND empresa_id=?' : ''}`,
      req.empresa_id ? [id, req.empresa_id] : [id]
    );

    await insertAuditLog(connection, {
      empresa_id: req.empresa_id,
      usuario_id: req.usuario.id,
      accion: 'DELETE',
      tabla: 'registros',
      registro_id: id,
      detalle: buildRegistroAuditSnapshot(existing, {
        summary: 'Elimino un registro',
      }),
      ip: req.ip,
    });

    await connection.commit();
    res.json({ ok: true, mensaje: 'Registro eliminado' });
  } catch (err) {
    await connection.rollback();
    console.error(err);
    res.status(err.statusCode || 400).json({ ok: false, mensaje: err.message || 'No se pudo eliminar el registro' });
  } finally {
    connection.release();
  }
});

module.exports = router;
