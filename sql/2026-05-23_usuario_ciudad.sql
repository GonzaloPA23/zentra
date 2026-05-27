DELIMITER $$

CREATE PROCEDURE `sp_migrar_usuario_ciudad`()
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'usuarios'
      AND COLUMN_NAME = 'ciudad_id'
  ) THEN
    ALTER TABLE `usuarios` ADD COLUMN `ciudad_id` int(10) UNSIGNED DEFAULT NULL AFTER `empresa_id`;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'usuarios'
      AND INDEX_NAME = 'idx_usuarios_ciudad'
  ) THEN
    ALTER TABLE `usuarios` ADD KEY `idx_usuarios_ciudad` (`ciudad_id`);
  END IF;
END$$

DELIMITER ;

CALL `sp_migrar_usuario_ciudad`();
DROP PROCEDURE `sp_migrar_usuario_ciudad`;
