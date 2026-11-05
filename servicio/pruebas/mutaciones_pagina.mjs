// Una prueba que no cae si se quita lo que vigila no sirve: se quita cada guarda de ruta.js y el recorrido debe fallar.
import { spawnSync } from 'node:child_process';
import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SERVICIO } from './banco.mjs';

const ORIGINAL = readFileSync(join(SERVICIO, '..', 'docs', 'ruta.js'), 'utf8');
const MUTANTE = join(tmpdir(), `ruta-mutante-${process.pid}.js`);
const ESPERA = Number(process.env.MUTACIONES_ESPERA) || 180000;

const GUARDAS = [
  ['guardar en el navegador', 'localStorage.setItem(CLAVE, JSON.stringify(almacen));', '', 'servicio caído con sesión'],
  ['la marca se manda al servicio', 'if (almacen.token) programarSubida();\n  }', '}', 'entrar: sabe'],
  ['subir no baja lo de otro dispositivo', "enviarLote(subidas, 'subir')", "enviarLote(subidas, 'fijar')", 'quitar una marca'],
  ['quitar una marca también baja', "enviarLote(bajadas, 'fijar')", "enviarLote(bajadas, 'subir')", 'quitar una marca'],
  ['el nombre como texto', "$('[data-nombre-miembro]').textContent = cuenta.nombre;", "$('[data-nombre-miembro]').innerHTML = cuenta.nombre;", 'un nombre con código'],
  ['el código no se queda en la dirección', "history.replaceState(null, '', location.pathname + location.search);", '', 'entrar: sabe'],
  ['otra cuenta no hereda', 'if (almacen.cuenta && almacen.cuenta !== datos.cuenta.discord_id) {', 'if (false) {', 'otra cuenta'],
  ['sin cuenta se pregunta', 'ofrecerImportar(nuevas);', "Object.assign(almacen.subidas, nuevas); programarSubida(0);", 'marcas sin cuenta'],
  ['la pregunta no se pierde', 'porImportar: sinCeros(sano(s.porImportar)),', 'porImportar: {},', 'marcas sin cuenta'],
  ['descartar descarta', "} else if ('importarNo' in b.dataset) {\n      almacen.porImportar = {};", "} else if ('importarNo' in b.dataset) {\n      Object.assign(almacen.subidas, almacen.porImportar); programarSubida(0); almacen.porImportar = {};", 'descartar las marcas'],
  ['comprobar el servicio antes de irse', "aviso(T.errores.no_disponible);\n      return;\n    }\n    servicioCaido = false;", 'servicioCaido = false;\n    }\n    servicioCaido = false;', 'servicio caído al entrar'],
  ['decir que está caído', 'servicioCaido = true;\n        pintarEstado();\n        programarSubida', 'programarSubida', 'servicio caído con sesión'],
  ['reintentar solo', 'programarSubida(ESPERAS[Math.min(intentos++, ESPERAS.length - 1)]);\n      }\n    } finally', '}\n    } finally', 'los reintentos'],
  ['lo pendiente manda sobre lo del servidor', 'for (const [k, v] of Object.entries(almacen.subidas)) marcas[k] = Math.max(marcas[k] || 0, v);', '', 'leer del servicio no pisa'],
  ['lo desmarcado manda sobre lo del servidor', "if (v > 0) marcas[k] = v;\n      else delete marcas[k];", '', 'leer del servicio no pisa'],
  ['entrar con marcas tras un fallo al leer', 'const anonimas = almacen.cuenta ? {} : { ...almacen.marcas };\n      almacen.cuenta = datos.cuenta.discord_id;', 'almacen.cuenta = datos.cuenta.discord_id;\n      const anonimas = {};', 'si falla la primera lectura'],
  ['caducada conserva lo pendiente', "almacen.caduca = 0;\n    cuenta = null;\n    historial = [];", 'almacen.caduca = 0;\n    almacen.subidas = {};\n    cuenta = null;\n    historial = [];', 'sesión caducada'],
  ['avisar de la sesión caducada', "if (r.status === 401) throw Object.assign(new Error('sesión'), { caducada: true });", '', 'sesión caducada'],
  ['otra pestaña', "if (e.key !== CLAVE && e.key !== null) return;\n    leer();", 'return;', 'dos pestañas'],
  ['limpiar lo guardado', "const sano = o => {\n    const fuera = {};\n    if (!o || typeof o !== 'object' || Array.isArray(o)) return fuera;", 'const sano = o => {\n    if (o) return o;\n    const fuera = {};', 'un almacén corrupto'],
  ['borrar también aquí', 'limpiarLocal();\n      aviso(T.borrado);', 'aviso(T.borrado);', 'borrar:'],
  ['no fingir el borrado', 'if (!r.ok) throw new Error(String(r.status));\n      limpiarLocal();\n      aviso(T.borrado);', 'limpiarLocal();\n      aviso(T.borrado);', 'si borrar falla'],
  ['pedir confirmación', "else if ('borrar' in b.dataset) ver('[data-confirmar]', true);", "else if ('borrar' in b.dataset) borrarTodo();", 'borrar:'],
  ['avisar al salir', 'if (frenarSalida()) return;\n    try { await pedir', 'try { await pedir', 'salir: avisa'],
  ['avisar al salir de todos', 'async function salirDeTodos() {\n    if (frenarSalida()) return;', 'async function salirDeTodos() {', 'también avisa'],
  ['tras bajar, lo último se fija', ' || Object.hasOwn(almacen.bajadas, id)', '', 'bajar y volver'],
  ['los tramos de más no cuentan', 'Math.min(almacen.marcas[id] || 0, MAXIMOS.get(id) || 0)', 'almacen.marcas[id] || 0', 'si cambia la lista'],
  ['una respuesta vieja no pisa', 'if (acusesAntes !== acuses) return refrescar();', '', 'una lectura lenta'],
  ['lo pendiente solo sube a su cuenta', ' || almacen.tokenDe !== almacen.cuenta', '', 'lo pendiente de una cuenta'],
  ['la copia espera al límite', 'if (r.status === 429 && frenazos++ < 5) {', 'if (false) {', 'la copia espera'],
  ['salir limpia', 'limpiarLocal();\n    aviso(T.salido);', 'aviso(T.salido);', 'salir: avisa'],
  ['el código nunca baja', 'if (v > nivel(k)) {\n        apuntar(k, v);', 'if (true) {\n        apuntar(k, v);', 'traer el código'],
  ['el código malo se dice', 'aviso(T.codigoMalo);\n      return;', 'datos = {};', 'traer el código'],
  ['copia por páginas', 'if (!desde) break;', 'break;', 'la copia del administrador'],
  ['copia solo para quien toca', "ver('[data-copia]', cuenta.admin === true);", "ver('[data-copia]', true);", 'la copia del administrador'],
  ['solo con servicio se ofrece entrar', "ver('[data-fuera]', !dentro && Boolean(SERVICIO));", "ver('[data-fuera]', !dentro);", 'sin servicio configurado'],
  ['errores por idioma', "if (error) aviso(Object.hasOwn(T.errores, error) ? T.errores[error] : T.errores.canje);", '', 'no miembro'],
  ['la sesión que toca se abre', 'actual.d.open = true;', '', 'la ruta:'],
  ['pendientes', 'f.hidden = soloPendientes &&', 'f.hidden = false &&', 'los filtros'],
  ['los ids de antes se traducen', 'const nuevo = ANTIGUOS.get(k) ?? k;', 'const nuevo = k;', 'ids por posición'],
  ['la dirección antigua no toca nada', "if (location.hostname === 'mmortexx.github.io') return;", '', 'dirección antigua'],
  ['lo rechazado se queda pendiente', 'almacen.subidas[k] === v && !retener.has(k)', 'almacen.subidas[k] === v', 'rechaza'],
  ['lo rechazado no se reintenta sin parar', '.filter(k => !retenidas.has(k))', '', 'rechaza'],
  ['sin servicio no se enseña una cuenta', 'const dentro = Boolean(SERVICIO && almacen.token && cuenta);', 'const dentro = Boolean(almacen.token && cuenta);', 'servicio apagado en la web'],
  ['sin servicio no finge guardar', 'else if (!SERVICIO) texto = T.sinServicio;\n    else if (caducada)', 'else if (caducada)', 'servicio apagado en la web'],
];

