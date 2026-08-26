-- Pedido explicito del usuario 2026-07-29: nueva pestaña "Guías en preparación" en
-- /config/misDespacho, distinta de "Guías por imprimir" -- necesita una señal real de "el
-- proveedor ya imprimio esta guia" que hoy no existe en el esquema (status='preparing' solo dice
-- que la guia se genero, no si ya se imprimio). Se marca desde la pagina de comprobantes
-- (/config/misDespacho/imprimir) cuando el proveedor hace clic en "Imprimir".
alter table orders add column if not exists guide_printed_at timestamptz;
