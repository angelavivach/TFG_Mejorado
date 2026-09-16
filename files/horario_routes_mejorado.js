const express = require('express');
const router = express.Router();
const db = require('./conector/db');
const { authMiddleware, autorizar, validarEntrada } = require('./auth-middleware');
const { crearHorarioSchema, modificarHorarioDiaSchema } = require('./validation-schemas');

const diasSemana = ['lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado', 'domingo'];

/**
 * Calcula horas de un rango horario
 */
const calcularHoras = (rango) => {
  if (!rango || rango.trim().toLowerCase() === 'libre') return 0;
  
  const partes = rango.split('-');
  if (partes.length !== 2) return 0;
  
  try {
    const [hIni, mIni] = partes[0].split(':').map(Number);
    const [hFin, mFin] = partes[1].split(':').map(Number);
    
    // Validar rango
    if (isNaN(hIni) || isNaN(hFin)) return 0;
    
    return (hFin + (mFin || 0) / 60) - (hIni + (mIni || 0) / 60);
  } catch {
    return 0;
  }
};

/**
 * Valida que los días libres sean un bloque válido
 */
const validarDiasLibres = (diasLibres) => {
  const bloquesValidos = [
    ['lunes', 'martes'],
    ['miercoles', 'jueves'],
    ['viernes', 'sabado', 'domingo']
  ];

  return bloquesValidos.some(bloque =>
    bloque.length === diasLibres.length &&
    bloque.every(dia => diasLibres.includes(dia))
  );
};

/**
 * POST /api/horario
 * Crea un nuevo horario (solo admin)
 */
