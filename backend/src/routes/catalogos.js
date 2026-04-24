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

function getZonaFromCityName(ciudadNombre) {
  return String(ciudadNombre || '').toUpperCase() === 'LIMA' ? 'LIMA' : 'PROVINCIA';
}

function getZonaCaseSql(cityAlias = 'c') {
  return `CASE WHEN UPPER(${cityAlias}.nombre)='LIMA' THEN 'LIMA' ELSE 'PROVINCIA' END`;
}

async function getScopedSku(skuId, empresaId, executor = pool) {
  let query = 'SELECT * FROM skus WHERE id=?';
  const params = [skuId];

  if (empresaId) {
    query += ' AND empresa_id=?';
    params.push(empresaId);
  }

  const [rows] = await executor.query(query, params);
  return rows[0] || null;
}

async function getScopedLote(loteId, empresaId, executor = pool) {
  let query = `SELECT l.*, s.empresa_id, s.nombre AS sku_nombre
               FROM lotes l
               JOIN skus s ON s.id = l.sku_id
               WHERE l.id=?`;
  const params = [loteId];

  if (empresaId) {
    query += ' AND s.empresa_id=?';
    params.push(empresaId);
  }

  const [rows] = await executor.query(query, params);
  return rows[0] || null;
}

async function skuHasMovimientos(skuId, empresaId, executor = pool) {
  const conditions = [];
  const params = [];

  if (empresaId) {
    conditions.push('r.empresa_id=?');
    params.push(empresaId);
  }

  const whereEmpresa = conditions.length ? ` AND ${conditions.join(' AND ')}` : '';
  const [rows] = await executor.query(
    `SELECT EXISTS(
        SELECT 1
        FROM registro_detalles rd
        JOIN registros r ON r.id = rd.registro_id
        WHERE rd.sku_id=?${whereEmpresa}
      )
      OR EXISTS(
        SELECT 1
        FROM stock_movimientos sm
        WHERE sm.sku_id=?${empresaId ? ' AND sm.empresa_id=?' : ''}
      )
      OR EXISTS(
        SELECT 1
        FROM stock_almacen sa
        WHERE sa.sku_id=?${empresaId ? ' AND sa.empresa_id=?' : ''}
      )
      OR EXISTS(
        SELECT 1
        FROM registros r
        WHERE r.sku_id=?${whereEmpresa}
      ) AS has_movimientos`,
    empresaId
      ? [skuId, ...params, skuId, empresaId, skuId, empresaId, skuId, ...params]
      : [skuId, skuId, skuId, skuId]
  );

  return !!rows[0]?.has_movimientos;
}

