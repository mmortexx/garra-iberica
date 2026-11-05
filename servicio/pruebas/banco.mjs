// Banco de pruebas: un Discord simulado de verdad (HTTP) y el servicio en el mismo motor que Cloudflare.
import { createHash, randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as esbuild from 'esbuild';
import { Miniflare } from 'miniflare';

const AQUI = dirname(fileURLToPath(import.meta.url));
export const SERVICIO = join(AQUI, '..');
export const GUILD = '1564701916452229202';
export const ORIGEN = 'https://clan.garra-iberica.workers.dev';
export const PAGINA_ES = `${ORIGEN}/ruta/`;
export const PAGINA_EN = `${ORIGEN}/en/route/`;
export const URL_SERVICIO = 'https://cuentas.prueba';
export const ID_CLIENTE = 'cliente-de-prueba';
export const CLAVE_CLIENTE = 'clave-de-prueba-que-no-debe-guardarse';

const b64url = b => Buffer.from(b).toString('base64url');
export const aleatorio = () => b64url(randomBytes(32));
export const retoDe = v => b64url(createHash('sha256').update(v).digest());
export const huella = t => createHash('sha256').update(t).digest('hex');

// Personas de prueba: en Discord, con su correo, que el servicio no debe guardar nunca.
export const USUARIOS = {
  ana: { id: '100000000000000001', username: 'ana_user', global_name: 'Ana', email: 'ana@correo.prueba', miembro: { nick: 'Ana del clan', pending: false } },
  bea: { id: '100000000000000002', username: 'bea_user', global_name: 'Bea', email: 'bea@correo.prueba', miembro: { nick: null, pending: false } },
  ajena: { id: '100000000000000003', username: 'ajena', global_name: 'Ajena', email: 'ajena@correo.prueba', miembro: null },
  novata: { id: '100000000000000004', username: 'novata', global_name: 'Novata', email: 'novata@correo.prueba', miembro: { nick: null, pending: true } },
  rara: { id: '100000000000000005', username: 'rara', global_name: `<img src=x onerror="alert('1')">\u0000\n${'x'.repeat(200)}`, email: 'r@correo.prueba', miembro: { nick: null, pending: false } },
  admin: { id: '100000000000000009', username: 'jefa', global_name: 'Jefa', email: 'jefa@correo.prueba', miembro: { nick: null, pending: false } },
};

export async function arrancarDiscord() {
  const d = {
    llamadas: [], revocados: [], codigos: new Map(), tokens: new Map(),
    fallo: {},  // { token: 500, miembro: 500, yo: 500 }
    // Para el recorrido en navegador: a quién devuelve /oauth2/authorize.
    quien: 'ana',
  };
  const responder = (res, estado, cuerpo) => {
    res.writeHead(estado, { 'content-type': 'application/json' });
    res.end(JSON.stringify(cuerpo));
  };
  const servidor = createServer((req, res) => {
    let datos = '';
    req.on('data', t => { datos += t; });
    req.on('end', () => {
      const url = new URL(req.url, 'http://discord.prueba');
      d.llamadas.push({ metodo: req.method, ruta: url.pathname, cuerpo: datos });
      const token = (req.headers.authorization || '').replace('Bearer ', '');
      const u = d.tokens.get(token);
      if (url.pathname === '/oauth2/authorize') {
        const codigo = d.darCodigo(d.quien);
        const destino = new URL(url.searchParams.get('redirect_uri'));
        destino.searchParams.set('code', codigo);
        destino.searchParams.set('state', url.searchParams.get('state'));
        res.writeHead(302, { location: destino.href });
        res.end();
        return;
      }
      if (url.pathname === '/api/oauth2/token') {
        if (d.fallo.token) return responder(res, d.fallo.token, { error: 'fallo' });
        const f = new URLSearchParams(datos);
        const auth = Buffer.from((req.headers.authorization || '').replace('Basic ', ''), 'base64').toString();
        const uso = d.codigos.get(f.get('code'));
        if (auth !== `${ID_CLIENTE}:${CLAVE_CLIENTE}` || !uso || f.get('grant_type') !== 'authorization_code') return responder(res, 400, { error: 'invalid_grant' });
        d.codigos.delete(f.get('code'));
        const acceso = `tokendiscord-${aleatorio()}`;
        d.tokens.set(acceso, USUARIOS[uso]);
        return responder(res, 200, { access_token: acceso, token_type: 'Bearer', expires_in: 604800, refresh_token: `refresco-${aleatorio()}`, scope: 'identify guilds.members.read' });
      }
      if (url.pathname === '/api/oauth2/token/revoke') {
        d.revocados.push(new URLSearchParams(datos).get('token'));
        return responder(res, 200, {});
      }
      if (url.pathname === '/api/users/@me') {
        if (d.fallo.yo) return responder(res, d.fallo.yo, {});
        if (!u) return responder(res, 401, {});
        const { miembro: _, ...perfil } = u;
        return responder(res, 200, perfil);
      }
      if (url.pathname === `/api/users/@me/guilds/${GUILD}/member`) {
        if (d.fallo.miembro) return responder(res, d.fallo.miembro, {});
        if (!u) return responder(res, 401, {});
        if (!u.miembro) return responder(res, 404, { code: 10004 });
        return responder(res, 200, { ...u.miembro, roles: ['1'], joined_at: '2026-01-01T00:00:00Z' });
      }
      responder(res, 404, {});
    });
  });
  d.darCodigo = usuario => {
    const codigo = `codigodiscord-${aleatorio()}`;
    d.codigos.set(codigo, usuario);
    return codigo;
  };
  await new Promise(r => servidor.listen(0, '127.0.0.1', r));
  d.url = `http://127.0.0.1:${servidor.address().port}`;
  d.parar = () => new Promise(r => { servidor.closeAllConnections(); servidor.close(r); });
  return d;
}

let paquete;
// SERVICIO_ENTRADA: otro punto de entrada, para ver las pruebas fallar contra un servicio vacío o con una guarda quitada.
export async function empaquetar() {
  if (!paquete) {
    const r = await esbuild.build({
      entryPoints: [process.env.SERVICIO_ENTRADA || join(SERVICIO, 'src/index.js')], bundle: true, format: 'esm', write: false, target: 'esnext',
      loader: { '.json': 'json' },
    });
    await esbuild.stop();
    paquete = r.outputFiles[0].text;
  }
  return paquete;
}

export const sentenciasDe = sql => sql.replace(/--.*$/gm, '').split(';').map(s => s.trim()).filter(Boolean);

export async function aplicarEsquema(db) {
  const sql = readFileSync(join(SERVICIO, 'migraciones/0001_inicial.sql'), 'utf8');
  for (const s of sentenciasDe(sql)) await db.prepare(s).run();
}

export async function arrancarServicio({ discord, limites = {}, codigo, adminIds = USUARIOS.admin.id, esquema = true, sinCredenciales = false, paginaEs = PAGINA_ES, paginaEn = PAGINA_EN } = {}) {
  const mf = new Miniflare({
    modules: [{ type: 'ESModule', path: 'index.js', contents: codigo ?? await empaquetar() }],
    compatibilityDate: readFileSync(join(SERVICIO, 'wrangler.toml'), 'utf8').match(/compatibility_date = "([^"]+)"/)[1],
    d1Databases: { DB: 'prueba' },
    bindings: {
      GUILD_ID: GUILD, PAGINA_ES: paginaEs, PAGINA_EN: paginaEn, DISCORD_URL: discord.url,
      ...(sinCredenciales ? {} : { DISCORD_CLIENT_ID: ID_CLIENTE, DISCORD_CLIENT_SECRET: CLAVE_CLIENTE }), ...(adminIds === null ? {} : { ADMIN_IDS: adminIds }),
    },
    ratelimits: {
      LIMITE_ENTRADA: { namespace_id: '1001', simple: { limit: limites.entrada ?? 100000, period: 60 } },
      LIMITE_API: { namespace_id: '1002', simple: { limit: limites.api ?? 100000, period: 60 } },
    },
  });
  const db = await mf.getD1Database('DB');
  if (esquema) await aplicarEsquema(db);
  const s = {
    mf, db, discord,
    pedir(ruta, opc = {}) {
      const { token, cuerpo, origen = ORIGEN, ip = '203.0.113.1', cabeceras = {}, ...resto } = opc;
      const h = { 'CF-Connecting-IP': ip, ...(origen ? { Origin: origen } : {}), ...cabeceras };
      if (token) h.Authorization = `Bearer ${token}`;
      if (cuerpo !== undefined) { h['Content-Type'] ??= 'application/json'; }
      return mf.dispatchFetch(URL_SERVICIO + ruta, {
        redirect: 'manual', headers: h, ...(cuerpo !== undefined ? { body: typeof cuerpo === 'string' ? cuerpo : JSON.stringify(cuerpo) } : {}), ...resto,
      });
    },
    // Hasta la vuelta de Discord: devuelve la respuesta del servicio a la página y lo que hace falta para seguir.
    async volverDeDiscord(usuario, { idioma = 'es' } = {}) {
      const verificador = aleatorio();
      const inicio = await s.pedir(`/auth/discord?reto=${retoDe(verificador)}&idioma=${idioma}`, { origen: null });
      const cookie = inicio.headers.get('set-cookie')?.split(';')[0];
      const state = inicio.headers.get('location') ? new URL(inicio.headers.get('location')).searchParams.get('state') : null;
      const vuelta = await s.pedir(`/auth/discord/callback?code=${discord.darCodigo(usuario)}&state=${state}`, { origen: null, cabeceras: { Cookie: cookie } });
      const fragmento = new URLSearchParams((new URL(vuelta.headers.get('location') ?? 'https://x.invalid/').hash).slice(1));
      return { vuelta, verificador, fragmento, cookie, state };
    },
    async entrar(usuario) {
      const { fragmento, verificador } = await s.volverDeDiscord(usuario);
      const r = await s.pedir('/sesion', { method: 'POST', cuerpo: { codigo: fragmento.get('entrada'), verificador } });
      if (r.status !== 200) throw new Error(`no entra ${usuario}: ${r.status} ${await r.text()}`);
      return (await r.json()).token;
    },
    filas: async (sql, ...p) => (await db.prepare(sql).bind(...p).all()).results,
    todo: async () => {
      const salida = {};
      for (const t of ['miembros', 'progreso', 'sesiones', 'entradas']) salida[t] = await s.filas(`SELECT * FROM ${t}`);
      return salida;
    },
    limpiar: async () => {
      for (const t of ['progreso', 'sesiones', 'entradas', 'miembros']) await db.prepare(`DELETE FROM ${t}`).run();
      discord.llamadas.length = 0;
      discord.revocados.length = 0;
      discord.fallo = {};
    },
    parar: () => mf.dispose(),
  };
  return s;
}
