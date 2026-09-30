// Panel de administrador. Requiere /comun/api.js (api, escapeHTML, formatearFecha, logout)
let estadoActual = 'pendiente';
const DIAS = ['lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado', 'domingo'];
const BLOQUES_LIBRES = [['lunes', 'martes'], ['miercoles', 'jueves'], ['viernes', 'sabado', 'domingo']];
const LIMITE_HORAS = 1784;

document.addEventListener('DOMContentLoaded', () => {
  // ---------- Usuario con sesión ----------
  api('/api/login/me')
    .then(({ user }) => { document.getElementById('adminNombre').textContent = user.nombre; })
    .catch(() => {});

  // ---------- Navegación lateral ----------
  const menuLinks = document.querySelectorAll('.sidebar a[data-section]');
  const sections  = document.querySelectorAll('.section-content');

  function showSection(id) {
    sections.forEach(s => s.classList.toggle('active', s.id === id));
  }

  menuLinks.forEach(link => link.addEventListener('click', e => {
    e.preventDefault();
    document.querySelectorAll('.sidebar a').forEach(l => l.classList.remove('active'));
    link.classList.add('active');
    showSection(link.dataset.section);
    if (link.dataset.section === 'ausenciasC') cargarAusencias(estadoActual);
  }));
  document.querySelectorAll('.menu-parent').forEach(a => a.addEventListener('click', e => e.preventDefault()));
  showSection('horario-control');

  // ---------- Carga de datos ----------
  async function cargarUsuarios() {
    try {
      const usuarios = await api('/api/usuarios');
      ['usuarioModificar', 'select-usuario'].forEach(id => {
        const select = document.getElementById(id);
        if (!select) return;
        select.innerHTML = '<option value="">Seleccione...</option>';
        usuarios.forEach(u => {
          const opt = document.createElement('option');
          opt.value = u.id_usuario;
          opt.textContent = `${u.id_usuario} – ${u.nombre} (${u.email})`;
          select.appendChild(opt);
        });
      });
    } catch (err) {
      console.error('Error cargando usuarios:', err);
    }
  }

  async function cargarHorarios() {
    try {
      const horarios = await api('/api/horario');

      // Selects de modificar y eliminar
      ['idHorarioModificar', 'select-eliminar'].forEach(id => {
        const select = document.getElementById(id);
        if (!select) return;
        select.innerHTML = '<option value="">Seleccione...</option>';
        horarios.forEach(h => {
          const opt = document.createElement('option');
          opt.value = h.id_horario;
          opt.textContent = `${h.id_horario} – Usuario: ${h.nombre}`;
          select.appendChild(opt);
        });
      });

      // Tabla de control
      const tbody = document.querySelector('#tablaHorariosAdmin tbody');
      if (!horarios.length) {
        tbody.innerHTML = '<tr><td colspan="9" class="text-center text-muted">No hay horarios registrados</td></tr>';
        return;
      }
      tbody.innerHTML = horarios.map(h => `
        <tr>
          <td>${escapeHTML(h.id_horario)}</td>
          <td>${escapeHTML(h.nombre)}</td>
          ${DIAS.map(d => `<td>${escapeHTML(h[d] || '-')}</td>`).join('')}
        </tr>`).join('');
    } catch (err) {
      console.error('Error cargando horarios:', err);
    }
  }

  cargarUsuarios();
  cargarHorarios();

  // ---------- Usuarios: alta ----------
  document.querySelector('.user-form')?.addEventListener('submit', async e => {
    e.preventDefault();
    const nombre     = document.getElementById('nombreAlta').value.trim();
    const email      = document.getElementById('emailAlta').value.trim();
    const password   = document.getElementById('passwordAlta').value;
    const fecha_alta = document.getElementById('fechaAlta').value;
    const rol        = document.getElementById('rolAlta').value;

    if (!nombre || !email || !password || !fecha_alta) return alert('Todos los campos son obligatorios');
    if (password.length < 8 || !/[A-Za-z]/.test(password) || !/\d/.test(password)) {
      return alert('La contraseña debe tener al menos 8 caracteres e incluir letras y números');
    }

    try {
      await api('/api/usuarios', { method: 'POST', body: { nombre, email, password, fecha_alta, rol } });
      alert(`Usuario ${nombre} creado con éxito`);
      e.target.reset();
      cargarUsuarios();
    } catch (err) {
      alert(`Error al crear usuario: ${err.message}`);
    }
  });

  // ---------- Usuarios: modificar ----------
  document.querySelector('.modify-user-form')?.addEventListener('submit', async e => {
    e.preventDefault();
    const id = document.getElementById('usuarioModificar').value;
    const nombre = document.getElementById('nuevoNombre').value.trim();
    if (!id) return alert('Selecciona un usuario');

    try {
      const data = await api(`/api/usuarios/${encodeURIComponent(id)}`, { method: 'PUT', body: { nombre } });
      alert(data.mensaje);
      e.target.reset();
      cargarUsuarios();
      cargarHorarios();
    } catch (err) {
      alert(`Error: ${err.message}`);
    }
  });

  // ---------- Usuarios: baja ----------
  document.querySelector('.delete-user-form')?.addEventListener('submit', async e => {
    e.preventDefault();
    const id     = document.getElementById('idUsuarioEliminar').value.trim();
    const nombre = document.getElementById('nombreUsuarioEliminar').value.trim();
    const email  = document.getElementById('emailUsuarioEliminar').value.trim();
    if (!id || !nombre || !email) return alert('Completa los tres campos');
    if (!confirm(`¿Eliminar definitivamente a ${nombre}? Se borrarán también sus fichajes, horarios y ausencias.`)) return;

    try {
      const data = await api('/api/usuarios/eliminar', { method: 'DELETE', body: { id, nombre, email } });
      alert(data.mensaje);
      e.target.reset();
      cargarUsuarios();
      cargarHorarios();
    } catch (err) {
      alert(`Error al eliminar usuario: ${err.message}`);
    }
  });

  // ---------- Horarios: crear ----------
  function validarHorario(horario) {
    const libres = DIAS.filter(d => !horario[d] || horario[d].toLowerCase() === 'libre');
    const bloqueOk = BLOQUES_LIBRES.some(b => b.length === libres.length && b.every(d => libres.includes(d)));
    if (!bloqueOk) {
      alert('Los días libres deben pertenecer solo a uno de estos grupos:\n- lunes y martes\n- miércoles y jueves\n- viernes, sábado y domingo.');
      return false;
    }
    for (const d of DIAS) {
      if (libres.includes(d)) continue;
      if (!/^\d{2}:\d{2}-\d{2}:\d{2}$/.test(horario[d].replace(/\s/g, ''))) {
        alert(`Formato no válido en ${d}. Usa HH:MM-HH:MM (ej: 08:00-15:00) o "Libre".`);
        return false;
      }
    }
    const semanales = DIAS.reduce((acc, d) => {
      if (libres.includes(d)) return acc;
      const [ini, fin] = horario[d].replace(/\s/g, '').split('-').map(t => {
        const [h, m] = t.split(':').map(Number);
        return h + m / 60;
      });
      return acc + Math.max(0, fin - ini);
    }, 0);
    if (semanales * 52 > LIMITE_HORAS) {
      alert(`Este horario genera ${(semanales * 52).toFixed(1)} h anuales y supera el límite de ${LIMITE_HORAS} h.`);
      return false;
    }
    return true;
  }

  const formCrear = document.getElementById('form-crear');
  formCrear?.addEventListener('submit', async e => {
    e.preventDefault();
    const body = {};
    new FormData(formCrear).forEach((v, k) => { body[k] = String(v).trim(); });

    for (const campo of ['id_usuario', 'fecha_inicio', ...DIAS]) {
      if (!body[campo]) return alert(`Falta el campo: ${campo}`);
    }
    if (!body.fecha_fin) delete body.fecha_fin;
    if (!validarHorario(body)) return;

    try {
      await api('/api/horario', { method: 'POST', body });
      alert('Horario creado exitosamente');
      formCrear.reset();
      cargarHorarios();
    } catch (err) {
      alert(`Error al crear horario: ${err.message}`);
    }
  });

  // ---------- Horarios: modificar ----------
  document.querySelector('.modificar-horario-form')?.addEventListener('submit', async e => {
    e.preventDefault();
    const idHorario = document.getElementById('idHorarioModificar').value;
    const dia       = document.getElementById('diaModificar').value;
    const horario   = document.getElementById('nuevoHorario').value.trim();
    if (!idHorario || !dia || !horario) return alert('Completa todos los campos');

    try {
      const data = await api(`/api/horario/${encodeURIComponent(idHorario)}`, { method: 'PUT', body: { dia, horario } });
      alert(data.mensaje);
      e.target.reset();
      cargarHorarios();
    } catch (err) {
      alert(`Error: ${err.message}`);
    }
  });

  // ---------- Horarios: eliminar ----------
  document.getElementById('form-eliminar')?.addEventListener('submit', async e => {
    e.preventDefault();
    const msg = document.getElementById('msgEliminar');
    const idHorario = document.getElementById('select-eliminar').value;
    if (!idHorario) {
      msg.textContent = 'Selecciona un ID válido.';
      msg.className = 'text-danger mt-2';
      return;
    }
    if (!confirm(`¿Seguro que deseas eliminar el horario con ID ${idHorario}?`)) return;

    try {
      const data = await api(`/api/horario/${encodeURIComponent(idHorario)}`, { method: 'DELETE' });
      msg.textContent = data.mensaje || 'Horario eliminado.';
      msg.className = 'text-success mt-2';
      e.target.reset();
      cargarHorarios();
    } catch (err) {
      msg.textContent = err.message;
      msg.className = 'text-danger mt-2';
    }
  });

  // ---------- Ausencias ----------
  const tabs = document.querySelectorAll('#ausenciasC .nav-tabs .nav-link');
  tabs.forEach(tab => tab.addEventListener('click', e => {
    e.preventDefault();
    tabs.forEach(t => t.classList.remove('active'));
    e.currentTarget.classList.add('active');
    estadoActual = e.currentTarget.dataset.estado;
    cargarAusencias(estadoActual);
  }));

  // Delegación de eventos para los botones Aprobar / Rechazar
  document.getElementById('ausenciasBody').addEventListener('click', e => {
    const btn = e.target.closest('button[data-id][data-estado]');
    if (btn) actualizarAusenciaEstado(btn.dataset.id, btn.dataset.estado, btn);
  });

  cargarAusencias(estadoActual);
});

