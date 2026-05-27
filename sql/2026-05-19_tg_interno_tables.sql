-- Tabla para TG INTERNO (Transferencias entre categorías en mismo almacén)
-- Fecha: 19-05-2026

CREATE TABLE `tg_interno_transferencias` (
  `id` int(10) UNSIGNED NOT NULL,
  `empresa_id` int(10) UNSIGNED NOT NULL,
  `almacen_id` int(10) UNSIGNED NOT NULL,
  `categoria_origen_id` int(10) UNSIGNED NOT NULL,
  `cantidad_origen` decimal(10,2) NOT NULL,
  `usuario_id` int(10) UNSIGNED NOT NULL,
  `observaciones` text DEFAULT NULL,
  `activo` tinyint(1) NOT NULL DEFAULT 1,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Tabla para las líneas de distribución (dónde va el stock)
CREATE TABLE `tg_interno_detalle` (
  `id` int(10) UNSIGNED NOT NULL,
  `tg_interno_transferencia_id` int(10) UNSIGNED NOT NULL,
  `categoria_destino_id` int(10) UNSIGNED NOT NULL,
  `cantidad` decimal(10,2) NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Índices para tg_interno_transferencias
ALTER TABLE `tg_interno_transferencias`
  ADD PRIMARY KEY (`id`),
  ADD KEY `empresa_id` (`empresa_id`),
  ADD KEY `almacen_id` (`almacen_id`),
  ADD KEY `categoria_origen_id` (`categoria_origen_id`),
  ADD KEY `usuario_id` (`usuario_id`);

-- Índices para tg_interno_detalle
ALTER TABLE `tg_interno_detalle`
  ADD PRIMARY KEY (`id`),
  ADD KEY `tg_interno_transferencia_id` (`tg_interno_transferencia_id`),
  ADD KEY `categoria_destino_id` (`categoria_destino_id`);

-- Foreign keys
ALTER TABLE `tg_interno_transferencias`
  ADD CONSTRAINT `fk_tgi_empresa` FOREIGN KEY (`empresa_id`) REFERENCES `empresas` (`id`),
  ADD CONSTRAINT `fk_tgi_almacen` FOREIGN KEY (`almacen_id`) REFERENCES `almacenes` (`id`),
  ADD CONSTRAINT `fk_tgi_categoria_origen` FOREIGN KEY (`categoria_origen_id`) REFERENCES `categorias` (`id`),
  ADD CONSTRAINT `fk_tgi_usuario` FOREIGN KEY (`usuario_id`) REFERENCES `usuarios` (`id`);

ALTER TABLE `tg_interno_detalle`
  ADD CONSTRAINT `fk_tgid_transferencia` FOREIGN KEY (`tg_interno_transferencia_id`) REFERENCES `tg_interno_transferencias` (`id`) ON DELETE CASCADE,
  ADD CONSTRAINT `fk_tgid_categoria_destino` FOREIGN KEY (`categoria_destino_id`) REFERENCES `categorias` (`id`);

-- Auto increment
ALTER TABLE `tg_interno_transferencias`
  MODIFY `id` int(10) UNSIGNED NOT NULL AUTO_INCREMENT;

ALTER TABLE `tg_interno_detalle`
  MODIFY `id` int(10) UNSIGNED NOT NULL AUTO_INCREMENT;
