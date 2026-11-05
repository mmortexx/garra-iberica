// ¿Las pruebas de ataque cazarían de verdad que falte una guarda? Quita cada guarda del servicio, una por una, y exige
// que alguna prueba se ponga en rojo. Si una guarda se puede quitar sin que nada falle, esa protección no está probada.
// Uso: npm run mutaciones
import { spawnSync } from 'node:child_process';
import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { SERVICIO } from './banco.mjs';

const FUENTE = join(SERVICIO, 'src/index.js');
const MUTANTE = join(SERVICIO, 'src/__mutante.js');

// [qué se quita, texto del servicio, por qué se cambia, pruebas que deben caer]
const GUARDAS = [
  ['state de la entrada', "if (!cookie || url.searchParams.get('state') !== cookie.estado) return fin('error=caducado');", "if (!cookie) return fin('error=caducado');", 'state falso'],
  ['cookie del navegador que empezó', "if (!cookie || url.searchParams.get('state') !== cookie.estado) return fin('error=caducado');", '', 'sin la cookie'],
  ['emisor iss', "if (emisor && emisor !== new URL(env.DISCORD_URL || 'https://discord.com').origin) return fin('error=rechazado');", '', 'emisor iss'],
  ['comprobar que es miembro', "if (!persona.miembro) return fin('error=no_miembro');", '', 'quien no es del servidor'],
  ['verificación pendiente del servidor', 'miembro: ficha.pending !== true,', 'miembro: true,', 'no ha pasado la verificación'],
  ['Discord caído no es «no miembro»', "if (!m.ok) throw new Fallo(502, 'discord_caido');", 'if (!m.ok) return { id: perfil.id, miembro: false };', 'Discord caído'],
  ['servidor correcto', '/api/users/@me/guilds/${env.GUILD_ID}/member', '/api/users/@me/guilds/1/member', 'un miembro vuelve'],
  ['revocar el token de Discord', "await aDiscord(env, '/api/oauth2/token/revoke', {", "if (false) await aDiscord(env, '/api/oauth2/token/revoke', {", 'guarda lo mínimo'],
  ['pedir solo los permisos justos', "scope: 'identify guilds.members.read', state", "scope: 'identify guilds.members.read email', state", 'manda a Discord'],
  ['cookie HttpOnly', 'Max-Age=600; HttpOnly; Secure; SameSite=Lax', 'Max-Age=600; Secure; SameSite=Lax', 'manda a Discord'],
  ['cookie Secure', 'Max-Age=600; HttpOnly; Secure; SameSite=Lax', 'Max-Age=600; HttpOnly; SameSite=Lax', 'manda a Discord'],
  ['código en el fragmento', '`${pagina(env, idioma)}#${fragmento}`', '`${pagina(env, idioma)}?${fragmento}`', 'un miembro vuelve'],
  ['formato del reto', "if (!ALEATORIO.test(reto)) return aLaPagina(env, idioma, 'error=peticion');", '', 'reto mal formado'],
  ['verificador del código', ' || aB64url(await sha256(verificador)) !== entrada.reto', '', 'código robado'],
  ['código de un solo uso', "'DELETE FROM entradas WHERE huella = ?1 AND caduca > ?2 RETURNING discord_id, reto'", "'SELECT discord_id, reto FROM entradas WHERE huella = ?1 AND caduca > ?2'", 'dos veces'],
  ['caducidad del código', "'DELETE FROM entradas WHERE huella = ?1 AND caduca > ?2 RETURNING discord_id, reto'", "'DELETE FROM entradas WHERE huella = ?1 AND ?2 > 0 RETURNING discord_id, reto'", 'código caducado'],
  ['caducidad de la sesión', "'SELECT discord_id FROM sesiones WHERE huella = ?1 AND caduca > ?2'", "'SELECT discord_id FROM sesiones WHERE huella = ?1 AND ?2 > 0'", 'sesión caducada'],
  ['huella de la sesión', '.bind(await huella(token), entrada.discord_id, caduca)', '.bind(token, entrada.discord_id, caduca)', 'guarda lo mínimo'],
  ['tope de sesiones', 'ORDER BY caduca DESC LIMIT ?2)`).bind(entrada.discord_id, MAX_SESIONES)', 'ORDER BY caduca DESC LIMIT ?2)`).bind(entrada.discord_id, 1000)', 'no se acumulan'],
  ['exigir sesión', "if (!fila) throw new Fallo(401, 'sin_sesion');", "if (!fila) return { id: '100000000000000001', huella: h };", 'sin clave'],
  ['origen de la petición', "if (origen && origen !== origenWeb(env)) throw new Fallo(403, 'origen');", '', 'desde otro origen|POST sencillo'],
  ['CORS solo para la web', "if (req.headers.get('Origin') === origenWeb(env)) {", 'if (true) {', 'desde otro origen'],
  ['el id de /yo sale de la sesión', 'return json(200, await misDatos(env, id));', "return json(200, await misDatos(env, new URL(req.url).searchParams.get('id') ?? id));", 'cambiando un id'],
  ['el id al guardar sale de la sesión', "const { cambios, modo = 'fijar' } = await leerJson(req);", "const { cambios, modo = 'fijar', discord_id } = await leerJson(req); if (discord_id) { await env.DB.prepare('INSERT OR IGNORE INTO progreso VALUES (?1,?2,1,?3)').bind(discord_id, 'dilo-exp', hoy()).run(); }", 'cambiando un id'],
  ['el id al borrar sale de la sesión', "const { confirmar } = await leerJson(req);", "const { confirmar, discord_id } = await leerJson(req); if (discord_id) await env.DB.prepare('DELETE FROM progreso WHERE discord_id = ?1').bind(discord_id).run();", 'borrar lo propio'],
  ['bajar solo el logro pedido', "WHERE j.value ->> '$[0]' = progreso.logro)", 'LIMIT 1)', 'bajar un logro no toca'],
  ['lista de logros', "if (maximo === undefined) rechazados.push({ logro, motivo: 'desconocido' });\n    else if", 'if (maximo === undefined) validos.set(logro ?? "x", 1);\n    else if', 'solo acepta'],
  ['nivel posible', "else if (!Number.isInteger(c.nivel) || c.nivel < 0 || c.nivel > maximo) rechazados.push({ logro, motivo: 'nivel' });", '', 'solo acepta'],
  ['subir nunca baja', "if (modo === 'fijar') {", 'if (true) {', 'nunca baja'],
  ['confirmar antes de borrar', "if (confirmar !== 'BORRAR') throw new Fallo(400, 'confirmar');", '', 'borrar pide confirmación'],
  ['borrar también las sesiones', "['progreso', 'sesiones', 'entradas', 'miembros'].map", "['progreso', 'entradas'].map", 'borrar pide confirmación'],
  ['solo administradores', "if (!esAdmin(env, id)) throw new Fallo(403, 'no_admin');", '', 'no es administrador'],
  ['paginar la copia', 'const siguiente = results.length <= TAM_PAGINA ? null', 'const siguiente = results.length <= 1e9 ? null', 'paginación'],
  ['límite de peticiones', 'return (await limitador.limit({ key: clave })).success;', 'return true;', 'cortan por IP|claves falsas'],
  ['límite por sesión', "if (!await dentroDelLimite(env.LIMITE_API, `s:${h}`)) throw new Fallo(429, 'demasiadas');", '', 'claves falsas'],
  ['límite por IP antes de la base', "if (!await dentroDelLimite(env.LIMITE_API, `ip:${ip(req)}`)) throw new Fallo(429, 'demasiadas');", '', 'claves falsas'],
  ['límite al canjear', "if (!await dentroDelLimite(env.LIMITE_ENTRADA, ip(req))) throw new Fallo(429, 'demasiadas');", '', 'cortan por IP'],
  ['límite en la vuelta de Discord', "if (!await dentroDelLimite(env.LIMITE_ENTRADA, ip(req))) return fin('error=demasiadas');", '', 'cortan por IP'],
  ['límite al empezar', "if (!await dentroDelLimite(env.LIMITE_ENTRADA, ip(req))) return aLaPagina(env, idioma, 'error=demasiadas');", '', 'cortan por IP'],
  ['limpiar el nombre', 'nombre: limpiarNombre(ficha.nick ?? perfil.global_name ?? perfil.username),', 'nombre: ficha.nick ?? perfil.global_name ?? perfil.username,', 'nombre raro'],
  ['tamaño del cuerpo', 'if (total > MAX_CUERPO) {', 'if (false) {', 'peticiones mal hechas'],
  ['número de cambios', 'if (cambios.length > MAX_CAMBIOS)', 'if (false)', 'peticiones mal hechas'],
  ['tipo del cuerpo', "if (!(req.headers.get('Content-Type') ?? '').toLowerCase().startsWith('application/json')) throw new Fallo(415, 'tipo');", '', 'peticiones mal hechas'],
  ['sin caché', "h.set('Cache-Control', 'no-store');", '', 'toda respuesta'],
  ['sin detalles de errores', "respuesta = json(503, { error: 'no_disponible' });", 'respuesta = json(503, { error: "no_disponible", detalle: String(e) });', 'sin base de datos'],
  ['limpieza solo de lo caducado', "env.DB.prepare('DELETE FROM sesiones WHERE caduca <= ?1').bind(ahora)", "env.DB.prepare('DELETE FROM sesiones WHERE ?1 > 0').bind(ahora)", 'borra lo caducado'],
];

