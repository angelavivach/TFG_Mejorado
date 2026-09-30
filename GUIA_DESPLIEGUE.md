# Guía: de este zip a tu app funcionando en Render

Tiempo aproximado: 15 minutos.

## 0. Lo que necesitas
- Cuenta en **GitHub** (https://github.com) y **Git** instalado (https://git-scm.com/downloads).
- Cuenta en **Render** (https://render.com) — puedes entrar con tu cuenta de GitHub.
- Una base de datos **MySQL** accesible desde internet. Render no ofrece MySQL, así que usa una de estas:
  - **Railway** (la que ya usabais). **Cambia antes la contraseña**, estaba expuesta en el zip original.
  - **Aiven for MySQL** (plan gratuito) → pon `DB_SSL=true`.
  - **TiDB Cloud Serverless** (gratuito, compatible con MySQL) → pon `DB_SSL=true`.

  No hace falta importar ningún script SQL: la app crea las tablas sola al arrancar.
  Si usas la BD antigua de Railway, la app la corrige sin borrar datos.

## 1. Descomprimir
Descomprime el zip. Tendrás una carpeta `timecp` que ya es un repositorio Git con el primer commit hecho.

## 2. Crear el repositorio en GitHub
1. Entra en https://github.com/new
2. Nombre: por ejemplo `timecp`. Puede ser **privado**.
3. **No** marques "Add a README", ni .gitignore, ni licencia (el repositorio debe crearse vacío).
4. Pulsa **Create repository** y copia la URL, del tipo `https://github.com/TU_USUARIO/timecp.git`

## 3. Subir el código
**Windows:** haz doble clic en `subir-a-github.bat` y pega la URL cuando te la pida.

**Mac / Linux:** abre una terminal en la carpeta `timecp` y ejecuta:
```bash
sh subir-a-github.sh
```

**O a mano** (en la carpeta `timecp`):
```bash
git remote add origin https://github.com/TU_USUARIO/timecp.git
git push -u origin main
```
Si GitHub te pide contraseña, usa un **token** (GitHub → Settings → Developer settings →
Personal access tokens) o inicia sesión con la ventana que abre Git Credential Manager.

## 4. Desplegar en Render
1. En Render: **New +** → **Blueprint**.
2. Conecta tu cuenta de GitHub y elige el repositorio `timecp`.
3. Render lee el archivo `render.yaml` y te pedirá estos valores (los de tu MySQL):

   | Variable       | Ejemplo (Railway)            |
   |----------------|------------------------------|
   | `DB_HOST`      | `xxxx.proxy.rlwy.net`        |
   | `DB_PORT`      | `27024`                      |
   | `DB_USER`      | `root`                       |
   | `DB_PASSWORD`  | tu contraseña **nueva**      |
   | `DB_NAME`      | `railway`                    |
   | `TEST_ADMIN_PASSWORD` / `TEST_USER_PASSWORD` | déjalas vacías para usar las de prueba |

   `JWT_SECRET` se genera automáticamente; no lo toques.
4. Pulsa **Apply** y espera a que el deploy termine (2-4 minutos). En los *Logs* verás:
   ```
   [initDb] Esquema de base de datos verificado
   Servidor escuchando en el puerto 10000 (producción)
   ```
5. Abre la URL que te da Render: `https://timecp-xxxx.onrender.com`

Si tu proveedor de MySQL exige SSL (Aiven, TiDB), ve a la pestaña **Environment** del servicio,
cambia `DB_SSL` a `true` y guarda (se redespliega solo).

## 5. Probar
| Rol      | Email               | Contraseña      |
|----------|---------------------|-----------------|
| Admin    | admin@demo.com      | Admin1234!      |
| Empleado | empleado@demo.com   | Empleado1234!   |

Comprobación rápida: `https://TU-APP.onrender.com/api/health` debe responder `{"ok":true,"db":"ok"}`.

## 6. Actualizar la app más adelante
Cada vez que cambies algo:
```bash
git add .
git commit -m "Descripción del cambio"
git push
```
Render redespliega automáticamente con cada `push`.

## Problemas frecuentes
- **`{"ok":false,"db":"error"}` o "No se pudo inicializar la base de datos" en los logs**:
  revisa las variables `DB_*` en Render → Environment. Si el proveedor usa SSL, `DB_SSL=true`.
  En Railway, usa el host y puerto del **proxy público** (TCP Proxy), no el interno.
- **La página tarda ~30 s en cargar**: el plan gratuito "duerme" el servicio tras 15 min sin uso.
- **Desaparecen los justificantes subidos**: el disco del plan gratuito se borra al reiniciar.
- **No puedo iniciar sesión tras muchos intentos**: hay un bloqueo de 15 minutos tras 10 fallos.
