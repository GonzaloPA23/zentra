ALTER TABLE `personal_receptor`
  ADD COLUMN `email` varchar(150) NULL AFTER `nombre`;

UPDATE `personal_receptor`
SET `email` = CONCAT('personal.receptor.', `id`, '@gdb.com.pe')
WHERE `email` IS NULL OR TRIM(`email`) = '';

ALTER TABLE `personal_receptor`
  MODIFY COLUMN `email` varchar(150) NOT NULL;

ALTER TABLE `personal_receptor`
  ADD UNIQUE KEY `uq_personal_receptor_empresa_email` (`empresa_id`, `email`);
