-- ============================================================
-- ZENTRA ALMACENES - SCHEMA MySQL
-- Compatible con phpMyAdmin / MySQL 5.7+
-- ============================================================

SET SQL_MODE = "NO_AUTO_VALUE_ON_ZERO";
SET time_zone = "+00:00";
SET NAMES utf8mb4;

CREATE DATABASE IF NOT EXISTS `zentra_db`
  CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

USE `zentra_db`;

-- ============================================================
-- 1. EMPRESAS (multiempresa)
-- ============================================================
CREATE TABLE `empresas` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `nombre` VARCHAR(120) NOT NULL,
  `ruc` VARCHAR(20) DEFAULT NULL,
  `logo` VARCHAR(255) DEFAULT NULL,
  `activo` TINYINT(1) NOT NULL DEFAULT 1,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_ruc` (`ruc`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ============================================================
-- 2. USUARIOS
-- ============================================================
CREATE TABLE `usuarios` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `empresa_id` INT UNSIGNED NOT NULL,
  `nombre` VARCHAR(100) NOT NULL,
  `apellido` VARCHAR(100) NOT NULL,
  `email` VARCHAR(150) NOT NULL,
  `password_hash` VARCHAR(255) NOT NULL,
  `rol` ENUM('superadmin','admin','supervisor','almacenero') NOT NULL DEFAULT 'almacenero',
  `activo` TINYINT(1) NOT NULL DEFAULT 1,
  `token_reset` VARCHAR(100) DEFAULT NULL,
  `token_expira` DATETIME DEFAULT NULL,
  `ultimo_login` DATETIME DEFAULT NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_email` (`email`),
  KEY `fk_usuario_empresa` (`empresa_id`),
  CONSTRAINT `fk_usuario_empresa` FOREIGN KEY (`empresa_id`) REFERENCES `empresas` (`id`) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ============================================================
-- 3. REGIONES
-- ============================================================
CREATE TABLE `regiones` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `empresa_id` INT UNSIGNED NOT NULL,
  `nombre` VARCHAR(80) NOT NULL,
  `activo` TINYINT(1) NOT NULL DEFAULT 1,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `fk_region_empresa` (`empresa_id`),
  CONSTRAINT `fk_region_empresa` FOREIGN KEY (`empresa_id`) REFERENCES `empresas` (`id`) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ============================================================
-- 4. CIUDADES
-- ============================================================
CREATE TABLE `ciudades` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `region_id` INT UNSIGNED NOT NULL,
  `nombre` VARCHAR(80) NOT NULL,
  `activo` TINYINT(1) NOT NULL DEFAULT 1,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `fk_ciudad_region` (`region_id`),
  CONSTRAINT `fk_ciudad_region` FOREIGN KEY (`region_id`) REFERENCES `regiones` (`id`) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ============================================================
-- 5. ALMACENES
-- ============================================================
CREATE TABLE `almacenes` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `ciudad_id` INT UNSIGNED NOT NULL,
  `nombre` VARCHAR(120) NOT NULL,
  `direccion` VARCHAR(255) DEFAULT NULL,
  `activo` TINYINT(1) NOT NULL DEFAULT 1,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `fk_almacen_ciudad` (`ciudad_id`),
  CONSTRAINT `fk_almacen_ciudad` FOREIGN KEY (`ciudad_id`) REFERENCES `ciudades` (`id`) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ============================================================
-- 6. ASIGNACION USUARIO <-> ALMACEN
-- ============================================================
CREATE TABLE `usuario_almacen` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `usuario_id` INT UNSIGNED NOT NULL,
  `almacen_id` INT UNSIGNED NOT NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_ua` (`usuario_id`,`almacen_id`),
  KEY `fk_ua_almacen` (`almacen_id`),
  CONSTRAINT `fk_ua_usuario` FOREIGN KEY (`usuario_id`) REFERENCES `usuarios` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_ua_almacen` FOREIGN KEY (`almacen_id`) REFERENCES `almacenes` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ============================================================
-- 7. CATEGORIAS (CRUD)
-- ============================================================
CREATE TABLE `categorias` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `empresa_id` INT UNSIGNED NOT NULL,
  `nombre` VARCHAR(100) NOT NULL,
  `descripcion` TEXT DEFAULT NULL,
  `activo` TINYINT(1) NOT NULL DEFAULT 1,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `fk_cat_empresa` (`empresa_id`),
  CONSTRAINT `fk_cat_empresa` FOREIGN KEY (`empresa_id`) REFERENCES `empresas` (`id`) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ============================================================
