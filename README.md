# TimeCP — Control horario, fichajes y ausencias


----- Enlace web: https://timecp.onrender.com

> **¿Primera vez?** Sigue [GUIA_DESPLIEGUE.md](GUIA_DESPLIEGUE.md) paso a paso.

## Usuarios de prueba
Se crean solos al arrancar si no existen:

| Rol      | Email               | Contraseña      |
|----------|---------------------|-----------------|
| Admin    | admin@demo.com      | Admin1234!      |
| Empleado | empleado@demo.com   | Empleado1234!   |

Puedes cambiarlas con las variables `TEST_ADMIN_PASSWORD` y `TEST_USER_PASSWORD`,
o desactivarlas con `SEED_TEST_USERS=false`.

## Ejecutar en local
```bash
npm install
cp .env.example .env      # y rellena los datos de tu MySQL y un JWT_SECRET
npm start                 # http://localhost:3000
```
Al arrancar se crean las tablas que falten y se corrige una BD antigua
(sin borrar datos). También puedes hacerlo a mano con `npm run db:init`.

## Desplegar en Render
1. Sube esta carpeta a un repositorio de GitHub (el `.gitignore` ya excluye `.env` y `node_modules`).
2. En Render: **New → Blueprint** → elige el repositorio (usa `render.yaml`).
3. Rellena `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD` y `DB_NAME` con los datos de tu MySQL
   (Render no ofrece MySQL: puedes seguir usando Railway, Aiven, TiDB Cloud…).
   Si tu proveedor exige SSL, pon `DB_SSL=true`.
4. `JWT_SECRET` se genera automáticamente. Espera al deploy y abre la URL `https://<tu-app>.onrender.com`.

Comprobación de salud: `GET /api/health` → `{"ok":true,"db":"ok"}`.

## Avisos del plan gratuito de Render
- El disco no es persistente: los justificantes subidos se pierden al reiniciar o redesplegar.
- El servicio se duerme tras 15 min sin uso y tarda ~30 s en despertar.

## Estructura
```
server.js              Servidor Express + seguridad (Helmet, CSP, rate limit, CSRF)
conector/              Configuración, pool MySQL e inicialización de la BD
middleware/            Autenticación JWT (cookie httpOnly) y validaciones
routes/                API: login, usuarios, horario, fichaje, ausencias
database/schema.sql    Esquema idempotente
vista/                 Frontend (login, panel admin, panel empleado)
```
