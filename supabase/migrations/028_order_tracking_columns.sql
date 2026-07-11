-- Estado real de tracking de Mipaquete, separado del estado interno de negocio (orders.status).
-- tracking_status: ultimo "updateState" legible devuelto por Mipaquete (ej. "Envio pendiente por
-- pago", "Procesando tu envio"). tracking_history: array completo de eventos tal cual lo devuelve
-- Mipaquete, para poder mostrar la linea de tiempo completa si hace falta. tracking_synced_at:
-- cuando se actualizo por ultima vez (util para mostrar "hace X" en el panel).
alter table orders add column tracking_status text;
alter table orders add column tracking_history jsonb;
alter table orders add column tracking_synced_at timestamptz;
