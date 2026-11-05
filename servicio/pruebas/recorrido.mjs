// El recorrido de verdad: la página de docs/ en un navegador, contra el servicio emulado y un Discord simulado.
// Web y servicio en sitios distintos, como al publicarlo. Uso: npm run recorrido (hace falta Playwright en la raíz).
// RUTA_JS: otro ruta.js, para ver las pruebas fallar. CAPTURAS: carpeta donde dejar capturas.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize, sep } from 'node:path';
import { after, afterEach, before, beforeEach, test } from 'node:test';
import { chromium } from 'playwright';
import { sqlDeCopia } from '../scripts/restaurar.mjs';
import { SERVICIO, USUARIOS, arrancarDiscord, arrancarServicio } from './banco.mjs';

const DOCS = join(SERVICIO, '..', 'docs');
const CAPTURAS = process.env.CAPTURAS;
const TIPOS = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.webp': 'image/webp', '.woff2': 'font/woff2', '.ico': 'image/x-icon', '.png': 'image/png', '.jpg': 'image/jpeg' };

let navegador, discord, s, web, URL_WEB, URL_API;
let sinServicio = false;
const errores = [];
// Nada de estas pruebas puede salir del ordenador: lo que intente salir se para aquí y la prueba falla (afterEach).
const fugas = [];
const LOCAL = new Set(['127.0.0.1', 'localhost']);
const esAjena = url => { const u = new URL(url); return /^https?:$/.test(u.protocol) && !LOCAL.has(u.hostname); };

// La página sale de docs/ diciendo el servicio de verdad (o ninguno, con las cuentas apagadas). Aquí se cambia SIEMPRE por
// el de pruebas, o por ninguno con sinServicio; si el texto no encaja, revienta: dejarlo pasar es hablar con producción.
const SERVICIO_PUBLICADO = JSON.parse(readFileSync(join(DOCS, '..', 'herramientas', 'cuentas.json'), 'utf8')).servicio;
const EN_LA_PAGINA = { dato: /data-servicio="[^"]*"/g, csp: /connect-src 'self'(?: https:\/\/[^\s;]+)?;/g };
function ajustar(html) {
  for (const [que, patron] of Object.entries(EN_LA_PAGINA)) {
    const veces = (html.match(patron) ?? []).length;
    if (veces !== 1) throw new Error(`la ruta debe llevar ${patron} una vez y lo lleva ${veces}: estas pruebas ya no saben poner su propio servicio (${que})`);
  }
  const dado = sinServicio ? '' : URL_API;
  const fuera = html.replace(EN_LA_PAGINA.dato, `data-servicio="${dado}"`).replace(EN_LA_PAGINA.csp, `connect-src 'self'${dado ? ` ${dado}` : ''};`);
  if (SERVICIO_PUBLICADO && fuera.includes(SERVICIO_PUBLICADO)) throw new Error(`la página de pruebas aún nombra el servicio de verdad (${SERVICIO_PUBLICADO})`);
  return fuera;
}

function servirDocs() {
  const servidor = createServer((req, res) => {
    const ruta = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    let fichero = normalize(join(DOCS, ruta));
    if (!fichero.startsWith(DOCS + sep)) { res.writeHead(403); res.end(); return; }
    if (ruta.endsWith('/')) fichero = join(fichero, 'index.html');
    if (ruta === '/ruta.js' && process.env.RUTA_JS) fichero = process.env.RUTA_JS;
    let cuerpo;
    try { cuerpo = readFileSync(fichero); } catch { res.writeHead(404); res.end(); return; }
    if (fichero.endsWith('index.html') && cuerpo.includes('data-miembro')) {
      try {
        cuerpo = ajustar(cuerpo.toString('utf8'));
      } catch (e) {
        fugas.push(e.message);
        res.writeHead(500); res.end(e.message); return;
      }
    }
    res.writeHead(200, { 'content-type': TIPOS[extname(fichero)] ?? 'application/octet-stream', 'cache-control': 'no-store' });
    res.end(cuerpo);
  });
  return new Promise(r => { servidor.listen(0, '127.0.0.1', () => r(servidor)); });
}

before(async () => {
  navegador = await chromium.launch();
  web = await servirDocs();
  URL_WEB = `http://127.0.0.1:${web.address().port}`;
  discord = await arrancarDiscord();
  s = await arrancarServicio({ discord, paginaEs: `${URL_WEB}/ruta/`, paginaEn: `${URL_WEB}/en/route/` });
  URL_API = (await s.mf.ready).origin.replace('127.0.0.1', 'localhost');
  assert.ok(!esAjena(URL_API) && URL_API !== SERVICIO_PUBLICADO, `el servicio de pruebas no es local: ${URL_API}`);
  for (const pagina of ['ruta', 'en/route']) {
    const html = ajustar(readFileSync(join(DOCS, pagina, 'index.html'), 'utf8'));
    assert.ok(html.includes(`data-servicio="${URL_API}"`) && html.includes(`connect-src 'self' ${URL_API};`), `${pagina}: no habla con el servicio de pruebas`);
  }
});

after(async () => {
  await navegador?.close();
  await s?.parar();
  await discord?.parar();
  web?.closeAllConnections();
  web?.close();
});

beforeEach(async () => {
  sinServicio = false;
  discord.quien = 'ana';
  errores.length = 0;
  fugas.length = 0;
  await s.limpiar();
});

afterEach(() => {
  assert.deepEqual(fugas.splice(0), [], 'la prueba ha intentado salir del ordenador (o la página no era la de pruebas)');
});

// Un dispositivo: un navegador con su propio almacenamiento.
async function dispositivo({ ancho = 1366, alto = 900, ...resto } = {}) {
  const ctx = await navegador.newContext({ viewport: { width: ancho, height: alto }, acceptDownloads: true, ...resto });
  await ctx.route(url => esAjena(url.href), r => { fugas.push(`${r.request().method()} ${r.request().url()}`); return r.abort('blockedbyclient'); });
  const abrir = async (ruta = '/ruta/') => {
    const p = await ctx.newPage();
    p.on('pageerror', e => errores.push(`pageerror: ${e.message}`));
    p.on('console', m => {
      // Con el servicio caído a propósito el navegador registra el fallo de red: eso es lo que se está probando.
      if (m.type() === 'error' && !/Failed to load resource|ERR_FAILED/.test(m.text())) errores.push(`consola: ${m.text()}`);
    });
    await p.goto(URL_WEB + ruta, { waitUntil: 'load' });
    return p;
  };
  return { ctx, abrir };
}

const visible = (p, sel) => p.locator(sel).first().isVisible();
const texto = (p, sel) => p.locator(sel).first().innerText();

async function entrar(p, quien = 'ana') {
  discord.quien = quien;
  await p.click('[data-entrar]');
  await p.waitForURL(/\/(ruta|route)\/$/);
}
async function dentro(p, quien = 'ana') {
  await entrar(p, quien);
  await p.locator('[data-dentro]').waitFor({ state: 'visible' });
}

// Abre lo que haga falta, como haría una persona, y pulsa el tramo.
async function pulsar(p, logro, nivel = 1) {
  const b = p.locator(`.ruta-grupos button[data-logro="${logro}"][data-nivel="${nivel}"]`);
  await b.evaluate(e => { e.closest('details').open = true; });
  await b.click();
}
const pulsado = (p, logro, nivel = 1) => p.locator(`.ruta-grupos button[data-logro="${logro}"][data-nivel="${nivel}"]`).getAttribute('aria-pressed');

async function hasta(comprobar, que = 'la condición', ms = 8000) {
  const fin = Date.now() + ms;
  let ultimo;
  while (Date.now() < fin) {
    ultimo = await comprobar();
    if (ultimo) return ultimo;
    await new Promise(r => { setTimeout(r, 50); });
  }
  throw new Error(`no se cumple ${que}: ${JSON.stringify(ultimo)}`);
}
const filasDe = usuario => s.filas('SELECT logro, nivel FROM progreso WHERE discord_id = ?1 ORDER BY logro, nivel', USUARIOS[usuario].id);
const subido = (usuario, logro, nivel) => hasta(async () => (await filasDe(usuario)).some(f => f.logro === logro && f.nivel === nivel), `${logro}/${nivel} en la cuenta de ${usuario}`);
const guardado = p => p.evaluate(() => JSON.parse(localStorage.getItem('garra-ruta-v1')));
const caer = (ctx, api = URL_API) => ctx.route(`${api}/**`, r => r.abort());
const volver = (ctx, api = URL_API) => ctx.unroute(`${api}/**`);
const avisar = p => p.evaluate(() => dispatchEvent(new Event('online')));

async function capturar(p, nombre, sitio = '[data-miembro]') {
  if (!CAPTURAS) return;
  await p.locator(sitio).first().evaluate(e => e.scrollIntoView({ block: 'start', behavior: 'instant' }));
  await p.screenshot({ path: join(CAPTURAS, `${nombre}.png`) });
}

test('sin servicio configurado la página funciona, lo dice y no ofrece entrar', async () => {
  sinServicio = true;
  const { ctx, abrir } = await dispositivo();
  const p = await abrir();
  const pedidas = [];
  p.on('request', r => { if (!r.url().startsWith(URL_WEB)) pedidas.push(r.url()); });
  assert.match(await texto(p, '[data-estado]'), /aún no están disponibles/);
  assert.equal(await visible(p, '[data-entrar]'), false);
  await pulsar(p, 'allo-exp');
  await p.reload();
  assert.equal(await pulsado(p, 'allo-exp'), 'true');
  assert.deepEqual(pedidas, []);
  await ctx.close();
  assert.deepEqual(errores, []);
});

test('ninguna prueba toca producción: lo que intente salir se para y se anota', async () => {
  const { ctx, abrir } = await dispositivo();
  const p = await abrir();
  const real = 'https://servicio-real.invalid/salud';
  await p.goto(real).then(() => assert.fail('la petición salió'), () => {});
  await p.goto('https://discord.invalid/oauth2/authorize').then(() => assert.fail('la petición salió'), () => {});
  assert.deepEqual(fugas.splice(0), [`GET ${real}`, 'GET https://discord.invalid/oauth2/authorize']);
  await ctx.close();
});

test('el servidor de pruebas no deja pasar una página con otra forma: revienta', () => {
  const servicio = 'data-servicio="x" connect-src \'self\';';
  assert.ok(ajustar(servicio).includes(`data-servicio="${URL_API}"`));
  for (const mal of ['sin nada', `${servicio} ${servicio}`, 'data-servicio="x"', "connect-src 'self';"]) {
    assert.throws(() => ajustar(mal), /una vez/, mal);
  }
  assert.equal(ajustar(`data-servicio="https://garra-cuentas.garra-iberica.workers.dev" connect-src 'self' https://garra-cuentas.garra-iberica.workers.dev;`).includes('garra-cuentas'), false);
});