const SOLO = process.env.MUTACIONES_SOLO ? GUARDAS.slice(0, Number(process.env.MUTACIONES_SOLO)) : GUARDAS;

// Sin resumen no se sabe nada: se ha colgado o se ha caído el recorrido, y eso no es una guarda viva.
function recorrido(patron, espera = ESPERA) {
  const r = spawnSync(process.execPath, ['--test', '--test-reporter=spec', '--test-concurrency=1', ...(patron === null ? [] : [`--test-name-pattern=${patron}`]), 'pruebas/recorrido.mjs'], {
    cwd: SERVICIO, encoding: 'utf8', timeout: espera, env: { ...process.env, RUTA_JS: MUTANTE, CAPTURAS: '' },
  });
  const fallos = /^(?:ℹ|#) fail (\d+)/m.exec(r.stdout ?? '')?.[1];
  const buenas = /^(?:ℹ|#) pass (\d+)/m.exec(r.stdout ?? '')?.[1];
  if (fallos === undefined || buenas === undefined) return { sinResumen: r.error?.code ?? `salida ${r.status}` };
  return { fallos: Number(fallos), buenas: Number(buenas) };
}

// Una prueba inestable puede dar cualquier cosa una vez: antes de concluir, se repite.
function conReintento(patron) {
  const primera = recorrido(patron);
  if (primera.fallos > 0) return primera;
  const segunda = recorrido(patron);
  return segunda.fallos > 0 || segunda.sinResumen ? { ...segunda, aLaSegunda: true } : segunda;
}

// Si el recorrido ya falla con el ruta.js de verdad, «cazar» una guarda no demuestra nada: todo cae. Primero, en verde.
if (!process.env.MUTACIONES_SIN_BASE) {
  writeFileSync(MUTANTE, ORIGINAL);
  const base = recorrido(null, 5 * ESPERA);
  if (base.sinResumen || base.fallos > 0) {
    rmSync(MUTANTE, { force: true });
    console.log(`BASE ROJA: el recorrido con el ruta.js sin tocar ${base.sinResumen ? `no acaba (${base.sinResumen})` : `falla ${base.fallos} pruebas`}; las guardas no se pueden medir`);
    process.exit(2);
  }
  console.log(`base en verde: ${base.buenas} pruebas del recorrido pasan con el ruta.js sin tocar`);
}

let vivas = 0;
let sinResolver = 0;
for (const [que, texto, cambio, patron] of SOLO) {
  const veces = ORIGINAL.split(texto).length - 1;
  if (veces !== 1) {
    console.log(`MAL     ${que}: su texto sale ${veces} veces en ruta.js`);
    vivas++;
    continue;
  }
  writeFileSync(MUTANTE, ORIGINAL.replace(texto, () => cambio));
  const { fallos, buenas, sinResumen, aLaSegunda } = conReintento(patron);
  if (sinResumen) {
    console.log(`SIN RESUMEN  ${que}: el recorrido no ha acabado (${sinResumen}), repetido dos veces`);
    sinResolver++;
  } else if (fallos > 0) console.log(`cazada  ${que}  (${fallos} en rojo, ${buenas} en verde)${aLaSegunda ? ', a la segunda: prueba inestable' : ''}`);
  else if (buenas === 0) {
    console.log(`MAL     ${que}: «${patron}» no elige ninguna prueba`);
    vivas++;
  } else {
    console.log(`VIVA    ${que}  (${buenas} en verde)`);
    vivas++;
  }
}
rmSync(MUTANTE, { force: true });
console.log(`\n${SOLO.length - vivas - sinResolver} de ${SOLO.length} guardas quitadas se cazan`);
if (sinResolver) console.log(`${sinResolver} sin resolver: el recorrido no acabó, no son guardas vivas`);
process.exit(vivas || sinResolver ? 1 : 0);
