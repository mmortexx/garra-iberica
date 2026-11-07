// Servicio de cuentas de la web del clan: entrar con Discord y recordar los logros de cada miembro.
//
// La web está en otra dirección y los navegadores bloquean las cookies entre sitios, así que la sesión viaja
// en la cabecera Authorization: una clave aleatoria que la página guarda y de la que aquí solo queda la huella.
// Sin cookies de sesión no hay CSRF: otra web no puede añadir esa cabecera. La única cookie es la del viaje a Discord.
import { MAXIMOS } from './catalogo.js';
import { TopeDiario, aplicarCambios } from './progreso.js';

const DIA = 864e5;
const DURACION_SESION = 30 * DIA; // No se alarga con el uso: al caducar se vuelve a comprobar que sigue en el clan.
const DURACION_ENTRADA = 60e3;
const MAX_CUERPO = 64 * 1024;
const MAX_CAMBIOS = 500;
const MAX_SESIONES = 10;
const TAM_PAGINA = 1000;
const ESPERA_DISCORD = 8000;
const COOKIE = '__Host-garra_entrada';
const ALEATORIO = /^[A-Za-z0-9_-]{43}$/;
const ID_DISCORD = /^\d{17,20}$/;
const CONTROL = /[\u0000-\u001f\u007f-\u009f‎‏‪-‮⁦-⁩]/g;

class Fallo extends Error {
  constructor(estado, codigo, espera = 60) {
    super(codigo);
    this.estado = estado;
    this.codigo = codigo;
    this.espera = espera; // Solo para los 429: segundos hasta poder volver a intentarlo.
  }
}

const json = (estado, cuerpo, cabeceras = {}) => new Response(JSON.stringify(cuerpo), {
  status: estado, headers: { 'Content-Type': 'application/json; charset=utf-8', ...cabeceras },
});
const hoy = () => new Date().toISOString().slice(0, 10);
const segundosHastaManana = () => Math.ceil((Date.parse(hoy()) + DIA - Date.now()) / 1000);
const aB64url = bytes => btoa(String.fromCharCode(...bytes)).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
const aleatorio = () => aB64url(crypto.getRandomValues(new Uint8Array(32)));
const sha256 = async texto => new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(texto)));
const huella = async texto => [...await sha256(texto)].map(b => b.toString(16).padStart(2, '0')).join('');
const ip = req => req.headers.get('CF-Connecting-IP') || 'desconocida';
const origenWeb = env => new URL(env.PAGINA_ES).origin;
const pagina = (env, idioma) => (idioma === 'en' ? env.PAGINA_EN : env.PAGINA_ES);

// Si el contador falla: leer sigue, porque una consulta cuesta poco y la clave ya es aleatoria; entrar y escribir se
// cierran, porque gastan Discord y las filas diarias. La página guarda lo marcado y lo sube cuando vuelve.
async function dentroDelLimite(limitador, clave, { siFalla = false } = {}) {
  try {
    return (await limitador.limit({ key: clave })).success;
  } catch (e) {
    console.error('limite', e.name);
    return siFalla;
  }
}

function limpiarNombre(nombre) {
  const limpio = String(nombre ?? '').replace(CONTROL, '').trim();
  return [...limpio].slice(0, 64).join('') || 'Miembro';
}

// ---------- entrar con Discord ----------

function aLaPagina(env, idioma, fragmento, cabeceras = {}) {
  return new Response(null, { status: 302, headers: { Location: `${pagina(env, idioma)}#${fragmento}`, ...cabeceras } });
}

async function empezarEntrada(req, env, url) {
  const idioma = url.searchParams.get('idioma') === 'en' ? 'en' : 'es';
  const reto = url.searchParams.get('reto') ?? '';
  if (!await dentroDelLimite(env.LIMITE_ENTRADA, ip(req))) return aLaPagina(env, idioma, 'error=demasiadas');
  if (!ALEATORIO.test(reto)) return aLaPagina(env, idioma, 'error=peticion');
  if (!env.DISCORD_CLIENT_ID || !env.DISCORD_CLIENT_SECRET) return aLaPagina(env, idioma, 'error=no_disponible');
  const estado = aleatorio();
  const base = env.DISCORD_URL || 'https://discord.com';
  const destino = new URL('/oauth2/authorize', base);
  destino.search = new URLSearchParams({
    response_type: 'code', client_id: env.DISCORD_CLIENT_ID, scope: 'identify guilds.members.read', state: estado,
    redirect_uri: `${url.origin}/auth/discord/callback`,
  });
  return new Response(null, {
    status: 302,
    headers: {
      Location: destino.href,
      'Set-Cookie': `${COOKIE}=${estado}.${reto}.${idioma}; Path=/; Max-Age=600; HttpOnly; Secure; SameSite=Lax`,
    },
  });
}