test('con sesión y el servicio apagado en la web: no finge guardar, no pierde nada y sigue al volver', async () => {
  const { ctx, abrir } = await dispositivo();
  let p = await abrir();
  await dentro(p);
  await pulsar(p, 'allo-exp');
  await subido('ana', 'allo-exp', 1);
  await caer(ctx);
  await pulsar(p, 'carno-exp');
  await hasta(async () => (await guardado(p)).subidas?.['carno-exp'] === 1, 'lo pendiente guardado en el navegador');
  await p.close();

  sinServicio = true;
  const pedidas = [];
  ctx.on('request', r => { if (!r.url().startsWith(URL_WEB)) pedidas.push(r.url()); });
  p = await abrir();
  const estado = await texto(p, '[data-estado]');
  assert.match(estado, /aún no están disponibles/, `dice «${estado}»`);
  assert.equal(await visible(p, '[data-dentro]'), false, 'sigue enseñando una cuenta que ya no existe');
  assert.equal(await visible(p, '[data-entrar]'), false);
  assert.equal(await pulsado(p, 'allo-exp'), 'true');
  assert.equal(await pulsado(p, 'carno-exp'), 'true');
  await pulsar(p, 'dryo-exp');
  await p.reload();
  assert.equal(await pulsado(p, 'dryo-exp'), 'true', 'lo marcado sin servicio se guarda en el navegador');
  assert.deepEqual(pedidas, [], 'no habla con un servicio que la web ya no declara');
  await p.close();

  sinServicio = false;
  await volver(ctx);
  p = await abrir();
  await subido('ana', 'carno-exp', 1);
  await subido('ana', 'dryo-exp', 1);
  await ctx.close();
  assert.deepEqual(errores, []);
});

test('sin JavaScript se lee todo y nada finge funcionar', async () => {
  const { ctx, abrir } = await dispositivo({ javaScriptEnabled: false });
  const p = await abrir();
  assert.ok(await p.locator('.sesiones > li').count() > 10);
  assert.ok(await p.locator('.logro').count() > 100);
  assert.equal(await p.locator('button.tramo:not([disabled])').count(), 0);
  assert.match(await texto(p, '#tu-cuenta noscript, #tu-cuenta .ruta-aviso'), /JavaScript/);
  assert.equal(await p.locator('[data-entrar]').isVisible(), false);
  assert.equal(await p.locator('[data-filtros]').isVisible(), false);
  await ctx.close();
});

test('entrar: sabe quién eres, guarda en tu cuenta y otro dispositivo lo ve', async () => {
  const movil = await dispositivo({ ancho: 375, alto: 812 });
  const p = await movil.abrir();
  assert.equal(await visible(p, '[data-entrar]'), true);
  assert.match(await texto(p, '[data-fuera]'), /Solo miembros/);
  await capturar(p, 'es-375-fuera');
  await dentro(p);
  assert.equal(await texto(p, '[data-nombre-miembro]'), 'Ana del clan');
  assert.ok(!p.url().includes('entrada='), 'el código de entrada no se queda en la barra de direcciones');
  await pulsar(p, 'allo-exp');
  await pulsar(p, 'allo-grow', 3);
  await subido('ana', 'allo-exp', 1);
  await subido('ana', 'allo-grow', 3);
  await hasta(async () => /Guardado en tu cuenta/.test(await texto(p, '[data-estado]')), 'el estado guardado');
  await capturar(p, 'es-375-dentro');

  const local = await guardado(p);
  assert.ok(local.token, 'la sesión queda en el navegador');
  assert.ok(!JSON.stringify(local).includes('tokendiscord-'), 'el token de Discord no llega a la página');

  await p.reload();
  assert.equal(await pulsado(p, 'allo-grow', 3), 'true');
  assert.equal(await visible(p, '[data-dentro]'), true);

  const pc = await dispositivo();
  const q = await pc.abrir();
  assert.equal(await pulsado(q, 'allo-exp'), 'false');
  await dentro(q);
  await hasta(async () => await pulsado(q, 'allo-grow', 3) === 'true', 'lo marcado en el otro dispositivo');
  assert.equal(await pulsado(q, 'allo-grow', 4), 'false');
  await capturar(q, 'es-1366-dentro');
  assert.match(await texto(q, '[data-trayectoria]'), /Allosaurus · Crecer 80%/, 'la trayectoria dice qué logro es');
  await capturar(q, 'es-1366-ruta', '[data-sesion].sesion-actual');
  await capturar(p, 'es-375-logros', '.ruta-grupo[data-bloque="allo"]');
  await movil.ctx.close();
  await pc.ctx.close();
  assert.deepEqual(errores, []);
});

test('en inglés: vuelve a la página en inglés y habla inglés', async () => {
  const { ctx, abrir } = await dispositivo({ ancho: 375, alto: 812 });
  const p = await abrir('/en/route/');
  assert.match(await texto(p, '[data-fuera]'), /Clan server members only/);
  await capturar(p, 'en-375-fuera');
  await entrar(p);
  await p.locator('[data-dentro]').waitFor({ state: 'visible' });
  assert.ok(p.url().endsWith('/en/route/'));
  assert.match(await texto(p, '[data-estado]'), /account/);
  await pulsar(p, 'allo-exp');
  await subido('ana', 'allo-exp', 1);
  await p.reload();
  assert.equal(await pulsado(p, 'allo-exp'), 'true');
  assert.equal(await p.locator('.ruta-grupo[data-bloque="allo"] [data-contador]').innerText(), '1/17');
  await capturar(p, 'en-375-dentro');
  await capturar(p, 'en-375-ruta', '#the-route');
  const q = await (await dispositivo()).abrir('/en/route/');
  discord.quien = 'ajena';
  await entrar(q, 'ajena');
  await hasta(() => visible(q, '[data-mensaje]'), 'el aviso');
  assert.match(await texto(q, '[data-mensaje]'), /Only members/);
  await capturar(q, 'en-1366-no-miembro');
  await capturar(q, 'en-1366-logros', '#all-achievements');
  await q.context().close();
  await ctx.close();
  assert.deepEqual(errores, []);
});

test('no miembro: se lo dice, no entra y no queda nada suyo', async () => {
  const { ctx, abrir } = await dispositivo();
  const p = await abrir();
  await entrar(p, 'ajena');
  await hasta(() => visible(p, '[data-mensaje]'), 'el aviso');
  assert.match(await texto(p, '[data-mensaje]'), /Solo pueden entrar los miembros/);
  assert.equal(await visible(p, '[data-dentro]'), false);
  assert.deepEqual((await s.todo()).miembros, []);
  assert.ok(!p.url().includes('error='));
  await ctx.close();
});

test('Discord caído: lo dice sin culpar a quien entra', async () => {
  const { ctx, abrir } = await dispositivo();
  const p = await abrir();
  discord.fallo.miembro = 500;
  await entrar(p);
  await hasta(() => visible(p, '[data-mensaje]'), 'el aviso');
  assert.match(await texto(p, '[data-mensaje]'), /Discord no responde/);
  await ctx.close();
});

test('dos miembros a la vez: cada uno ve lo suyo y ninguno pisa al otro', async () => {
  const una = await dispositivo();
  const otra = await dispositivo();
  const a = await una.abrir();
  const b = await otra.abrir('/en/route/');
  await dentro(a, 'ana');
  await dentro(b, 'bea');
  await pulsar(a, 'addict', 3);
  await pulsar(b, 'addict', 1);
  await pulsar(b, 'carno-exp');
  await subido('ana', 'addict', 3);
  await subido('bea', 'carno-exp', 1);
  await pulsar(a, 'addict', 1);
  await hasta(async () => (await filasDe('ana')).length === 1, 'bajar lo de Ana');
  await a.reload();
  await b.reload();
  await hasta(async () => (await texto(a, '[data-nombre-miembro]')) === 'Ana del clan', 'Ana');
  await hasta(async () => (await texto(b, '[data-nombre-miembro]')) === 'Bea', 'Bea');
  await hasta(async () => /account/.test(await texto(b, '[data-estado]')), 'leer la cuenta de Bea');
  assert.equal(await pulsado(a, 'carno-exp'), 'false');
  assert.equal(await pulsado(b, 'carno-exp'), 'true');
  assert.deepEqual((await filasDe('ana')).map(f => f.logro), ['addict']);
  assert.deepEqual((await filasDe('bea')).map(f => f.logro), ['addict', 'carno-exp']);
  await una.ctx.close();
  await otra.ctx.close();
  assert.deepEqual(errores, []);
});

test('si cambia la lista de logros, lo guardado sigue, no descuadra la página y se puede restaurar', async () => {
  const { ctx, abrir } = await dispositivo();
  const p = await abrir();
  await dentro(p);
  await pulsar(p, 'allo-exp');
  await subido('ana', 'allo-exp', 1);
  // Lo que deja un cambio de lista: un logro que ya no existe y otro con menos tramos que antes.
  const id = USUARIOS.ana.id;
  for (const [logro, nivel] of [['retirado-1', 1], ['allo-grow', 1], ['allo-grow', 2], ['allo-grow', 3], ['allo-grow', 4], ['allo-grow', 9]]) {
    await s.db.prepare("INSERT INTO progreso (discord_id, logro, nivel, fecha) VALUES (?1, ?2, ?3, '2026-01-01')").bind(id, logro, nivel).run();
  }
  await p.reload();
  await hasta(async () => /Guardado en tu cuenta/.test(await texto(p, '[data-estado]')), 'leer la cuenta');
  await hasta(async () => /^5 de /.test(await texto(p, '[data-total]')), `contar solo lo que existe: ${await texto(p, '[data-total]')}`);
  assert.equal(await pulsado(p, 'allo-grow', 4), 'true');
  await pulsar(p, 'carno-exp');
  await subido('ana', 'carno-exp', 1);
  await pulsar(p, 'allo-exp');
  await hasta(async () => !(await filasDe('ana')).some(f => f.logro === 'allo-exp'), 'quitar una marca');
  const filas = await filasDe('ana');
  assert.ok(filas.some(f => f.logro === 'retirado-1'), 'lo retirado no se borra al guardar otra cosa');
  assert.ok(filas.some(f => f.logro === 'allo-grow' && f.nivel === 9), 'ni los tramos de más');
  const [descarga] = await Promise.all([p.waitForEvent('download'), p.click('[data-descargar]')]);
  assert.ok(JSON.parse(readFileSync(await descarga.path(), 'utf8')).progreso.some(f => f.logro === 'retirado-1'), 'y sale en la descarga');
  const copia = { formato: 'garra-copia-1', miembros: await s.filas('SELECT * FROM miembros'), progreso: await s.filas('SELECT * FROM progreso') };
  const antes = copia.progreso.length;
  await s.limpiar();
  for (const linea of sqlDeCopia(copia).trim().split('\n')) await s.db.exec(linea);
  assert.equal((await s.filas('SELECT * FROM progreso')).length, antes, 'y vuelve al restaurar');
  await ctx.close();
  assert.deepEqual(errores, []);
});

