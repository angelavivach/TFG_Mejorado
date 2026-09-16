# 🚀 Guía de Migración - Código Mejorado Timecp

## Descripción General

Este documento describe cómo actualizar tu código actual al código mejorado con todas las medidas de seguridad.

## Archivos Nuevos a Crear

```
proyecto/
├── auth-middleware.js              # ✨ NUEVO: Autenticación y autorización
├── validation-schemas.js           # ✨ NUEVO: Esquemas de validación
├── .env.example                    # ✨ NUEVO: Variables de entorno
├── SEGURIDAD_Y_MEJORAS.md         # ✨ NUEVO: Documentación de seguridad
├── GUIA_MIGRACION.md              # ✨ NUEVO: Este archivo
```

## Archivos a Reemplazar

```
proyecto/
├── server.js                       # 🔄 ACTUALIZAR: server_mejorado.js
├── package.json                    # 🔄 ACTUALIZAR: package_mejorado.json
├── login_routes.js                 # 🔄 ACTUALIZAR: login_routes_mejorado.js
├── usuarios_routes.js              # 🔄 ACTUALIZAR: usuarios_routes_mejorado.js
├── fichaje.js                      # 🔄 ACTUALIZAR: fichaje_routes_mejorado.js
├── horario_routes.js               # 🔄 ACTUALIZAR: horario_routes_mejorado.js
├── ausencia_routes.js              # 🔄 ACTUALIZAR: ausencias_routes_mejorado.js
```

## Pasos de Migración

### Paso 1: Hacer Backup
```bash
# Crear copia de seguridad del proyecto actual
mkdir backup
cp -r proyecto/* backup/
```

### Paso 2: Instalar Nuevas Dependencias
```bash
# Instalar todas las dependencias nuevas
npm install

# O si prefieres instalarlas una por una:
npm install express-rate-limit helmet joi jsonwebtoken nodemon --save
npm install eslint jest --save-dev
```

### Paso 3: Crear Archivos de Configuración

#### 3.1 Crear `.env`
```bash
# Copiar .env.example a .env
cp .env.example .env

# Editar .env con tus valores reales
# ⚠️ IMPORTANTE: Cambiar todos los valores dummy por los reales
```

#### 3.2 Crear `auth-middleware.js`
- Copiar el archivo `auth-middleware.js` del código mejorado

#### 3.3 Crear `validation-schemas.js`
- Copiar el archivo `validation-schemas.js` del código mejorado

### Paso 4: Actualizar Archivos Existentes

#### 4.1 `package.json`
```bash
# Reemplazar con package_mejorado.json
cp package_mejorado.json package.json
```

#### 4.2 `server.js`
```bash
# Reemplazar con server_mejorado.js
cp server_mejorado.js server.js
```

#### 4.3 Rutas
```bash
# Reemplazar cada archivo de rutas
cp login_routes_mejorado.js login_routes.js
cp usuarios_routes_mejorado.js usuarios_routes.js
cp fichaje_routes_mejorado.js fichaje.js
cp horario_routes_mejorado.js horario_routes.js
cp ausencias_routes_mejorado.js ausencia_routes.js
```

### Paso 5: Verificar Imports

Asegurate de que los imports en `server.js` sean correctos:

```javascript
const usuariosRouter = require('./usuarios_routes.js');
const horarioRouter = require('./horario_routes.js');
const fichajeRouter = require('./fichaje.js');
const loginRouter = require('./login_routes.js');
const ausenciasRouter = require('./ausencia_routes.js');
```

### Paso 6: Probar la Aplicación

```bash
# Iniciar en desarrollo
npm run dev

# Deberías ver:
# ╔════════════════════════════════════════════════════════════╗
# ║              TIMECP - Servidor Iniciado                    ║
# ...
```

### Paso 7: Verificar Cambios en Base de Datos

Asegurate de que tu base de datos tiene estos campos:

```sql
-- En tabla usuarios, agregar si no existe:
ALTER TABLE usuarios ADD COLUMN activo TINYINT(1) DEFAULT 1;
ALTER TABLE usuarios ADD COLUMN horas_anuales_trabajadas DECIMAL(8,2) DEFAULT 0;

-- En tabla fichajes, agregar índices:
ALTER TABLE fichajes ADD INDEX idx_usuario_fecha (id_usuario, fecha_hora);

-- En tabla ausencias, agregar índices:
ALTER TABLE ausencias ADD INDEX idx_usuario_estado (id_usuario, estado);
```

## Cambios en el Cliente (Frontend)

### Cambio 1: Headers de Autenticación

**Antes:**
```javascript
fetch('/api/usuarios', {
  method: 'GET'
});
```

**Después:**
```javascript
const token = localStorage.getItem('token');

fetch('/api/usuarios', {
  method: 'GET',
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  }
});
```

### Cambio 2: Guardando el Token