function leerCookie(req) {
  const valor = (req.headers.get('Cookie') ?? '').split(/;\s*/).find(c => c.startsWith(`${COOKIE}=`))?.slice(COOKIE.length + 1);
  const [estado, reto, idioma] = (valor ?? '').split('.');
  if (!ALEATORIO.test(estado ?? '') || !ALEATORIO.test(reto ?? '')) return null;
  return { estado, reto, idioma: idioma === 'en' ? 'en' : 'es' };
}

async function aDiscord(env, ruta, opciones = {}) {
  try {
    return await fetch(new URL(ruta, env.DISCORD_URL || 'https://discord.com'), { signal: AbortSignal.timeout(ESPERA_DISCORD), ...opciones });
  } catch {
    throw new Fallo(502, 'discord_caido');
  }
}

const basica = env => `Basic ${btoa(`${env.DISCORD_CLIENT_ID}:${env.DISCORD_CLIENT_SECRET}`)}`;

async function quienEs(env, codigo, redirectUri) {
  const r = await aDiscord(env, '/api/oauth2/token', {
    method: 'POST',
    headers: { Authorization: basica(env), 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'authorization_code', code: codigo, redirect_uri: redirectUri }),
  });
  if (r.status === 400 || r.status === 401) throw new Fallo(400, 'rechazado');
  if (!r.ok) throw new Fallo(502, 'discord_caido');
  const { access_token: acceso, scope } = await r.json();
  if (!acceso) throw new Fallo(502, 'discord_caido');
  try {
    if (!String(scope).split(' ').includes('guilds.members.read')) throw new Fallo(400, 'rechazado');
    const portador = { headers: { Authorization: `Bearer ${acceso}` } };
    const yo = await aDiscord(env, '/api/users/@me', portador);
    if (!yo.ok) throw new Fallo(502, 'discord_caido');
    const perfil = await yo.json();
    if (!ID_DISCORD.test(perfil.id ?? '')) throw new Fallo(502, 'discord_caido');
    const m = await aDiscord(env, `/api/users/@me/guilds/${env.GUILD_ID}/member`, portador);
    // Discord caído o con prisa no es lo mismo que no ser miembro: solo el 404 lo dice.
    if (m.status === 404 || m.status === 403) return { id: perfil.id, miembro: false };
    if (!m.ok) throw new Fallo(502, 'discord_caido');
    const ficha = await m.json();
    return {
      id: perfil.id,
      miembro: ficha.pending !== true,
      nombre: limpiarNombre(ficha.nick ?? perfil.global_name ?? perfil.username),
    };
  } finally {
    // Ya no hace falta: Discord lo anula y aquí no queda en ningún sitio.
    await aDiscord(env, '/api/oauth2/token/revoke', {
      method: 'POST',
      headers: { Authorization: basica(env), 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ token: acceso, token_type_hint: 'access_token' }),
    }).catch(() => {});
  }
}

async function volverDeDiscord(req, env, url) {
  const borrar = { 'Set-Cookie': `${COOKIE}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax` };
  const cookie = leerCookie(req);
  const idioma = cookie?.idioma ?? 'es';
  const fin = fragmento => aLaPagina(env, idioma, fragmento, borrar);
  if (!await dentroDelLimite(env.LIMITE_ENTRADA, ip(req))) return fin('error=demasiadas');
  if (!cookie || url.searchParams.get('state') !== cookie.estado) return fin('error=caducado');
  const emisor = url.searchParams.get('iss');
  if (emisor && emisor !== new URL(env.DISCORD_URL || 'https://discord.com').origin) return fin('error=rechazado');
  if (url.searchParams.get('error')) return fin('error=cancelado');
  const codigoDiscord = url.searchParams.get('code');
  if (!codigoDiscord) return fin('error=rechazado');
  try {
    const persona = await quienEs(env, codigoDiscord, `${url.origin}/auth/discord/callback`);
    if (!persona.miembro) return fin('error=no_miembro');
    const codigo = aleatorio();
    const ahora = Date.now();
    await env.DB.batch([
      env.DB.prepare(`INSERT INTO miembros (discord_id, nombre, desde, ultimo_acceso) VALUES (?1, ?2, ?3, ?3)
        ON CONFLICT (discord_id) DO UPDATE SET nombre = excluded.nombre, ultimo_acceso = excluded.ultimo_acceso`).bind(persona.id, persona.nombre, hoy()),
      env.DB.prepare('DELETE FROM entradas WHERE discord_id = ?1 AND caduca <= ?2').bind(persona.id, ahora),
      env.DB.prepare('INSERT INTO entradas (huella, discord_id, reto, caduca) VALUES (?1, ?2, ?3, ?4)')
        .bind(await huella(codigo), persona.id, cookie.reto, ahora + DURACION_ENTRADA),
    ]);
    return fin(`entrada=${codigo}`);
  } catch (e) {
    if (e instanceof Fallo) return fin(`error=${e.codigo}`);
    console.error('vuelta de Discord', e.name);
    return fin('error=no_disponible');
  }
}

