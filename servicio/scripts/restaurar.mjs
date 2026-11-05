// Convierte una copia de seguridad descargada de la web en órdenes SQL para volver a cargarla.
// Uso: node scripts/restaurar.mjs garra-iberica-copia.json > restaurar.sql
//      npx wrangler d1 execute garra-cuentas --remote --file=restaurar.sql
// Las sesiones no se copian: cada miembro vuelve a entrar. Solo añade: lo que ya esté en la base se queda como está
// (sustituir a un miembro borraría en cascada su progreso). Se salta a quien esté en borrados.local.txt (ver miembro.mjs).
// Ojo: lo que alguien borró con el botón de la web después de hacer la copia vuelve con ella (ver README.md).
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { leerBorrados } from './miembro.mjs';

const ID = /^\d{17,20}$/;
const LOGRO = /^[A-Za-z0-9_-]{1,64}$/;
const FECHA = /^\d{4}-\d{2}-\d{2}$/;
const CONTROL = /[\u0000-\u001f]/;

function texto(v, que) {
  if (typeof v !== 'string' || CONTROL.test(v)) throw new Error(`copia no válida: ${que}`);
  return `'${v.replaceAll("'", "''")}'`;
}

export function sqlDeCopia(copia, borrados = []) {
  if (copia?.formato !== 'garra-copia-1' || !Array.isArray(copia.miembros) || !Array.isArray(copia.progreso)) {
    throw new Error('no es una copia de seguridad de las cuentas');
  }
  const lineas = [];
  const fuera = new Set(borrados);
  for (const m of copia.miembros) {
    if (fuera.has(m.discord_id)) continue;
    if (!ID.test(m.discord_id ?? '') || !FECHA.test(m.desde ?? '') || !FECHA.test(m.ultimo_acceso ?? '')) throw new Error('copia no válida: miembro');
    lineas.push(`INSERT OR IGNORE INTO miembros (discord_id, nombre, desde, ultimo_acceso) VALUES ('${m.discord_id}', ${texto(m.nombre, 'nombre')}, '${m.desde}', '${m.ultimo_acceso}');`);
  }
  for (const p of copia.progreso) {
    if (fuera.has(p.discord_id)) continue;
    if (!ID.test(p.discord_id ?? '') || !LOGRO.test(p.logro ?? '') || !Number.isInteger(p.nivel) || p.nivel < 1 || !FECHA.test(p.fecha ?? '')) throw new Error('copia no válida: progreso');
    lineas.push(`INSERT OR IGNORE INTO progreso (discord_id, logro, nivel, fecha) VALUES ('${p.discord_id}', '${p.logro}', ${p.nivel}, '${p.fecha}');`);
  }
  return `${lineas.join('\n')}\n`;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (process.argv.length !== 3) {
    console.error('Uso: node scripts/restaurar.mjs COPIA.json > restaurar.sql');
    process.exit(2);
  }
  const borrados = leerBorrados();
  if (borrados.length) console.error(`Se salta a los ${borrados.length} de borrados.local.txt.`);
  process.stdout.write(sqlDeCopia(JSON.parse(readFileSync(process.argv[2], 'utf8')), borrados));
}
