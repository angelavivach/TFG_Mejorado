# 🔒 Análisis de Seguridad y Mejoras - Timecp

## Problemas Encontrados y Soluciones

### 1. **Falta de Autenticación y Autorización**

**❌ Problema:**
- No había middleware de autenticación
- No se validaban roles de usuario
- Cualquiera podía acceder a cualquier ruta

**✅ Solución:**
```javascript
// Middleware JWT
authMiddleware: Verifica token en headers
autorizar: Controla acceso por roles (admin/usuario)
```

---

### 2. **Validación de Entrada Insuficiente**

**❌ Problema:**
```javascript
// Código original - Sin validación
router.post('/', async (req, res) => {
  const { email, password } = req.body; // ¿Qué si están vacíos?
  // Sin validar formato de email
  // Sin validar longitud de password
});
```

**✅ Solución:**
```javascript
// Código mejorado - Joi Schemas
const loginSchema = Joi.object({
  email: Joi.string().email().required(),
  password: Joi.string().min(6).required()
});

router.post('/', validarEntrada(loginSchema), async (req, res) => {
  // Datos ya están validados
});
```

---

### 3. **Vulnerabilidad SQL Injection**

**❌ Problema:**
```javascript
// INSEGURO - Concatenación directa
const sql = `UPDATE horarios SET \`${dia}\` = '${horario}' WHERE id = ${id}`;
```

**✅ Solución:**
```javascript
// SEGURO - Parametrizado
const sql = `UPDATE horarios SET \`${dia}\` = ? WHERE id_horario = ?`;
await connection.execute(sql, [horario, idHorario]);
```

---

### 4. **Contraseñas Débiles e Inseguras**

**❌ Problema:**
- Almacenamiento en SHA-256 (no es hashing, es encoding)
- Sin validación de fortaleza
- Sin salt

**✅ Solución:**
```javascript
// Bcrypt con salt
const hashedPassword = await bcrypt.hash(password, 10);

// Validar contraseña fuerte
const passwordSchema = Joi.string()
  .min(8)
  .pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])/);
  // Requiere: mayúscula, minúscula, número, símbolo especial
```

---

### 5. **Falta de Rate Limiting**

**❌ Problema:**
- Ataques de fuerza bruta posibles en login
- Spam de solicitudes sin restricción
- DoS fácil

**✅ Solución:**
```javascript
// 5 intentos de login en 15 minutos
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: 'Demasiados intentos'
});

