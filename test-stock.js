const { pool } = require('./backend/src/db.js');

(async () => {
  try {
    const [rows] = await pool.query(`
      SELECT 
        ao.nombre as almacen,
        ca.nombre as categoria,
        sk.nombre as sku,
        COALESCE(lo.codigo_lote, 'SIN LOTE') as lote,
        SUM(sa.cantidad) as stock
      FROM stock_almacen sa
      JOIN skus sk ON sk.id = sa.sku_id
      JOIN categorias ca ON ca.id = sk.categoria_id
      JOIN almacenes ao ON ao.id = sa.almacen_id
      LEFT JOIN lotes lo ON lo.id = sa.lote_id
      WHERE sk.nombre LIKE '%PLATO ZEUS%'
      GROUP BY ao.id, ao.nombre, ca.id, ca.nombre, sk.id, sk.nombre, lo.id, lo.codigo_lote
    `);
    console.log(JSON.stringify(rows, null, 2));
    process.exit(0);
  } catch(e) { console.error(e); process.exit(1); }
})();
