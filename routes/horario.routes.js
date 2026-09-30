// /api/horario — horarios semanales
const express = require('express');
const db      = require('../conector/db');
const config  = require('../conector/config');
const { requireAdmin } = require('../middleware/auth');
const { esFecha, esId, normalizarRango, horasDeRango } = require('../middleware/validar');

const router = express.Router();
const DIAS = ['lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado', 'domingo'];
const BLOQUES_LIBRES = [
  ['lunes', 'martes'],
  ['miercoles', 'jueves'],
  ['viernes', 'sabado', 'domingo']
];

// Valida un horario completo { lunes: 'HH:MM-HH:MM' | 'Libre', ... }
function validarHorario(dias) {
  for (const d of DIAS) {
    if (dias[d] === null) {
      return `Valor no válido para ${d}. Usa "HH:MM-HH:MM" (fin posterior al inicio) o "Libre".`;
    }
  }
  const libres = DIAS.filter(d => dias[d] === 'Libre');
  const bloqueOk = BLOQUES_LIBRES.some(b => b.length === libres.length && b.every(d => libres.includes(d)));
  if (!bloqueOk) {
    return 'Los días libres deben ser exactamente uno de estos grupos: [lunes y martes], [miércoles y jueves], [viernes, sábado y domingo].';
  }
  const anuales = DIAS.reduce((acc, d) => acc + horasDeRango(dias[d]), 0) * 52;
  if (anuales > config.limiteHorasAnuales) {
    return `Este horario genera ${anuales.toFixed(1)} h anuales y supera el máximo permitido de ${config.limiteHorasAnuales} h.`;
  }
  return null;
}

// GET /api/horario — admin: todos; empleado: solo los suyos
router.get('/', async (req, res) => {
  try {
    const esAdmin = req.user.rol === 'admin';
    const [rows] = await db.execute(
      `SELECT h.id_horario, h.id_usuario, u.nombre, h.lunes, h.martes, h.miercoles, h.jueves,
              h.viernes, h.sabado, h.domingo, h.fecha_inicio, h.fecha_fin
         FROM horarios h
         JOIN usuarios u ON h.id_usuario = u.id_usuario
        ${esAdmin ? '' : 'WHERE h.id_usuario = ?'}
        ORDER BY h.id_horario`,
      esAdmin ? [] : [req.user.id]
    );
    res.json(rows);
  } catch (err) {
    console.error('Error leyendo horarios:', err.message);
    res.status(500).json({ mensaje: 'Error leyendo horarios' });
  }
});

// El resto de operaciones son de administrador
router.use(requireAdmin);

// GET /api/horario/ids
router.get('/ids', async (req, res) => {
  try {
    const [rows] = await db.execute('SELECT id_horario FROM horarios ORDER BY id_horario');
    res.json(rows.map(r => r.id_horario));
  } catch (err) {
    console.error('Error obteniendo IDs de horarios:', err.message);
    res.status(500).json({ mensaje: 'Error obteniendo IDs de horarios' });
  }
});

// POST /api/horario — crear horario
router.post('/', async (req, res) => {
  const { id_usuario, fecha_inicio } = req.body || {};
  const fecha_fin = req.body?.fecha_fin || null;

  if (!esId(id_usuario))                    return res.status(400).json({ mensaje: 'Usuario no válido' });
  if (!esFecha(fecha_inicio))               return res.status(400).json({ mensaje: 'Fecha de inicio no válida' });
  if (fecha_fin && !esFecha(fecha_fin))     return res.status(400).json({ mensaje: 'Fecha de fin no válida' });
  if (fecha_fin && fecha_fin < fecha_inicio) return res.status(400).json({ mensaje: 'La fecha de fin no puede ser anterior a la de inicio' });

  const dias = {};
  for (const d of DIAS) dias[d] = normalizarRango(req.body?.[d]);
  const error = validarHorario(dias);
  if (error) return res.status(400).json({ mensaje: error });

  try {
    const [u] = await db.execute('SELECT id_usuario FROM usuarios WHERE id_usuario = ?', [id_usuario]);
    if (!u.length) return res.status(404).json({ mensaje: 'Usuario no encontrado' });

    const [result] = await db.execute(
      `INSERT INTO horarios (id_usuario, lunes, martes, miercoles, jueves, viernes, sabado, domingo, fecha_inicio, fecha_fin)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id_usuario, ...DIAS.map(d => dias[d]), fecha_inicio, fecha_fin]
    );
    res.status(201).json({ mensaje: 'Horario creado correctamente', id_horario: result.insertId });
  } catch (err) {
    console.error('Error al crear horario:', err.message);
    res.status(500).json({ mensaje: 'Error al crear horario' });
  }
});

// PUT /api/horario/:idHorario — modificar un día concreto
router.put('/:idHorario', async (req, res) => {
  const { idHorario } = req.params;
  const dia = String(req.body?.dia || '').toLowerCase();
  const nuevo = normalizarRango(req.body?.horario);

  if (!esId(idHorario))     return res.status(400).json({ mensaje: 'ID de horario no válido' });
  if (!DIAS.includes(dia))  return res.status(400).json({ mensaje: `Día inválido. Permitidos: ${DIAS.join(', ')}` });
  if (nuevo === null)       return res.status(400).json({ mensaje: 'Horario no válido. Usa "HH:MM-HH:MM" o "Libre".' });

  try {
    const [rows] = await db.execute(
      `SELECT ${DIAS.join(', ')} FROM horarios WHERE id_horario = ?`,
      [idHorario]
    );
    if (!rows.length) return res.status(404).json({ mensaje: 'Horario no encontrado' });

    // Se valida el horario completo tal y como quedaría tras el cambio
    const dias = {};
    for (const d of DIAS) dias[d] = normalizarRango(rows[0][d] ?? 'Libre') ?? rows[0][d];
    dias[dia] = nuevo;
    const error = validarHorario(dias);
    if (error) return res.status(400).json({ mensaje: error });

    // "dia" está validado contra la lista blanca DIAS: es seguro usarlo como columna
    await db.execute(`UPDATE horarios SET \`${dia}\` = ? WHERE id_horario = ?`, [nuevo, idHorario]);
    res.json({ mensaje: 'Horario actualizado correctamente' });
  } catch (err) {
    console.error('Error al actualizar horario:', err.message);
    res.status(500).json({ mensaje: 'Error del servidor' });
  }
});

// DELETE /api/horario/:idHorario
router.delete('/:idHorario', async (req, res) => {
  if (!esId(req.params.idHorario)) return res.status(400).json({ mensaje: 'ID de horario no válido' });
  try {
    const [result] = await db.execute('DELETE FROM horarios WHERE id_horario = ?', [req.params.idHorario]);
    if (!result.affectedRows) return res.status(404).json({ mensaje: 'Horario no encontrado' });
    res.json({ mensaje: 'Horario eliminado correctamente' });
  } catch (err) {
    console.error('Error al eliminar horario:', err.message);
    res.status(500).json({ mensaje: 'Error al eliminar horario' });
  }
});

module.exports = router;
