-- Para que limpiar los códigos de un miembro al entrar no recorra la tabla entera.
CREATE INDEX entradas_por_miembro ON entradas (discord_id);
