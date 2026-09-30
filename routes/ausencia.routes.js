// /api/ausencias — solicitudes de ausencia y justificantes
const express = require('express');
const multer  = require('multer');
const path    = require('path');
const crypto  = require('crypto');
const fs      = require('fs');
const db      = require('../conector/db');
const config  = require('../conector/config');
const { requireAdmin } = require('../middleware/auth');
const { esFecha, esId, texto } = require('../middleware/validar');

const router = express.Router();

const TIPOS = ['vacaciones', 'enfermedad', 'personal'];
const ESTADOS = ['pendiente', 'aprobada', 'rechazada'];
const CAMPO_DIAS = {
  vacaciones: 'dias_vacaciones_disponibles',
  enfermedad: 'dias_enfermedad_disponibles',
  personal:   'dias_asuntopersonal_disponible'
};
// La extensión se decide por el tipo MIME, nunca por el nombre que envía el cliente
const MIME_EXT = { 'application/pdf': '.pdf', 'image/jpeg': '.jpg', 'image/png': '.png' };
const EXT_OK = ['.pdf', '.jpg', '.jpeg', '.png'];

// ---------- Subida de justificantes ----------
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const mes = new Date().toISOString().slice(0, 7); // YYYY-MM
    const dir = path.join(config.uploadsDir, String(req.user.id), mes);
    fs.mkdir(dir, { recursive: true }, err => cb(err, dir));
  },
  filename: (req, file, cb) => {
    cb(null, `${Date.now()}-${crypto.randomBytes(8).toString('hex')}${MIME_EXT[file.mimetype]}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024, files: 1, fields: 10 },
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname || '').toLowerCase();
    if (MIME_EXT[file.mimetype] && EXT_OK.includes(ext)) return cb(null, true);
    const err = new Error('Solo se permiten archivos PDF, JPG o PNG');
    err.code = 'TIPO_NO_PERMITIDO';
    cb(err);
  }
});

function subirJustificante(req, res, next) {
  upload.single('justificante')(req, res, err => {
    if (!err) return next();
    const msg = err.code === 'LIMIT_FILE_SIZE'   ? 'El archivo supera los 5 MB'
              : err.code === 'TIPO_NO_PERMITIDO' ? 'Solo se permiten archivos PDF, JPG o PNG'
              : 'Archivo no válido. Solo se permiten archivos PDF, JPG o PNG (máx. 5 MB)';
    res.status(400).json({ error: msg });
  });
}

const borrarArchivo = f => f && fs.unlink(f.path, () => {});

// Días naturales entre dos fechas 'YYYY-MM-DD', ambos incluidos
const calcularDias = (ini, fin) =>
  Math.round((Date.parse(fin + 'T00:00:00Z') - Date.parse(ini + 'T00:00:00Z')) / 86_400_000) + 1;

// ---------- POST /api/ausencias — solicitar ausencia (usuario con sesión) ----------
router.post('/', subirJustificante, async (req, res) => {
  const tipo         = req.body?.tipo;
  const fecha_inicio = req.body?.fecha_inicio;
  const fecha_fin    = req.body?.fecha_fin;
  const comentario   = texto(req.body?.comentarios, 1000) || null;
  const idUsuario    = req.user.id;

  const fallo = (status, error) => { borrarArchivo(req.file); return res.status(status).json({ error }); };

  if (!TIPOS.includes(tipo))                      return fallo(400, 'Tipo de ausencia no válido');
  if (!esFecha(fecha_inicio) || !esFecha(fecha_fin)) return fallo(400, 'Fechas no válidas');

  const dias = calcularDias(fecha_inicio, fecha_fin);
  if (dias <= 0)   return fallo(400, 'La fecha fin no puede ser anterior a la fecha inicio');
  if (dias > 366)  return fallo(400, 'El periodo solicitado es demasiado largo');
  if (tipo === 'enfermedad' && !req.file) return fallo(400, 'El justificante es obligatorio para enfermedad');

  try {
    const campo = CAMPO_DIAS[tipo];
    const [u] = await db.query(`SELECT ${campo} AS disponibles FROM usuarios WHERE id_usuario = ?`, [idUsuario]);
    if (!u.length) return fallo(404, 'Usuario no encontrado');
    if (u[0].disponibles < dias) {
      return fallo(400, `Días insuficientes para ${tipo}. Disponibles: ${u[0].disponibles}, solicitados: ${dias}`);
    }

    const justificante = req.file ? path.relative(config.uploadsDir, req.file.path).split(path.sep).join('/') : null;
    const [result] = await db.query(
      `INSERT INTO ausencias (id_usuario, tipo, fecha_inicio, fecha_fin, estado, comentario, justificante, dias_consumidos)
       VALUES (?, ?, ?, ?, 'pendiente', ?, ?, ?)`,
      [idUsuario, tipo, fecha_inicio, fecha_fin, comentario, justificante, dias]
    );

    res.status(201).json({ mensaje: 'Ausencia solicitada correctamente', id: result.insertId, dias_consumidos: dias });
  } catch (error) {
    borrarArchivo(req.file);
    console.error('Error en POST /api/ausencias:', error.message);
    res.status(500).json({ error: 'Error al crear la ausencia' });
  }
});

// ---------- GET /api/ausencias — admin: todas (filtro ?estado=); empleado: solo las suyas ----------
router.get('/', async (req, res) => {
  try {
    const where = [];
    const params = [];
    if (req.user.rol !== 'admin') { where.push('a.id_usuario = ?'); params.push(req.user.id); }
    if (ESTADOS.includes(req.query.estado)) { where.push('a.estado = ?'); params.push(req.query.estado); }

    const [rows] = await db.query(
      `SELECT a.id_ausencia, a.id_usuario, u.nombre, a.tipo, a.fecha_inicio, a.fecha_fin, a.estado,
              a.comentario, a.dias_consumidos, (a.justificante IS NOT NULL) AS tiene_justificante
         FROM ausencias a JOIN usuarios u ON u.id_usuario = a.id_usuario
        ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
        ORDER BY a.fecha_inicio DESC, a.id_ausencia DESC`,
      params
    );
    res.json(rows.map(r => ({ ...r, tiene_justificante: !!r.tiene_justificante })));
  } catch (error) {
    console.error('Error en GET /api/ausencias:', error.message);
    res.status(500).json({ error: 'Error al obtener ausencias' });
  }
});

// ---------- GET /api/ausencias/:id/justificante — admin o propietario ----------
router.get('/:id/justificante', async (req, res) => {
  if (!esId(req.params.id)) return res.status(400).json({ error: 'ID no válido' });
  try {
    const [rows] = await db.query('SELECT id_usuario, justificante FROM ausencias WHERE id_ausencia = ?', [req.params.id]);
    const a = rows[0];
    if (!a || !a.justificante) return res.status(404).json({ error: 'Justificante no encontrado' });
    if (req.user.rol !== 'admin' && a.id_usuario !== req.user.id) {
      return res.status(403).json({ error: 'No tienes permiso para ver este archivo' });
    }

    const base = path.resolve(config.uploadsDir);
    const ruta = path.resolve(base, a.justificante);
    if (!ruta.startsWith(base + path.sep) || !fs.existsSync(ruta)) {
      return res.status(404).json({ error: 'El archivo ya no está disponible en el servidor' });
    }
    res.setHeader('Content-Disposition', 'inline');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.sendFile(ruta);
  } catch (error) {
    console.error('Error sirviendo justificante:', error.message);
    res.status(500).json({ error: 'Error al obtener el justificante' });
  }
});

// ---------- PUT /api/ausencias/:id — aprobar / rechazar (solo admin) ----------
router.put('/:id', requireAdmin, async (req, res) => {
  const { id } = req.params;
  const estado = req.body?.estado;
  if (!esId(id))                 return res.status(400).json({ error: 'ID no válido' });
  if (!ESTADOS.includes(estado)) return res.status(400).json({ error: 'Estado no válido' });

  let conn;
  try {
    conn = await db.getConnection();
    await conn.beginTransaction();

    const [rows] = await conn.query(
      'SELECT tipo, dias_consumidos, id_usuario, estado FROM ausencias WHERE id_ausencia = ? FOR UPDATE',
      [id]
    );
    if (!rows.length) {
      await conn.rollback();
      return res.status(404).json({ error: 'Ausencia no encontrada' });
    }

    const a = rows[0];
    const campo = CAMPO_DIAS[a.tipo];
    const dias = a.dias_consumidos || 0;

    if (campo && estado === 'aprobada' && a.estado !== 'aprobada') {
      // Descuenta días solo si hay saldo suficiente (comprobación y descuento en una sola sentencia)
      const [r] = await conn.query(
        `UPDATE usuarios SET ${campo} = ${campo} - ? WHERE id_usuario = ? AND ${campo} >= ?`,
        [dias, a.id_usuario, dias]
      );
      if (!r.affectedRows) {
        await conn.rollback();
        return res.status(400).json({ error: `No se puede aprobar: el empleado no tiene días suficientes de ${a.tipo}` });
      }
    } else if (campo && a.estado === 'aprobada' && estado !== 'aprobada') {
      // Se deshace una aprobación: se devuelven los días
      await conn.query(`UPDATE usuarios SET ${campo} = ${campo} + ? WHERE id_usuario = ?`, [dias, a.id_usuario]);
    }

    await conn.query('UPDATE ausencias SET estado = ? WHERE id_ausencia = ?', [estado, id]);
    await conn.commit();
    res.json({ mensaje: 'Estado actualizado correctamente' });
  } catch (error) {
    if (conn) await conn.rollback().catch(() => {});
    console.error('Error en PUT /api/ausencias:', error.message);
    res.status(500).json({ error: 'Error al actualizar la ausencia' });
  } finally {
    if (conn) conn.release();
  }
});

module.exports = router;
