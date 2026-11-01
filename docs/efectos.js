(() => {
  'use strict';
  // Enlaces a secciones que antes estaban en la portada (/#normas): a su página nueva.
  const movidas = document.body.dataset.movidas && JSON.parse(document.body.dataset.movidas);
  const viejo = location.hash.slice(1);
  if (movidas && Object.hasOwn(movidas, viejo)) { location.replace(movidas[viejo]); return; }
  const raiz = document.documentElement;
  const sinMovimiento = matchMedia('(prefers-reduced-motion: reduce)');
  const punteroFino = matchMedia('(hover: hover) and (pointer: fine)');
  const unaVezPorFotograma = fn => {
    let raf = 0, ultimo;
    return ev => {
      ultimo = ev;
      if (!raf) raf = requestAnimationFrame(() => { raf = 0; fn(ultimo); });
    };
  };

  // Barra fija: se compacta al bajar (con margen para que no tiemble) y muestra el progreso.
  // Donde el CSS sabe animar con el scroll, el progreso lo pinta él sin pasar por aquí.
  const barra = document.querySelector('.barra');
  const progreso = document.querySelector('.progreso');
  const progresoPorCss = window.CSS && CSS.supports('animation-timeline: scroll()');
  // Botón de volver arriba: aparece al subir (no al bajar leyendo) pasada pantalla y media, y se
  // aparta cuando el pie, que tiene su propio «Volver arriba», está a la vista.
  let yAntes = scrollY, pieVisto = false;
  const pie = document.querySelector('.pie');
  if (pie) new IntersectionObserver(([e]) => { pieVisto = e.isIntersecting; alDesplazar(); }).observe(pie);
  const alDesplazar = () => {
    const y = scrollY;
    if (y > 60) barra.classList.add('compacta');
    else if (y < 20) barra.classList.remove('compacta');
    const subiendo = y < yAntes - 4 ? true : y > yAntes + 4 ? false : null;
    if (subiendo !== null) yAntes = y;
    if (y < innerHeight * 1.5 || pieVisto || subiendo === false) raiz.classList.remove('ver-subir');
    else if (subiendo) raiz.classList.add('ver-subir');
    if (progresoPorCss) return;
    const total = raiz.scrollHeight - innerHeight;
    progreso.style.transform = `scaleX(${total > 0 ? Math.min(1, y / total) : 0})`;
  };
  addEventListener('scroll', unaVezPorFotograma(alDesplazar), { passive: true });
  alDesplazar();

  // Menú a pantalla completa (móvil): mientras está abierto, el foco no se escapa a la página de
  // detrás y entra por el primer enlace. Se cierra al pasar a escritorio (allí va en la barra) y
  // al volver con «Atrás» a una página que se fue con él abierto.
  const menu = document.querySelector('.menu[popover]');
  if (menu && menu.showPopover) {
    const detras = [...document.querySelectorAll('.saltar, .marca, .barra-acciones, main, .pie')];
    menu.addEventListener('beforetoggle', e => {
      if (e.newState === 'closed') detras.forEach(el => { el.inert = false; });
    });
    menu.addEventListener('toggle', e => {
      if (e.newState !== 'open') return;
      detras.forEach(el => { el.inert = true; });
      menu.querySelector('a').focus();
    });
    const cerrar = () => { if (menu.matches(':popover-open')) menu.hidePopover(); };
    matchMedia('(min-width: 1020px)').addEventListener('change', e => { if (e.matches) cerrar(); });
    addEventListener('pageshow', e => { if (e.persisted) cerrar(); });
  }

  // Punto exacto de los arañazos en la portada, sea cual sea el recorte de la imagen.
  const portada = document.querySelector('.portada');
  const fondo = portada && portada.querySelector('.portada-fondo');
  const GARRA = { x: 0.785, y: 0.5 };
  const situarGarra = () => {
    if (!fondo || !fondo.naturalWidth) return;
    const cs = getComputedStyle(fondo);
    const cw = fondo.clientWidth, ch = fondo.clientHeight;
    const esc = Math.max(cw / fondo.naturalWidth, ch / fondo.naturalHeight);
    const iw = fondo.naturalWidth * esc, ih = fondo.naturalHeight * esc;
    const [px, py] = cs.objectPosition.split(' ').map(v => parseFloat(v) / 100);
    const x = (cw - iw) * px + iw * GARRA.x;
    const y = (ch - ih) * py + ih * GARRA.y;
    portada.style.setProperty('--garra-x', `${x}px`);
    portada.style.setProperty('--garra-y', `${y + fondo.offsetTop}px`);
  };
  if (fondo) {
    if (fondo.complete) situarGarra(); else fondo.addEventListener('load', situarGarra, { once: true });
    addEventListener('resize', unaVezPorFotograma(situarGarra), { passive: true });
  }

  // Compartir un enlace: el menú de compartir del sistema si lo hay; si no, copiar la dirección.
  const pasarEnlace = async (direccion, estado, copiado, fallo) => {
    estado.textContent = '';
    if (navigator.share) {
      try { await navigator.share({ title: document.title, url: direccion }); return; }
      catch (e) { if (e.name === 'AbortError') return; }
    }
    try {
      await navigator.clipboard.writeText(direccion);
      estado.textContent = copiado;
    } catch {
      estado.textContent = `${fallo} ${direccion}`;
    }
  };
  const sePuedePasar = navigator.share || navigator.clipboard;
  // Compartir la web. Sin ninguna de las dos maneras, el botón no aparece.
  const compartir = document.querySelector('[data-compartir]');
  if (compartir && sePuedePasar) {
    const estado = compartir.querySelector('[role="status"]');
    const canonica = document.querySelector('link[rel="canonical"]');
    const direccion = canonica ? canonica.href : location.href.split('#')[0];
    compartir.hidden = false;
    compartir.querySelector('button').addEventListener('click', () => pasarEnlace(direccion, estado, compartir.dataset.copiado, compartir.dataset.fallo));
  }

  // Visor de la galería. Sin él, cada foto es un enlace a su imagen grande.
  // Ajustada, la foto cabe en pantalla; al pulsarla pasa a su resolución real, centrada en ese punto,
  // y con dos dedos se amplía lo que se quiera. Cada foto tiene su dirección (galeria/#foto-colina).
  const fotos = [...document.querySelectorAll('.foto-ampliar')];
  if (fotos.length && window.HTMLDialogElement) {
    const t = raiz.lang.startsWith('en')
      ? { visor: 'Photo viewer', cerrar: 'Close', ant: 'Previous photo', sig: 'Next photo', pasar: 'Share this photo', copiado: 'Link copied', fallo: 'Copy this link:' }
      : { visor: 'Visor de fotos', cerrar: 'Cerrar', ant: 'Foto anterior', sig: 'Foto siguiente', pasar: 'Compartir esta foto', copiado: 'Enlace copiado', fallo: 'Copia este enlace:' };
    const visor = document.createElement('dialog');
    visor.className = 'visor';
    visor.setAttribute('aria-label', t.visor);
    visor.setAttribute('aria-describedby', 'visor-pie');
    visor.innerHTML = '<div class="visor-marco"><img class="visor-img" alt="" draggable="false"></div><p class="visor-cuenta" aria-live="polite"></p>'
      + '<p class="visor-pie" id="visor-pie" aria-live="polite"></p><p class="visor-aviso" role="status"></p>'
      + `<button class="visor-boton visor-cerrar" type="button" aria-label="${t.cerrar}" autofocus></button>`
      + (sePuedePasar ? `<button class="visor-boton visor-pasar" type="button" aria-label="${t.pasar}"></button>` : '')
      + `<button class="visor-boton visor-ant" type="button" aria-label="${t.ant}"></button>`
      + `<button class="visor-boton visor-sig" type="button" aria-label="${t.sig}"></button>`;
    document.body.append(visor);
    const marco = visor.querySelector('.visor-marco');
    const img = visor.querySelector('.visor-img');
    const cuenta = visor.querySelector('.visor-cuenta');
    const pie = visor.querySelector('.visor-pie');
    const aviso = visor.querySelector('.visor-aviso');
    const anchoMayor = a => Math.max(...a.dataset.srcset.split(',').map(p => parseInt(p.trim().split(/\s+/)[1], 10)));
    const ahorro = navigator.connection && navigator.connection.saveData;
    const enlaceDe = i => `#${fotos[i].closest('.foto').id}`;
    const fotoDeLaDireccion = () => fotos.findIndex((_, i) => enlaceDe(i) === location.hash);
    let actual = 0, anchoAjustada = 0;
    const enReal = () => visor.classList.contains('real');
    // Rectángulo que ocupa la foto dentro de su caja (object-fit: contain).
    const zonaFoto = () => {
      const c = img.getBoundingClientRect();
      if (!img.naturalWidth) return c;
      const esc = Math.min(c.width / img.naturalWidth, c.height / img.naturalHeight);
      const w = img.naturalWidth * esc, h = img.naturalHeight * esc;
      return { left: c.left + (c.width - w) / 2, top: c.top + (c.height - h) / 2, width: w, height: h };
    };
    // El pie va justo debajo de la foto, sin salirse de la pantalla ni pisar los botones de abajo.
    const colocarPie = () => {
      const z = zonaFoto();
      const abajo = visor.querySelector('.visor-ant').getBoundingClientRect();
      const tope = (abajo.top > z.top + z.height ? abajo.top : innerHeight) - pie.offsetHeight - 8;
      pie.style.top = `${Math.max(0, Math.min(z.top + z.height + 8, tope))}px`;
    };
    const ajustar = () => {
      visor.classList.remove('real');
      img.style.removeProperty('width');
      img.sizes = '100vw';
      if (img.naturalWidth) { anchoAjustada = zonaFoto().width; colocarPie(); }
    };
    // Ancho de la foto y qué punto de ella (de 0 a 1) queda en qué punto de la pantalla.
    const ponerAncho = (ancho, fx, fy, x, y) => {
      img.sizes = `${Math.ceil(ancho)}px`;
      img.style.width = `${ancho}px`;
      visor.classList.add('real');
      marco.scrollLeft = fx * ancho - x;
      marco.scrollTop = fy * ancho * img.naturalHeight / img.naturalWidth - y;
    };
    const ampliar = (x, y) => {
      const z = zonaFoto();
      const fx = Math.min(1, Math.max(0, (x - z.left) / z.width)), fy = Math.min(1, Math.max(0, (y - z.top) / z.height));
      const ancho = Math.round(Math.max(anchoMayor(fotos[actual]) / (devicePixelRatio || 1), z.width * 1.5));
      ponerAncho(ancho, fx, fy, marco.clientWidth / 2, marco.clientHeight / 2);
    };
    const precargar = i => {
      if (ahorro) return;
      const p = new Image();
      p.sizes = '100vw';
      p.srcset = fotos[(i + fotos.length) % fotos.length].dataset.srcset;
    };
    const mostrar = i => {
      actual = (i + fotos.length) % fotos.length;
      const a = fotos[actual];
      ajustar();
      visor.classList.add('cargando');
      // Vaciarla antes asegura un «load» aunque se vuelva a abrir la misma foto.
      img.removeAttribute('srcset');
      img.removeAttribute('src');
      img.srcset = a.dataset.srcset;
      img.src = a.href;
      // El texto de la foto está a la vista en el pie: el lector de pantalla lo lee de ahí.
      pie.textContent = a.querySelector('img').alt;
      aviso.textContent = '';
      cuenta.textContent = `${actual + 1} / ${fotos.length}`;
      if (visor.open) history.replaceState(history.state, '', enlaceDe(actual));
      // Además del «load», por si el navegador no lo da (foto ya en caché, por ejemplo).
      const pedida = img.src;
      img.decode().then(() => { if (img.src === pedida) lista(); }, () => {});
    };
    const lista = () => {
      if (!visor.classList.contains('cargando')) return;
      visor.classList.remove('cargando');
      anchoAjustada = zonaFoto().width;
      colocarPie();
      precargar(actual + 1);
      precargar(actual - 1);
    };
    img.addEventListener('load', lista);
    img.addEventListener('error', () => visor.classList.remove('cargando'));
    fotos.forEach((a, i) => a.addEventListener('click', ev => {
      if (ev.button || ev.metaKey || ev.ctrlKey || ev.shiftKey || ev.altKey) return;
      ev.preventDefault();
      mostrar(i);
      visor.showModal();
      colocarPie();
      // Una entrada en el historial: «Atrás» cierra la foto en vez de salir de la galería. Al volver,
      // la página se queda en la última foto vista, no donde estaba al abrir.
      history.scrollRestoration = 'manual';
      history.pushState({ visor: true }, '', enlaceDe(i));
    }));
    visor.querySelector('.visor-cerrar').addEventListener('click', () => visor.close());
    visor.querySelector('.visor-ant').addEventListener('click', () => mostrar(actual - 1));
    visor.querySelector('.visor-sig').addEventListener('click', () => mostrar(actual + 1));
    visor.querySelector('.visor-pasar')?.addEventListener('click', () => {
      pasarEnlace(location.href, aviso, t.copiado, t.fallo);
    });
    visor.addEventListener('keydown', ev => {
      if (ev.key === 'ArrowLeft' && !enReal()) mostrar(actual - 1);
      else if (ev.key === 'ArrowRight' && !enReal()) mostrar(actual + 1);
    });
    // Escape con la foto ampliada vuelve a ajustarla; si no, cierra.
    visor.addEventListener('cancel', ev => { if (enReal()) { ev.preventDefault(); ajustar(); } });
    visor.addEventListener('close', () => {
      ajustar();
      fotos[actual].focus();
      if (fotoDeLaDireccion() < 0) return;
      if (history.state && history.state.visor) history.back();
      else history.replaceState(history.state, '', location.pathname + location.search);
    });
    addEventListener('resize', () => { if (visor.open) ajustar(); });
    // La dirección manda: «Atrás» o «Adelante», o abrir la web con el enlace de una foto.
    const seguirDireccion = () => {
      const i = fotoDeLaDireccion();
      if (i < 0) {
        history.scrollRestoration = 'auto';
        if (visor.open) visor.close();
      } else if (!visor.open) {
        mostrar(i);
        visor.showModal();
        colocarPie();
      } else if (i !== actual) mostrar(i);
    };
    addEventListener('popstate', seguirDireccion);
    if (fotoDeLaDireccion() >= 0) seguirDireccion();

    // Arrastrar con el ratón recorre la foto ampliada. Con el dedo, la foto sigue al dedo: de lado
    // cambia de foto y hacia abajo cierra el visor. Un arrastre no cuenta como pulsación.
    let inicio = null, arrastrado = false;
    marco.addEventListener('pointerdown', ev => {
      // Un segundo dedo nunca es un deslizamiento, aunque la foto aún no se pueda pellizcar.
      if (!ev.isPrimary) {
        inicio = null;
        arrastrado = true;
        img.style.removeProperty('translate');
        return;
      }
      inicio = { x: ev.clientX, y: ev.clientY, sl: marco.scrollLeft, st: marco.scrollTop, tipo: ev.pointerType };
      arrastrado = false;
      // Así, soltar el ratón encima de un botón también acaba el arrastre.
      if (ev.pointerType === 'mouse' && ev.target === img) marco.setPointerCapture(ev.pointerId);
    });
    marco.addEventListener('pointermove', ev => {
      if (!inicio) return;
      const dx = ev.clientX - inicio.x, dy = ev.clientY - inicio.y;
      if (Math.abs(dx) + Math.abs(dy) > 6) arrastrado = true;
      if (enReal() && inicio.tipo === 'mouse' && arrastrado) {
        marco.classList.add('arrastrando');
        marco.scrollLeft = inicio.sl - dx;
        marco.scrollTop = inicio.st - dy;
      } else if (!enReal() && inicio.tipo !== 'mouse' && arrastrado) {
        img.style.translate = Math.abs(dx) > Math.abs(dy) ? `${dx}px 0` : `0 ${Math.max(0, dy)}px`;
      }
    });
    const soltar = ev => {
      img.style.removeProperty('translate');
      if (!inicio) return;
      const dx = ev.clientX - inicio.x, dy = ev.clientY - inicio.y;
      if (ev.type === 'pointerup' && inicio.tipo !== 'mouse' && !enReal()) {
        if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) mostrar(actual + (dx < 0 ? 1 : -1));
        else if (dy > 80 && dy > Math.abs(dx) * 1.5) visor.close();
      }
      marco.classList.remove('arrastrando');
      inicio = null;
    };
    marco.addEventListener('pointerup', soltar);
    marco.addEventListener('pointercancel', soltar);

    // Pellizcar: mientras dura, la foto se escala sin volver a maquetar (va fluida); al soltar se queda
    // a ese tamaño, ya con la versión de la foto que le corresponde, y se recorre como cualquier ampliada.
    let pinza = null;
    const dedos = t => ({ x: (t[0].clientX + t[1].clientX) / 2, y: (t[0].clientY + t[1].clientY) / 2, d: Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY) });
    marco.addEventListener('touchstart', ev => {
      if (ev.touches.length !== 2 || !img.naturalWidth || !ev.cancelable) return;
      ev.preventDefault();
      inicio = null;
      arrastrado = true;
      img.style.removeProperty('translate');
      const m = dedos(ev.touches), c = img.getBoundingClientRect();
      pinza = { ...m, z: zonaFoto(), k: 1, ax: m.x, ay: m.y };
      img.style.transformOrigin = `${m.x - c.left}px ${m.y - c.top}px`;
    }, { passive: false });
    marco.addEventListener('touchmove', ev => {
      if (!pinza || ev.touches.length !== 2) return;
      ev.preventDefault();
      const m = dedos(ev.touches);
      const mayor = Math.max(anchoMayor(fotos[actual]) / (devicePixelRatio || 1) * 2, anchoAjustada * 4);
      pinza.k = Math.min(mayor, Math.max(anchoAjustada * .8, pinza.z.width * m.d / pinza.d)) / pinza.z.width;
      pinza.ax = m.x;
      pinza.ay = m.y;
      img.style.transform = `translate(${m.x - pinza.x}px, ${m.y - pinza.y}px) scale(${pinza.k})`;
    }, { passive: false });
    const soltarPinza = ev => {
      if (!pinza || ev.touches.length >= 2) return;
      const { z, x, y, k, ax, ay } = pinza;
      pinza = null;
      img.style.removeProperty('transform');
      img.style.removeProperty('transform-origin');
      const ancho = z.width * k;
      if (ancho < anchoAjustada * 1.1) ajustar();
      else ponerAncho(ancho, (x - z.left) / z.width, (y - z.top) / z.height, ax, ay);
    };
    marco.addEventListener('touchend', soltarPinza);
    marco.addEventListener('touchcancel', soltarPinza);
    marco.addEventListener('click', ev => {
      if (arrastrado) { arrastrado = false; return; }
      if (enReal()) { ajustar(); return; }
      const z = zonaFoto();
      const dentro = ev.clientX >= z.left && ev.clientX <= z.left + z.width && ev.clientY >= z.top && ev.clientY <= z.top + z.height;
      if (dentro) ampliar(ev.clientX, ev.clientY); else visor.close();
    });
  }

  // Tira de fotos de la portada: las del final empiezan fuera de su marco y el navegador no las
  // pediría hasta que la tira las desliza dentro (llegarían en blanco). Se piden todas al acercarse.
  const tira = document.querySelector('.tira-marco');
  if (tira) {
    const pedir = new IntersectionObserver(([e]) => {
      if (!e.isIntersecting) return;
      tira.querySelectorAll('img[loading="lazy"]').forEach(img => { img.loading = 'eager'; });
      pedir.disconnect();
    }, { rootMargin: '600px 0px' });
    pedir.observe(tira);
  }

  if (sinMovimiento.matches) return;

  // Reposo: tras 20 s sin ratón, dedo, rueda ni teclado, con otra ventana delante o con el menú o
  // el visor tapando la página, los efectos de ambiente (ascuas, niebla, pulsos, tira de fotos) se
  // quedan quietos y vuelven en cuanto hay actividad o se cierra lo que tapaba. Así la web abierta
  // y sin usar no gasta procesador ni batería.
  const REPOSO_MS = 20000;
  const alCambiarReposo = [];
  let enReposo = false, inactiva = false, tapada = false, ultima = 0, reloj = 0;
  const aplicarReposo = () => {
    const quieto = inactiva || tapada;
    if (quieto === enReposo) return;
    enReposo = quieto;
    raiz.classList.toggle('reposo', quieto);
    alCambiarReposo.forEach(fn => fn());
  };
  const ponerReposo = quieto => { inactiva = quieto; aplicarReposo(); };
  // «toggle» no sube por el documento: se escucha en la fase de captura.
  const TAPAN = CSS.supports('selector(:popover-open)') ? '.menu:popover-open, .visor[open]' : '.visor[open]';
  document.addEventListener('toggle', () => {
    tapada = !!document.querySelector(TAPAN);
    aplicarReposo();
  }, true);
  const vigilar = () => {
    const falta = ultima + REPOSO_MS - performance.now();
    if (falta > 0) reloj = setTimeout(vigilar, falta);
    else { reloj = 0; ponerReposo(true); }
  };
  const actividad = () => {
    ultima = performance.now();
    ponerReposo(false);
    if (!reloj) reloj = setTimeout(vigilar, REPOSO_MS);
  };
  for (const tipo of ['pointermove', 'pointerdown', 'wheel', 'scroll', 'keydown', 'touchstart']) addEventListener(tipo, actividad, { passive: true });
  addEventListener('focus', actividad);
  addEventListener('blur', () => { clearTimeout(reloj); reloj = 0; ponerReposo(true); });
  actividad();

  // Apariciones al hacer scroll. Lo que ya está en pantalla se marca antes del primer
  // fotograma para que no parpadee.
  const revelables = [...document.querySelectorAll('.revelar')];
  const enPantalla = el => el.getBoundingClientRect().top < innerHeight * 0.92;
  revelables.forEach(el => { if (enPantalla(el)) el.classList.add('visible'); });
  raiz.classList.add('anim');
  const observador = new IntersectionObserver(entradas => {
    for (const e of entradas) {
      if (e.isIntersecting) { e.target.classList.add('visible'); observador.unobserve(e.target); }
    }
  }, { rootMargin: '0px 0px -8% 0px' });
  revelables.forEach(el => { if (!el.classList.contains('visible')) observador.observe(el); });

  if (punteroFino.matches) {
    // Paralaje suave de la portada con el ratón.
    if (portada) {
      portada.addEventListener('pointermove', unaVezPorFotograma(ev => {
        const r = portada.getBoundingClientRect();
        portada.style.setProperty('--px', ((ev.clientX - r.left) / r.width - 0.5).toFixed(3));
        portada.style.setProperty('--py', ((ev.clientY - r.top) / r.height - 0.5).toFixed(3));
      }));
      portada.addEventListener('pointerleave', () => { portada.style.setProperty('--px', 0); portada.style.setProperty('--py', 0); });
    }
    // Luz suave que sigue al ratón en los bloques. El rectángulo se mide una vez
    // y se vuelve a medir solo si la página se ha desplazado.
    let desplazamientos = 0;
    addEventListener('scroll', () => { desplazamientos++; }, { passive: true });
    document.querySelectorAll('.luz').forEach(el => {
      let r = null, medidoEn = -1;
      el.addEventListener('pointermove', unaVezPorFotograma(ev => {
        if (!r || medidoEn !== desplazamientos) { r = el.getBoundingClientRect(); medidoEn = desplazamientos; }
        const x = (ev.clientX - r.left) / r.width, y = (ev.clientY - r.top) / r.height;
        el.style.setProperty('--mx', `${x * 100}%`);
        el.style.setProperty('--my', `${y * 100}%`);
      }));
    });
    // Botones que se dejan atraer un poco por el ratón.
    document.querySelectorAll('.boton').forEach(bt => {
      bt.classList.add('magnetico');
      bt.addEventListener('pointermove', unaVezPorFotograma(ev => {
        if (!bt.matches(':hover')) return;
        const r = bt.getBoundingClientRect();
        bt.style.setProperty('--bx', `${((ev.clientX - r.left) / r.width - 0.5) * 10}px`);
        bt.style.setProperty('--by', `${((ev.clientY - r.top) / r.height - 0.5) * 8}px`);
      }));
      bt.addEventListener('pointerleave', () => { bt.style.removeProperty('--bx'); bt.style.removeProperty('--by'); });
    });
  }

  // Ascuas que suben. Cada ascua es una copia de un brillo dibujado una sola vez; se crean
  // tras la carga y se paran fuera de pantalla, con la pestaña oculta o en reposo.
  // A 30 fotogramas por segundo, pedidos con un temporizador: cada fotograma que pide la página
  // obliga a recalcularla entera, y a 60 se llevaba un tercio del procesador de un móvil normal
  // (medido: 32–48 % a 60, 13–14 % a 30). Suben despacio: a 30 se ven igual de suaves.
  const ESPERA_MS = 1000 / 30 - 8;
  const dpr = Math.min(devicePixelRatio || 1, 1.5);
  const brillo = (() => {
    const tam = 64, c = document.createElement('canvas');
    c.width = c.height = tam;
    const g = c.getContext('2d'), m = tam / 2;
    const d = g.createRadialGradient(m, m, 0, m, m, m);
    d.addColorStop(0, 'rgba(255, 134, 120, 1)');
    d.addColorStop(0.35, 'rgba(255, 53, 30, .55)');
    d.addColorStop(1, 'rgba(255, 35, 10, 0)');
    g.fillStyle = d;
    g.fillRect(0, 0, tam, tam);
    return c;
  })();
  const ascuas = contenedor => {
    const lienzo = document.createElement('canvas');
    lienzo.className = 'ascuas';
    lienzo.setAttribute('aria-hidden', 'true');
    contenedor.prepend(lienzo);
    const ctx = lienzo.getContext('2d');
    let w = 0, h = 0, particulas = [], activo = false, ultimo = 0, id = 0, espera = 0;
    const cuantas = () => Math.round(Math.min(70, Math.max(22, w * h / 16000)));
    const nueva = (alAzar) => ({
      x: Math.random() * w,
      y: alAzar ? Math.random() * h : h + 10,
      r: 0.6 + Math.random() * 1.8,
      vy: 14 + Math.random() * 38,
      vx: -6 + Math.random() * 12,
      fase: Math.random() * Math.PI * 2,
      vida: 0.55 + Math.random() * 0.45,
    });
    const medir = () => {
      const r = contenedor.getBoundingClientRect();
      if (r.width === w && r.height === h) return;
      w = r.width; h = r.height;
      lienzo.width = Math.round(w * dpr); lienzo.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.globalCompositeOperation = 'lighter';
      const n = cuantas();
      while (particulas.length < n) particulas.push(nueva(true));
      particulas.length = n;
    };
    const pintar = t => {
      if (!activo) return;
      const dt = Math.min(0.05, (t - (ultimo || t)) / 1000);
      ultimo = t;
      ctx.clearRect(0, 0, w, h);
      for (const p of particulas) {
        p.fase += dt * 2.2;
        p.y -= p.vy * dt;
        p.x += (p.vx + Math.sin(p.fase) * 10) * dt;
        if (p.y < -10 || p.x < -10 || p.x > w + 10) Object.assign(p, nueva(false));
        const alto = Math.max(0, Math.min(1, p.y / h));
        const a = p.vida * alto * (0.65 + 0.35 * Math.sin(p.fase * 3));
        if (a <= 0.01) continue;
        const lado = p.r * 8;
        ctx.globalAlpha = a;
        ctx.drawImage(brillo, p.x - lado / 2, p.y - lado / 2, lado, lado);
      }
      ctx.globalAlpha = 1;
      espera = setTimeout(() => { id = requestAnimationFrame(pintar); }, ESPERA_MS);
    };
    const arrancar = () => {
      if (activo || document.hidden || enReposo) return;
      activo = true; ultimo = 0; id = requestAnimationFrame(pintar);
    };
    const parar = () => { activo = false; clearTimeout(espera); cancelAnimationFrame(id); };
    medir();
    new ResizeObserver(unaVezPorFotograma(medir)).observe(contenedor);
    let visible = false;
    new IntersectionObserver(([e]) => { visible = e.isIntersecting; visible ? arrancar() : parar(); }).observe(contenedor);
    document.addEventListener('visibilitychange', () => (document.hidden ? parar() : visible && arrancar()));
    alCambiarReposo.push(() => (enReposo ? parar() : visible && arrancar()));
    requestAnimationFrame(() => lienzo.classList.add('encendido'));
  };
  const iniciarAscuas = () => document.querySelectorAll('[data-ascuas]').forEach(ascuas);
  const cuandoLibre = window.requestIdleCallback || (fn => setTimeout(fn, 200));
  if (document.readyState === 'complete') cuandoLibre(iniciarAscuas);
  else addEventListener('load', () => cuandoLibre(iniciarAscuas), { once: true });
})();
