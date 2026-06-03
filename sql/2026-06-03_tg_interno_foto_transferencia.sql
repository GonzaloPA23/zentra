ALTER TABLE `tg_interno_transferencias`
  ADD COLUMN IF NOT EXISTS `foto_transferencia` varchar(255) DEFAULT NULL AFTER `observaciones`;
