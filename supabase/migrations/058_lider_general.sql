-- Pedido explicito del usuario 2026-07-19: rol "lider general" -- un vendedor normal (mismo rol
-- 'vendedor' en la tabla roles, mismos menus/permisos de siempre) con UNA funcion extra: ve a
-- TODOS los vendedores registrados en la plataforma en el apartado de Referidos (se hayan
-- registrado con su link o no) y ve TODAS las ventas que se generan en toda la plataforma. Es el
-- encargado de la empresa que contacta a cualquier vendedor registrado para enseñarle a vender.
--
-- Se modela como un FLAG en profiles, no como una fila nueva en `roles` -- decision tecnica
-- deliberada: hay ~20 lugares distintos en el codigo que comparan `rolname === 'vendedor'` (menus,
-- paginas de compra/venta, formularios de registro, etc). Si "lider general" fuera un rol nuevo de
-- verdad, cada uno de esos ~20 lugares habria que revisarlo/actualizarlo para que tambien lo trate
-- como vendedor -- alto riesgo real de dejar alguno sin actualizar (ya paso antes en este mismo
-- proyecto con roles fantasma como 'lider'/'subAdministrador' del Angular viejo, ver memoria
-- lokomproaqui-bodega-proveedor-mismo-rol y la investigacion del rol "lider" 2026-07-19). Con un
-- flag, el usuario SIGUE siendo 'vendedor' para absolutamente todo lo demas del sistema -- cero
-- riesgo de romper algo por un chequeo de rol que se nos haya escapado -- y solo se agrega logica
-- nueva puntual en los 2 lugares donde de verdad hace falta (Referidos, Ventas).

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS es_lider_general boolean NOT NULL DEFAULT false;
