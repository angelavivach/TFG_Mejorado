const express = require('express');
const router = express.Router();
const multer = require('multer');
const db = require('./conector/db');
const path = require('path');
const fs = require('fs').promises;
const { authMiddleware, autorizar, validarEntrada } = require('./auth-middleware');
const { solicitarAusenciaSchema, actualizarAusenciaSchema } = require('./validation-schemas');

// ============ CONFIGURACIÓN MULTER ============
const storage = multer.diskStorage({
  destination: async (req, file, cb) => {
    try {
      const { usuario_id } = req.body;
      
      if (!usuario_id) {
        throw new Error('usuario_id requerido');
      }

      const now = new Date();
      const year = now.getFullYear();
      const month = String(now.getMonth() + 1).padStart(2, '0');
      const day = String(now.getDate()).padStart(2, '0');

      const uploadDir = path.resolve(__dirname, './uploads', usuario_id.toString(), `${year}-${month}-${day}`);
      
      await fs.mkdir(uploadDir, { recursive: true });
      cb(null, uploadDir);
    } catch (error) {
      cb(error);
    }
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({
  storage,
  limits: { 
    fileSize: 5 * 1024 * 1024 // 5MB
  },
  fileFilter: (req, file, cb) => {
    // Solo permitir PDF, JPG, PNG
    const allowedMimes = ['application/pdf', 'image/jpeg', 'image/png'];
    
    if (allowedMimes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Solo se permiten archivos PDF, JPG o PNG'));
    }
  }
});

/**
 * Calcula días entre dos fechas
 */
const calcularDias = (fechaInicio, fechaFin) => {
  const inicio = new Date(fechaInicio);
  const fin = new Date(fechaFin);
  const diferencia = fin.getTime() - inicio.getTime();
  return Math.floor(diferencia / (1000 * 3600 * 24)) + 1;
};

/**
 * POST /api/ausencias
 * Solicita una ausencia
 */
router.post('/', 
  authMiddleware, 
  (req, res, next) => {
    // Multer solo si es enfermedad
    if (req.body.tipo === 'enfermedad') {
      upload.single('justificante')(req, res, (err) => {
        if (err) {
          return res.status(400).json({ 
            error: err.message 
          });
        }
        next();
      });
    } else {
      next();
    }
  },
  validarEntrada(solicitarAusenciaSchema),
  async (req, res) => {
    const { tipo, fecha_inicio, fecha_fin, comentarios, usuario_id } = req.body;
    const idUsuario = parseInt(usuario_id, 10);

    // El usuario solo puede solicitar ausencias para sí mismo
    if (req.usuario.rol === 'usuario' && req.usuario.id !== idUsuario) {
      return res.status(403).json({
        error: 'No autorizado',
        mensaje: 'No puedes solicitar ausencias por otro usuario'
      });
    }

    const diasSolicitados = calcularDias(fecha_inicio, fecha_fin);
    if (diasSolicitados <= 0) {
      return res.status(400).json({
        error: 'Fechas inválidas',
        mensaje: 'La fecha fin debe ser posterior a la fecha inicio'
      });
    }

    // Validar que enfermedad tenga justificante
    if (tipo === 'enfermedad' && !req.file) {
      return res.status(400).json({
        error: 'Justificante requerido',
        mensaje: 'El justificante es obligatorio para ausencias por enfermedad'
      });
    }

    let connection;
    try {
      connection = await db.getConnection();
      await connection.beginTransaction();

      // Verificar usuario y obtener días disponibles
      const [user] = await connection.execute(
        `SELECT 
           dias_vacaciones_disponibles,
           dias_enfermedad_disponibles,
           dias_asuntopersonal_disponible
         FROM usuarios WHERE id_usuario = ? AND activo = 1`,
        [idUsuario]
      );

      if (user.length === 0) {
        await connection.rollback();
        return res.status(404).json({
          error: 'Usuario no encontrado',
          mensaje: 'El usuario no existe o está inactivo'
        });
      }

      // Mapear tipo a campo
      let campo = null;
      const diasDisponibles = user[0];

      switch (tipo) {
        case 'vacaciones':
          campo = 'dias_vacaciones_disponibles';
          break;
        case 'enfermedad':
          campo = 'dias_enfermedad_disponibles';
          break;
        case 'personal':
          campo = 'dias_asuntopersonal_disponible';
          break;
      }

      // Validar días disponibles
      if (diasDisponibles[campo] < diasSolicitados) {
        await connection.rollback();
        return res.status(400).json({
          error: 'Días insuficientes',
          mensaje: `Disponibles: ${diasDisponibles[campo]}, Solicitados: ${diasSolicitados}`
        });
      }

      const justificantePath = req.file ? 
        path.relative(__dirname, req.file.path).replace(/\\/g, '/') : 
        null;

      // Insertar ausencia
      const [result] = await connection.execute(
        `INSERT INTO ausencias 
         (id_usuario, tipo, fecha_inicio, fecha_fin, estado, comentario, justificante, dias_consumidos)
         VALUES (?, ?, ?, ?, 'pendiente', ?, ?, ?)`,
        [idUsuario, tipo, fecha_inicio, fecha_fin, comentarios || null, justificantePath, diasSolicitados]
      );

      await connection.commit();

      console.log(`[AUSENCIA-POST] Ausencia ${tipo} solicitada para usuario ${idUsuario}`);

      return res.status(201).json({
        mensaje: 'Ausencia solicitada correctamente',
        id: result.insertId,
        archivo: justificantePath,
        dias_consumidos: diasSolicitados
      });

    } catch (error) {
      if (connection) await connection.rollback();
      console.error('[AUSENCIA-POST] Error:', error);
      return res.status(500).json({
        error: 'Error al crear ausencia',
        mensaje: error.message
      });
    } finally {
      if (connection) connection.release();
    }
  }
);

/**
 * GET /api/ausencias
 * Obtiene ausencias (admin ve todas, usuario ve las suyas)
 */
router.get('/', authMiddleware, async (req, res) => {
  const { estado } = req.query;
  
  let connection;
  try {
    connection = await db.getConnection();

    let query = 'SELECT * FROM ausencias WHERE 1=1';
    const params = [];

    // Si es usuario, solo ver sus ausencias
    if (req.usuario.rol === 'usuario') {
      query += ' AND id_usuario = ?';
      params.push(req.usuario.id);
    }

    // Filtrar por estado si se proporciona
    if (estado) {
      query += ' AND estado = ?';
      params.push(estado);
    }

    query += ' ORDER BY fecha_inicio DESC';

    const [ausencias] = await connection.execute(query, params);

    return res.json({
      cantidad: ausencias.length,
      ausencias
    });

  } catch (error) {
    console.error('[AUSENCIA-GET] Error:', error);
    return res.status(500).json({
      error: 'Error al obtener ausencias'
    });
  } finally {
    if (connection) connection.release();
  }
});

/**
 * PUT /api/ausencias/:id
 * Aprueba o rechaza una ausencia (solo admin)
 */
router.put('/:id', 
  authMiddleware, 
  autorizar('admin'), 
  validarEntrada(actualizarAusenciaSchema), 
  async (req, res) => {
    const { id } = req.params;
    const { estado } = req.body;

    let connection;
    try {
      connection = await db.getConnection();
      await connection.beginTransaction();

      // Obtener ausencia
      const [ausencias] = await connection.execute(
        'SELECT tipo, dias_consumidos, id_usuario, estado FROM ausencias WHERE id_ausencia = ?',
        [id]
      );

      if (ausencias.length === 0) {
        await connection.rollback();
        return res.status(404).json({
          error: 'Ausencia no encontrada'
        });
      }

      const ausencia = ausencias[0];
      const estadoAnterior = ausencia.estado;

      // Lógica de aprobación
      if (estado === 'aprobada' && estadoAnterior === 'pendiente') {
        let campoUsuario = null;
        
        switch (ausencia.tipo) {
          case 'vacaciones':
            campoUsuario = 'dias_vacaciones_disponibles';
            break;
          case 'enfermedad':
            campoUsuario = 'dias_enfermedad_disponibles';
            break;
          case 'personal':
            campoUsuario = 'dias_asuntopersonal_disponible';
            break;
        }

        if (campoUsuario) {
          const [user] = await connection.execute(
            `SELECT ${campoUsuario} FROM usuarios WHERE id_usuario = ?`,
            [ausencia.id_usuario]
          );

          const disponibles = user[0][campoUsuario];
          if (disponibles < ausencia.dias_consumidos) {
            await connection.rollback();
            return res.status(400).json({
              error: 'No se puede aprobar',
              mensaje: `Días insuficientes. Disponibles: ${disponibles}, Requeridos: ${ausencia.dias_consumidos}`
            });
          }

          // Restar días
          await connection.execute(
            `UPDATE usuarios SET ${campoUsuario} = ? WHERE id_usuario = ?`,
            [disponibles - ausencia.dias_consumidos, ausencia.id_usuario]
          );
        }
      }

      // Lógica de rechazo (restaurar días si estaba aprobada)
      if (estado === 'rechazada' && estadoAnterior === 'aprobada') {
        let campoUsuario = null;

        switch (ausencia.tipo) {
          case 'vacaciones':
            campoUsuario = 'dias_vacaciones_disponibles';
            break;
          case 'enfermedad':
            campoUsuario = 'dias_enfermedad_disponibles';
            break;
          case 'personal':
            campoUsuario = 'dias_asuntopersonal_disponible';
            break;
        }

        if (campoUsuario) {
          const [user] = await connection.execute(
            `SELECT ${campoUsuario} FROM usuarios WHERE id_usuario = ?`,
            [ausencia.id_usuario]
          );

          // Restaurar días
          await connection.execute(
            `UPDATE usuarios SET ${campoUsuario} = ? WHERE id_usuario = ?`,
            [user[0][campoUsuario] + ausencia.dias_consumidos, ausencia.id_usuario]
          );
        }
      }

      // Actualizar ausencia
      const [result] = await connection.execute(
        'UPDATE ausencias SET estado = ? WHERE id_ausencia = ?',
        [estado, id]
      );

      if (result.affectedRows === 0) {
        await connection.rollback();
        return res.status(404).json({
          error: 'Ausencia no encontrada'
        });
      }

      await connection.commit();

      console.log(`[AUSENCIA-PUT] Ausencia ${id} actualizada a ${estado}`);

      return res.json({
        mensaje: 'Estado actualizado correctamente'
      });

    } catch (error) {
      if (connection) await connection.rollback();
      console.error('[AUSENCIA-PUT] Error:', error);
      return res.status(500).json({
        error: 'Error al actualizar ausencia'
      });
    } finally {
      if (connection) connection.release();
    }
  }
);

/**
 * GET /api/ausencias/download/:id
 * Descarga el justificante de una ausencia
 */
router.get('/download/:id', authMiddleware, async (req, res) => {
  const { id } = req.params;

  let connection;
  try {
    connection = await db.getConnection();

    const [ausencia] = await connection.execute(
      'SELECT id_usuario, justificante FROM ausencias WHERE id_ausencia = ?',
      [id]
    );

    if (ausencia.length === 0) {
      return res.status(404).json({
        error: 'Ausencia no encontrada'
      });
    }

    // Verificar permisos
    if (req.usuario.rol === 'usuario' && req.usuario.id !== ausencia[0].id_usuario) {
      return res.status(403).json({
        error: 'No autorizado'
      });
    }

    if (!ausencia[0].justificante) {
      return res.status(404).json({
        error: 'No hay justificante disponible'
      });
    }

    const filePath = path.join(__dirname, ausencia[0].justificante);
    
    // Validar que la ruta esté dentro de uploads
    if (!filePath.includes('uploads')) {
      return res.status(400).json({
        error: 'Ruta inválida'
      });
    }

    res.download(filePath);

  } catch (error) {
    console.error('[AUSENCIA-DOWNLOAD] Error:', error);
    return res.status(500).json({
      error: 'Error al descargar el archivo'
    });
  } finally {
    if (connection) connection.release();
  }
});

module.exports = router;
