// Comportamiento del servicio, visto desde fuera: por HTTP, como lo ve la página o quien lo ataca.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { after, before, beforeEach, describe, test } from 'node:test';
import { unstable_readConfig } from 'wrangler';
import lista from '../../herramientas/logros.json' with { type: 'json' };
import congelados from '../../herramientas/logros_congelados.json' with { type: 'json' };
import { MAXIMOS, calcular } from '../src/catalogo.js';
import { leerBorrados, sqlBorrar, sqlExportar } from '../scripts/miembro.mjs';
import { sqlDeCopia } from '../scripts/restaurar.mjs';
import {
  CLAVE_CLIENTE, GUILD, ORIGEN, PAGINA_EN, PAGINA_ES, SERVICIO, USUARIOS, URL_SERVICIO, aleatorio, aplicarEsquema,
  arrancarDiscord, arrancarServicio, huella, retoDe,
} from './banco.mjs';

// SERVICIO_PROGRESO: otro progreso.js, para ver estas pruebas fallar con una guarda quitada (mutaciones.mjs).
const { aplicarCambios, TOPE_FILAS_DIA } = await import(pathToFileURL(process.env.SERVICIO_PROGRESO || join(SERVICIO, 'src/progreso.js')).href);
let discord, s;
before(async () => {
  discord = await arrancarDiscord();
  s = await arrancarServicio({ discord });
});
after(async () => {
  await s.parar();
  await discord.parar();
});
beforeEach(() => s.limpiar());

const destino = r => new URL(r.headers.get('location'));
const errorEn = r => new URLSearchParams(destino(r).hash.slice(1)).get('error');
const llamadasA = ruta => discord.llamadas.filter(l => l.ruta.includes(ruta));
const marcar = (token, cambios, modo) => s.pedir('/yo/progreso', { method: 'PUT', token, cuerpo: { cambios, ...(modo ? { modo } : {}) } });
const miProgreso = async token => (await (await s.pedir('/yo', { token })).json()).progreso;
const nivel = (filas, logro) => Math.max(0, ...filas.filter(f => f.logro === logro).map(f => f.nivel));

describe('entrar con Discord', () => {
  test('manda a Discord pidiendo solo saber quién es y su ficha en el servidor, con state y cookie segura', async () => {
    const r = await s.pedir(`/auth/discord?reto=${retoDe(aleatorio())}&idioma=es`, { origen: null });
    assert.equal(r.status, 302);
    const u = destino(r);
    assert.equal(u.origin + u.pathname, `${discord.url}/oauth2/authorize`);
    assert.equal(u.searchParams.get('scope'), 'identify guilds.members.read');
    assert.equal(u.searchParams.get('response_type'), 'code');
    assert.equal(u.searchParams.get('redirect_uri'), `${URL_SERVICIO}/auth/discord/callback`);
    const state = u.searchParams.get('state');
    assert.ok(state.length >= 43, 'state demasiado corto');
    const cookie = r.headers.get('set-cookie');
    assert.match(cookie, /^__Host-garra_entrada=/);
    assert.ok(cookie.includes(state), 'la cookie no lleva el state');
    for (const marca of ['HttpOnly', 'Secure', 'SameSite=Lax', 'Path=/', 'Max-Age=600']) assert.ok(cookie.includes(marca), `falta ${marca}: ${cookie}`);
  });

  test('cada intento lleva un state distinto', async () => {
    const pide = async () => destino(await s.pedir(`/auth/discord?reto=${retoDe(aleatorio())}`, { origen: null })).searchParams.get('state');
    assert.notEqual(await pide(), await pide());
  });

  test('un reto mal formado no empieza la entrada', async () => {
    for (const reto of ['', 'corto', 'x'.repeat(43) + '!', '<script>']) {
      const r = await s.pedir(`/auth/discord?reto=${encodeURIComponent(reto)}`, { origen: null });
      assert.equal(r.status, 302);
      assert.equal(errorEn(r), 'peticion');
      assert.equal(r.headers.get('set-cookie'), null);
    }
  });

  test('la vuelta siempre va a la página del clan, aunque pidan otra', async () => {
    const r = await s.pedir(`/auth/discord?reto=not&volver=${encodeURIComponent('https://malo.prueba/')}&redirect=https://malo.prueba/`, { origen: null });
    assert.equal(destino(r).origin + destino(r).pathname, PAGINA_ES);
  });

  test('un miembro vuelve a su página con un código de un solo uso en el fragmento, nunca en la consulta', async () => {
    const { vuelta, fragmento } = await s.volverDeDiscord('ana');
    assert.equal(vuelta.status, 302);
    assert.equal(destino(vuelta).origin + destino(vuelta).pathname, PAGINA_ES);
    assert.equal(destino(vuelta).search, '');
    assert.ok(fragmento.get('entrada')?.length >= 43);
    assert.match(vuelta.headers.get('set-cookie'), /^__Host-garra_entrada=;.*Max-Age=0/, 'no borra la cookie');
  });

  test('el idioma se respeta y un idioma raro cae en español', async () => {
    const en = await s.volverDeDiscord('ana', { idioma: 'en' });
    assert.equal(destino(en.vuelta).origin + destino(en.vuelta).pathname, PAGINA_EN);
    const raro = await s.volverDeDiscord('ana', { idioma: '../../malo' });
    assert.equal(destino(raro.vuelta).origin + destino(raro.vuelta).pathname, PAGINA_ES);
  });

  test('guarda lo mínimo: ni correo, ni tokens de Discord, ni la clave de sesión en claro', async () => {
    const token = await s.entrar('ana');
    const tokensDiscord = [...discord.revocados];
    assert.equal(tokensDiscord.length, 1, 'no revoca el token de Discord al acabar');
    assert.ok(discord.tokens.has(tokensDiscord[0]));
    const volcado = JSON.stringify(await s.todo());
    assert.ok(!volcado.includes(USUARIOS.ana.email), 'guarda el correo');
    assert.ok(!volcado.includes(tokensDiscord[0]), 'guarda el token de Discord');
    assert.ok(!volcado.includes('refresco-'), 'guarda el refresco de Discord');
    assert.ok(!volcado.includes(token), 'guarda la clave de sesión en claro');
    assert.ok(!volcado.includes(CLAVE_CLIENTE));
    assert.deepEqual(Object.keys((await s.todo()).miembros[0]).sort(), ['desde', 'discord_id', 'nombre', 'ultimo_acceso']);
    assert.ok(!volcado.includes('ana_user'), 'guarda el nombre de usuario además del mostrado');
    assert.equal((await s.filas('SELECT huella FROM sesiones'))[0].huella, huella(token));
  });

  test('el nombre es el del servidor si lo tiene, si no el de Discord', async () => {
    await s.entrar('ana');
    await s.entrar('bea');
    assert.deepEqual((await s.filas('SELECT nombre FROM miembros ORDER BY discord_id')).map(f => f.nombre), ['Ana del clan', 'Bea']);
  });

  test('entrar otra vez actualiza el nombre sin tocar logros ni fecha de alta', async () => {
    const token = await s.entrar('ana');
    await marcar(token, [{ logro: 'addict', nivel: 2 }]);
    await s.db.prepare("UPDATE miembros SET nombre='viejo', desde='2020-01-01'").run();
    await s.entrar('ana');
    const [m] = await s.filas('SELECT * FROM miembros');
    assert.equal(m.nombre, 'Ana del clan');
    assert.equal(m.desde, '2020-01-01');
    assert.equal((await s.filas('SELECT * FROM progreso')).length, 2);
  });

  test('un nombre raro se limpia de caracteres de control y se recorta', async () => {
    await s.entrar('rara');
    const [m] = await s.filas('SELECT nombre FROM miembros');
    assert.ok(m.nombre.length <= 64, `mide ${m.nombre.length}`);
    assert.ok(!/[\u0000-\u001f]/.test(m.nombre));
  });
});

