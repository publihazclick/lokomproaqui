-- Rol "mentor": unico proposito es subir/organizar el contenido del curso Acelerador de Ventas
-- (modulos, lecciones, videos) y poder previsualizarlo. No tiene relacion con vendedor/proveedor/
-- admin -- se registra solo por una ruta secreta (no enlazada en ningun menu) y su unico destino
-- tras loguearse es el panel de administracion del curso (ver AuthService.canActivate()).
insert into roles (name) values ('mentor');
