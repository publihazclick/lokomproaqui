-- Pedido explicito del usuario 2026-08-10: la etiqueta oficial del transportador (PDF con codigo
-- de barras, campo pdfGuide de Mipaquete) SI existe y es descargable -- se confirmo en vivo via
-- getShipments contra una guia real recien creada, contradiciendo una nota de una sesion anterior
-- (2026-07-29) que concluia que Mipaquete no exponia ningun endpoint para esto (esa prueba busco
-- endpoints dedicados de "descargar etiqueta", nunca reviso el campo pdfGuide que trae getShipments).
alter table public.orders add column if not exists mipaquete_label_url text;
