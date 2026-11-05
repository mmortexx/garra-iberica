// Comportamiento del servicio, visto desde fuera: por HTTP, como lo ve la página o quien lo ataca.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { after, before, beforeEach, describe, test } from 'node:test';
import { MAXIMOS } from '../src/catalogo.js';
import {
  CLAVE_CLIENTE, GUILD, ORIGEN, PAGINA_EN, PAGINA_ES, SERVICIO, USUARIOS, URL_SERVICIO, aleatorio, aplicarEsquema,
  arrancarDiscord, arrancarServicio, huella, retoDe,
} from './banco.mjs';

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
    const j = await (await marcar(t, [{ logro: 'ovi-exp', nivel: 1 }, { logro: 'fed-13', nivel: 2 }])).json();
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
    assert.deepEqual([todo.miembros.length, todo.progreso.length, todo.sesiones.length, todo.entradas.length], [0, 0, 0, 0]);
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
    for (const origen of ['https://malo.prueba', 'https://mmortexx.github.io.malo.prueba', 'http://mmortexx.github.io', 'https://mmortexx.github.io:8443', 'null', 'https://otro.github.io']) {
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