-- 8. TIPOS DE MERCADERIA (CRUD - asociados a categoría)
-- ============================================================
CREATE TABLE `tipos_mercaderia` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `categoria_id` INT UNSIGNED NOT NULL,
  `nombre` VARCHAR(100) NOT NULL,
  `activo` TINYINT(1) NOT NULL DEFAULT 1,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `fk_tm_cat` (`categoria_id`),
  CONSTRAINT `fk_tm_cat` FOREIGN KEY (`categoria_id`) REFERENCES `categorias` (`id`) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ============================================================
-- 9. PERSONAL RECEPTOR (CRUD)
-- ============================================================
CREATE TABLE `personal_receptor` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `empresa_id` INT UNSIGNED NOT NULL,
  `nombre` VARCHAR(150) NOT NULL,
  `cargo` VARCHAR(100) DEFAULT NULL,
  `activo` TINYINT(1) NOT NULL DEFAULT 1,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `fk_pr_empresa` (`empresa_id`),
  CONSTRAINT `fk_pr_empresa` FOREIGN KEY (`empresa_id`) REFERENCES `empresas` (`id`) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ============================================================
-- 10. SKUS (CRUD - asociado a categoría y tipo mercadería)
-- ============================================================
CREATE TABLE `skus` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `empresa_id` INT UNSIGNED NOT NULL,
  `categoria_id` INT UNSIGNED NOT NULL,
  `tipo_mercaderia_id` INT UNSIGNED DEFAULT NULL,
  `zona` ENUM('LIMA','PROVINCIA') NOT NULL DEFAULT 'LIMA',
  `codigo` VARCHAR(80) DEFAULT NULL,
  `nombre` VARCHAR(255) NOT NULL,
  `unidad` VARCHAR(40) DEFAULT NULL,
  `tiene_lote` TINYINT(1) NOT NULL DEFAULT 0,
  `tiene_vencimiento` TINYINT(1) NOT NULL DEFAULT 0,
  `activo` TINYINT(1) NOT NULL DEFAULT 1,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `fk_sku_empresa` (`empresa_id`),
  KEY `fk_sku_cat` (`categoria_id`),
  KEY `fk_sku_tm` (`tipo_mercaderia_id`),
  CONSTRAINT `fk_sku_empresa` FOREIGN KEY (`empresa_id`) REFERENCES `empresas` (`id`) ON DELETE RESTRICT,
  CONSTRAINT `fk_sku_cat` FOREIGN KEY (`categoria_id`) REFERENCES `categorias` (`id`) ON DELETE RESTRICT,
  CONSTRAINT `fk_sku_tm` FOREIGN KEY (`tipo_mercaderia_id`) REFERENCES `tipos_mercaderia` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ============================================================
-- 11. LOTES (CRUD - asociado a SKU)
-- ============================================================
CREATE TABLE `lotes` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `sku_id` INT UNSIGNED NOT NULL,
  `codigo_lote` VARCHAR(80) NOT NULL,
  `fecha_vencimiento` DATE DEFAULT NULL,
  `activo` TINYINT(1) NOT NULL DEFAULT 1,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `fk_lote_sku` (`sku_id`),
  CONSTRAINT `fk_lote_sku` FOREIGN KEY (`sku_id`) REFERENCES `skus` (`id`) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ============================================================
-- 12. INDICADORES (CRUD)
-- DISGREGACIÓN | EJECUCIÓN DE CAMPO | TG-ALMACENES | TG-MOLITALIA |
-- TG-MERCADO DE ABASTO | TG-MARKETING ALTERNO | PRÉSTAMO | DEVOLUCIÓN
-- ============================================================
CREATE TABLE `indicadores` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `empresa_id` INT UNSIGNED NOT NULL,
  `nombre` VARCHAR(100) NOT NULL,
  `activo` TINYINT(1) NOT NULL DEFAULT 1,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `fk_ind_empresa` (`empresa_id`),
  CONSTRAINT `fk_ind_empresa` FOREIGN KEY (`empresa_id`) REFERENCES `empresas` (`id`) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ============================================================
