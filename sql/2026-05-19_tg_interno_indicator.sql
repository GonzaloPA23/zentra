-- Crear indicador TG INTERNO (MISMO ALMACEN)
-- Fecha: 19-05-2026
-- Descripción: Permite transacciones en el mismo almacén con diferentes categorías por línea

INSERT INTO `indicadores` (`empresa_id`, `nombre`, `activo`, `created_at`) VALUES
(1, 'TG INTERNO (MISMO ALMACEN)', 1, NOW());
