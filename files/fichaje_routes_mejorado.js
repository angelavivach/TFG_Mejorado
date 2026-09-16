const express = require('express');
const router = express.Router();
const db = require('./conector/db');
const { authMiddleware, validarEntrada } = require('./auth-middleware');
const { fichajePOSTSchema } = require('./validation-schemas');

/**
 * POST /api/fichaje
 * Registra entrada o salida de un usuario
 */
router.post('/', authMiddleware, validarEntrada(fichajePOSTSchema), async (req, res) => {
  const { id_usuario, tipo } = req.body;

  // El usuario solo puede fichar por sí mismo (admin puede fichar por otros)
  if (req.usuario.rol === 'usuario' && req.usuario.id !== id_usuario) {
    return res.status(403).json({
      error: 'No autorizado',
      mensaje: 'No puedes fichar por otro usuario'
    });
  }

  let connection;
  try {
    connection = await db.getConnection();
    await connection.beginTransaction();

    // Verificar que el usuario existe y está activo
    const [userExists] = await connection.execute(
      'SELECT id_usuario FROM usuarios WHERE id_usuario = ? AND activo = 1',
      [id_usuario]
    );

    if (userExists.length === 0) {
      await connection.rollback();
      return res.status(404).json({
        error: 'Usuario no encontrado',
        mensaje: 'El usuario no existe o está desactivado'
      });
    }

    // Validación: evitar dos entradas o dos salidas consecutivas
    const [ultimos] = await connection.execute(
      `SELECT tipo 
       FROM fichajes 
       WHERE id_usuario = ? 
       ORDER BY fecha_hora DESC 
       LIMIT 1`,
      [id_usuario]
    );

    const ultimoTipo = ultimos[0]?.tipo;
    if (ultimoTipo === tipo) {
      await connection.rollback();
      return res.status(400).json({
        error: 'Acción inválida',
        mensaje: `No puedes registrar dos '${tipo}' seguidos`
      });
    }

    // Obtener hora actual en zona horaria de Madrid
    const now = new Date();
    const options = {
      timeZone: 'Europe/Madrid',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    };

    const formatter = new Intl.DateTimeFormat('es-ES', options);
    const parts = formatter.formatToParts(now);
    
    const dateObj = {};
    parts.forEach(part => {
      dateObj[part.type] = part.value;
    });

    const fecha_hora = `${dateObj.year}-${dateObj.month}-${dateObj.day} ${dateObj.hour}:${dateObj.minute}:${dateObj.second}`;

    // Calcular horas trabajadas si es salida
    let horas_trabajadas = null;
    if (tipo === 'salida') {
      const [entradaAnterior] = await connection.execute(
        `SELECT fecha_hora 
         FROM fichajes 
         WHERE id_usuario = ? AND tipo = 'entrada' 
         ORDER BY fecha_hora DESC 
         LIMIT 1`,
        [id_usuario]
      );

      if (entradaAnterior.length > 0) {
        const entradaDate = new Date(entradaAnterior[0].fecha_hora);
        const diffMs = now - entradaDate;
        horas_trabajadas = parseFloat((diffMs / (1000 * 60 * 60)).toFixed(2));

        // Validar que haya pasado mínimo 1 minuto
        if (horas_trabajadas < 0.0167) { // ~1 minuto
          await connection.rollback();
          return res.status(400).json({
            error: 'Tiempo insuficiente',
            mensaje: 'Debe pasar al menos 1 minuto entre entrada y salida'
          });
        }
      }
    }

    // Insertar fichaje
    const [result] = await connection.execute(
      `INSERT INTO fichajes 
       (id_usuario, tipo, fecha_hora, horas_trabajadas)
       VALUES (?, ?, ?, ?)`,
      [id_usuario, tipo, fecha_hora, horas_trabajadas]
    );

    // Actualizar horas anuales si hay horas trabajadas
    if (horas_trabajadas !== null) {
      const [user] = await connection.execute(
        'SELECT horas_anuales_trabajadas FROM usuarios WHERE id_usuario = ?',
        [id_usuario]
      );

      const horasActuales = user[0]?.horas_anuales_trabajadas || 0;
      const horasNuevas = horasActuales + horas_trabajadas;

      // Validación: no exceder 1784 horas anuales
      if (horasNuevas > 1784) {
        await connection.rollback();
        return res.status(400).json({
          error: 'Límite de horas excedido',
          mensaje: `No puedes registrar más horas. Límite anual: 1784h, Actual: ${horasActuales}h`
        });
      }

      await connection.execute(
        'UPDATE usuarios SET horas_anuales_trabajadas = ? WHERE id_usuario = ?',
        [horasNuevas, id_usuario]
      );
    }

    await connection.commit();

    console.log(`[FICHAJE] ${tipo.toUpperCase()} registrado para usuario ${id_usuario}`);

    return res.status(201).json({
      success: true,
      mensaje: `Fichaje ${tipo} registrado correctamente`,
      datos: {
        id_fichaje: result.insertId,
        fecha_hora,
        tipo,
        horas_trabajadas
      }
    });

  } catch (error) {
    if (connection) await connection.rollback();
    console.error('[FICHAJE] Error:', error);
    return res.status(500).json({
      error: 'Error del servidor',
      mensaje: 'No se pudo registrar el fichaje'
    });
  } finally {
    if (connection) connection.release();
  }
});

