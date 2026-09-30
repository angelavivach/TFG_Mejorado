-- =====================================================================
--  TimeCP - Esquema de base de datos (MySQL 8 / MariaDB 10.6+)
--  Es idempotente: se puede ejecutar varias veces sin perder datos.
--  El servidor lo aplica solo al arrancar (DB_AUTO_INIT=true) o con:
--      npm run db:init
-- =====================================================================

CREATE TABLE IF NOT EXISTS usuarios (
  id_usuario                     INT NOT NULL AUTO_INCREMENT,
  nombre                         VARCHAR(100) NOT NULL,
  email                          VARCHAR(100) NOT NULL,
  password                       VARCHAR(255) NOT NULL,
  rol                            ENUM('admin','usuario') NOT NULL DEFAULT 'usuario',
  fecha_alta                     DATE NOT NULL,
  activo                         TINYINT(1) NOT NULL DEFAULT 1,
  horas_anuales_trabajadas       DECIMAL(8,2) NOT NULL DEFAULT 0,
  dias_vacaciones_disponibles    INT NOT NULL DEFAULT 30,
  dias_libres_restantes          INT NOT NULL DEFAULT 24,
  dias_enfermedad_disponibles    INT NOT NULL DEFAULT 10,
  dias_asuntopersonal_disponible INT NOT NULL DEFAULT 5,
  PRIMARY KEY (id_usuario),
  UNIQUE KEY email (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS horarios (
  id_horario   INT NOT NULL AUTO_INCREMENT,
  id_usuario   INT NOT NULL,
  lunes        VARCHAR(50) DEFAULT '08:00-15:00',
  martes       VARCHAR(50) DEFAULT '08:00-15:00',
  miercoles    VARCHAR(50) DEFAULT '08:00-15:00',
  jueves       VARCHAR(50) DEFAULT '08:00-15:00',
  viernes      VARCHAR(50) DEFAULT '08:00-15:00',
  sabado       VARCHAR(50) DEFAULT 'Libre',
  domingo      VARCHAR(50) DEFAULT 'Libre',
  fecha_inicio DATE NOT NULL,
  fecha_fin    DATE DEFAULT NULL,
  PRIMARY KEY (id_horario),
  KEY idx_horarios_usuario (id_usuario),
  CONSTRAINT horarios_ibfk_1 FOREIGN KEY (id_usuario) REFERENCES usuarios (id_usuario) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS fichajes (
  id_fichaje       INT NOT NULL AUTO_INCREMENT,
  id_usuario       INT NOT NULL,
  tipo             ENUM('entrada','salida') NOT NULL,
  fecha_hora       DATETIME NOT NULL,
  horas_trabajadas DECIMAL(5,2) DEFAULT NULL,
  PRIMARY KEY (id_fichaje),
  KEY idx_fichajes_usuario (id_usuario),
  KEY idx_fichajes_fecha (fecha_hora),
  CONSTRAINT fichajes_ibfk_1 FOREIGN KEY (id_usuario) REFERENCES usuarios (id_usuario) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS ausencias (
  id_ausencia     INT NOT NULL AUTO_INCREMENT,
  id_usuario      INT NOT NULL,
  tipo            ENUM('vacaciones','enfermedad','personal','remunerado','otro') NOT NULL,
  fecha_inicio    DATE NOT NULL,
  fecha_fin       DATE NOT NULL,
  estado          ENUM('pendiente','aprobada','rechazada') DEFAULT 'pendiente',
  comentario      TEXT,
  justificante    VARCHAR(255) DEFAULT NULL,
  dias_consumidos INT DEFAULT NULL,
  PRIMARY KEY (id_ausencia),
  KEY idx_ausencias_usuario (id_usuario),
  KEY idx_ausencias_estado (estado),
  CONSTRAINT ausencias_ibfk_1 FOREIGN KEY (id_usuario) REFERENCES usuarios (id_usuario) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS cambios_turno (
  id_cambio              INT NOT NULL AUTO_INCREMENT,
  id_usuario_solicitante INT NOT NULL,
  id_usuario_receptor    INT DEFAULT NULL,
  fecha_cambio           DATE NOT NULL,
  turno_original         VARCHAR(50) NOT NULL,
  turno_solicitado       VARCHAR(50) NOT NULL,
  estado                 ENUM('pendiente','aprobado','rechazado') DEFAULT 'pendiente',
  comentario             TEXT,
  PRIMARY KEY (id_cambio),
  KEY id_usuario_solicitante (id_usuario_solicitante),
  KEY id_usuario_receptor (id_usuario_receptor),
  CONSTRAINT cambios_turno_ibfk_1 FOREIGN KEY (id_usuario_solicitante) REFERENCES usuarios (id_usuario) ON DELETE CASCADE,
  CONSTRAINT cambios_turno_ibfk_2 FOREIGN KEY (id_usuario_receptor) REFERENCES usuarios (id_usuario) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS dias_festivos (
  id_festivo  INT NOT NULL AUTO_INCREMENT,
  fecha       DATE NOT NULL,
  descripcion VARCHAR(100) NOT NULL,
  recurrente  TINYINT(1) DEFAULT 0,
  PRIMARY KEY (id_festivo)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------------------------------------------------------------------
-- Correcciones sobre bases de datos creadas con el script antiguo
-- ---------------------------------------------------------------------
-- Este trigger descontaba los días de vacaciones una segunda vez
-- (el backend ya los descuenta al aprobar).
DROP TRIGGER IF EXISTS after_ausencia_update;
-- Este trigger usaba un límite (1645 h) distinto al de la aplicación (1784 h).
DROP TRIGGER IF EXISTS before_fichaje_update;
-- Las horas trabajadas tienen decimales: INT las redondeaba.
UPDATE usuarios SET horas_anuales_trabajadas = 0 WHERE horas_anuales_trabajadas IS NULL;
ALTER TABLE usuarios MODIFY horas_anuales_trabajadas DECIMAL(8,2) NOT NULL DEFAULT 0;
