-- Pedido explicito del usuario 2026-07-19: "bodega" y "proveedor" son el mismo rol/alcance, el
-- usuario solo los nombra distinto en la conversacion -- pidio unificarlos. Verificado antes de
-- borrar: 0 profiles con role_id apuntando a 'bodega' en produccion (select count(*) from profiles
-- where role_id = (select id from roles where name='bodega') = 0), y la unica FK que apunta a
-- roles.id en todo el esquema es profiles.role_id -- borrar esta fila es seguro, no rompe nada.
-- 'proveedor' queda como el unico rol real desde ahora (ver tambien usuariosAdmin.ts, ya no ofrece
-- 'bodega' como opcion asignable aparte).

DELETE FROM roles WHERE name = 'bodega';
