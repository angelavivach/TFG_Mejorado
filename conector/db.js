// Pool de conexiones MySQL (API con promesas)
const mysql  = require('mysql2');
const config = require('./config');

const pool = mysql.createPool({
  host: config.db.host,
  user: config.db.user,
  password: config.db.password,
  database: config.db.database,
  port: config.db.port,
  charset: 'utf8mb4',
  dateStrings: ['DATE'],     // las columnas DATE llegan como 'YYYY-MM-DD' (sin desfases de zona)
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  enableKeepAlive: true,
  ...(config.db.ssl ? { ssl: opcionesSSL() } : {})
});

function opcionesSSL() {
  if (config.db.sslCa) {
    // Conexión cifrada y verificando que el servidor es quien dice ser
    return { ca: config.db.sslCa, rejectUnauthorized: true };
  }
  // Sin CA: la conexión va cifrada, pero no se verifica el certificado
  console.warn('[db] DB_SSL=true sin DB_SSL_CA: conexión cifrada sin verificar el certificado del servidor.');
  return { rejectUnauthorized: false };
}

module.exports = pool.promise();
