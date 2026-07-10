-- El usuario pidio quitar el paquete de recarga de $30.000 del modulo "Recargar Saldo".
-- Se desactiva (status=0) en vez de borrar: recharge_purchases tiene FK a recharge_products
-- sin cascade, y podria haber compras historicas referenciando este paquete.
update recharge_products set status = 0 where price = 30000;
