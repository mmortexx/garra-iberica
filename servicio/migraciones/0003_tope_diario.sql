-- Tope de filas escritas por miembro y día (UTC): el plan gratuito da 100.000 al día para todo el clan, y una sola cuenta
-- con un script no debe poder gastarlas. Una fila por miembro: se reinicia sola cuando cambia el día, así que no crece
-- ni necesita limpieza. Guarda lo que le queda, no lo gastado: el tope en sí vive en el código (progreso.js), y esta tabla
-- solo impide bajar de cero, de modo que dos guardados a la vez no se cuelan: el que no cabe tumba el lote entero.
CREATE TABLE escrituras_diarias (
  discord_id TEXT PRIMARY KEY REFERENCES miembros (discord_id) ON DELETE CASCADE,
  dia TEXT NOT NULL,
  restantes INTEGER NOT NULL CONSTRAINT tope_diario CHECK (restantes >= 0)
) STRICT, WITHOUT ROWID;