test('un nombre con código se enseña como texto y no se ejecuta', async () => {
  const { ctx, abrir } = await dispositivo();
  const p = await abrir();
  let dialogo = false;
  p.on('dialog', d => { dialogo = true; d.dismiss(); });
  await dentro(p, 'rara');
  assert.match(await texto(p, '[data-nombre-miembro]'), /<img src=x/);
  assert.equal(await p.locator('[data-nombre-miembro] img').count(), 0);
  assert.equal(dialogo, false);
  await ctx.close();
});

test('servicio caído al entrar: se queda en la página y lo dice', async () => {
  const { ctx, abrir } = await dispositivo();
  const p = await abrir();
  await caer(ctx);
  await p.click('[data-entrar]');
  await hasta(() => visible(p, '[data-mensaje]'), 'el aviso');
  assert.match(await texto(p, '[data-mensaje]'), /no está disponible/);
  assert.ok(p.url().startsWith(URL_WEB));
  await ctx.close();
});

test('servicio caído con sesión: lo marcado no se pierde, se dice y sube solo al volver', async () => {
  const { ctx, abrir } = await dispositivo();
  const p = await abrir();
  await dentro(p);
  await caer(ctx);
  await pulsar(p, 'allo-prime');
  await hasta(async () => /Sin conexión.*pendientes de subir: 1/.test(await texto(p, '[data-estado]')), 'el aviso de que no se ha guardado');
  await capturar(p, 'es-1366-caido');
  await p.reload();
  assert.equal(await pulsado(p, 'allo-prime'), 'true');
  assert.equal(await visible(p, '[data-dentro]'), true);
  assert.equal(await texto(p, '[data-nombre-miembro]'), 'Ana del clan');
  await hasta(async () => /Sin conexión/.test(await texto(p, '[data-estado]')), 'el aviso tras recargar');
  assert.deepEqual(await filasDe('ana'), []);
  await volver(ctx);
  await avisar(p);
  await subido('ana', 'allo-prime', 1);
  await hasta(async () => /Guardado en tu cuenta/.test(await texto(p, '[data-estado]')), 'el estado guardado');
  assert.deepEqual((await guardado(p)).subidas, {});
  await ctx.close();
});

test('leer del servicio no pisa lo que aún no ha subido, ni al marcar ni al desmarcar', async () => {
  const { ctx, abrir } = await dispositivo();
  let p = await abrir();
  await dentro(p);
  await pulsar(p, 'carno-exp');
  await subido('ana', 'carno-exp', 1);
  await ctx.route(`${URL_API}/yo/progreso`, r => r.abort());
  await pulsar(p, 'allo-prime');
  await pulsar(p, 'carno-exp');
  await hasta(async () => /Sin conexión/.test(await texto(p, '[data-estado]')), 'el aviso');
  await p.close();
  p = await abrir();
  await hasta(async () => /Ana del clan/.test(await texto(p, '[data-nombre-miembro]')), 'leer la cuenta');
  await new Promise(r => { setTimeout(r, 500); });
  assert.equal(await pulsado(p, 'allo-prime'), 'true');
  assert.equal(await pulsado(p, 'carno-exp'), 'false');
  await ctx.unroute(`${URL_API}/yo/progreso`);
  await avisar(p);
  await subido('ana', 'allo-prime', 1);
  await hasta(async () => !(await filasDe('ana')).some(f => f.logro === 'carno-exp'), 'quitar la marca');
  await ctx.close();
});

test('bajar y volver a subir sin conexión deja lo último que marcaste', async () => {
  const { ctx, abrir } = await dispositivo();
  const p = await abrir();
  await dentro(p);
  await pulsar(p, 'addict', 3);
  await subido('ana', 'addict', 3);
  await caer(ctx);
  await pulsar(p, 'addict', 1);
  await pulsar(p, 'addict', 2);
  await hasta(async () => /Sin conexión/.test(await texto(p, '[data-estado]')), 'el aviso');
  await volver(ctx);
  await avisar(p);
  await hasta(async () => (await filasDe('ana')).length === 2, 'quedarse en 2');
  await p.reload();
  await hasta(async () => /Guardado en tu cuenta/.test(await texto(p, '[data-estado]')), 'leer la cuenta');
  assert.equal(await pulsado(p, 'addict', 2), 'true');
  assert.equal(await pulsado(p, 'addict', 3), 'false');
  await ctx.close();
});

test('bajar y volver a subir sin poder guardar: al recargar sigue lo último que marcaste', async () => {
  const { ctx, abrir } = await dispositivo();
  const p = await abrir();
  await dentro(p);
  await pulsar(p, 'addict', 3);
  await subido('ana', 'addict', 3);
  let intentos = 0;
  await ctx.route(`${URL_API}/yo/progreso`, r => {
    if (r.request().method() === 'PUT') intentos++;
    return r.abort();
  });
  await pulsar(p, 'addict', 1);
  await pulsar(p, 'addict', 2);
  await hasta(async () => /Sin conexión/.test(await texto(p, '[data-estado]')), 'el aviso');
  await p.reload();
  const antes = intentos;
  await hasta(async () => intentos > antes, 'leer la cuenta e intentar subir');
  assert.equal(await pulsado(p, 'addict', 2), 'true');
  assert.equal(await pulsado(p, 'addict', 3), 'false');
  await ctx.close();
});

test('una lectura lenta no borra lo que se acaba de guardar', async () => {
  const { ctx, abrir } = await dispositivo();
  let p = await abrir();
  await dentro(p);
  let soltar;
  const espera = new Promise(r => { soltar = r; });
  await ctx.route(`${URL_API}/yo`, async r => {
    if (r.request().method() !== 'GET') return r.fallback();
    // La foto de los datos se hace ahora; llega al navegador después.
    const respuesta = await r.fetch();
    await espera;
    return r.fulfill({ response: respuesta });
  });
  await p.close();
  p = await abrir();
  await pulsar(p, 'allo-exp');
  await subido('ana', 'allo-exp', 1);
  await hasta(async () => Object.keys((await guardado(p)).subidas).length === 0, 'el acuse');
  soltar();
  await hasta(async () => /Ana del clan/.test(await texto(p, '[data-nombre-miembro]')), 'la lectura');
  await new Promise(r => { setTimeout(r, 600); });
  assert.equal(await pulsado(p, 'allo-exp'), 'true');
  assert.equal((await guardado(p)).marcas['allo-exp'], 1);
  await ctx.close();
});

test('lo pendiente de una cuenta no sube a otra aunque falle la primera lectura', async () => {
  const { ctx, abrir } = await dispositivo();
  const p = await abrir();
  await dentro(p);
  await s.db.prepare('DELETE FROM sesiones').run();
  await pulsar(p, 'allo-prime');
  await hasta(async () => /caducado/.test(await texto(p, '[data-estado]')), 'la sesión caducada');
  await ctx.route(`${URL_API}/yo`, r => r.abort());
  await entrar(p, 'bea');
  await hasta(async () => /no responde|Sin conexión/.test(await texto(p, '[data-estado]')), 'el aviso');
  await avisar(p);
  await new Promise(r => { setTimeout(r, 1500); });
  assert.deepEqual(await filasDe('bea'), [], 'nada de la otra cuenta');
  await ctx.unroute(`${URL_API}/yo`);
  await p.reload();
  await hasta(() => visible(p, '[data-importar]'), 'la pregunta');
  assert.deepEqual(await filasDe('bea'), []);
  await ctx.close();
});

test('sin entrar, abrir la página y marcar no habla con el servicio', async () => {
  const { ctx, abrir } = await dispositivo();
  const pedidas = [];
  ctx.on('request', r => { if (r.url().startsWith(URL_API)) pedidas.push(r.url()); });
  const p = await abrir();
  await pulsar(p, 'allo-exp');
  await new Promise(r => { setTimeout(r, 800); });
  assert.deepEqual(pedidas, []);
  await ctx.close();
});

test('los reintentos no dependen de que el navegador avise', async () => {
  const { ctx, abrir } = await dispositivo();
  const p = await abrir();
  await dentro(p);
  await caer(ctx);
  await pulsar(p, 'allo-prime');
  await hasta(async () => /Sin conexión/.test(await texto(p, '[data-estado]')), 'el aviso');
  await volver(ctx);
  await hasta(async () => (await filasDe('ana')).length === 1, 'el reintento solo', 20000);
  await ctx.close();
});

test('sesión caducada: se dice, lo pendiente sigue y sube al volver a entrar', async () => {
  const { ctx, abrir } = await dispositivo();
  const p = await abrir();
  await dentro(p);
  await pulsar(p, 'allo-exp');
  await subido('ana', 'allo-exp', 1);
  await s.db.prepare('DELETE FROM sesiones').run();
  await pulsar(p, 'allo-prime');
  await hasta(async () => /Tu sesión ha caducado.*pendientes de subir: 1/.test(await texto(p, '[data-estado]')), 'el aviso');
  assert.equal(await visible(p, '[data-entrar]'), true);
  await p.reload();
  assert.equal(await pulsado(p, 'allo-prime'), 'true');
  assert.match(await texto(p, '[data-estado]'), /caducado/);
  await dentro(p);
  await subido('ana', 'allo-prime', 1);
  assert.equal(await pulsado(p, 'allo-exp'), 'true');
  await ctx.close();
});

