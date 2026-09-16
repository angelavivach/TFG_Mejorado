const express = require('express');
const router = express.Router();
const db = require('./conector/db');
const bcrypt = require('bcryptjs');
const { authMiddleware, autorizar, validarEntrada } = require('./auth-middleware');
const { 
  crearUsuarioSchema, 
  modificarUsuarioSchema, 
  eliminarUsuarioSchema 
} = require('./validation-schemas');

/**
 * GET /api/usuarios
 * Obtiene lista de usuarios (solo admin)
 */
router.get('/', authMiddleware, autorizar('admin'), async (req, res) => {
  let connection;
  try {
    connection = await db.getConnection();
    
    const [rows] = await connection.execute(
      `SELECT id_usuario, nombre, email, rol, fecha_alta, activo,
              dias_vacaciones_disponibles, dias_enfermedad_disponibles,
              dias_asuntopersonal_disponible
       FROM usuarios
       WHERE rol = 'usuario'
       ORDER BY nombre ASC`
    );

    return res.json({
      cantidad: rows.length,
      usuarios: rows
    });

  } catch (err) {
    console.error('[USUARIOS-GET] Error:', err);
    return res.status(500).json({ 
      mensaje: 'Error al obtener usuarios' 
    });
  } finally {
    if (connection) connection.release();
  }
});

/**
 * GET /api/usuarios/:id
 * Obtiene un usuario específico
 */
router.get('/:id', authMiddleware, async (req, res) => {
  const { id } = req.params;

  // Validar permisos: admin ve todos, usuario solo a sí mismo
  if (req.usuario.rol === 'usuario' && req.usuario.id !== parseInt(id)) {
    return res.status(403).json({ 
      mensaje: 'No tienes permisos para ver este usuario' 
    });
  }

  let connection;
  try {
    connection = await db.getConnection();
    
    const [user] = await connection.execute(
      `SELECT id_usuario, nombre, email, rol, fecha_alta, activo,
              dias_vacaciones_disponibles, dias_enfermedad_disponibles,
              dias_asuntopersonal_disponible
       FROM usuarios 
       WHERE id_usuario = ?`,
      [id]
    );

    if (user.length === 0) {
      return res.status(404).json({ 
        mensaje: 'Usuario no encontrado' 
      });
    }

    return res.json(user[0]);

  } catch (err) {
    console.error('[USUARIOS-GET-ID] Error:', err);
    return res.status(500).json({ 
      mensaje: 'Error al obtener usuario' 
    });
  } finally {
    if (connection) connection.release();
  }
});

/**
 * POST /api/usuarios
 * Crea un nuevo usuario (solo admin)
 */
router.post('/', 
  authMiddleware, 
  autorizar('admin'), 
  validarEntrada(crearUsuarioSchema), 
  async (req, res) => {
    const { nombre, email, password, fecha_alta } = req.body;

    let connection;
    try {
      connection = await db.getConnection();
      await connection.beginTransaction();

      // Verificar que el email no exista
      const [existing] = await connection.execute(
        'SELECT email FROM usuarios WHERE email = ?',
        [email]
      );

      if (existing.length > 0) {
        await connection.rollback();
        return res.status(409).json({ 
          mensaje: 'El email ya está registrado' 
        });
      }

      // Hash de contraseña
      const hashedPassword = await bcrypt.hash(password, 10);

      // Insertar usuario
      const [result] = await connection.execute(
        `INSERT INTO usuarios 
         (nombre, email, password, rol, fecha_alta, activo,
          dias_vacaciones_disponibles, dias_enfermedad_disponibles,
          dias_asuntopersonal_disponible, horas_anuales_trabajadas)
         VALUES (?, ?, ?, 'usuario', ?, 1, 30, 10, 5, 0)`,
        [nombre, email, hashedPassword, fecha_alta]
      );

      await connection.commit();

      console.log(`[USUARIOS-POST] Usuario creado: ${email}`);

      return res.status(201).json({
        mensaje: 'Usuario creado correctamente',
        id: result.insertId
      });

    } catch (err) {
      if (connection) await connection.rollback();
      console.error('[USUARIOS-POST] Error:', err);
      return res.status(500).json({ 
        mensaje: 'Error al crear usuario' 
      });
    } finally {
      if (connection) connection.release();
    }
  }
);