router.post('/', 
  authMiddleware, 
  autorizar('admin'), 
  validarEntrada(crearHorarioSchema), 
  async (req, res) => {
    const {
      id_usuario,
      lunes, martes, miercoles, jueves, viernes, sabado, domingo,
      fecha_inicio, fecha_fin
    } = req.body;

    let connection;
    try {
      connection = await db.getConnection();
      await connection.beginTransaction();

      // Verificar que el usuario existe
      const [usuario] = await connection.execute(
        'SELECT id_usuario FROM usuarios WHERE id_usuario = ? AND activo = 1',
        [id_usuario]
      );

      if (usuario.length === 0) {
        await connection.rollback();
        return res.status(404).json({
          mensaje: 'Usuario no encontrado o inactivo'
        });
      }

      const dias = { lunes, martes, miercoles, jueves, viernes, sabado, domingo };

      // Validar días libres
      const diasLibres = diasSemana.filter(d => {
        const val = dias[d];
        return !val || val.trim().toLowerCase() === '' || val.trim().toLowerCase() === 'libre';
      });

      if (!validarDiasLibres(diasLibres)) {
        await connection.rollback();
        return res.status(400).json({
          mensaje: 'Los días libres deben pertenecer solo a uno de estos grupos: [lunes y martes], [miércoles y jueves], [viernes, sábado y domingo].'
        });
      }

      // Obtener límite de horas del usuario
      const [userHoras] = await connection.execute(
        'SELECT horas_anuales_trabajadas FROM usuarios WHERE id_usuario = ?',
        [id_usuario]
      );

      const horasMax = 1784;

      // Calcular horas semanales
      let totalHorasSemana = 0;
      for (const dia of diasSemana) {
        totalHorasSemana += calcularHoras(dias[dia]);
      }

      const totalHorasAnuales = totalHorasSemana * 52;

      if (totalHorasAnuales > horasMax) {
        await connection.rollback();
        return res.status(400).json({
          mensaje: `Este horario genera ${totalHorasAnuales.toFixed(1)}h anuales y supera el máximo permitido de ${horasMax}h.`
        });
      }

      // Insertar horario
      const [result] = await connection.execute(
        `INSERT INTO horarios 
         (id_usuario, lunes, martes, miercoles, jueves, viernes, sabado, domingo,
          fecha_inicio, fecha_fin)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          id_usuario, lunes, martes, miercoles, jueves, viernes, sabado, domingo,
          fecha_inicio, fecha_fin
        ]
      );

      await connection.commit();

      console.log(`[HORARIO-POST] Horario creado para usuario ${id_usuario}`);

      return res.status(201).json({
        mensaje: 'Horario creado correctamente',
        id_horario: result.insertId
      });

    } catch (err) {
      if (connection) await connection.rollback();
      console.error('[HORARIO-POST] Error:', err);
      return res.status(500).json({ 
        mensaje: 'Error al crear horario' 
      });
    } finally {
      if (connection) connection.release();
    }
  }
);

/**
 * PUT /api/horario/:idHorario
 * Actualiza un día específico del horario (solo admin)
 */
router.put('/:idHorario', 
  authMiddleware, 
  autorizar('admin'), 
  validarEntrada(modificarHorarioDiaSchema), 
  async (req, res) => {
    const { idHorario } = req.params;
    const { dia, horario } = req.body;

    let connection;
    try {
      connection = await db.getConnection();
      await connection.beginTransaction();

      // Verificar que el horario existe
      const [horarioExistente] = await connection.execute(
        'SELECT * FROM horarios WHERE id_horario = ?',
        [idHorario]
      );

      if (horarioExistente.length === 0) {
        await connection.rollback();
        return res.status(404).json({ 
          mensaje: 'Horario no encontrado' 
        });
      }

      // Validar total de horas con el cambio
      const horarioObj = horarioExistente[0];
      const horasNuevas = { ...horarioObj };
      horasNuevas[dia] = horario;

      let totalHorasSemana = 0;
      for (const d of diasSemana) {
        totalHorasSemana += calcularHoras(horasNuevas[d]);
      }

      const totalHorasAnuales = totalHorasSemana * 52;
      if (totalHorasAnuales > 1784) {
        await connection.rollback();
        return res.status(400).json({
          mensaje: `Este cambio generaría ${totalHorasAnuales.toFixed(1)}h anuales y supera el máximo permitido.`
        });
      }

      // Actualizar
      const columnaSql = `\`${dia}\``;
      const [result] = await connection.execute(
        `UPDATE horarios SET ${columnaSql} = ? WHERE id_horario = ?`,
        [horario, idHorario]
      );

      if (result.affectedRows === 0) {
        await connection.rollback();
        return res.status(404).json({ 
          mensaje: 'Horario no encontrado' 
        });
      }

      await connection.commit();

      console.log(`[HORARIO-PUT] Horario ${idHorario} actualizado`);

      return res.json({ 
        mensaje: 'Horario actualizado correctamente' 
      });

    } catch (err) {
      if (connection) await connection.rollback();
      console.error('[HORARIO-PUT] Error:', err);
      return res.status(500).json({ 
        mensaje: 'Error al actualizar horario' 
      });
    } finally {
      if (connection) connection.release();
    }
  }
);

/**
 * GET /api/horario
 * Obtiene lista de horarios (solo admin)
 */
router.get('/', authMiddleware, autorizar('admin'), async (req, res) => {
  let connection;
  try {
    connection = await db.getConnection();

    const [rows] = await connection.execute(`
      SELECT 
        h.id_horario, h.id_usuario, u.nombre, 
        h.lunes, h.martes, h.miercoles, h.jueves,
        h.viernes, h.sabado, h.domingo,
        h.fecha_inicio, h.fecha_fin
      FROM horarios h
      JOIN usuarios u ON h.id_usuario = u.id_usuario
      WHERE u.activo = 1
      ORDER BY u.nombre ASC, h.fecha_inicio DESC
    `);

    return res.json({
      cantidad: rows.length,
      horarios: rows
    });

  } catch (err) {
    console.error('[HORARIO-GET] Error:', err);
    return res.status(500).json({ 
      mensaje: 'Error leyendo horarios' 
    });
  } finally {
    if (connection) connection.release();
  }
});

/**
 * GET /api/horario/:id_usuario
 * Obtiene horarios de un usuario específico
 */
router.get('/usuario/:id_usuario', authMiddleware, async (req, res) => {
  const { id_usuario } = req.params;

  // El usuario solo puede ver sus propios horarios
  if (req.usuario.rol === 'usuario' && req.usuario.id !== parseInt(id_usuario)) {
    return res.status(403).json({
      error: 'No autorizado'
    });
  }

  let connection;
  try {
    connection = await db.getConnection();

    const [rows] = await connection.execute(`
      SELECT 
        id_horario, lunes, martes, miercoles, jueves,
        viernes, sabado, domingo, fecha_inicio, fecha_fin
      FROM horarios
      WHERE id_usuario = ?
      ORDER BY fecha_inicio DESC
    `, [id_usuario]);

    return res.json({
      cantidad: rows.length,
      horarios: rows
    });

  } catch (err) {
    console.error('[HORARIO-GET-USER] Error:', err);
    return res.status(500).json({ 
      mensaje: 'Error leyendo horarios' 
    });
  } finally {
    if (connection) connection.release();
  }
});

/**
 * DELETE /api/horario/:idHorario
 * Elimina un horario (solo admin)
 */
router.delete('/:idHorario', 
  authMiddleware, 
  autorizar('admin'), 
  async (req, res) => {
    const { idHorario } = req.params;

    let connection;
    try {
      connection = await db.getConnection();

      const [result] = await connection.execute(
        'DELETE FROM horarios WHERE id_horario = ?',
        [idHorario]
      );

      if (result.affectedRows === 0) {
        return res.status(404).json({ 
          mensaje: 'Horario no encontrado' 
        });
      }

      console.log(`[HORARIO-DELETE] Horario ${idHorario} eliminado`);

      return res.json({ 
        mensaje: 'Horario eliminado correctamente' 
      });

    } catch (err) {
      console.error('[HORARIO-DELETE] Error:', err);
      return res.status(500).json({ 
        mensaje: 'Error al eliminar horario' 
      });
    } finally {
      if (connection) connection.release();
    }
  }
);

module.exports = router;