test('quitar una marca también se guarda, y subir no pisa lo de otro dispositivo', async () => {
  const uno = await dispositivo();
  const p = await uno.abrir();
  await dentro(p);
  await pulsar(p, 'allo-grow', 2);
  await subido('ana', 'allo-grow', 2);
  await pulsar(p, 'allo-grow', 2);
  await hasta(async () => (await filasDe('ana')).length === 1, 'bajar a 1');
  await pulsar(p, 'allo-grow', 1);
  await hasta(async () => (await filasDe('ana')).length === 0, 'quitarla del todo');

  const dos = await dispositivo();
  const q = await dos.abrir();
  await dentro(q);
  await pulsar(q, 'allo-exp');
  await subido('ana', 'allo-exp', 1);
  await caer(uno.ctx);
  await pulsar(p, 'allo-prime');
  await hasta(async () => /Sin conexión/.test(await texto(p, '[data-estado]')), 'el aviso');
  await volver(uno.ctx);
  await avisar(p);
  await subido('ana', 'allo-prime', 1);
  assert.ok((await filasDe('ana')).some(f => f.logro === 'allo-exp'), 'sigue lo del otro dispositivo');

  // Lo mismo con un tramo más alto: lo que estaba sin subir aquí no baja lo que el otro dispositivo ya subió.
  await pulsar(q, 'carno-grow', 3);
  await subido('ana', 'carno-grow', 3);
  await caer(uno.ctx);
  await pulsar(p, 'carno-grow', 1);
  await hasta(async () => /Sin conexión/.test(await texto(p, '[data-estado]')), 'el aviso');
  await volver(uno.ctx);
  await avisar(p);
  await hasta(async () => /Guardado en tu cuenta/.test(await texto(p, '[data-estado]')), 'subirlo');
  assert.ok((await filasDe('ana')).some(f => f.logro === 'carno-grow' && f.nivel === 3), 'sigue el tramo más alto');
  await uno.ctx.close();
  await dos.ctx.close();
});

test('marcas sin cuenta al entrar: pregunta, y cerrar sin contestar no las pierde', async () => {
  const { ctx, abrir } = await dispositivo();
  let p = await abrir();
  await pulsar(p, 'allo-exp');
  await pulsar(p, 'carno-exp');
  await dentro(p);
  await hasta(() => visible(p, '[data-importar]'), 'la pregunta');
  assert.match(await texto(p, '[data-importar-texto]'), /no están en tu cuenta: 2/);
  assert.deepEqual(await filasDe('ana'), [], 'nada se sube a escondidas');
  await p.close();
  p = await abrir();
  await hasta(() => visible(p, '[data-importar]'), 'la pregunta tras recargar');
  await p.click('[data-importar-si]');
  await subido('ana', 'allo-exp', 1);
  await subido('ana', 'carno-exp', 1);
  await hasta(async () => !await visible(p, '[data-importar]'), 'cerrar la pregunta');
  await ctx.close();
});

test('si falla la primera lectura tras entrar, las marcas sin cuenta tampoco se pierden', async () => {
  const { ctx, abrir } = await dispositivo();
  const p = await abrir();
  await pulsar(p, 'allo-exp');
  await ctx.route(`${URL_API}/yo`, r => r.abort());
  await entrar(p);
  await hasta(async () => /no responde|Sin conexión/.test(await texto(p, '[data-estado]')), 'el aviso');
  assert.equal(await pulsado(p, 'allo-exp'), 'true');
  await ctx.unroute(`${URL_API}/yo`);
  await p.reload();
  await hasta(() => visible(p, '[data-importar]'), 'la pregunta');
  assert.match(await texto(p, '[data-importar-texto]'), /no están en tu cuenta: 1/);
  await p.click('[data-importar-si]');
  await subido('ana', 'allo-exp', 1);
  await ctx.close();
});

test('descartar las marcas sin cuenta no sube nada', async () => {
  const { ctx, abrir } = await dispositivo();
  const p = await abrir();
  await pulsar(p, 'allo-exp');
  await dentro(p);
  await hasta(() => visible(p, '[data-importar]'), 'la pregunta');
  await p.click('[data-importar-no]');
  await new Promise(r => { setTimeout(r, 800); });
  assert.deepEqual(await filasDe('ana'), []);
  assert.equal(await pulsado(p, 'allo-exp'), 'false');
  await ctx.close();
});

test('otra cuenta en el mismo navegador no hereda lo pendiente sin preguntar ni ve lo anterior', async () => {
  const { ctx, abrir } = await dispositivo();
  const p = await abrir();
  await dentro(p);
  await pulsar(p, 'allo-exp');
  await subido('ana', 'allo-exp', 1);
  await s.db.prepare('DELETE FROM sesiones').run();
  await pulsar(p, 'allo-prime');
  await hasta(async () => /caducado/.test(await texto(p, '[data-estado]')), 'la sesión caducada');
  await dentro(p, 'bea');
  assert.equal(await texto(p, '[data-nombre-miembro]'), 'Bea');
  await hasta(async () => await pulsado(p, 'allo-exp') === 'false', 'no ver lo de la otra cuenta');
  assert.equal(await pulsado(p, 'allo-prime'), 'false');
  await hasta(() => visible(p, '[data-importar]'), 'la pregunta');
  assert.deepEqual(await filasDe('bea'), []);
  await ctx.close();
});

test('traer el código de la ruta: añade, nunca quita, ignora lo que no existe y avisa', async () => {
  const { ctx, abrir } = await dispositivo();
  const p = await abrir();
  await dentro(p);
  await pulsar(p, 'allo-grow', 3);
  await subido('ana', 'allo-grow', 3);
  const codigo = `GR1.${Buffer.from(JSON.stringify({ 'allo-grow': 1, 'allo-exp': 1, 'ovi-exp': 1, 'inventado': 3, 'carno-grow': 99 })).toString('base64')}`;
  await p.fill('[data-codigo]', codigo);
  await p.click('[data-traer]');
  await subido('ana', 'allo-exp', 1);
  await subido('ana', 'ovi-exp', 1);
  assert.match(await texto(p, '[data-mensaje]'), /Marcas añadidas: 2.*ignoradas.*: 2/);
  assert.ok((await filasDe('ana')).some(f => f.logro === 'allo-grow' && f.nivel === 3), 'no baja lo que ya tenías');
  assert.ok(!(await filasDe('ana')).some(f => f.logro === 'inventado' || f.logro === 'carno-grow'));
  await p.fill('[data-codigo]', 'esto no es un código');
  await p.click('[data-traer]');
  assert.match(await texto(p, '[data-mensaje]'), /no vale/);
  assert.equal(await p.locator('[data-mensaje]').evaluate(e => e.children.length), 0);
  await ctx.close();
});

test('el código también funciona sin cuenta, y el tuyo se puede copiar y traer a otro navegador', async () => {
  const uno = await dispositivo({ permissions: ['clipboard-read', 'clipboard-write'] });
  const p = await uno.abrir();
  await pulsar(p, 'allo-exp');
  await p.click('[data-copiar-codigo]');
  await hasta(async () => /copiado/.test(await texto(p, '[data-mensaje]')), 'el aviso');
  const codigo = await p.evaluate(() => navigator.clipboard.readText());
  assert.ok(codigo.startsWith('GR1.'));
  const dos = await dispositivo();
  const q = await dos.abrir();
  await q.fill('[data-codigo]', codigo);
  await q.click('[data-traer]');
  assert.equal(await pulsado(q, 'allo-exp'), 'true');
  await uno.ctx.close();
  await dos.ctx.close();
});

test('descargar: un fichero con lo tuyo y nada de otro', async () => {
  const otra = await dispositivo();
  const o = await otra.abrir();
  await dentro(o, 'bea');
  await pulsar(o, 'carno-exp');
  await subido('bea', 'carno-exp', 1);
  const { ctx, abrir } = await dispositivo();
  const p = await abrir();
  await dentro(p);
  await pulsar(p, 'allo-exp');
  await subido('ana', 'allo-exp', 1);
  const [descarga] = await Promise.all([p.waitForEvent('download'), p.click('[data-descargar]')]);
  assert.equal(descarga.suggestedFilename(), 'garra-iberica-mis-datos.json');
  const datos = JSON.parse(readFileSync(await descarga.path(), 'utf8'));
  assert.equal(datos.cuenta.discord_id, USUARIOS.ana.id);
  assert.deepEqual(datos.progreso.map(f => f.logro), ['allo-exp']);
  assert.ok(!JSON.stringify(datos).includes('correo.prueba'));
  await ctx.close();
  await otra.ctx.close();
  assert.deepEqual(errores, []);
});

test('borrar: pide confirmación, borra en el servicio y en este navegador, y no toca a otro', async () => {
  const otra = await dispositivo();
  const o = await otra.abrir();
  await dentro(o, 'bea');
  await pulsar(o, 'carno-exp');
  await subido('bea', 'carno-exp', 1);
  const { ctx, abrir } = await dispositivo();
  const p = await abrir();
  await dentro(p);
  await pulsar(p, 'allo-exp');
  await subido('ana', 'allo-exp', 1);
  await p.click('[data-borrar]');
  await capturar(p, 'es-1366-borrar');
  await p.click('[data-borrar-no]');
  assert.equal((await filasDe('ana')).length, 1);
  await p.click('[data-borrar]');
  await p.click('[data-borrar-si]');
  await hasta(async () => (await filasDe('ana')).length === 0, 'el borrado');
  assert.deepEqual(await s.filas('SELECT * FROM miembros WHERE discord_id = ?1', USUARIOS.ana.id), []);
  assert.deepEqual(await s.filas('SELECT * FROM sesiones WHERE discord_id = ?1', USUARIOS.ana.id), []);
  await hasta(() => visible(p, '[data-entrar]'), 'volver a estar fuera');
  assert.match(await texto(p, '[data-mensaje]'), /se han borrado/);
  const local = await guardado(p);
  assert.equal(local.token, null);
  assert.deepEqual(local.marcas, {});
  assert.equal(await pulsado(p, 'allo-exp'), 'false');
  assert.equal((await filasDe('bea')).length, 1);
  await ctx.close();
  await otra.ctx.close();
});

test('si borrar falla, lo dice y no finge haberlo hecho', async () => {
  const { ctx, abrir } = await dispositivo();
  const p = await abrir();
  await dentro(p);
  await caer(ctx);
  await p.click('[data-borrar]');
  await p.click('[data-borrar-si]');
  await hasta(async () => /No se ha podido borrar/.test(await texto(p, '[data-mensaje]')), 'el aviso');
  assert.ok((await guardado(p)).token);
  await volver(ctx);

  // Y si responde con un error, igual.
  await ctx.route(`${URL_API}/yo/borrar`, r => (r.request().method() === 'POST'
    ? r.fulfill({ status: 503, headers: { 'access-control-allow-origin': URL_WEB }, body: '{}' })
    : r.fallback()));
  await p.evaluate(() => { document.querySelector('[data-mensaje]').hidden = true; });
  await p.click('[data-borrar]');
  await p.click('[data-borrar-si]');
  await hasta(() => visible(p, '[data-mensaje]'), 'el aviso');
  assert.match(await texto(p, '[data-mensaje]'), /No se ha podido borrar/);
  assert.ok((await guardado(p)).token);
  assert.equal((await s.filas('SELECT * FROM miembros WHERE discord_id = ?1', USUARIOS.ana.id)).length, 1);
  await ctx.close();
});

