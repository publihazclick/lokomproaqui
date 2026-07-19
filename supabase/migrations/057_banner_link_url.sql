-- Pedido explicito del usuario 2026-07-19: mostrar el anuncio (antes hardcodeado en RealHeader.tsx,
-- solo visible en /info) tambien a usuarios logueados. Se conecta el sistema de banners que ya
-- existia (tabla notifications, type=3, editable desde /config/configuracion) pero que nunca se
-- renderizaba para el usuario final -- estaba construido y muerto. Se agrega link_url (no existia)
-- para que el banner pueda seguir siendo un CTA clickeable como el actual ("Ver ahora -> /acelerador"),
-- no solo texto.
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS link_url text;

-- Semilla: preserva el contenido/comportamiento actual (el admin lo puede editar/reemplazar desde
-- /config/configuracion apenas quiera cambiarlo) -- sin esto el banner desaparece de golpe al
-- desplegar este cambio, ya que antes de esta migracion no habia ninguna fila type=3 real.
INSERT INTO notifications (title, description, link_url, type, is_admin)
SELECT '🔥 Acelerador de Ventas', 'Ver ahora', '/acelerador', 3, true
WHERE NOT EXISTS (SELECT 1 FROM notifications WHERE type = 3);
