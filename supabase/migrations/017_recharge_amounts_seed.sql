-- Reemplaza los paquetes de recarga (vacios hasta ahora) por los 8 valores fijos
-- que el usuario definio para el modulo "Recargar Saldo" de los dropshippers.

delete from recharge_products;

insert into recharge_products (title, description, status, price) values
  ('Recarga de $30.000', 'Recarga rapida de saldo a tu billetera', 1, 30000),
  ('Recarga de $50.000', 'Recarga rapida de saldo a tu billetera', 1, 50000),
  ('Recarga de $100.000', 'Recarga rapida de saldo a tu billetera', 1, 100000),
  ('Recarga de $200.000', 'Recarga rapida de saldo a tu billetera', 1, 200000),
  ('Recarga de $500.000', 'Recarga rapida de saldo a tu billetera', 1, 500000),
  ('Recarga de $1.000.000', 'Recarga rapida de saldo a tu billetera', 1, 1000000),
  ('Recarga de $1.500.000', 'Recarga rapida de saldo a tu billetera', 1, 1500000),
  ('Recarga de $2.000.000', 'Recarga rapida de saldo a tu billetera', 1, 2000000);
