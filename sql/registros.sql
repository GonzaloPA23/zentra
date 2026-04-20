-- phpMyAdmin SQL Dump
-- version 5.0.1
-- https://www.phpmyadmin.net/
--
-- Servidor: 127.0.0.1
-- Tiempo de generación: 16-04-2026 a las 20:56:05
-- Versión del servidor: 10.4.11-MariaDB
-- Versión de PHP: 7.4.3

SET SQL_MODE = "NO_AUTO_VALUE_ON_ZERO";
SET AUTOCOMMIT = 0;
START TRANSACTION;
SET time_zone = "+00:00";


/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!40101 SET NAMES utf8mb4 */;

--
-- Base de datos: `zentra_db`
--

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `registros`
--

CREATE TABLE `registros` (
  `id` int(10) UNSIGNED NOT NULL,
  `empresa_id` int(10) UNSIGNED NOT NULL,
  `almacen_origen_id` int(10) UNSIGNED NOT NULL,
  `almacen_destino_id` int(10) UNSIGNED DEFAULT NULL,
  `usuario_id` int(10) UNSIGNED NOT NULL,
  `fecha` date NOT NULL,
  `ciudad_id` int(10) UNSIGNED NOT NULL,
  `categoria_id` int(10) UNSIGNED NOT NULL,
  `accion` enum('MERMA','DESPACHO A CANJISTAS','OTROS MOVIMIENTOS') NOT NULL,
  `tipo_accion` enum('ENTRADA','SALIDA','DEGUSTACIÓN','CANJES','CRUCERISMO','MERCADERISMO','ACTIVOS') NOT NULL,
  `personal_receptor_id` int(10) UNSIGNED DEFAULT NULL,
  `indicador_id` int(10) UNSIGNED DEFAULT NULL,
  `tipo_mercaderia_id` int(10) UNSIGNED DEFAULT NULL,
  `sku_id` int(10) UNSIGNED NOT NULL,
  `lote_id` int(10) UNSIGNED DEFAULT NULL,
  `fecha_vencimiento` date DEFAULT NULL,
  `cantidad` decimal(12,2) NOT NULL DEFAULT 0.00,
  `nro_guia` varchar(80) DEFAULT NULL,
  `foto_guia` varchar(255) DEFAULT NULL,
  `observaciones` text DEFAULT NULL,
  `estado` enum('pendiente','en_transito','aprobado','rechazado') NOT NULL DEFAULT 'pendiente',
  `aprobado_por` int(10) UNSIGNED DEFAULT NULL,
  `fecha_aprobacion` datetime DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

--
-- Volcado de datos para la tabla `registros`
--

INSERT INTO `registros` (`id`, `empresa_id`, `almacen_origen_id`, `almacen_destino_id`, `usuario_id`, `fecha`, `ciudad_id`, `categoria_id`, `accion`, `tipo_accion`, `personal_receptor_id`, `indicador_id`, `tipo_mercaderia_id`, `sku_id`, `lote_id`, `fecha_vencimiento`, `cantidad`, `nro_guia`, `foto_guia`, `observaciones`, `estado`, `aprobado_por`, `fecha_aprobacion`, `created_at`, `updated_at`) VALUES
(1, 1, 1, 18, 2, '2026-04-15', 1, 1, 'MERMA', 'ENTRADA', 1, NULL, 2, 24, 1, '2026-04-09', '20.00', 'G-232323', '1776264778926-92981924.pdf', NULL, 'aprobado', 2, '2026-04-15 17:11:08', '2026-04-15 14:52:58', '2026-04-15 22:11:08'),
(2, 1, 1, 5, 2, '2026-04-15', 1, 1, 'MERMA', 'ENTRADA', 1, 4, 1, 1, 2, '2026-04-20', '30.00', 'G-001', NULL, NULL, 'aprobado', 2, '2026-04-15 17:20:02', '2026-04-15 22:19:28', '2026-04-15 22:20:02'),
(3, 1, 28, 26, 5, '2026-04-16', 18, 1, 'MERMA', 'ENTRADA', 1, 8, 2, 135, NULL, NULL, '35.00', 'G-001', '1776365477697-633790466.pdf', 'ESTO ES UNA PRUEBA', 'pendiente', NULL, NULL, '2026-04-16 18:51:17', '2026-04-16 18:51:17');

--
-- Índices para tablas volcadas
--

--
-- Indices de la tabla `registros`
--
ALTER TABLE `registros`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_empresa` (`empresa_id`),
  ADD KEY `idx_almacen_origen` (`almacen_origen_id`),
  ADD KEY `idx_usuario` (`usuario_id`),
  ADD KEY `idx_fecha` (`fecha`),
  ADD KEY `idx_estado` (`estado`),
  ADD KEY `idx_sku` (`sku_id`),
  ADD KEY `idx_categoria` (`categoria_id`);

--
-- AUTO_INCREMENT de las tablas volcadas
--

--
-- AUTO_INCREMENT de la tabla `registros`
--
ALTER TABLE `registros`
  MODIFY `id` int(10) UNSIGNED NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=4;
COMMIT;

/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
