const express = require('express');
const { pool } = require('../db');
const { authMiddleware, empresaMiddleware } = require('../middleware/auth');
const { getAssignedWarehouseIds, getWarehouseScope } = require('../utils/warehouseScope');

const router = express.Router();
router.use(authMiddleware, empresaMiddleware);

router.get('/resumen', async (req, res) => {
  try {
    const eid = req.empresa_id;
    const scope = await getWarehouseScope(req, 'r');
    const whereRegistros = eid ? `WHERE r.empresa_id=?${scope.clause}` : `WHERE 1=1${scope.clause}`;
    const scopedParams = eid ? [eid, ...scope.params] : [...scope.params];

    const [[totales]] = await pool.query(
      `SELECT
        COUNT(*) AS total_registros,
        SUM(CASE WHEN r.estado='pendiente' THEN 1 ELSE 0 END) AS pendientes,
        SUM(CASE WHEN r.estado='en_transito' THEN 1 ELSE 0 END) AS en_transito,
        SUM(CASE WHEN r.estado='aprobado' THEN 1 ELSE 0 END) AS aprobados,
        SUM(CASE WHEN DATE(r.created_at)=CURDATE() THEN 1 ELSE 0 END) AS hoy
       FROM registros r
       ${whereRegistros}`,
      scopedParams
    );

    const [por_categoria] = await pool.query(
      `SELECT ca.nombre,
              COUNT(r.id) AS total,
              SUM(COALESCE((
                SELECT SUM(rd.cantidad)
                FROM registro_detalles rd
                WHERE rd.registro_id = r.id
              ), r.cantidad, 0)) AS cantidad
       FROM registros r
       JOIN categorias ca ON ca.id = r.categoria_id
       ${whereRegistros}
       GROUP BY ca.id
       ORDER BY total DESC
       LIMIT 10`,
      scopedParams
    );

    const [por_mes] = await pool.query(
      `SELECT DATE_FORMAT(r.fecha,'%Y-%m') AS mes,
              COUNT(*) AS total,
              SUM(COALESCE((
                SELECT SUM(rd.cantidad)
                FROM registro_detalles rd
                WHERE rd.registro_id = r.id
              ), r.cantidad, 0)) AS cantidad
       FROM registros r
       ${whereRegistros} AND r.fecha >= DATE_SUB(CURDATE(), INTERVAL 6 MONTH)
       GROUP BY mes
       ORDER BY mes`,
      scopedParams
    );

    const scopedStockIds = ['almacenero', 'supervisor'].includes(req.usuario.rol)
      ? await getAssignedWarehouseIds(req.usuario.id)
      : [];
    const stockWhere = [
      'sa.cantidad > 0',
      eid ? 'sa.empresa_id = ?' : null,
      scopedStockIds.length ? `sa.almacen_id IN (${scopedStockIds.map(() => '?').join(',')})` : null,
    ].filter(Boolean).join(' AND ');
    const stockParams = [
      ...(eid ? [eid] : []),
      ...scopedStockIds,
    ];

    const [vencimientos] = await pool.query(
      `SELECT sa.id, sk.nombre AS sku, lo.fecha_vencimiento, sa.cantidad, ao.nombre AS almacen
       FROM stock_almacen sa
       JOIN skus sk ON sk.id = sa.sku_id
       JOIN lotes lo ON lo.id = sa.lote_id
       JOIN almacenes ao ON ao.id = sa.almacen_id
       WHERE ${stockWhere}
         AND lo.fecha_vencimiento IS NOT NULL
         AND lo.fecha_vencimiento BETWEEN CURDATE() AND DATE_ADD(CURDATE(), INTERVAL 7 DAY)
       ORDER BY lo.fecha_vencimiento
       LIMIT 20`,
      stockParams
    );

    const [vencidos] = await pool.query(
      `SELECT sa.id, sk.nombre AS sku, lo.fecha_vencimiento, sa.cantidad, ao.nombre AS almacen
       FROM stock_almacen sa
       JOIN skus sk ON sk.id = sa.sku_id
       JOIN lotes lo ON lo.id = sa.lote_id
       JOIN almacenes ao ON ao.id = sa.almacen_id
       WHERE ${stockWhere}
         AND lo.fecha_vencimiento < CURDATE()
       ORDER BY lo.fecha_vencimiento
       LIMIT 20`,
      stockParams
    );

    res.json({
      ok: true,
      datos: {
        totales,
        por_categoria,
        por_mes,
        alertas: {
          vencimientos_proximos: vencimientos,
          vencidos,
        },
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, mensaje: 'Error interno' });
  }
});

module.exports = router;