describe('ataques a la entrada', () => {
  test('state falso: ni se llama a Discord ni entra nadie', async () => {
    const verificador = aleatorio();
    const inicio = await s.pedir(`/auth/discord?reto=${retoDe(verificador)}`, { origen: null });
    const cookie = inicio.headers.get('set-cookie').split(';')[0];
    discord.llamadas.length = 0;
    const r = await s.pedir(`/auth/discord/callback?code=${discord.darCodigo('ana')}&state=${aleatorio()}`, { origen: null, cabeceras: { Cookie: cookie } });
    assert.equal(errorEn(r), 'caducado');
    assert.equal(discord.llamadas.length, 0);
    assert.equal((await s.todo()).miembros.length, 0);
  });

  test('sin la cookie del navegador que empezó (CSRF): no entra', async () => {
    const inicio = await s.pedir(`/auth/discord?reto=${retoDe(aleatorio())}`, { origen: null });
    const state = destino(inicio).searchParams.get('state');
    discord.llamadas.length = 0;
    const r = await s.pedir(`/auth/discord/callback?code=${discord.darCodigo('ana')}&state=${state}`, { origen: null });
    assert.equal(errorEn(r), 'caducado');
    assert.equal(discord.llamadas.length, 0);
  });

  test('el emisor iss, si viene y no es Discord, se rechaza', async () => {
    const inicio = await s.pedir(`/auth/discord?reto=${retoDe(aleatorio())}`, { origen: null });
    const cookie = inicio.headers.get('set-cookie').split(';')[0];
    const state = destino(inicio).searchParams.get('state');
    discord.llamadas.length = 0;
    const r = await s.pedir(`/auth/discord/callback?code=x&state=${state}&iss=${encodeURIComponent('https://malo.prueba')}`, { origen: null, cabeceras: { Cookie: cookie } });
    assert.equal(errorEn(r), 'rechazado');
    assert.equal(discord.llamadas.length, 0);
  });

  test('quien cancela en Discord vuelve con un aviso, sin cambiar nada', async () => {
    const inicio = await s.pedir(`/auth/discord?reto=${retoDe(aleatorio())}`, { origen: null });
    const cookie = inicio.headers.get('set-cookie').split(';')[0];
    const state = destino(inicio).searchParams.get('state');
    const r = await s.pedir(`/auth/discord/callback?error=access_denied&state=${state}`, { origen: null, cabeceras: { Cookie: cookie } });
    assert.equal(errorEn(r), 'cancelado');
  });

  test('quien no es del servidor no entra, no se guarda nada y se revoca su token', async () => {
    const { vuelta, fragmento } = await s.volverDeDiscord('ajena');
    assert.equal(errorEn(vuelta), 'no_miembro');
    assert.equal(fragmento.get('entrada'), null);
    const t = await s.todo();
    assert.deepEqual([t.miembros.length, t.entradas.length, t.sesiones.length], [0, 0, 0]);
    assert.equal(discord.revocados.length, 1);
  });

  test('quien no ha pasado la verificación del servidor tampoco entra', async () => {
    const { vuelta } = await s.volverDeDiscord('novata');
    assert.equal(errorEn(vuelta), 'no_miembro');
    assert.equal((await s.todo()).miembros.length, 0);
  });

  test('Discord caído no se confunde con «no eres miembro» ni deja entrar', async () => {
    for (const [fallo, estado] of [['miembro', 500], ['miembro', 429], ['yo', 503], ['token', 502]]) {
      discord.fallo = { [fallo]: estado };
      const { vuelta } = await s.volverDeDiscord('ana');
      assert.equal(errorEn(vuelta), 'discord_caido', `${fallo} ${estado}`);
      assert.equal((await s.todo()).miembros.length, 0);
    }
    discord.fallo = {};
  });

  test('un código de Discord inválido se rechaza', async () => {
    const inicio = await s.pedir(`/auth/discord?reto=${retoDe(aleatorio())}`, { origen: null });
    const cookie = inicio.headers.get('set-cookie').split(';')[0];
    const state = destino(inicio).searchParams.get('state');
    const r = await s.pedir(`/auth/discord/callback?code=inventado&state=${state}`, { origen: null, cabeceras: { Cookie: cookie } });
    assert.equal(errorEn(r), 'rechazado');
  });

  test('el código de entrada no se puede usar dos veces', async () => {
    const { fragmento, verificador } = await s.volverDeDiscord('ana');
    const canjear = () => s.pedir('/sesion', { method: 'POST', cuerpo: { codigo: fragmento.get('entrada'), verificador } });
    assert.equal((await canjear()).status, 200);
    assert.equal((await canjear()).status, 400);
  });

  test('un código robado o colado a otra persona no sirve sin su verificador, y queda gastado', async () => {
    const { fragmento, verificador } = await s.volverDeDiscord('ana');
    const r = await s.pedir('/sesion', { method: 'POST', cuerpo: { codigo: fragmento.get('entrada'), verificador: aleatorio() } });
    assert.equal(r.status, 400);
    assert.equal((await s.todo()).sesiones.length, 0);
    const luego = await s.pedir('/sesion', { method: 'POST', cuerpo: { codigo: fragmento.get('entrada'), verificador } });
    assert.equal(luego.status, 400);
  });

  test('un código caducado no sirve', async () => {
    const { fragmento, verificador } = await s.volverDeDiscord('ana');
    await s.db.prepare('UPDATE entradas SET caduca = 1').run();
    const r = await s.pedir('/sesion', { method: 'POST', cuerpo: { codigo: fragmento.get('entrada'), verificador } });
    assert.equal(r.status, 400);
  });

  test('canjear con datos mal formados no explota', async () => {
    for (const cuerpo of [{}, { codigo: 1, verificador: 2 }, { codigo: 'x', verificador: 'y' }, 'no es json', '[]', 'null']) {
      const r = await s.pedir('/sesion', { method: 'POST', cuerpo });
      assert.equal(r.status, 400, JSON.stringify(cuerpo));
      assert.ok((await r.json()).error);
    }
  });
});

describe('sesión', () => {
  test('sin clave, con clave falsa o mal formada: 401 en todo lo privado', async () => {
    await s.entrar('ana');
    const falsas = [undefined, 'falsa', aleatorio(), `${aleatorio()}x`, "' OR 1=1 --"];
    const privado = [['/yo', 'GET'], ['/yo/datos', 'GET'], ['/yo/progreso', 'PUT'], ['/yo/borrar', 'POST'], ['/sesion', 'DELETE'], ['/sesiones', 'DELETE'], ['/admin/copia?tabla=miembros', 'GET']];
    for (const token of falsas) {
      for (const [ruta, method] of privado) {
        const r = await s.pedir(ruta, { method, token, ...(method === 'GET' || method === 'DELETE' ? {} : { cuerpo: {} }) });
        assert.equal(r.status, 401, `${method} ${ruta} con ${token}`);
      }
    }
  });

  test('una sesión caducada ya no vale', async () => {
    const token = await s.entrar('ana');
    assert.equal((await s.pedir('/yo', { token })).status, 200);
    await s.db.prepare('UPDATE sesiones SET caduca = 1').run();
    assert.equal((await s.pedir('/yo', { token })).status, 401);
  });

  test('la sesión dura como mucho 30 días: quien sale del clan deja de entrar', async () => {
    const antes = Date.now();
    await s.entrar('ana');
    const [{ caduca }] = await s.filas('SELECT caduca FROM sesiones');
    assert.ok(caduca <= antes + 31 * 864e5 && caduca >= antes + 29 * 864e5, String(caduca));
    const token = await s.entrar('bea');
    const [{ caduca: c1 }] = await s.filas('SELECT caduca FROM sesiones WHERE huella=?', huella(token));
    await s.pedir('/yo', { token });
    const [{ caduca: c2 }] = await s.filas('SELECT caduca FROM sesiones WHERE huella=?', huella(token));
    assert.equal(c1, c2, 'usar la sesión la alarga: nunca se volvería a comprobar si sigue en el clan');
  });

  test('salir invalida esa sesión y no las otras; salir de todas, todas', async () => {
    const a = await s.entrar('ana');
    const b = await s.entrar('ana');
    const c = await s.entrar('ana');
    assert.equal((await s.pedir('/sesion', { method: 'DELETE', token: a })).status, 200);
    assert.equal((await s.pedir('/yo', { token: a })).status, 401);
    assert.equal((await s.pedir('/yo', { token: b })).status, 200);
    assert.equal((await s.pedir('/sesiones', { method: 'DELETE', token: b })).status, 200);
    assert.equal((await s.pedir('/yo', { token: b })).status, 401);
    assert.equal((await s.pedir('/yo', { token: c })).status, 401);
  });

  test('no se acumulan sesiones sin fin por miembro', async () => {
    for (let i = 0; i < 13; i++) await s.entrar('ana');
    assert.ok((await s.todo()).sesiones.length <= 10);
  });
});

describe('cada uno, lo suyo', () => {
  test('nadie ve ni toca lo de otro cambiando un id', async () => {
    const ana = await s.entrar('ana');
    const bea = await s.entrar('bea');
    await marcar(ana, [{ logro: 'addict', nivel: 3 }]);
    await marcar(bea, [{ logro: 'allo-exp', nivel: 1 }]);
    const idAna = USUARIOS.ana.id;
    for (const ruta of [`/yo?id=${idAna}`, `/yo?discord_id=${idAna}`, `/yo/${idAna}`, `/usuarios/${idAna}`, `/miembros/${idAna}`]) {
      const r = await s.pedir(ruta, { token: bea });
      const texto = await r.text();
      assert.ok(!texto.includes('addict') && !texto.includes('Ana'), `${ruta}: ${texto.slice(0, 80)}`);
    }
    // Colar el id ajeno en lo que se escribe tampoco cambia de quién es.
    await s.pedir('/yo/progreso', { method: 'PUT', token: bea, cuerpo: { discord_id: idAna, id: idAna, cambios: [{ logro: 'dilo-exp', nivel: 1, discord_id: idAna }] } });
    assert.equal((await s.filas('SELECT * FROM progreso WHERE discord_id=? AND logro=?', idAna, 'dilo-exp')).length, 0);
    assert.equal((await s.filas('SELECT * FROM progreso WHERE discord_id=? AND logro=?', USUARIOS.bea.id, 'dilo-exp')).length, 1);
    // Lo que devuelve /yo solo es de quien pregunta.
    const yo = await (await s.pedir('/yo', { token: bea })).json();
    assert.equal(yo.cuenta.discord_id, USUARIOS.bea.id);
    assert.ok(!JSON.stringify(yo).includes(idAna));
    const datos = await (await s.pedir('/yo/datos', { token: bea })).text();
    assert.ok(!datos.includes(idAna) && !datos.includes('addict'));
  });

  test('borrar lo propio no toca lo de otro, aunque se cuele su id', async () => {
    const ana = await s.entrar('ana');
    const bea = await s.entrar('bea');
    await marcar(ana, [{ logro: 'addict', nivel: 3 }]);
    await marcar(bea, [{ logro: 'addict', nivel: 1 }]);
    const r = await s.pedir('/yo/borrar', { method: 'POST', token: bea, cuerpo: { confirmar: 'BORRAR', discord_id: USUARIOS.ana.id } });
    assert.equal(r.status, 200);
    assert.equal((await s.pedir('/yo', { token: ana })).status, 200);
    assert.equal((await s.filas('SELECT * FROM progreso WHERE discord_id=?', USUARIOS.ana.id)).length, 3);
    assert.equal((await s.filas('SELECT * FROM progreso WHERE discord_id=?', USUARIOS.bea.id)).length, 0);
  });
});

