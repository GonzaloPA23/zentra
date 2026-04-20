const { pool } = require('../db');

async function insertAuditLog(executor = pool, entry) {
  const target = executor && typeof executor.query === 'function' ? executor : pool;
  const detalle = entry?.detalle ? JSON.stringify(entry.detalle) : null;

  await target.query(
    'INSERT INTO audit_log (empresa_id, usuario_id, accion, tabla, registro_id, detalle, ip) VALUES (?,?,?,?,?,?,?)',
    [
      entry?.empresa_id ?? null,
      entry?.usuario_id ?? null,
      entry?.accion ?? 'UNKNOWN',
      entry?.tabla ?? 'general',
      entry?.registro_id ?? null,
      detalle,
      entry?.ip ?? null,
    ]
  );
}

function parseAuditDetail(raw) {
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function describeAuditAction(action, detail) {
  if (detail?.summary) return detail.summary;

  if (action === 'STATUS_CHANGE') {
    const labels = {
      pendiente: 'Pendiente',
      en_transito: 'En camino',
      aprobado: 'Aprobado',
      rechazado: 'Rechazado',
    };
    if (detail?.from || detail?.to) {
      const from = labels[detail.from] || detail.from || 'sin estado';
      const to = labels[detail.to] || detail.to || 'sin estado';
      return `Cambio de estado: ${from} -> ${to}`;
    }
    return 'Cambio de estado';
  }

  const fallbacks = {
    CREATE: 'Creo un registro',
    UPDATE: 'Edito un registro',
    DELETE: 'Elimino un registro',
  };

  return fallbacks[action] || action;
}

module.exports = {
  insertAuditLog,
  parseAuditDetail,
  describeAuditAction,
};
