const { pool } = require('./backend/src/db.js');

(async () => {
  try {
    const [rows] = await pool.query(`
      SELECT 
        sa.almacen_id,
        sa.sku_id,
        sa.lote_id,
        COUNT(*) as count,
        SUM(sa.cantidad) as total
      FROM stock_almacen sa
      WHERE sa.sku_id IN (SELECT id FROM skus WHERE nombre LIKE '%PLATO ZEUS MORADO%')
      GROUP BY sa.almacen_id, sa.sku_id, sa.lote_id
      HAVING count > 1
    `);
    console.log('Duplicates:', JSON.stringify(rows, null, 2));
    process.exit(0);
  } catch(e) { console.error(e); process.exit(1); }
})();
