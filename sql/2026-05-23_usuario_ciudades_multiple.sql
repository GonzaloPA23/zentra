DELIMITER $$

CREATE PROCEDURE `sp_migrar_usuario_ciudades_multiple`()
BEGIN
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
END$$

DELIMITER ;

CALL `sp_migrar_usuario_ciudades_multiple`();
DROP PROCEDURE `sp_migrar_usuario_ciudades_multiple`;
