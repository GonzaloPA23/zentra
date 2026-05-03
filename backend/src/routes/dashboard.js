const express = require('express');
const { pool } = require('../db');
const { authMiddleware, empresaMiddleware } = require('../middleware/auth');
const { getAssignedWarehouseIds, getWarehouseScope } = require('../utils/warehouseScope');

const router = express.Router();
router.use(authMiddleware, empresaMiddleware);

const LOW_STOCK_CRITICAL_THRESHOLD = 100;
const LOW_STOCK_WARNING_THRESHOLD = 200;
const DETAIL_COUNT_EXPR = 'COALESCE((SELECT COUNT(*) FROM registro_detalles rd_count WHERE rd_count.registro_id = r.id), 0)';
const PRIMARY_SKU_EXPR = `COALESCE((
  SELECT MIN(sk_detail.nombre)
  FROM registro_detalles rd_sku
  JOIN skus sk_detail ON sk_detail.id = rd_sku.sku_id
  WHERE rd_sku.registro_id = r.id
), sk.nombre, '')`;

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

    const [transitoRaw] = await pool.query(
      `SELECT
        r.id,
        r.fecha,
        r.nro_guia,
        ao.nombre AS almacen_origen,
        ad.nombre AS almacen_destino,
        ${PRIMARY_SKU_EXPR} AS sku_principal_nombre,
        GREATEST(${DETAIL_COUNT_EXPR}, 1) AS detalles_count
       FROM registros r
       LEFT JOIN almacenes ao ON ao.id = r.almacen_origen_id
       LEFT JOIN almacenes ad ON ad.id = r.almacen_destino_id
       LEFT JOIN skus sk ON sk.id = r.sku_id
       ${whereRegistros} AND r.estado='en_transito'
       ORDER BY r.fecha DESC, r.id DESC
       LIMIT 20`,
      scopedParams
    );

    const transito = transitoRaw.map((row) => {
      const totalDetalles = Number(row.detalles_count || 1);
      const skuPrincipal = row.sku_principal_nombre || '-';
      return {
        ...row,
        detalles_count: totalDetalles,
        sku_resumen: totalDetalles > 1 ? `${skuPrincipal} +${totalDetalles - 1} más` : skuPrincipal,
      };
    });

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

    const [stockAlertRows] = await pool.query(
      `SELECT
        sa.almacen_id,
        sa.sku_id,
        ao.nombre AS almacen,
        sk.nombre AS sku,
        SUM(sa.cantidad) AS cantidad
       FROM stock_almacen sa
       JOIN skus sk ON sk.id = sa.sku_id
       JOIN almacenes ao ON ao.id = sa.almacen_id
       WHERE ${stockWhere}
       GROUP BY sa.almacen_id, sa.sku_id, ao.nombre, sk.nombre
       HAVING SUM(sa.cantidad) <= ?
       ORDER BY cantidad ASC, sk.nombre ASC
       LIMIT 40`,
      [...stockParams, LOW_STOCK_WARNING_THRESHOLD]
    );

    const stock_critico = [];
    const stock_bajo = [];

    stockAlertRows.forEach((item) => {
      const normalizedItem = {
        ...item,
        cantidad: Number(item.cantidad || 0),
      };

      if (normalizedItem.cantidad <= LOW_STOCK_CRITICAL_THRESHOLD) {
        stock_critico.push(normalizedItem);
      } else {
        stock_bajo.push(normalizedItem);
      }
    });

    res.json({
      ok: true,
      datos: {
        totales,
        por_categoria,
        por_mes,
        alertas: {
          transito,
          vencimientos_proximos: vencimientos,
          vencidos,
          stock_critico,
          stock_bajo,
          stock_limites: {
            critico: LOW_STOCK_CRITICAL_THRESHOLD,
            bajo: LOW_STOCK_WARNING_THRESHOLD,
          },
        },
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, mensaje: 'Error interno' });
  }
});

module.exports = router;
