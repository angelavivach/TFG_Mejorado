const Joi = require('joi');

// ============ AUTH SCHEMAS ============
const loginSchema = Joi.object({
  email: Joi.string()
    .email()
    .required()
    .messages({
      'string.email': 'Email inválido',
      'any.required': 'Email es obligatorio'
    }),
  password: Joi.string()
    .min(6)
    .required()
    .messages({
      'string.min': 'La contraseña debe tener al menos 6 caracteres',
      'any.required': 'Contraseña es obligatoria'
    })
});

const registroSchema = Joi.object({
  companyName: Joi.string()
    .min(2)
    .max(100)
    .required()
    .messages({
      'string.min': 'Nombre muy corto',
      'string.max': 'Nombre muy largo',
      'any.required': 'Nombre es obligatorio'
    }),
  email: Joi.string()
    .email()
    .required()
    .messages({
      'string.email': 'Email inválido',
      'any.required': 'Email es obligatorio'
    }),
  password: Joi.string()
    .min(8)
    .pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/)
    .required()
    .messages({
      'string.min': 'Contraseña debe tener al menos 8 caracteres',
      'string.pattern.base': 'Contraseña debe contener mayúscula, minúscula, número y símbolo especial',
      'any.required': 'Contraseña es obligatoria'
    })
});

// ============ USUARIOS SCHEMAS ============
const crearUsuarioSchema = Joi.object({
  nombre: Joi.string()
    .min(2)
    .max(100)
    .required(),
  email: Joi.string()
    .email()
    .required(),
  password: Joi.string()
    .min(8)
    .pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/)
    .required(),
  fecha_alta: Joi.date()
    .iso()
    .required()
});

const modificarUsuarioSchema = Joi.object({
  nombre: Joi.string()
    .min(2)
    .max(100)
    .required()
});

const eliminarUsuarioSchema = Joi.object({
  id: Joi.number()
    .integer()
    .positive()
    .required(),
  nombre: Joi.string()
    .min(2)
    .max(100)
    .required(),
  email: Joi.string()
    .email()
    .required()
});

// ============ FICHAJE SCHEMAS ============
const fichajePOSTSchema = Joi.object({
  id_usuario: Joi.number()
    .integer()
    .positive()
    .required()
    .messages({
      'number.base': 'ID de usuario debe ser un número',
      'any.required': 'ID de usuario es obligatorio'
    }),
  tipo: Joi.string()
    .valid('entrada', 'salida')
    .required()
    .messages({
      'any.only': 'Tipo debe ser "entrada" o "salida"',
      'any.required': 'Tipo es obligatorio'
    })
});

// ============ HORARIO SCHEMAS ============
const crearHorarioSchema = Joi.object({
  id_usuario: Joi.number()
    .integer()
    .positive()
    .required(),
  lunes: Joi.string()
    .pattern(/^([0-1][0-9]|2[0-3]):[0-5][0-9]-([0-1][0-9]|2[0-3]):[0-5][0-9]$|^libre$|^$/)
    .allow(''),
  martes: Joi.string()
    .pattern(/^([0-1][0-9]|2[0-3]):[0-5][0-9]-([0-1][0-9]|2[0-3]):[0-5][0-9]$|^libre$|^$/)
    .allow(''),
  miercoles: Joi.string()
    .pattern(/^([0-1][0-9]|2[0-3]):[0-5][0-9]-([0-1][0-9]|2[0-3]):[0-5][0-9]$|^libre$|^$/)
    .allow(''),
  jueves: Joi.string()
    .pattern(/^([0-1][0-9]|2[0-3]):[0-5][0-9]-([0-1][0-9]|2[0-3]):[0-5][0-9]$|^libre$|^$/)
    .allow(''),
  viernes: Joi.string()
    .pattern(/^([0-1][0-9]|2[0-3]):[0-5][0-9]-([0-1][0-9]|2[0-3]):[0-5][0-9]$|^libre$|^$/)
    .allow(''),
  sabado: Joi.string()
    .pattern(/^([0-1][0-9]|2[0-3]):[0-5][0-9]-([0-1][0-9]|2[0-3]):[0-5][0-9]$|^libre$|^$/)
    .allow(''),
  domingo: Joi.string()
    .pattern(/^([0-1][0-9]|2[0-3]):[0-5][0-9]-([0-1][0-9]|2[0-3]):[0-5][0-9]$|^libre$|^$/)
    .allow(''),
  fecha_inicio: Joi.date()
    .iso()
    .required(),
  fecha_fin: Joi.date()
    .iso()
    .min(Joi.ref('fecha_inicio'))
});

const modificarHorarioDiaSchema = Joi.object({
  idHorario: Joi.number()
    .integer()
    .positive()
    .required(),
  dia: Joi.string()
    .valid('lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado', 'domingo')
    .required(),
  horario: Joi.string()
    .pattern(/^([0-1][0-9]|2[0-3]):[0-5][0-9]-([0-1][0-9]|2[0-3]):[0-5][0-9]$|^libre$/)
    .required()
});

// ============ AUSENCIAS SCHEMAS ============
const solicitarAusenciaSchema = Joi.object({
  usuario_id: Joi.number()
    .integer()
    .positive()
    .required(),
  tipo: Joi.string()
    .valid('vacaciones', 'enfermedad', 'personal')
    .required(),
  fecha_inicio: Joi.date()
    .iso()
    .required(),
  fecha_fin: Joi.date()
    .iso()
    .min(Joi.ref('fecha_inicio'))
    .required(),
  comentarios: Joi.string()
    .max(500)
    .allow(''),
  justificante: Joi.any() // Multer se encarga de validar
});

const actualizarAusenciaSchema = Joi.object({
  id: Joi.number()
    .integer()
    .positive()
    .required(),
  estado: Joi.string()
    .valid('pendiente', 'aprobada', 'rechazada')
    .required()
});

module.exports = {
  // Auth
  loginSchema,
  registroSchema,
  
  // Usuarios
  crearUsuarioSchema,
  modificarUsuarioSchema,
  eliminarUsuarioSchema,
  
  // Fichaje
  fichajePOSTSchema,
  
  // Horario
  crearHorarioSchema,
  modificarHorarioDiaSchema,
  
  // Ausencias
  solicitarAusenciaSchema,
  actualizarAusenciaSchema
};