app.post('/login', loginLimiter, ...);
```

---

### 6. **Manejo de Errores Que Revelan Información**

**❌ Problema:**
```javascript
// Revela si el usuario existe o no
if (rows.length === 0) {
  return res.status(404).json({ 
    mensaje: 'Usuario no encontrado' // ¡Pista!
  });
}
```

**✅ Solución:**
```javascript
// No diferencia entre usuario no existe o contraseña incorrecta
if (rows.length === 0 || !passwordOK) {
  return res.status(401).json({ 
    mensaje: 'Email o contraseña incorrectos' // Genérico
  });
}
```

---

### 7. **Falta de CORS Configurado**

**❌ Problema:**
```javascript
// Permite peticiones desde cualquier origen
app.use(cors());
```

**✅ Solución:**
```javascript
const corsOptions = {
  origin: 'http://localhost:3000', // Solo este origen
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization']
};
app.use(cors(corsOptions));
```

---

### 8. **Headers de Seguridad Faltantes**

**❌ Problema:**
- Sin Helmet
- Sin protección contra XSS, Clickjacking, etc.

**✅ Solución:**
```javascript
// Helmet configura automáticamente:
// Content-Security-Policy
// X-Frame-Options
// X-Content-Type-Options
// Strict-Transport-Security
app.use(helmet());
```

---

### 9. **Transacciones de Base de Datos Incompletas**

**❌ Problema:**
```javascript
// Sin transacción - Si falla a mitad:
await connection.execute('INSERT INTO usuarios...');
await connection.execute('UPDATE dias...');
// Estado inconsistente si la segunda falla
```

**✅ Solución:**
```javascript
// Con transacción - Todo o nada
await connection.beginTransaction();
try {
  await connection.execute('INSERT INTO usuarios...');
  await connection.execute('UPDATE dias...');
  await connection.commit();
} catch (err) {
  await connection.rollback();
}
```

---

### 10. **Control de Acceso Débil**

**❌ Problema:**
- Usuario podía ver/modificar datos de otros usuarios
- Admin podía hacer todo sin restricciones

**✅ Solución:**
```javascript
// Usuario solo ve sus propios datos
if (req.usuario.rol === 'usuario' && req.usuario.id !== userId) {
  return res.status(403).json({ error: 'No autorizado' });
}
```

---

### 11. **Soft Delete en Lugar de Hard Delete**

**❌ Problema:**
```javascript
// Eliminar físicamente
DELETE FROM usuarios WHERE id = ?;
```

**✅ Solución:**
```javascript
// Soft delete - Auditoría y recuperación
UPDATE usuarios SET activo = 0 WHERE id = ?;
```

---

### 12. **Variables de Entorno Expuestas**

**❌ Problema:**
```javascript
// Credenciales en el código
const db = mysql.createPool({
  host: 'localhost',
  user: 'root',
  password: 'admin123'
});
```

**✅ Solución:**
```javascript
// Variables de entorno
require('dotenv').config();
const db = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD
});
```

---

## Mejoras de Seguridad Implementadas

### 🔐 Criptografía
- ✅ Bcrypt para contraseñas
- ✅ JWT para tokens
- ✅ HTTPS ready

### 🛡️ Headers de Seguridad
- ✅ Helmet.js
- ✅ CORS restrictivo
- ✅ Content-Security-Policy

### 🚨 Control de Acceso
- ✅ Autenticación JWT
- ✅ Autorización por roles
- ✅ Validación de permisos

### ✔️ Validación
- ✅ Joi schemas
- ✅ Tipos de datos
- ✅ Rangos de valores

### 🔒 Base de Datos
- ✅ Consultas parametrizadas
- ✅ Transacciones
- ✅ Soft delete

### ⏱️ Rate Limiting
- ✅ Global (100 req/15min)
- ✅ Login (5 int/15min)
- ✅ Registro (3 int/1h)

### 📝 Logging
- ✅ Eventos de seguridad
- ✅ Errores
- ✅ Auditoría

---

## Checklist de Instalación

### 1. Instalar dependencias
```bash
npm install
```

### 2. Configurar variables de entorno
```bash
cp .env.example .env
# Editar .env con tus valores
```

### 3. Configurar base de datos
```sql
-- Crear base de datos
CREATE DATABASE timecp CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Crear tablas (ver archivo SQL)
-- Asegurar todas las tablas tengan indices en foreign keys
```

### 4. Iniciar servidor
```bash
npm start        # Producción
npm run dev      # Desarrollo (con nodemon)
```

---

## Test de Seguridad

### Login
```bash
# Intento fallido - rate limiting
for i in {1..6}; do
  curl -X POST http://localhost:3000/api/login/login \
    -H "Content-Type: application/json" \
    -d '{"email":"test@test.com","password":"wrong"}'
  sleep 1
done
# Al 6to: "Demasiados intentos de login"
```

### Token expirado
```bash
# Token válido
TOKEN="eyJhbGc..."

# Después de 8 horas
curl -H "Authorization: Bearer $TOKEN" \
  http://localhost:3000/api/usuarios
# 401 Token inválido
```

### SQL Injection
```bash
# Intentar inyección
curl -X POST http://localhost:3000/api/usuarios/1 \
  -H "Content-Type: application/json" \
  -d '{"nombre":"test\" OR \"1\"=\"1"}'
# Parametrización previene el ataque
```

---

## Próximas Mejoras (Fase 2)

- [ ] OAuth2/Google login
- [ ] Two-Factor Authentication (2FA)
- [ ] Encriptación de sensibles en DB
- [ ] HTTPS/SSL en producción
- [ ] Web Application Firewall (WAF)
- [ ] Penetration testing
- [ ] Monitoreo de seguridad
- [ ] Backup automático encriptado

---

## Referencias de Seguridad

- [OWASP Top 10](https://owasp.org/www-project-top-ten/)
- [Node.js Security Checklist](https://blog.risingstack.com/node-js-security-checklist/)
- [Express.js Security Best Practices](https://expressjs.com/en/advanced/best-practice-security.html)
- [Bcrypt](https://github.com/kelektiv/node.bcrypt.js)
- [Helmet.js](https://helmetjs.github.io/)
- [JWT](https://jwt.io/)