async function loteHasMovimientos(loteId, empresaId, executor = pool) {
  const conditions = [];
  const params = [];

  if (empresaId) {
    conditions.push('r.empresa_id=?');
    params.push(empresaId);
  }

  const whereEmpresa = conditions.length ? ` AND ${conditions.join(' AND ')}` : '';
  const [rows] = await executor.query(
    `SELECT EXISTS(
        SELECT 1
        FROM registro_detalles rd
        JOIN registros r ON r.id = rd.registro_id
        WHERE rd.lote_id=?${whereEmpresa}
      )
      OR EXISTS(
        SELECT 1
        FROM stock_movimientos sm
        WHERE sm.lote_id=?${empresaId ? ' AND sm.empresa_id=?' : ''}
      )
      OR EXISTS(
        SELECT 1
        FROM stock_almacen sa
        WHERE sa.lote_id=?${empresaId ? ' AND sa.empresa_id=?' : ''}
      )
      OR EXISTS(
        SELECT 1
        FROM registros r
        WHERE r.lote_id=?${whereEmpresa}
      ) AS has_movimientos`,
    empresaId
      ? [loteId, ...params, loteId, empresaId, loteId, empresaId, loteId, ...params]
      : [loteId, loteId, loteId, loteId]
  );

  return !!rows[0]?.has_movimientos;
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
    const { zona } = req.query;
    let q = `SELECT c.*, r.nombre AS region_nombre, r.empresa_id
             , ${getZonaCaseSql('c')} AS zona
             FROM ciudades c JOIN regiones r ON r.id = c.region_id
             WHERE c.activo=1`;
    const p = [];
    if (eid) { q += ' AND r.empresa_id=?'; p.push(eid); }
    if (zona) { q += ` AND ${getZonaCaseSql('c')}=?`; p.push(zona); }
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
    const { ciudad_id, zona } = req.query;
    let q = `SELECT a.*, c.nombre AS ciudad_nombre, r.nombre AS region_nombre, r.empresa_id
             , ${getZonaCaseSql('c')} AS zona
             FROM almacenes a
             JOIN ciudades c ON c.id = a.ciudad_id
             JOIN regiones r ON r.id = c.region_id
             WHERE a.activo=1`;
    const p = [];
    if (eid) { q += ' AND r.empresa_id=?'; p.push(eid); }
    if (ciudad_id) { q += ' AND a.ciudad_id=?'; p.push(ciudad_id); }
    if (zona) { q += ` AND ${getZonaCaseSql('c')}=?`; p.push(zona); }
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
    const { almacen_id, almacen_origen_id, almacen_destino_id, categoria_id, ciudad_id } = req.query;
    const targetWarehouseIds = [...new Set(
      [almacen_id, almacen_origen_id, almacen_destino_id]
        .map((value) => Number.parseInt(value, 10))
        .filter((value) => Number.isInteger(value) && value > 0)
    )];
    let q = `SELECT pr.*,
                a.nombre AS almacen_nombre,
                a.ciudad_id,
                ci.nombre AS ciudad_nombre,
                ca.nombre AS categoria_nombre,
                ${getZonaCaseSql('ci')} AS zona
             FROM personal_receptor pr
             LEFT JOIN almacenes a ON a.id = pr.almacen_id
             LEFT JOIN ciudades ci ON ci.id = a.ciudad_id
             LEFT JOIN categorias ca ON ca.id = pr.categoria_id
             WHERE pr.activo=1`;
    const p = [];
    if (eid) { q += ' AND pr.empresa_id=?'; p.push(eid); }
    if (targetWarehouseIds.length === 1) {
      q += ' AND pr.almacen_id=?';
      p.push(targetWarehouseIds[0]);
    } else if (targetWarehouseIds.length > 1) {
      q += ` AND pr.almacen_id IN (${targetWarehouseIds.map(() => '?').join(',')})`;
      p.push(...targetWarehouseIds);
    }
    if (categoria_id) { q += ' AND pr.categoria_id=?'; p.push(categoria_id); }
    if (ciudad_id) { q += ' AND a.ciudad_id=?'; p.push(ciudad_id); }
    q += ' ORDER BY pr.nombre';
    const [rows] = await pool.query(q, p);
    res.json({ ok: true, datos: rows });
  } catch { res.status(500).json({ ok: false, mensaje: 'Error interno' }); }
});
router.post('/personal-receptor', requireRol('superadmin','admin'), [
  body('nombre').trim().notEmpty(),
  body('almacen_id').isInt({ min: 1 }).withMessage('Almacen requerido'),
  body('categoria_id').isInt({ min: 1 }).withMessage('Categoria requerida'),
], validate, async (req, res) => {
  const eid = resolveEmpresaId(req) || req.empresa_id;
  const { nombre, cargo, almacen_id, categoria_id } = req.body;
  const [r] = await pool.query(
    'INSERT INTO personal_receptor (empresa_id, nombre, cargo, almacen_id, categoria_id) VALUES (?,?,?,?,?)',
    [eid, nombre, cargo || null, almacen_id, categoria_id]);
  res.status(201).json({ ok: true, id: r.insertId });
});
router.put('/personal-receptor/:id', requireRol('superadmin','admin'), [
  param('id').isInt(),
  body('nombre').trim().notEmpty(),
  body('almacen_id').isInt({ min: 1 }).withMessage('Almacen requerido'),
  body('categoria_id').isInt({ min: 1 }).withMessage('Categoria requerida'),
], validate, async (req, res) => {
  const { nombre, cargo, almacen_id, categoria_id, activo } = req.body;
  await pool.query(
    'UPDATE personal_receptor SET nombre=?, cargo=?, almacen_id=?, categoria_id=?, activo=? WHERE id=?',
    [nombre, cargo || null, almacen_id, categoria_id, activo ?? 1, req.params.id]
  );
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
    let q = `SELECT s.*, c.nombre AS categoria_nombre, tm.nombre AS tipo_mercaderia_nombre,
                    COALESCE(lc.lotes_count, 0) AS lotes_count
             FROM skus s
             JOIN categorias c ON c.id = s.categoria_id
             LEFT JOIN tipos_mercaderia tm ON tm.id = s.tipo_mercaderia_id
             LEFT JOIN (
               SELECT sku_id, COUNT(*) AS lotes_count
               FROM lotes
               WHERE activo=1
               GROUP BY sku_id
             ) lc ON lc.sku_id = s.id
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
  try {
    const empresaId = resolveEmpresaId(req);
    const sku = await getScopedSku(req.params.id, empresaId);
    if (!sku) {
      return res.status(404).json({ ok: false, mensaje: 'SKU no encontrado' });
    }

    const hasMovimientos = await skuHasMovimientos(req.params.id, empresaId);
    if (hasMovimientos) {
      return res.status(400).json({
        ok: false,
        mensaje: 'No se puede eliminar este SKU porque ya tiene movimientos registrados',
      });
    }

    await pool.query('UPDATE skus SET activo=0 WHERE id=?', [req.params.id]);
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, mensaje: 'Error interno' });
  }
});

// ── LOTES ─────────────────────────────────────────────────────────────────────
router.get('/lotes', async (req, res) => {
  try {
    const empresaId = resolveEmpresaId(req);
    const { sku_id } = req.query;
    if (!sku_id) return res.status(400).json({ ok: false, mensaje: 'sku_id requerido' });

    const sku = await getScopedSku(sku_id, empresaId);
    if (!sku) {
      return res.status(404).json({ ok: false, mensaje: 'SKU no encontrado' });
    }

    const [rows] = await pool.query(
      `SELECT l.id, l.sku_id, l.codigo_lote,
              DATE_FORMAT(l.fecha_vencimiento, '%Y-%m-%d') AS fecha_vencimiento,
              l.activo, l.created_at,
              s.nombre AS sku_nombre
       FROM lotes l
       JOIN skus s ON s.id = l.sku_id
       WHERE l.sku_id=? AND l.activo=1
       ORDER BY l.codigo_lote`,
      [sku_id]
    );
    res.json({ ok: true, datos: rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, mensaje: 'Error interno' });
  }
});
router.post('/lotes', requireRol('superadmin','admin','almacenero'), [
  body('sku_id').isInt({ min: 1 }),
  body('codigo_lote').trim().notEmpty(),
  body('fecha_vencimiento').optional({ checkFalsy: true, nullable: true }).isISO8601(),
], validate, async (req, res) => {
  try {
    const empresaId = resolveEmpresaId(req);
    const { sku_id, codigo_lote, fecha_vencimiento } = req.body;
    const normalizedCodigo = codigo_lote.trim();

    const sku = await getScopedSku(sku_id, empresaId);
    if (!sku) {
      return res.status(404).json({ ok: false, mensaje: 'SKU no encontrado' });
    }

    const [existentes] = await pool.query(
      'SELECT id, activo FROM lotes WHERE sku_id=? AND UPPER(codigo_lote)=UPPER(?) LIMIT 1',
      [sku_id, normalizedCodigo]
    );
    if (existentes[0]?.activo) {
      return res.status(400).json({ ok: false, mensaje: 'Ya existe un lote activo con ese código para el SKU seleccionado' });
    }

    if (existentes.length) {
      await pool.query(
        'UPDATE lotes SET activo=1, fecha_vencimiento=? WHERE id=?',
        [fecha_vencimiento || null, existentes[0].id]
      );
      return res.status(201).json({
        ok: true,
        id: existentes[0].id,
        datos: {
          id: existentes[0].id,
          sku_id: Number(sku_id),
          codigo_lote: normalizedCodigo,
          fecha_vencimiento: fecha_vencimiento || null,
          activo: 1,
        },
      });
    }

    const [r] = await pool.query(
      'INSERT INTO lotes (sku_id, codigo_lote, fecha_vencimiento) VALUES (?,?,?)',
      [sku_id, normalizedCodigo, fecha_vencimiento || null]
    );
    res.status(201).json({
      ok: true,
      id: r.insertId,
      datos: {
        id: r.insertId,
        sku_id: Number(sku_id),
        codigo_lote: normalizedCodigo,
        fecha_vencimiento: fecha_vencimiento || null,
        activo: 1,
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, mensaje: 'Error interno' });
  }
});
router.put('/lotes/:id', requireRol('superadmin','admin'), [param('id').isInt()], validate, async (req, res) => {
  try {
    const empresaId = resolveEmpresaId(req);
    const lote = await getScopedLote(req.params.id, empresaId);
    if (!lote) {
      return res.status(404).json({ ok: false, mensaje: 'Lote no encontrado' });
    }

    const { codigo_lote, fecha_vencimiento, activo } = req.body;
    const nextCodigo = String(codigo_lote || '').trim();
    if (!nextCodigo) {
      return res.status(400).json({ ok: false, mensaje: 'Código de lote requerido' });
    }

    const [duplicados] = await pool.query(
      'SELECT id FROM lotes WHERE sku_id=? AND UPPER(codigo_lote)=UPPER(?) AND id<>? AND activo=1 LIMIT 1',
      [lote.sku_id, nextCodigo, req.params.id]
    );
    if (duplicados.length) {
      return res.status(400).json({ ok: false, mensaje: 'Ya existe un lote activo con ese código para este SKU' });
    }

    await pool.query(
      'UPDATE lotes SET codigo_lote=?, fecha_vencimiento=?, activo=? WHERE id=?',
      [nextCodigo, fecha_vencimiento || null, activo ?? 1, req.params.id]
    );
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, mensaje: 'Error interno' });
  }
});
router.delete('/lotes/:id', requireRol('superadmin','admin'), async (req, res) => {
  try {
    const empresaId = resolveEmpresaId(req);
    const lote = await getScopedLote(req.params.id, empresaId);
    if (!lote) {
      return res.status(404).json({ ok: false, mensaje: 'Lote no encontrado' });
    }

    const hasMovimientos = await loteHasMovimientos(req.params.id, empresaId);
    if (hasMovimientos) {
      return res.status(400).json({
        ok: false,
        mensaje: 'No se puede eliminar este lote porque ya fue usado en movimientos',
      });
    }

    await pool.query('DELETE FROM lotes WHERE id=?', [req.params.id]);
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, mensaje: 'Error interno' });
  }
});

module.exports = router;