**Después del login:**
```javascript
// En la respuesta del login
const response = await fetch('/api/login/login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email, password })
});

const data = await response.json();

if (response.ok) {
  // Guardar el token
  localStorage.setItem('token', data.token);
  
  // Guardar datos del usuario
  sessionStorage.setItem('user', JSON.stringify(data.user));
}
```

### Cambio 3: Manejo de Errores de Autorización

```javascript
fetch('/api/usuarios', {
  method: 'GET',
  headers: { 'Authorization': `Bearer ${token}` }
})
.then(res => {
  if (res.status === 401) {
    // Token expirado
    localStorage.removeItem('token');
    window.location.href = '/login';
  }
  if (res.status === 403) {
    // No autorizado
    alert('No tienes permisos para esta acción');
  }
  return res.json();
})
.catch(err => console.error('Error:', err));
```

### Cambio 4: Actualizar CORS en Frontend

Si tu frontend está en un origen diferente, asegúrate de configurar CORS:

```javascript
// En server_mejorado.js, actualizar CORS_ORIGIN
process.env.CORS_ORIGIN = 'http://tu-frontend.com'
```

## Cambios en API

### Cambio en Login

**Respuesta nueva:**
```json
{
  "mensaje": "Login exitoso",
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": 1,
    "nombre": "Admin",
    "rol": "admin"
  }
}
```

### Cambio en Errores

**Antes:**
```json
{ "error": "Usuario no encontrado" }
```

**Después (más genérico):**
```json
{ "mensaje": "Email o contraseña incorrectos" }
```

### Nuevos Endpoints

#### Health Check
```bash
GET /api/health
```

Respuesta:
```json
{
  "status": "OK",
  "timestamp": "2025-01-20T10:30:00.000Z",
  "uptime": 3600
}
```

#### Refrescar Token
```bash
POST /api/login/refresh-token
Headers: Authorization: Bearer {token}
```

Respuesta:
```json
{
  "mensaje": "Token renovado",
  "token": "nuevo_token..."
}
```

#### Días Disponibles
```bash
GET /api/usuarios/:id/dias-disponibles
Headers: Authorization: Bearer {token}
```

Respuesta:
```json
{
  "vacaciones": 30,
  "enfermedad": 10,
  "personal": 5
}
```

## Configuración de Variables de Entorno

### Archivo `.env`

```env
# Base de Datos
DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=tu_password_seguro
DB_NAME=timecp

# Servidor
NODE_ENV=development
PORT=3000
HOST=localhost

# Seguridad - ⚠️ CAMBIAR ESTOS VALORES
JWT_SECRET=tu_secret_key_aleatorio_minimo_32_caracteres_aqui
CORS_ORIGIN=http://localhost:3000

# Logs
LOG_LEVEL=info
```

### Generar JWT_SECRET Seguro

```bash
# En Node.js
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# En Linux/Mac
openssl rand -hex 32
```

## Testing

### Test de Autenticación

```bash
# 1. Registrarse
curl -X POST http://localhost:3000/api/login/register \
  -H "Content-Type: application/json" \
  -d '{
    "companyName": "Mi Empresa",
    "email": "admin@test.com",
    "password": "Password123!@#"
  }'

# 2. Login
curl -X POST http://localhost:3000/api/login/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "admin@test.com",
    "password": "Password123!@#"
  }'

# Copiar el token de la respuesta

# 3. Usar token
TOKEN="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."

curl -X GET http://localhost:3000/api/usuarios \
  -H "Authorization: Bearer $TOKEN"
```

### Test de Validación

```bash
# Email inválido
curl -X POST http://localhost:3000/api/login/login \
  -H "Content-Type: application/json" \
  -d '{"email":"invalid","password":"test"}'

# Respuesta esperada (400):
# {
#   "error": "Datos inválidos",
#   "detalles": [
#     {
#       "campo": "email",
#       "mensaje": "Email inválido"
#     }
#   ]
# }
```

## Rollback (Si algo va mal)

```bash
# Restaurar desde backup
rm -rf proyecto/*
cp -r backup/* proyecto/

# Reinstalar dependencias antiguas
npm install

# El servidor volverá a funcionar como antes
```

## Checklist Final

- [ ] Backup del proyecto original realizado
- [ ] Dependencias nuevas instaladas (`npm install`)
- [ ] Archivo `.env` creado y configurado
- [ ] Todos los archivos nuevos copiados
- [ ] Todos los archivos actualizados reemplazados
- [ ] Base de datos verificada y actualizada
- [ ] Frontend actualizado con headers de Authorization
- [ ] Test de login exitoso
- [ ] Test de errores 401/403
- [ ] Test de rate limiting
- [ ] Test de SQL injection (debe fallar)
- [ ] Logs de servidor se ven correctamente

## Soporte

Si encuentras problemas durante la migración:

1. Revisar `SEGURIDAD_Y_MEJORAS.md` para entender qué cambió
2. Verificar logs del servidor para errores
3. Comprobar que `.env` está correctamente configurado
4. Verificar permisos de base de datos
5. Restaurar desde backup si es necesario

¡Éxito con la migración! 🎉
