-- Modulo "Generacion de Guias" (pedido explicito del usuario 2026-07-20, "para cotizar envio no veo
-- ciudad origen?"): pickup_addresses nunca guardo la ciudad de quien recoge -- guide-quote y
-- guide-create-shipment usaban SIEMPRE MIPAQUETE_ORIGIN_DANE (Bogota por defecto) sin importar
-- desde donde despachara el vendedor/proveedor, mismo hueco preexistente que orders.origen_dane_code
-- (columna creada en 013 pero nunca poblada). Para guias sueltas si importa: a diferencia de un
-- pedido de dropshipping (bodega central fija), aca quien recoge es el vendedor/proveedor desde su
-- propia direccion -- cotizar/generar siempre "desde Bogota" da un precio incorrecto si esta en
-- otra ciudad. Se guarda UNA vez en el paso remitente (igual que address/whatsapp) y de ahi en mas
-- se usa automaticamente, sin volver a pedirla.

alter table pickup_addresses add column if not exists city_name text;
alter table pickup_addresses add column if not exists city_dane_code text;