-- 13. REGISTROS (Módulo 1 - tabla principal)
-- ============================================================
CREATE TABLE `registros` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `empresa_id` INT UNSIGNED NOT NULL,
  `almacen_origen_id` INT UNSIGNED NOT NULL,
  `almacen_destino_id` INT UNSIGNED DEFAULT NULL,
  `usuario_id` INT UNSIGNED NOT NULL,
  `fecha` DATE NOT NULL,
  `ciudad_id` INT UNSIGNED NOT NULL,
  `categoria_id` INT UNSIGNED NOT NULL,
  -- Acción: fija según negocio
  `accion` ENUM('MERMA','DESPACHO A CANJISTAS','OTROS MOVIMIENTOS') NOT NULL,
  -- Tipo de acción: derivado de acción, valor fijo
  `tipo_accion` ENUM('ENTRADA','SALIDA','DEGUSTACIÓN','CANJES','CRUCERISMO','MERCADERISMO','ACTIVOS') NOT NULL,
  `personal_receptor_id` INT UNSIGNED DEFAULT NULL,
  `indicador_id` INT UNSIGNED DEFAULT NULL,
  `tipo_mercaderia_id` INT UNSIGNED DEFAULT NULL,
  `sku_id` INT UNSIGNED NOT NULL,
  `lote_id` INT UNSIGNED DEFAULT NULL,
  `fecha_vencimiento` DATE DEFAULT NULL,
  `cantidad` DECIMAL(12,2) NOT NULL DEFAULT 0,
  `nro_guia` VARCHAR(80) DEFAULT NULL,
  `foto_guia` VARCHAR(255) DEFAULT NULL,
  `observaciones` TEXT DEFAULT NULL,
  `estado` ENUM('pendiente','en_transito','aprobado','rechazado') NOT NULL DEFAULT 'pendiente',
  `aprobado_por` INT UNSIGNED DEFAULT NULL,
  `fecha_aprobacion` DATETIME DEFAULT NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `fk_reg_empresa` (`empresa_id`),
  KEY `fk_reg_origen` (`almacen_origen_id`),
  KEY `fk_reg_destino` (`almacen_destino_id`),
  KEY `fk_reg_usuario` (`usuario_id`),
  KEY `fk_reg_ciudad` (`ciudad_id`),
  KEY `fk_reg_cat` (`categoria_id`),
  KEY `fk_reg_pr` (`personal_receptor_id`),
  KEY `fk_reg_ind` (`indicador_id`),
  KEY `fk_reg_tm` (`tipo_mercaderia_id`),
  KEY `fk_reg_sku` (`sku_id`),
  KEY `fk_reg_lote` (`lote_id`),
  KEY `fk_reg_aprobador` (`aprobado_por`),
  KEY `idx_fecha` (`fecha`),
  KEY `idx_estado` (`estado`),
  CONSTRAINT `fk_reg_empresa` FOREIGN KEY (`empresa_id`) REFERENCES `empresas` (`id`),
  CONSTRAINT `fk_reg_origen` FOREIGN KEY (`almacen_origen_id`) REFERENCES `almacenes` (`id`),
  CONSTRAINT `fk_reg_destino` FOREIGN KEY (`almacen_destino_id`) REFERENCES `almacenes` (`id`),
  CONSTRAINT `fk_reg_usuario` FOREIGN KEY (`usuario_id`) REFERENCES `usuarios` (`id`),
  CONSTRAINT `fk_reg_ciudad` FOREIGN KEY (`ciudad_id`) REFERENCES `ciudades` (`id`),
  CONSTRAINT `fk_reg_cat` FOREIGN KEY (`categoria_id`) REFERENCES `categorias` (`id`),
  CONSTRAINT `fk_reg_pr` FOREIGN KEY (`personal_receptor_id`) REFERENCES `personal_receptor` (`id`),
  CONSTRAINT `fk_reg_ind` FOREIGN KEY (`indicador_id`) REFERENCES `indicadores` (`id`),
  CONSTRAINT `fk_reg_tm` FOREIGN KEY (`tipo_mercaderia_id`) REFERENCES `tipos_mercaderia` (`id`),
  CONSTRAINT `fk_reg_sku` FOREIGN KEY (`sku_id`) REFERENCES `skus` (`id`),
  CONSTRAINT `fk_reg_lote` FOREIGN KEY (`lote_id`) REFERENCES `lotes` (`id`),
  CONSTRAINT `fk_reg_aprobador` FOREIGN KEY (`aprobado_por`) REFERENCES `usuarios` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ============================================================
-- 14. LOGS DE AUDITORÍA
-- ============================================================
CREATE TABLE `audit_log` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `empresa_id` INT UNSIGNED DEFAULT NULL,
  `usuario_id` INT UNSIGNED DEFAULT NULL,
  `accion` VARCHAR(80) NOT NULL,
  `tabla` VARCHAR(80) NOT NULL,
  `registro_id` INT UNSIGNED DEFAULT NULL,
  `detalle` TEXT DEFAULT NULL,
  `ip` VARCHAR(45) DEFAULT NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_al_empresa` (`empresa_id`),
  KEY `idx_al_usuario` (`usuario_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ============================================================
-- DATOS INICIALES
-- ============================================================

-- Empresa demo
INSERT INTO `empresas` (`id`,`nombre`,`ruc`,`activo`) VALUES
(1,'ZENTRA DEMO','20123456789',1);