test('salir: avisa si queda algo sin subir, y después no deja nada en ese navegador', async () => {
  const { ctx, abrir } = await dispositivo();
  const p = await abrir();
  await dentro(p);
  await caer(ctx);
  await pulsar(p, 'allo-exp');
  await hasta(async () => /Sin conexión/.test(await texto(p, '[data-estado]')), 'el aviso');
  await p.click('[data-salir]');
  assert.match(await texto(p, '[data-mensaje]'), /Marcas sin guardar: 1/);
  assert.equal(await visible(p, '[data-dentro]'), true);
  await volver(ctx);
  await avisar(p);
  await subido('ana', 'allo-exp', 1);
  await p.click('[data-salir]');
  await hasta(() => visible(p, '[data-entrar]'), 'salir');
  await hasta(async () => (await s.todo()).sesiones.length === 0, 'la sesión borrada en el servicio');
  const local = await guardado(p);
  assert.equal(local.token, null);
  assert.deepEqual(local.marcas, {});
  await ctx.close();
});

test('salir en todos los dispositivos también avisa de lo que se perdería', async () => {
  const { ctx, abrir } = await dispositivo();
  const p = await abrir();
  await pulsar(p, 'allo-exp');
  await dentro(p);
  await hasta(() => visible(p, '[data-importar]'), 'la pregunta');
  await p.click('[data-salir-todos]');
  assert.match(await texto(p, '[data-mensaje]'), /Marcas sin guardar: 1/);
  assert.equal(await visible(p, '[data-dentro]'), true);
  assert.equal((await guardado(p)).porImportar['allo-exp'], 1);
  await p.click('[data-salir-todos]');
  await hasta(() => visible(p, '[data-entrar]'), 'salir');
  await ctx.close();
});

test('salir en todos los dispositivos corta también el otro', async () => {
  const uno = await dispositivo();
  const p = await uno.abrir();
  await dentro(p);
  const dos = await dispositivo();
  const q = await dos.abrir();
  await dentro(q);
  await q.click('[data-salir-todos]');
  await hasta(() => visible(q, '[data-entrar]'), 'salir');
  await p.reload();
  await hasta(async () => /caducado/.test(await texto(p, '[data-estado]')), 'el otro dispositivo sin sesión');
  await uno.ctx.close();
  await dos.ctx.close();
});

test('dos pestañas no se pisan lo marcado', async () => {
  const { ctx, abrir } = await dispositivo();
  const a = await abrir();
  const b = await abrir();
  await pulsar(a, 'allo-exp');
  await hasta(async () => await pulsado(b, 'allo-exp') === 'true', 'la otra pestaña');
  await pulsar(b, 'carno-exp');
  await hasta(async () => await pulsado(a, 'carno-exp') === 'true', 'la primera pestaña');
  const local = await guardado(a);
  assert.equal(local.marcas['allo-exp'], 1);
  assert.equal(local.marcas['carno-exp'], 1);
  await ctx.close();
});

test('un almacén corrupto no rompe la página ni cuela valores imposibles', async () => {
  const { ctx, abrir } = await dispositivo();
  const p = await abrir();
  await p.evaluate(() => localStorage.setItem('garra-ruta-v1', JSON.stringify({ marcas: { 'allo-exp': 99, inventado: 1, 'carno-exp': 1 }, token: 7 })));
  await p.reload();
  assert.equal(await pulsado(p, 'allo-exp'), 'false');
  assert.equal(await pulsado(p, 'carno-exp'), 'true');
  await p.evaluate(() => localStorage.setItem('garra-ruta-v1', '{no es json'));
  await p.reload();
  assert.equal(await visible(p, '[data-entrar]'), true);
  await ctx.close();
  assert.deepEqual(errores, []);
});

test('la copia del administrador: solo le sale a quien toca, por páginas, y se puede restaurar', async () => {
  const quien = await dispositivo();
  const o = await quien.abrir();
  await dentro(o);
  await pulsar(o, 'allo-exp');
  await subido('ana', 'allo-exp', 1);
  assert.equal(await visible(o, '[data-copia]'), false);
  const ids = Array.from({ length: 1100 }, (_, i) => String(200000000000000000n + BigInt(i)));
  await s.db.prepare(`INSERT INTO miembros (discord_id, nombre, desde, ultimo_acceso)
    SELECT j.value, 'O''Neil ' || j.key, '2026-11-05', '2026-11-05' FROM json_each(?1) j`).bind(JSON.stringify(ids)).run();
  const { ctx, abrir } = await dispositivo();
  const p = await abrir();
  await dentro(p, 'admin');
  await hasta(() => visible(p, '[data-copia]'), 'el botón de la copia');
  const [descarga] = await Promise.all([p.waitForEvent('download', { timeout: 30000 }), p.click('[data-copia]')]);
  const copia = JSON.parse(readFileSync(await descarga.path(), 'utf8'));
  assert.equal(copia.miembros.length, 1102);
  assert.deepEqual(copia.progreso.map(f => f.logro), ['allo-exp']);

  // Volver a cargarla en una base vacía deja lo mismo.
  const antes = await s.todo();
  await s.limpiar();
  for (const linea of sqlDeCopia(copia).trim().split('\n')) await s.db.exec(linea);
  const despues = await s.todo();
  assert.deepEqual(despues.miembros.sort((a, b) => a.discord_id.localeCompare(b.discord_id)), antes.miembros.sort((a, b) => a.discord_id.localeCompare(b.discord_id)));
  assert.deepEqual(despues.progreso, antes.progreso);
  await ctx.close();
  await quien.ctx.close();
});

test('la copia espera y sigue si el límite de peticiones la frena', async () => {
  const { ctx, abrir } = await dispositivo();
  const p = await abrir();
  await dentro(p, 'admin');
  await hasta(() => visible(p, '[data-copia]'), 'el botón');
  let frenadas = 0;
  await ctx.route(`${URL_API}/admin/copia**`, r => {
    if (r.request().method() !== 'GET' || frenadas++) return r.fallback();
    return r.fulfill({ status: 429, headers: { 'access-control-allow-origin': URL_WEB, 'access-control-expose-headers': 'Retry-After', 'retry-after': '1' }, body: '{}' });
  });
  const [descarga] = await Promise.all([p.waitForEvent('download', { timeout: 20000 }), p.click('[data-copia]')]);
  const copia = JSON.parse(readFileSync(await descarga.path(), 'utf8'));
  assert.equal(copia.miembros.length, 1);
  assert.ok(frenadas >= 2);
  await ctx.close();
});

test('la ruta: la sesión que toca sale abierta y salta lo hecho', async () => {
  const { ctx, abrir } = await dispositivo();
  const p = await abrir();
  const primera = p.locator('[data-sesion]').first();
  assert.ok(await primera.evaluate(e => e.classList.contains('sesion-actual') && e.querySelector('details').open));
  const tareas = await primera.locator('button[data-logro]').evaluateAll(l => l.map(b => [b.dataset.logro, b.dataset.nivel]));
  for (const [logro, nivel] of tareas) await primera.locator(`button[data-logro="${logro}"][data-nivel="${nivel}"]`).click();
  assert.ok(await primera.evaluate(e => e.classList.contains('sesion-hecha')));
  assert.ok(await p.locator('[data-sesion]').nth(1).evaluate(e => e.classList.contains('sesion-actual') && e.querySelector('details').open));
  await capturar(p, 'es-1366-sin-cuenta');
  await ctx.close();
});

test('los filtros enseñan lo que dicen', async () => {
  const { ctx, abrir } = await dispositivo();
  const p = await abrir();
  await p.click('.ruta-filtro[data-filtro="H"]');
  assert.equal(await p.locator('.ruta-grupo[data-bloque="allo"]').isVisible(), false);
  await p.click('.ruta-filtro[data-filtro="C"]');
  assert.equal(await p.locator('.ruta-grupo[data-bloque="allo"]').isVisible(), true);
  await p.click('.ruta-filtro[data-filtro="todos"]');
  await pulsar(p, 'addict', 7);
  await pulsar(p, 'allo-exp');
  await p.click('.ruta-filtro[data-pendientes]');
  assert.equal(await p.locator('.ruta-grupo[data-bloque="horas"]').isVisible(), false);
  assert.equal(await p.locator('[data-fila="allo-exp"]').isVisible(), false);
  assert.equal(await p.locator('[data-fila="allo-grow"]').isVisible(), true);
  await ctx.close();
});

test('lo oculto no se enseña, pero se guarda', async () => {
  const { ctx, abrir } = await dispositivo();
  const p = await abrir();
  assert.equal(await p.locator('[data-fila^="ovi-"], button[data-logro^="ovi-"], button[data-logro="fed-ovi"]').count(), 0);
  assert.ok(!(await p.content()).toLowerCase().includes('oviraptor'));
  await dentro(p);
  await p.fill('[data-codigo]', `GR1.${Buffer.from(JSON.stringify({ 'ovi-grow': 4 })).toString('base64')}`);
  await p.click('[data-traer]');
  await subido('ana', 'ovi-grow', 4);
  await ctx.close();
});

test('en la dirección antigua la página no lee, no guarda y no canjea nada', async () => {
  const { ctx } = await dispositivo();
  const ANTIGUA = 'https://mmortexx.github.io';
  await ctx.route(`${ANTIGUA}/**`, async q => q.fulfill({ response: await q.fetch({ url: q.request().url().replace(`${ANTIGUA}/garra-iberica`, URL_WEB) }) }));
  // efectos.js llevaría a la dirección nueva antes de que ruta.js hiciera nada: aquí se prueba solo ruta.js.
  await ctx.route(/efectos\.js/, q => q.abort());
  const sesion = JSON.stringify({ marcas: {}, cuenta: '1', nombre: 'Ana', token: 'x'.repeat(40), tokenDe: '1', caduca: Date.now() + 1e7 });
  const alServicio = [];
  ctx.on('request', q => { if (q.url().startsWith(URL_API)) alServicio.push(`${q.method()} ${q.url()}`); });
  const p = await ctx.newPage();
  await p.addInitScript(valor => { if (!localStorage.getItem('garra-ruta-v1')) localStorage.setItem('garra-ruta-v1', valor); }, sesion);
  for (const hash of ['', `#entrada=${'a'.repeat(30)}`]) {
    await p.goto(`${ANTIGUA}/garra-iberica/ruta/${hash}`, { waitUntil: 'load' });
    await p.waitForTimeout(1500);
    assert.ok(await p.evaluate(() => performance.getEntriesByType('resource').some(e => /ruta\.js/.test(e.name))), 'ruta.js se ha cargado');
    assert.deepEqual(alServicio, [], `no habla con el servicio${hash ? ' ni canjea la entrada' : ' con la sesión guardada'}`);
    assert.equal(await p.evaluate(() => localStorage.getItem('garra-ruta-v1')), sesion, 'no toca lo guardado');
    assert.equal(await p.evaluate(() => location.hash), hash, 'no gasta el código de entrada');
  }
  await ctx.close();
});