describe('guardar logros', () => {
  test('bajar un logro no toca los demás', async () => {
    const t = await s.entrar('ana');
    await marcar(t, [{ logro: 'allo-grow', nivel: 3 }, { logro: 'carno-grow', nivel: 3 }]);
    await marcar(t, [{ logro: 'allo-grow', nivel: 1 }], 'fijar');
    const filas = await miProgreso(t);
    assert.equal(nivel(filas, 'allo-grow'), 1);
    assert.equal(nivel(filas, 'carno-grow'), 3);
  });

  test('recuerda lo marcado en cualquier dispositivo, con la fecha de cada tramo', async () => {
    const movil = await s.entrar('ana');
    const pc = await s.entrar('ana');
    const r = await marcar(movil, [{ logro: 'allo-grow', nivel: 2 }, { logro: 'allo-exp', nivel: 1 }]);
    assert.equal(r.status, 200);
    assert.deepEqual(await r.json(), { aplicados: 2, rechazados: [] });
    const filas = await miProgreso(pc);
    assert.equal(nivel(filas, 'allo-grow'), 2);
    assert.equal(nivel(filas, 'allo-exp'), 1);
    assert.equal(filas.length, 3);
    for (const f of filas) assert.match(f.fecha, /^\d{4}-\d{2}-\d{2}$/);
  });

  test('marcar otra vez no cambia la fecha; bajar borra los tramos de encima', async () => {
    const t = await s.entrar('ana');
    await marcar(t, [{ logro: 'addict', nivel: 3 }]);
    await s.db.prepare("UPDATE progreso SET fecha='2026-01-01'").run();
    await marcar(t, [{ logro: 'addict', nivel: 3 }]);
    assert.ok((await miProgreso(t)).every(f => f.fecha === '2026-01-01'));
    await marcar(t, [{ logro: 'addict', nivel: 1 }]);
    assert.deepEqual((await miProgreso(t)).map(f => f.nivel), [1]);
    await marcar(t, [{ logro: 'addict', nivel: 0 }]);
    assert.deepEqual(await miProgreso(t), []);
  });

  test('traer progreso (modo subir) nunca baja lo que ya hay', async () => {
    const t = await s.entrar('ana');
    await marcar(t, [{ logro: 'addict', nivel: 5 }, { logro: 'allo-grow', nivel: 1 }]);
    const r = await marcar(t, [{ logro: 'addict', nivel: 2 }, { logro: 'allo-grow', nivel: 3 }], 'subir');
    assert.equal(r.status, 200);
    const filas = await miProgreso(t);
    assert.equal(nivel(filas, 'addict'), 5);
    assert.equal(nivel(filas, 'allo-grow'), 3);
  });

  test('solo acepta logros de la lista y niveles posibles; lo rechazado se dice y no se guarda', async () => {
    const t = await s.entrar('ana');
    const malos = [
      { logro: 'inventado', nivel: 1 }, { logro: '__proto__', nivel: 1 }, { logro: 'constructor', nivel: 1 }, { logro: "x' OR '1'='1", nivel: 1 },
      { logro: 'allo-exp', nivel: 2 }, { logro: 'allo-exp', nivel: -1 }, { logro: 'allo-exp', nivel: 1.5 }, { logro: 'allo-exp', nivel: '1' },
      { logro: 'addict', nivel: 8 }, { logro: 5, nivel: 1 }, { nivel: 1 }, null, 'x',
    ];
    const r = await marcar(t, [...malos, { logro: 'dilo-exp', nivel: 1 }]);
    assert.equal(r.status, 200);
    const j = await r.json();
    assert.equal(j.aplicados, 1);
    assert.equal(j.rechazados.length, malos.length);
    assert.deepEqual((await miProgreso(t)).map(f => f.logro), ['dilo-exp']);
  });

  test('acepta los logros de Oviraptor, ocultos en la web, para no perderlos', async () => {
    const t = await s.entrar('ana');
    const j = await (await marcar(t, [{ logro: 'ovi-exp', nivel: 1 }, { logro: 'fed-ovi', nivel: 2 }])).json();
    assert.equal(j.aplicados, 2);
  });

  test('peticiones mal hechas: JSON roto, sin lista, demasiado grande, tipo incorrecto', async () => {
    const t = await s.entrar('ana');
    const pedir = (cuerpo, cabeceras) => s.pedir('/yo/progreso', { method: 'PUT', token: t, cuerpo, cabeceras });
    assert.equal((await pedir('{roto')).status, 400);
    assert.equal((await pedir({})).status, 400);
    assert.equal((await pedir({ cambios: 'x' })).status, 400);
    assert.equal((await pedir({ cambios: [], modo: 'raro' })).status, 400);
    assert.equal((await pedir({ cambios: new Array(1000).fill({ logro: 'addict', nivel: 1 }) })).status, 413);
    assert.equal((await pedir('{"a":"' + 'x'.repeat(70000) + '"}')).status, 413);
    assert.equal((await pedir({ cambios: [] }, { 'Content-Type': 'text/plain' })).status, 415);
  });
});

describe('descargar y borrar', () => {
  test('la descarga lleva todo lo que se guarda de la persona', async () => {
    const t = await s.entrar('ana');
    await marcar(t, [{ logro: 'addict', nivel: 1 }]);
    const { cuenta, progreso } = await (await s.pedir('/yo/datos', { token: t })).json();
    const [fila] = await s.filas('SELECT * FROM miembros WHERE discord_id = ?1', USUARIOS.ana.id);
    assert.deepEqual(cuenta, fila);
    assert.deepEqual(progreso.map(p => Object.keys(p).sort()), [['fecha', 'logro', 'nivel']]);
  });

  test('descarga sus datos completos en un fichero', async () => {
    const t = await s.entrar('ana');
    await marcar(t, [{ logro: 'addict', nivel: 2 }]);
    const r = await s.pedir('/yo/datos', { token: t });
    assert.equal(r.status, 200);
    assert.match(r.headers.get('content-disposition'), /^attachment; filename="garra-iberica-mis-datos\.json"/);
    const d = await r.json();
    assert.equal(d.cuenta.discord_id, USUARIOS.ana.id);
    assert.equal(d.cuenta.nombre, 'Ana del clan');
    assert.equal(d.progreso.length, 2);
    assert.ok(d.descargado);
  });

  test('borrar pide confirmación y entonces no deja nada, ni siquiera la sesión', async () => {
    const t = await s.entrar('ana');
    const otra = await s.entrar('ana');
    await marcar(t, [{ logro: 'addict', nivel: 2 }]);
    for (const cuerpo of [{}, { confirmar: 'si' }, { confirmar: true }]) {
      assert.equal((await s.pedir('/yo/borrar', { method: 'POST', token: t, cuerpo })).status, 400);
    }
    assert.equal((await s.filas('SELECT * FROM progreso')).length, 2);
    assert.equal((await s.pedir('/yo/borrar', { method: 'POST', token: t, cuerpo: { confirmar: 'BORRAR' } })).status, 200);
    const todo = await s.todo();
    assert.deepEqual([todo.miembros.length, todo.progreso.length, todo.sesiones.length, todo.entradas.length, todo.escrituras_diarias.length], [0, 0, 0, 0, 0]);
    assert.equal((await s.pedir('/yo', { token: t })).status, 401);
    assert.equal((await s.pedir('/yo', { token: otra })).status, 401);
  });
});

