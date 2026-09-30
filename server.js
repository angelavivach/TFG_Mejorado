// La zona horaria debe fijarse antes de cargar nada que use fechas.
process.env.TZ = process.env.TZ || 'Europe/Madrid';

const express      = require('express');
const path         = require('path');
const helmet       = require('helmet');
const cookieParser = require('cookie-parser');
const rateLimit    = require('express-rate-limit');

const config = require('./conector/config');
const db     = require('./conector/db');
const initDb = require('./conector/initDb');
const { requireAuth, protegerPagina, obtenerUsuario } = require('./middleware/auth');

const app = express();
app.disable('x-powered-by');
// Render (y la mayoría de PaaS) ponen un proxy delante: necesario para
// que express-rate-limit vea la IP real y para las cookies "secure".
app.set('trust proxy', 1);

// ---------- Cabeceras de seguridad ----------
app.use(helmet({
  contentSecurityPolicy: {
    useDefaults: true,
    directives: {
      'script-src': ["'self'", 'https://cdn.jsdelivr.net'],
      'style-src':  ["'self'", "'unsafe-inline'", 'https://cdn.jsdelivr.net', 'https://fonts.googleapis.com'],
      'font-src':   ["'self'", 'https://cdn.jsdelivr.net', 'https://fonts.gstatic.com'],
      'img-src':    ["'self'", 'data:'],
      'connect-src': ["'self'"],
      'frame-ancestors': ["'none'"],
      'form-action': ["'self'"],
      ...(config.esProduccion ? {} : { 'upgrade-insecure-requests': null })
    }
  },
  hsts: config.esProduccion ? undefined : false
}));

app.use(express.json({ limit: '100kb' }));
app.use(express.urlencoded({ extended: false, limit: '100kb' }));
app.use(cookieParser());

// Protección CSRF adicional: las peticiones que modifican datos deben venir
// de nuestro propio origen (además de la cookie SameSite=Strict).
app.use('/api', (req, res, next) => {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  const origen = req.get('origin');
  if (origen && origen !== `${req.protocol}://${req.get('host')}`) {
    return res.status(403).json({ mensaje: 'Origen no permitido' });
  }
  next();
});

// Límite general de peticiones a la API (anti abuso)
app.use('/api', rateLimit({
  windowMs: 60 * 1000,
  limit: 300,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { mensaje: 'Demasiadas peticiones, espera un momento.' }
}));

// ---------- Salud (para Render) ----------
app.get('/api/health', async (req, res) => {
  try {
    await db.query('SELECT 1');
    res.json({ ok: true, db: 'ok' });
  } catch {
    res.status(503).json({ ok: false, db: 'error' });
  }
});

// ---------- API ----------
app.use('/api/login',     require('./routes/login.routes'));                      // pública
app.use('/api/usuarios',  requireAuth, require('./routes/usuarios.routes'));
app.use('/api/horario',   requireAuth, require('./routes/horario.routes'));
app.use('/api/fichaje',   requireAuth, require('./routes/fichaje.routes'));
app.use('/api/ausencias', requireAuth, require('./routes/ausencia.routes'));

app.use('/api', (req, res) => res.status(404).json({ mensaje: 'Recurso no encontrado' }));

// ---------- Páginas ----------
const vista = path.join(__dirname, 'vista');
const estaticos = { index: false, maxAge: config.esProduccion ? '1h' : 0 };

app.use('/icono', express.static(path.join(__dirname, 'icono'), { maxAge: '7d' }));
app.use('/login', express.static(path.join(vista, 'login'), estaticos));
app.use('/comun', express.static(path.join(vista, 'comun'), estaticos));
app.use('/admin', protegerPagina('admin'),   express.static(path.join(vista, 'admin'), estaticos));
app.use('/usu',   protegerPagina('usuario'), express.static(path.join(vista, 'usu'), estaticos));

// Raíz: al panel si hay sesión, si no al login
app.get('/', async (req, res, next) => {
  try {
    const u = await obtenerUsuario(req);
    if (!u) return res.redirect('/login/index.html');
    res.redirect(u.rol === 'admin' ? '/admin/Admin.html' : '/usu/User.html');
  } catch (e) { next(e); }
});
app.get(['/login', '/login/'], (req, res) => res.redirect('/login/index.html'));

// 404 y errores
app.use((req, res) => res.status(404).send('Página no encontrada'));
app.use((err, req, res, next) => {
  console.error('Error no controlado:', err);
  if (res.headersSent) return next(err);
  if (err.type === 'entity.parse.failed') return res.status(400).json({ mensaje: 'JSON mal formado' });
  if (err.type === 'entity.too.large')    return res.status(413).json({ mensaje: 'Petición demasiado grande' });
  res.status(500).json({ mensaje: 'Error interno del servidor' });
});

// ---------- Arranque ----------
async function arrancar() {
  if (config.dbAutoInit) {
    try {
      await initDb();
    } catch (err) {
      console.error('[initDb] No se pudo inicializar la base de datos:', err.message);
      console.error('         Revisa DB_HOST, DB_USER, DB_PASSWORD, DB_NAME y DB_PORT.');
    }
  }
  app.listen(config.port, () => {
    console.log(`Servidor escuchando en el puerto ${config.port} (${config.esProduccion ? 'producción' : 'desarrollo'})`);
  });
}

arrancar();