async function cargarAusencias(estado) {
  const tbody = document.getElementById('ausenciasBody');
  try {
    const ausencias = await api(`/api/ausencias?estado=${encodeURIComponent(estado)}`);
    if (!ausencias.length) {
      tbody.innerHTML = '<tr><td colspan="8" class="text-center text-muted">No hay solicitudes</td></tr>';
      return;
    }
    tbody.innerHTML = ausencias.map(a => {
      const acciones = estado === 'pendiente'
        ? `<button class="btn btn-success btn-sm me-2" data-id="${a.id_ausencia}" data-estado="aprobada">Aprobar</button>
           <button class="btn btn-danger btn-sm" data-id="${a.id_ausencia}" data-estado="rechazada">Rechazar</button>`
        : `<span class="badge bg-${estado === 'aprobada' ? 'success' : 'danger'}">${escapeHTML(estado)}</span>`;
      const justificante = a.tiene_justificante
        ? `<a href="/api/ausencias/${a.id_ausencia}/justificante" target="_blank" rel="noopener">Ver</a>`
        : '-';
      return `
        <tr>
          <td>${escapeHTML(a.id_usuario)} – ${escapeHTML(a.nombre)}</td>
          <td>${escapeHTML(a.tipo)}</td>
          <td>${formatearFecha(a.fecha_inicio)}</td>
          <td>${formatearFecha(a.fecha_fin)}</td>
          <td>${escapeHTML(a.dias_consumidos ?? '-')}</td>
          <td>${escapeHTML(a.comentario || '')}</td>
          <td>${justificante}</td>
          <td>${acciones}</td>
        </tr>`;
    }).join('');
  } catch (err) {
    console.error('Error cargando ausencias:', err);
    tbody.innerHTML = `<tr><td colspan="8" class="text-center text-danger">${escapeHTML(err.message)}</td></tr>`;
  }
}

async function actualizarAusenciaEstado(id, nuevoEstado, boton) {
  if (boton) boton.disabled = true;
  try {
    const data = await api(`/api/ausencias/${encodeURIComponent(id)}`, { method: 'PUT', body: { estado: nuevoEstado } });
    alert(data.mensaje || 'Estado actualizado correctamente');
  } catch (err) {
    alert(`Error: ${err.message}`);
  } finally {
    cargarAusencias(estadoActual);
  }
}
