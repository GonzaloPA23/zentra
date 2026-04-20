ALTER TABLE `personal_receptor`
  ADD COLUMN `almacen_id` INT UNSIGNED DEFAULT NULL AFTER `cargo`,
  ADD COLUMN `categoria_id` INT UNSIGNED DEFAULT NULL AFTER `almacen_id`,
  ADD KEY `fk_pr_almacen` (`almacen_id`),
  ADD KEY `fk_pr_categoria` (`categoria_id`),
  ADD CONSTRAINT `fk_pr_almacen` FOREIGN KEY (`almacen_id`) REFERENCES `almacenes` (`id`) ON DELETE RESTRICT,
  ADD CONSTRAINT `fk_pr_categoria` FOREIGN KEY (`categoria_id`) REFERENCES `categorias` (`id`) ON DELETE RESTRICT;
