const express = require('express');
const { pool } = require('../db');
const { authMiddleware, empresaMiddleware } = require('../middleware/auth');

const router = express.Router();
router.use(authMiddleware, empresaMiddleware);

// GET /api/dashboard/resumen
router.get('/resumen', async (req, res) => {
  try {
    const eid = req.empresa_id;

    const [[totales]] = await pool.query(
      `SELECT
        COUNT(*) AS total_registros,
        SUM(CASE WHEN estado='pendiente' THEN 1 ELSE 0 END) AS pendientes,
        SUM(CASE WHEN estado='en_transito' THEN 1 ELSE 0 END) AS en_transito,
        SUM(CASE WHEN estado='aprobado' THEN 1 ELSE 0 END) AS aprobados,
        SUM(CASE WHEN DATE(created_at)=CURDATE() THEN 1 ELSE 0 END) AS hoy
       FROM registros WHERE empresa_id=?`, [eid]);

    const [por_categoria] = await pool.query(
      `SELECT ca.nombre, COUNT(r.id) AS total, SUM(r.cantidad) AS cantidad
       FROM registros r JOIN categorias ca ON ca.id=r.categoria_id
       WHERE r.empresa_id=?
       GROUP BY ca.id ORDER BY total DESC LIMIT 10`, [eid]);

    const [por_mes] = await pool.query(
      `SELECT DATE_FORMAT(fecha,'%Y-%m') AS mes, COUNT(*) AS total, SUM(cantidad) AS cantidad
       FROM registros WHERE empresa_id=? AND fecha >= DATE_SUB(CURDATE(), INTERVAL 6 MONTH)
       GROUP BY mes ORDER BY mes`, [eid]);

    // Alertas de vencimiento próximo (7 días)
    const [vencimientos] = await pool.query(
      `SELECT r.id, sk.nombre AS sku, r.fecha_vencimiento, r.cantidad, ao.nombre AS almacen
       FROM registros r
       JOIN skus sk ON sk.id=r.sku_id
       JOIN almacenes ao ON ao.id=r.almacen_origen_id
       WHERE r.empresa_id=? AND r.fecha_vencimiento IS NOT NULL
         AND r.fecha_vencimiento BETWEEN CURDATE() AND DATE_ADD(CURDATE(),INTERVAL 7 DAY)
         AND r.estado='aprobado'
       ORDER BY r.fecha_vencimiento LIMIT 20`, [eid]);

    const [vencidos] = await pool.query(
      `SELECT r.id, sk.nombre AS sku, r.fecha_vencimiento, r.cantidad, ao.nombre AS almacen
       FROM registros r
       JOIN skus sk ON sk.id=r.sku_id
       JOIN almacenes ao ON ao.id=r.almacen_origen_id
       WHERE r.empresa_id=? AND r.fecha_vencimiento < CURDATE()
         AND r.estado='aprobado'
       ORDER BY r.fecha_vencimiento LIMIT 20`, [eid]);

    res.json({
      ok: true,
      datos: { totales, por_categoria, por_mes, alertas: { vencimientos_proximos: vencimientos, vencidos } },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, mensaje: 'Error interno' });
  }
});

module.exports = router;
