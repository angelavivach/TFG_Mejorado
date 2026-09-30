// Panel de empleado. Requiere /comun/api.js (api, escapeHTML, formatearFecha, logout)
const DIAS = ['lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado', 'domingo'];

document.addEventListener('DOMContentLoaded', () => {
  // ---------- Cabecera ----------
  api('/api/login/me')
    .then(({ user }) => { document.getElementById('usuarioNombre').textContent = user.nombre; })
    .catch(() => {});

  document.getElementById('fechaActual').textContent =
    new Date().toLocaleDateString('es-ES', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

  // ---------- Navegación ----------
  const navLinks = document.querySelectorAll('.sidebar .nav-link[href^="#"]:not([data-accion])');
  const sections = document.querySelectorAll('main section');

  function mostrarSeccion(hash) {
    const destino = document.querySelector(hash) || document.getElementById('fichaje');
    sections.forEach(s => { s.hidden = s !== destino; });
    navLinks.forEach(l => l.classList.toggle('active', l.getAttribute('href') === '#' + destino.id));
    if (destino.id === 'ausencias') cargarSolicitudes();
    if (destino.id === 'registroHorario') cargarHorario();
  }

  navLinks.forEach(link => link.addEventListener('click', e => {
    e.preventDefault();
    const hash = link.getAttribute('href');
    history.replaceState(null, '', hash);
    mostrarSeccion(hash);
  }));
  mostrarSeccion(window.location.hash || '#fichaje');

  // ---------- Fichaje ----------
  const btnEntrada    = document.getElementById('btnEntrada');
  const btnSalida     = document.getElementById('btnSalida');
  const estadoFichaje = document.getElementById('estadoFichaje');
  const horaFichaje   = document.getElementById('horaFichaje');
  const hora = f => new Date(f).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });

  function pintarEstado(ultimo) {
    const dentro = ultimo?.tipo === 'entrada';
    btnEntrada.disabled = dentro;
    btnSalida.disabled  = !dentro;
    if (!ultimo) {
      estadoFichaje.innerHTML = '<i class="bi bi-info-circle-fill me-2"></i>Aún no has fichado';
      horaFichaje.textContent = '';
    } else if (dentro) {
      estadoFichaje.innerHTML = '<i class="bi bi-check-circle-fill me-2"></i>Jornada en curso';
      horaFichaje.textContent = `Entrada: ${new Date(ultimo.fecha_hora).toLocaleString('es-ES')}`;
    } else {
      estadoFichaje.innerHTML = '<i class="bi bi-info-circle-fill me-2"></i>Fuera de jornada';
      horaFichaje.textContent = `Última salida: ${new Date(ultimo.fecha_hora).toLocaleString('es-ES')}`;
    }
  }

  async function cargarEstadoFichaje() {
    try {
      pintarEstado(await api('/api/fichaje/ultimo'));
    } catch (err) {
      if (err.status === 404) pintarEstado(null);
      else console.error('Error cargando estado:', err);
    }
  }

  async function fichar(tipo, boton) {
    boton.disabled = true;
    try {
      const r = await api('/api/fichaje', { method: 'POST', body: { tipo } });
      if (tipo === 'salida' && r.datos?.horas_trabajadas != null) {
        alert(`Salida registrada a las ${hora(r.datos.fecha_hora)}. Jornada: ${r.datos.horas_trabajadas} h`);
      }
      await cargarEstadoFichaje();
      cargarHorasAnuales();
    } catch (err) {
      alert(err.message);
      cargarEstadoFichaje();
    }
  }

  btnEntrada.addEventListener('click', () => fichar('entrada', btnEntrada));
  btnSalida.addEventListener('click', () => fichar('salida', btnSalida));

  async function cargarHorasAnuales() {
    try {
      const data = await api('/api/fichaje/horas');
      document.getElementById('horasAcumuladas').textContent = data.trabajadas.toFixed(2);
      document.getElementById('horasRestantes').textContent  = data.restantes.toFixed(2);
      document.getElementById('limiteHoras').textContent     = data.limite;
      const progress = document.getElementById('progressHoras');
      progress.style.width = `${data.porcentaje}%`;
      progress.setAttribute('aria-valuenow', data.porcentaje);
      progress.querySelector('.visually-hidden').textContent = `${data.porcentaje}% completado`;

      const alerta = document.getElementById('alertaHoras');
      alerta.hidden = data.trabajadas < data.limite;
      document.getElementById('mensajeAlerta').textContent = 'Has alcanzado o superado el límite anual de horas.';
    } catch (err) {
      console.error('Error cargando horas:', err);
    }
  }

  cargarEstadoFichaje();
  cargarHorasAnuales();

  // ---------- Mi horario ----------
  async function cargarHorario() {
    const tabla = document.getElementById('tablaHorarios');
    try {
      const horarios = await api('/api/horario');
      if (!horarios.length) {
        tabla.innerHTML = `<tr><td colspan="9" class="text-center py-4 text-muted">
          <i class="bi bi-calendar-x me-2"></i>Todavía no tienes un horario asignado</td></tr>`;
        return;
      }
      tabla.innerHTML = horarios.map(h => `
        <tr>
          <td>${formatearFecha(h.fecha_inicio)}</td>
          <td>${h.fecha_fin ? formatearFecha(h.fecha_fin) : 'Indefinido'}</td>
          ${DIAS.map(d => `<td class="${h[d] === 'Libre' ? 'text-muted' : ''}">${escapeHTML(h[d] || '-')}</td>`).join('')}
        </tr>`).join('');
    } catch (err) {
      tabla.innerHTML = `<tr><td colspan="9" class="text-center py-4 text-danger">
        <i class="bi bi-exclamation-triangle-fill me-2"></i>${escapeHTML(err.message)}</td></tr>`;
    }
  }

  // ---------- Ausencias ----------
  const ICONOS = {
    vacaciones: '<i class="bi bi-sun"></i>',
    enfermedad: '<i class="bi bi-clipboard-pulse"></i>',
    personal:   '<i class="bi bi-person-lines-fill"></i>'
  };
  const CLASE_FILA  = { aprobada: 'table-success', rechazada: 'table-danger', pendiente: 'table-warning' };
  const CLASE_BADGE = { aprobada: 'bg-success', rechazada: 'bg-danger', pendiente: 'bg-warning text-dark' };

  async function cargarSolicitudes() {
    const tbody = document.querySelector('#tablaSolicitudes tbody');
    try {
      const solicitudes = await api('/api/ausencias');
      if (!solicitudes.length) {
        tbody.innerHTML = '<tr><td colspan="7" class="text-center text-muted">No has realizado solicitudes</td></tr>';
        return;
      }
      tbody.innerHTML = solicitudes.map(s => `
        <tr class="${CLASE_FILA[s.estado] || ''}">
          <td>${ICONOS[s.tipo] || ''} ${escapeHTML(s.tipo)}</td>
          <td>${formatearFecha(s.fecha_inicio)}</td>
          <td>${formatearFecha(s.fecha_fin)}</td>
          <td>${escapeHTML(s.dias_consumidos ?? '-')}</td>
          <td><span class="badge ${CLASE_BADGE[s.estado] || 'bg-secondary'}">${escapeHTML(s.estado)}</span></td>
          <td>${escapeHTML(s.comentario || '-')}</td>
          <td>${s.tiene_justificante
                ? `<a href="/api/ausencias/${s.id_ausencia}/justificante" target="_blank" rel="noopener">Ver</a>`
                : '-'}</td>
        </tr>`).join('');
    } catch (err) {
      tbody.innerHTML = `<tr><td colspan="7" class="text-center text-danger">${escapeHTML(err.message)}</td></tr>`;
    }
  }

  document.getElementById('formAusencia').addEventListener('submit', async e => {
    e.preventDefault();
    const tipo        = document.getElementById('tipoAusencia').value;
    const fechaInicio = document.getElementById('fechaInicio').value;
    const fechaFin    = document.getElementById('fechaFin').value;
    const comentarios = document.getElementById('comentarios').value.trim();
    const archivo     = document.getElementById('justificante').files[0];

    if (!tipo || !fechaInicio || !fechaFin) return alert('Complete todos los campos obligatorios');
    if (fechaFin < fechaInicio) return alert('La fecha de fin no puede ser anterior a la de inicio');
    if (tipo === 'enfermedad' && !archivo) return alert('El justificante es obligatorio para enfermedad');
    if (archivo) {
      if (!['image/jpeg', 'image/png', 'application/pdf'].includes(archivo.type)) {
        return alert('Tipo de archivo incompatible: solo PDF, JPG o PNG');
      }
      if (archivo.size > 5 * 1024 * 1024) return alert('El archivo supera los 5 MB');
    }

    const formData = new FormData();
    formData.append('tipo', tipo);
    formData.append('fecha_inicio', fechaInicio);
    formData.append('fecha_fin', fechaFin);
    formData.append('comentarios', comentarios);
    if (archivo) formData.append('justificante', archivo);

    const boton = e.target.querySelector('button[type="submit"]');
    boton.disabled = true;
    try {
      const data = await api('/api/ausencias', { method: 'POST', body: formData });
      alert(data.mensaje || 'Solicitud creada correctamente');
      e.target.reset();
      cargarSolicitudes();
    } catch (err) {
      alert(`Error: ${err.message}`);
    } finally {
      boton.disabled = false;
    }
  });
});
