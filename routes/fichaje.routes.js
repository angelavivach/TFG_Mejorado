// /api/fichaje — fichajes de entrada/salida del usuario con sesión.
// El usuario se toma SIEMPRE de la sesión (no del body), así nadie puede fichar por otro.
const express = require('express');
const db      = require('../conector/db');
const config  = require('../conector/config');

const router = express.Router();

// POST /api/fichaje  { tipo: 'entrada' | 'salida' }
router.post('/', async (req, res) => {
  const tipo = req.body?.tipo;
  if (!['entrada', 'salida'].includes(tipo)) {
    return res.status(400).json({ error: 'Tipo inválido', mensaje: 'Solo se permite "entrada" o "salida"' });
  }

  const idUsuario = req.user.id;
  let conn;
  try {
    conn = await db.getConnection();
    await conn.beginTransaction();

    // Bloquea la fila del usuario para evitar dobles fichajes simultáneos
    await conn.query('SELECT id_usuario FROM usuarios WHERE id_usuario = ? FOR UPDATE', [idUsuario]);

    const [ultimos] = await conn.query(
      'SELECT tipo, fecha_hora FROM fichajes WHERE id_usuario = ? ORDER BY fecha_hora DESC, id_fichaje DESC LIMIT 1',
      [idUsuario]
    );
    const ultimo = ultimos[0];

    if (ultimo?.tipo === tipo || (!ultimo && tipo === 'salida')) {
      await conn.rollback();
      return res.status(400).json({
        error: 'Acción inválida',
        mensaje: tipo === 'salida' ? 'No puedes fichar salida sin una entrada previa' : 'Ya tienes una entrada abierta: ficha la salida primero'
      });
    }

    const ahora = new Date(); // el proceso corre con TZ=Europe/Madrid
    let horas = null;
    if (tipo === 'salida') {
      horas = Number(((ahora - new Date(ultimo.fecha_hora)) / 3_600_000).toFixed(2));
      if (horas > 999) horas = 999; // cabe en DECIMAL(5,2)
    }

    const [result] = await conn.query(
      'INSERT INTO fichajes (id_usuario, tipo, fecha_hora, horas_trabajadas) VALUES (?, ?, ?, ?)',
      [idUsuario, tipo, ahora, horas]
    );

    if (horas !== null) {
      await conn.query(
        'UPDATE usuarios SET horas_anuales_trabajadas = horas_anuales_trabajadas + ? WHERE id_usuario = ?',
        [horas, idUsuario]
      );
    }

    await conn.commit();
    res.status(201).json({
      success: true,
      mensaje: 'Fichaje registrado correctamente',
      datos: { id_fichaje: result.insertId, fecha_hora: ahora, horas_trabajadas: horas }
    });
  } catch (error) {
    if (conn) await conn.rollback().catch(() => {});
    console.error('Error en el fichaje:', error.message);
    res.status(500).json({ error: 'Error del servidor', mensaje: 'No se pudo registrar el fichaje' });
  } finally {
    if (conn) conn.release();
  }
});

// GET /api/fichaje/ultimo — último fichaje del usuario con sesión
router.get('/ultimo', async (req, res) => {
  try {
    const [rows] = await db.query(
      'SELECT tipo, fecha_hora FROM fichajes WHERE id_usuario = ? ORDER BY fecha_hora DESC, id_fichaje DESC LIMIT 1',
      [req.user.id]
    );
    if (!rows.length) {
      return res.status(404).json({ error: 'No encontrado', mensaje: 'El usuario no tiene fichajes registrados' });
    }
    res.json(rows[0]);
  } catch (error) {
    console.error('Error al obtener último fichaje:', error.message);
    res.status(500).json({ error: 'Error del servidor', mensaje: 'No se pudo obtener el último fichaje' });
  }
});

// GET /api/fichaje/horas — horas trabajadas en el año natural en curso
router.get('/horas', async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT COALESCE(SUM(horas_trabajadas), 0) AS total
         FROM fichajes
        WHERE id_usuario = ? AND horas_trabajadas IS NOT NULL
          AND fecha_hora >= MAKEDATE(YEAR(?), 1)`,
      [req.user.id, new Date()]
    );
    const limite     = config.limiteHorasAnuales;
    const trabajadas = Number(rows[0].total) || 0;
    res.json({
      trabajadas: Number(trabajadas.toFixed(2)),
      restantes:  Number(Math.max(0, limite - trabajadas).toFixed(2)),
      porcentaje: Number(Math.min(100, (trabajadas / limite) * 100).toFixed(2)),
      limite
    });
  } catch (error) {
    console.error('Error al obtener horas trabajadas:', error.message);
    res.status(500).json({ error: 'Error del servidor', mensaje: 'No se pudieron obtener las horas' });
  }
});

module.exports = router;
