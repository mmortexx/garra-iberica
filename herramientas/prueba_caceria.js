// Uso: node herramientas/prueba_caceria.js [ruta a caceria.js]
const assert = require('node:assert/strict');
const path = require('node:path');
const { proximaCaceria, restante, planCrecer, semana, enZona } = require(path.resolve(process.argv[2] || path.join(__dirname, '..', 'docs', 'caceria.js')));

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
// Lo que falta, como se muestra en la cuenta atrás.
const tiempos = [
  ['un día, una hora, un minuto y un segundo', 90061000, { d: 1, h: 1, m: 1, s: 1 }],
  ['medio segundo cuenta como un segundo', 500, { d: 0, h: 0, m: 0, s: 1 }],
  ['justo a la hora', 0, { d: 0, h: 0, m: 0, s: 0 }],
  ['negativo no baja de cero', -5000, { d: 0, h: 0, m: 0, s: 0 }],
  ['una semana menos un segundo', 7 * 86400000 - 1000, { d: 6, h: 23, m: 59, s: 59 }],
];
for (const [nombre, ms, esperado] of tiempos) {
  try {
    assert.deepEqual(restante(ms), esperado);
    console.log('ok   ', nombre);
  } catch (e) {
    fallos++;
    console.log('FALLO', nombre, '→', e.message.split('\n')[0]);
  }
}

// Planificador de la guía: ¿llega adulto a la próxima cacería que no haya empezado?
const planes = [
  // [nombre, ahora, minutos a 1×, multiplicador, cacería esperada, llega, margen en minutos]
  ['T. rex el viernes a mediodía: no llega', '2026-10-30T12:00:00Z', 2133, 1, '2026-10-31T21:00:00Z', false, 33 * 60 - 2133],
  ['Hypsilophodon el sábado por la tarde: llega', '2026-10-31T15:00:00Z', 110, 1, '2026-10-31T21:00:00Z', true, 360 - 110],
  ['justo a la hora: llega', '2026-10-31T19:00:00Z', 120, 1, '2026-10-31T21:00:00Z', true, 0],
  ['un minuto tarde: no llega', '2026-10-31T19:01:00Z', 120, 1, '2026-10-31T21:00:00Z', false, -1],
  ['con 2× tarda la mitad y llega', '2026-10-30T12:00:00Z', 2133, 2, '2026-10-31T21:00:00Z', true, 33 * 60 - 1067],
  ['durante la cacería, apunta a la del sábado siguiente', '2026-10-31T21:30:00Z', 600, 1, '2026-11-07T21:00:00Z', true, 7 * 24 * 60 - 30 - 600],
];
for (const [nombre, ahora, minutos, mult, inicio, llega, margen] of planes) {
  try {
    const r = planCrecer(Date.parse(ahora), minutos, mult);
    assert.equal(new Date(r.inicio).toISOString(), new Date(inicio).toISOString());
    assert.equal(r.llega, llega);
    assert.equal(r.margen, margen * 60000);
    console.log('ok   ', nombre);
  } catch (e) {
    fallos++;
    console.log('FALLO', nombre, '→', e.message.split('\n')[0]);
  }
}

// La semana de cada cacería: encuesta el miércoles y aviso el sábado, a las 20:00 de Madrid.
const semanas = [
  // [nombre, inicio de la cacería, encuesta, aviso]
  ['invierno', '2026-10-31T21:00:00Z', '2026-10-28T19:00:00Z', '2026-10-31T19:00:00Z'],
  ['verano', '2026-10-24T20:00:00Z', '2026-10-21T18:00:00Z', '2026-10-24T18:00:00Z'],
  ['última de invierno', '2026-03-28T21:00:00Z', '2026-03-25T19:00:00Z', '2026-03-28T19:00:00Z'],
  ['primera de verano', '2026-04-04T20:00:00Z', '2026-04-01T18:00:00Z', '2026-04-04T18:00:00Z'],
  ['encuesta en el mes anterior', '2027-01-02T21:00:00Z', '2026-12-30T19:00:00Z', '2027-01-02T19:00:00Z'],
];
for (const [nombre, inicio, encuesta, aviso] of semanas) {
  try {
    const s = semana(Date.parse(inicio));
    assert.equal(new Date(s.caceria).toISOString(), new Date(inicio).toISOString());
    assert.equal(new Date(s.encuesta).toISOString(), new Date(encuesta).toISOString());
    assert.equal(new Date(s.recordatorio).toISOString(), new Date(aviso).toISOString());
    console.log('ok   ', 'semana:', nombre);
  } catch (e) {
    fallos++;
    console.log('FALLO', 'semana:', nombre, '→', e.message.split('\n')[0]);
  }
}

// La hora de la cacería del 31 de octubre de 2026 en otros países, como sale en el selector.
const zonas = [
  ['España', 'Europe/Madrid', 'sábado', '22:00'],
  ['Canarias', 'Atlantic/Canary', 'sábado', '21:00'],
  ['Argentina', 'America/Argentina/Buenos_Aires', 'sábado', '18:00'],
  ['Chile, en su horario de verano', 'America/Santiago', 'sábado', '18:00'],
  ['Colombia', 'America/Bogota', 'sábado', '16:00'],
  ['México (centro), sin cambio de hora', 'America/Mexico_City', 'sábado', '15:00'],
  ['Tijuana, aún en horario de verano', 'America/Tijuana', 'sábado', '14:00'],
];
for (const [nombre, zona, dia, hora] of zonas) {
  try {
    assert.deepEqual(enZona(Date.parse('2026-10-31T21:00:00Z'), zona, 'es-ES'), { dia, hora });
    console.log('ok   ', 'hora en', nombre);
  } catch (e) {
    fallos++;
    console.log('FALLO', 'hora en', nombre, '→', e.message.split('\n')[0]);
  }
}
try {
  assert.equal(enZona(0, 'Marte/Olympus', 'es-ES'), null);
  console.log('ok   ', 'una zona desconocida no rompe la página');
} catch (e) {
  fallos++;
  console.log('FALLO', 'una zona desconocida no rompe la página', '→', e.message.split('\n')[0]);
}

const total = casos.length + tiempos.length + planes.length + semanas.length + zonas.length + 1;
console.log(fallos ? `${fallos} fallos` : `Todo correcto (${total} casos)`);
process.exit(fallos ? 1 : 0);
