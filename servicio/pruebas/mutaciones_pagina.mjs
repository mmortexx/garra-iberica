// Una prueba que no cae si se quita lo que vigila no sirve: se quita cada guarda de ruta.js y el recorrido debe fallar.
import { spawnSync } from 'node:child_process';
import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SERVICIO } from './banco.mjs';

const ORIGINAL = readFileSync(join(SERVICIO, '..', 'docs', 'ruta.js'), 'utf8');
const MUTANTE = join(tmpdir(), `ruta-mutante-${process.pid}.js`);

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
  ['limpiar lo guardado', "const sano = o => {\n    const fuera = {};\n    if (!o || typeof o !== 'object') return fuera;", 'const sano = o => {\n    if (o) return o;\n    const fuera = {};', 'un almacén corrupto'],
  ['borrar también aquí', 'limpiarLocal();\n      aviso(T.borrado);', 'aviso(T.borrado);', 'borrar:'],
  ['no fingir el borrado', 'if (!r.ok) throw new Error(String(r.status));\n      limpiarLocal();\n      aviso(T.borrado);', 'limpiarLocal();\n      aviso(T.borrado);', 'borrar:'],
  ['pedir confirmación', "else if ('borrar' in b.dataset) ver('[data-confirmar]', true);", "else if ('borrar' in b.dataset) borrarTodo();", 'borrar:'],
  ['avisar al salir', 'if (n && !avisadoSalir) {', 'if (false) {', 'salir: avisa'],
  ['salir limpia', 'limpiarLocal();\n    aviso(T.salido);', 'aviso(T.salido);', 'salir: avisa'],
  ['el código nunca baja', 'if (v > nivel(k)) {\n        almacen.marcas[k] = v;\n        if (almacen.cuenta) {', 'if (true) {\n        almacen.marcas[k] = v;\n        if (almacen.cuenta) {', 'traer el código'],
  ['el código malo se dice', 'aviso(T.codigoMalo);\n      return;', 'datos = {};', 'traer el código'],
  ['copia por páginas', '} while (desde);', '} while (false);', 'la copia del administrador'],
  ['copia solo para quien toca', "ver('[data-copia]', cuenta.admin === true);", "ver('[data-copia]', true);", 'la copia del administrador'],
  ['solo con servicio se ofrece entrar', "ver('[data-fuera]', !dentro && Boolean(SERVICIO));", "ver('[data-fuera]', !dentro);", 'sin servicio configurado'],
  ['errores por idioma', "if (error) aviso(Object.hasOwn(T.errores, error) ? T.errores[error] : T.errores.canje);", '', 'no miembro'],
  ['la sesión que toca se abre', 'actual.d.open = true;', '', 'la ruta:'],
  ['pendientes', 'f.hidden = soloPendientes &&', 'f.hidden = false &&', 'los filtros'],
];

function recorrido(patron) {
  const r = spawnSync(process.execPath, ['--test', '--test-concurrency=1', `--test-name-pattern=${patron}`, 'pruebas/recorrido.mjs'], {
    cwd: SERVICIO, encoding: 'utf8', timeout: 180000, env: { ...process.env, RUTA_JS: MUTANTE, CAPTURAS: '' },
  });
  const fallos = /ℹ fail (\d+)/.exec(r.stdout)?.[1];
  const buenas = /ℹ pass (\d+)/.exec(r.stdout)?.[1];
  return { fallos: Number(fallos ?? -1), buenas: Number(buenas ?? -1) };
}

let vivas = 0;
for (const [que, texto, cambio, patron] of GUARDAS) {
  const veces = ORIGINAL.split(texto).length - 1;
  if (veces !== 1) {
    console.log(`MAL     ${que}: su texto sale ${veces} veces en ruta.js`);
    vivas++;
    continue;
  }
  writeFileSync(MUTANTE, ORIGINAL.replace(texto, () => cambio));
  const { fallos, buenas } = recorrido(patron);
  if (fallos > 0) console.log(`cazada  ${que}  (${fallos} en rojo, ${buenas} en verde)`);
  else {
    console.log(`VIVA    ${que}  (${buenas} en verde)`);
    vivas++;
  }
}
rmSync(MUTANTE, { force: true });
console.log(`\n${GUARDAS.length - vivas} de ${GUARDAS.length} guardas quitadas se cazan`);
process.exit(vivas ? 1 : 0);
