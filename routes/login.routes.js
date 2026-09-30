// /api/login — inicio/cierre de sesión, registro y "quién soy"
const express = require('express');
const bcrypt  = require('bcryptjs');
const crypto  = require('crypto');
const rateLimit = require('express-rate-limit');
const db      = require('../conector/db');
const config  = require('../conector/config');
const { crearSesion, cerrarSesion, obtenerUsuario } = require('../middleware/auth');
const { esEmail, texto, passwordValida, MSG_PASSWORD } = require('../middleware/validar');

const router = express.Router();

// Máx. 10 intentos de login fallidos por IP cada 15 minutos
const limiteLogin = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  skipSuccessfulRequests: true,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { message: 'Demasiados intentos. Inténtalo de nuevo en 15 minutos.' }
});

// Máx. 5 registros por IP cada hora
const limiteRegistro = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 5,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { message: 'Demasiados registros desde esta IP. Inténtalo más tarde.' }
});

// Hash ficticio para que un email inexistente tarde lo mismo que uno real
// (evita averiguar qué emails están registrados midiendo tiempos)
const HASH_FICTICIO = bcrypt.hashSync(crypto.randomBytes(16).toString('hex'), 10);

/* POST /api/login/login */
router.post('/login', limiteLogin, async (req, res) => {
  const email    = texto(req.body?.email, 100).toLowerCase();
  const password = typeof req.body?.password === 'string' ? req.body.password : '';

  if (!esEmail(email) || !password) {
    return res.status(400).json({ message: 'Email y contraseña son obligatorios' });
  }

  try {
    const [rows] = await db.execute(
      'SELECT id_usuario, nombre, rol, password, activo FROM usuarios WHERE email = ?',
      [email]
    );
    const user = rows[0];
    let ok = false;

    if (!user) {
      await bcrypt.compare(password, HASH_FICTICIO);
    } else if (/^\$2[aby]\$/.test(user.password)) {
      ok = await bcrypt.compare(password, user.password);
    } else if (/^[a-f0-9]{64}$/i.test(user.password)) {
      // Compatibilidad con contraseñas antiguas en SHA-256: se migran a bcrypt
      const sha = crypto.createHash('sha256').update(password).digest('hex');
      ok = crypto.timingSafeEqual(Buffer.from(sha), Buffer.from(user.password.toLowerCase()));
      if (ok) {
        const nuevo = await bcrypt.hash(password, 12);
        await db.execute('UPDATE usuarios SET password = ? WHERE id_usuario = ?', [nuevo, user.id_usuario]);
      }
    }
    // Cualquier otro formato (p. ej. texto plano) se rechaza siempre.

    if (!ok || !user.activo) {
      return res.status(401).json({ message: 'Email o contraseña incorrectos' });
    }

    crearSesion(res, user);
    res.json({
      message: 'Login exitoso',
      user: { id: user.id_usuario, nombre: user.nombre, rol: user.rol }
    });
  } catch (err) {
    console.error('[login] Error:', err.message);
    res.status(500).json({ message: 'Error interno del servidor' });
  }
});

/* POST /api/login/register — crea una cuenta de EMPLEADO (nunca admin) */
router.post('/register', limiteRegistro, async (req, res) => {
  if (!config.registroPublico) {
    return res.status(403).json({ message: 'El registro público está desactivado. Pide el alta a un administrador.' });
  }

  const nombre   = texto(req.body?.companyName ?? req.body?.nombre, 100);
  const email    = texto(req.body?.email, 100).toLowerCase();
  const password = req.body?.password;

  if (!nombre)                 return res.status(400).json({ message: 'El nombre es obligatorio' });
  if (!esEmail(email))         return res.status(400).json({ message: 'Email no válido' });
  if (!passwordValida(password)) return res.status(400).json({ message: MSG_PASSWORD });

  try {
    const hash = await bcrypt.hash(password, 12);
    await db.execute(
      "INSERT INTO usuarios (nombre, email, password, rol, fecha_alta) VALUES (?, ?, ?, 'usuario', CURDATE())",
      [nombre, email, hash]
    );
    res.status(201).json({ message: 'Registro exitoso. Ya puedes iniciar sesión.' });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ message: 'El email ya está registrado' });
    }
    console.error('[register] Error:', err.message);
    res.status(500).json({ message: 'Error interno del servidor' });
  }
});

/* POST /api/login/logout */
router.post('/logout', (req, res) => {
  cerrarSesion(res);
  res.json({ message: 'Sesión cerrada' });
});

/* GET /api/login/me — datos del usuario con sesión activa */
router.get('/me', async (req, res, next) => {
  try {
    const u = await obtenerUsuario(req);
    res.json({ user: u || null });
  } catch (e) { next(e); }
});

module.exports = router;
