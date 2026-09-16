const jwt = require('jsonwebtoken');

/**
 * Middleware de autenticación JWT
 * Verifica que el usuario esté autenticado
 */
const authMiddleware = (req, res, next) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    
    if (!token) {
      return res.status(401).json({ 
        error: 'No autorizado',
        mensaje: 'Token requerido'
      });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'tu_secret_key');
    req.usuario = decoded;
    next();
  } catch (error) {
    console.error('[AUTH] Error de autenticación:', error.message);
    return res.status(401).json({ 
      error: 'Token inválido',
      mensaje: 'No autorizado'
    });
  }
};

/**
 * Middleware de autorización por rol
 */
const autorizar = (...rolesPermitidos) => {
  return (req, res, next) => {
    if (!req.usuario) {
      return res.status(401).json({ 
        error: 'No autenticado'
      });
    }

    if (!rolesPermitidos.includes(req.usuario.rol)) {
      console.warn(`[AUTH] Acceso denegado para usuario ${req.usuario.id} con rol ${req.usuario.rol}`);
      return res.status(403).json({ 
        error: 'Acceso denegado',
        mensaje: 'No tienes permisos para esta acción'
      });
    }

    next();
  };
};

/**
 * Middleware de validación de entrada
 */
const validarEntrada = (schema) => {
  return (req, res, next) => {
    const { error, value } = schema.validate(req.body, {
      stripUnknown: true,
      abortEarly: false
    });

    if (error) {
      const detalles = error.details.map(e => ({
        campo: e.path.join('.'),
        mensaje: e.message
      }));
      
      return res.status(400).json({
        error: 'Datos inválidos',
        detalles
      });
    }

    req.body = value;
    next();
  };
};

module.exports = {
  authMiddleware,
  autorizar,
  validarEntrada
};
