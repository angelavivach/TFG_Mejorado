// Utilidades compartidas por los paneles de administrador y empleado.

// fetch con cookies de sesión; si la sesión caduca, vuelve al login.
async function api(url, opciones = {}) {
  const opts = { credentials: 'same-origin', ...opciones, headers: { ...(opciones.headers || {}) } };
  if (opts.body && !(opts.body instanceof FormData) && typeof opts.body !== 'string') {
    opts.headers['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(opts.body);
  }
  const res = await fetch(url, opts);
  if (res.status === 401) {
    window.location.href = '/login/index.html';
    throw new Error('Sesión caducada');
  }
  let data = null;
  try { data = await res.json(); } catch { /* respuesta sin JSON */ }
  if (!res.ok) {
    const err = new Error(data?.mensaje || data?.error || data?.message || `Error ${res.status}`);
    err.status = res.status;
    throw err;
  }
  return data;
}

// Escapa texto antes de insertarlo como HTML (evita XSS)
function escapeHTML(valor) {
  return String(valor ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Muestra una fecha 'YYYY-MM-DD' como dd/mm/aaaa sin desfases de zona horaria
function formatearFecha(valor) {
  if (!valor) return '-';
  const m = String(valor).match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : new Date(valor).toLocaleDateString('es-ES');
}

async function logout() {
  try { await fetch('/api/login/logout', { method: 'POST', credentials: 'same-origin' }); } catch { /* da igual */ }
  window.location.href = '/login/index.html';
}

document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('[data-accion="logout"]').forEach(el =>
    el.addEventListener('click', e => { e.preventDefault(); logout(); })
  );
});
