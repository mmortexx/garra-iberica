// Cuánto tarda el servicio con mil veces más datos que hoy: 13.000 miembros con todos los tramos marcados, el peor caso.
// Uso: npm run medir   (tarda; la base de prueba se borra al acabar)
// Mide en local, con el motor de Cloudflare. No mide los 10 ms de procesador del plan gratuito, que solo se ven publicado.
import { MAXIMOS } from '../src/catalogo.js';
import { aleatorio, arrancarDiscord, arrancarServicio, huella, USUARIOS } from './banco.mjs';

const MIEMBROS = Number(process.env.MIEMBROS ?? 13000);
const PASADAS = 3;
const VECES = 50;
const LOTE = 500;

const tramos = [...MAXIMOS].flatMap(([logro, max]) => Array.from({ length: max }, (_, i) => [logro, i + 1]));
const idDe = i => String(300000000000000000n + BigInt(i));

const discord = await arrancarDiscord();
const s = await arrancarServicio({ discord });
const { db } = s;

console.log(`Llenando: ${MIEMBROS} miembros, ${tramos.length} tramos cada uno, ${MIEMBROS * tramos.length} filas`);
const t0 = Date.now();
let tamano = 0;
for (let i = 0; i < MIEMBROS; i += LOTE) {
  const ids = Array.from({ length: Math.min(LOTE, MIEMBROS - i) }, (_, k) => idDe(i + k));
  const lista = JSON.stringify(ids);
  const [, r] = await db.batch([
    db.prepare("INSERT INTO miembros (discord_id, nombre, desde, ultimo_acceso) SELECT j.value, 'Miembro de prueba', '2026-11-05', '2026-11-05' FROM json_each(?1) j").bind(lista),
    db.prepare(`INSERT INTO progreso (discord_id, logro, nivel, fecha) SELECT m.value, t.value ->> '$[0]', t.value ->> '$[1]', '2026-11-05'
      FROM json_each(?1) m, json_each(?2) t`).bind(lista, JSON.stringify(tramos)),
  ]);
  tamano = r.meta.size_after ?? tamano;
}
console.log(`Lleno en ${Math.round((Date.now() - t0) / 1000)} s. Tamaño de la base: ${(tamano / 1048576).toFixed(0)} MB`);
const { n } = await db.prepare('SELECT COUNT(*) AS n FROM progreso').first();
if (n !== MIEMBROS * tramos.length) throw new Error(`faltan filas: ${n}`);

const quien = idDe(Math.floor(MIEMBROS / 2));
const token = aleatorio();
await db.prepare('INSERT INTO sesiones (huella, discord_id, caduca) VALUES (?1, ?2, ?3)').bind(huella(token), quien, Date.now() + 864e5).run();
const admin = aleatorio();
await db.prepare("INSERT INTO miembros (discord_id, nombre, desde, ultimo_acceso) VALUES (?1, 'Jefa', '2026-11-05', '2026-11-05')").bind(USUARIOS.admin.id).run();
await db.prepare('INSERT INTO sesiones (huella, discord_id, caduca) VALUES (?1, ?2, ?3)').bind(huella(admin), USUARIOS.admin.id, Date.now() + 864e5).run();

const cambios = [...MAXIMOS].slice(0, 50).map(([logro, max]) => ({ logro, nivel: max }));
const CASOS = {
  'GET /yo (un miembro con todo marcado)': () => s.pedir('/yo', { token }),
  'PUT /yo/progreso (50 logros, modo fijar)': () => s.pedir('/yo/progreso', { method: 'PUT', token, cuerpo: { cambios, modo: 'fijar' } }),
  'GET /yo con una sesión inventada': () => s.pedir('/yo', { token: aleatorio() }),
  'GET /admin/copia (página de 1000 filas, a mitad)': () => s.pedir(`/admin/copia?tabla=progreso&desde=${encodeURIComponent(`${quien}|allo-add|1`)}`, { token: admin }),
};

const resultados = {};
for (const [que, pedir] of Object.entries(CASOS)) {
  const medias = [];
  for (let p = 0; p < PASADAS; p++) {
    const veces = [];
    for (let i = 0; i < VECES; i++) {
      const t = performance.now();
      const r = await pedir();
      await r.arrayBuffer();
      if (r.status !== 200 && r.status !== 401) throw new Error(`${que}: ${r.status}`);
      veces.push(performance.now() - t);
    }
    veces.sort((a, b) => a - b);
    medias.push({ mediana: veces[VECES >> 1], p95: veces[Math.floor(VECES * 0.95)] });
  }
  resultados[que] = medias;
  const rango = c => `${Math.min(...medias.map(m => m[c])).toFixed(1)}–${Math.max(...medias.map(m => m[c])).toFixed(1)} ms`;
  console.log(`${que}: mediana ${rango('mediana')}, p95 ${rango('p95')}`);
}

await s.parar();
await discord.parar();
