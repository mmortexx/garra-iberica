// El recorrido de verdad: la página de docs/ en un navegador, contra el servicio emulado y un Discord simulado.
// Web y servicio en sitios distintos, como al publicarlo. Uso: npm run recorrido (hace falta Playwright en la raíz).
// RUTA_JS: otro ruta.js, para ver las pruebas fallar. CAPTURAS: carpeta donde dejar capturas.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize, sep } from 'node:path';
import { after, before, beforeEach, test } from 'node:test';
import { chromium } from 'playwright';
import { sqlDeCopia } from '../scripts/restaurar.mjs';
import { SERVICIO, USUARIOS, arrancarDiscord, arrancarServicio } from './banco.mjs';

const DOCS = join(SERVICIO, '..', 'docs');
const CAPTURAS = process.env.CAPTURAS;
const TIPOS = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.webp': 'image/webp', '.woff2': 'font/woff2', '.ico': 'image/x-icon', '.png': 'image/png', '.jpg': 'image/jpeg' };

let navegador, discord, s, web, URL_WEB, URL_API;
let sinServicio = false;
const errores = [];

function servirDocs() {
  const servidor = createServer((req, res) => {
    const ruta = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    let fichero = normalize(join(DOCS, ruta));
    if (!fichero.startsWith(DOCS + sep)) { res.writeHead(403); res.end(); return; }
    if (ruta.endsWith('/')) fichero = join(fichero, 'index.html');
    if (ruta === '/ruta.js' && process.env.RUTA_JS) fichero = process.env.RUTA_JS;
    let cuerpo;
    try { cuerpo = readFileSync(fichero); } catch { res.writeHead(404); res.end(); return; }
    if (fichero.endsWith('index.html') && !sinServicio && cuerpo.includes('data-miembro')) {
      cuerpo = cuerpo.toString('utf8').replace('data-servicio=""', `data-servicio="${URL_API}"`).replace("connect-src 'self';", `connect-src 'self' ${URL_API};`);
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
  await s.limpiar();
});

// Un dispositivo: un navegador con su propio almacenamiento.
async function dispositivo({ ancho = 1366, alto = 900, ...resto } = {}) {
  const ctx = await navegador.newContext({ viewport: { width: ancho, height: alto }, acceptDownloads: true, ...resto });
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
  await capturar(p, 'en-375-fuera');
  await entrar(p);
  await p.locator('[data-dentro]').waitFor({ state: 'visible' });
  assert.ok(p.url().endsWith('/en/route/'));
  assert.match(await texto(p, '[data-estado]'), /account/);
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
  await p.click('.ruta-filtro[data-pendientes]');
  assert.equal(await p.locator('.ruta-grupo[data-bloque="horas"]').isVisible(), false);
  await ctx.close();
});

test('lo oculto no se enseña, pero se guarda', async () => {
  const { ctx, abrir } = await dispositivo();
  const p = await abrir();
  assert.equal(await p.locator('[data-fila^="ovi-"], button[data-logro^="ovi-"], button[data-logro="fed-13"]').count(), 0);
  assert.ok(!(await p.content()).toLowerCase().includes('oviraptor'));
  await dentro(p);
  await p.fill('[data-codigo]', `GR1.${Buffer.from(JSON.stringify({ 'ovi-grow': 4 })).toString('base64')}`);
  await p.click('[data-traer]');
  await subido('ana', 'ovi-grow', 4);
  await ctx.close();
});
