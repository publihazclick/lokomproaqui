-- Fase 2 del plan de reduccion de devoluciones (pedido explicito del usuario 2026-07-19):
-- notificacion real por WhatsApp cuando el pedido entra en reparto -- reduce "no contesto"/"no
-- estaba" (el cliente que sabe que el pedido llega ese dia esta mas atento). El boton "No puedo
-- recibir hoy" NO dispara un reagendamiento automatico con Mipaquete (no hay confirmacion de que su
-- API soporte eso) -- marca delivery_reschedule_requested para que el vendedor/admin coordine a
-- mano, mas honesto que fingir una integracion que no esta verificada.

ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivery_notified_at timestamptz;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivery_notification_message_id text;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivery_reschedule_requested boolean NOT NULL DEFAULT false;
