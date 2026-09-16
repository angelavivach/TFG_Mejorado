const express = require('express');
const router = express.Router();
const db = require('./conector/db');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
const { validarEntrada } = require('./auth-middleware');
const { loginSchema, registroSchema } = require('./validation-schemas');

// ============ RATE LIMITING ============
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 5, // máximo 5 intentos
  message: 'Demasiados intentos de login. Intenta más tarde.',
  standardHeaders: true,
  legacyHeaders: false,
});

const registroLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hora
  max: 3, // máximo 3 registros por hora
  message: 'Demasiados intentos de registro. Intenta más tarde.',
});

console.log('[LOGIN] Router de login cargado con seguridad mejorada');

/**
 * POST /api/login/login
 * Inicia sesión con email y password
 */
router.post('/login', loginLimiter, validarEntrada(loginSchema), async (req, res) => {
  const { email, password } = req.body;
  
  console.log(`[LOGIN] Intento de login para: ${email}`);

  let connection;
  try {
    connection = await db.getConnection();
    
    const [rows] = await connection.execute(
      'SELECT id_usuario, nombre, rol, password FROM usuarios WHERE email = ? AND activo = 1',
      [email]
    );

    if (rows.length === 0) {
      console.warn(`[LOGIN] Usuario no encontrado: ${email}`);
      // No revelar si el usuario existe
      return res.status(401).json({ 
        mensaje: 'Email o contraseña incorrectos' 
      });
    }

    const user = rows[0];
    const hash = user.password;
    let passwordOK = false;

    // Soportar ambos formatos: bcrypt y SHA-256 (para migración)
    if (hash.startsWith('$2a$') || hash.startsWith('$2b$')) {
      passwordOK = await bcrypt.compare(password, hash);
    } else if (/^[a-f0-9]{64}$/.test(hash)) {
      // Validar SHA-256 (deprecated, pero soportado temporalmente)
      const sha256 = crypto.createHash('sha256').update(password).digest('hex');
      if (sha256 === hash) {
        passwordOK = true;
        
        // Migrar automáticamente a bcrypt
        try {
          const newHash = await bcrypt.hash(password, 10);
          await connection.execute(
            'UPDATE usuarios SET password = ? WHERE id_usuario = ?',
            [newHash, user.id_usuario]
          );
          console.log(`[LOGIN] Contraseña migrada a bcrypt para usuario: ${user.id_usuario}`);
        } catch (migrError) {
          console.error('[LOGIN] Error al migrar contraseña:', migrError);
          // Continuar de todas formas
        }
      }
    }

    if (!passwordOK) {
      console.warn(`[LOGIN] Contraseña incorrecta para: ${email}`);
      return res.status(401).json({ 
        mensaje: 'Email o contraseña incorrectos' 
      });
    }

    // Generar JWT
    const token = jwt.sign(
      { 
        id: user.id_usuario, 
        nombre: user.nombre, 
        rol: user.rol 
      },
      process.env.JWT_SECRET || 'tu_secret_key',
      { expiresIn: '8h' }
    );

    console.log(`[LOGIN] Login exitoso para usuario: ${user.id_usuario}`);
    
    return res.status(200).json({
      mensaje: 'Login exitoso',
      token,
      user: { 
        id: user.id_usuario, 
        nombre: user.nombre, 
        rol: user.rol 
      }
    });

  } catch (err) {
    console.error('[LOGIN] Error en login:', err);
    return res.status(500).json({ 
      mensaje: 'Error interno del servidor' 
    });
  } finally {
    if (connection) connection.release();
  }
});

/**
 * POST /api/login/register
 * Registra un nuevo usuario (solo administrador)
 */
router.post('/register', registroLimiter, validarEntrada(registroSchema), async (req, res) => {
  const { companyName, email, password } = req.body;
  
  console.log(`[REGISTER] Intento de registro para: ${email}`);

  let connection;
  try {
    connection = await db.getConnection();
    await connection.beginTransaction();

    // Validar que el email no exista
    const [existing] = await connection.execute(
      'SELECT email FROM usuarios WHERE email = ?',
      [email]
    );

    if (existing.length > 0) {
      console.warn(`[REGISTER] Email ya registrado: ${email}`);
      await connection.rollback();
      return res.status(409).json({ 
        mensaje: 'El email ya está registrado' 
      });
    }

    // Hash de contraseña con bcrypt
    const hashedPassword = await bcrypt.hash(password, 10);

    // Insertar usuario como admin
    const [result] = await connection.execute(
      `INSERT INTO usuarios 
       (nombre, email, password, rol, fecha_alta, activo, 
        dias_vacaciones_disponibles, dias_enfermedad_disponibles, dias_asuntopersonal_disponible)
       VALUES (?, ?, ?, 'admin', NOW(), 1, 30, 10, 5)`,
      [companyName, email, hashedPassword]
    );

    await connection.commit();

    console.log(`[REGISTER] Registro exitoso para: ${email}`);
    
    return res.status(201).json({ 
      mensaje: 'Registro exitoso. Ya puedes iniciar sesión.' 
    });

  } catch (err) {
    if (connection) await connection.rollback();
    console.error('[REGISTER] Error en registro:', err);
    return res.status(500).json({ 
      mensaje: 'Error al registrarse' 
    });
  } finally {
    if (connection) connection.release();
  }
});

/**
 * POST /api/login/refresh-token
 * Refresca el JWT
 */
router.post('/refresh-token', (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    
    if (!token) {
      return res.status(401).json({ 
        error: 'Token requerido' 
      });
    }

    // Verificar el token (aunque esté expirado)
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'tu_secret_key', {
      ignoreExpiration: true
    });

    // Generar nuevo token
    const newToken = jwt.sign(
      { 
        id: decoded.id, 
        nombre: decoded.nombre, 
        rol: decoded.rol 
      },
      process.env.JWT_SECRET || 'tu_secret_key',
      { expiresIn: '8h' }
    );

    return res.json({
      mensaje: 'Token renovado',
      token: newToken
    });

  } catch (err) {
    console.error('[TOKEN] Error al renovar token:', err);
    return res.status(401).json({ 
      error: 'No se pudo renovar el token' 
    });
  }
});

module.exports = router;
