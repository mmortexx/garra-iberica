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

  // Lo que falta, en días, horas, minutos y segundos. Los segundos se redondean hacia arriba
  // para que la cuenta no marque 0 antes de tiempo.
  const restante = ms => {
    const t = Math.max(0, Math.ceil(ms / 1000));
    return { d: Math.floor(t / 86400), h: Math.floor((t % 86400) / 3600), m: Math.floor((t % 3600) / 60), s: t % 60 };
  };

  const api = { proximaCaceria, restante, ZONA };
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
  const sinMovimiento = matchMedia('(prefers-reduced-motion: reduce)');
  const dos = n => String(n).padStart(2, '0');

  // Las cifras van en piezas propias para cambiar solo la que cambia y animar los segundos.
  const piezas = {};
  let montada = false, ultimoInicio = 0;
  const montar = () => {
    nodoFalta.replaceChildren(t.faltan);
    for (const [k, sufijo] of [['d', ' d '], ['h', ' h '], ['m', ' min '], ['s', ' s']]) {
      const grupo = document.createElement('span');
      const cifra = document.createElement('span');
      cifra.className = 'n';
      grupo.append(cifra, sufijo);
      nodoFalta.append(grupo);
      piezas[k] = { grupo, cifra };
    }
    montada = true;
  };
  const poner = (k, texto) => {
    const { cifra } = piezas[k];
    if (cifra.textContent === texto) return;
    cifra.textContent = texto;
    if (k === 's' && !sinMovimiento.matches && cifra.animate) {
      cifra.animate([{ opacity: 0.2, transform: 'translateY(-40%)' }, { opacity: 1, transform: 'none' }], { duration: 350, easing: 'cubic-bezier(.16, 1, .3, 1)' });
    }
  };

  const pintar = () => {
    const ahora = Date.now();
    const { inicio, enCurso } = proximaCaceria(ahora);
    if (inicio !== ultimoInicio) {
      ultimoInicio = inicio;
      nodoTiempo.dateTime = new Date(inicio).toISOString();
      nodoTiempo.textContent = fechaLarga.format(inicio) + ', 22:00';
      const mismoDesfase = new Date(inicio).getTimezoneOffset() * -60000 === desfase(inicio);
      nodoLocal.hidden = mismoDesfase;
      if (!mismoDesfase) nodoLocal.textContent = t.local + horaLocal.format(inicio);
    }
    if (enCurso) {
      if (montada) { nodoFalta.textContent = t.enCurso; montada = false; }
      else if (nodoFalta.textContent !== t.enCurso) nodoFalta.textContent = t.enCurso;
      caja.classList.add('en-curso');
    } else {
      if (!montada) montar();
      const r = restante(inicio - ahora);
      piezas.d.grupo.hidden = r.d === 0;
      poner('d', String(r.d));
      poner('h', dos(r.h));
      poner('m', dos(r.m));
      poner('s', dos(r.s));
      caja.classList.remove('en-curso');
    }
    caja.hidden = false;
  };

  // Un tic por segundo, solo mientras la caja se ve y la pestaña está delante.
  let reloj = 0, aLaVista = false;
  const encender = () => {
    if (reloj || !aLaVista || document.hidden) return;
    pintar();
    reloj = setInterval(pintar, 1000);
  };
  const apagar = () => { clearInterval(reloj); reloj = 0; };
  pintar();
  new IntersectionObserver(([e]) => { aLaVista = e.isIntersecting; aLaVista ? encender() : apagar(); }).observe(caja);
  document.addEventListener('visibilitychange', () => (document.hidden ? apagar() : encender()));
})();
