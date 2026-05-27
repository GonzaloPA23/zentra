-- ============================================================================
-- Migracion de produccion - nuevos cambios Zentra
-- Fecha: 2026-05-24
--
-- Recomendacion: ejecutar primero en una copia/staging y hacer backup completo.
-- Script idempotente para MySQL/MariaDB: valida tablas, columnas e indices antes
-- de crearlos cuando aplica.
-- ============================================================================

SET FOREIGN_KEY_CHECKS = 0;

-- ============================================================================
-- 1) Usuarios: ciudad principal y multiples ciudades por usuario
-- ============================================================================

DELIMITER $$

DROP PROCEDURE IF EXISTS `sp_zentra_add_column_if_missing`$$
CREATE PROCEDURE `sp_zentra_add_column_if_missing`(
  IN p_table_name varchar(64),
  IN p_column_name varchar(64),
  IN p_alter_sql text
)
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = p_table_name
      AND COLUMN_NAME = p_column_name
  ) THEN
    SET @zentra_sql = p_alter_sql;
    PREPARE zentra_stmt FROM @zentra_sql;
    EXECUTE zentra_stmt;
    DEALLOCATE PREPARE zentra_stmt;
  END IF;
END$$

DROP PROCEDURE IF EXISTS `sp_zentra_add_index_if_missing`$$
CREATE PROCEDURE `sp_zentra_add_index_if_missing`(
  IN p_table_name varchar(64),
  IN p_index_name varchar(64),
  IN p_alter_sql text
)
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = p_table_name
      AND INDEX_NAME = p_index_name
  ) THEN
    SET @zentra_sql = p_alter_sql;
    PREPARE zentra_stmt FROM @zentra_sql;
    EXECUTE zentra_stmt;
    DEALLOCATE PREPARE zentra_stmt;
  END IF;
END$$

DELIMITER ;

CALL `sp_zentra_add_column_if_missing`(
  'usuarios',
  'ciudad_id',
  'ALTER TABLE `usuarios` ADD COLUMN `ciudad_id` int(10) UNSIGNED DEFAULT NULL AFTER `empresa_id`'
);

CALL `sp_zentra_add_index_if_missing`(
  'usuarios',
  'idx_usuarios_ciudad',
  'ALTER TABLE `usuarios` ADD KEY `idx_usuarios_ciudad` (`ciudad_id`)'
);