-- SuperAdmin (password: Admin123!)
INSERT INTO `usuarios` (`empresa_id`,`nombre`,`apellido`,`email`,`password_hash`,`rol`,`activo`) VALUES
(1,'Super','Admin','superadmin@zentra.com','$2b$10$9t2J3Fn5iQLXpWlp6WwFrOnkxBxFV0SFqfq6vDyW7fZWMWdHkTVbS','superadmin',1);

-- Regiones base
INSERT INTO `regiones` (`empresa_id`,`nombre`) VALUES
(1,'LIMA'),(1,'NORTE'),(1,'SUR'),(1,'ORIENTE'),(1,'CENTRO');

-- Ciudades base (Lima)
INSERT INTO `ciudades` (`region_id`,`nombre`) VALUES
(1,'LIMA'),(2,'CHICLAYO'),(2,'TRUJILLO'),(2,'PIURA'),
(3,'AREQUIPA'),(3,'JULIACA'),(3,'CUSCO'),(3,'AYACUCHO'),(3,'TACNA'),
(4,'PUCALLPA'),(4,'IQUITOS'),(4,'JAEN'),(4,'HUANUCO'),
(5,'HUANCAYO'),(5,'TARMA'),(5,'ICA'),(5,'HUARAZ'),(5,'HUACHO');

-- Almacenes base (Lima)
INSERT INTO `almacenes` (`ciudad_id`,`nombre`) VALUES
(1,'ALMACEN TRES REGIONES'),(1,'ALMACEN HUAMANTANGA'),(1,'ALMACEN BELAUNDE'),
(1,'ALMACEN UNICACHI NORTE'),(1,'ALMACEN FIORI'),(1,'ALMACEN CAQUETA'),
(1,'ALMACEN AYACUCHO'),(1,'ALMACEN LA PARADA'),(1,'ALMACEN PRODUCTORES'),
(1,'ALMACEN CIUDAD DE DIOS'),(1,'ALMACEN UNICACHI SUR'),
(2,'ALMACEN CHICLAYO'),(3,'ALMACEN TRUJILLO'),(4,'ALMACEN PIURA'),
(5,'ALMACEN AREQUIPA'),(6,'ALMACEN JULIACA'),(7,'ALMACEN CUSCO'),
(8,'ALMACEN AYACUCHO'),(9,'ALMACEN TACNA'),
(10,'ALMACEN PUCALLPA'),(11,'ALMACEN IQUITOS'),(12,'ALMACEN JAEN'),(13,'ALMACEN HUANUCO'),
(14,'ALMACEN HUANCAYO'),(15,'ALMACEN TARMA'),(16,'ALMACEN ICA'),
(17,'ALMACEN HUARAZ'),(18,'ALMACEN HUACHO');

-- Categorías base
INSERT INTO `categorias` (`empresa_id`,`nombre`) VALUES
(1,'ABARROTES'),(1,'CONFITES'),(1,'MASCOTAS'),(1,'PANETONES'),
(1,'DEGUSTACION ALIMENTOS'),(1,'FANNY'),(1,'FRUGELE MIX'),(1,'TODINNO'),(1,'SIN CATEGORIA');

-- Tipos de mercadería base
INSERT INTO `tipos_mercaderia` (`categoria_id`,`nombre`) VALUES
(1,'ACTIVOS'),(1,'CANJES'),(1,'MERCARISMO'),
(2,'ACTIVOS'),(2,'CANJES'),(2,'MERCARISMO'),(2,'CRUCERISMO'),
(3,'ACTIVOS'),(3,'CANJES'),(3,'MERCARISMO'),
(5,'ACTIVOS'),
(6,'ACTIVOS'),(6,'DEGUSTACION'),
(7,'ACTIVOS'),(7,'CANJES'),
(8,'ACTIVOS'),(8,'CANJES'),
(9,'ACTIVOS');

-- Indicadores base
INSERT INTO `indicadores` (`empresa_id`,`nombre`) VALUES
(1,'DISGREGACIÓN'),(1,'EJECUCIÓN DE CAMPO'),(1,'TG - ALMACENES'),
(1,'TG - MOLITALIA'),(1,'TG - MERCADO DE ABASTO'),(1,'TG - MARKETING ALTERNO'),
(1,'PRÉSTAMO DE MERCADERÍA'),(1,'DEVOLUCION DE PRÉSTAMO');

-- Personal receptor base
INSERT INTO `personal_receptor` (`empresa_id`,`nombre`,`cargo`) VALUES
(1,'ALMACENERO PRINCIPAL','Almacenero'),(1,'SUPERVISOR ZONA','Supervisor');
