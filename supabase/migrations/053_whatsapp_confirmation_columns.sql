-- Fase 1d del plan de reduccion de devoluciones (pedido explicito del usuario 2026-07-19):
-- confirmacion real del comprador por WhatsApp ANTES de generar la guia -- la devolucion mas barata
-- de evitar es la que nunca llega a gastar flete. Solo aplica a 'contraentrega' (dropshipping/
-- muestra ya tienen al comprador negociado directo por el vendedor, fuera de la plataforma).
--
-- DISEÑO AUTO-ACTIVABLE: hoy (2026-07-19) todavia no existen las credenciales reales de Meta
-- (WhatsApp Business Cloud API, en proceso de verificacion de negocio) -- whatsapp-send-confirmation
-- va a fallar en silencio hasta que esas credenciales existan, y confirmation_status se queda en
-- null para pedidos nuevos mientras tanto. autorizarDespacho() (FormVentaDetalleModal) SOLO bloquea
-- cuando confirmation_status NO es null y NO es 'confirmed' -- un pedido nunca queda bloqueado por
-- una integracion que todavia no esta lista. El dia que las credenciales reales entren, el sistema
-- se activa solo, sin ningun flag manual que prender.

CREATE TYPE confirmation_status AS ENUM ('pending', 'confirmed', 'cancelled', 'invalid_number');

ALTER TABLE orders ADD COLUMN IF NOT EXISTS confirmation_status confirmation_status;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS confirmation_sent_at timestamptz;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS confirmation_reminder_sent_at timestamptz;
-- Guarda el message_id que devuelve la API de Meta al enviar la plantilla -- el webhook de
-- respuesta (boton "Si"/"Cancelar") trae ese mismo id en `context.id`, asi el pedido correcto se
-- identifica de forma exacta (nunca por telefono+"el pedido pendiente mas reciente", que se rompe
-- si el mismo comprador tiene 2 pedidos pendientes a la vez).
ALTER TABLE orders ADD COLUMN IF NOT EXISTS confirmation_message_id text;
