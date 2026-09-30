// Carga y valida la configuración desde variables de entorno.
// En local se leen de ".env" (en la raíz del proyecto); en Render se
// configuran en el panel "Environment".
const path   = require('path');
const crypto = require('crypto');

require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const esProduccion = process.env.NODE_ENV === 'production';

let jwtSecret = process.env.JWT_SECRET;
if (!jwtSecret || jwtSecret.length < 32) {
  if (esProduccion) {
    console.error('FATAL: JWT_SECRET no está definido o tiene menos de 32 caracteres.');
    process.exit(1);
  }
  jwtSecret = crypto.randomBytes(48).toString('hex');
  console.warn('[config] JWT_SECRET no definido: usando uno aleatorio (las sesiones se pierden al reiniciar).');
}

const bool = (v, def) => (v === undefined || v === '' ? def : ['1', 'true', 'yes', 'si'].includes(String(v).toLowerCase()));

module.exports = {
  esProduccion,
  port: Number(process.env.PORT) || 3000,
  jwtSecret,
  jwtExpira: process.env.JWT_EXPIRES_IN || '8h',
  db: {
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'empresa',
    port: Number(process.env.DB_PORT) || 3306,
    ssl: bool(process.env.DB_SSL, false),
    // Certificado CA del proveedor (Aiven lo da en "Connection information").
    // Se puede pegar tal cual (multilínea) o con los saltos de línea como \n
    sslCa: (process.env.DB_SSL_CA || '').replace(/\\n/g, '\n').trim()
  },
  // Crea tablas que falten y aplica correcciones al arrancar (idempotente)
  dbAutoInit: bool(process.env.DB_AUTO_INIT, true),
  // Crea los usuarios de prueba si no existen
  seedUsuariosPrueba: bool(process.env.SEED_TEST_USERS, true),
  usuariosPrueba: {
    admin: {
      email: process.env.TEST_ADMIN_EMAIL || 'admin@demo.com',
      password: process.env.TEST_ADMIN_PASSWORD || 'Admin1234!'
    },
    empleado: {
      email: process.env.TEST_USER_EMAIL || 'empleado@demo.com',
      password: process.env.TEST_USER_PASSWORD || 'Empleado1234!'
    }
  },
  // El registro público crea SIEMPRE cuentas de rol "usuario"
  registroPublico: bool(process.env.ALLOW_PUBLIC_REGISTER, true),
  limiteHorasAnuales: Number(process.env.LIMITE_HORAS_ANUALES) || 1784,
  zonaHoraria: process.env.TZ || 'Europe/Madrid',
  uploadsDir: process.env.UPLOADS_DIR || path.join(__dirname, '..', 'uploads')
};