const original = readFileSync(FUENTE, 'utf8');
const vivas = [];
try {
  for (const [que, viejo, nuevo, pruebas] of GUARDAS) {
    if (original.split(viejo).length !== 2) throw new Error(`«${que}»: su texto ya no aparece una sola vez en el servicio; actualiza esta lista`);
    writeFileSync(MUTANTE, original.replace(viejo, () => nuevo));
    const r = spawnSync(process.execPath, ['--test', `--test-name-pattern=${pruebas}`, 'pruebas/servicio.test.mjs'], {
      cwd: SERVICIO, encoding: 'utf8', env: { ...process.env, SERVICIO_ENTRADA: MUTANTE }, timeout: 180000,
    });
    const paso = /^ℹ pass (\d+)/m.exec(r.stdout)?.[1];
    const fallo = Number(/^ℹ fail (\d+)/m.exec(r.stdout)?.[1] ?? 0);
    const cazada = r.status !== 0 && fallo > 0 && !/ERROR|ERR_/.test(r.stderr.slice(0, 200));
    console.log(`${cazada ? 'cazada' : 'VIVA  '}  ${que}  (${fallo} en rojo, ${paso} en verde)`);
    if (!cazada) vivas.push(que);
  }
} finally {
  rmSync(MUTANTE, { force: true });
}
console.log(`\n${GUARDAS.length - vivas.length} de ${GUARDAS.length} guardas quitadas se cazan`);
if (vivas.length) {
  console.log('Sin probar de verdad:', vivas.join(', '));
  process.exit(1);
}