describe('CORS, CSRF y cabeceras', () => {
  test('solo la web del clan puede leer las respuestas', async () => {
    const t = await s.entrar('ana');
    const bien = await s.pedir('/yo', { token: t });
    assert.equal(bien.headers.get('access-control-allow-origin'), ORIGEN);
    assert.match(bien.headers.get('vary') || '', /Origin/);
    assert.equal(bien.headers.get('access-control-allow-credentials'), null, 'no hace falta enviar cookies');
  });

  test('desde otro origen no se puede ni leer ni escribir', async () => {
    const t = await s.entrar('ana');
    for (const origen of ['https://malo.prueba', 'https://clan.garra-iberica.workers.dev.malo.prueba', 'http://mmortexx.github.io', 'https://mmortexx.github.io:8443', 'null', 'https://otro.github.io']) {
      const pre = await s.pedir('/yo/progreso', { method: 'OPTIONS', origen, cabeceras: { 'Access-Control-Request-Method': 'PUT', 'Access-Control-Request-Headers': 'authorization,content-type' } });
      assert.equal(pre.headers.get('access-control-allow-origin'), null, origen);
      assert.equal(pre.status, 403, origen);
      const r = await s.pedir('/yo/progreso', { method: 'PUT', origen, token: t, cuerpo: { cambios: [{ logro: 'addict', nivel: 1 }] } });
      assert.equal(r.status, 403, origen);
      assert.equal(r.headers.get('access-control-allow-origin'), null, origen);
      const leer = await s.pedir('/yo', { origen, token: t });
      assert.equal(leer.status, 403, origen);
      assert.ok(!(await leer.text()).includes('Ana'));
    }
    assert.equal((await s.filas('SELECT * FROM progreso')).length, 0);
  });

  test('la web del clan pasa la comprobación previa con los métodos justos', async () => {
    const pre = await s.pedir('/yo/progreso', { method: 'OPTIONS', cabeceras: { 'Access-Control-Request-Method': 'PUT', 'Access-Control-Request-Headers': 'authorization,content-type' } });
    assert.equal(pre.status, 204);
    assert.equal(pre.headers.get('access-control-allow-origin'), ORIGEN);
    assert.match(pre.headers.get('access-control-allow-methods'), /PUT/);
    assert.equal(pre.headers.get('access-control-allow-headers').toLowerCase(), 'authorization, content-type');
    assert.ok(!/\*/.test(pre.headers.get('access-control-allow-origin')));
  });

  test('un POST sencillo de otra web, sin cabeceras especiales (CSRF), no entra', async () => {
    const r = await s.pedir('/sesion', { method: 'POST', origen: 'https://malo.prueba', cuerpo: 'codigo=x', cabeceras: { 'Content-Type': 'application/x-www-form-urlencoded' } });
    assert.equal(r.status, 403);
  });

  test('las cookies no valen de nada en la API', async () => {
    const { cookie } = await s.volverDeDiscord('ana');
    assert.equal((await s.pedir('/yo', { cabeceras: { Cookie: cookie } })).status, 401);
  });

  test('toda respuesta lleva cabeceras de seguridad y no se guarda en cachés', async () => {
    for (const [ruta, opc] of [['/salud', {}], ['/no-existe', {}], ['/yo', {}], [`/auth/discord?reto=${retoDe(aleatorio())}`, { origen: null }]]) {
      const r = await s.pedir(ruta, opc);
      assert.equal(r.headers.get('x-content-type-options'), 'nosniff', ruta);
      assert.equal(r.headers.get('cache-control'), 'no-store', ruta);
      assert.equal(r.headers.get('referrer-policy'), 'no-referrer', ruta);
      assert.match(r.headers.get('content-security-policy') || '', /default-src 'none'/, ruta);
      assert.match(r.headers.get('strict-transport-security') || '', /max-age=\d+/, ruta);
    }
  });

  test('rutas y métodos desconocidos: 404 y 405, sin detalles', async () => {
    assert.equal((await s.pedir('/no-existe')).status, 404);
    assert.equal((await s.pedir('/yo', { method: 'POST', cuerpo: {} })).status, 405);
    assert.equal((await s.pedir('/salud')).status, 200);
    assert.deepEqual(await (await s.pedir('/salud')).json(), { ok: true });
    const cabeza = await s.pedir('/salud', { method: 'HEAD' });
    assert.equal(cabeza.status, 200, 'HEAD /salud responde como GET');
    assert.equal(await cabeza.text(), '');
  });
});

describe('administrador', () => {
  test('quien no es administrador no descarga la copia', async () => {
    const t = await s.entrar('ana');
    assert.equal((await s.pedir('/admin/copia?tabla=miembros', { token: t })).status, 403);
    const yo = await (await s.pedir('/yo', { token: t })).json();
    assert.equal(yo.cuenta.admin, false);
  });

  test('sin administradores configurados, nadie lo es', async () => {
    const d2 = await arrancarDiscord();
    const s2 = await arrancarServicio({ discord: d2, adminIds: null });
    try {
      const t = await s2.entrar('admin');
      assert.equal((await s2.pedir('/admin/copia?tabla=miembros', { token: t })).status, 403);
    } finally {
      await s2.parar();
      await d2.parar();
    }
  });

  test('el administrador descarga todo por páginas, sin claves de sesión', async () => {
    const t = await s.entrar('admin');
    const ana = await s.entrar('ana');
    await marcar(ana, [{ logro: 'addict', nivel: 7 }, { logro: 'allo-grow', nivel: 4 }]);
    assert.equal((await (await s.pedir('/yo', { token: t })).json()).cuenta.admin, true);
    const miembros = await (await s.pedir('/admin/copia?tabla=miembros', { token: t })).json();
    assert.equal(miembros.filas.length, 2);
    assert.equal(miembros.siguiente, null);
    const p = await (await s.pedir('/admin/copia?tabla=progreso', { token: t })).json();
    assert.equal(p.filas.length, 11);
    assert.ok(!JSON.stringify(p).includes(huella(ana)));
    assert.equal((await s.pedir('/admin/copia?tabla=sesiones', { token: t })).status, 400);
    assert.equal((await s.pedir("/admin/copia?tabla=miembros&desde=' OR 1=1", { token: t })).status, 400);
  });

  test('la paginación de la copia no se deja ni repite ninguna fila', async () => {
    const t = await s.entrar('admin');
    // 2500 filas para cruzar el tamaño de página.
    const lotes = [];
    for (let i = 0; i < 2500; i++) lotes.push(s.db.prepare('INSERT INTO progreso VALUES (?,?,?,?)').bind(USUARIOS.admin.id, `x${i}`, 1, '2026-01-01'));
    await s.db.batch(lotes);
    const vistas = new Set();
    let desde = null, paginas = 0;
    do {
      const r = await s.pedir(`/admin/copia?tabla=progreso${desde ? `&desde=${encodeURIComponent(desde)}` : ''}`, { token: t });
      assert.equal(r.status, 200);
      const j = await r.json();
      assert.ok(j.filas.length <= 1000);
      for (const f of j.filas) vistas.add(f.logro);
      desde = j.siguiente;
      paginas++;
    } while (desde);
    assert.equal(vistas.size, 2500);
    assert.ok(paginas >= 3);
  });
});

describe('límite de peticiones', () => {
  test('entrar y canjear se cortan por IP, con 429, Retry-After y CORS', async () => {
    const d2 = await arrancarDiscord();
    const s2 = await arrancarServicio({ discord: d2, limites: { entrada: 3 } });
    try {
      const estados = [];
      let ultima;
      for (let i = 0; i < 5; i++) {
        ultima = await s2.pedir('/sesion', { method: 'POST', cuerpo: {}, ip: '203.0.113.7' });
        estados.push(ultima.status);
      }
      assert.deepEqual(estados, [400, 400, 400, 429, 429]);
      assert.ok(ultima.headers.get('retry-after'));
      assert.equal(ultima.headers.get('access-control-allow-origin'), ORIGEN);
      // Otra IP no paga por la primera.
      assert.equal((await s2.pedir('/sesion', { method: 'POST', cuerpo: {}, ip: '203.0.113.8' })).status, 400);
      // Quien navega por la entrada vuelve a la página con el aviso, no a una pantalla en crudo.
      for (let i = 0; i < 4; i++) ultima = await s2.pedir(`/auth/discord?reto=${retoDe(aleatorio())}`, { origen: null, ip: '203.0.113.9' });
      assert.equal(errorEn(ultima), 'demasiadas');
      assert.equal(new URL(ultima.headers.get('location')).origin, ORIGEN);
      d2.llamadas.length = 0;
      for (let i = 0; i < 4; i++) ultima = await s2.pedir('/auth/discord/callback?code=x&state=y', { origen: null, ip: '203.0.113.10' });
      assert.equal(errorEn(ultima), 'demasiadas');
      assert.equal(d2.llamadas.length, 0);
    } finally {
      await s2.parar();
      await d2.parar();
    }
  });

  test('claves falsas se cortan por IP antes de gastar base de datos; cada sesión tiene su límite', async () => {
    const d2 = await arrancarDiscord();
    const s2 = await arrancarServicio({ discord: d2, limites: { api: 3 } });
    try {
      let ultima;
      for (let i = 0; i < 5; i++) ultima = await s2.pedir('/yo', { token: aleatorio(), ip: '203.0.113.20' });
      assert.equal(ultima.status, 429);
      const t = await s2.entrar('ana');
      const otra = await s2.entrar('bea');
      // La misma sesión desde muchas IP (una clave filtrada) también se corta.
      for (let i = 0; i < 5; i++) ultima = await s2.pedir('/yo', { token: t, ip: `203.0.113.${30 + i}` });
      assert.equal(ultima.status, 429);
      assert.equal((await s2.pedir('/yo', { token: otra, ip: '203.0.113.50' })).status, 200);
    } finally {
      await s2.parar();
      await d2.parar();
    }
  });
});