/**
 * GET /api/fichaje/ultimo/:id_usuario
 * Obtiene el último fichaje de un usuario
 */
router.get('/ultimo/:id_usuario', authMiddleware, async (req, res) => {
  const { id_usuario } = req.params;

  // El usuario solo puede ver sus propios fichajes
  if (req.usuario.rol === 'usuario' && req.usuario.id !== parseInt(id_usuario)) {
    return res.status(403).json({
      error: 'No autorizado'
    });
  }

  let connection;
  try {
    connection = await db.getConnection();

    const [result] = await connection.execute(
      `SELECT tipo, fecha_hora, horas_trabajadas
       FROM fichajes 
       WHERE id_usuario = ? 
       ORDER BY fecha_hora DESC 
       LIMIT 1`,
      [id_usuario]
    );

    if (result.length === 0) {
      return res.status(404).json({
        error: 'No encontrado',
        mensaje: 'El usuario no tiene fichajes registrados'
      });
    }

    return res.status(200).json(result[0]);

  } catch (error) {
    console.error('[FICHAJE-ULTIMO] Error:', error);
    return res.status(500).json({
      error: 'Error del servidor',
      mensaje: 'No se pudo obtener el último fichaje'
    });
  } finally {
    if (connection) connection.release();
  }
});

/**
 * GET /api/fichaje/horas/:id_usuario
 * Obtiene horas anuales trabajadas y restantes
 */
router.get('/horas/:id_usuario', authMiddleware, async (req, res) => {
  const { id_usuario } = req.params;

  // El usuario solo puede ver sus propias horas
  if (req.usuario.rol === 'usuario' && req.usuario.id !== parseInt(id_usuario)) {
    return res.status(403).json({
      error: 'No autorizado'
    });
  }

  let connection;
  try {
    connection = await db.getConnection();

    const [result] = await connection.execute(
      'SELECT horas_anuales_trabajadas FROM usuarios WHERE id_usuario = ?',
      [id_usuario]
    );

    if (result.length === 0) {
      return res.status(404).json({
        error: 'No encontrado',
        mensaje: 'El usuario no existe'
      });
    }

    const trabajadas = parseFloat(result[0].horas_anuales_trabajadas) || 0;
    const limite = 1784;
    const restantes = Math.max(0, parseFloat((limite - trabajadas).toFixed(2)));
    const porcentaje = Math.min(100, parseFloat(((trabajadas / limite) * 100).toFixed(2)));

    // Advertencia si está cerca del límite
    const estado = 
      porcentaje >= 100 ? 'Límite alcanzado' :
      porcentaje >= 90 ? 'Proximidad al límite' :
      'Normal';

    return res.status(200).json({
      trabajadas,
      restantes,
      porcentaje,
      limite,
      estado
    });

  } catch (error) {
    console.error('[FICHAJE-HORAS] Error:', error);
    return res.status(500).json({
      error: 'Error del servidor',
      mensaje: 'No se pudieron obtener las horas'
    });
  } finally {
    if (connection) connection.release();
  }
});

/**
 * GET /api/fichaje/historial/:id_usuario
 * Obtiene el historial de fichajes de un usuario (paginado)
 */
router.get('/historial/:id_usuario', authMiddleware, async (req, res) => {
  const { id_usuario } = req.params;
  const { pagina = 1, limite = 50 } = req.query;

  // El usuario solo puede ver sus propios fichajes
  if (req.usuario.rol === 'usuario' && req.usuario.id !== parseInt(id_usuario)) {
    return res.status(403).json({
      error: 'No autorizado'
    });
  }

  // Validar paginación
  const paginaNum = Math.max(1, parseInt(pagina) || 1);
  const limiteNum = Math.min(100, Math.max(1, parseInt(limite) || 50));
  const offset = (paginaNum - 1) * limiteNum;

  let connection;
  try {
    connection = await db.getConnection();

    // Obtener total
    const [countResult] = await connection.execute(
      'SELECT COUNT(*) as total FROM fichajes WHERE id_usuario = ?',
      [id_usuario]
    );

    // Obtener datos paginados
    const [fichajes] = await connection.execute(
      `SELECT id_fichaje, tipo, fecha_hora, horas_trabajadas
       FROM fichajes 
       WHERE id_usuario = ?
       ORDER BY fecha_hora DESC
       LIMIT ? OFFSET ?`,
      [id_usuario, limiteNum, offset]
    );

    const total = countResult[0]?.total || 0;
    const totalPaginas = Math.ceil(total / limiteNum);

    return res.json({
      paginaActual: paginaNum,
      totalPaginas,
      totalFichajes: total,
      fichajes
    });

  } catch (error) {
    console.error('[FICHAJE-HISTORIAL] Error:', error);
    return res.status(500).json({
      error: 'Error del servidor'
    });
  } finally {
    if (connection) connection.release();
  }
});

module.exports = router;
