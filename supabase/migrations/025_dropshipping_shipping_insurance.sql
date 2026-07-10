-- "Hacer Dropshipping": el vendedor elige si el precio que va a cobrar ya incluye el flete
-- (shipping_included) para que mipaquete-create-shipment sepa el valor exacto a recaudar en
-- destino, y puede activar un seguro antidevoluciones (+$5.000, no reembolsable) que garantiza
-- la devolucion del flete prepagado aunque el pedido termine en devolucion.
alter table orders add column shipping_included boolean not null default true;
alter table orders add column insurance_active boolean not null default false;
