// Guardar solo lo que cambia: el plan gratuito cuenta cada fila leída y escrita, y marcar un tramo no debe costar 535.
export async function aplicarCambios(db, id, validos, modo, fecha) {
  const { results, meta } = await db.prepare(`SELECT logro, nivel FROM progreso
    WHERE discord_id = ?1 AND logro IN (SELECT value FROM json_each(?2))`).bind(id, JSON.stringify([...validos.keys()])).all();
  const tiene = new Set(results.map(f => `${f.logro}|${f.nivel}`));
  const poner = [];
  for (const [logro, nivel] of validos) {
    for (let n = 1; n <= nivel; n++) if (!tiene.has(`${logro}|${n}`)) poner.push([logro, n]);
  }
  const quitar = modo === 'fijar' ? results.filter(f => f.nivel > validos.get(f.logro)).map(f => [f.logro, f.nivel]) : [];
  const sentencias = [];
  if (quitar.length) {
    sentencias.push(db.prepare(`DELETE FROM progreso WHERE discord_id = ?1 AND (logro, nivel) IN
      (SELECT j.value ->> '$[0]', j.value ->> '$[1]' FROM json_each(?2) j)`).bind(id, JSON.stringify(quitar)));
  }
  if (poner.length) {
    sentencias.push(db.prepare(`INSERT OR IGNORE INTO progreso (discord_id, logro, nivel, fecha)
      SELECT ?1, j.value ->> '$[0]', j.value ->> '$[1]', ?2 FROM json_each(?3) j`).bind(id, fecha, JSON.stringify(poner)));
  }
  const hechas = sentencias.length ? await db.batch(sentencias) : [];
  return {
    leidas: hechas.reduce((a, r) => a + r.meta.rows_read, meta.rows_read),
    escritas: hechas.reduce((a, r) => a + r.meta.rows_written, 0),
  };
}
