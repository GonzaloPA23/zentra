const express = require('express');
const bcrypt = require('bcryptjs');
const { body, param, validationResult } = require('express-validator');
const { pool } = require('../db');
const { authMiddleware, requireRol, empresaMiddleware } = require('../middleware/auth');

const router = express.Router();
router.use(authMiddleware);

const validate = (req, res, next) => {
  const e = validationResult(req);
  if (!e.isEmpty()) return res.status(400).json({ ok: false, errores: e.array() });
  next();
};

// GET /api/usuarios
// superadmin ve todos, admin ve solo los de su empresa
router.get('/', requireRol('superadmin', 'admin'), async (req, res) => {
  try {
    let where = "WHERE u.rol != 'superadmin'";
    const p = [];

    if (req.usuario.rol === 'admin') {
      where += ' AND u.empresa_id = ?';
      p.push(req.usuario.empresa_id);
    }

    const [rows] = await pool.query(
      `SELECT u.id, u.nombre, u.apellido, u.email, u.rol, u.activo,
              u.empresa_id, u.ultimo_login,
              COALESCE(e.nombre, '—') AS empresa_nombre,
              GROUP_CONCAT(a.nombre ORDER BY a.nombre SEPARATOR ', ') AS almacenes
       FROM usuarios u
       LEFT JOIN empresas e ON e.id = u.empresa_id
       LEFT JOIN usuario_almacen ua ON ua.usuario_id = u.id
       LEFT JOIN almacenes a ON a.id = ua.almacen_id
       ${where}
       GROUP BY u.id
       ORDER BY e.nombre, u.nombre`,
      p
    );
    res.json({ ok: true, datos: rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, mensaje: 'Error interno' });
  }
});

// POST /api/usuarios
router.post('/', requireRol('superadmin', 'admin'), [
  body('nombre').trim().notEmpty().withMessage('Nombre requerido'),
  body('apellido').trim().notEmpty().withMessage('Apellido requerido'),
  body('email').isEmail().normalizeEmail().withMessage('Email inválido'),
  body('password').isLength({ min: 8 }).withMessage('Mínimo 8 caracteres'),
  body('rol').isIn(['admin', 'supervisor', 'almacenero']).withMessage('Rol inválido'),
  body('empresa_id').isInt({ min: 1 }).withMessage('Empresa requerida'),
  body('almacenes').optional().isArray(),
], validate, async (req, res) => {
  const { nombre, apellido, email, password, rol, empresa_id, almacenes = [] } = req.body;

  // Admin solo puede crear en su propia empresa
  if (req.usuario.rol === 'admin' && parseInt(empresa_id) !== req.usuario.empresa_id) {
    return res.status(403).json({ ok: false, mensaje: 'Solo puedes crear usuarios en tu empresa' });
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const [ex] = await conn.query('SELECT id FROM usuarios WHERE email = ?', [email]);
    if (ex.length) {
      await conn.rollback();
      return res.status(409).json({ ok: false, mensaje: 'Email ya registrado' });
    }

    const hash = await bcrypt.hash(password, 10);
    const [result] = await conn.query(
      'INSERT INTO usuarios (empresa_id, nombre, apellido, email, password_hash, rol) VALUES (?,?,?,?,?,?)',
      [empresa_id, nombre, apellido, email, hash, rol]
    );
    const uid = result.insertId;

    if (almacenes.length) {
      const vals = almacenes.map(aid => [uid, parseInt(aid)]);
      await conn.query('INSERT INTO usuario_almacen (usuario_id, almacen_id) VALUES ?', [vals]);
    }

    await conn.commit();
    res.status(201).json({ ok: true, id: uid, mensaje: 'Usuario creado correctamente' });
  } catch (err) {
    await conn.rollback();
    console.error(err);
    res.status(500).json({ ok: false, mensaje: 'Error interno' });
  } finally {
    conn.release();
  }
});

// PUT /api/usuarios/:id
router.put('/:id', requireRol('superadmin', 'admin'), [
  param('id').isInt({ min: 1 }),
  body('nombre').trim().notEmpty(),
  body('apellido').trim().notEmpty(),
  body('email').isEmail().normalizeEmail(),
  body('rol').isIn(['admin', 'supervisor', 'almacenero']),
  body('activo').isBoolean(),
  body('almacenes').optional().isArray(),
  body('password').optional().isLength({ min: 8 }),
], validate, async (req, res) => {
  const { nombre, apellido, email, rol, activo, almacenes, password } = req.body;
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    // Verificar que el usuario existe
    const [owner] = await conn.query('SELECT id, empresa_id FROM usuarios WHERE id = ?', [req.params.id]);
    if (!owner.length) {
      await conn.rollback();
      return res.status(404).json({ ok: false, mensaje: 'Usuario no encontrado' });
    }

    // Admin solo puede editar usuarios de su empresa
    if (req.usuario.rol === 'admin' && owner[0].empresa_id !== req.usuario.empresa_id) {
      await conn.rollback();
      return res.status(403).json({ ok: false, mensaje: 'Sin permisos para editar este usuario' });
    }

    const [ex] = await conn.query('SELECT id FROM usuarios WHERE email = ? AND id != ?', [email, req.params.id]);
    if (ex.length) {
      await conn.rollback();
      return res.status(409).json({ ok: false, mensaje: 'Email ya en uso' });
    }

    if (password) {
      const hash = await bcrypt.hash(password, 10);
      await conn.query(
        'UPDATE usuarios SET nombre=?, apellido=?, email=?, rol=?, activo=?, password_hash=? WHERE id=?',
        [nombre, apellido, email, rol, activo ? 1 : 0, hash, req.params.id]
      );
    } else {
      await conn.query(
        'UPDATE usuarios SET nombre=?, apellido=?, email=?, rol=?, activo=? WHERE id=?',
        [nombre, apellido, email, rol, activo ? 1 : 0, req.params.id]
      );
    }

    if (almacenes !== undefined) {
      await conn.query('DELETE FROM usuario_almacen WHERE usuario_id = ?', [req.params.id]);
      if (almacenes.length) {
        const vals = almacenes.map(aid => [req.params.id, parseInt(aid)]);
        await conn.query('INSERT INTO usuario_almacen (usuario_id, almacen_id) VALUES ?', [vals]);
      }
    }

    await conn.commit();
    res.json({ ok: true, mensaje: 'Usuario actualizado' });
  } catch (err) {
    await conn.rollback();
    console.error(err);
    res.status(500).json({ ok: false, mensaje: 'Error interno' });
  } finally {
    conn.release();
  }
});

// DELETE /api/usuarios/:id
router.delete('/:id', requireRol('superadmin', 'admin'), param('id').isInt({ min: 1 }), validate, async (req, res) => {
  try {
    const [owner] = await pool.query('SELECT empresa_id FROM usuarios WHERE id = ?', [req.params.id]);
    if (!owner.length) return res.status(404).json({ ok: false, mensaje: 'No encontrado' });

    if (req.usuario.rol === 'admin' && owner[0].empresa_id !== req.usuario.empresa_id) {
      return res.status(403).json({ ok: false, mensaje: 'Sin permisos' });
    }

    await pool.query('UPDATE usuarios SET activo = 0 WHERE id = ?', [req.params.id]);
    res.json({ ok: true, mensaje: 'Usuario desactivado' });
  } catch (err) {
    res.status(500).json({ ok: false, mensaje: 'Error interno' });
  }
});

module.exports = router;
