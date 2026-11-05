-- Lo único que guarda el servicio: quién es cada miembro y qué logros tiene, con la fecha. Sin correos ni tokens
-- de Discord. Las claves de sesión y los códigos de entrada se guardan solo como huella (SHA-256).
CREATE TABLE miembros (
  discord_id TEXT PRIMARY KEY,
  nombre TEXT NOT NULL,
  desde TEXT NOT NULL,
  ultimo_acceso TEXT NOT NULL
) STRICT, WITHOUT ROWID;

-- Una fila por tramo alcanzado: el nivel actual es el mayor y cada tramo recuerda el día en que se marcó.
-- Como mucho, una fila por tramo de la lista de logros (535 hoy), así que cada miembro ocupa poco y acotado.
CREATE TABLE progreso (
  discord_id TEXT NOT NULL REFERENCES miembros (discord_id) ON DELETE CASCADE,
  logro TEXT NOT NULL,
  nivel INTEGER NOT NULL,
  fecha TEXT NOT NULL,
  PRIMARY KEY (discord_id, logro, nivel)
) STRICT, WITHOUT ROWID;

CREATE TABLE sesiones (
  huella TEXT PRIMARY KEY,
  discord_id TEXT NOT NULL REFERENCES miembros (discord_id) ON DELETE CASCADE,
  caduca INTEGER NOT NULL
) STRICT, WITHOUT ROWID;
CREATE INDEX sesiones_por_miembro ON sesiones (discord_id);

-- Código de un solo uso entre la vuelta de Discord y la página; dura un minuto.
CREATE TABLE entradas (
  huella TEXT PRIMARY KEY,
  discord_id TEXT NOT NULL REFERENCES miembros (discord_id) ON DELETE CASCADE,
  reto TEXT NOT NULL,
  caduca INTEGER NOT NULL
) STRICT, WITHOUT ROWID;