// ---------- sesión ----------

async function leerJson(req) {
  if (!(req.headers.get('Content-Type') ?? '').toLowerCase().startsWith('application/json')) throw new Fallo(415, 'tipo');
  const lector = req.body?.getReader();
  const trozos = [];
  let total = 0;
  while (lector) {
    const { done, value } = await lector.read();
    if (done) break;
    total += value.length;
    if (total > MAX_CUERPO) {
      await lector.cancel();
      throw new Fallo(413, 'demasiado_grande');
    }
    trozos.push(value);
  }
  let datos;
  try {
    datos = JSON.parse(new TextDecoder().decode(await new Blob(trozos).arrayBuffer()));
  } catch {
    throw new Fallo(400, 'json');
  }
  if (datos === null || typeof datos !== 'object' || Array.isArray(datos)) throw new Fallo(400, 'json');
  return datos;
}

async function canjear(req, env) {
  if (!await dentroDelLimite(env.LIMITE_ENTRADA, ip(req))) throw new Fallo(429, 'demasiadas');
  const { codigo, verificador } = await leerJson(req);
  if (typeof codigo !== 'string' || !ALEATORIO.test(codigo) || typeof verificador !== 'string' || !ALEATORIO.test(verificador)) throw new Fallo(400, 'codigo');
  const ahora = Date.now();
  // Se gasta aunque el verificador esté mal: un código colado o robado no da una segunda oportunidad.
  const { results } = await env.DB.prepare('DELETE FROM entradas WHERE huella = ?1 AND caduca > ?2 RETURNING discord_id, reto').bind(await huella(codigo), ahora).all();
  const entrada = results[0];
  if (!entrada || aB64url(await sha256(verificador)) !== entrada.reto) throw new Fallo(400, 'codigo');
  const token = aleatorio();
  const caduca = ahora + DURACION_SESION;
  await env.DB.batch([
    env.DB.prepare('INSERT INTO sesiones (huella, discord_id, caduca) VALUES (?1, ?2, ?3)').bind(await huella(token), entrada.discord_id, caduca),
    env.DB.prepare(`DELETE FROM sesiones WHERE discord_id = ?1 AND huella NOT IN
      (SELECT huella FROM sesiones WHERE discord_id = ?1 ORDER BY caduca DESC LIMIT ?2)`).bind(entrada.discord_id, MAX_SESIONES),
  ]);
  return json(200, { token, caduca });
}

async function sesionDe(req, env) {
  // Antes de mirar la base: las claves inventadas se cortan sin gastarla.
  if (!await dentroDelLimite(env.LIMITE_API, `ip:${ip(req)}`, { siFalla: true })) throw new Fallo(429, 'demasiadas');
  const [tipo, token] = (req.headers.get('Authorization') ?? '').split(' ');
  if (tipo !== 'Bearer' || !ALEATORIO.test(token ?? '')) throw new Fallo(401, 'sin_sesion');
  const h = await huella(token);
  const fila = await env.DB.prepare('SELECT discord_id FROM sesiones WHERE huella = ?1 AND caduca > ?2').bind(h, Date.now()).first();
  if (!fila) throw new Fallo(401, 'sin_sesion');
  if (!await dentroDelLimite(env.LIMITE_API, `s:${h}`, { siFalla: true })) throw new Fallo(429, 'demasiadas');
  return { id: fila.discord_id, huella: h };
}

