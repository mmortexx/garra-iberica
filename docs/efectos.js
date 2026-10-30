(() => {
  'use strict';
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
  const alDesplazar = () => {
    const y = scrollY;
    if (y > 60) barra.classList.add('compacta');
    else if (y < 20) barra.classList.remove('compacta');
    if (progresoPorCss) return;
    const total = raiz.scrollHeight - innerHeight;
    progreso.style.transform = `scaleX(${total > 0 ? Math.min(1, y / total) : 0})`;
  };
  addEventListener('scroll', unaVezPorFotograma(alDesplazar), { passive: true });
  alDesplazar();

  // Menú: marca la sección que se está leyendo; en la portada y en las que no están en el menú,
  // ninguna (si solo se vigilaran las del menú, la anterior seguiría marcada al pasar por ellas).
  const menu = document.querySelector('.menu');
  const enlaces = new Map([...menu.querySelectorAll('a')].map(a => [a.hash.slice(1), a]));
  const vigia = new IntersectionObserver(entradas => {
    for (const e of entradas) {
      if (!e.isIntersecting) continue;
      enlaces.forEach(o => o.removeAttribute('aria-current'));
      const a = enlaces.get(e.target.id);
      if (a) a.setAttribute('aria-current', 'true');
    }
  }, { rootMargin: '-45% 0px -50% 0px' });
  document.querySelectorAll('main section[id]').forEach(s => vigia.observe(s));

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

  // Compartir la web: el menú de compartir del sistema si lo hay; si no, copiar la dirección.
  // Sin ninguna de las dos cosas, el botón no aparece.
  const compartir = document.querySelector('[data-compartir]');
  if (compartir && (navigator.share || navigator.clipboard)) {
    const estado = compartir.querySelector('[role="status"]');
    const canonica = document.querySelector('link[rel="canonical"]');
    const direccion = canonica ? canonica.href : location.href.split('#')[0];
    compartir.hidden = false;
    compartir.querySelector('button').addEventListener('click', async () => {
      estado.textContent = '';
      if (navigator.share) {
        try { await navigator.share({ title: document.title, url: direccion }); return; }
        catch (e) { if (e.name === 'AbortError') return; }
      }
      try {
        await navigator.clipboard.writeText(direccion);
        estado.textContent = compartir.dataset.copiado;
      } catch {
        estado.textContent = `${compartir.dataset.fallo} ${direccion}`;
      }
    });
  }

  // Visor de la galería. Sin él, cada foto es un enlace a su imagen grande.
  // Ajustada, la foto cabe en pantalla; al pulsarla pasa a su resolución real, centrada en ese punto.
  const fotos = [...document.querySelectorAll('.foto-ampliar')];
  if (fotos.length && window.HTMLDialogElement) {
    const t = raiz.lang.startsWith('en')
      ? { visor: 'Photo viewer', cerrar: 'Close', ant: 'Previous photo', sig: 'Next photo' }
      : { visor: 'Visor de fotos', cerrar: 'Cerrar', ant: 'Foto anterior', sig: 'Foto siguiente' };
    const visor = document.createElement('dialog');
    visor.className = 'visor';
    visor.setAttribute('aria-label', t.visor);
    visor.innerHTML = '<div class="visor-marco"><img class="visor-img" alt=""></div><p class="visor-cuenta" aria-live="polite"></p>'
      + `<button class="visor-boton visor-cerrar" type="button" aria-label="${t.cerrar}" autofocus></button>`
      + `<button class="visor-boton visor-ant" type="button" aria-label="${t.ant}"></button>`
      + `<button class="visor-boton visor-sig" type="button" aria-label="${t.sig}"></button>`;
    document.body.append(visor);
    const marco = visor.querySelector('.visor-marco');
    const img = visor.querySelector('.visor-img');
    const cuenta = visor.querySelector('.visor-cuenta');
    const anchoMayor = a => Math.max(...a.dataset.srcset.split(',').map(p => parseInt(p.trim().split(/\s+/)[1], 10)));
    const ahorro = navigator.connection && navigator.connection.saveData;
    let actual = 0;
    const enReal = () => visor.classList.contains('real');
    // Rectángulo que ocupa la foto dentro de su caja (object-fit: contain).
    const zonaFoto = () => {
      const c = img.getBoundingClientRect();
      if (!img.naturalWidth) return c;
      const esc = Math.min(c.width / img.naturalWidth, c.height / img.naturalHeight);
      const w = img.naturalWidth * esc, h = img.naturalHeight * esc;
      return { left: c.left + (c.width - w) / 2, top: c.top + (c.height - h) / 2, width: w, height: h };
    };
    const ajustar = () => {
      visor.classList.remove('real');
      img.style.removeProperty('width');
      img.sizes = '100vw';
    };
    const ampliar = (x, y) => {
      const z = zonaFoto();
      const fx = Math.min(1, Math.max(0, (x - z.left) / z.width)), fy = Math.min(1, Math.max(0, (y - z.top) / z.height));
      const ancho = Math.round(Math.max(anchoMayor(fotos[actual]) / (devicePixelRatio || 1), z.width * 1.5));
      img.sizes = `${ancho}px`;
      img.style.width = `${ancho}px`;
      visor.classList.add('real');
      const alto = ancho * z.height / z.width;
      marco.scrollLeft = fx * ancho - marco.clientWidth / 2;
      marco.scrollTop = fy * alto - marco.clientHeight / 2;
    };
    const precargar = i => {
      if (ahorro) return;
      const p = new Image();
      p.sizes = '100vw';
      p.srcset = fotos[i].dataset.srcset;
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
      img.alt = a.querySelector('img').alt;
      cuenta.textContent = `${actual + 1} / ${fotos.length}`;
      // Además del «load», por si el navegador no lo da (foto ya en caché, por ejemplo).
      const pedida = img.src;
      img.decode().then(() => { if (img.src === pedida) lista(); }, () => {});
    };
    const lista = () => {
      if (!visor.classList.contains('cargando')) return;
      visor.classList.remove('cargando');
      precargar((actual + 1) % fotos.length);
    };
    img.addEventListener('load', lista);
    img.addEventListener('error', () => visor.classList.remove('cargando'));
    fotos.forEach((a, i) => a.addEventListener('click', ev => {
      if (ev.button || ev.metaKey || ev.ctrlKey || ev.shiftKey || ev.altKey) return;
      ev.preventDefault();
      mostrar(i);
      visor.showModal();
    }));
    visor.querySelector('.visor-cerrar').addEventListener('click', () => visor.close());
    visor.querySelector('.visor-ant').addEventListener('click', () => mostrar(actual - 1));
    visor.querySelector('.visor-sig').addEventListener('click', () => mostrar(actual + 1));
    visor.addEventListener('keydown', ev => {
      if (ev.key === 'ArrowLeft' && !enReal()) mostrar(actual - 1);
      else if (ev.key === 'ArrowRight' && !enReal()) mostrar(actual + 1);
    });
    // Escape con la foto ampliada vuelve a ajustarla; si no, cierra.
    visor.addEventListener('cancel', ev => { if (enReal()) { ev.preventDefault(); ajustar(); } });
    visor.addEventListener('close', () => { ajustar(); fotos[actual].focus(); });
    addEventListener('resize', () => { if (visor.open && enReal()) ajustar(); });

    // Arrastrar con el ratón recorre la foto ampliada; deslizar con el dedo cambia de foto.
    // Un arrastre no cuenta como pulsación.
    let inicio = null, arrastrado = false;
    marco.addEventListener('pointerdown', ev => {
      inicio = { x: ev.clientX, y: ev.clientY, sl: marco.scrollLeft, st: marco.scrollTop, tipo: ev.pointerType };
      arrastrado = false;
    });
    marco.addEventListener('pointermove', ev => {
      if (!inicio) return;
      const dx = ev.clientX - inicio.x, dy = ev.clientY - inicio.y;
      if (Math.abs(dx) + Math.abs(dy) > 6) arrastrado = true;
      if (enReal() && inicio.tipo === 'mouse' && arrastrado) {
        marco.classList.add('arrastrando');
        marco.scrollLeft = inicio.sl - dx;
        marco.scrollTop = inicio.st - dy;
      }
    });
    const soltar = ev => {
      if (!inicio) return;
      const dx = ev.clientX - inicio.x, dy = ev.clientY - inicio.y;
      if (ev.type === 'pointerup' && inicio.tipo !== 'mouse' && !enReal() && Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) {
        mostrar(actual + (dx < 0 ? 1 : -1));
      }
      marco.classList.remove('arrastrando');
      inicio = null;
    };
    marco.addEventListener('pointerup', soltar);
    marco.addEventListener('pointercancel', soltar);
    marco.addEventListener('click', ev => {
      if (arrastrado) { arrastrado = false; return; }
      if (enReal()) { ajustar(); return; }
      const z = zonaFoto();
      const dentro = ev.clientX >= z.left && ev.clientX <= z.left + z.width && ev.clientY >= z.top && ev.clientY <= z.top + z.height;
      if (dentro) ampliar(ev.clientX, ev.clientY); else visor.close();
    });
  }

  if (sinMovimiento.matches) return;

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
    // Brillo tenue que sigue al cursor por toda la página, con algo de inercia. Solo anima
    // mientras le queda camino; quieto no gasta nada.
    const luz = document.createElement('div');
    luz.className = 'cursor-luz';
    luz.setAttribute('aria-hidden', 'true');
    document.body.append(luz);
    let lx = -1, ly = -1, tx = 0, ty = 0, siguiendo = 0;
    const seguir = () => {
      lx += (tx - lx) * 0.14; ly += (ty - ly) * 0.14;
      luz.style.transform = `translate3d(${lx.toFixed(1)}px, ${ly.toFixed(1)}px, 0)`;
      siguiendo = Math.abs(tx - lx) + Math.abs(ty - ly) > 0.5 ? requestAnimationFrame(seguir) : 0;
    };
    addEventListener('pointermove', ev => {
      tx = ev.clientX; ty = ev.clientY;
      if (lx < 0) { lx = tx; ly = ty; }
      luz.classList.add('activa');
      if (!siguiendo) siguiendo = requestAnimationFrame(seguir);
    }, { passive: true });
    raiz.addEventListener('pointerleave', () => luz.classList.remove('activa'));
  }

  // Ascuas que suben. Cada ascua es una copia de un brillo dibujado una sola vez; se crean
  // tras la carga y se paran fuera de pantalla o con la pestaña oculta.
  const dpr = Math.min(devicePixelRatio || 1, 1.5);
  const brillo = (() => {
    const tam = 64, c = document.createElement('canvas');
    c.width = c.height = tam;
    const g = c.getContext('2d'), m = tam / 2;
    const d = g.createRadialGradient(m, m, 0, m, m, m);
    d.addColorStop(0, 'rgba(255, 196, 120, 1)');
    d.addColorStop(0.35, 'rgba(255, 110, 30, .55)');
    d.addColorStop(1, 'rgba(255, 80, 10, 0)');
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
    let w = 0, h = 0, particulas = [], activo = false, ultimo = 0, id = 0;
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
      id = requestAnimationFrame(pintar);
    };
    const arrancar = () => {
      if (activo || document.hidden) return;
      activo = true; ultimo = 0; id = requestAnimationFrame(pintar);
    };
    const parar = () => { activo = false; cancelAnimationFrame(id); };
    medir();
    new ResizeObserver(unaVezPorFotograma(medir)).observe(contenedor);
    let visible = false;
    new IntersectionObserver(([e]) => { visible = e.isIntersecting; visible ? arrancar() : parar(); }).observe(contenedor);
    document.addEventListener('visibilitychange', () => (document.hidden ? parar() : visible && arrancar()));
    requestAnimationFrame(() => lienzo.classList.add('encendido'));
  };
  const iniciarAscuas = () => document.querySelectorAll('[data-ascuas]').forEach(ascuas);
  const cuandoLibre = window.requestIdleCallback || (fn => setTimeout(fn, 200));
  if (document.readyState === 'complete') cuandoLibre(iniciarAscuas);
  else addEventListener('load', () => cuandoLibre(iniciarAscuas), { once: true });
})();