test('si el servicio rechaza lo nuevo: se avisa bien, se conserva, no se reintenta sin parar y sube cuando lo acepta', async () => {
  const { ctx, abrir } = await dispositivo();
  const p = await abrir();
  await dentro(p);
  let puts = 0;
  await ctx.route(`${URL_API}/yo/progreso`, async q => {
    if (q.request().method() !== 'PUT') return q.continue();
    puts++;
    return q.fulfill({
      status: 200, contentType: 'application/json',
      headers: { 'access-control-allow-origin': URL_WEB },
      body: JSON.stringify({ aplicados: 0, rechazados: [{ logro: 'allo-exp', motivo: 'desconocido' }] }),
    });
  });
  await pulsar(p, 'allo-exp');
  await hasta(async () => /no acepta 1 marcas/.test(await texto(p, '[data-mensaje]')), 'el aviso de lo rechazado');
  assert.ok(!/ya no están en la lista/.test(await texto(p, '[data-mensaje]')), 'el aviso no miente');
  assert.deepEqual((await guardado(p)).subidas, { 'allo-exp': 1 }, 'sigue pendiente');
  assert.equal(await pulsado(p, 'allo-exp'), 'true');
  const antes = puts;
  await p.waitForTimeout(2500);
  assert.equal(puts, antes, 'no se reintenta sin parar');
  assert.deepEqual(await filasDe('ana'), []);
  await ctx.unroute(`${URL_API}/yo/progreso`);
  await p.reload();
  await subido('ana', 'allo-exp', 1);
  assert.deepEqual((await guardado(p)).subidas, {});
  await ctx.close();
  assert.deepEqual(errores, []);
});

test('lo guardado y los códigos de antes, con los ids por posición, siguen valiendo', async () => {
  const { ctx, abrir } = await dispositivo();
  const antes = { marcas: { 'allo-h0': 3, 'fed-0': 2, 'rex-h1': 1 }, subidas: {}, bajadas: {}, porImportar: {}, cuenta: null, nombre: '', token: null, tokenDe: null, caduca: 0 };
  const p = await ctx.newPage();
  await p.addInitScript(valor => { if (!localStorage.getItem('garra-ruta-v1')) localStorage.setItem('garra-ruta-v1', valor); }, JSON.stringify(antes));
  await p.goto(`${URL_WEB}/ruta/`, { waitUntil: 'load' });
  // allo-h0 era la cacería de herbívoros de Allosaurus; fed-0, la muerte por Tyrannosaurus; rex-h1, su cacería de carnívoros.
  assert.equal(await pulsado(p, 'allo-h-H', 3), 'true');
  assert.equal(await pulsado(p, 'allo-h-H', 4), 'false');
  assert.equal(await pulsado(p, 'fed-rex', 2), 'true');
  assert.equal(await pulsado(p, 'rex-h-C', 1), 'true');
  await pulsar(p, 'allo-exp');
  assert.deepEqual((await guardado(p)).marcas, { 'allo-h-H': 3, 'fed-rex': 2, 'rex-h-C': 1, 'allo-exp': 1 }, 'lo guardado vuelve a escribirse con los ids de ahora');

  const otro = await dispositivo();
  const q = await otro.abrir();
  const codigo = `GR1.${Buffer.from(JSON.stringify({ 'allo-h1': 9, 'dryo-h0': 1, 'allo-h0': 2 })).toString('base64')}`;
  await q.fill('[data-codigo]', codigo);
  await q.click('[data-traer]');
  assert.equal(await pulsado(q, 'allo-h-H', 2), 'true');
  assert.equal(await pulsado(q, 'allo-h-H', 3), 'false');
  assert.deepEqual(Object.keys((await guardado(q)).marcas), ['allo-h-H']);
  await ctx.close();
  await otro.ctx.close();
  assert.deepEqual(errores, []);
});

// ---------- la lista de Nexus ----------
const TEXTO_NEXUS = readFileSync(join(SERVICIO, '..', 'herramientas', 'nexus_muestra.json'), 'utf8');
const MUESTRA = JSON.parse(TEXTO_NEXUS);
const muestra = tocar => {
  const m = structuredClone(MUESTRA);
  tocar?.(m);
  return JSON.stringify(m);
};
const logroDe = (m, categoria, nombre) => m.achievements.find(x => x.category_path === categoria && x.name === nombre);
// Lo que se espera sale de los «done» de la muestra, sin pasar por la tabla de la página.
const hechos = x => x.conditions.filter(c => c.done).length;
const oculto = x => /Oviraptor/.test(`${x.category_path} ${x.name}`);
const TRAMOS_VISIBLES = MUESTRA.achievements.filter(x => !oculto(x)).reduce((a, x) => a + hechos(x), 0);
const TRAMOS_TODOS = MUESTRA.achievements.reduce((a, x) => a + hechos(x), 0);
const POR_NOMBRE = [
  ['g-F17-I', 'The Gatekeepers', 'Gate F17 I'], ['f-C14', 'In the footsteps of the creators', 'Visit site C14'],
  ['addict', 'Dino Addict', "It's addicting, isn't it ?"], ['trice-add', 'Herbivores / Triceratops', 'Trike addict'],
  ['troo-exp', 'Carnivores / Troodon', 'Explorer: Shallow Beach Island'], ['fed-rex', 'Fed to the food chain', 'Die to Tyrannosaurus'],
  ['fed-deino', 'Fed to the food chain', 'Die to Deinosuchus'], ['ovi-add', 'Carnivores / Oviraptor', 'Ovi addict'],
  ['beipi-h-C', 'Omnivores / Beipiaosaurus', 'Hunter: Carnivores'],
];
const CAJA = '[data-nexus-pegar]';
const dicho = p => texto(p, '[data-nexus-mensaje]:not([hidden])');
const marcas = async p => (await guardado(p))?.marcas ?? {};
const barra = p => p.locator('[data-barra]').evaluate(e => e.value);

// Lo que hace una persona: Ctrl+V de verdad, con lo copiado en el portapapeles.
async function pegarDeVerdad(p, contenido) {
  await p.evaluate(t => navigator.clipboard.writeText(t), contenido);
  await p.locator(CAJA).focus();
  await p.keyboard.press('Control+V');
}
// Más rápido, para probar muchos textos.
const pegar = (p, contenido) => p.locator(CAJA).evaluate((campo, t) => {
  const dt = new DataTransfer();
  dt.setData('text', t);
  campo.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
}, contenido);
const PORTAPAPELES = { permissions: ['clipboard-read', 'clipboard-write'] };

function apuntarPeticiones(ctx) {
  const lista = [];
  ctx.on('request', r => lista.push({ metodo: r.method(), url: r.url(), cuerpo: r.postData() ?? '' }));
  return lista;
}
function sinTextoPegado(peticiones) {
  for (const r of peticiones) {
    const todo = `${r.url} ${r.cuerpo}`;
    assert.ok(!/category_path|conditions|achievements|Asura 1|Die to Tyrannosaurus/.test(todo), `sale lo pegado en ${r.metodo} ${r.url}`);
    assert.ok(r.cuerpo.length < 20000, `${r.metodo} ${r.url} lleva ${r.cuerpo.length} caracteres`);
  }
}

test('nexus: sin cuenta, pegar la lista marca lo que toca, deja el recuadro vacío y no sale nada', async () => {
  const { ctx, abrir } = await dispositivo(PORTAPAPELES);
  const peticiones = apuntarPeticiones(ctx);
  const p = await abrir();
  assert.equal(await p.locator('[data-nexus-caja] a').getAttribute('href'), 'https://nexus.asura-theisle.com/achievements/api/list');
  assert.equal(await p.locator('[data-nexus-caja] a').getAttribute('rel'), 'noopener noreferrer');
  assert.equal(await p.locator('[data-nexus-caja] a').getAttribute('target'), '_blank');
  await capturar(p, 'nexus-antes', '[data-nexus-caja]');
  await pegarDeVerdad(p, TEXTO_NEXUS);
  assert.equal(await dicho(p), `Tramos añadidos: ${TRAMOS_VISIBLES}. Ya tenías: 0.`);
  assert.equal(await visible(p, '[data-nexus-mal]'), false, 'lo que ha salido bien no se presenta como error');
  assert.equal(await p.locator('[data-nexus-bien]').getAttribute('role'), 'status');
  await capturar(p, 'nexus-despues', '[data-nexus-caja]');
  assert.equal(await p.locator(CAJA).inputValue(), '');
  assert.equal(await barra(p), TRAMOS_VISIBLES, 'la barra suma lo mismo que dice el mensaje');
  const m = await marcas(p);
  for (const [id, categoria, nombre] of POR_NOMBRE) assert.equal(m[id] ?? 0, hechos(logroDe(MUESTRA, categoria, nombre)), id);
  assert.equal(m['carno-grow'], 2, 'el crecimiento de ejemplo de Carnotaurus va hasta el 50%');
  assert.equal(m['ovi-grow'], 3, 'lo oculto también se guarda');
  assert.equal(Object.values(m).reduce((a, b) => a + b, 0), TRAMOS_TODOS);
  assert.ok(!(await p.evaluate(() => JSON.stringify(localStorage))).includes('category_path'), 'lo pegado no se guarda');
  await p.reload();
  assert.equal(await pulsado(p, 'carno-grow', 2), 'true');
  assert.equal(await pulsado(p, 'carno-grow', 3), 'false');
  assert.equal(await pulsado(p, 'fed-rex', 1), 'true');
  // Marcar a mano sigue funcionando.
  await pulsar(p, 'allo-grow', 1);
  assert.equal((await marcas(p))['allo-grow'], 1);
  sinTextoPegado(peticiones);
  assert.deepEqual(peticiones.filter(r => r.metodo !== 'GET' || !r.url.startsWith(URL_WEB)), [], 'sin cuenta no se habla con nadie');
  await ctx.close();
  assert.deepEqual(errores, []);
});

