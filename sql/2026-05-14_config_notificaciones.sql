-- Crear tabla para configurar exclusiones de alertas de stock
ALTER TABLE empresas ADD COLUMN IF NOT EXISTS config_notificaciones LONGTEXT DEFAULT NULL COMMENT 'Configuración de notificaciones en JSON';

-- Crear tabla específica para configuración de notificaciones por empresa
CREATE TABLE IF NOT EXISTS config_notificaciones (
  `id` int(10) UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `empresa_id` int(10) UNSIGNED NOT NULL,
  `tipo_mercaderia_id` int(10) UNSIGNED DEFAULT NULL,
  `excluir_de_stock_critico` tinyint(1) NOT NULL DEFAULT 0,
  `excluir_de_stock_bajo` tinyint(1) NOT NULL DEFAULT 0,
  `excluir_de_vencimientos` tinyint(1) NOT NULL DEFAULT 0,
  `activo` tinyint(1) NOT NULL DEFAULT 1,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  UNIQUE KEY `uq_config_notificaciones_empresa_tipo` (`empresa_id`, `tipo_mercaderia_id`),
  FOREIGN KEY (`empresa_id`) REFERENCES `empresas`(`id`) ON DELETE CASCADE,
  FOREIGN KEY (`tipo_mercaderia_id`) REFERENCES `tipos_mercaderia`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='Configuración de exclusiones para alertas de notificaciones';

-- Insertar valores por defecto para DEGUSTACION y CANJES si existen
INSERT INTO config_notificaciones (empresa_id, tipo_mercaderia_id, excluir_de_stock_critico, excluir_de_stock_bajo, excluir_de_vencimientos, activo)
SELECT e.id, tm.id, 1, 1, 1, 1
FROM empresas e
CROSS JOIN tipos_mercaderia tm
WHERE UPPER(tm.nombre) IN ('DEGUSTACION', 'CANJES')
  AND NOT EXISTS (
    SELECT 1 FROM config_notificaciones cn 
    WHERE cn.empresa_id = e.id AND cn.tipo_mercaderia_id = tm.id
  );
