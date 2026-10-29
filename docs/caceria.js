// Próxima Cacería del clan: cada sábado a las 22:00, hora peninsular española.
(() => {
  'use strict';
  const ZONA = 'Europe/Madrid';
  const SABADO = 6;
  const HORA = 22;
  const DURACION_MIN = 60;
  const DIAS = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

  const formato = new Intl.DateTimeFormat('en-GB', {
    timeZone: ZONA, hourCycle: 'h23', weekday: 'short',
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
  const partes = ms => {
    const p = Object.fromEntries(formato.formatToParts(ms).map(x => [x.type, x.value]));
    return { y: +p.year, m: +p.month, d: +p.day, h: +p.hour, mi: +p.minute, s: +p.second, dia: DIAS[p.weekday] };
  };
  // Diferencia entre la hora de Madrid y UTC en ese instante, en milisegundos.
  const desfase = ms => {
    const p = partes(ms);
    return Date.UTC(p.y, p.m - 1, p.d, p.h, p.mi, p.s) - Math.floor(ms / 1000) * 1000;
  };
  // Instante UTC de una hora de pared en Madrid. Basta una pasada porque los cambios de hora
  // ocurren de madrugada, lejos de las 22:00.
  const instante = (y, m, d, h) => {
    const aproximado = Date.UTC(y, m - 1, d, h);
    return aproximado - desfase(aproximado);
  };

  const proximaCaceria = ahora => {
    const p = partes(ahora);
    for (let extra = 0; extra <= 7; extra += 7) {
      const dias = (SABADO - p.dia + 7) % 7 + extra;
      const fecha = new Date(Date.UTC(p.y, p.m - 1, p.d + dias));
      const inicio = instante(fecha.getUTCFullYear(), fecha.getUTCMonth() + 1, fecha.getUTCDate(), HORA);
      const fin = inicio + DURACION_MIN * 60000;
      if (ahora < fin) return { inicio, enCurso: ahora >= inicio };
    }
    throw new Error('Sin próxima cacería');
  };

  const api = { proximaCaceria, ZONA };
  if (typeof module === 'object' && module.exports) { module.exports = api; return; }

  const caja = document.querySelector('[data-cuenta]');
  if (!caja) return;
  const nodoTiempo = caja.querySelector('time');
  const nodoFalta = caja.querySelector('[data-falta]');
  const nodoLocal = caja.querySelector('[data-local]');
  const TEXTOS = {
    es: { locale: 'es-ES', enCurso: 'Empezó a las 22:00: entra en la voz de caza.', faltan: 'Faltan ', local: 'En tu hora: ' },
    en: { locale: 'en-GB', enCurso: 'Started at 22:00: join the hunt voice channel.', faltan: 'Starts in ', local: 'Your time: ' },
  };
  const t = TEXTOS[document.documentElement.lang.slice(0, 2)] || TEXTOS.es;
  const fechaLarga = new Intl.DateTimeFormat(t.locale, { timeZone: ZONA, weekday: 'long', day: 'numeric', month: 'long' });
  const horaLocal = new Intl.DateTimeFormat(t.locale, { weekday: 'long', hour: '2-digit', minute: '2-digit' });
  const dos = n => String(n).padStart(2, '0');

  const pintar = () => {
    const ahora = Date.now();
    const { inicio, enCurso } = proximaCaceria(ahora);
    nodoTiempo.dateTime = new Date(inicio).toISOString();
    nodoTiempo.textContent = fechaLarga.format(inicio) + ', 22:00';
    if (enCurso) {
      nodoFalta.textContent = t.enCurso;
      caja.classList.add('en-curso');
    } else {
      const min = Math.ceil((inicio - ahora) / 60000);
      const d = Math.floor(min / 1440), h = Math.floor((min % 1440) / 60), m = min % 60;
      nodoFalta.textContent = t.faltan + (d ? `${d} d ` : '') + `${dos(h)} h ${dos(m)} min`;
      caja.classList.remove('en-curso');
    }
    const mismoDesfase = new Date(inicio).getTimezoneOffset() * -60000 === desfase(inicio);
    nodoLocal.hidden = mismoDesfase;
    if (!mismoDesfase) nodoLocal.textContent = t.local + horaLocal.format(inicio);
    caja.hidden = false;
  };
  pintar();
  setInterval(() => { if (!document.hidden) pintar(); }, 20000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) pintar(); });
})();
