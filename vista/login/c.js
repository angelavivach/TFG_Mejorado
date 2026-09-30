// Si ya hay una sesión activa, ir directamente al panel
fetch('/api/login/me', { credentials: 'same-origin' })
    .then(r => (r.ok ? r.json() : null))
    .then(data => { if (data?.user) irAlPanel(data.user.rol); })
    .catch(() => {});

function irAlPanel(rol) {
    window.location.href = rol === 'admin' ? '/admin/Admin.html' : '/usu/User.html';
}

async function leerJSON(response) {
    try { return await response.json(); } catch { return {}; }
}

document.getElementById('adminLoginForm').addEventListener('submit', async function (e) {
    e.preventDefault();

    const user = document.getElementById('adminUser').value.trim();
    const pass = document.getElementById('adminPass').value;
    const errorElement = document.getElementById('admin-error');
    const boton = e.target.querySelector('button[type="submit"]');

    errorElement.textContent = '';
    errorElement.style.color = 'red';

    if (!user || !pass) {
        errorElement.textContent = 'Complete todos los campos';
        return;
    }
    if (!validateEmail(user)) {
        errorElement.textContent = 'Formato de email inválido';
        return;
    }

    boton.disabled = true;
    try {
        const response = await fetch('/api/login/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'same-origin',
            body: JSON.stringify({ email: user, password: pass })
        });
        const result = await leerJSON(response);

        if (!response.ok) {
            errorElement.textContent = result.message || 'Error al iniciar sesión';
            return;
        }

        errorElement.textContent = '✓ Acceso concedido';
        errorElement.style.color = 'green';
        e.target.reset();
        setTimeout(() => irAlPanel(result.user.rol), 500);
    } catch (error) {
        console.error('Error en el login:', error);
        errorElement.textContent = 'No se pudo conectar con el servidor';
    } finally {
        boton.disabled = false;
    }
});

document.getElementById('adminRegisterForm').addEventListener('submit', async function (e) {
    e.preventDefault();

    const nombre      = document.getElementById('companyName').value.trim();
    const newUser     = document.getElementById('newAdminUser').value.trim();
    const newPass     = document.getElementById('newAdminPass').value;
    const confirmPass = document.getElementById('confirmAdminPass').value;
    const errorElement   = document.getElementById('register-error');
    const successElement = document.getElementById('register-success');

    errorElement.textContent = '';
    successElement.textContent = '';
    errorElement.style.color = 'red';

    const errors = [];
    if (!nombre) errors.push('Nombre requerido');
    if (!validateEmail(newUser)) errors.push('Email inválido');
    if (newPass.length < 8 || !/[A-Za-z]/.test(newPass) || !/\d/.test(newPass)) {
        errors.push('La contraseña debe tener 8+ caracteres con letras y números');
    }
    if (newPass !== confirmPass) errors.push('Las contraseñas no coinciden');

    if (errors.length) {
        errorElement.textContent = errors.join('. ');
        return;
    }

    try {
        const response = await fetch('/api/login/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'same-origin',
            body: JSON.stringify({ companyName: nombre, email: newUser, password: newPass })
        });
        const result = await leerJSON(response);

        if (!response.ok) {
            errorElement.textContent = result.message || 'Error en el registro';
            return;
        }

        successElement.textContent = '✓ ' + (result.message || 'Registro exitoso');
        successElement.style.color = 'green';
        e.target.reset();
        setTimeout(() => {
            document.getElementById('container').classList.remove('right-panel-active');
        }, 1500);
    } catch (error) {
        console.error('Error en el registro:', error);
        errorElement.textContent = 'No se pudo conectar con el servidor';
    }
});

function validateEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email).toLowerCase());
}

document.getElementById('adminSignUp').addEventListener('click', () => {
    document.getElementById('container').classList.add('right-panel-active');
});

document.getElementById('adminSignIn').addEventListener('click', () => {
    document.getElementById('container').classList.remove('right-panel-active');
});
