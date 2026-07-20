-- Bug real encontrado revisando logos de transportadora (pedido explicito del usuario 2026-07-20):
-- orders.carrier guardaba el SLUG interno de Mipaquete (ej. "5fceb46c8229797cb139a7aa") en vez del
-- nombre legible ("SERVIENTREGA") -- mipaquete-create-shipment ya soportaba recibir
-- delivery_company_name y usarlo (linea `carrier: body.delivery_company_name || deliveryCompanyId`),
-- pero el frontend (generarGuiaEnvio en lib/ventas.ts) nunca lo mandaba, asi que el fallback al slug
-- se activaba siempre. orders.carrier nunca se lee como ID en ningun lado (grep confirmado), solo
-- para mostrarlo -- seguro reasignarle el significado a "nombre legible" y agregarle el logo,
-- mismo patron ya aplicado a standalone_shipments (migracion 061).

alter table orders add column if not exists carrier_logo_url text;