CREATE TABLE IF NOT EXISTS `usuario_ciudad` (
  `usuario_id` int(10) UNSIGNED NOT NULL,
  `ciudad_id` int(10) UNSIGNED NOT NULL,
  PRIMARY KEY (`usuario_id`, `ciudad_id`),
  KEY `idx_usuario_ciudad_ciudad` (`ciudad_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT IGNORE INTO `usuario_ciudad` (`usuario_id`, `ciudad_id`)
SELECT DISTINCT ua.usuario_id, a.ciudad_id
FROM `usuario_almacen` ua
JOIN `almacenes` a ON a.id = ua.almacen_id
WHERE a.ciudad_id IS NOT NULL;

INSERT IGNORE INTO `usuario_ciudad` (`usuario_id`, `ciudad_id`)
SELECT u.id, u.ciudad_id
FROM `usuarios` u
WHERE u.ciudad_id IS NOT NULL;

UPDATE `usuarios` u
JOIN (
  SELECT usuario_id, MIN(ciudad_id) AS ciudad_id
  FROM `usuario_ciudad`
  GROUP BY usuario_id
) uc ON uc.usuario_id = u.id
SET u.ciudad_id = uc.ciudad_id
WHERE u.ciudad_id IS NULL;

-- ============================================================================
-- 2) Registros aprobados: borrado logico y auditoria de cambios
-- ============================================================================

CALL `sp_zentra_add_column_if_missing`(
  'registros',
  'eliminado_at',
  'ALTER TABLE `registros` ADD COLUMN `eliminado_at` datetime DEFAULT NULL AFTER `updated_at`'
);

CALL `sp_zentra_add_column_if_missing`(
  'registros',
  'eliminado_por',
  'ALTER TABLE `registros` ADD COLUMN `eliminado_por` int(10) UNSIGNED DEFAULT NULL AFTER `eliminado_at`'
);

CALL `sp_zentra_add_column_if_missing`(
  'registros',
  'eliminado_motivo',
  'ALTER TABLE `registros` ADD COLUMN `eliminado_motivo` varchar(255) DEFAULT NULL AFTER `eliminado_por`'
);

CALL `sp_zentra_add_index_if_missing`(
  'registros',
  'idx_registros_eliminado',
  'ALTER TABLE `registros` ADD KEY `idx_registros_eliminado` (`eliminado_at`)'
);

CALL `sp_zentra_add_index_if_missing`(
  'registros',
  'idx_registros_eliminado_por',
  'ALTER TABLE `registros` ADD KEY `idx_registros_eliminado_por` (`eliminado_por`)'
);

CREATE TABLE IF NOT EXISTS `eliminado_registros` (
  `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT,
  `registro_id` int(10) UNSIGNED NOT NULL,
  `empresa_id` int(10) UNSIGNED DEFAULT NULL,
  `eliminado_por` int(10) UNSIGNED DEFAULT NULL,
  `eliminado_at` datetime NOT NULL DEFAULT current_timestamp(),
  `motivo` varchar(255) DEFAULT NULL,
  `registro_snapshot` longtext DEFAULT NULL,
  `detalles_snapshot` longtext DEFAULT NULL,
  `movimientos_snapshot` longtext DEFAULT NULL,
  `stock_reversion_snapshot` longtext DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_eliminado_registro` (`registro_id`),
  KEY `idx_eliminado_empresa` (`empresa_id`),
  KEY `idx_eliminado_por` (`eliminado_por`),
  KEY `idx_eliminado_at` (`eliminado_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE IF NOT EXISTS `registro_aprobado_cambios` (
  `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT,
  `registro_id` int(10) UNSIGNED NOT NULL,
  `empresa_id` int(10) UNSIGNED DEFAULT NULL,
  `accion` enum('EDITAR','ELIMINAR') NOT NULL,
  `usuario_id` int(10) UNSIGNED DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  `motivo` varchar(255) DEFAULT NULL,
  `snapshot_antes` longtext DEFAULT NULL,
  `snapshot_despues` longtext DEFAULT NULL,
  `movimientos_antes` longtext DEFAULT NULL,
  `movimientos_despues` longtext DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_registro_aprobado_cambios_registro` (`registro_id`),
  KEY `idx_registro_aprobado_cambios_empresa` (`empresa_id`),
  KEY `idx_registro_aprobado_cambios_usuario` (`usuario_id`),
  KEY `idx_registro_aprobado_cambios_created_at` (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- ============================================================================
-- 3) TG interno: transferencias entre categorias del mismo almacen
-- ============================================================================

CREATE TABLE IF NOT EXISTS `tg_interno_transferencias` (
  `id` int(10) UNSIGNED NOT NULL AUTO_INCREMENT,
  `empresa_id` int(10) UNSIGNED NOT NULL,
  `almacen_id` int(10) UNSIGNED NOT NULL,
  `categoria_origen_id` int(10) UNSIGNED NOT NULL,
  `sku_origen_id` int(10) UNSIGNED DEFAULT NULL,
  `lote_origen_id` int(10) UNSIGNED DEFAULT NULL,
  `cantidad_origen` decimal(10,2) NOT NULL,
  `usuario_id` int(10) UNSIGNED NOT NULL,
  `observaciones` text DEFAULT NULL,
  `activo` tinyint(1) NOT NULL DEFAULT 1,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `empresa_id` (`empresa_id`),
  KEY `almacen_id` (`almacen_id`),
  KEY `categoria_origen_id` (`categoria_origen_id`),
  KEY `usuario_id` (`usuario_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `tg_interno_detalle` (
  `id` int(10) UNSIGNED NOT NULL AUTO_INCREMENT,
  `tg_interno_transferencia_id` int(10) UNSIGNED NOT NULL,
  `categoria_destino_id` int(10) UNSIGNED NOT NULL,
  `sku_destino_id` int(10) UNSIGNED DEFAULT NULL,
  `lote_destino_id` int(10) UNSIGNED DEFAULT NULL,
  `cantidad` decimal(10,2) NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `tg_interno_transferencia_id` (`tg_interno_transferencia_id`),
  KEY `categoria_destino_id` (`categoria_destino_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CALL `sp_zentra_add_column_if_missing`(
  'tg_interno_transferencias',
  'sku_origen_id',
  'ALTER TABLE `tg_interno_transferencias` ADD COLUMN `sku_origen_id` int(10) UNSIGNED DEFAULT NULL AFTER `categoria_origen_id`'
);

CALL `sp_zentra_add_column_if_missing`(
  'tg_interno_transferencias',
  'lote_origen_id',
  'ALTER TABLE `tg_interno_transferencias` ADD COLUMN `lote_origen_id` int(10) UNSIGNED DEFAULT NULL AFTER `sku_origen_id`'
);

CALL `sp_zentra_add_column_if_missing`(
  'tg_interno_detalle',
  'sku_destino_id',
  'ALTER TABLE `tg_interno_detalle` ADD COLUMN `sku_destino_id` int(10) UNSIGNED DEFAULT NULL AFTER `categoria_destino_id`'
);

CALL `sp_zentra_add_column_if_missing`(
  'tg_interno_detalle',
  'lote_destino_id',
  'ALTER TABLE `tg_interno_detalle` ADD COLUMN `lote_destino_id` int(10) UNSIGNED DEFAULT NULL AFTER `sku_destino_id`'
);

CALL `sp_zentra_add_column_if_missing`(
  'stock_movimientos',
  'tg_interno_transferencia_id',
  'ALTER TABLE `stock_movimientos` ADD COLUMN `tg_interno_transferencia_id` int(10) UNSIGNED DEFAULT NULL AFTER `registro_detalle_id`'
);

CALL `sp_zentra_add_index_if_missing`(
  'stock_movimientos',
  'idx_stock_movimientos_tg_interno',
  'ALTER TABLE `stock_movimientos` ADD KEY `idx_stock_movimientos_tg_interno` (`tg_interno_transferencia_id`)'
);

DELIMITER $$

DROP PROCEDURE IF EXISTS `sp_zentra_stock_movimientos_registro_nullable`$$
CREATE PROCEDURE `sp_zentra_stock_movimientos_registro_nullable`()
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'stock_movimientos'
      AND COLUMN_NAME = 'registro_id'
      AND IS_NULLABLE = 'NO'
  ) THEN
    ALTER TABLE `stock_movimientos` MODIFY `registro_id` int(10) UNSIGNED DEFAULT NULL;
  END IF;
END$$

DELIMITER ;

CALL `sp_zentra_stock_movimientos_registro_nullable`();

INSERT INTO `indicadores` (`empresa_id`, `nombre`, `activo`, `created_at`)
SELECT 1, 'TG INTERNO (MISMO ALMACEN)', 1, NOW()
WHERE NOT EXISTS (
  SELECT 1
  FROM `indicadores`
  WHERE `empresa_id` = 1
    AND `nombre` = 'TG INTERNO (MISMO ALMACEN)'
);

-- ============================================================================
-- 4) Notificaciones: columna JSON en empresas y tabla de configuracion
-- ============================================================================

CALL `sp_zentra_add_column_if_missing`(
  'empresas',
  'config_notificaciones',
  'ALTER TABLE `empresas` ADD COLUMN `config_notificaciones` longtext DEFAULT NULL COMMENT ''Configuracion de notificaciones en JSON'' AFTER `activo`'
);

CREATE TABLE IF NOT EXISTS `config_notificaciones` (
  `id` int(10) UNSIGNED NOT NULL AUTO_INCREMENT,
  `empresa_id` int(10) UNSIGNED NOT NULL,
  `tipo_mercaderia_id` int(10) UNSIGNED DEFAULT NULL,
  `excluir_de_stock_critico` tinyint(1) NOT NULL DEFAULT 0,
  `excluir_de_stock_bajo` tinyint(1) NOT NULL DEFAULT 0,
  `excluir_de_vencimientos` tinyint(1) NOT NULL DEFAULT 0,
  `activo` tinyint(1) NOT NULL DEFAULT 1,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_config_notificaciones_empresa_tipo` (`empresa_id`, `tipo_mercaderia_id`),
  KEY `idx_empresa_tipo` (`empresa_id`, `tipo_mercaderia_id`),
  KEY `tipo_mercaderia_id` (`tipo_mercaderia_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='Configuracion de exclusiones para alertas de notificaciones';

INSERT INTO `config_notificaciones`
  (`empresa_id`, `tipo_mercaderia_id`, `excluir_de_stock_critico`, `excluir_de_stock_bajo`, `excluir_de_vencimientos`, `activo`)
SELECT e.id, tm.id, 1, 1, 1, 1
FROM `empresas` e
CROSS JOIN `tipos_mercaderia` tm
WHERE UPPER(tm.nombre) IN ('DEGUSTACION', 'CANJES')
  AND NOT EXISTS (
    SELECT 1
    FROM `config_notificaciones` cn
    WHERE cn.empresa_id = e.id
      AND cn.tipo_mercaderia_id = tm.id
  );

-- ============================================================================
-- 5) Personal receptor: email e indice unico por empresa/email/almacen/categoria
-- ============================================================================

CALL `sp_zentra_add_column_if_missing`(
  'personal_receptor',
  'email',
  'ALTER TABLE `personal_receptor` ADD COLUMN `email` varchar(150) NULL AFTER `nombre`'
);

UPDATE `personal_receptor`
SET `email` = CONCAT('personal.receptor.', `id`, '@gdb.com.pe')
WHERE `email` IS NULL OR TRIM(`email`) = '';

CALL `sp_zentra_add_index_if_missing`(
  'personal_receptor',
  'idx_personal_receptor_almacen_categoria',
  'ALTER TABLE `personal_receptor` ADD KEY `idx_personal_receptor_almacen_categoria` (`almacen_id`,`categoria_id`)'
);

DELIMITER $$

DROP PROCEDURE IF EXISTS `sp_zentra_personal_receptor_unique_scope`$$
CREATE PROCEDURE `sp_zentra_personal_receptor_unique_scope`()
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'personal_receptor'
      AND INDEX_NAME = 'uq_personal_receptor_empresa_email'
  ) THEN
    ALTER TABLE `personal_receptor` DROP INDEX `uq_personal_receptor_empresa_email`;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'personal_receptor'
      AND INDEX_NAME = 'uq_personal_receptor_empresa_email_almacen_categoria'
  ) THEN
    ALTER TABLE `personal_receptor`
      ADD UNIQUE KEY `uq_personal_receptor_empresa_email_almacen_categoria`
      (`empresa_id`, `email`, `almacen_id`, `categoria_id`);
  END IF;
END$$

DELIMITER ;

CALL `sp_zentra_personal_receptor_unique_scope`();

-- ============================================================================
-- 6) Limpieza de procedimientos auxiliares
-- ============================================================================

DROP PROCEDURE IF EXISTS `sp_zentra_personal_receptor_unique_scope`;
DROP PROCEDURE IF EXISTS `sp_zentra_stock_movimientos_registro_nullable`;
DROP PROCEDURE IF EXISTS `sp_zentra_add_index_if_missing`;
DROP PROCEDURE IF EXISTS `sp_zentra_add_column_if_missing`;

SET FOREIGN_KEY_CHECKS = 1;

-- ============================================================================
-- Fin de migracion
-- ============================================================================
