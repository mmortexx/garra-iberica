// Uso: node herramientas/prueba_caceria.js [ruta a caceria.js]
const assert = require('node:assert/strict');
const path = require('node:path');
const { proximaCaceria } = require(path.resolve(process.argv[2] || path.join(__dirname, '..', 'docs', 'caceria.js')));

const casos = [
  ['jueves, horario de invierno', '2026-10-29T12:00:00Z', '2026-10-31T21:00:00Z', false],
  ['sábado 21:59:59 en Madrid', '2026-10-31T20:59:59Z', '2026-10-31T21:00:00Z', false],
  ['sábado 22:00 en Madrid: empieza', '2026-10-31T21:00:00Z', '2026-10-31T21:00:00Z', true],
  ['sábado 22:30 en Madrid: en marcha', '2026-10-31T21:30:00Z', '2026-10-31T21:00:00Z', true],
  ['sábado 23:00 en Madrid: ya acabó', '2026-10-31T22:00:00Z', '2026-11-07T21:00:00Z', false],
  ['domingo 00:30 en Madrid', '2026-10-31T23:30:00Z', '2026-11-07T21:00:00Z', false],
  ['sábado de horario de verano', '2026-10-24T10:00:00Z', '2026-10-24T20:00:00Z', false],
  ['acaba en verano, la siguiente ya es en invierno', '2026-10-24T21:00:00Z', '2026-10-31T21:00:00Z', false],
  ['sábado antes del cambio de marzo', '2026-03-28T12:00:00Z', '2026-03-28T21:00:00Z', false],
  ['la siguiente ya es en horario de verano', '2026-03-28T22:30:00Z', '2026-04-04T20:00:00Z', false],
  ['fin de año', '2026-12-31T23:00:00Z', '2027-01-02T21:00:00Z', false],
];

let fallos = 0;
for (const [nombre, ahora, inicio, enCurso] of casos) {
  try {
    const r = proximaCaceria(Date.parse(ahora));
    assert.equal(new Date(r.inicio).toISOString(), new Date(inicio).toISOString());
    assert.equal(r.enCurso, enCurso);
    console.log('ok   ', nombre);
  } catch (e) {
    fallos++;
    console.log('FALLO', nombre, '→', e.message.split('\n')[0]);
  }
}
console.log(fallos ? `${fallos} fallos` : `Todo correcto (${casos.length} casos)`);
process.exit(fallos ? 1 : 0);
