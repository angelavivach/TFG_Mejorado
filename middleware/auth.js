// Autenticación con JWT guardado en una cookie httpOnly.
// - httpOnly: el JavaScript de la página no puede leerla (mitiga robo por XSS)
// - sameSite=strict: el navegador no la envía desde otros sitios (mitiga CSRF)
// - secure (en producción): solo viaja por HTTPS
const jwt    = require('jsonwebtoken');
const db     = require('../conector/db');
const config = require('../conector/config');

const COOKIE = 'timecp_session';

function opcionesCookie() {
  return {
    httpOnly: true,
    sameSite: 'strict',
    secure: config.esProduccion,
    path: '/'
  };
}

function crearSesion(res, usuario) {
  const token = jwt.sign(
    { sub: usuario.id_usuario, rol: usuario.rol },
    config.jwtSecret,
    { expiresIn: config.jwtExpira }
  );
  const payload = jwt.decode(token);
  res.cookie(COOKIE, token, { ...opcionesCookie(), maxAge: (payload.exp - payload.iat) * 1000 });
}

function cerrarSesion(res) {
  res.clearCookie(COOKIE, opcionesCookie());
}

// Verifica el token y comprueba en BD que el usuario sigue existiendo y activo
// (así, si un admin da de baja a alguien, su sesión deja de valer al momento).
async function obtenerUsuario(req) {
  const token = req.cookies?.[COOKIE];
  if (!token) return null;
  try {
    const { sub } = jwt.verify(token, config.jwtSecret);
    const [rows] = await db.execute(
      'SELECT id_usuario, nombre, email, rol, activo FROM usuarios WHERE id_usuario = ?',
      [sub]
    );
    if (!rows.length || !rows[0].activo) return null;
    const u = rows[0];
    return { id: u.id_usuario, nombre: u.nombre, email: u.email, rol: u.rol };
  } catch {
    return null;
  }
}

// ---- Middlewares para la API ----
function requireAuth(req, res, next) {
  obtenerUsuario(req)
    .then(usuario => {
      if (!usuario) {
        cerrarSesion(res);
        return res.status(401).json({ mensaje: 'Sesión no válida o caducada' });
      }
      req.user = usuario;
      next();
    })
    .catch(next);
}

function requireAdmin(req, res, next) {
  if (req.user?.rol !== 'admin') {
    return res.status(403).json({ mensaje: 'Acceso restringido a administradores' });
  }
  next();
}

// ---- Middleware para proteger páginas HTML ----
function protegerPagina(rolRequerido) {
  return (req, res, next) => {
    obtenerUsuario(req)
      .then(usuario => {
        if (!usuario) return res.redirect('/login/index.html');
        if (rolRequerido && usuario.rol !== rolRequerido) {
          return res.redirect(usuario.rol === 'admin' ? '/admin/Admin.html' : '/usu/User.html');
        }
        req.user = usuario;
        next();
      })
      .catch(next);
  };
}

module.exports = { crearSesion, cerrarSesion, obtenerUsuario, requireAuth, requireAdmin, protegerPagina };
