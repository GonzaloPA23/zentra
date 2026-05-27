const mysql = require('mysql2/promise');

(async () => {
  try {
    const conn = await mysql.createConnection({
      host: 'localhost',
      user: 'root',
      database: 'zentra_db'
    });
    
    await conn.execute(
      "INSERT INTO indicadores (empresa_id, nombre, activo) VALUES (1, 'TG INTERNO (MISMO ALMACEN)', 1)"
    );
    
    console.log('✅ Indicador TG INTERNO insertado correctamente');
    conn.end();
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
})();
