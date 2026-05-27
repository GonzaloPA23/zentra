DELIMITER $$

CREATE PROCEDURE `sp_migrar_registros_aprobados_logicos`()
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'registros'
      AND COLUMN_NAME = 'eliminado_at'
  ) THEN
    ALTER TABLE `registros` ADD COLUMN `eliminado_at` datetime DEFAULT NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'registros'
      AND COLUMN_NAME = 'eliminado_por'
  ) THEN
    ALTER TABLE `registros` ADD COLUMN `eliminado_por` int(10) UNSIGNED DEFAULT NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'registros'
      AND COLUMN_NAME = 'eliminado_motivo'
  ) THEN
    ALTER TABLE `registros` ADD COLUMN `eliminado_motivo` varchar(255) DEFAULT NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'registros'
      AND INDEX_NAME = 'idx_registros_eliminado'
  ) THEN
    ALTER TABLE `registros` ADD KEY `idx_registros_eliminado` (`eliminado_at`);
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'registros'
      AND INDEX_NAME = 'idx_registros_eliminado_por'
  ) THEN
    ALTER TABLE `registros` ADD KEY `idx_registros_eliminado_por` (`eliminado_por`);
  END IF;
END$$

DELIMITER ;

CALL `sp_migrar_registros_aprobados_logicos`();
DROP PROCEDURE `sp_migrar_registros_aprobados_logicos`;

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
