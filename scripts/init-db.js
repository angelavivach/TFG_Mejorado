// Uso: npm run db:init   (crea tablas, aplica correcciones y usuarios de prueba)
const initDb = require('../conector/initDb');
const db     = require('../conector/db');

initDb({ seed: true })
  .then(() => { console.log('Base de datos lista.'); return db.end(); })
  .catch(err => { console.error('Error inicializando la BD:', err.message); process.exit(1); });