// ---------- los datos de cada uno: el id sale siempre de la sesión, nunca de la petición ----------

const esAdmin = (env, id) => (env.ADMIN_IDS ?? '').split(',').map(a => a.trim()).filter(Boolean).includes(id);

async function misDatos(env, id) {
  const [miembro, progreso] = await env.DB.batch([
    env.DB.prepare('SELECT discord_id, nombre, desde, ultimo_acceso FROM miembros WHERE discord_id = ?1').bind(id),
    env.DB.prepare('SELECT logro, nivel, fecha FROM progreso WHERE discord_id = ?1 ORDER BY logro, nivel').bind(id),
  ]);
  return { cuenta: { ...miembro.results[0], admin: esAdmin(env, id) }, progreso: progreso.results };
}

async function yo(req, env) {
  const { id } = await sesionDe(req, env);
  return json(200, await misDatos(env, id));
}

async function descargar(req, env) {
  const { id } = await sesionDe(req, env);
  const { cuenta: { admin: _, ...cuenta }, progreso } = await misDatos(env, id);
  const cuerpo = { descargado: new Date().toISOString(), servicio: 'GARRA IBÉRICA, cuentas de la web', cuenta, progreso };
  return json(200, cuerpo, { 'Content-Disposition': 'attachment; filename="garra-iberica-mis-datos.json"' });
}

function validarCambios(cambios) {
  const validos = new Map();
  const rechazados = [];
  for (const c of cambios) {
    const logro = typeof c?.logro === 'string' && c.logro.length <= 64 ? c.logro : null;
    const maximo = logro === null ? undefined : MAXIMOS.get(logro);
    if (maximo === undefined) rechazados.push({ logro, motivo: 'desconocido' });
    else if (!Number.isInteger(c.nivel) || c.nivel < 0 || c.nivel > maximo) rechazados.push({ logro, motivo: 'nivel' });
    else validos.set(logro, c.nivel);
  }
  return { validos, rechazados };
}

async function guardarProgreso(req, env) {
  const { id } = await sesionDe(req, env);
  if (!await dentroDelLimite(env.LIMITE_ESCRITURA, `m:${id}`)) throw new Fallo(429, 'demasiadas');
  const { cambios, modo = 'fijar' } = await leerJson(req);
  if (!Array.isArray(cambios) || (modo !== 'fijar' && modo !== 'subir')) throw new Fallo(400, 'forma');
  if (cambios.length > MAX_CAMBIOS) throw new Fallo(413, 'demasiado_grande');
  const { validos, rechazados } = validarCambios(cambios);
  if (validos.size) {
    try {
      await aplicarCambios(env.DB, id, validos, modo, hoy());
    } catch (e) {
      if (e instanceof TopeDiario) throw new Fallo(429, 'tope_diario', segundosHastaManana());
      throw e;
    }
  }
  return json(200, { aplicados: validos.size, rechazados });
}

async function salir(req, env) {
  const { huella: h } = await sesionDe(req, env);
  await env.DB.prepare('DELETE FROM sesiones WHERE huella = ?1').bind(h).run();
  return json(200, { ok: true });
}

async function salirDeTodas(req, env) {
  const { id } = await sesionDe(req, env);
  await env.DB.prepare('DELETE FROM sesiones WHERE discord_id = ?1').bind(id).run();
  return json(200, { ok: true });
}

async function borrarTodo(req, env) {
  const { id } = await sesionDe(req, env);
  const { confirmar } = await leerJson(req);
  if (confirmar !== 'BORRAR') throw new Fallo(400, 'confirmar');
  await env.DB.batch(['progreso', 'sesiones', 'entradas', 'miembros'].map(t => env.DB.prepare(`DELETE FROM ${t} WHERE discord_id = ?1`).bind(id)));
  return json(200, { ok: true });
}

// ---------- copia de seguridad, por páginas: el plan gratuito da 10 ms de procesador por petición ----------

