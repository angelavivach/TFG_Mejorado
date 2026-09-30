// /api/usuarios — gestión de usuarios (solo administradores)
const express = require('express');
const bcrypt  = require('bcryptjs');
const db      = require('../conector/db');
const { requireAdmin } = require('../middleware/auth');
const { esEmail, esFecha, esId, texto, passwordValida, MSG_PASSWORD } = require('../middleware/validar');

const router = express.Router();

// GET /api/usuarios/me — perfil del usuario con sesión (cualquier rol)
router.get('/me', async (req, res) => {
  try {
    const [rows] = await db.execute(
      `SELECT id_usuario, nombre, email, rol, fecha_alta,
              dias_vacaciones_disponibles, dias_enfermedad_disponibles, dias_asuntopersonal_disponible
         FROM usuarios WHERE id_usuario = ?`,
      [req.user.id]
    );
    res.json(rows[0]);
  } catch (err) {
    console.error('Error obteniendo perfil:', err.message);
    res.status(500).json({ mensaje: 'Error obteniendo perfil' });
  }
});

// A partir de aquí, todo requiere rol admin
router.use(requireAdmin);

// GET /api/usuarios
router.get('/', async (req, res) => {
  try {
    const [rows] = await db.execute(
      'SELECT id_usuario, nombre, email, rol, activo FROM usuarios ORDER BY id_usuario'
    );
    res.json(rows);
  } catch (err) {
    console.error('Error leyendo usuarios:', err.message);
    res.status(500).json({ mensaje: 'Error leyendo usuarios' });
  }
});

// GET /api/usuarios/:id
router.get('/:id', async (req, res) => {
  if (!esId(req.params.id)) return res.status(400).json({ mensaje: 'ID no válido' });
  try {
    const [rows] = await db.execute(
      `SELECT id_usuario, nombre, email, rol, fecha_alta, activo, horas_anuales_trabajadas,
              dias_vacaciones_disponibles, dias_enfermedad_disponibles, dias_asuntopersonal_disponible
         FROM usuarios WHERE id_usuario = ?`,
      [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ mensaje: 'Usuario no encontrado' });
    res.json(rows[0]);
  } catch (err) {
    console.error('Error al obtener usuario:', err.message);
    res.status(500).json({ mensaje: 'Error obteniendo usuario' });
  }
});

// POST /api/usuarios — alta de usuario
router.post('/', async (req, res) => {
  const nombre     = texto(req.body?.nombre, 100);
  const email      = texto(req.body?.email, 100).toLowerCase();
  const password   = req.body?.password;
  const fecha_alta = req.body?.fecha_alta;
  const rol        = req.body?.rol === 'admin' ? 'admin' : 'usuario';

  if (!nombre || !email || !password || !fecha_alta) {
    return res.status(400).json({ mensaje: 'Faltan campos obligatorios' });
  }
  if (!esEmail(email))           return res.status(400).json({ mensaje: 'Email no válido' });
  if (!esFecha(fecha_alta))      return res.status(400).json({ mensaje: 'Fecha de alta no válida' });
  if (!passwordValida(password)) return res.status(400).json({ mensaje: MSG_PASSWORD });

  try {
    const hash = await bcrypt.hash(password, 12);
    const [result] = await db.execute(
      'INSERT INTO usuarios (nombre, email, password, rol, fecha_alta) VALUES (?, ?, ?, ?, ?)',
      [nombre, email, hash, rol, fecha_alta]
    );
    res.status(201).json({ mensaje: 'Usuario creado correctamente', id: result.insertId });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') return res.status(409).json({ mensaje: 'Ese email ya está registrado' });
    console.error('Error al crear usuario:', err.message);
    res.status(500).json({ mensaje: 'Error al crear usuario' });
  }
});

// PUT /api/usuarios/:id — modificar nombre
router.put('/:id', async (req, res) => {
  const nombre = texto(req.body?.nombre, 100);
  if (!esId(req.params.id)) return res.status(400).json({ mensaje: 'ID no válido' });
  if (!nombre)              return res.status(400).json({ mensaje: 'Falta nombre' });

  try {
    const [result] = await db.execute(
      'UPDATE usuarios SET nombre = ? WHERE id_usuario = ?',
      [nombre, req.params.id]
    );
    if (!result.affectedRows) return res.status(404).json({ mensaje: 'Usuario no encontrado' });
    res.json({ mensaje: 'Usuario modificado correctamente' });
  } catch (err) {
    console.error('Error al modificar usuario:', err.message);
    res.status(500).json({ mensaje: 'Error servidor' });
  }
});

// DELETE /api/usuarios/eliminar — baja (se exige id + nombre + email como confirmación)
router.delete('/eliminar', async (req, res) => {
  const id     = req.body?.id;
  const nombre = texto(req.body?.nombre, 100);
  const email  = texto(req.body?.email, 100);

  if (!esId(id) || !nombre || !email) {
    return res.status(400).json({ mensaje: 'Faltan campos para eliminar el usuario' });
  }
  if (Number(id) === req.user.id) {
    return res.status(400).json({ mensaje: 'No puedes eliminar tu propia cuenta' });
  }

  try {
    const [result] = await db.execute(
      'DELETE FROM usuarios WHERE id_usuario = ? AND nombre = ? AND email = ?',
      [id, nombre, email]
    );
    if (!result.affectedRows) return res.status(404).json({ mensaje: 'Usuario no encontrado (revisa ID, nombre y email)' });
    res.json({ mensaje: `Usuario ${nombre} eliminado correctamente` });
  } catch (err) {
    console.error('Error al eliminar usuario:', err.message);
    res.status(500).json({ mensaje: 'Error servidor' });
  }
});

module.exports = router;