/**
 * PUT /api/usuarios/:id
 * Actualiza un usuario (admin o el usuario mismo)
 */
router.put('/:id', 
  authMiddleware, 
  validarEntrada(modificarUsuarioSchema), 
  async (req, res) => {
    const { id } = req.params;
    const { nombre } = req.body;

    // Validar permisos
    if (req.usuario.rol === 'usuario' && req.usuario.id !== parseInt(id)) {
      return res.status(403).json({ 
        mensaje: 'No tienes permisos para modificar este usuario' 
      });
    }

    let connection;
    try {
      connection = await db.getConnection();

      const [result] = await connection.execute(
        'UPDATE usuarios SET nombre = ? WHERE id_usuario = ?',
        [nombre, id]
      );

      if (result.affectedRows === 0) {
        return res.status(404).json({ 
          mensaje: 'Usuario no encontrado' 
        });
      }

      console.log(`[USUARIOS-PUT] Usuario actualizado: ${id}`);

      return res.json({ 
        mensaje: 'Usuario actualizado correctamente' 
      });

    } catch (err) {
      console.error('[USUARIOS-PUT] Error:', err);
      return res.status(500).json({ 
        mensaje: 'Error al actualizar usuario' 
      });
    } finally {
      if (connection) connection.release();
    }
  }
);

/**
 * DELETE /api/usuarios/:id
 * Elimina un usuario (solo admin)
 * Requiere ID, nombre y email para mayor seguridad
 */
router.delete('/:id', 
  authMiddleware, 
  autorizar('admin'), 
  validarEntrada(eliminarUsuarioSchema), 
  async (req, res) => {
    const { id, nombre, email } = req.body;
    const { id: paramId } = req.params;

    // Validar que IDs coincidan
    if (parseInt(id) !== parseInt(paramId)) {
      return res.status(400).json({ 
        mensaje: 'ID no coincide' 
      });
    }

    let connection;
    try {
      connection = await db.getConnection();
      await connection.beginTransaction();

      // Verificar existencia con todos los campos para mayor seguridad
      const [user] = await connection.execute(
        `SELECT id_usuario FROM usuarios 
         WHERE id_usuario = ? AND nombre = ? AND email = ?`,
        [id, nombre, email]
      );

      if (user.length === 0) {
        await connection.rollback();
        return res.status(404).json({ 
          mensaje: 'Usuario no encontrado' 
        });
      }

      // Soft delete: marcar como inactivo en lugar de eliminar
      const [result] = await connection.execute(
        'UPDATE usuarios SET activo = 0 WHERE id_usuario = ?',
        [id]
      );

      // Limpiar datos sensibles
      await connection.execute(
        'UPDATE usuarios SET password = ? WHERE id_usuario = ?',
        ['', id]
      );

      await connection.commit();

      console.log(`[USUARIOS-DELETE] Usuario desactivado: ${id}`);

      return res.json({ 
        mensaje: `Usuario ${nombre} eliminado correctamente` 
      });

    } catch (err) {
      if (connection) await connection.rollback();
      console.error('[USUARIOS-DELETE] Error:', err);
      return res.status(500).json({ 
        mensaje: 'Error al eliminar usuario' 
      });
    } finally {
      if (connection) connection.release();
    }
  }
);

/**
 * GET /api/usuarios/:id/dias-disponibles
 * Obtiene días disponibles de un usuario
 */
router.get('/:id/dias-disponibles', authMiddleware, async (req, res) => {
  const { id } = req.params;

  let connection;
  try {
    connection = await db.getConnection();

    const [user] = await connection.execute(
      `SELECT dias_vacaciones_disponibles,
              dias_enfermedad_disponibles,
              dias_asuntopersonal_disponible
       FROM usuarios WHERE id_usuario = ?`,
      [id]
    );

    if (user.length === 0) {
      return res.status(404).json({ 
        mensaje: 'Usuario no encontrado' 
      });
    }

    return res.json({
      vacaciones: user[0].dias_vacaciones_disponibles,
      enfermedad: user[0].dias_enfermedad_disponibles,
      personal: user[0].dias_asuntopersonal_disponible
    });

  } catch (err) {
    console.error('[USUARIOS-DIAS] Error:', err);
    return res.status(500).json({ 
      mensaje: 'Error al obtener días disponibles' 
    });
  } finally {
    if (connection) connection.release();
  }
});

module.exports = router;
