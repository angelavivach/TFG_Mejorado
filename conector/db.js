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
  ...(config.db.ssl ? { ssl: { rejectUnauthorized: true } } : {})
});

module.exports = pool.promise();