test('nexus: con cuenta, un solo guardado, solo con marcas, y otro dispositivo lo ve', async () => {
  const { ctx, abrir } = await dispositivo(PORTAPAPELES);
  const peticiones = apuntarPeticiones(ctx);
  const p = await abrir();
  await dentro(p);
  await pulsar(p, 'fed-rex', 5);
  await subido('ana', 'fed-rex', 5);
  await hasta(async () => /Guardado en tu cuenta/.test(await texto(p, '[data-estado]')), 'guardado a mano');
  peticiones.length = 0;
  await pegarDeVerdad(p, TEXTO_NEXUS);
  await hasta(async () => (await filasDe('ana')).length === TRAMOS_TODOS + 4, 'todos los tramos en la cuenta');
  await new Promise(r => { setTimeout(r, 1000); });
  const guardados = peticiones.filter(r => r.metodo === 'PUT');
  assert.equal(guardados.length, 1, 'una importación es un solo guardado');
  const { cambios, modo } = JSON.parse(guardados[0].cuerpo);
  assert.equal(modo, 'subir', 'importar nunca fija hacia abajo');
  assert.deepEqual([...new Set(cambios.flatMap(c => Object.keys(c)))].sort(), ['logro', 'nivel']);
  assert.ok(cambios.length <= 500);
  sinTextoPegado(peticiones);
  assert.ok((await filasDe('ana')).some(f => f.logro === 'fed-rex' && f.nivel === 5), 'lo marcado de más sigue');
  await hasta(async () => /Guardado en tu cuenta/.test(await texto(p, '[data-estado]')), 'dice que ha guardado');
  // Pegarla otra vez no añade nada ni gasta escrituras.
  peticiones.length = 0;
  await pegar(p, TEXTO_NEXUS);
  assert.match(await dicho(p), /^Tramos añadidos: 0\./);
  await new Promise(r => { setTimeout(r, 800); });
  assert.deepEqual(peticiones.filter(r => r.metodo === 'PUT'), [], 'sin nada nuevo no se escribe');

  const otro = await dispositivo();
  const q = await otro.abrir();
  await dentro(q);
  await hasta(async () => (await pulsado(q, 'carno-grow', 2)) === 'true', 'otro dispositivo lo ve');
  await otro.ctx.close();
  await ctx.close();
  assert.deepEqual(errores, []);
});

test('nexus: con el servicio caído lo importado no se pierde y sube al volver', async () => {
  const { ctx, abrir } = await dispositivo();
  const p = await abrir();
  await dentro(p);
  await caer(ctx);
  await pegar(p, TEXTO_NEXUS);
  assert.match(await dicho(p), /^Tramos añadidos: /);
  await hasta(async () => /Sin conexión/.test(await texto(p, '[data-estado]')), 'el aviso');
  await volver(ctx);
  await avisar(p);
  await hasta(async () => (await filasDe('ana')).length === TRAMOS_TODOS, 'lo importado en la cuenta');
  await ctx.close();
});

test('nexus: nunca quita marcas y cuenta lo que ya tenías', async () => {
  const { ctx, abrir } = await dispositivo();
  const p = await abrir();
  await pulsar(p, 'allo-grow', 4);
  await pulsar(p, 'fed-rex', 5);
  await pulsar(p, 'fed-deino', 2);
  assert.equal(hechos(logroDe(MUESTRA, 'Fed to the food chain', 'Die to Tyrannosaurus')), 1, 'la muestra tiene menos que lo marcado a mano');
  assert.equal(hechos(logroDe(MUESTRA, 'Carnivores / Allosaurus', 'Growth 1%')), 0, 'la muestra no tiene lo marcado a mano');
  assert.equal(hechos(logroDe(MUESTRA, 'Fed to the food chain', 'Die to Deinosuchus')), 5, 'la muestra tiene más que lo marcado a mano');
  await pegar(p, TEXTO_NEXUS);
  assert.equal(await dicho(p), `Tramos añadidos: ${TRAMOS_VISIBLES - 3}. Ya tenías: 3.`);
  const m = await marcas(p);
  assert.equal(m['allo-grow'], 4);
  assert.equal(m['fed-rex'], 5);
  assert.equal(m['fed-deino'], 5, 'lo que Nexus tiene de más se añade');
  await pegar(p, TEXTO_NEXUS);
  assert.equal(await dicho(p), `Tramos añadidos: 0. Ya tenías: ${TRAMOS_VISIBLES}.`);
  await ctx.close();
  assert.deepEqual(errores, []);
});

test('nexus: cada mensaje de error, en los dos idiomas, sin marcar nada', async () => {
  const mitad = Math.floor(TEXTO_NEXUS.length / 2);
  const casos = [
    ['vacío', '   \n ', /nada que leer/, /nothing to read/],
    ['portada en HTML', '<!doctype html><html><head><style>a{b:c}</style></head><body>Nexus</body></html>', /no es tu lista.*Entra en Nexus/, /not your achievements list.*Sign in/],
    ['portada copiada como texto', 'Asura Nexus\nInicio\nEntrar con Steam', /no es tu lista/, /not your achievements list/],
    ['sin haber entrado', '{"error": "Unauthorized"}', /no has entrado/, /not signed in/],
    ['el resumen que copia Firefox', '\t\r\nserver\t{ id: 1, name: "Asura 1", enabled: true }\r\nsnapshot_seconds\t0\r\nsummary\t{ total: 253, done: 126, collected: 126, … }\r\n', /Firefox.*Raw Data/, /Firefox.*Raw Data/],
    ['cortada', TEXTO_NEXUS.slice(0, mitad), /cortada/, /cut off/],
    ['cortada justo tras una llave', TEXTO_NEXUS.slice(0, TEXTO_NEXUS.lastIndexOf('}', mitad) + 1), /cortada/, /cut off/],
    ['JSON roto', TEXTO_NEXUS.replace('"achievements"', '"achievements" oops'), /dañada/, /damaged/],
    ['otra forma: sin logros', '{"server": {"id": 1, "name": "Asura 1"}, "items": []}', /forma.*No se ha marcado/, /shape.*Nothing has been ticked/],
    ['otra forma: lista vacía', '{"server": {"id": 1, "name": "Asura 1"}, "achievements": []}', /forma/, /shape/],
    ['otra forma: sin servidor', muestra(m => { delete m.server; }), /forma/, /shape/],
    ['otra forma: ningún logro conocido', muestra(m => { for (const x of m.achievements) x.name = `${x.name} 2`; }), /forma/, /shape/],
    ['otra forma: cambian los campos de todos', muestra(m => { for (const x of m.achievements) x.conditions = 'x'; }), /forma/, /shape/],
    ['otro servidor', muestra(m => { m.server.name = 'Asura 2'; m.server.id = 2; }), /otro servidor.*Asura 1.*No se ha marcado/, /another Nexus server.*Asura 1.*Nothing has been ticked/],
    ['demasiado grande, aunque sea válido', TEXTO_NEXUS.replace('{', `{${' '.repeat(2000001)}`), /demasiado texto/, /too much text/],
  ];
  const { ctx, abrir } = await dispositivo();
  for (const [ruta, indice] of [['/ruta/', 2], ['/en/route/', 3]]) {
    const p = await abrir(ruta);
    await pulsar(p, 'allo-exp');
    for (const caso of casos) {
      await pegar(p, caso[1]);
      assert.match(await dicho(p), caso[indice], `${ruta} ${caso[0]}`);
      // El error se distingue sin color: rótulo escrito, otra forma y aviso inmediato al lector de pantalla.
      assert.match(await p.locator('[data-nexus-mal]').innerText(), /^Error: /, `${ruta} ${caso[0]}: sin rótulo de error`);
      assert.equal(await visible(p, '[data-nexus-bien]'), false, `${ruta} ${caso[0]}: se presenta como un éxito`);
      assert.equal(await p.locator('[data-nexus-mal]').getAttribute('role'), 'alert');
      assert.deepEqual(await marcas(p), { 'allo-exp': 1 }, `${ruta} ${caso[0]}: no se marca nada`);
      assert.equal(await p.locator(CAJA).inputValue(), '', `${ruta} ${caso[0]}: el recuadro queda vacío`);
    }
    const borde = sel => p.locator(sel).evaluate(e => parseFloat(getComputedStyle(e).borderLeftWidth));
    assert.ok(await borde('[data-nexus-mal]') >= 4, 'el error tiene su propia forma, no solo otro color');
    await p.locator(CAJA).fill('');
    await pulsar(p, 'allo-exp');
    await p.close();
  }
  const q = await abrir();
  await pegar(q, TEXTO_NEXUS);
  assert.ok(await q.locator('[data-nexus-bien]').evaluate(e => parseFloat(getComputedStyle(e).borderLeftWidth)) < 2, 'un éxito no lleva la forma del error');
  await pegar(q, '{"error": "Unauthorized"}');
  assert.match(await dicho(q), /^Error: Nexus dice que no has entrado/);
  assert.equal(await visible(q, '[data-nexus-bien]'), false, 'el éxito anterior no se queda al lado del error');
  const tinte = sel => q.locator(sel).evaluate(e => getComputedStyle(e).borderLeftColor.match(/\d+/g).slice(0, 3).join());
  assert.notEqual(await tinte('[data-nexus-mal]'), await tinte('[data-nexus-bien]'), 'con color, el error tampoco se confunde con el éxito');
  await pegar(q, TEXTO_NEXUS);
  assert.equal(await visible(q, '[data-nexus-mal]'), false, 'el error anterior no se queda al lado del éxito');
  assert.match(await dicho(q), /^Tramos añadidos/);
  await ctx.close();
  assert.deepEqual(errores, []);
});

test('nexus: un texto mil veces mayor se rechaza sin colgar la página', async () => {
  const { ctx, abrir } = await dispositivo();
  const p = await abrir();
  const tarda = await p.locator(CAJA).evaluate(campo => {
    const dt = new DataTransfer();
    dt.setData('text', `{${'x'.repeat(50000000)}`);
    const antes = performance.now();
    campo.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
    return performance.now() - antes;
  });
  assert.ok(tarda < 1500, `tarda ${tarda} ms`);
  assert.match(await dicho(p), /demasiado texto/);
  await ctx.close();
});