describe('si algo falla', () => {
  test('sin credenciales de Discord configuradas, la entrada lo dice en la página en vez de ir a Discord', async () => {
    const d2 = await arrancarDiscord();
    const s2 = await arrancarServicio({ discord: d2, sinCredenciales: true });
    try {
      const r = await s2.pedir(`/auth/discord?reto=${retoDe(aleatorio())}`, { origen: null });
      assert.equal(errorEn(r), 'no_disponible');
    } finally {
      await s2.parar();
      await d2.parar();
    }
  });

  test('sin base de datos responde 503 legible por la web y sin detalles internos', async () => {
    const d2 = await arrancarDiscord();
    const s2 = await arrancarServicio({ discord: d2, esquema: false });
    try {
      const r = await s2.pedir('/yo', { token: aleatorio() });
      assert.equal(r.status, 503);
      assert.equal(r.headers.get('access-control-allow-origin'), ORIGEN);
      const texto = await r.text();
      assert.deepEqual(JSON.parse(texto), { error: 'no_disponible' });
      // La vuelta de Discord también: sin base de datos no deja a nadie entrar y se lo dice.
      const { vuelta } = await s2.volverDeDiscord('ana');
      assert.equal(errorEn(vuelta), 'no_disponible');
      assert.equal((await s2.pedir('/salud')).status, 200);
    } finally {
      await s2.parar();
      await d2.parar();
    }
  });
});

describe('limpieza nocturna', () => {
  test('borra lo caducado y solo lo caducado', async () => {
    const viva = await s.entrar('ana');
    const muerta = await s.entrar('bea');
    await s.volverDeDiscord('ana');
    await s.db.prepare('UPDATE sesiones SET caduca = 1 WHERE huella = ?').bind(huella(muerta)).run();
    await s.db.prepare('UPDATE entradas SET caduca = 1').run();
    const w = await s.mf.getWorker();
    await w.scheduled({ cron: '23 3 * * *' });
    const t = await s.todo();
    assert.deepEqual(t.sesiones.map(f => f.huella), [huella(viva)]);
    assert.equal(t.entradas.length, 0);
    assert.equal(t.miembros.length, 2, 'la limpieza no toca a los miembros');
  });
});

describe('copia de seguridad', () => {
  test('restaurar sobre una base con datos no pierde lo que ya había', async () => {
    const { sqlDeCopia } = await import('../scripts/restaurar.mjs');
    const t = await s.entrar('ana');
    await marcar(t, [{ logro: 'addict', nivel: 2 }]);
    const sql = sqlDeCopia({
      formato: 'garra-copia-1',
      miembros: [{ discord_id: USUARIOS.ana.id, nombre: 'Ana vieja', desde: '2026-01-01', ultimo_acceso: '2026-01-02' }],
      progreso: [{ discord_id: USUARIOS.ana.id, logro: 'allo-exp', nivel: 1, fecha: '2026-01-01' }],
    });
    for (const linea of sql.trim().split('\n')) await s.db.exec(linea);
    const filas = await miProgreso(t);
    assert.equal(nivel(filas, 'addict'), 2, 'se conserva lo que ya estaba');
    assert.equal(nivel(filas, 'allo-exp'), 1, 'se añade lo de la copia');
    assert.equal((await s.pedir('/yo', { token: t })).status, 200, 'la sesión sigue');
  });

  test('una copia se restaura entera en una base vacía, nombres raros incluidos', async () => {
    const { sqlDeCopia } = await import('../scripts/restaurar.mjs');
    const admin = await s.entrar('admin');
    const rara = await s.entrar('rara');
    await marcar(rara, [{ logro: 'addict', nivel: 3 }]);
    await s.db.prepare("UPDATE miembros SET nombre = ? WHERE discord_id = ?").bind("O'Brien'); DROP TABLE miembros; --", USUARIOS.rara.id).run();
    const copia = {
      formato: 'garra-copia-1',
      miembros: (await (await s.pedir('/admin/copia?tabla=miembros', { token: admin })).json()).filas,
      progreso: (await (await s.pedir('/admin/copia?tabla=progreso', { token: admin })).json()).filas,
    };
    const lineas = sqlDeCopia(copia).trim().split('\n');
    const antes = await s.todo();
    await s.limpiar();
    for (const l of lineas) await s.db.prepare(l).run();
    const despues = await s.todo();
    assert.deepEqual(despues.miembros, antes.miembros);
    assert.deepEqual(despues.progreso, antes.progreso);
    assert.equal(despues.sesiones.length, 0, 'las sesiones no se restauran: cada uno vuelve a entrar');
  });

  test('una copia con otra forma se rechaza en vez de restaurar a medias', async () => {
    const { sqlDeCopia } = await import('../scripts/restaurar.mjs');
    assert.throws(() => sqlDeCopia({ formato: 'otro', miembros: [], progreso: [] }));
    assert.throws(() => sqlDeCopia({ formato: 'garra-copia-1', miembros: [{ discord_id: "1' OR 1", nombre: 'x', desde: 'y', ultimo_acceso: 'z' }], progreso: [] }));
    assert.throws(() => sqlDeCopia({ formato: 'garra-copia-1', miembros: [], progreso: [{ discord_id: '100000000000000001', logro: 'a', nivel: 'b', fecha: 'c' }] }));
  });
});