async function copia(req, env, url) {
  const { id } = await sesionDe(req, env);
  if (!esAdmin(env, id)) throw new Fallo(403, 'no_admin');
  const tabla = url.searchParams.get('tabla');
  const desde = url.searchParams.get('desde');
  let consulta;
  if (tabla === 'miembros') {
    if (desde && !ID_DISCORD.test(desde)) throw new Fallo(400, 'desde');
    consulta = env.DB.prepare(`SELECT discord_id, nombre, desde, ultimo_acceso FROM miembros
      WHERE discord_id > ?1 ORDER BY discord_id LIMIT ?2`).bind(desde ?? '', TAM_PAGINA + 1);
  } else if (tabla === 'progreso') {
    const m = desde ? /^(\d{17,20})\|([A-Za-z0-9_-]{1,64})\|(\d{1,3})$/.exec(desde) : ['', '', '', 0];
    if (!m) throw new Fallo(400, 'desde');
    consulta = env.DB.prepare(`SELECT discord_id, logro, nivel, fecha FROM progreso
      WHERE (discord_id, logro, nivel) > (?1, ?2, ?3) ORDER BY discord_id, logro, nivel LIMIT ?4`).bind(m[1], m[2], Number(m[3]), TAM_PAGINA + 1);
  } else {
    throw new Fallo(400, 'tabla');
  }
  const { results } = await consulta.all();
  const filas = results.slice(0, TAM_PAGINA);
  const ultima = filas.at(-1);
  const siguiente = results.length <= TAM_PAGINA ? null
    : tabla === 'miembros' ? ultima.discord_id : `${ultima.discord_id}|${ultima.logro}|${ultima.nivel}`;
  return json(200, { tabla, filas, siguiente });
}

// ---------- el reparto ----------

const RUTAS = {
  // HEAD también: muchos vigilantes de caídas preguntan así, y un 405 lo daría por caído.
  '/salud': { GET: () => json(200, { ok: true }), HEAD: () => new Response(null, { status: 200 }) },
  '/sesion': { POST: canjear, DELETE: salir },
  '/sesiones': { DELETE: salirDeTodas },
  '/yo': { GET: yo },
  '/yo/datos': { GET: descargar },
  '/yo/progreso': { PUT: guardarProgreso },
  '/yo/borrar': { POST: borrarTodo },
  '/admin/copia': { GET: copia },
};

async function atender(req, env, url) {
  if (req.method === 'GET' && url.pathname === '/auth/discord') return empezarEntrada(req, env, url);
  if (req.method === 'GET' && url.pathname === '/auth/discord/callback') return volverDeDiscord(req, env, url);
  const origen = req.headers.get('Origin');
  if (origen && origen !== origenWeb(env)) throw new Fallo(403, 'origen');
  const metodos = RUTAS[url.pathname];
  if (!metodos || !Object.hasOwn(RUTAS, url.pathname)) throw new Fallo(404, 'no_existe');
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Methods': Object.keys(metodos).join(', '),
        'Access-Control-Allow-Headers': 'Authorization, Content-Type',
        'Access-Control-Max-Age': '600',
      },
    });
  }
  const accion = Object.hasOwn(metodos, req.method) ? metodos[req.method] : null;
  if (!accion) throw new Fallo(405, 'metodo');
  return accion(req, env, url);
}

function vestir(respuesta, req, env) {
  const r = new Response(respuesta.body, respuesta);
  const h = r.headers;
  h.set('Cache-Control', 'no-store');
  h.set('X-Content-Type-Options', 'nosniff');
  h.set('Referrer-Policy', 'no-referrer');
  h.set('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'");
  h.set('Strict-Transport-Security', 'max-age=31536000');
  h.append('Vary', 'Origin');
  if (req.headers.get('Origin') === origenWeb(env)) {
    h.set('Access-Control-Allow-Origin', origenWeb(env));
    h.set('Access-Control-Expose-Headers', 'Retry-After, Content-Disposition');
  }
  return r;
}

export default {
  async fetch(req, env) {
    let respuesta;
    try {
      respuesta = await atender(req, env, new URL(req.url));
    } catch (e) {
      if (e instanceof Fallo) {
        respuesta = json(e.estado, { error: e.codigo }, e.estado === 429 ? { 'Retry-After': String(e.espera) } : {});
      } else {
        // Sin detalles hacia fuera ni datos de nadie en los registros.
        console.error('sin atender', e.name);
        respuesta = json(503, { error: 'no_disponible' });
      }
    }
    return vestir(respuesta, req, env);
  },

  async scheduled(_evento, env) {
    const ahora = Date.now();
    await env.DB.batch([
      env.DB.prepare('DELETE FROM sesiones WHERE caduca <= ?1').bind(ahora),
      env.DB.prepare('DELETE FROM entradas WHERE caduca <= ?1').bind(ahora),
    ]);
  },
};
