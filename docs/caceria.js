// Próxima Cacería del clan: cada sábado a las 22:00, hora peninsular española.
(() => {
  'use strict';
  const ZONA = 'Europe/Madrid';
  const SABADO = 6;
  const HORA = 22;
  const DURACION_MIN = 60;
  // Encuesta y aviso de cada semana: [día (1 = lunes), hora], en Madrid.
  const AVISOS = { encuesta: [3, 20], recordatorio: [6, 20] };
  const DIAS = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

  // El primer formateador de hora de la página es lo más caro de este script (unos 45 ms en un móvil
  // lento): se crea al necesitarlo, no al cargar.
  let formato;
  const partes = ms => {
    formato ||= new Intl.DateTimeFormat('en-GB', {
      timeZone: ZONA, hourCycle: 'h23', weekday: 'short',
      year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
    });
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

  // ¿Llego adulto a la cacería? Con el crecimiento de la ficha (minutos de juego a 1×), el
  // multiplicador del servidor y las horas de juego al día: cuándo sería adulto desde ahora, cuánto
  // sobra (o falta, en negativo) hasta la próxima cacería que aún no ha empezado y a cuál llegaría.
  const planCrecer = (ahora, minutos, multiplicador = 1, horasDia = 24) => {
    const sinEmpezar = t => {
      const c = proximaCaceria(t);
      return c.enCurso ? proximaCaceria(c.inicio + DURACION_MIN * 60000).inicio : c.inicio;
    };
    const inicio = sinEmpezar(ahora);
    const adulto = ahora + Math.ceil(minutos / multiplicador * 24 / horasDia) * 60000;
    return { inicio, adulto, llega: adulto <= inicio, margen: inicio - adulto, alcanza: adulto <= inicio ? inicio : sinEmpezar(adulto) };
  };

  // La encuesta y el aviso de la misma semana que la cacería que empieza en «inicio».
  const semana = inicio => {
    const p = partes(inicio);
    const avisos = {};
    for (const [que, [dia, hora]] of Object.entries(AVISOS)) {
      const fecha = new Date(Date.UTC(p.y, p.m - 1, p.d - (SABADO - dia + 7) % 7));
      avisos[que] = instante(fecha.getUTCFullYear(), fecha.getUTCMonth() + 1, fecha.getUTCDate(), hora);
    }
    return { caceria: inicio, ...avisos };
  };

  // Día y hora de un instante en otra zona («» = la del dispositivo). Una zona que el navegador
  // no conoce da null en vez de romper la página.
  // Crear un formateador es lo que cuesta (decenas de ms en un móvil lento): uno por zona e idioma.
  const formateadores = new Map();
  const enZona = (ms, zona, locale) => {
    try {
      const clave = `${locale}|${zona}`;
      if (!formateadores.has(clave)) formateadores.set(clave, new Intl.DateTimeFormat(locale, { timeZone: zona || undefined, weekday: 'long', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }));
      const p = Object.fromEntries(formateadores.get(clave).formatToParts(ms).map(x => [x.type, x.value]));
      return { dia: p.weekday, hora: `${p.hour}:${p.minute}` };
    } catch (e) {
      return null;
    }
  };

  const api = { proximaCaceria, restante, planCrecer, semana, enZona, ZONA };
  if (typeof module === 'object' && module.exports) { module.exports = api; return; }

  // ¿A qué hora es en tu país? Cambia el resultado y las horas de «Así va cada semana». Los países
  // y los textos vienen en la página, en su idioma; sin JavaScript se quedan las horas de España.
  const horas = document.querySelector('[data-horas]');
  if (horas) {
    const lista = horas.querySelector('select');
    const salida = horas.querySelector('[data-resultado]');
    const textos = horas.dataset;
    const titulos = document.querySelectorAll('[data-aviso]');
    const rotulo = document.querySelector('[data-horas-rotulo]');
    const calcular = () => {
      const s = semana(proximaCaceria(Date.now()).inicio);
      const zona = lista.value;
      const v = Object.fromEntries(Object.entries(s).map(([k, ms]) => [k, enZona(ms, zona, textos.locale)]));
      if (Object.values(v).includes(null)) { horas.hidden = true; return; }
      const cuando = k => `${v[k].dia[0].toUpperCase()}${v[k].dia.slice(1)}, ${v[k].hora}`;
      const pais = lista.selectedOptions[0].text.replace(/ \(.*/, '');
      for (const t of titulos) t.textContent = cuando(t.dataset.aviso);
      rotulo.textContent = zona ? textos.rotulo.replace('{pais}', pais) : textos.rotuloPropio;
      const titulo = document.createElement('b');
      titulo.textContent = cuando('caceria');
      salida.replaceChildren(titulo, zona ? textos.texto : textos.textoPropio);
    };
    const quieto = matchMedia('(prefers-reduced-motion: reduce)');
    lista.addEventListener('change', () => {
      calcular();
      // Las horas nuevas entran un poco para que se vea que han cambiado, también las de la semana.
      if (quieto.matches || !salida.animate) return;
      for (const el of [salida, ...titulos]) el.animate([{ opacity: 0.25, transform: 'translateY(6px)' }, { opacity: 1, transform: 'none' }], { duration: 380, easing: 'cubic-bezier(.16, 1, .3, 1)' });
    });
    document.addEventListener('visibilitychange', () => { if (!document.hidden) calcular(); });
    horas.hidden = false;
    // En su propia tarea, cuando el navegador respire: la cuenta atrás ya está pintada y abrir la
    // página no se bloquea por esto.
    const elegir = () => {
      const propia = new Intl.DateTimeFormat(textos.locale).resolvedOptions().timeZone;
      const elegida = [...lista.options].find(o => o.value && (o.value === propia || (o.dataset.alias || '').split(' ').includes(propia)));
      if (elegida && !lista.value) lista.value = elegida.value;
      calcular();
    };
    if (window.requestIdleCallback) requestIdleCallback(elegir, { timeout: 300 }); else setTimeout(elegir);
  }

  // Planificador de la guía de dinosaurios. Los textos vienen en la página, en su idioma.
  const plan = document.querySelector('[data-plan]');
  if (plan) {
    const [especie, ritmo, horas] = plan.querySelectorAll('select');
    const salida = plan.querySelector('[data-resultado]');
    const u = JSON.parse(plan.dataset.unidades);
    const quieto = matchMedia('(prefers-reduced-motion: reduce)');
    let primera = true;
    const cuando = new Intl.DateTimeFormat(plan.dataset.locale, { timeZone: ZONA, weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
    const duracion = ms => {
      const r = restante(ms);
      const partes = [];
      if (r.d) partes.push(`${r.d} ${u.d[r.d === 1 ? 0 : 1]}`);
      if (r.h) partes.push(`${r.h} ${u.h}`);
      if (r.m || !partes.length) partes.push(`${r.m} ${u.m}`);
      return partes.join(' ');
    };
    const calcular = () => {
      const op = especie.selectedOptions[0];
      const p = planCrecer(Date.now(), +op.value, +ritmo.value, +horas.value);
      const datos = { dino: op.dataset.nombre, adulto: cuando.format(p.adulto), caceria: cuando.format(p.inicio), alcanza: cuando.format(p.alcanza), tiempo: duracion(Math.abs(p.margen)) };
      const titulo = document.createElement('b');
      titulo.textContent = p.llega ? plan.dataset.siTitulo : plan.dataset.noTitulo;
      const texto = (p.llega ? plan.dataset.si : plan.dataset.no).replace(/\{(\w+)\}/g, (_, k) => datos[k]);
      const partes = [titulo, texto];
      if (op.dataset.nota) {
        const nota = document.createElement('span');
        nota.className = 'plan-nota';
        nota.textContent = op.dataset.nota;
        partes.push(nota);
      }
      salida.replaceChildren(...partes);
      salida.className = 'plan-resultado ' + (p.llega ? 'si' : 'no');
      // Al cambiar la elección, el resultado entra de nuevo para que se note que ha cambiado.
      if (!primera && !quieto.matches && salida.animate) salida.animate([{ opacity: 0.25, transform: 'translateY(6px)' }, { opacity: 1, transform: 'none' }], { duration: 380, easing: 'cubic-bezier(.16, 1, .3, 1)' });
      primera = false;
    };
    // Lo elegido va en la dirección (?especie=triceratops&ritmo=2&horas=4#planificador): así se pasa el
    // enlace y la página de cada especie abre el planificador con ella ya puesta.
    const claves = { especie: o => o.dataset.ancla, ritmo: o => o.value, horas: o => o.value };
    const campos = { especie, ritmo, horas };
    const pedidos = new URLSearchParams(location.search);
    for (const [nombre, sel] of Object.entries(campos)) {
      const elegida = [...sel.options].find(o => claves[nombre](o) === pedidos.get(nombre));
      if (elegida) sel.value = elegida.value;
    }
    plan.addEventListener('change', () => {
      calcular();
      const url = new URL(location.href);
      for (const [nombre, sel] of Object.entries(campos)) {
        if (sel.selectedIndex) url.searchParams.set(nombre, claves[nombre](sel.selectedOptions[0])); else url.searchParams.delete(nombre);
      }
      url.hash = plan.closest('section').id;
      history.replaceState(history.state, '', url);
    });
    // La cuenta cambia con la hora: se rehace al volver a la pestaña.
    document.addEventListener('visibilitychange', () => { if (!document.hidden) calcular(); });
    calcular();
    plan.hidden = false;
  }

  const caja = document.querySelector('[data-cuenta]');
  if (!caja) return;
  const nodoTiempo = caja.querySelector('time');
  const nodoFalta = caja.querySelector('[data-falta]');
  const nodoLocal = caja.querySelector('[data-local]');
  const nodoTitulo = caja.querySelector('.cuenta-titulo');
  const tituloNormal = nodoTitulo.textContent;
  const TEXTOS = {
    es: {
      locale: 'es-ES', enCurso: 'Ya ha empezado: entra en Cacería 1.', tituloEnCurso: 'Cacería en marcha', faltan: 'Faltan ', espana: ' en España', reserva: 'sábado, 30 de noviembre, 22:00',
      unidades: { d: ['día', 'días'], h: ['hora', 'horas'], m: ['min', 'min'], s: ['seg', 'seg'] },
    },
    en: {
      locale: 'en-GB', enCurso: 'It has started: join the Cacería 1 voice channel.', tituloEnCurso: 'Hunt under way', faltan: 'Starts in ', espana: ' in Spain', reserva: 'Saturday 30 November at 22:00',
      unidades: { d: ['day', 'days'], h: ['hour', 'hours'], m: ['min', 'min'], s: ['sec', 'sec'] },
    },
  };
  const t = TEXTOS[document.documentElement.lang.slice(0, 2)] || TEXTOS.es;
  const sinMovimiento = matchMedia('(prefers-reduced-motion: reduce)');
  const dos = n => String(n).padStart(2, '0');

  // Cada unidad es un bloque (cifra y nombre) para cambiar solo lo que cambia y que caiga la cifra
  // nueva. «Faltan» queda para los lectores de pantalla; a la vista lo dicen los bloques.
  const piezas = {};
  let montada = false, ultimoInicio = 0, yaPintada = false;
  const montar = () => {
    const previo = document.createElement('span');
    previo.className = 'oculto';
    previo.textContent = t.faltan;
    nodoFalta.replaceChildren(previo);
    for (const k of ['d', 'h', 'm', 's']) {
      const grupo = document.createElement('span');
      const cifra = document.createElement('span');
      const nombre = document.createElement('span');
      grupo.className = 't';
      cifra.className = 'n';
      nombre.className = 'u';
      cifra.textContent = '00';
      nombre.textContent = t.unidades[k][1];
      grupo.append(cifra, ' ', nombre);
      nodoFalta.append(grupo);
      piezas[k] = { grupo, cifra, nombre };
    }
    montada = true;
  };
  const poner = (k, valor, texto) => {
    const { cifra, nombre } = piezas[k];
    const unidad = t.unidades[k][valor === 1 ? 0 : 1];
    if (nombre.textContent !== unidad) nombre.textContent = unidad;
    if (cifra.textContent === texto) return;
    cifra.textContent = texto;
    if ((k === 's' || yaPintada) && !sinMovimiento.matches && cifra.animate) {
      cifra.animate([{ opacity: 0.2, transform: 'translateY(-40%)' }, { opacity: 1, transform: 'none' }], { duration: 350, easing: 'cubic-bezier(.16, 1, .3, 1)' });
    }
  };

  const pintar = () => {
    const ahora = Date.now();
    const { inicio, enCurso } = proximaCaceria(ahora);
    if (inicio !== ultimoInicio) {
      ultimoInicio = inicio;
      nodoTiempo.dateTime = new Date(inicio).toISOString();
      // Lo primero, la fecha y la hora de quien mira; si no es la de España, debajo la de España.
      const mismoDesfase = new Date(inicio).getTimezoneOffset() * -60000 === desfase(inicio);
      const fecha = new Intl.DateTimeFormat(t.locale, { timeZone: mismoDesfase ? ZONA : undefined, weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
      nodoTiempo.textContent = fecha.format(inicio);
      nodoLocal.hidden = mismoDesfase;
      if (!mismoDesfase) nodoLocal.textContent = `${dos(HORA)}:00${t.espana}`;
    }
    if (enCurso) {
      if (montada) { nodoFalta.textContent = t.enCurso; montada = false; }
      else if (nodoFalta.textContent !== t.enCurso) nodoFalta.textContent = t.enCurso;
      caja.classList.add('en-curso');
      nodoTitulo.textContent = t.tituloEnCurso;
    } else {
      if (!montada) montar();
      const r = restante(inicio - ahora);
      piezas.d.grupo.hidden = r.d === 0;
      poner('d', r.d, String(r.d));
      poner('h', r.h, dos(r.h));
      poner('m', r.m, dos(r.m));
      poner('s', r.s, dos(r.s));
      caja.classList.remove('en-curso');
      nodoTitulo.textContent = tituloNormal;
    }
    yaPintada = true;
  };

  // Un tic por segundo, solo mientras la caja se ve y la pestaña está delante.
  let reloj = 0, aLaVista = false;
  const encender = () => {
    if (reloj || !aLaVista || document.hidden) return;
    pintar();
    reloj = setInterval(pintar, 1000);
  };
  const apagar = () => { clearInterval(reloj); reloj = 0; };
  // La caja guarda ya su sitio, con textos de su tamaño aún sin ver, y las cifras llegan en la tarea
  // siguiente: así abrir la página no se queda bloqueada creando el formateador.
  montar();
  nodoTiempo.textContent = t.reserva;
  caja.classList.add('cargando');
  caja.hidden = false;
  setTimeout(() => {
    try { pintar(); } catch (e) { caja.hidden = true; return; }
    caja.classList.remove('cargando');
    new IntersectionObserver(([e]) => { aLaVista = e.isIntersecting; aLaVista ? encender() : apagar(); }).observe(caja);
    document.addEventListener('visibilitychange', () => (document.hidden ? apagar() : encender()));
  });
})();