describe('configuración', () => {
  const toml = readFileSync(join(SERVICIO, 'wrangler.toml'), 'utf8');
  test('no guarda registros de cada petición: llevan direcciones y códigos', () => {
    assert.match(toml, /\[observability\]\s+enabled = false/);
  });
  test('la página pública y el servicio aceptan la misma lista de logros', () => {
    for (const ruta of ['ruta', 'en/route']) {
      const html = readFileSync(join(SERVICIO, '..', 'docs', ruta, 'index.html'), 'utf8');
      const datos = /data-logros="([^"]+)"/.exec(html)[1].replaceAll('&quot;', '"');
      assert.deepEqual(JSON.parse(datos), Object.fromEntries(MAXIMOS));
    }
  });
  test('la configuración pública no apunta a otro Discord ni lleva secretos', () => {
    assert.ok(!/DISCORD_URL/.test(toml));
    assert.ok(!/SECRET|ADMIN_IDS|DISCORD_CLIENT/.test(toml.replace(/^#.*$/gm, '')));
    assert.ok(toml.includes(`GUILD_ID = "${GUILD}"`));
    assert.ok(toml.includes(`PAGINA_ES = "${PAGINA_ES}"`));
    assert.ok(toml.includes(`PAGINA_EN = "${PAGINA_EN}"`));
  });
  test('el esquema se aplica limpio dos veces en bases nuevas', async () => {
    const d2 = await arrancarDiscord();
    const s2 = await arrancarServicio({ discord: d2, esquema: false });
    try {
      await aplicarEsquema(s2.db);
      assert.equal((await s2.todo()).miembros.length, 0);
    } finally {
      await s2.parar();
      await d2.parar();
    }
  });
});

describe('lo que cuesta cada petición', () => {
  const id = USUARIOS.ana.id;
  const todos = new Map(MAXIMOS);
  beforeEach(() => s.db.prepare("INSERT INTO miembros (discord_id, nombre, desde, ultimo_acceso) VALUES (?1, 'Ana', '2026-11-05', '2026-11-05')").bind(id).run());
  const aplicar = (cambios, modo) => aplicarCambios(s.db, id, new Map(cambios), modo, '2026-11-05');

  test('quien lo tiene todo: marcar un tramo no reescribe nada más', async () => {
    await aplicar(todos, 'subir');
    await aplicar([['allo-exp', 0]], 'fijar');
    const g = await aplicar([['allo-exp', 1]], 'fijar');
    assert.ok(g.escritas <= 2, `escribe ${g.escritas} filas`);
    assert.ok(g.leidas <= 10, `lee ${g.leidas} filas`);
  });

  test('volver a mandar lo mismo no escribe nada, por mucho que sea', async () => {
    const primera = await aplicar(todos, 'subir');
    assert.ok(primera.escritas >= 535 && primera.escritas <= 1100, `la primera escribe ${primera.escritas}`);
    for (const modo of ['fijar', 'subir']) {
      const g = await aplicar(todos, modo);
      assert.equal(g.escritas, 0, `${modo} reescribe ${g.escritas} filas`);
      assert.ok(g.leidas <= 1100, `${modo} lee ${g.leidas} filas`);
    }
  });

  test('bajar un logro solo borra sus tramos y deja el resto', async () => {
    await aplicar(todos, 'subir');
    const antes = (await s.filas('SELECT * FROM progreso')).length;
    const g = await aplicar([['addict', 1]], 'fijar');
    const quitados = MAXIMOS.get('addict') - 1;
    assert.equal((await s.filas('SELECT * FROM progreso')).length, antes - quitados);
    assert.ok(g.escritas <= quitados * 2, `escribe ${g.escritas}`);
  });

  test('limpiar los códigos de un miembro no recorre la tabla', async () => {
    const plan = await s.filas("EXPLAIN QUERY PLAN DELETE FROM entradas WHERE discord_id = '1' AND caduca <= 1");
    assert.ok(plan.every(p => !/^SCAN entradas/.test(p.detail)), plan.map(p => p.detail).join('; '));
  });
});

describe('los límites', () => {
  test('la configuración de verdad lleva la base, los tres límites y la limpieza de cada noche', () => {
    const c = unstable_readConfig({ config: join(SERVICIO, 'wrangler.toml') });
    assert.equal(c.name, 'garra-cuentas');
    assert.deepEqual(c.d1_databases.map(d => [d.binding, d.database_name]), [['DB', 'garra-cuentas']]);
    assert.match(c.d1_databases[0].database_id, /^[0-9a-f-]{36}$/);
    const limite = Object.fromEntries(c.ratelimits.map(r => [r.name, r.simple.limit]));
    assert.deepEqual(Object.keys(limite).sort(), ['LIMITE_API', 'LIMITE_ENTRADA', 'LIMITE_ESCRITURA']);
    assert.ok(limite.LIMITE_ESCRITURA < limite.LIMITE_API, 'escribir tiene que costar más que leer');
    assert.ok(limite.LIMITE_ESCRITURA <= 30);
    assert.equal(c.triggers.crons.length, 1);
    assert.equal(c.observability.enabled, false);
  });

  test('guardar tiene su propio límite por miembro: frenado, leer sigue y otro miembro también', async () => {
    const t = await arrancarServicio({ discord, limites: { escritura: 2 } });
    try {
      const ana = await t.entrar('ana');
      const otraAna = await t.entrar('ana');
      const bea = await t.entrar('bea');
      const guardar = token => t.pedir('/yo/progreso', { method: 'PUT', token, cuerpo: { cambios: [{ logro: 'allo-exp', nivel: 1 }] } });
      const estados = [];
      for (const token of [ana, otraAna, ana, otraAna]) estados.push((await guardar(token)).status);
      assert.ok(estados.includes(429), `sin freno: ${estados}`);
      assert.equal((await t.pedir('/yo', { token: ana })).status, 200);
      assert.equal((await guardar(bea)).status, 200);
    } finally {
      await t.parar();
    }
  });

  test('si falla el contador: entrar y escribir se cierran, leer sigue y salir también', async () => {
    const sinEntrada = await arrancarServicio({ discord, limites: { entrada: null } });
    try {
      const r = await sinEntrada.pedir(`/auth/discord?reto=${retoDe(aleatorio())}`, { origen: null });
      assert.equal(new URLSearchParams(new URL(r.headers.get('location')).hash.slice(1)).get('error'), 'demasiadas');
    } finally {
      await sinEntrada.parar();
    }
    const sinEscritura = await arrancarServicio({ discord, limites: { escritura: null } });
    try {
      const token = await sinEscritura.entrar('ana');
      const r = await sinEscritura.pedir('/yo/progreso', { method: 'PUT', token, cuerpo: { cambios: [{ logro: 'allo-exp', nivel: 1 }] } });
      assert.equal(r.status, 429);
      assert.deepEqual(await sinEscritura.filas('SELECT * FROM progreso'), []);
      assert.equal((await sinEscritura.pedir('/yo', { token })).status, 200);
    } finally {
      await sinEscritura.parar();
    }
    const sinApi = await arrancarServicio({ discord, limites: { api: null } });
    try {
      const token = await sinApi.entrar('ana');
      assert.equal((await sinApi.pedir('/yo', { token })).status, 200);
      assert.equal((await sinApi.pedir('/sesion', { method: 'DELETE', token })).status, 200);
    } finally {
      await sinApi.parar();
    }
  });
});

describe('tope diario de filas escritas', () => {
  // Decidido: 2.000 filas por miembro y día UTC (casi cuatro importaciones completas). El plan gratuito da 100.000 al día a todo el clan.
  const TOPE = 2000;
  const ana = USUARIOS.ana.id;
  const total = [...MAXIMOS.values()].reduce((a, n) => a + n, 0);
  const todoMarcado = [...MAXIMOS].map(([logro, nivel]) => ({ logro, nivel }));
  const todoACero = [...MAXIMOS.keys()].map(logro => ({ logro, nivel: 0 }));
  // Los niveles que quitan justo n filas a quien lo tiene todo marcado.
  const quitando = n => [...MAXIMOS].map(([logro, max]) => {
    const q = Math.min(n, max);
    n -= q;
    return [logro, max - q];
  });
  const contador = async id => (await s.filas('SELECT dia, restantes FROM escrituras_diarias WHERE discord_id = ?1', id))[0];
  const filasGuardadas = async id => (await s.filas('SELECT COUNT(*) AS n FROM progreso WHERE discord_id = ?1', id))[0].n;
  const diaUtc = () => new Date().toISOString().slice(0, 10);
  const hastaMedianoche = () => Math.ceil((Date.parse(diaUtc()) + 864e5 - Date.now()) / 1000);
  // Cuántos guardados completos caben, y el mismo ciclo alterno (marcar todo, bajar todo, marcar todo...) que los llena.
  const caben = Math.floor(TOPE / total);
  const ciclo = i => (i % 2 === 0 ? todoMarcado : todoACero);

  test('el tamaño de una importación completa encaja con el tope decidido', () => {
    assert.ok(3 * total <= TOPE && 4 * total > TOPE, `${total} filas por importación: revisa el tope`);
  });

  describe('contra el servicio', () => {
    test('el ciclo «marcar todo / bajar todo» se corta con 429 antes de pasar del tope y lo guardado queda intacto', async () => {
      const token = await s.entrar('ana');
      const estados = [];
      let ultima, antes, despues;
      for (let i = 0; i < caben + 5 && estados.at(-1) !== 429; i++) {
        antes = hastaMedianoche();
        ultima = await marcar(token, ciclo(i), 'fijar');
        despues = hastaMedianoche();
        estados.push(ultima.status);
      }
      assert.deepEqual(estados, [...new Array(caben).fill(200), 429]);
      assert.deepEqual(await ultima.json(), { error: 'tope_diario' });
      // Hasta que cambie el día, no «un minuto»; si la prueba cruzó justo la medianoche, no hay nada que comparar.
      const espera = Number(ultima.headers.get('retry-after'));
      if (despues <= antes) assert.ok(espera >= despues - 1 && espera <= antes, `Retry-After ${espera}, entre ${despues} y ${antes}`);
      assert.equal(await filasGuardadas(ana), caben % 2 ? total : 0, 'el guardado rechazado no ha tocado nada');
      assert.equal((await contador(ana)).restantes, TOPE - caben * total, 'no se cuentan filas que no se escribieron');
      assert.equal((await s.pedir('/yo', { token })).status, 200);
    });

    test('lo que cabe sigue pasando, lo que no cambia nada no cuenta y otro miembro no se entera', async () => {
      const token = await s.entrar('ana');
      const bea = await s.entrar('bea');
      for (let i = 0; i < caben; i++) assert.equal((await marcar(token, ciclo(i), 'fijar')).status, 200);
      assert.equal((await marcar(token, ciclo(caben), 'fijar')).status, 429);
      const girar = [{ logro: 'allo-exp', nivel: caben % 2 ? 0 : 1 }];
      assert.equal((await marcar(token, girar, 'fijar')).status, 200, 'una fila sí cabe');
      assert.equal((await contador(ana)).restantes, TOPE - caben * total - 1);
      assert.equal((await marcar(token, girar, 'fijar')).status, 200);
      assert.equal((await contador(ana)).restantes, TOPE - caben * total - 1, 'repetir lo mismo no gasta nada');
      assert.equal((await marcar(bea, todoMarcado, 'fijar')).status, 200);
      assert.equal((await contador(USUARIOS.bea.id)).restantes, TOPE - total);
    });

    test('al cambiar de día UTC el tope empieza de cero', async () => {
      const token = await s.entrar('ana');
      for (let i = 0; i < caben; i++) await marcar(token, ciclo(i), 'fijar');
      assert.equal((await marcar(token, ciclo(caben), 'fijar')).status, 429);
      await s.db.prepare("UPDATE escrituras_diarias SET dia = '2000-01-01'").run();
      assert.equal((await marcar(token, ciclo(caben), 'fijar')).status, 200, 'con el contador de ayer, hoy empieza de cero');
      assert.deepEqual(await contador(ana), { dia: diaUtc(), restantes: TOPE - total });
    });
  });

  describe('contando filas', () => {
    beforeEach(() => s.db.prepare("INSERT INTO miembros (discord_id, nombre, desde, ultimo_acceso) VALUES (?1, 'Ana', '2026-11-05', '2026-11-05')").bind(ana).run());
    const aplicar = (cambios, dia = '2026-11-05') => aplicarCambios(s.db, ana, new Map(cambios), 'fijar', dia);
    const aCero = () => [...MAXIMOS.keys()].map(logro => [logro, 0]);
    const vaciar = () => s.db.batch(['escrituras_diarias', 'progreso'].map(t => s.db.prepare(`DELETE FROM ${t}`)));
    // Tres guardados completos seguidos: 3 * total filas gastadas y todo marcado.
    const tres = async dia => {
      await aplicar([...MAXIMOS], dia);
      await aplicar(aCero(), dia);
      await aplicar([...MAXIMOS], dia);
    };

    test('el límite exacto y sus dos vecinos: TOPE - 1 y TOPE caben, TOPE + 1 no', async () => {
      for (const [sobra, cabe] of [[-1, true], [0, true], [1, false]]) {
        await vaciar();
        await tres();
        const filas = TOPE - 3 * total + sobra;
        if (cabe) {
          await aplicar(quitando(filas));
          assert.equal((await contador(ana)).restantes, 0 - sobra, `con ${sobra}`);
          assert.equal(await filasGuardadas(ana), total - filas);
        } else {
          await assert.rejects(aplicar(quitando(filas)), { name: 'TopeDiario' });
          assert.equal((await contador(ana)).restantes, TOPE - 3 * total);
          assert.equal(await filasGuardadas(ana), total, 'al pasarse no se escribe nada');
        }
      }
    });

    test('al cambiar de día el tope se reinicia', async () => {
      await tres('2026-11-05');
      await assert.rejects(aplicar(aCero(), '2026-11-05'), { name: 'TopeDiario' });
      await aplicar(aCero(), '2026-11-06');
      assert.deepEqual(await contador(ana), { dia: '2026-11-06', restantes: TOPE - total });
    });

    test('un guardado que no cambia nada no crea ni toca el contador', async () => {
      await aplicar([...MAXIMOS]);
      const antes = await contador(ana);
      for (let i = 0; i < 5; i++) await aplicar([...MAXIMOS]);
      assert.deepEqual(await contador(ana), antes);
      await vaciar();
      await aplicar([['allo-exp', 0]]);
      assert.deepEqual(await s.filas('SELECT * FROM escrituras_diarias'), []);
    });
  });
});

describe('la dirección antigua', () => {
  test('la configuración publicada acepta solo la dirección nueva', () => {
    const { vars } = unstable_readConfig({ config: join(SERVICIO, 'wrangler.toml') });
    assert.equal(new URL(vars.PAGINA_ES).origin, 'https://clan.garra-iberica.workers.dev');
    assert.equal(new URL(vars.PAGINA_EN).origin, 'https://clan.garra-iberica.workers.dev');
  });

  test('desde GitHub Pages no se puede ni canjear ni usar una sesión', async () => {
    const t = await arrancarServicio({ discord, paginaEs: 'https://clan.garra-iberica.workers.dev/ruta/', paginaEn: 'https://clan.garra-iberica.workers.dev/en/route/' });
    try {
      const nueva = await t.pedir('/salud', { origen: 'https://clan.garra-iberica.workers.dev' });
      assert.equal(nueva.headers.get('access-control-allow-origin'), 'https://clan.garra-iberica.workers.dev');
      for (const [ruta, opciones] of [['/sesion', { method: 'POST', cuerpo: { codigo: 'x', verificador: 'y' } }], ['/yo', {}]]) {
        const antigua = await t.pedir(ruta, { ...opciones, origen: 'https://mmortexx.github.io' });
        assert.equal(antigua.status, 403, `${ruta} da ${antigua.status}`);
        assert.equal(antigua.headers.get('access-control-allow-origin'), null);
      }
    } finally {
      await t.parar();
    }
  });
});

describe('lo que promete el aviso legal', () => {
  const aviso = lang => readFileSync(join(SERVICIO, '..', 'paginas', lang, 'legal.html'), 'utf8');
  const FRASES = {
    es: { cookie: /cookie técnica durante (\d+) minutos/, sesion: /La sesión dura (\d+) días/, copias: /recuperación automáticas desaparecen en (\d+) días/ },
    en: { cookie: /technical cookie for (\d+) minutes/, sesion: /A session lasts (\d+) days/, copias: /recovery copies disappear within (\d+) days/ },
  };
  const dice = (lang, que) => {
    const m = FRASES[lang][que].exec(aviso(lang));
    assert.ok(m, `paginas/${lang}/legal.html ya no dice «${FRASES[lang][que]}»`);
    return Number(m[1]);
  };

  test('la cookie y la sesión duran lo que dice, en los dos idiomas', async () => {
    const inicio = await s.pedir(`/auth/discord?reto=${retoDe(aleatorio())}`, { origen: null });
    const segundos = Number(/Max-Age=(\d+)/.exec(inicio.headers.get('set-cookie'))[1]);
    await s.entrar('ana');
    const [{ caduca }] = await s.filas('SELECT caduca FROM sesiones');
    const dias = Math.round((caduca - Date.now()) / 86400000);
    for (const lang of ['es', 'en']) {
      assert.equal(dice(lang, 'cookie') * 60, segundos, `${lang}: cookie`);
      assert.equal(dice(lang, 'sesion'), dias, `${lang}: sesión`);
    }
  });

  // Los 7 días son de Cloudflare (plan gratuito), no de este código: lo único que se puede atar es el README, que lo cita.
  test('las copias de recuperación: lo mismo en el aviso y en el README', () => {
    const readme = Number(/D1 guarda (\d+) días de vuelta atrás/.exec(readFileSync(join(SERVICIO, 'README.md'), 'utf8'))[1]);
    for (const lang of ['es', 'en']) assert.equal(dice(lang, 'copias'), readme, lang);
  });

  test('quien ya se fue tiene un camino para pedirlo, en los dos idiomas', () => {
    assert.match(aviso('es'), /Si ya te fuiste, escribe por mensaje privado de Discord/);
    assert.match(aviso('en'), /If you have already left, send a private Discord message/);
    assert.match(readFileSync(join(SERVICIO, 'README.md'), 'utf8'), /scripts\/miembro\.mjs borrar ID/);
  });
});

// Lo que el README manda hacer o promete tiene que ser verdad: cada cifra y cada orden, atadas al código.
describe('el README dice lo que hace el servicio', () => {
  const readme = readFileSync(join(SERVICIO, 'README.md'), 'utf8');
  const orden = patron => {
    const m = patron.exec(readme);
    assert.ok(m, `servicio/README.md ya no dice ${patron}`);
    return m[1];
  };
  const ana = USUARIOS.ana.id;

  test('los límites por minuto son los de wrangler.toml', () => {
    const c = unstable_readConfig({ config: join(SERVICIO, 'wrangler.toml') });
    const limite = Object.fromEntries(c.ratelimits.map(r => [r.name, r.simple.limit]));
    const m = /(\d+) entradas con Discord, (\d+) lecturas\s+y \*\*(\d+) escrituras de logros por miembro\*\*/.exec(readme);
    assert.ok(m, 'servicio/README.md ya no cuenta los límites por petición');
    assert.deepEqual(m.slice(1).map(Number), [limite.LIMITE_ENTRADA, limite.LIMITE_API, limite.LIMITE_ESCRITURA]);
  });

  test('el tope diario de filas es el del código', () => {
    const m = /tope de \*\*([\d.]+) filas escritas por miembro y día\*\*/.exec(readme);
    assert.ok(m, 'servicio/README.md ya no cuenta el tope diario de filas');
    assert.equal(Number(m[1].replaceAll('.', '')), TOPE_FILAS_DIA);
  });

  test('la sesión dura los días que dice el README al dejar el clan', async () => {
    await s.entrar('ana');
    const [{ caduca }] = await s.filas('SELECT caduca FROM sesiones');
    assert.equal(Number(orden(/caduca su sesión: \*\*(\d+) días\*\*/)), Math.round((caduca - Date.now()) / 86400000));
  });

  test('cortar la sesión de quien se va, tal como lo escribe el README, solo corta la suya', async () => {
    const [tokenAna, tokenBea] = [await s.entrar('ana'), await s.entrar('bea')];
    await s.db.prepare(orden(/--command "(DELETE FROM sesiones WHERE discord_id = 'ID')"/).replace('ID', ana)).run();
    assert.equal((await s.pedir('/yo', { token: tokenAna })).status, 401);
    assert.equal((await s.pedir('/yo', { token: tokenBea })).status, 200);
    assert.equal((await s.filas('SELECT * FROM miembros')).length, 2, 'sus datos no se tocan');
  });

  test('apagar con el DELETE del README no deja nada de nadie en ninguna tabla', async () => {
    const [tokenAna, tokenBea] = [await s.entrar('ana'), await s.entrar('bea')];
    await marcar(tokenAna, [{ logro: 'addict', nivel: 2 }]);
    await marcar(tokenBea, [{ logro: 'allo-exp', nivel: 1 }]);
    assert.ok((await s.filas('SELECT * FROM progreso')).length >= 2 && (await s.filas('SELECT * FROM sesiones')).length === 2);
    await s.db.prepare(orden(/--command "(DELETE FROM miembros)"/)).run();
    for (const t of ['miembros', 'progreso', 'sesiones', 'entradas', 'escrituras_diarias']) assert.equal((await s.filas(`SELECT * FROM ${t}`)).length, 0, t);
  });
});

// El repositorio es público y el README manda crear en servicio/ ficheros con datos personales de los miembros.
describe('datos personales fuera del repositorio', () => {
  const RAIZ = join(SERVICIO, '..');
  const git = (...args) => spawnSync('git', args, { cwd: RAIZ, encoding: 'utf8' });
  const ignorado = nombre => git('check-ignore', '--no-index', '-q', '--', `servicio/${nombre}`).status === 0;
  const versionado = nombre => git('ls-files', '--', `servicio/${nombre}`).stdout.trim() !== '';

  test('lo que el README manda crear en servicio/ no se sube', () => {
    const readme = readFileSync(join(SERVICIO, 'README.md'), 'utf8');
    const nombres = [...new Set([...readme.matchAll(/(?<![\w./-])([\w.-]+\.(?:sql|json))\b/g)].map(m => m[1]))].filter(n => !versionado(n));
    for (const esperado of ['restaurar.sql', 'datos.json', 'copia.sql']) assert.ok(nombres.includes(esperado), `el README ya no menciona ${esperado}: ¿cambió el procedimiento?`);
    for (const n of nombres) assert.ok(ignorado(n), `servicio/${n} lo crea el README con datos personales y git no lo ignora`);
  });

  test('las variantes razonables tampoco se suben', () => {
    for (const n of ['copia.json', 'copia-2026-11-05.sql', 'copia 2.sql', 'datos-100000000000000001.json', 'restaurar-ana.sql', 'garra-copia.json', 'borrados.local.txt']) {
      assert.ok(ignorado(n), `servicio/${n} se subiría`);
    }
  });

  test('y lo que sí es del repositorio no queda ignorado', () => {
    const ignorados = git('ls-files', '-ci', '--exclude-standard').stdout.trim();
    assert.equal(ignorados, '', 'ficheros versionados que ahora git ignora');
    for (const n of ['package.json', 'package-lock.json', 'wrangler.toml', 'migraciones/0001_inicial.sql']) assert.ok(!ignorado(n), `servicio/${n} es del repositorio`);
  });
});

describe('datos de un miembro a petición', () => {
  const [ana, bea] = [USUARIOS.ana.id, USUARIOS.bea.id];
  const copia = async () => ({
    formato: 'garra-copia-1',
    miembros: await s.filas('SELECT * FROM miembros'),
    progreso: await s.filas('SELECT * FROM progreso'),
  });
  const ejecutar = async sql => { for (const orden of sql.split('\n').filter(Boolean)) await s.db.prepare(orden).run(); };

  beforeEach(async () => {
    for (const quien of ['ana', 'bea']) {
      const token = await s.entrar(quien);
      await marcar(token, [{ logro: 'addict', nivel: 2 }]);
    }
  });

  test('exportar da lo suyo y nada de otro', async () => {
    const [miembro, progreso] = await Promise.all(sqlExportar(ana).map(sql => s.filas(sql)));
    assert.deepEqual(miembro.map(m => m.discord_id), [ana]);
    assert.equal(progreso.length, 2);
    assert.ok(progreso.every(p => p.logro === 'addict' && p.fecha && !('discord_id' in p)));
  });

  test('borrar se lleva todo lo suyo, sesiones incluidas, y no toca a otro', async () => {
    await s.db.prepare(sqlBorrar(ana)).run();
    for (const tabla of ['miembros', 'progreso', 'sesiones', 'entradas', 'escrituras_diarias']) {
      assert.deepEqual(await s.filas(`SELECT * FROM ${tabla} WHERE discord_id = ?1`, ana), [], tabla);
    }
    assert.equal((await s.filas('SELECT * FROM progreso WHERE discord_id = ?1', bea)).length, 2);
    assert.equal((await s.filas('SELECT * FROM sesiones WHERE discord_id = ?1', bea)).length, 1);
  });

  test('restaurar una copia antigua no revive a quien se borró a petición', async () => {
    const antigua = await copia();
    await s.db.prepare(sqlBorrar(ana)).run();
    await ejecutar(sqlDeCopia(antigua, [ana]));
    assert.deepEqual(await s.filas('SELECT * FROM miembros WHERE discord_id = ?1', ana), []);
    assert.deepEqual(await s.filas('SELECT * FROM progreso WHERE discord_id = ?1', ana), []);
    assert.equal((await s.filas('SELECT * FROM miembros WHERE discord_id = ?1', bea)).length, 1);
  });

  test('un identificador raro no llega a la base, y la lista de borrados se lee bien', () => {
    for (const malo of ["1' OR '1'='1", '', undefined, '123']) {
      assert.throws(() => sqlBorrar(malo), /no es un identificador/);
      assert.throws(() => sqlExportar(malo), /no es un identificador/);
    }
    const carpeta = mkdtempSync(join(tmpdir(), 'garra-borrados-'));
    try {
      const lista = join(carpeta, 'b.txt');
      assert.deepEqual(leerBorrados(lista), []);
      writeFileSync(lista, `${ana}\r\n\n${bea}\n${ana}\n`);
      assert.deepEqual(leerBorrados(lista), [ana, bea]);
      writeFileSync(lista, 'no-es-un-id\n');
      assert.throws(() => leerBorrados(lista), /no es un identificador/);
    } finally {
      rmSync(carpeta, { recursive: true, force: true });
    }
    assert.ok(!existsSync(join(SERVICIO, 'borrados.local.txt')) || /\*\.local\.txt/.test(readFileSync(join(SERVICIO, '..', '.gitignore'), 'utf8')));
  });
});

describe('las mutaciones del servicio', () => {
  test('unas pruebas sin resumen no se cuentan como guarda viva ni como cazada', () => {
    const r = spawnSync(process.execPath, ['pruebas/mutaciones.mjs'], {
      cwd: SERVICIO, encoding: 'utf8', env: { ...process.env, MUTACIONES_ESPERA: '1', MUTACIONES_SOLO: '1' },
    });
    assert.notEqual(r.status, 0);
    assert.match(r.stderr, /no han dado resumen/);
    assert.doesNotMatch(r.stdout, /VIVA|cazada/);
  });
});

describe('las mutaciones de la página', () => {
  // Sin la línea base: aquí se mide solo el bucle de guardas. La línea base tiene su prueba, justo debajo.
  test('un recorrido sin resumen no se cuenta como guarda viva', () => {
    const r = spawnSync(process.execPath, ['pruebas/mutaciones_pagina.mjs'], {
      cwd: SERVICIO, encoding: 'utf8', env: { ...process.env, MUTACIONES_ESPERA: '1', MUTACIONES_SOLO: '1', MUTACIONES_SIN_BASE: '1' },
    });
    assert.equal(r.status, 1, r.stdout);
    assert.match(r.stdout, /SIN RESUMEN/);
    assert.doesNotMatch(r.stdout, /VIVA/);
    assert.match(r.stdout, /1 sin resolver/);
  });

  test('si el recorrido ya falla con el ruta.js sin tocar, para antes de medir nada y lo dice', () => {
    const r = spawnSync(process.execPath, ['pruebas/mutaciones_pagina.mjs'], {
      cwd: SERVICIO, encoding: 'utf8', env: { ...process.env, MUTACIONES_ESPERA: '1', MUTACIONES_SOLO: '1' },
    });
    assert.equal(r.status, 2, r.stdout);
    assert.match(r.stdout, /BASE ROJA: el recorrido con el ruta\.js sin tocar no acaba/);
    assert.match(r.stdout, /las guardas no se pueden medir/);
    assert.doesNotMatch(r.stdout, /VIVA|cazada|SIN RESUMEN/);
  });
});

describe('los ids de los logros', () => {
  const DECIDIR = 'Hay que decidir qué pasa con lo ya guardado antes de tocar esto (ver servicio/README.md, «Cambiar la lista de logros»)';

  test('son los congelados: cualquier cambio obliga a decidir la migración', () => {
    const ahora = Object.fromEntries(MAXIMOS);
    const quitados = Object.keys(congelados.logros).filter(k => !(k in ahora));
    const recortados = Object.keys(congelados.logros).filter(k => k in ahora && ahora[k] !== congelados.logros[k]);
    const nuevos = Object.keys(ahora).filter(k => !(k in congelados.logros));
    assert.deepEqual({ quitados, recortados, nuevos }, { quitados: [], recortados: [], nuevos: [] }, DECIDIR);
  });

  test('cambiar el orden de la lista no cambia ningún id', () => {
    const revuelta = structuredClone(lista);
    revuelta.especies.reverse();
    revuelta.muertes.especies.reverse();
    for (const e of revuelta.especies) e.cazas.reverse();
    assert.deepEqual([...calcular(revuelta)].sort(), [...MAXIMOS].sort());
  });

  test('la tabla de los de antes lleva a ids que existen y no pisa ninguno de ahora', () => {
    const antiguos = Object.entries(lista.ids_antiguos);
    assert.equal(antiguos.length, 26 + 20);
    for (const [antes, ahora] of antiguos) {
      assert.ok(MAXIMOS.has(ahora), `${antes} lleva a ${ahora}, que no existe`);
      assert.ok(!MAXIMOS.has(antes), `${antes} sigue siendo un id de ahora: se confundirían`);
    }
    assert.equal(new Set(antiguos.map(([, ahora]) => ahora)).size, antiguos.length, 'dos de antes llevan al mismo');
    const [primera] = lista.muertes.especies;
    assert.equal(lista.ids_antiguos['fed-0'], `fed-${lista.especies.find(e => e.nombre === primera).id}`);
  });

  test('no repetir el tipo de cacería en una especie, ni nombrar una muerte por una especie que no existe', () => {
    const rota = structuredClone(lista);
    rota.especies[0].cazas.push({ ...rota.especies[0].cazas[0] });
    assert.throws(() => calcular(rota), /repetid/);
    const otra = structuredClone(lista);
    otra.muertes.especies.push('Nadie');
    assert.throws(() => calcular(otra), /no es una especie/);
  });
});

