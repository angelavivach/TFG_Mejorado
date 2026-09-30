// Inicializa/actualiza el esquema y crea los usuarios de prueba.
// Todo es idempotente: no borra ni sobreescribe datos existentes.
const fs     = require('fs');
const path   = require('path');
const bcrypt = require('bcryptjs');
const db     = require('./db');
const config = require('./config');

async function aplicarEsquema() {
  const sql = fs.readFileSync(path.join(__dirname, '..', 'database', 'schema.sql'), 'utf8');
  const sentencias = sql
    .split('\n')
    .filter(l => !l.trim().startsWith('--'))
    .join('\n')
    .split(';')
    .map(s => s.trim())
    .filter(Boolean);

  for (const s of sentencias) {
    await db.query(s);
  }
}

async function crearUsuariosPrueba() {
  const hoy = new Date().toISOString().slice(0, 10);
  const { admin, empleado } = config.usuariosPrueba;

  const crear = async ({ nombre, email, password, rol }) => {
    const [existe] = await db.execute('SELECT id_usuario FROM usuarios WHERE email = ?', [email]);
    if (existe.length) return { id: existe[0].id_usuario, creado: false };
    const hash = await bcrypt.hash(password, 12);
    const [r] = await db.execute(
      'INSERT INTO usuarios (nombre, email, password, rol, fecha_alta) VALUES (?, ?, ?, ?, ?)',
      [nombre, email, hash, rol, hoy]
    );
    return { id: r.insertId, creado: true };
  };

  const a = await crear({ nombre: 'Admin Demo', email: admin.email, password: admin.password, rol: 'admin' });
  const e = await crear({ nombre: 'Empleado Demo', email: empleado.email, password: empleado.password, rol: 'usuario' });

  // Horario de ejemplo para el empleado de prueba (respeta la regla de
  // días libres por bloques: aquí libra viernes, sábado y domingo)
  if (e.creado) {
    await db.execute(
      `INSERT INTO horarios (id_usuario, lunes, martes, miercoles, jueves, viernes, sabado, domingo, fecha_inicio)
       VALUES (?, '08:00-16:00', '08:00-16:00', '08:00-16:00', '08:00-16:00', 'Libre', 'Libre', 'Libre', ?)`,
      [e.id, hoy]
    );
  }

  if (a.creado || e.creado) {
    console.log('[initDb] Usuarios de prueba creados:');
    console.log(`         admin    -> ${admin.email}`);
    console.log(`         empleado -> ${empleado.email}`);
  }
}

async function initDb({ seed = config.seedUsuariosPrueba } = {}) {
  await aplicarEsquema();
  if (seed) await crearUsuariosPrueba();
  console.log('[initDb] Esquema de base de datos verificado');
}

module.exports = initDb;
