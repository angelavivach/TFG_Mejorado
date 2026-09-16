const express = require('express');
const path = require('path');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
require('dotenv').config();

// Importar rutas mejoradas
const usuariosRouter = require('./usuarios_routes_mejorado');
const horarioRouter = require('./horario_routes_mejorado');
const fichajeRouter = require('./fichaje_routes_mejorado');
const loginRouter = require('./login_routes_mejorado');
const ausenciasRouter = require('./ausencias_routes_mejorado');

const app = express();

// ============ CONFIGURACIÓN DE SEGURIDAD ============

// 1. HELMET - Headers de seguridad HTTP
app.use(helmet());

// 2. CORS - Control de origen
const corsOptions = {
  origin: process.env.CORS_ORIGIN || 'http://localhost:3000',
  credentials: true,
  optionsSuccessStatus: 200,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
};
app.use(cors(corsOptions));

// 3. RATE LIMITING GLOBAL
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 100, // máximo 100 solicitudes por ventana
  message: 'Demasiadas solicitudes. Intenta más tarde.',
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => {
    // No limitar peticiones GET a recursos estáticos
    return req.method === 'GET' && req.path.startsWith('/static');
  }
});
app.use(globalLimiter);

// 4. PARSERS JSON/URL
app.use(express.json({ 
  limit: '10mb' // Limitar tamaño de payload
}));
app.use(express.urlencoded({ 
  limit: '10mb',
  extended: true 
}));

// ============ LOGGING MIDDLEWARE ============
app.use((req, res, next) => {
  const start = Date.now();
  
  res.on('finish', () => {
    const duration = Date.now() - start;
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.path} - ${res.statusCode} - ${duration}ms`);
  });
  
  next();
});

// ============ MIDDLEWARE DE SEGURIDAD PERSONALIZADO ============

// Prevenir acceso a archivos sensibles
app.use((req, res, next) => {
  if (req.path.includes('..') || req.path.includes('//')) {
    return res.status(400).json({ error: 'Ruta inválida' });
  }
  next();
});

// ============ RUTAS DE API ============
console.log('[SERVER] Montando rutas de API...');

app.use('/api/login', loginRouter);
app.use('/api/usuarios', usuariosRouter);
app.use('/api/horario', horarioRouter);
app.use('/api/fichaje', fichajeRouter);
app.use('/api/ausencias', ausenciasRouter);

// ============ ARCHIVOS ESTÁTICOS ============
app.use('/', express.static(path.join(__dirname, 'vista')));
app.use('/login', express.static(path.join(__dirname, 'vista/login')));
app.use('/usu', express.static(path.join(__dirname, 'usu')));

// ============ HEALTH CHECK ============
app.get('/api/health', (req, res) => {
  res.json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

// ============ MANEJO DE RUTAS NO ENCONTRADAS ============
app.use((req, res) => {
  console.warn(`[404] Ruta no encontrada: ${req.method} ${req.path}`);
  res.status(404).json({
    error: 'No encontrado',
    mensaje: `La ruta ${req.method} ${req.path} no existe`,
    path: req.path
  });
});

// ============ MANEJO GLOBAL DE ERRORES ============
app.use((err, req, res, next) => {
  console.error('[ERROR]', {
    message: err.message,
    stack: err.stack,
    path: req.path,
    method: req.method
  });

  // No revelar detalles internos en producción
  const isDevelopment = process.env.NODE_ENV !== 'production';
  
  res.status(err.status || 500).json({
    error: err.message || 'Error interno del servidor',
    ...(isDevelopment && { stack: err.stack })
  });
});

// ============ INICIO DEL SERVIDOR ============
const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || 'localhost';

const server = app.listen(PORT, HOST, () => {
  console.log(`
╔════════════════════════════════════════════════════════════╗
║              TIMECP - Servidor Iniciado                    ║
╠════════════════════════════════════════════════════════════╣
║ Servidor: http://${HOST}:${PORT}
║ Node.js:  ${process.version}
║ Entorno:  ${process.env.NODE_ENV || 'development'}
║ Puerto:   ${PORT}
╠════════════════════════════════════════════════════════════╣
║ Seguridad:
║ ✓ Helmet (Headers HTTP)
║ ✓ CORS configurado
║ ✓ Rate Limiting
║ ✓ Validación de entrada (Joi)
║ ✓ Autenticación JWT
║ ✓ Autorización por roles
║ ✓ SQL Injection Prevention
║ ✓ Password Hashing (bcrypt)
╚════════════════════════════════════════════════════════════╝
  `);

  // Graceful shutdown
  process.on('SIGTERM', () => {
    console.log('[SERVER] SIGTERM recibido. Cerrando servidor...');
    server.close(() => {
      console.log('[SERVER] Servidor cerrado');
      process.exit(0);
    });
  });

  process.on('SIGINT', () => {
    console.log('[SERVER] SIGINT recibido. Cerrando servidor...');
    server.close(() => {
      console.log('[SERVER] Servidor cerrado');
      process.exit(0);
    });
  });
});

// Manejar excepciones no capturadas
process.on('uncaughtException', (err) => {
  console.error('[UNCAUGHT EXCEPTION]', err);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('[UNHANDLED REJECTION]', reason);
  process.exit(1);
});

module.exports = app;
