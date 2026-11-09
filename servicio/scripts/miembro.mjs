// Atender a quien pide sus datos o su borrado y ya no puede entrar (por ejemplo, porque dejó el clan). Ver README.md.
// Uso, dentro de servicio/:
//   node scripts/miembro.mjs exportar ID > datos.json     lo que hay de ese miembro, para enviárselo
//   node scripts/miembro.mjs borrar ID                    lo borra y lo anota en borrados.local.txt
//   node scripts/miembro.mjs reborrar                     vuelve a borrar a todos los anotados (tras recuperar la base)
// Con --local trabaja sobre la base de pruebas de este ordenador en vez de la publicada.
import { spawnSync } from 'node:child_process';
import { appendFileSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

export const BORRADOS = join(import.meta.dirname, '..', 'borrados.local.txt');
const ID = /^\d{17,20}$/;

function validar(id) {
  if (!ID.test(id ?? '')) throw new Error(`«${id}» no es un identificador de Discord`);
  return id;
}

// La lista de borrados no se sube nunca (*.local.txt): son identificadores de personas.
export function leerBorrados(fichero = BORRADOS) {
  if (!existsSync(fichero)) return [];
  return [...new Set(readFileSync(fichero, 'utf8').split(/\r?\n/).map(l => l.trim()).filter(Boolean))].map(validar);
}

export const sqlExportar = id => [
  `SELECT discord_id, nombre, desde, ultimo_acceso FROM miembros WHERE discord_id = '${validar(id)}'`,
  `SELECT logro, nivel, fecha FROM progreso WHERE discord_id = '${validar(id)}' ORDER BY logro, nivel`,
];

// Las sesiones, los códigos de entrada, el progreso y el contador diario caen en cascada con el miembro.
export const sqlBorrar = id => `DELETE FROM miembros WHERE discord_id = '${validar(id)}'`;

function wrangler(sql, sitio) {
  const servicio = join(import.meta.dirname, '..');
  const programa = join(servicio, 'node_modules', 'wrangler', 'bin', 'wrangler.js');
  const r = spawnSync(process.execPath, [programa, 'd1', 'execute', 'garra-cuentas', sitio, '--json', '--command', sql], { cwd: servicio, encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`wrangler no ha podido: ${(r.stderr || r.stdout || r.error?.message || '').slice(0, 500)}`);
  return JSON.parse(r.stdout)[0];
}

function principal([accion, ...resto]) {
  const local = resto.includes('--local');
  const sitio = local ? '--local' : '--remote';
  const [id] = resto.filter(a => a !== '--local');
  if (accion === 'exportar') {
    const [miembros, progreso] = sqlExportar(id).map(sql => wrangler(sql, sitio).results);
    if (!miembros.length) throw new Error('no hay nada guardado de ese miembro');
    process.stdout.write(`${JSON.stringify({ formato: 'garra-datos-1', miembro: miembros[0], progreso }, null, 2)}\n`);
  } else if (accion === 'borrar') {
    const cuantos = () => wrangler(`SELECT COUNT(*) AS n FROM miembros WHERE discord_id = '${validar(id)}'`, sitio).results[0].n;
    const habia = cuantos();
    wrangler(sqlBorrar(id), sitio);
    if (cuantos() !== 0) throw new Error('sigue en la base: no se ha borrado');
    // Se anota aunque no hubiera nada: puede seguir en una copia antigua.
    if (!leerBorrados().includes(id)) appendFileSync(BORRADOS, `${id}\n`);
    console.error(habia ? `Borrado ${id}.` : `No había nada de ${id} en la base; queda anotado para las copias antiguas.`);
  } else if (accion === 'reborrar') {
    const lista = leerBorrados();
    for (const borrado of lista) wrangler(sqlBorrar(borrado), sitio);
    console.error(`Vueltos a borrar: ${lista.length}.`);
  } else {
    throw new Error('Uso: node scripts/miembro.mjs exportar ID | borrar ID | reborrar [--local]');
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    principal(process.argv.slice(2));
  } catch (e) {
    console.error(e.message);
    process.exit(1);
  }
}
