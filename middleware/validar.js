// Pequeñas utilidades de validación compartidas por las rutas
const EMAIL_RE = /^[^\s@]{1,64}@[^\s@]{1,255}\.[^\s@]{2,}$/;
const FECHA_RE = /^\d{4}-\d{2}-\d{2}$/;
const RANGO_RE = /^([01]\d|2[0-3]):[0-5]\d-([01]\d|2[0-3]):[0-5]\d$/;

const esEmail = v => typeof v === 'string' && v.length <= 100 && EMAIL_RE.test(v);

const esFecha = v => {
  if (typeof v !== 'string' || !FECHA_RE.test(v)) return false;
  const d = new Date(v + 'T00:00:00Z');
  return !isNaN(d) && d.toISOString().slice(0, 10) === v;
};

const esId = v => /^\d{1,10}$/.test(String(v)) && Number(v) > 0;

const texto = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

// Contraseña: mínimo 8 caracteres, con letras y números
const passwordValida = p => typeof p === 'string' && p.length >= 8 && p.length <= 72 && /[A-Za-z]/.test(p) && /\d/.test(p);
const MSG_PASSWORD = 'La contraseña debe tener entre 8 y 72 caracteres e incluir letras y números';

// Normaliza un valor de día de horario: "Libre" o "HH:MM-HH:MM" (fin > inicio)
function normalizarRango(v) {
  if (typeof v !== 'string') return null;
  const t = v.trim().replace(/\s+/g, '');
  if (t === '' || t.toLowerCase() === 'libre') return 'Libre';
  if (!RANGO_RE.test(t)) return null;
  const [a, b] = t.split('-');
  const min = s => { const [h, m] = s.split(':').map(Number); return h * 60 + m; };
  return min(b) > min(a) ? t : null;
}

function horasDeRango(r) {
  if (!r || r === 'Libre') return 0;
  const [a, b] = r.split('-');
  const h = s => { const [hh, mm] = s.split(':').map(Number); return hh + mm / 60; };
  return h(b) - h(a);
}

module.exports = { esEmail, esFecha, esId, texto, passwordValida, MSG_PASSWORD, normalizarRango, horasDeRango };
