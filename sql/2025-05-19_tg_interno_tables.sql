-- ============================================================================
-- Migración: TG INTERNO - Transferencias entre categorías
-- Fecha: 2025-05-19
-- Propósito: Crear tablas para transferencias internas (TG INTERNO)
--           que permitan movimientos de stock entre categorías del mismo almacén
-- ============================================================================

-- Tabla principal: Transferencias
CREATE TABLE IF NOT EXISTS tg_interno_transferencias (
  id INT AUTO_INCREMENT PRIMARY KEY,
  empresa_id INT NOT NULL,
  almacen_id INT NOT NULL,
  categoria_origen_id INT NOT NULL,
  cantidad_origen DECIMAL(10, 2) NOT NULL,
  usuario_id INT NOT NULL,
  observaciones TEXT,
  activo TINYINT(1) DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  
  -- Índices para queries comunes
  KEY idx_empresa (empresa_id),
  KEY idx_almacen (almacen_id),
  KEY idx_categoria_origen (categoria_origen_id),
  KEY idx_usuario (usuario_id),
  KEY idx_activo (activo),
  KEY idx_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Tabla de detalles: Líneas de destino
CREATE TABLE IF NOT EXISTS tg_interno_detalle (
  id INT AUTO_INCREMENT PRIMARY KEY,
  tg_interno_transferencia_id INT NOT NULL,
  categoria_destino_id INT NOT NULL,
  cantidad DECIMAL(10, 2) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  -- Índices para queries comunes
  KEY idx_transferencia (tg_interno_transferencia_id),
  KEY idx_categoria_destino (categoria_destino_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================================
-- Fin de la migración
-- ============================================================================
