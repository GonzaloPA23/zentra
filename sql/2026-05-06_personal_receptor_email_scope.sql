ALTER TABLE `personal_receptor`
  DROP INDEX `uq_personal_receptor_empresa_email`,
  ADD UNIQUE KEY `uq_personal_receptor_empresa_email_almacen_categoria` (`empresa_id`, `email`, `almacen_id`, `categoria_id`);