test('nexus: lo desconocido y lo que no casa se cuenta, sin bloquear el resto, y solo como texto', async () => {
  const { ctx, abrir } = await dispositivo();
  const p = await abrir();
  const lista = muestra(m => {
    const malo = '<img src=x onerror="window.__malo=1">';
    m.achievements.push({ name: malo, category_path: 'Nuevo', conditions: [{ target: 1, done: true }] });
    m.achievements.push({ name: 'Otro nuevo', category_path: '__proto__', conditions: [{ target: 1, done: true }] });
    m.achievements.push({ name: 'constructor', category_path: 'toString', conditions: [] });
    m.achievements.push(null, 7, 'x');
    const distinto = logroDe(m, 'Fed to the food chain', 'Die to Deinosuchus');
    distinto.conditions[0].target += 1;
    const menos = logroDe(m, 'Fed to the food chain', 'Die to Allosaurus');
    menos.conditions.pop();
    const repetido = structuredClone(logroDe(m, 'Herbivores / Stegosaurus', 'Stego addict'));
    m.achievements.push(repetido);
    m.achievements.splice(m.achievements.indexOf(logroDe(m, 'The Gatekeepers', 'Gate C14')), 1);
  });
  const conClave = lista.replace('"achievements":[', '"__proto__":{"contaminado":1},"achievements":[{"__proto__":{"contaminado":1},"category_path":"x","name":"y"},');
  assert.notEqual(conClave, lista);
  await pegar(p, conClave);
  const mensaje = await dicho(p);
  assert.match(mensaje, /^Tramos añadidos: \d+\. Ya tenías: 0\. /);
  assert.match(mensaje, /que no conocemos: 8 \(y, <img src=x onerror="window\.__malo=1">, Otro nuevo, constructor, Stego addict\)/);
  assert.match(mensaje, /tramos distintos a los nuestros, sin marcar: 2 \(Die to Deinosuchus, Die to Allosaurus\)/);
  assert.match(mensaje, /no venían en tu lista: 1\./);
  const m = await marcas(p);
  assert.equal(m['fed-deino'], undefined, 'lo que no casa no se marca');
  assert.equal(m['fed-allo'], undefined, 'lo que no casa no se marca');
  assert.equal(m['carno-grow'], 2, 'el resto sí');
  assert.equal(await p.locator('img[src="x"]').count(), 0, 'no se pinta como HTML');
  assert.equal(await p.evaluate(() => window.__malo), undefined);
  assert.equal(await p.evaluate(() => ({}).contaminado), undefined);
  await ctx.close();
  assert.deepEqual(errores, []);
});

test('nexus: se decide por los done de cada tramo, y un hueco no se salta', async () => {
  const { ctx, abrir } = await dispositivo();
  const p = await abrir();
  await pegar(p, muestra(m => {
    for (const x of m.achievements) {
      for (const c of x.conditions) {
        c.done = false;
        c.collected = false;
        c.claimable = false;
      }
      x.state = 'locked';
    }
    // Desbloqueado y sin cobrar: cuenta. Cobrado sin estar hecho (no debería existir): no cuenta.
    const sinCobrar = logroDe(m, 'Fed to the food chain', 'Die to Tyrannosaurus');
    sinCobrar.state = 'claimable';
    sinCobrar.tiers_ready = 2;
    sinCobrar.conditions[0].done = true;
    sinCobrar.conditions[0].claimable = true;
    sinCobrar.conditions[1].done = true;
    sinCobrar.conditions[1].claimable = true;
    const cobrado = logroDe(m, 'Fed to the food chain', 'Die to Deinosuchus');
    cobrado.state = 'collected';
    cobrado.conditions[0].collected = true;
    // Un tramo hecho sin los anteriores.
    logroDe(m, 'Carnivores / Allosaurus', 'Growth 1%').conditions[0].done = true;
    logroDe(m, 'Carnivores / Allosaurus', 'Growth 100%').conditions[0].done = true;
    logroDe(m, 'Fed to the food chain', 'Die to Stegosaurus').conditions[3].done = true;
  }));
  assert.deepEqual(await marcas(p), { 'allo-grow': 1, 'fed-rex': 2 });
  assert.match(await dicho(p), /^Tramos añadidos: 3\. Ya tenías: 0\. En 2 logros Nexus da por hecho un tramo sin los anteriores/);
  await ctx.close();
  assert.deepEqual(errores, []);
});

test('nexus: con todo hecho se marca toda la lista, oculto incluido; y sin nada, nada', async () => {
  const { ctx, abrir } = await dispositivo();
  const p = await abrir();
  const maximos = await p.locator('[data-miembro]').evaluate(e => JSON.parse(e.dataset.logros));
  await pegar(p, muestra(m => { for (const x of m.achievements) for (const c of x.conditions) c.done = false; }));
  assert.equal(await dicho(p), 'Tramos añadidos: 0. Ya tenías: 0.');
  assert.deepEqual(await marcas(p), {});
  await pegar(p, muestra(m => { for (const x of m.achievements) for (const c of x.conditions) c.done = true; }));
  assert.deepEqual(await marcas(p), maximos, 'los 253 de Nexus llegan a los 184 de la página, con todos sus tramos');
  const [hecho, total] = await p.locator('[data-barra]').evaluate(e => [e.value, e.max]);
  assert.equal(hecho, total);
  assert.equal(await dicho(p), `Tramos añadidos: ${total}. Ya tenías: 0.`);
  await ctx.close();
  assert.deepEqual(errores, []);
});

test('nexus: también vale con formato, con algo alrededor y con el botón', async () => {
  const { ctx, abrir } = await dispositivo();
  const p = await abrir();
  // La respuesta real pesa 468 KB, y 936 KB con sangría de 4: la muestra solo guarda lo que se lee, así que aquí se rellena hasta ese tamaño.
  const comoLaReal = JSON.stringify({
    ...MUESTRA, snapshot_seconds: 20, category_rewards: [{ rewards: [{ label: 'x' }] }],
    achievements: MUESTRA.achievements.map(x => ({
      id: 'x', description: 'x'.repeat(3000), state: 'locked', rewards: [{ label: 'x' }], ...x,
      conditions: x.conditions.map(c => ({ current: 0, collected: false, claimable: false, rewards: [], ...c })),
    })),
  }, null, 4);
  assert.ok(comoLaReal.length > 936000, `${comoLaReal.length} caracteres`);
  await pegar(p, comoLaReal);
  assert.match(await dicho(p), new RegExp(`^Tramos añadidos: ${TRAMOS_VISIBLES}\\.`), 'del tamaño de la real, con sangría y con campos que no se leen');
  await p.close();
  const otro = await dispositivo();
  const q = await otro.abrir();
  await pegar(q, `Pretty-print\r\n${TEXTO_NEXUS.replaceAll('\n', '\r\n')}\r\n\r\nFin`);
  assert.match(await dicho(q), new RegExp(`^Tramos añadidos: ${TRAMOS_VISIBLES}\\.`), 'con texto alrededor');
  await q.close();
  const tercero = await dispositivo();
  const r = await tercero.abrir();
  await r.locator(CAJA).fill(TEXTO_NEXUS);
  await r.click('[data-nexus-traer]');
  assert.match(await dicho(r), new RegExp(`^Tramos añadidos: ${TRAMOS_VISIBLES}\\.`), 'escrito y con el botón');
  assert.equal(await r.locator(CAJA).inputValue(), '');
  await r.locator(CAJA).fill('');
  await r.click('[data-nexus-traer]');
  assert.match(await dicho(r), /nada que leer/);
  await ctx.close();
  await otro.ctx.close();
  await tercero.ctx.close();
  assert.deepEqual(errores, []);
});

test('nexus: en inglés y sin servicio, funciona, habla inglés y no sale nada', async () => {
  sinServicio = true;
  const { ctx, abrir } = await dispositivo();
  const peticiones = apuntarPeticiones(ctx);
  const p = await abrir('/en/route/');
  assert.match(await p.locator('[data-nexus-caja] h3').innerText(), /Bring your achievements from Nexus/);
  await pegar(p, TEXTO_NEXUS);
  assert.equal(await dicho(p), `Steps added: ${TRAMOS_VISIBLES}. You already had: 0.`);
  assert.equal(await barra(p), TRAMOS_VISIBLES);
  await p.reload();
  assert.equal(await pulsado(p, 'carno-grow', 2), 'true');
  sinTextoPegado(peticiones);
  assert.deepEqual(peticiones.filter(r => r.metodo !== 'GET' || !r.url.startsWith(URL_WEB)), []);
  await ctx.close();
  assert.deepEqual(errores, []);
});

test('nexus: teclado, 375 px, impresión y sin JavaScript', async () => {
  const movil = await dispositivo({ ancho: 375, alto: 812 });
  const p = await movil.abrir();
  await p.locator('[data-nexus-caja] a').focus();
  await p.keyboard.press('Tab');
  assert.equal(await p.evaluate(() => document.activeElement.id), 'nexus-pegar');
  await p.keyboard.press('Tab');
  assert.equal(await p.evaluate(() => 'nexusTraer' in document.activeElement.dataset), true);
  await p.keyboard.press('Enter');
  assert.match(await dicho(p), /nada que leer/, 'el botón funciona con el teclado');
  await pegar(p, muestra(m => { m.achievements.push({ name: 'x'.repeat(500), category_path: 'y', conditions: [] }); }));
  const ancho = await p.evaluate(() => [document.documentElement.scrollWidth, innerWidth]);
  assert.ok(ancho[0] <= ancho[1], `la página se desborda a 375 px: ${ancho}`);
  for (const sel of ['[data-nexus-caja]', CAJA, '[data-nexus-bien]', '[data-nexus-traer]']) {
    const c = await p.locator(sel).boundingBox();
    assert.ok(c.x >= 0 && c.x + c.width <= 375, `${sel} se sale: ${JSON.stringify(c)}`);
  }
  assert.ok((await p.locator(CAJA).boundingBox()).height >= 44, 'el recuadro se puede pulsar con el dedo');
  await capturar(p, 'nexus-movil', '[data-nexus-caja]');
  assert.equal(await visible(p, '[data-nexus-caja]'), true);
  const tapado = q => q.evaluate(() => {
    document.querySelector('[data-nexus-caja]').scrollIntoView({ behavior: 'instant', block: 'start' });
    return document.querySelector('.barra').getBoundingClientRect().bottom - document.querySelector('[data-nexus-caja] h3').getBoundingClientRect().top;
  });
  assert.ok(await tapado(p) <= 0, 'a 375 px, la barra fija tapa el título de la caja');
  await p.emulateMedia({ media: 'print' });
  assert.equal(await visible(p, '[data-nexus-caja]'), false, 'al imprimir no sale');
  await movil.ctx.close();

  const grande = await dispositivo();
  const g = await grande.abrir();
  assert.ok(await tapado(g) <= 0, 'en escritorio, la barra fija tapa el título de la caja');
  await grande.ctx.close();

  const sinJs = await dispositivo({ javaScriptEnabled: false });
  const q = await sinJs.abrir();
  assert.equal(await visible(q, '[data-nexus-caja]'), false, 'sin JavaScript no finge funcionar');
  await sinJs.ctx.close();
  assert.deepEqual(errores, []);
});

