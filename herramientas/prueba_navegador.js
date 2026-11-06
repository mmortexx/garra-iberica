// Prueba la web en un navegador real: contenido visible con y sin JavaScript y con «reducir
// movimiento», sin errores en consola, ningún texto cortado en móviles de 320 a 412 px, cabecera
// sin solapes, menú (en fila o a pantalla completa) que lleva a cada página, enlaces viejos de la
// portada a su sitio nuevo, página nunca más ancha que la pantalla, marca alineada con los títulos,
// rangos en escalera, ambiente que se para en reposo, modo ligero, visor de la galería, fuentes sin saltos al
// llegar tarde, sanciones en escalera, fotos del mosaico a su tamaño, planificador de crecimiento,
// comparativa de especies, página de cada especie, batallas de la portada enlazadas a El clan,
// botón principal de la portada a la vista en móviles bajos,
// vídeo ligero en el móvil,
// hora de la Cacería en cada zona, efectos (menú al cerrarse, bruma, arañazos, fotos, vídeos, comparativa),
// contraste del texto sobre fotos, tamaño para pulsar e iconos en el alto contraste de Windows, ventanas grandes,
// scroll sin reaccionar al ratón,
// y auditoría de accesibilidad con axe-core en todas las páginas, con lo plegado abierto, el menú y el visor.
// Uso: con la web servida en http://127.0.0.1:8765/ (ver README) y Playwright y axe-core instalados:
//   node herramientas/prueba_navegador.js
// CHROME_PATH opcional, para usar un Chromium concreto.
const { chromium } = require('playwright');
const { readFileSync } = require('fs');
// WEB: otra dirección local (p. ej. para probar una versión anterior servida en otro puerto).
const BASE = process.env.WEB || 'http://127.0.0.1:8765/';
// Nada de esta prueba puede salir del ordenador: la ruta de logros lleva la dirección del servicio de verdad y las
// pruebas no deben tocarlo. Lo que intente salir se para, se anota y la prueba falla (al final).
const SALIDAS = [];
const LOCALES = new Set(['127.0.0.1', 'localhost', new URL(BASE).hostname]);
const sinSalir = async ctx => {
  await ctx.route(url => /^https?:$/.test(url.protocol) && !LOCALES.has(url.hostname), r => { SALIDAS.push(`${r.request().method()} ${r.request().url()}`); return r.abort('blockedbyclient'); });
  return ctx;
};
// El freno de arriba, probado: una dirección que no existe (.invalid) tiene que quedar anotada y parada. SOLO=salidas, solo esto.
const frenoDeSalidas = async navegador => {
  const ctx = await navegador.newContext();
  const p = await ctx.newPage();
  await p.goto('https://servicio-real.invalid/salud').catch(() => {});
  const fuera = SALIDAS.splice(0);
  await ctx.close();
  const bien = fuera.length === 1 && fuera[0] === 'GET https://servicio-real.invalid/salud';
  console.log('Lo que intenta salir del ordenador se para:', bien ? 'bien' : `NO se para (${fuera.join('; ') || 'ni se anota'})`);
  return bien ? 0 : 1;
};
// Las 20 páginas (mismo orden que montar_web.PAGINAS) y lo que lleva cada una. Las de cada especie se
// añaden al empezar, desde el mapa del sitio.
const PAGINAS = [
  ['', 'inicio'], ['en/', 'inicio'], ['clan/', 'clan'], ['en/clan/', 'clan'],
  ['dinosaurios/', 'dinosaurios'], ['en/dinosaurs/', 'dinosaurios'], ['caceria/', 'caceria'], ['en/hunt/', 'caceria'],
  ['combate/', 'combate'], ['en/combat/', 'combate'],
  ['galeria/', 'galeria'], ['en/gallery/', 'galeria'], ['unete/', 'unete'], ['en/join/', 'unete'],
  ['normas/', 'normas'], ['en/rules/', 'normas'], ['ruta/', 'ruta'], ['en/route/', 'ruta'], ['legal/', 'legal'], ['en/legal/', 'legal'],
];
// Páginas que no están en el menú (se llega desde el pie o desde la página de su tema): no marcan ninguno.
const FUERA_MENU = ['normas', 'ruta', 'legal', 'especie'];
// Enlaces del menú (montar_web.MENU), Inicio incluido.
const EN_MENU = 7;
const CON_CUENTA = ['inicio', 'caceria'];
const CON_COMPARTIR = ['inicio'];
const CON_CARTEL = ['caceria'];
const CON_GALERIA = ['galeria'];
// Enlaces de cuando todo estaba en la portada: deben llevar a su página nueva.
const MOVIDAS = [['#normas', 'normas/'], ['en/#rules', 'en/rules/'], ['#guia', 'dinosaurios/'], ['en/#faq', 'en/join/#faq'], ['en/#hunt', 'en/hunt/']];
const ruta = r => ('/' + r).padEnd(15);
// Efectos: lo que, roto, no da ningún error y solo se nota mirando. SOLO=efectos prueba solo esto.
// Con el ratón quieto, lo que pasa por debajo al hacer scroll no se enciende: repintarlo es lo que más
// cuesta al desplazarse a pantalla completa. Al parar, moverlo o tener un botón pulsado, responde como
// siempre; en el móvil no cambia nada. SOLO=scroll prueba solo esto.
const scrollSinRaton = async navegador => {
  const fallos = [];
  const ctx = await navegador.newContext({ viewport: { width: 1366, height: 850 } });
  const p = await ctx.newPage();
  await p.goto(BASE, { waitUntil: 'load' });
  const sitio = await p.evaluate(() => {
    const r = document.querySelector('.baldosa').getBoundingClientRect();
    scrollTo({ top: r.top + scrollY - 800, behavior: 'instant' });
    return { x: r.left + r.width / 2, alto: r.height };
  });
  await p.mouse.move(sitio.x, 650);
  await p.waitForTimeout(600);
  let encendidas = 0, muestras = 0;
  for (let i = 0; i < 12; i++) {
    await p.mouse.wheel(0, 110);
    await p.waitForTimeout(50);
    muestras++;
    if (await p.evaluate(() => document.querySelector('.baldosa:hover') !== null)) encendidas++;
  }
  if (encendidas) fallos.push(`se encienden baldosas durante el scroll (${encendidas} de ${muestras})`);
  const falta = await p.evaluate(() => {
    const e = [...document.querySelectorAll('.baldosa')].map(b => b.getBoundingClientRect()).sort((a, b) => Math.abs(a.top + a.height / 2 - 650) - Math.abs(b.top + b.height / 2 - 650))[0];
    return e.top + e.height / 2 - 650;
  });
  await p.mouse.wheel(0, falta);
  // Es el navegador quien vuelve a mirar qué hay bajo el ratón al parar: medido, unos 450 ms y hasta 1 s, con el
  // equipo libre o cargado. Un plazo fijo de 600 ms fallaba de vez en cuando sin que la página tuviera nada mal.
  await p.waitForFunction(() => document.querySelector('.baldosa:hover'), null, { timeout: 3000 }).catch(() => {});
  const bajoElRaton = x => p.evaluate(([cx]) => {
    const e = document.elementFromPoint(cx, 650);
    return { dentro: !!e?.closest('.baldosa'), encendida: document.querySelector('.baldosa:hover') !== null };
  }, [x]);
  const quieto = await bajoElRaton(sitio.x);
  if (!quieto.dentro || !quieto.encendida) fallos.push(`al parar, el ratón no vuelve a responder: ${JSON.stringify(quieto)}`);
  await p.mouse.wheel(0, 40);
  await p.waitForTimeout(90);
  await p.mouse.move(sitio.x + 6, 650);
  const movido = await bajoElRaton(sitio.x + 6);
  if (!movido.dentro) fallos.push('al mover el ratón nada más parar, sigue sin responder');
  await p.waitForTimeout(500);
  await p.mouse.down();
  await p.mouse.wheel(0, 40);
  await p.waitForTimeout(60);
  if (!(await bajoElRaton(sitio.x + 6)).dentro) fallos.push('con un botón pulsado (seleccionar, arrastrar) el scroll corta el arrastre');
  await p.mouse.up();
  await ctx.close();
  const tacto = await navegador.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const m = await tacto.newPage();
  await m.goto(BASE, { waitUntil: 'load' });
  await m.evaluate(() => {
    window.__cortado = false;
    addEventListener('scroll', () => { setTimeout(() => { if (getComputedStyle(document.body).pointerEvents === 'none') window.__cortado = true; }); });
    scrollTo(0, 400);
  });
  await m.waitForTimeout(200);
  if (await m.evaluate(() => window.__cortado)) fallos.push('en el móvil también corta el tacto');
  await tacto.close();
  return fallos;
};
const efectos = async navegador => {
  const fallos = await scrollSinRaton(navegador);
  const abrir = async (r, opts = {}) => {
    const ctx = await navegador.newContext({ viewport: { width: 1366, height: 850 }, ...opts });
    const p = await ctx.newPage();
    await p.goto(BASE + r, { waitUntil: 'load' });
    return { ctx, p };
  };
  // Móvil lento: bajo el velo oscuro de la cabecera, 600–800 px de foto no se distinguen de 1000 y pesan
  // un tercio menos, y es lo que tarda en pintarse la página.
  for (const r of ['clan/', 'en/clan/', 'caceria/', 'dinosaurios/', 'combate/', 'galeria/', 'unete/', 'normas/', 'ruta/', 'legal/']) {
    const { ctx, p } = await abrir(r, { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    const foto = await p.evaluate(() => document.querySelector('.cabecera-fondo').currentSrc.split('/').pop());
    if (+foto.match(/-(\d+)\.webp$/)[1] > 800) fallos.push(`/${r} en el móvil la cabecera pide ${foto}`);
    await ctx.close();
  }
  // Las portadas de los vídeos quedan más abajo: no pueden competir con la cabecera al abrir, pero tienen
  // que salir al llegar. Con los estilos retenidos no hay maquetación: lo que se pida ya, se pide «a ciegas».
  for (const r of ['clan/', 'en/clan/']) {
    const ctx = await navegador.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    const p = await ctx.newPage();
    const pedidas = [];
    p.on('request', q => pedidas.push(q.url()));
    let soltar;
    const retenidos = new Promise(z => { soltar = z; });
    await p.route('**/estilos.css*', async ruta => { await retenidos; await ruta.continue(); });
    const cargando = p.goto(BASE + r, { waitUntil: 'load' });
    await p.waitForSelector('.batalla-video video', { state: 'attached' });
    await p.waitForTimeout(400);
    const aCiegas = pedidas.filter(u => /batalla-[^/]+\.webp/.test(u));
    if (aCiegas.length) fallos.push(`/${r} pide las portadas de los vídeos al abrir: ${aCiegas.map(u => u.split('/').pop()).join(', ')}`);
    soltar();
    await cargando;
    const portadas = await p.evaluate(async () => {
      const res = [];
      for (const v of document.querySelectorAll('.batalla-video video')) {
        v.scrollIntoView({ block: 'center', behavior: 'instant' });
        await new Promise(z => setTimeout(z, 300));
        if (!v.poster) { res.push(0); continue; }
        const img = new Image();
        img.src = v.poster;
        await img.decode().catch(() => {});
        res.push(img.naturalWidth);
      }
      return res;
    });
    if (!portadas.length || portadas.some(a => !a)) fallos.push(`/${r} vídeos sin portada al llegar: ${JSON.stringify(portadas)}`);
    await ctx.close();
  }
  // Menú del móvil: mientras se funde al cerrar sigue maquetado a pantalla completa (si no, los enlaces
  // salen un instante en fila arriba) y al acabar no queda nada encima de la página.
  for (const r of ['', 'en/']) {
    const { ctx, p } = await abrir(r, { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    await p.tap('.menu-boton');
    await p.waitForTimeout(400);
    const m = await p.evaluate(async () => {
      const menu = document.querySelector('.menu');
      const cs = getComputedStyle(menu);
      menu.hidePopover();
      await new Promise(z => setTimeout(z, 60));
      const durante = [cs.position, cs.display];
      await new Promise(z => setTimeout(z, 500));
      return { durante, fin: cs.display };
    });
    if (m.durante[0] !== 'fixed') fallos.push(`/${r} el menú pierde su sitio al cerrarse: ${JSON.stringify(m)}`);
    if (m.fin !== 'none') fallos.push(`/${r} el menú no acaba de irse: ${JSON.stringify(m)}`);
    await ctx.close();
  }
  // Bruma de portada y cabeceras: sale, se para fuera de pantalla y en reposo; sin movimiento no existe.
  for (const r of ['', 'en/', 'clan/', 'en/hunt/']) {
    const { ctx, p } = await abrir(r);
    await p.waitForSelector('.bruma.encendido', { timeout: 5000 }).catch(() => fallos.push(`/${r} sin bruma`));
    const estado = () => p.evaluate(() => {
      const b = document.querySelector('.bruma');
      return b ? getComputedStyle(b, '::before').animationPlayState : 'falta';
    });
    if (await estado() !== 'running') fallos.push(`/${r} la bruma no se mueve: ${await estado()}`);
    await p.evaluate(() => scrollTo({ top: document.querySelector('.bruma').parentElement.offsetHeight + 900, behavior: 'instant' }));
    await p.waitForTimeout(300);
    if (await estado() !== 'paused') fallos.push(`/${r} la bruma sigue en marcha fuera de pantalla: ${await estado()}`);
    await p.evaluate(() => scrollTo({ top: 0, behavior: 'instant' }));
    await p.waitForTimeout(300);
    if (await estado() !== 'running') fallos.push(`/${r} la bruma no vuelve al subir: ${await estado()}`);
    await p.evaluate(() => dispatchEvent(new Event('blur')));
    await p.waitForTimeout(100);
    if (await estado() !== 'paused') fallos.push(`/${r} la bruma sigue en marcha en reposo: ${await estado()}`);
    await ctx.close();
  }
  {
    const { ctx, p } = await abrir('', { reducedMotion: 'reduce' });
    await p.waitForTimeout(1200);
    if (await p.locator('.bruma').count()) fallos.push('con «reducir movimiento» hay bruma');
    await ctx.close();
  }
  // Cabecera de la Cacería: el botón del Discord se ve siempre, también sin JavaScript, cuando no hay
  // cuenta atrás que enseñar; con JavaScript, la cuenta atrás y el botón van en la misma tarjeta.
  for (const r of ['caceria/', 'en/hunt/']) {
    for (const [nombre, opts] of [['con JavaScript', {}], ['sin JavaScript', { javaScriptEnabled: false }]]) {
      const { ctx, p } = await abrir(r, opts);
      const boton = p.locator('.cabecera a.boton[href*="discord.com/invite"]');
      if (!(await boton.isVisible())) fallos.push(`/${r} ${nombre}: el botón del Discord de la cabecera no se ve`);
      const cuenta = await p.locator('.cabecera [data-cuenta]').isVisible();
      if (cuenta !== !opts.hasOwnProperty('javaScriptEnabled')) fallos.push(`/${r} ${nombre}: cuenta atrás ${cuenta ? 'a la vista' : 'oculta'}`);
      await ctx.close();
    }
  }
  // Arañazos de los títulos: acaban enteros, con animación y sin JavaScript.
  for (const [nombre, opts] of [['normal', {}], ['sin JavaScript', { javaScriptEnabled: false }], ['sin movimiento', { reducedMotion: 'reduce' }]]) {
    const { ctx, p } = await abrir('', opts);
    await p.locator('#t-quienes').scrollIntoViewIfNeeded();
    await p.waitForTimeout(1300);
    const tam = await p.evaluate(() => getComputedStyle(document.querySelector('#t-quienes'), '::after').backgroundSize);
    if (tam !== '14% 100%, 14% 100%, 14% 100%') fallos.push(`arañazos a medias (${nombre}): ${tam}`);
    await ctx.close();
  }
  // Fotos que se funden al llegar: ninguna se queda invisible, tampoco si falla al cargar.
  {
    const ctx = await navegador.newContext({ viewport: { width: 1366, height: 850 } });
    const p = await ctx.newPage();
    await p.route('**/galeria-roca-*.webp', z => z.abort());
    await p.goto(BASE + 'galeria/', { waitUntil: 'load' });
    await p.evaluate(async () => {
      for (const li of document.querySelectorAll('.foto')) { li.scrollIntoView({ behavior: 'instant', block: 'center' }); await new Promise(z => setTimeout(z, 90)); }
    });
    await p.waitForTimeout(1500);
    const quedan = await p.evaluate(() => [...document.querySelectorAll('.foto img, .baldosa-fondo, .tira img')].filter(i => i.classList.contains('por-llegar')).map(i => i.getAttribute('src')));
    if (quedan.length) fallos.push(`fotos invisibles tras cargar o fallar: ${quedan.join(', ')}`);
    await ctx.close();
  }
  // Botón grande de los vídeos: uno por vídeo, en su idioma; se aparta al reproducir y vuelve al acabar.
  for (const [r, inicio] of [['clan/', 'Reproducir: '], ['en/clan/', 'Play: ']]) {
    const { ctx, p } = await abrir(r);
    const v = await p.evaluate(texto => {
      const videos = [...document.querySelectorAll('.batalla-video video')];
      const botones = [...document.querySelectorAll('.video-play')];
      const bien = botones.every((b, i) => b.getAttribute('aria-label') === texto + videos[i].getAttribute('aria-label'));
      videos[0].dispatchEvent(new Event('play'));
      const alReproducir = botones[0].hidden;
      videos[0].dispatchEvent(new Event('ended'));
      return { videos: videos.length, botones: botones.length, bien, alReproducir, alAcabar: botones[0].hidden };
    }, inicio);
    if (!v.videos || v.videos !== v.botones || !v.bien || !v.alReproducir || v.alAcabar) fallos.push(`/${r} botón de los vídeos: ${JSON.stringify(v)}`);
    await ctx.close();
  }
  // Comparativa: al reordenar, las filas viajan a su sitio; sin movimiento, se colocan sin más.
  for (const [r, opts, esperadas] of [['dinosaurios/', {}, true], ['en/dinosaurs/', {}, true], ['dinosaurios/', { reducedMotion: 'reduce' }, false]]) {
    const { ctx, p } = await abrir(r, opts);
    const n = await p.evaluate(() => {
      const sel = document.querySelector('[data-comparar] select');
      sel.value = 'peso';
      sel.dispatchEvent(new Event('change', { bubbles: true }));
      return document.getAnimations().filter(a => a.effect.target.matches?.('.comparar-lista > div')).length;
    });
    if ((n > 0) !== esperadas) fallos.push(`/${r} comparativa ${esperadas ? 'sin' : 'con'} movimiento al ordenar (${n} filas, ${JSON.stringify(opts)})`);
    await ctx.close();
  }
  // Comparativa: al ordenar cambia también lo que se anuncia; si el texto no cambia, un lector de pantalla calla.
  for (const r of ['dinosaurios/', 'en/dinosaurs/']) {
    const { ctx, p } = await abrir(r);
    const m = await p.evaluate(() => {
      const caja = document.querySelector('[data-comparar]');
      const orden = caja.querySelector('select');
      const estado = caja.querySelector('[role="status"]');
      const antes = estado.textContent;
      orden.value = 'peso';
      orden.dispatchEvent(new Event('change', { bubbles: true }));
      return { antes, despues: estado.textContent, opcion: orden.selectedOptions[0].textContent };
    });
    if (m.antes === m.despues || !m.despues.includes(m.opcion)) fallos.push(`/${r} al ordenar no se anuncia: ${JSON.stringify(m)}`);
    await ctx.close();
  }
  // Planificador: sin JavaScript no hay calculadora, y lo dice en vez de dejar un apartado vacío.
  for (const [r, id] of [['dinosaurios/', 'planificador'], ['en/dinosaurs/', 'planner']]) {
    for (const [nombre, opts, esperado] of [['sin JavaScript', { javaScriptEnabled: false }, true], ['con JavaScript', {}, false]]) {
      const { ctx, p } = await abrir(r, opts);
      const aviso = p.locator(`#${id} noscript p`);
      const visto = await aviso.count() > 0 && await aviso.first().isVisible();
      if (visto !== esperado) fallos.push(`/${r} planificador ${nombre}: aviso ${visto ? 'a la vista' : 'sin ver'}`);
      await ctx.close();
    }
  }
  // Al hacer scroll: cada animación ligada al scroll depende de la página, no de una caja suya que no se
  // mueve (un overflow: hidden de más la deja clavada y no da ningún error), y de verdad avanza al bajar
  // y vuelve al subir. Lo que entra acaba entero, también al final de la página.
  const ESPERADAS = { '': ['salir-portada', 'fondo-lento', 'aparecer', 'baldosa-lenta', 'linea-seccion', 'rombo'], 'en/': ['salir-portada', 'fondo-lento', 'aparecer', 'baldosa-lenta', 'linea-seccion', 'rombo'], 'caceria/': ['salir-portada', 'fondo-lento', 'aparecer', 'cartel', 'linea-seccion', 'rombo'], 'en/clan/': ['salir-portada', 'fondo-lento', 'aparecer', 'linea-seccion', 'rombo'], 'galeria/': ['salir-portada', 'fondo-lento', 'aparecer'] };
  for (const [aparato, opts] of [['PC', {}], ['móvil', { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }]]) {
    for (const [r, nombres] of Object.entries(ESPERADAS)) {
      const { ctx, p } = await abrir(r, opts);
      const v = await p.evaluate(async () => {
        const unFotograma = () => new Promise(z => requestAnimationFrame(() => requestAnimationFrame(z)));
        const irA = async y => { scrollTo({ top: y, behavior: 'instant' }); await unFotograma(); };
        const deScroll = () => document.getAnimations().filter(a => a.timeline && a.timeline.constructor.name !== 'DocumentTimeline' && a.animationName !== 'progreso');
        const avance = a => a.effect.getComputedTiming().progress;
        const quien = a => `${a.animationName} en ${a.effect.target.className || a.effect.target.tagName}${a.effect.pseudoElement || ''}`;
        const clavadas = new Set(), vistas = new Set(), quietas = [];
        const repasar = () => { for (const a of deScroll()) { vistas.add(a.animationName); if (a.timeline.source !== document.documentElement) clavadas.add(quien(a)); } };
        repasar();
        // Cada animación, con su caja a dos alturas de la pantalla: tiene que dar valores distintos.
        for (const nombre of ['salir-portada', 'fondo-lento', 'aparecer', 'baldosa-lenta', 'cartel', 'linea-seccion', 'rombo']) {
          // Una que aún esté por debajo de la pantalla: la primera puede estar ya entera al cargar.
          const suyas = deScroll().filter(x => x.animationName === nombre);
          const a = suyas.find(x => x.effect.target.getBoundingClientRect().top > innerHeight * 1.2) || suyas[0];
          if (!a) continue;
          const caja = a.effect.target.closest('.seccion') && /linea|rombo/.test(nombre) ? a.effect.target : a.effect.target.closest('.portada, .cabecera') || a.effect.target;
          const yCaja = caja.getBoundingClientRect().top + scrollY;
          const alturas = /salir|fondo/.test(nombre) ? [yCaja + caja.offsetHeight * .3, yCaja + caja.offsetHeight * .9]
            : /aparecer|linea|rombo/.test(nombre) ? [yCaja - innerHeight + Math.min(caja.offsetHeight, innerHeight * .18) * .25, yCaja - innerHeight + Math.min(caja.offsetHeight, innerHeight * .3) * .85]
              : [yCaja - innerHeight * .7, yCaja - innerHeight * .1];
          await irA(alturas[0]);
          const uno = avance(a);
          await irA(alturas[1]);
          const dos = avance(a);
          await irA(alturas[0]);
          const vuelta = avance(a);
          if (dos === uno || vuelta !== uno) quietas.push(`${quien(a)}: ${uno} → ${dos} → ${vuelta}`);
        }
        // Se recorre la página entera, para ver también lo que solo existe más abajo.
        const alto = document.documentElement.scrollHeight;
        for (let y = 0; y < alto; y += innerHeight * .8) { await irA(y); repasar(); }
        await irA(alto);
        await new Promise(z => setTimeout(z, 1400));
        const a_medias = [...document.querySelectorAll('.revelar')].filter(el => parseFloat(getComputedStyle(el).opacity) < .99).map(el => el.className);
        return { clavadas: [...clavadas], vistas: [...vistas], quietas, a_medias, sobra: document.documentElement.scrollWidth - document.documentElement.clientWidth };
      });
      // El cartel de la Cacería en el móvil va quieto a propósito: el zoom cortaría las letras.
      const faltan = nombres.filter(n => !v.vistas.includes(n) && !(n === 'cartel' && aparato === 'móvil'));
      const lugar = `${aparato} /${r}`;
      if (v.clavadas.length) fallos.push(`${lugar} sin seguir a la página: ${v.clavadas.slice(0, 6).join(', ')}`);
      if (faltan.length) fallos.push(`${lugar} no están atadas al scroll: ${faltan.join(', ')}`);
      if (v.quietas.length) fallos.push(`${lugar} no avanzan o no vuelven: ${v.quietas.join('; ')}`);
      if (v.a_medias.length) fallos.push(`${lugar} se quedan a medias al final: ${v.a_medias.slice(0, 4).join(', ')}`);
      if (v.sobra > 0) fallos.push(`${lugar} ${v.sobra} px más ancha que la pantalla`);
      await ctx.close();
    }
  }
  // Sin movimiento nada se mueve al bajar; sin JavaScript, los bloques se ven desde el principio.
  for (const [nombre, opts, sel] of [['sin movimiento', { reducedMotion: 'reduce' }, '.revelar, .portada-in'], ['sin JavaScript', { javaScriptEnabled: false }, '.revelar']]) {
    const { ctx, p } = await abrir('', opts);
    await p.waitForTimeout(800);
    const m = await p.evaluate(s => [...document.querySelectorAll(s)].filter(el => getComputedStyle(el).opacity !== '1' || getComputedStyle(el).animationName !== 'none').length, sel);
    if (m) fallos.push(`${nombre}: ${m} bloques animados u ocultos`);
    await ctx.close();
  }
  // Móvil con la web quieta: las ascuas recalculan 30 veces por segundo; si salen 60, alguna animación se
  // ha salido de la tarjeta gráfica (pasó con dos a la vez en la garra: el procesador, del 13 % al 40 %).
  // También en una pantalla baja: la bruma de la llamada final, lejísimos de la vista, no puede mantener frames.
  for (const [r, alto] of [['', 915], ['en/', 915], ['clan/', 915], ['galeria/', 915], ['', 640], ['en/', 640]]) {
    const { ctx, p } = await abrir(r, { viewport: { width: 412, height: alto }, isMobile: true, hasTouch: true });
    await p.waitForTimeout(4000);
    const cdp = await ctx.newCDPSession(p);
    await cdp.send('Performance.enable');
    const estilos = async () => (await cdp.send('Performance.getMetrics')).metrics.find(m => m.name === 'RecalcStyleCount').value;
    const antes = await estilos();
    await p.waitForTimeout(3000);
    const porSegundo = (await estilos() - antes) / 3;
    if (porSegundo > 45) fallos.push(`/${r} en el móvil (${alto} px de alto), quieta, recalcula ${porSegundo.toFixed(0)} veces por segundo`);
    await ctx.close();
  }
  // Cada respuesta tiene su dirección: abre esa pregunta y la deja a la vista, entrando de fuera y desde la
  // portada, que lleva a ellas. Las direcciones circulan: cambiar una rompe enlaces ya compartidos.
  for (const [r, respuestas] of [['unete/', ['como-entro', 'gente', 'buscando', 'coste', 'nuevo', 'micro', 'latam', 'es-servidor', 'que-es', 'evrima', 'servidor', 'cuando', 'avisos', 'dietas', 'hacer-grupo', 'ranking', 'rangos', 'apoyar']],
    ['en/join/', ['how-to-join', 'people', 'recruiting', 'spanish', 'cost', 'new', 'mic', 'latam', 'is-server', 'what-is', 'evrima', 'server', 'when', 'alerts', 'diets', 'group-up', 'ranking', 'ranks', 'support']]]) {
    const { ctx, p } = await abrir(r);
    const ids = await p.evaluate(() => [...document.querySelectorAll('.faq details')].map(d => d.id));
    if (JSON.stringify(ids) !== JSON.stringify(respuestas)) fallos.push(`/${r} direcciones de las preguntas: ${ids.join(',')}`);
    await ctx.close();
  }
  const respuestaAbierta = () => {
    const d = document.getElementById(location.hash.slice(1));
    if (!d || d.tagName !== 'DETAILS') return 'no existe';
    const b = d.querySelector('summary').getBoundingClientRect();
    const barra = document.querySelector('.barra').getBoundingClientRect().bottom;
    return !d.open ? 'plegada' : b.top < barra - 1 || b.bottom > innerHeight ? `fuera de la vista (${Math.round(b.top)})` : '';
  };
  for (const [desde, selector, destino] of [['', '.ficha a[href$="#micro"]', 'unete/#micro'], ['', '.datos a[href$="#micro"]', 'unete/#micro'], ['en/', '.ficha a[href$="#server"]', 'en/join/#server'], ['en/', '.datos a[href$="#mic"]', 'en/join/#mic']]) {
    for (const opts of [{}, { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }]) {
      const { ctx, p } = await abrir(desde, opts);
      const enlace = await p.$(selector);
      if (!enlace) { fallos.push(`/${desde} sin enlace ${selector}`); await ctx.close(); continue; }
      await enlace.evaluate(a => a.scrollIntoView({ block: 'center', behavior: 'instant' }));
      await enlace.click();
      await p.waitForURL('**/' + destino);
      await p.waitForTimeout(1200);
      const m = await p.evaluate(respuestaAbierta);
      if (m) fallos.push(`/${desde} → ${destino}: ${m}`);
      await ctx.close();
    }
  }
  // Móvil tumbado: el botón principal se ve sin bajar, el título no se come la pantalla y el menú cabe entero.
  for (const [ancho, alto] of [[844, 390], [667, 375]]) {
    const { ctx, p } = await abrir('', { viewport: { width: ancho, height: alto }, isMobile: true, hasTouch: true });
    for (const r of ['', 'en/', 'caceria/', 'en/clan/', 'unete/', 'en/dinosaurs/']) {
      await p.goto(BASE + r, { waitUntil: 'load' });
      const m = await p.evaluate(() => {
        const boton = document.querySelector('.portada .acciones .boton, .cabecera .acciones .boton');
        return { boton: boton ? boton.getBoundingClientRect().bottom : 0, h1: document.querySelector('h1').getBoundingClientRect().height, alto: innerHeight, sobra: document.documentElement.scrollWidth - innerWidth };
      });
      if (m.boton > m.alto) fallos.push(`/${r} tumbado a ${ancho}×${alto}: el botón principal acaba en ${Math.round(m.boton)}, fuera de la pantalla`);
      if (m.h1 > m.alto * .5) fallos.push(`/${r} tumbado a ${ancho}×${alto}: el título mide ${Math.round(m.h1)} px`);
      if (m.sobra > 0) fallos.push(`/${r} tumbado a ${ancho}×${alto}: ${m.sobra} px más ancha que la pantalla`);
    }
    await p.goto(BASE, { waitUntil: 'load' });
    await p.tap('.menu-boton');
    await p.waitForTimeout(400);
    const menu = await p.evaluate(() => {
      const fuera = [...document.querySelectorAll('.menu a')].filter(a => { const b = a.getBoundingClientRect(); return b.bottom > innerHeight || b.right > innerWidth || b.top < 0; }).map(a => a.textContent.trim());
      const caja = document.querySelector('.menu');
      return { fuera, sube: caja.scrollHeight > caja.clientHeight };
    });
    if (menu.fuera.length || menu.sube) fallos.push(`menú tumbado a ${ancho}×${alto}: ${JSON.stringify(menu)}`);
    await ctx.close();
  }
  // Letra del navegador al 150 %: la cabecera sigue cabiendo, con el botón del menú entero en pantalla.
  {
    const grande = await chromium.launch({ ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}), args: ['--blink-settings=defaultFontSize=24'] });
    const ctx = await sinSalir(await grande.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }));
    const p = await ctx.newPage();
    for (const r of ['', 'en/hunt/']) {
      await p.goto(BASE + r, { waitUntil: 'load' });
      const m = await p.evaluate(() => {
        const nombre = document.querySelector('.barra .marca');
        return { letra: getComputedStyle(document.documentElement).fontSize, derecha: document.querySelector('.menu-boton').getBoundingClientRect().right, nombre: nombre.getAttribute('aria-label') || nombre.textContent.trim() };
      });
      if (m.letra !== '24px') fallos.push(`la prueba de letra grande no ha subido la letra: ${m.letra}`);
      // Contra el ancho pedido: si algo sobresale, el móvil aleja la página entera y innerWidth crece con ella.
      if (m.derecha > 390) fallos.push(`/${r} con letra al 150 % el botón del menú acaba en ${Math.round(m.derecha)} de 390`);
      if (!m.nombre) fallos.push(`/${r} con letra al 150 % la marca se queda sin nombre`);
    }
    await grande.close();
  }
  // Auditoría de accesibilidad. Sin movimiento, para medir los colores finales y no los de media animación.
  const axe = readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8');
  const auditar = async (p, donde) => {
    await p.evaluate(axe);
    const r = await p.evaluate(() => axe.run(document, { resultTypes: ['violations'] }).then(a => a.violations.map(v => `${v.id} ×${v.nodes.length} (${v.nodes[0].target.join(' ')})`)));
    if (r.length) fallos.push(`${donde}: ${r.join(', ')}`);
  };
  for (const [aparato, opts] of [['móvil', { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }], ['PC', { viewport: { width: 1366, height: 850 } }]]) {
    const { ctx, p } = await abrir('', { ...opts, reducedMotion: 'reduce', bypassCSP: true });
    const paginas = [...PAGINAS.map(([r]) => r), 'dinosaurios/triceratops/', 'en/dinosaurs/triceratops/'];
    for (const r of paginas) {
      await p.goto(BASE + r, { waitUntil: 'load' });
      await p.evaluate(() => document.querySelectorAll('details').forEach(d => { d.open = true; }));
      await auditar(p, `${aparato} /${r}`);
    }
    if (aparato === 'móvil') {
      await p.goto(BASE, { waitUntil: 'load' });
      await p.tap('.menu-boton');
      await auditar(p, 'móvil, menú abierto');
    }
    await p.goto(BASE + 'galeria/', { waitUntil: 'load' });
    await p.click('.galeria a');
    await p.waitForSelector('.visor[open] .visor-img');
    await auditar(p, `${aparato}, visor abierto`);
    await ctx.close();
  }
  console.log('Efectos (menú, bruma, arañazos, fotos, vídeos, comparativa, scroll, procesador, auditoría):', fallos.length ? fallos.join('; ') : 'bien');
  return fallos.length;
};
// Galería en móviles de alta densidad: las fotos a lo ancho no piden más de 1200 px (pedían 1500 para 1074
// píxeles de pantalla, el doble de peso sin que se note) y ninguna se amplía más de lo que aguanta la vista.
// SOLO=fotos prueba solo esto.
// El mismo formato que cifras.numero al montar: la mitad redondea al par (como Python), en inglés con coma de
// miles y en español con espacio fino desde 10 000. SOLO=cifras prueba solo las cifras de la portada.
const numeroWeb = (valor, ingles) => {
  const abajo = Math.floor(valor), resto = valor - abajo;
  const n = resto > .5 || (resto === .5 && abajo % 2) ? abajo + 1 : abajo;
  const conComa = n.toLocaleString('en-US');
  return ingles ? conComa : n >= 10000 ? conComa.replaceAll(',', '\u202f') : String(n);
};
const cifrasPortada = async (navegador, ESPECIES) => {
  let malos = 0;
  // Cifras del clan y podio de especies de la portada: lo que dice herramientas/cifras.json (si no hay, ni
  // cifras ni podio y la portada sigue entera), cada especie con su ficha, sin ningún nombre ni ID y sin salirse
  // de la pantalla en el móvil más estrecho.
  {
    let datos = null;
    try { datos = JSON.parse(readFileSync(`${__dirname}/cifras.json`, 'utf8')); } catch (e) { if (e.code !== 'ENOENT') throw e; }
    for (const [inicio, guia] of [['', 'dinosaurios/'], ['en/', 'en/dinosaurs/']]) {
      const fallos = [];
      const ctx = await navegador.newContext({ viewport: { width: 320, height: 700 }, isMobile: true, hasTouch: true });
      const p = await ctx.newPage();
      await p.goto(BASE + inicio, { waitUntil: 'load' });
      const v = await p.evaluate(() => ({
        cifras: [...document.querySelectorAll('.cifras li:not(.cifras-nota):not(.cifras-enlace) b')].map(b => b.textContent),
        nota: document.querySelector('.cifras-nota time')?.getAttribute('datetime') || '',
        podio: [...document.querySelectorAll('.podio-lista li')].map(li => ({ nombre: li.querySelector('.podio-nombre').textContent, bajas: li.querySelector('b').textContent, enlace: li.querySelector('a')?.getAttribute('href') || '' })),
        sobra: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        batallas: !!document.querySelector('.cifras-enlace'),
      }));
      if (!datos) {
        if (v.podio.length || v.nota) fallos.push('sin cifras.json, la portada enseña cifras');
      } else {
        const esperadas = ['bajas', 'horas', 'misiones', 'jugadores'].map(k => numeroWeb(datos[k], inicio));
        if (JSON.stringify(v.cifras.slice(0, 4)) !== JSON.stringify(esperadas)) fallos.push(`cifras ${v.cifras.slice(0, 4)} y cifras.json dice ${esperadas}`);
        if (v.nota !== datos.fecha) fallos.push(`fecha ${v.nota} y cifras.json dice ${datos.fecha}`);
        const orden = [...datos.especies].sort((a, b) => b.kills - a.kills);
        if (JSON.stringify(v.podio.map(e => [e.nombre, e.bajas])) !== JSON.stringify(orden.map(e => [e.name, numeroWeb(e.kills, inicio)]))) fallos.push(`podio ${JSON.stringify(v.podio)}`);
        for (const e of v.podio) {
          const ficha = guia + e.nombre.toLowerCase() + '/';
          if (e.enlace && new URL(e.enlace, BASE + inicio).href !== BASE + ficha) fallos.push(`${e.nombre} enlaza a ${e.enlace}`);
          if (!e.enlace && ESPECIES.includes(ficha)) fallos.push(`${e.nombre} tiene ficha y el podio no la enlaza`);
        }
        const con = v.podio.find(e => e.enlace);
        if (con) {
          await Promise.all([p.waitForEvent('load', { timeout: 5000 }).catch(() => {}), p.locator('.podio-lista a').first().click()]);
          if (p.url() !== new URL(con.enlace, BASE + inicio).href) fallos.push(`pulsar ${con.nombre} lleva a ${p.url()}`);
        }
      }
      if (v.sobra > 0) fallos.push(`${v.sobra} px más ancha que la pantalla`);
      if (!v.batallas) fallos.push('las batallas ya no salen junto a las cifras');
      await ctx.close();
      if (fallos.length) malos++;
      console.log(ruta(inicio), 'cifras y podio de especies:', fallos.length ? fallos.join('; ') : `sí, ${datos ? datos.especies.length : 0} especies`);
    }
  }
  return malos;
};
const fotosMovil = async navegador => {
  const fallos = [];
  for (const r of ['galeria/', 'en/gallery/']) for (const [w, d] of [[360, 3], [390, 3], [430, 3], [440, 3], [480, 3], [360, 2], [390, 2], [400, 2], [410, 2]]) {
    const ctx = await navegador.newContext({ viewport: { width: w, height: 844 }, deviceScaleFactor: d, isMobile: true, hasTouch: true });
    const p = await ctx.newPage();
    await p.goto(BASE + r, { waitUntil: 'load' });
    const alto = await p.evaluate(() => document.documentElement.scrollHeight);
    for (let y = 0; y < alto; y += 500) { await p.evaluate(v => scrollTo({ top: v, behavior: 'instant' }), y); await p.waitForTimeout(30); }
    await p.waitForFunction(() => [...document.querySelectorAll('.foto img')].every(i => i.complete && i.naturalWidth), null, { timeout: 15000 }).catch(() => {});
    const fotos = await p.evaluate(() => [...document.querySelectorAll('.foto img')].map(i => {
      const real = parseInt(i.srcset.split(',').map(s => s.trim().split(/\s+/)).find(([u]) => new URL(u, location).href === i.currentSrc)?.[1]);
      return { f: i.currentSrc.split('/').pop(), real, ancha: i.clientWidth > innerWidth * .7, con600: /\s600w/.test(i.srcset),
        amplia: Math.max(i.clientWidth / real, i.clientHeight / (real * i.naturalHeight / i.naturalWidth)) * devicePixelRatio };
    }));
    if (fotos.length < 20) fallos.push(`${r} ${w}×${d}: solo ${fotos.length} fotos`);
    for (const x of fotos) {
      if (!x.real) fallos.push(`${r} ${w}×${d}: ${x.f} no está en su srcset`);
      if (x.ancha && w <= 450 && x.real > 1200) fallos.push(`${r} ${w}×${d}: ${x.f} pide más de 1200 px`);
      // Las medias baldosas apaisadas, en su caja cuadrada, llegan a 1,33× en los móviles más grandes: comparadas
      // a tamaño real con la de 800 px solo se nota al hacer zoom, y pesan la mitad.
      const media = /^galeria-(roca|bosque|rugido|valle)-/.test(x.f);
      if (x.amplia > (media ? 1.34 : 1.26)) fallos.push(`${r} ${w}×${d}: ${x.f} ampliada ${x.amplia.toFixed(2)}×`);
      if (d === 3 && w <= 440 && media && !x.f.endsWith('-600.webp')) fallos.push(`${r} ${w}×${d}: media baldosa baja ${x.f}, no la de 600 px`);
      // A lo ancho: hasta 400 px en densidad 2 basta la de 600 (a 410 ya pasaría del listón), o la de 800 en las
      // fotos que no la tienen; la densidad 3 no baja de la de 1000.
      if (x.ancha && d === 2 && w <= 400 && x.real !== (x.con600 ? 600 : 800)) fallos.push(`${r} ${w}×${d}: a lo ancho baja ${x.f}, no la de ${x.con600 ? 600 : 800} px`);
      if (x.ancha && d === 2 && w > 400 && x.real <= 600) fallos.push(`${r} ${w}×${d}: a lo ancho baja ${x.f}, y a este ancho la de 600 px no llega`);
      if (x.ancha && d === 3 && w <= 450 && x.real < 1000) fallos.push(`${r} ${w}×${d}: a lo ancho baja ${x.f}, menos de 1000 px`);
    }
    // La foto de la cabecera de la galería también está en la galería: en un móvil 3x tiene que ser el mismo
    // fichero que ya baja la galería. Una variante más pequeña se ve más blanda y suma una descarga.
    if (d === 3 && w <= 450) {
      const cab = await p.evaluate(() => document.querySelector('.cabecera-fondo').currentSrc.split('/').pop());
      if (!fotos.some(x => x.f === cab)) fallos.push(`${r} ${w}×3: la cabecera baja ${cab}, que la galería no usa a este ancho`);
    }
    await ctx.close();
  }
  // Cabeceras interiores en un móvil 3x: bajo el velo oscuro basta la variante más pequeña de su srcset, 26–47 KB menos por página.
  // La de la galería, no: se mira arriba.
  for (const r of ['clan/', 'caceria/', 'combate/', 'dinosaurios/', 'legal/', 'normas/', 'ruta/', 'unete/', 'en/clan/', 'en/hunt/', 'en/combat/', 'en/dinosaurs/', 'en/legal/', 'en/route/', 'en/rules/', 'en/join/']) {
    for (const w of [390, 430]) {
      const ctx = await navegador.newContext({ viewport: { width: w, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
      const p = await ctx.newPage();
      await p.goto(BASE + r, { waitUntil: 'load' });
      const m = await p.evaluate(() => {
        const i = document.querySelector('.cabecera-fondo');
        const anchos = i.srcset.split(',').map(s => s.trim().split(/\s+/));
        return { foto: i.currentSrc.split('/').pop(), real: parseInt(anchos.find(([u]) => new URL(u, location).href === i.currentSrc)?.[1]), menor: Math.min(...anchos.map(([, a]) => parseInt(a))) };
      });
      if (m.real !== m.menor) fallos.push(`/${r} ${w}×3: la cabecera baja ${m.foto}, no la de ${m.menor} px`);
      await ctx.close();
    }
  }
  console.log('Galería y cabeceras en móvil de alta densidad (peso y nitidez):', fallos.length ? fallos.join('; ') : 'bien');
  // Mosaico de la portada: a cada ancho, el fichero que elige cada foto no es más estrecho que lo que se
  // pinta. Se mira el ancho del fichero en su srcset: naturalWidth solo repite lo que dice «sizes», y la
  // baldosa de la guía dice menos en el móvil a propósito (bajo su velo oscuro, 600 px no se distinguen de
  // 1500 y pesan 86 KB menos).
  let malos = fallos.length;
  for (const r of ['', 'en/']) {
    const borrosas = [];
    for (const w of [400, 760, 900, 960, 999, 1000, 1200, 1440]) {
      const ctx = await navegador.newContext({ viewport: { width: w, height: 900 }, deviceScaleFactor: 1 });
      const p = await ctx.newPage();
      await p.goto(BASE + r, { waitUntil: 'load' });
      await p.evaluate(() => document.querySelector('.mosaico').scrollIntoView({ behavior: 'instant' }));
      await p.waitForFunction(() => [...document.querySelectorAll('.baldosa-fondo')].every(i => i.complete && i.naturalWidth), null, { timeout: 10000 });
      const fotos = await p.evaluate(() => [...document.querySelectorAll('.baldosa-fondo')].map(i => ({
        foto: i.currentSrc.split('/').pop(), pinta: i.getBoundingClientRect().width,
        trae: parseInt(i.srcset.split(',').map(s => s.trim().split(/\s+/)).find(([u]) => new URL(u, location).href === i.currentSrc)?.[1]) })));
      for (const f of fotos) if (!(f.trae >= f.pinta * 0.98)) borrosas.push(`${w}px: ${f.foto} de ${f.trae} px pintada a ${Math.round(f.pinta)}`);
      await ctx.close();
    }
    // Y en un móvil 3x la baldosa de la guía no baja más de lo que se ve bajo su velo.
    const ctx = await navegador.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
    const p = await ctx.newPage();
    await p.goto(BASE + r, { waitUntil: 'load' });
    await p.evaluate(() => document.querySelector('.baldosa-dinos').scrollIntoView({ behavior: 'instant' }));
    await p.waitForFunction(() => { const i = document.querySelector('.baldosa-dinos .baldosa-fondo'); return i.complete && i.naturalWidth; }, null, { timeout: 10000 });
    const guia = await p.evaluate(() => document.querySelector('.baldosa-dinos .baldosa-fondo').currentSrc.split('/').pop());
    if (!guia.endsWith('-600.webp')) borrosas.push(`móvil 3x: la baldosa de la guía baja ${guia}`);
    await ctx.close();
    if (borrosas.length) malos++;
    console.log(ruta(r), 'fotos del mosaico a su tamaño:', borrosas.length ? borrosas.join('; ') : 'sí');
  }
  return malos;
};
// Al imprimir sin haber recorrido la página: todo lo que tiene texto o es una foto se ve, nada transparente,
// recortado ni desplazado, y sin ambiente ni barra. Mira cada elemento y no una lista, para cazar un efecto
// nuevo que deje algo oculto. SOLO=imprimir prueba solo esto.
const imprimir = async navegador => {
  const fallos = [];
  for (const r of ['', 'en/', 'clan/', 'en/clan/', 'caceria/', 'combate/', 'galeria/', 'unete/', 'ruta/', 'dinosaurios/', 'dinosaurios/triceratops/']) {
    const ctx = await navegador.newContext({ viewport: { width: 1366, height: 850 } });
    const p = await ctx.newPage();
    await p.goto(BASE + r, { waitUntil: 'load' });
    await p.emulateMedia({ media: 'print' });
    const m = await p.evaluate(() => {
      const malos = new Set();
      const quien = el => el.tagName.toLowerCase() + (el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\s+/).join('.') : '');
      for (const el of document.querySelectorAll('body *')) {
        if (el.closest('dialog, [popover], .oculto, .cuenta, .barra, .subir, noscript, [hidden], script, style')) continue;
        if (el.tagName !== 'IMG' && ![...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim())) continue;
        const caja = el.getBoundingClientRect();
        if (!caja.width && !caja.height) continue;
        for (let a = el; a; a = a.parentElement) {
          const s = getComputedStyle(a);
          // El pie va algo más tenue a propósito (0,8): esto caza lo que no se ve, no lo suave.
          if (parseFloat(s.opacity) < .5) malos.add(`${quien(el)}: opacidad ${s.opacity}`);
          if (s.visibility === 'hidden') malos.add(`${quien(el)}: oculto`);
          if (s.clipPath !== 'none') malos.add(`${quien(el)}: recortado`);
          if (s.translate !== 'none' && !/^(0(px|%)?\s*)+$/.test(s.translate)) malos.add(`${quien(el)}: desplazado ${s.translate}`);
        }
        const propio = getComputedStyle(el);
        // Lo decorativo puede ser transparente a propósito: el ✓ de un logro sin marcar en la ruta.
        if (el.tagName !== 'IMG' && !el.closest('[aria-hidden="true"]') && (propio.webkitBackgroundClip === 'text' || /, 0\)$/.test(propio.color) || propio.color === 'transparent')) malos.add(`${quien(el)}: letra hueca`);
      }
      return {
        anim: document.documentElement.classList.contains('anim'),
        malos: [...malos],
        ambiente: [...document.querySelectorAll('.ascuas, .bruma, .barra')].filter(e => getComputedStyle(e).display !== 'none').map(quien),
      };
    });
    if (!m.anim) fallos.push(`/${r}: la página no lleva «anim» y la prueba no demuestra nada`);
    if (m.malos.length) fallos.push(`/${r}: ${m.malos.length} sin verse, como ${m.malos.slice(0, 3).join(', ')}`);
    if (m.ambiente.length) fallos.push(`/${r}: al imprimir sale ${m.ambiente.slice(0, 3).join(', ')}`);
    await ctx.close();
  }
  console.log('Al imprimir se ve todo:', fallos.length ? fallos.join('; ') : 'sí');
  return fallos.length;
};
// «Ver la lista» de cada dato de una ficha: en una sola línea y con 44 px de alto para el dedo, de
// verdad (se pulsa arriba y abajo del texto), sin pisar el enlace de al lado. SOLO=puesto prueba solo esto.
const enlacesPuesto = async navegador => {
  const fallos = [];
  for (const r of ['dinosaurios/triceratops/', 'en/dinosaurs/triceratops/', 'dinosaurios/gallimimus/']) for (const [w, h, movil] of [[320, 700, true], [390, 844, true], [1366, 850, false]]) {
    const ctx = await navegador.newContext({ viewport: { width: w, height: h }, isMobile: movil, hasTouch: movil, reducedMotion: 'reduce' });
    const p = await ctx.newPage();
    await p.goto(BASE + r, { waitUntil: 'load' });
    const mal = await p.evaluate(() => {
      const fuera = [];
      const enlaces = [...document.querySelectorAll('.dino-puesto a')];
      if (!enlaces.length) fuera.push('no hay enlaces');
      enlaces.forEach((a, n) => {
        if (a.getClientRects().length !== 1) fuera.push(`el ${n + 1} se parte en dos líneas`);
        a.scrollIntoView({ block: 'center', behavior: 'instant' });
        const q = a.getBoundingClientRect(), x = q.left + q.width / 2, y = q.top + q.height / 2;
        for (const d of [-21, 21]) if (document.elementFromPoint(x, y + d) !== a) fuera.push(`el ${n + 1} no responde a ${d} px del centro`);
        const sig = enlaces[n + 1];
        if (sig && Math.abs(sig.getBoundingClientRect().top - q.top) < 44) fuera.push(`el ${n + 1} pisa al siguiente`);
      });
      return fuera;
    });
    for (const m of mal) fallos.push(`${r} ${w}px: ${m}`);
    await ctx.close();
  }
  console.log('«Ver la lista» de las fichas, para el dedo:', fallos.length ? fallos.join('; ') : 'bien');
  return fallos.length;
};
// Ventanas grandes: cada página crece con la ventana y no se queda en una columna con márgenes vacíos,
// el texto corrido sigue legible, ninguna foto se enseña borrosa ni más alta que la pantalla, y portátil y
// móvil se quedan como estaban. SOLO=ventana prueba solo esto.
const ventana = async navegador => {
  const fallos = [];
  const IDIOMAS = [
    ['', 'clan/', 'dinosaurios/', 'dinosaurios/triceratops/', 'caceria/', 'combate/', 'galeria/', 'unete/', 'normas/', 'legal/'],
    ['en/', 'en/clan/', 'en/dinosaurs/', 'en/dinosaurs/triceratops/', 'en/hunt/', 'en/combat/', 'en/gallery/', 'en/join/', 'en/rules/', 'en/legal/'],
  ];
  const TAMANOS = [[390, 844], [1366, 768], [1920, 1080], [2560, 1440], [3440, 1221]];
  // Cuánto se puede ampliar una foto: de fondo, bajo el velo oscuro, se nota menos que entre el contenido.
  const AMPLIAR = { fondo: 1.45, contenido: 1.26, video: 1.26 };
  const LETRAS_POR_LINEA = 90;
  const medir = lim => {
    const salida = { ancha: document.documentElement.scrollWidth - innerWidth, largas: [], borrosas: [], altas: [], sinUsar: [] };
    document.querySelectorAll('details').forEach(d => { d.open = true; });
    const visible = el => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden'; };
    for (const el of document.querySelectorAll('main p, main li, main dd')) {
      if (el.querySelector('p, ul, ol, dl, div, h3, h4, img') || !visible(el) || el.closest('.cuenta')) continue;
      if (el.textContent.trim().length <= lim.letras) continue;
      // Letra a letra: la línea más larga de verdad, no una media que la última línea, corta, rebaja.
      const alto = parseFloat(getComputedStyle(el).lineHeight) || 20;
      const rango = document.createRange();
      const nodos = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
      const lineas = [0];
      let antes = null;
      for (let n; (n = nodos.nextNode());) for (let i = 0; i < n.length; i++) {
        rango.setStart(n, i); rango.setEnd(n, i + 1);
        const r = rango.getClientRects()[0];
        if (!r || !r.width) continue;
        // Línea nueva: vuelve a la izquierda o cambia de altura (también al saltar de columna).
        if (antes && (r.left < antes.left - 1 || Math.abs(r.top - antes.top) > alto / 2)) lineas.push(0);
        antes = r;
        lineas[lineas.length - 1]++;
      }
      // La media de las líneas llenas: la última suele ser corta, y una suelta con muchas íes no dice nada.
      const llenas = lineas.length > 1 ? lineas.slice(0, -1) : lineas;
      const media = Math.round(llenas.reduce((a, b) => a + b) / llenas.length);
      salida.mayor = Math.max(salida.mayor || 0, media);
      if (media > lim.letras) salida.largas.push(`${el.className || el.parentElement.className || el.tagName} ${media}`);
    }
    const fotos = [['.portada-fondo, .cabecera-fondo', lim.ampliar.fondo], ['.foto img, .baldosa-fondo, .tira img, .marco img', lim.ampliar.contenido]];
    for (const [sel, max] of fotos) for (const img of document.querySelectorAll(sel)) {
      if (!img.naturalWidth || !visible(img)) continue;
      // naturalWidth con srcset no es el ancho del fichero, sino el que dice «sizes»: el de verdad está en el srcset.
      const real = parseInt(img.srcset.split(',').map(s => s.trim().split(/\s+/)).find(([u]) => new URL(u, location).href === img.currentSrc)?.[1]) || img.naturalWidth;
      const a = Math.max(img.clientWidth / real, img.clientHeight / (real * img.naturalHeight / img.naturalWidth)) * devicePixelRatio;
      if (a > max) salida.borrosas.push(`${img.currentSrc.split('/').pop()} a ${a.toFixed(2)}×`);
    }
    for (const v of document.querySelectorAll('.batalla-video video')) {
      if (visible(v) && v.clientWidth * devicePixelRatio / v.getAttribute('width') > lim.ampliar.video) salida.borrosas.push(`vídeo de ${v.clientWidth} px`);
      if (v.clientHeight > innerHeight) salida.altas.push(`vídeo de ${v.clientHeight} px`);
    }
    for (const f of document.querySelectorAll('.foto, .marco')) if (f.clientHeight > innerHeight) salida.altas.push(`${f.id || f.className} de ${f.clientHeight} px`);
    // Lo que ocupa cada sección de lado a lado, sin contar las llamadas finales, que van centradas a propósito.
    for (const s of document.querySelectorAll('main .seccion')) {
      if (!s.querySelector('h2') || (s.querySelector('.saltos') && !s.querySelector('.dinos, .bloque, .plan, .faq, .tarjetas, .pasos, .galeria, .mosaico, dl'))) continue;
      let izq = Infinity, der = -Infinity;
      for (const el of s.querySelectorAll('h2, h3, h4, p, li, dt, dd, summary, img, video, select')) {
        if (!visible(el)) continue;
        const rango = document.createRange();
        rango.selectNodeContents(el);
        const r = el.matches('img, video, select') ? el.getBoundingClientRect() : rango.getBoundingClientRect();
        if (r.width) { izq = Math.min(izq, r.left); der = Math.max(der, r.right); }
      }
      if (der > izq && (der - izq) / innerWidth < lim.uso) salida.sinUsar.push(`#${s.id || s.querySelector('h2')?.id || '?'} ${Math.round((der - izq) / innerWidth * 100)} %`);
    }
    return salida;
  };
  let mayorMedia = 0;
  for (const [w, h] of TAMANOS) {
    const ctx = await navegador.newContext({ viewport: { width: w, height: h }, reducedMotion: 'reduce' });
    const p = await ctx.newPage();
    for (const r of IDIOMAS.flat()) {
      await p.goto(BASE + r, { waitUntil: 'load' });
      await p.evaluate(async () => {
        document.querySelectorAll('img[loading=lazy]').forEach(i => { i.loading = 'eager'; });
        await Promise.all([...document.images].map(i => i.decode().catch(() => {})));
      });
      // En el portátil y el móvil se mira que nada se salga; lo demás, donde sobra sitio (el texto corrido de
      // antes, un poco más largo en algún aviso, se queda a 1366 tal como estaba).
      const m = await p.evaluate(medir, { letras: w > 1440 ? LETRAS_POR_LINEA : 200, ampliar: w > 1440 ? AMPLIAR : { fondo: 9, contenido: 9, video: 9 }, uso: w >= 2560 ? .6 : 0 });
      if (m.ancha > 0) fallos.push(`/${r} a ${w}: la página se sale ${m.ancha} px`);
      if (m.largas.length) fallos.push(`/${r} a ${w}: de media más de ${LETRAS_POR_LINEA} letras por línea: ${m.largas.slice(0, 3).join(', ')}`);
      if (w > 1440) mayorMedia = Math.max(mayorMedia, m.mayor || 0);
      if (m.borrosas.length) fallos.push(`/${r} a ${w}: fotos borrosas: ${m.borrosas.slice(0, 3).join(', ')}`);
      if (m.altas.length) fallos.push(`/${r} a ${w}: más alto que la ventana: ${m.altas.slice(0, 3).join(', ')}`);
      if (m.sinUsar.length) fallos.push(`/${r} a ${w}: secciones que no aprovechan el ancho: ${m.sinUsar.slice(0, 3).join(', ')}`);
    }
    await ctx.close();
  }
  // Cada ancho en una página recién abierta: el contenido y la letra crecen sin saltos y nada se sale; el portátil, igual
  // que siempre. Nada de esperar un rato tras cambiar el tamaño: en una máquina lenta se leería el ancho anterior.
  {
    const ctx = await navegador.newContext({ viewport: { width: 1366, height: 900 }, reducedMotion: 'reduce' });
    const p = await ctx.newPage();
    for (const r of ['', 'dinosaurios/', 'galeria/']) {
      const previo = {}, medidas = {};
      for (let w = 1300; w <= 3600; w += 100) {
        await p.setViewportSize({ width: w, height: 1000 });
        await p.goto(BASE + r, { waitUntil: 'load' });
        await p.waitForFunction(a => innerWidth === a, w);
        const m = medidas[w] = await p.evaluate(() => ({
          letra: parseFloat(getComputedStyle(document.documentElement).fontSize),
          ancho: document.querySelector('main .envoltura').clientWidth,
          sobra: document.documentElement.scrollWidth - innerWidth,
        }));
        if (m.sobra > 0) fallos.push(`/${r} a ${w}: se sale ${m.sobra} px`);
        if (w <= 1440 && (m.letra !== 16 || m.ancho !== 1120)) fallos.push(`/${r} a ${w}: el portátil cambia (letra ${m.letra}, ancho ${m.ancho})`);
        if (previo.letra && (m.letra < previo.letra || m.letra - previo.letra > .5)) fallos.push(`/${r} a ${w}: la letra salta de ${previo.letra} a ${m.letra}`);
        if (previo.ancho && (m.ancho < previo.ancho || m.ancho - previo.ancho > 120)) fallos.push(`/${r} a ${w}: el ancho salta de ${previo.ancho} a ${m.ancho}`);
        Object.assign(previo, m);
      }
      if (previo.ancho < 3000) fallos.push(`/${r}: a 3600 px el contenido solo mide ${previo.ancho} px`);
      if (previo.letra <= 16) fallos.push(`/${r}: la letra no crece con la ventana`);
      // Y al arrastrar el borde, sin recargar, acaba igual que recién abierta: puede tardar, pero no quedarse atrás.
      await p.setViewportSize({ width: 1300, height: 1000 });
      await p.goto(BASE + r, { waitUntil: 'load' });
      for (let w = 1400; w <= 3600; w += 100) {
        await p.setViewportSize({ width: w, height: 1000 });
        const llega = await p.waitForFunction(({ letra, ancho }) => parseFloat(getComputedStyle(document.documentElement).fontSize) === letra
          && document.querySelector('main .envoltura').clientWidth === ancho, medidas[w], { timeout: 8000 }).then(() => true, () => false);
        if (llega) continue;
        const visto = await p.evaluate(() => ({ ancho: document.querySelector('main .envoltura').clientWidth, ventana: innerWidth }));
        fallos.push(`/${r} a ${w}: al cambiar el tamaño se queda en ${JSON.stringify(visto)}; recién abierta mide ${medidas[w].ancho}`);
        break;
      }
    }
    await ctx.close();
  }
  // Lo que se reparte en columnas, a 3440: la galería, las fichas, la tira de la portada y el cálculo de la garra.
  {
    const ctx = await navegador.newContext({ viewport: { width: 3440, height: 1221 }, reducedMotion: 'reduce' });
    const p = await ctx.newPage();
    await p.goto(BASE + 'galeria/', { waitUntil: 'load' });
    const fotos = await p.evaluate(() => {
      const c = [...document.querySelectorAll('.galeria .foto')].map(f => f.getBoundingClientRect());
      const filas = new Map();
      for (const r of c) filas.set(Math.round(r.top), (filas.get(Math.round(r.top)) || []).concat(r));
      return { porFila: [...filas.values()].map(f => f.length), desiguales: [...filas.values()].filter(f => Math.max(...f.map(r => r.height)) - Math.min(...f.map(r => r.height)) > 2).length,
        recortadas: [...document.querySelectorAll('.foto-entera img, .foto-fila img, .foto-orilla img, .foto-atardecer img')].filter(i => { const b = i.parentElement.getBoundingClientRect(); return Math.abs(b.width / b.height - i.width / i.height) > .05 && i.naturalWidth && Math.abs(b.width / b.height - i.naturalWidth / i.naturalHeight) > .05; }).length };
    });
    if (Math.max(...fotos.porFila) < 3) fallos.push(`galería a 3440: como mucho ${Math.max(...fotos.porFila)} fotos por fila`);
    if (fotos.desiguales) fallos.push(`galería a 3440: ${fotos.desiguales} filas con fotos de distinto alto`);
    if (fotos.recortadas) fallos.push(`galería a 3440: ${fotos.recortadas} fotos que iban enteras salen recortadas`);
    await p.goto(BASE + 'dinosaurios/', { waitUntil: 'load' });
    // Ordenar con la lista en dos columnas: la más pesada, arriba de la primera; y sigue en dos columnas.
    await p.selectOption('[data-comparar] label:first-child select', { index: 1 });
    await p.waitForTimeout(100);
    const orden = await p.evaluate(() => {
      const f = [...document.querySelectorAll('.comparar-lista > div:not([hidden])')].map(d => d.getBoundingClientRect());
      return { izq: Math.min(...f.map(r => Math.round(r.left))), primera: Math.round(f[0].left), columnas: new Set(f.map(r => Math.round(r.left))).size, sobra: document.documentElement.scrollWidth - innerWidth };
    });
    if (orden.primera !== orden.izq || orden.columnas !== 2 || orden.sobra > 0) fallos.push(`comparativa a 3440 al ordenar: ${JSON.stringify(orden)}`);
    const dinos = await p.evaluate(() => {
      const f = [...document.querySelector('.dinos-plegadas').children].map(d => Math.round(d.getBoundingClientRect().top));
      const filas = [...document.querySelectorAll('.comparar-lista > div')].map(d => d.getBoundingClientRect());
      return { porFila: f.filter(t => t === f[0]).length, anchoFila: filas[0].width, columnasComparar: new Set(filas.map(r => Math.round(r.left))).size };
    });
    if (dinos.porFila < 4) fallos.push(`guía a 3440: ${dinos.porFila} fichas por fila`);
    if (dinos.columnasComparar < 2 || dinos.anchoFila > 1800) fallos.push(`comparativa a 3440: ${dinos.columnasComparar} columnas de ${Math.round(dinos.anchoFila)} px: una fila tan ancha no se sigue con la vista`);
    // Donde acaba la foto de la cabecera, con tope, no se puede ver un corte: el velo empieza en negro.
    for (const r of ['unete/', 'caceria/', 'combate/']) {
      await p.goto(BASE + r, { waitUntil: 'load' });
      const borde = await p.evaluate(() => {
        const c = document.querySelector('.cabecera'), f = c.querySelector('.cabecera-fondo');
        return { x: Math.round(f.getBoundingClientRect().left), y: Math.round(c.getBoundingClientRect().top + 40), alto: Math.round(c.clientHeight * .4), ancho: f.clientWidth };
      });
      if (borde.x <= 8) { fallos.push(`/${r} a 3440: la foto de cabecera ocupa toda la ventana (${borde.ancho} px): sin tope`); continue; }
      const png = await p.screenshot({ clip: { x: borde.x - 6, y: borde.y, width: 12, height: borde.alto } });
      // En una página en blanco: la de la web no deja pedir nada que no sea suyo.
      const blanca = await ctx.newPage();
      const salto = await blanca.evaluate(async b => {
        const bm = await createImageBitmap(await (await fetch('data:image/png;base64,' + b)).blob());
        const g = new OffscreenCanvas(bm.width, bm.height).getContext('2d');
        g.drawImage(bm, 0, 0);
        const d = g.getImageData(0, 0, bm.width, bm.height).data;
        const luz = x => { let t = 0; for (let y = 0; y < bm.height; y++) { const i = (y * bm.width + x) * 4; t += d[i] + d[i + 1] + d[i + 2]; } return t / 3 / bm.height; };
        return Math.abs(luz(1) - luz(bm.width - 2));
      }, png.toString('base64'));
      await blanca.close();
      if (salto > 1.5) fallos.push(`/${r} a 3440: se ve el borde de la foto de cabecera (salto de luz ${salto.toFixed(1)})`);
    }
    await p.goto(BASE, { waitUntil: 'load' });
    await p.waitForTimeout(200);
    const portada = await p.evaluate(() => {
      const f = document.querySelector('.portada-fondo'), t = document.querySelector('.tira'), m = document.querySelector('.tira-marco');
      const brasa = getComputedStyle(document.querySelector('.portada'), '::after');
      const caja = f.getBoundingClientRect();
      const izq = document.querySelector('.portada').getBoundingClientRect().left + parseFloat(brasa.left) + parseFloat(getComputedStyle(document.querySelector('.portada')).getPropertyValue('--garra-x'));
      const esc = Math.max(f.clientWidth / f.naturalWidth, f.clientHeight / f.naturalHeight), iw = f.naturalWidth * esc;
      return { centro: izq, esperado: f.offsetLeft + (f.clientWidth - iw) * .72 + iw * .785, tira: t.getBoundingClientRect().width / m.getBoundingClientRect().width, alto: document.querySelector('.portada').clientHeight, anchoFoto: caja.width };
    });
    if (Math.abs(portada.centro - portada.esperado) > 8) fallos.push(`portada a 3440: la brasa cae a ${Math.round(portada.centro)} px y los arañazos a ${Math.round(portada.esperado)} px`);
    if (portada.tira < .85) fallos.push(`portada a 3440: la tira de fotos llena solo el ${Math.round(portada.tira * 100)} % de su sitio`);
    if (portada.alto < 900) fallos.push(`portada a 3440: mide ${portada.alto} px de alto con 1221 de ventana`);
    await ctx.close();
  }
  // Móvil: lo que hay arriba de cada página, con su medida de siempre.
  {
    const ctx = await navegador.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
    const p = await ctx.newPage();
    await p.goto(BASE, { waitUntil: 'load' });
    const letra = await p.evaluate(() => parseFloat(getComputedStyle(document.documentElement).fontSize));
    if (letra !== 16) fallos.push(`móvil: la letra base cambia a ${letra} px`);
    await ctx.close();
  }
  console.log(`Ventanas grandes: media de letras por línea, como mucho ${mayorMedia}.`);
  console.log('Ventanas grandes:', fallos.length ? `${fallos.length} fallos\n  ${fallos.join('\n  ')}` : 'bien');
  return fallos.length;
};
// Zarpazo saltado: si la transición entre páginas se salta (en modo ligero, o el navegador cuando llega otra navegación
// encima), ni la página que se deja ni la que llega dan error. Se fuerza el salto en cada lado. SOLO=transicion.
const transicionSaltada = async navegador => {
  const fallos = [];
  for (const lado of ['pageswap', 'pagereveal']) {
    const ctx = await navegador.newContext({ viewport: { width: 375, height: 667 }, isMobile: true, hasTouch: true });
    await ctx.addInitScript(ev => addEventListener(ev, e => {
      if (!e.viewTransition) return;
      try { sessionStorage.setItem('saltada', 'true'); } catch { /* about:blank */ }
      e.viewTransition.skipTransition();
    }), lado);
    const p = await ctx.newPage();
    const errores = [];
    p.on('pageerror', e => errores.push(e.message));
    await p.goto(BASE, { waitUntil: 'load' });
    await p.waitForTimeout(300);
    await p.tap('.menu-boton');
    await p.waitForTimeout(400);
    const cargada = p.waitForEvent('load', { timeout: 5000 }).then(() => true, () => false);
    await p.tap('.menu a[href="clan/"]');
    if (!(await cargada)) fallos.push(`${lado}: no llega a clan/`);
    await p.waitForTimeout(800);
    if (!(await p.evaluate(() => sessionStorage.getItem('saltada') === 'true'))) fallos.push(`${lado}: no hubo transición que saltar, la prueba no demuestra nada`);
    if (errores.length) fallos.push(`saltada en ${lado}: ${JSON.stringify(errores)}`);
    await ctx.close();
  }
  // El caso de la batería: con efectos.js aún sin llegar (va con defer), Chrome salta la transición de la página que
  // llega antes de «pagereveal», que la entrega vacía, y su «ready» se rechaza sin que ningún código pueda atenderlo.
  // Se fuerza retrasando efectos.js en la página que llega (y saltándola si aun así llegara); sin modo ligero, para
  // que la página que se deja no la salte antes. Solo vale si el rechazo llega antes de que corra efectos.js.
  {
    const ctx = await navegador.newContext({ viewport: { width: 375, height: 667 }, isMobile: true, hasTouch: true });
    await ctx.addInitScript(() => {
      window.garraModoFijo = true;
      addEventListener('pagereveal', e => e.viewTransition?.skipTransition());
      addEventListener('unhandledrejection', e => {
        if (!/transition/i.test(e.reason?.message || '')) return;
        // Sin efectos.js todavía, la página conserva la clase con la que llega.
        try { sessionStorage.setItem('saltada', document.documentElement.classList.contains('ligera') ? 'antes' : 'después'); } catch { /* about:blank */ }
      });
    });
    let pedidas = 0;
    await ctx.route(/\/efectos\.js/, async r => {
      if (pedidas++) await new Promise(s => setTimeout(s, 1500));
      await r.continue();
    });
    const p = await ctx.newPage();
    const errores = [];
    p.on('pageerror', e => errores.push(`${p.url()}: ${e.message}`));
    await p.goto(BASE, { waitUntil: 'load' });
    await p.waitForTimeout(300);
    await p.tap('.menu-boton');
    await p.waitForTimeout(400);
    const cargada = p.waitForEvent('load', { timeout: 8000 }).then(() => true, () => false);
    await p.tap('.menu a[href="clan/"]');
    if (!(await cargada)) fallos.push('antes de efectos.js: no llega a clan/');
    await p.waitForTimeout(500);
    const cuando = await p.evaluate(() => sessionStorage.getItem('saltada'));
    if (cuando !== 'antes') fallos.push(`antes de efectos.js: ${cuando ? 'efectos.js ya había corrido' : 'no hubo rechazo de transición'}, la prueba no demuestra nada`);
    if (errores.length) fallos.push(`saltada en pagereveal antes de efectos.js: ${JSON.stringify(errores)}`);
    await ctx.close();
  }
  console.log('Zarpazo saltado sin errores en la página:', fallos.length ? fallos.join('; ') : 'bien');
  return fallos.length;
};
// La ruta de logros, recuadro «Ahora toca»: la sesión que te toca y qué hacer, marcar ahí o en la lista, avanzar al
// completarla, ir de una a otra y llegar desde «Tu progreso». SOLO=ahora prueba solo esto.
const AHORA = {
  'ruta/': { sesion: (n, t) => `Sesión ${n} de ${t}`, actual: 'Ahora toca', hecha: 'Hecha', pendiente: 'Pendiente', completada: t => `Sesión completada. Ahora: ${t}.`, fin: 'Ruta completada', toca: 'Te toca' },
  'en/route/': { sesion: (n, t) => `Session ${n} of ${t}`, actual: 'Up next', hecha: 'Done', pendiente: 'Pending', completada: t => `Session complete. Next: ${t}.`, fin: 'Route complete', toca: 'Next for you' },
};
const ahoraToca = async navegador => {
  const fallos = [];
  const axe = readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8');
  const caja = p => p.evaluate(() => {
    const z = document.querySelector('[data-ahora-zona]');
    const q = s => z && z.querySelector(s);
    const ver = s => { const e = q(s); return Boolean(e && e.getClientRects().length && getComputedStyle(e).visibility !== 'hidden'); };
    return {
      visible: ver('[data-ahora]'), n: q('[data-ahora-n]')?.textContent.trim(), estado: ver('[data-ahora-estado]') ? q('[data-ahora-estado]').textContent.trim() : '',
      titulo: q('[data-ahora-titulo]')?.textContent.trim(), dino: ver('[data-ahora-dino]') ? q('[data-ahora-dino]').textContent.trim() : '',
      grupo: q('[data-ahora-dino]')?.className || '', pasos: z ? z.querySelectorAll('[data-ahora-pasos] li').length : 0,
      tareas: z ? [...z.querySelectorAll('[data-ahora-tareas] button[data-logro]')].map(b => [b.dataset.logro, +b.dataset.nivel, b.getAttribute('aria-pressed')]) : [],
      copiar: z ? z.querySelectorAll('[data-ahora-tareas] button[data-copiar]:not([disabled])').length : 0,
      barra: q('[data-ahora-barra]') ? [q('[data-ahora-barra]').value, q('[data-ahora-barra]').max] : null,
      aviso: q('[data-ahora-aviso]')?.textContent.trim(), avisoRol: q('[data-ahora-aviso]')?.getAttribute('role'),
      irActual: ver('[data-ahora-ir="actual"]'), antesNo: q('[data-ahora-ir="antes"]')?.getAttribute('aria-disabled') === 'true',
      despuesNo: q('[data-ahora-ir="despues"]')?.getAttribute('aria-disabled') === 'true',
      indice: z ? z.querySelectorAll('[data-ahora-indice] [data-ahora-ver]').length : 0,
      marcada: z ? [...z.querySelectorAll('[data-ahora-indice] [data-ahora-ver]')].findIndex(b => b.getAttribute('aria-current') === 'true') : -1,
      foco: document.activeElement === q('[data-ahora-titulo]'),
      toca: document.querySelector('[data-toca]')?.textContent.trim() || '', tocaVisible: Boolean(document.querySelector('[data-toca]')?.getClientRects().length),
      listaVisible: Boolean(document.querySelector('[data-sesiones]')?.getClientRects().length),
    };
  });
  const sembrar = (ctx, marcas) => ctx.addInitScript(m => { if (!sessionStorage.getItem('sembrado')) { localStorage.setItem('garra-ruta-v1', JSON.stringify({ marcas: m })); sessionStorage.setItem('sembrado', '1'); } }, marcas);
  const hasta = (ses, n) => { const m = {}; for (const s of ses.slice(0, n)) for (const [id, v] of s.tareas) m[id] = Math.max(m[id] || 0, v); return m; };
  const pulsarEnCaja = (p, id, v) => p.click(`[data-ahora-tareas] button[data-logro="${id}"][data-nivel="${v}"]`);
  const enLista = (p, id, v) => p.evaluate(([i, n]) => document.querySelector(`.ruta-grupos button[data-logro="${i}"][data-nivel="${n}"]`)?.getAttribute('aria-pressed'), [id, v]);
  const guardado = (p, id) => p.evaluate(i => JSON.parse(localStorage.getItem('garra-ruta-v1') || '{}').marcas?.[i] || 0, id);
  for (const r of Object.keys(AHORA)) {
    const t = AHORA[r];
    const ctx = await navegador.newContext({ viewport: { width: 1280, height: 900 }, reducedMotion: 'reduce' });
    const p = await ctx.newPage();
    const errores = [];
    p.on('pageerror', e => errores.push(e.message));
    await p.goto(BASE + r, { waitUntil: 'load' });
    const ses = await p.evaluate(() => [...document.querySelectorAll('[data-sesion]')].map(li => ({
      titulo: li.querySelector('summary b').textContent, dino: li.querySelector('summary small').textContent, grupo: li.dataset.grupo,
      tareas: [...li.querySelectorAll('button[data-logro]')].map(b => [b.dataset.logro, +b.dataset.nivel]),
    })));
    const N = ses.length;
    let c = await caja(p);
    if (!c.visible) {
      fallos.push(`/${r}: el recuadro «Ahora toca» no aparece`);
      await ctx.close();
      continue;
    }
    if (c.n !== t.sesion(1, N) || c.estado !== t.actual || c.titulo !== ses[0].titulo) fallos.push(`/${r} sin marcas: «${c.n}», «${c.estado}», «${c.titulo}» y debía ser la sesión 1, ${ses[0].titulo}`);
    if (!c.antesNo) fallos.push(`/${r}: en la sesión 1 «Anterior» no está desactivado`);
    if (c.indice !== N) fallos.push(`/${r}: «Toda la ruta» tiene ${c.indice} sesiones de ${N}`);
    if (c.listaVisible) fallos.push(`/${r}: con JavaScript la lista plegable de sesiones sigue a la vista, repetida bajo el recuadro`);
    if (c.avisoRol !== 'status') fallos.push(`/${r}: el aviso del recuadro no es role=status`);
    await ctx.close();

    // A mitad de la ruta: cuatro sesiones hechas.
    const ctx2 = await navegador.newContext({ viewport: { width: 1280, height: 900 }, reducedMotion: 'reduce' });
    await sembrar(ctx2, hasta(ses, 4));
    const q = await ctx2.newPage();
    q.on('pageerror', e => errores.push(e.message));
    await q.goto(BASE + r, { waitUntil: 'load' });
    c = await caja(q);
    const s5 = ses[4];
    const clase = { C: 'dieta-carnivoro', H: 'dieta-herbivoro', O: 'dieta-omnivoro' }[s5.grupo];
    if (c.n !== t.sesion(5, N) || c.estado !== t.actual || c.titulo !== s5.titulo || c.dino !== s5.dino) fallos.push(`/${r} con 4 hechas: «${c.n}», «${c.estado}», «${c.titulo}», «${c.dino}» y debía ser la sesión 5, ${s5.titulo} (${s5.dino})`);
    if (!c.grupo.includes(clase)) fallos.push(`/${r}: el dino de la sesión 5 no lleva el color de su grupo (${clase}): «${c.grupo}»`);
    if (c.pasos < 1) fallos.push(`/${r}: la sesión 5 no dice qué hacer`);
    if (JSON.stringify(c.tareas.map(([i, v]) => [i, v])) !== JSON.stringify(s5.tareas)) fallos.push(`/${r}: las tareas del recuadro no son las de la sesión 5: ${JSON.stringify(c.tareas)}`);
    if (c.marcada !== 4) fallos.push(`/${r}: «Toda la ruta» marca como vista la ${c.marcada + 1}, no la 5`);
    if (!c.tocaVisible || !c.toca.includes(t.toca) || !c.toca.includes(t.sesion(5, N).toLowerCase()) || !c.toca.includes(s5.titulo) || !c.toca.includes(s5.dino)) fallos.push(`/${r}: el acceso de «Tu progreso» dice «${c.toca}»`);
    const conCoord = ses.findIndex(s => s.tareas.some(([i]) => /^[fg]-/.test(i)));
    await q.evaluate(() => scrollTo(0, 0));
    await q.click('[data-toca] a');
    await q.waitForTimeout(150);
    const llegada = await q.evaluate(() => { const b = document.querySelector('[data-ahora]').getBoundingClientRect(); return { arriba: b.top, alto: innerHeight }; });
    c = await caja(q);
    if (!c.foco || llegada.arriba < 0 || llegada.arriba > llegada.alto / 2) fallos.push(`/${r}: el acceso de «Tu progreso» no lleva al recuadro (foco en el título: ${c.foco}, arriba a ${Math.round(llegada.arriba)} px)`);
    // Marcar en el recuadro marca en la lista, y al revés; las dos guardan igual.
    const [id1, v1] = s5.tareas[0];
    await pulsarEnCaja(q, id1, v1);
    if (await enLista(q, id1, v1) !== 'true' || await guardado(q, id1) !== v1) fallos.push(`/${r}: marcar ${id1} en el recuadro no lo marca en la lista o no lo guarda`);
    c = await caja(q);
    if (!c.barra || c.barra[0] !== 1 || c.barra[1] !== s5.tareas.length) fallos.push(`/${r}: la barra de la sesión dice ${JSON.stringify(c.barra)} tras marcar 1 de ${s5.tareas.length}`);
    const [idU, vU] = s5.tareas[s5.tareas.length - 1];
    await q.evaluate(([i, n]) => { document.querySelector(`.ruta-grupos button[data-logro="${i}"][data-nivel="${n}"]`).closest('details').open = true; }, [idU, vU]);
    await q.click(`.ruta-grupos button[data-logro="${idU}"][data-nivel="${vU}"]`);
    c = await caja(q);
    if (c.tareas.find(([i, v]) => i === idU && v === vU)?.[2] !== 'true') fallos.push(`/${r}: marcar ${idU} en la lista no lo marca en el recuadro`);
    // Completar la sesión: avanza a la siguiente y lo dice.
    for (const [i, v] of s5.tareas) if (await guardado(q, i) < v) await pulsarEnCaja(q, i, v);
    c = await caja(q);
    if (c.n !== t.sesion(6, N) || c.titulo !== ses[5].titulo || c.aviso !== t.completada(ses[5].titulo)) fallos.push(`/${r}: al completar la 5 se queda en «${c.n}» y avisa «${c.aviso}»`);
    if (!c.foco) fallos.push(`/${r}: al completar la sesión el foco no pasa al título de la siguiente`);
    // Anterior, Siguiente e Ir a la actual.
    await q.click('[data-ahora-ir="antes"]');
    c = await caja(q);
    if (c.n !== t.sesion(5, N) || c.estado !== t.hecha || !c.irActual) fallos.push(`/${r}: «Anterior» enseña «${c.n}», «${c.estado}», ir a la actual ${c.irActual}`);
    await q.click('[data-ahora-ir="despues"]');
    c = await caja(q);
    if (c.n !== t.sesion(6, N) || c.estado !== t.actual || c.irActual) fallos.push(`/${r}: «Siguiente» enseña «${c.n}», «${c.estado}», ir a la actual ${c.irActual}`);
    await q.click('[data-ahora-ir="despues"]');
    c = await caja(q);
    if (c.n !== t.sesion(7, N) || c.estado !== t.pendiente || !c.irActual) fallos.push(`/${r}: «Siguiente» otra vez enseña «${c.n}», «${c.estado}»`);
    await q.click('[data-ahora-ir="actual"]');
    c = await caja(q);
    if (c.n !== t.sesion(6, N)) fallos.push(`/${r}: «Ir a la actual» enseña «${c.n}»`);
    // Pulsar una sesión de «Toda la ruta» la enseña arriba.
    await q.click(`[data-ahora-indice] [data-ahora-ver="${conCoord}"]`);
    c = await caja(q);
    if (c.n !== t.sesion(conCoord + 1, N) || c.titulo !== ses[conCoord].titulo || !c.foco || c.marcada !== conCoord) fallos.push(`/${r}: pulsar la sesión ${conCoord + 1} en la lista enseña «${c.n}» (foco ${c.foco})`);
    if (c.copiar < 1) fallos.push(`/${r}: la sesión ${conCoord + 1} no tiene botones de copiar coordenadas`);
    await q.click('[data-ahora-ir="actual"]');
    // Desmarcar algo de una sesión anterior: lo que toca vuelve atrás y el recuadro lo sigue.
    const [i3, v3] = ses[2].tareas[0];
    await q.evaluate(([i, n]) => { document.querySelector(`.ruta-grupos button[data-logro="${i}"][data-nivel="${n}"]`).closest('details').open = true; }, [i3, v3]);
    await q.click(`.ruta-grupos button[data-logro="${i3}"][data-nivel="${v3}"]`);
    c = await caja(q);
    if (c.n !== t.sesion(3, N) || c.estado !== t.actual) fallos.push(`/${r}: al desmarcar una tarea de la 3 el recuadro enseña «${c.n}»`);
    // Con el teclado: el foco se ve.
    await q.focus('[data-ahora-ir="despues"]');
    await q.keyboard.press('Shift+Tab');
    await q.keyboard.press('Tab');
    const contorno = await q.evaluate(() => getComputedStyle(document.activeElement).outlineStyle);
    if (contorno === 'none') fallos.push(`/${r}: con el teclado no se ve el foco en los botones del recuadro`);
    await ctx2.close();

    // Toda la ruta hecha.
    const ctx3 = await navegador.newContext({ viewport: { width: 1280, height: 900 }, reducedMotion: 'reduce' });
    await sembrar(ctx3, hasta(ses, N));
    const f = await ctx3.newPage();
    f.on('pageerror', e => errores.push(e.message));
    await f.goto(BASE + r, { waitUntil: 'load' });
    c = await caja(f);
    if (c.titulo !== t.fin || c.tareas.length || !c.toca.includes(t.fin) || c.irActual) fallos.push(`/${r} con todo hecho: título «${c.titulo}», ${c.tareas.length} tareas, acceso «${c.toca}»`);
    await f.click('[data-ahora-ir="antes"]');
    c = await caja(f);
    if (c.n !== t.sesion(N, N) || c.estado !== t.hecha || c.irActual) fallos.push(`/${r} con todo hecho, «Anterior» enseña «${c.n}», «${c.estado}»`);
    await ctx3.close();

    // Móvil: sin scroll de lado y sin fallos de accesibilidad, con una sesión a medias.
    for (const [ancho, alto] of [[360, 740], [390, 844]]) {
      const m = await navegador.newContext({ viewport: { width: ancho, height: alto }, isMobile: true, hasTouch: true, reducedMotion: 'reduce', bypassCSP: true });
      await sembrar(m, { ...hasta(ses, 4), [s5.tareas[0][0]]: s5.tareas[0][1] });
      const mp = await m.newPage();
      mp.on('pageerror', e => errores.push(e.message));
      await mp.goto(BASE + r, { waitUntil: 'load' });
      const medida = await mp.evaluate(() => {
        const a = document.querySelector('[data-ahora]').getBoundingClientRect();
        const fuera = [...document.querySelectorAll('[data-ahora] *, [data-ahora-indice] *')].filter(e => { const b = e.getBoundingClientRect(); return b.width && (b.right > innerWidth + .5 || b.left < -.5); }).length;
        return { sobra: document.documentElement.scrollWidth - document.documentElement.clientWidth, derecha: a.right, fuera };
      });
      if (medida.sobra > 0 || medida.derecha > ancho || medida.fuera) fallos.push(`/${r} a ${ancho} px: sobra ${medida.sobra} px de lado, el recuadro acaba en ${Math.round(medida.derecha)}, ${medida.fuera} piezas se salen`);
      await mp.evaluate(axe);
      const v = await mp.evaluate(() => axe.run(document, { resultTypes: ['violations'] }).then(a => a.violations.map(x => `${x.id} ×${x.nodes.length} (${x.nodes[0].target.join(' ')})`)));
      if (v.length) fallos.push(`/${r} a ${ancho} px, axe: ${v.join(', ')}`);
      await m.close();
    }
    {
      const pc = await navegador.newContext({ viewport: { width: 1280, height: 900 }, reducedMotion: 'reduce', bypassCSP: true });
      await sembrar(pc, { ...hasta(ses, 4), [s5.tareas[0][0]]: s5.tareas[0][1] });
      const pp = await pc.newPage();
      await pp.goto(BASE + r, { waitUntil: 'load' });
      await pp.evaluate(axe);
      const v = await pp.evaluate(() => axe.run(document, { resultTypes: ['violations'] }).then(a => a.violations.map(x => `${x.id} ×${x.nodes.length} (${x.nodes[0].target.join(' ')})`)));
      if (v.length) fallos.push(`/${r} a 1280 px, axe: ${v.join(', ')}`);
      await pc.close();
    }
    // Sin JavaScript no hay recuadro y la ruta se lee entera.
    const sinJs = await navegador.newContext({ viewport: { width: 390, height: 844 }, javaScriptEnabled: false });
    const sp = await sinJs.newPage();
    await sp.goto(BASE + r, { waitUntil: 'load' });
    const sj = await sp.evaluate(() => ({ caja: Boolean(document.querySelector('[data-ahora-zona]')?.getClientRects().length), toca: Boolean(document.querySelector('[data-toca]')?.getClientRects().length), lista: document.querySelectorAll('[data-sesion]').length, ve: Boolean(document.querySelector('[data-sesiones]')?.getClientRects().length) }));
    if (sj.caja || sj.toca || !sj.ve || sj.lista !== N) fallos.push(`/${r} sin JavaScript: recuadro ${sj.caja}, acceso ${sj.toca}, lista a la vista ${sj.ve} con ${sj.lista} sesiones`);
    await sinJs.close();
    if (errores.length) fallos.push(`/${r}: errores en la página: ${errores.join('; ')}`);
  }
  console.log('Ruta de logros, «Ahora toca»:', fallos.length ? `${fallos.length} fallos\n  ${fallos.join('\n  ')}` : 'bien');
  return fallos.length;
};
(async () => {
  const navegador = await chromium.launch(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {});
  // La web mide su fluidez al cargar y una máquina cargada la pondría en modo ligero al azar: se deja
  // fijo el modo normal, salvo en la prueba de ese modo.
  const contextoSinFijar = navegador.newContext.bind(navegador);
  navegador.newContext = async (...a) => {
    const ctx = await sinSalir(await contextoSinFijar(...a));
    await ctx.addInitScript(() => { window.garraModoFijo = true; });
    return ctx;
  };
  if (process.env.SOLO === 'salidas') {
    const n = await frenoDeSalidas(navegador);
    await navegador.close();
    process.exit(n ? 1 : 0);
  }
  if (process.env.SOLO === 'efectos') {
    const n = await efectos(navegador);
    await navegador.close();
    process.exit(n ? 1 : 0);
  }
  if (process.env.SOLO === 'scroll') {
    const f = await scrollSinRaton(navegador);
    console.log('Scroll sin reaccionar al ratón:', f.length ? f.join('; ') : 'bien');
    await navegador.close();
    process.exit(f.length ? 1 : 0);
  }
  if (process.env.SOLO === 'ventana') {
    const n = await ventana(navegador);
    await navegador.close();
    process.exit(n ? 1 : 0);
  }
  if (process.env.SOLO === 'puesto') {
    const n = await enlacesPuesto(navegador);
    await navegador.close();
    process.exit(n ? 1 : 0);
  }
  if (process.env.SOLO === 'fotos') {
    const n = await fotosMovil(navegador);
    await navegador.close();
    process.exit(n ? 1 : 0);
  }
  if (process.env.SOLO === 'transicion') {
    const n = await transicionSaltada(navegador);
    await navegador.close();
    process.exit(n ? 1 : 0);
  }
  if (process.env.SOLO === 'ahora') {
    const n = await ahoraToca(navegador);
    await navegador.close();
    process.exit(n ? 1 : 0);
  }
  if (process.env.SOLO === 'imprimir') {
    const n = await imprimir(navegador);
    await navegador.close();
    process.exit(n ? 1 : 0);
  }
  // Páginas de cada especie: iguales por dentro, así que a la batería completa van solo, en cada idioma,
  // la de nombre más largo y la de más corto. Todas pasan por la prueba de especies, más abajo.
  const mapa = await (await fetch(BASE + 'sitemap.xml')).text();
  const ESPECIES = [...mapa.matchAll(/<loc>[^<]*?\/((?:en\/dinosaurs|dinosaurios)\/[a-z0-9-]+\/)<\/loc>/g)].map(m => m[1]);
  if (process.env.SOLO === 'cifras') {
    const n = await cifrasPortada(navegador, ESPECIES);
    await navegador.close();
    process.exit(n ? 1 : 0);
  }
  for (const guia of ['dinosaurios/', 'en/dinosaurs/']) {
    const suyas = ESPECIES.filter(r => r.startsWith(guia)).sort((a, b) => a.length - b.length);
    if (suyas.length) PAGINAS.push([suyas.at(-1), 'especie'], [suyas[0], 'especie']);
  }
  const casos = [
    ['normal tras scroll', {}],
    ['reducir movimiento', { reducedMotion: 'reduce' }],
    ['sin JavaScript', { javaScriptEnabled: false }],
  ];
  let malos = 0;
  for (const [r, tipo] of PAGINAS) {
    for (const [nombre, opts] of casos) {
      const ctx = await navegador.newContext({ viewport: { width: 1366, height: 850 }, ...opts });
      const p = await ctx.newPage();
      const errores = [];
      p.on('pageerror', e => errores.push(e.message));
      p.on('console', m => { if (m.type() === 'error') errores.push(m.text()); });
      p.on('response', x => { if (x.status() >= 400) errores.push(`${x.status()} ${x.url()}`); });
      await p.goto(BASE + r, { waitUntil: 'load' });
      if (nombre === 'normal tras scroll') {
        const alto = await p.evaluate(() => document.documentElement.scrollHeight);
        for (let y = 0; y < alto; y += 300) { await p.mouse.wheel(0, 300); await p.waitForTimeout(40); }
        await p.waitForTimeout(2500);
      } else {
        await p.waitForTimeout(800);
      }
      const res = await p.evaluate(() => {
        const ocultos = [...document.querySelectorAll('.revelar, .entra')].filter(el => parseFloat(getComputedStyle(el).opacity) < 0.99);
        const cuenta = document.querySelector('[data-cuenta]');
        return {
          ocultos: ocultos.length,
          ejemplo: ocultos.slice(0, 3).map(e => e.className),
          cuentaVisible: !!cuenta && !cuenta.hidden,
          bloques: [...document.querySelectorAll('.cuenta-falta .t')].filter(e => !e.hidden && e.querySelector('.n').textContent && e.querySelector('.u').textContent).length,
          // El sábado de 22:00 a 23:00 (Madrid) no hay cuenta atrás: dice que ya ha empezado.
          // Solo vale en esa hora; a cualquier otra, sin bloques es un fallo.
          enCurso: /^(Ya ha empezado|It has started)/.test(document.querySelector('[data-falta]')?.textContent || '')
            && new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Madrid', weekday: 'short', hour: '2-digit', hourCycle: 'h23' }).format(new Date()) === 'Sat, 22',
          compartir: !!document.querySelector('[data-compartir]:not([hidden])'),
        };
      });
      // Con JavaScript: cuenta atrás en bloques (3 o 4, según queden días) y botón de compartir
      // donde los hay. Sin él, ninguna de las dos cosas, que no funcionarían.
      const js = nombre !== 'sin JavaScript';
      const cuenta = js && CON_CUENTA.includes(tipo), compartir = js && CON_COMPARTIR.includes(tipo);
      if (cuenta !== res.cuentaVisible || compartir !== res.compartir || (cuenta && res.bloques < 3 && !res.enCurso)) malos++;
      if (res.ocultos || errores.length) malos++;
      // «Compartir» sin menú del sistema: copia la dirección canónica y lo dice.
      if (nombre === 'normal tras scroll' && res.compartir) {
        await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: BASE.slice(0, -1) });
        await p.evaluate(() => { Object.defineProperty(navigator, 'share', { value: undefined }); });
        await p.click('[data-compartir] button');
        await p.waitForTimeout(300);
        res.copiado = await p.evaluate(async () => {
          const c = document.querySelector('[data-compartir]');
          return c.querySelector('[role="status"]').textContent === c.dataset.copiado
            && await navigator.clipboard.readText() === document.querySelector('link[rel="canonical"]').href;
        });
        if (!res.copiado) malos++;
      }
      console.log(ruta(r), nombre.padEnd(20), JSON.stringify(res), 'errores:', JSON.stringify(errores));
      await ctx.close();
    }
    // Texto que se sale de la pantalla en móviles estrechos (overflow:hidden lo esconde sin avisar).
    for (const ancho of [320, 360, 412]) {
      const ctx = await navegador.newContext({ viewport: { width: ancho, height: 760 }, isMobile: true, hasTouch: true });
      const p = await ctx.newPage();
      await p.goto(BASE + r, { waitUntil: 'load' });
      await p.evaluate(() => document.fonts.ready);
      const fuera = await p.evaluate(() => {
        const W = document.documentElement.clientWidth;
        return [...document.querySelectorAll('body *')].filter(el => {
          if (el.closest('.menu, .oculto, canvas, svg, .tira-marco') || !el.childNodes.length) return false;
          const conTexto = [...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim());
          if (!conTexto) return false;
          const rc = el.getBoundingClientRect();
          return rc.width && (rc.right > W + 0.5 || rc.left < -0.5 || el.clientWidth && el.scrollWidth > el.clientWidth + 1);
        }).map(el => el.tagName + '.' + [...el.classList].join('.') + ' «' + el.textContent.trim().slice(0, 40) + '»');
      });
      if (fuera.length) malos++;
      console.log(ruta(r), `${ancho}px desbordes:`, fuera.length ? JSON.stringify(fuera.slice(0, 5)) : 'ninguno');
      // Cartel de la Cacería: en móvil, a todo el ancho y recortado (a su proporción original,
      // 2,5:1, el rótulo queda ilegible).
      const cartel = CON_CARTEL.includes(tipo) && await p.evaluate(async () => {
        const img = document.querySelector('.marco-ancho img');
        img.loading = 'eager';
        await img.decode();
        const rc = img.getBoundingClientRect();
        return { ancho: Math.round(rc.width), proporcion: +(rc.width / rc.height).toFixed(2), pantalla: document.documentElement.clientWidth };
      });
      if (cartel && (cartel.ancho < cartel.pantalla || cartel.proporcion > 1.7)) {
        malos++;
        console.log(ruta(r), `${ancho}px cartel de la Cacería pequeño:`, JSON.stringify(cartel));
      }
      await ctx.close();
    }
    // Menú en escritorio: en una fila, marcando la página en la que se está (si está en él).
    {
      const ctx = await navegador.newContext({ viewport: { width: 1366, height: 850 } });
      const p = await ctx.newPage();
      await p.goto(BASE + r, { waitUntil: 'load' });
      const m = await p.evaluate(() => {
        const enlaces = [...document.querySelectorAll('.menu a')].filter(a => a.getBoundingClientRect().width);
        return {
          visibles: enlaces.length, boton: !!document.querySelector('.menu-boton').getBoundingClientRect().width,
          marcados: enlaces.filter(a => a.getAttribute('aria-current') === 'page').map(a => a.href),
          aqui: location.href,
        };
      });
      const fallos = [];
      if (m.visibles !== EN_MENU || m.boton) fallos.push(`${m.visibles} enlaces a la vista y botón ${m.boton ? 'visible' : 'oculto'}`);
      const esperado = FUERA_MENU.includes(tipo) ? [] : [m.aqui];
      if (JSON.stringify(m.marcados) !== JSON.stringify(esperado)) fallos.push(`marca ${JSON.stringify(m.marcados)} y debe marcar ${JSON.stringify(esperado)}`);
      if (fallos.length) malos++;
      console.log(ruta(r), 'menú en escritorio:', fallos.length ? fallos.join('; ') : 'bien');
      await ctx.close();
    }
    // Cabecera: marca, enlaces del menú, idioma y botones no se pisan a ningún ancho.
    // Se mide lo que se pinta (el contenido), no la caja: con white-space:nowrap el texto puede
    // salirse de una caja que la rejilla ha encogido. Por debajo de 1020 px el menú se esconde
    // tras su botón y no cuenta.
    // bypassCSP: para medir el ancho se quita un momento, con una hoja en línea, el recorte de las
    // secciones (si no, escondería lo que se salga).
    const ctx = await navegador.newContext({ viewport: { width: 1366, height: 850 }, bypassCSP: true });
    const p = await ctx.newPage();
    await p.goto(BASE + r, { waitUntil: 'load' });
    await p.evaluate(() => document.fonts.ready);
    const anchos = [];
    for (let w = 320; w <= 1440; w += 5) anchos.push(w);
    const solapes = [], cortados = [], anchas = [], desalineados = [], escalones = [], sinIdioma = [];
    let conEscalera = 0;
    for (const ancho of [...anchos, 1920]) {
      await p.setViewportSize({ width: ancho, height: 850 });
      // Nada más ancho que la pantalla: en móvil deja arrastrar la página de lado o la aleja. Se
      // mide sin el recorte de las secciones y sin la luz de los paneles, que se sale a propósito.
      // La marca de la cabecera y los títulos de todas las secciones, en la misma vertical.
      // La escalera de rangos (en columnas desde 900 px): cada peldaño, título y línea de abajo,
      // más alto que el anterior, tenga el texto que tenga. Se mide sin las animaciones de entrada.
      const a = await p.evaluate(() => {
        const hoja = document.createElement('style');
        hoja.textContent = '.seccion { overflow-x: visible !important } .luz::before { display: none !important }';
        document.head.append(hoja);
        const sobra = document.documentElement.scrollWidth - document.documentElement.clientWidth;
        hoja.remove();
        const izq = sel => Math.round(document.querySelector(sel).getBoundingClientRect().left);
        // El aviso legal, de 1441 px en adelante, puede ir en dos columnas: basta con que el primer título vaya alineado.
        const enColumna = h => innerWidth > 1440 && h.closest('.texto-legal') && h !== document.querySelector('.texto-legal h2');
        const titulos = [...document.querySelectorAll('main .seccion h2')].filter(h => !enColumna(h)).map(h => [h.id, Math.round(h.getBoundingClientRect().left)]);
        const peldanos = [...document.querySelectorAll('.escalera > .peldano')];
        const columnas = peldanos.length > 1 && new Set(peldanos.map(el => el.offsetLeft)).size === peldanos.length;
        const escalera = columnas ? peldanos.map(el => ({ titulo: el.offsetTop + el.querySelector('.nivel-titulo').offsetTop, linea: el.offsetTop + el.offsetHeight })) : [];
        return { sobra, marca: izq('.marca'), titulos, escalera };
      });
      const torcidos = a.escalera.slice(1).filter((e, i) => e.titulo >= a.escalera[i].titulo - 8 || e.linea >= a.escalera[i].linea - 8);
      if (torcidos.length) escalones.push(`${ancho}px: ${JSON.stringify(a.escalera)}`);
      if (a.escalera.length) conEscalera++;
      if (a.sobra > 0) anchas.push(`${ancho}px: ${a.sobra} px de más`);
      const fuera = a.titulos.filter(([, x]) => Math.abs(x - a.marca) > 1).map(([id, x]) => `${id} en ${x}`);
      if (!a.titulos.length) fuera.push('ningún título de sección');
      if (fuera.length) desalineados.push(`${ancho}px: marca en ${a.marca}, ${fuera.join(', ')}`);
      if (ancho > 1440) continue;
      const m = await p.evaluate(() => {
        const W = document.documentElement.clientWidth;
        const rs = [...document.querySelectorAll('.menu a')].map(a => a.getBoundingClientRect()).filter(rc => rc.width);
        const boton = !!document.querySelector('.menu-boton').getBoundingClientRect().width;
        return { visibles: rs.length, boton, fuera: rs.filter(rc => rc.left < -0.5 || rc.right > W + 0.5).length, lineas: new Set(rs.map(rc => Math.round(rc.top))).size };
      });
      // O el menú entero en una fila, o su botón: nunca a medias ni sin forma de llegar a él.
      const bien = ancho >= 1020 ? m.visibles === EN_MENU && !m.boton && m.lineas === 1 && !m.fuera : m.visibles === 0 && m.boton;
      if (!bien) cortados.push(`${ancho}px: ${m.visibles} enlaces en ${m.lineas} líneas, ${m.fuera} fuera, botón ${m.boton ? 'sí' : 'no'}`);
      // EN/ES siempre en la barra, también en el móvil: antes había que abrir el menú para cambiar de idioma.
      if (!(await p.evaluate(() => document.querySelector('.barra-acciones .idioma').getBoundingClientRect().width > 0))) sinIdioma.push(ancho);
      const s = await p.evaluate(() => {
        const cajas = [...document.querySelectorAll('.marca, .menu a, .idioma, .barra-acciones .boton, .menu-boton')].map(el => {
          const caja = el.getBoundingClientRect(), rango = document.createRange();
          rango.selectNodeContents(el);
          // El texto para lectores de pantalla («se abre en una pestaña nueva») va en una caja de
          // 1 px recortada: se sale de ella sin verse y no cuenta.
          const oculto = el.querySelector('.oculto');
          if (oculto) rango.setEndBefore(oculto);
          const c = rango.getBoundingClientRect();
          const rc = caja.width ? { left: Math.min(caja.left, c.left), right: Math.max(caja.right, c.right), top: caja.top, bottom: caja.bottom } : caja;
          return { r: rc, nombre: el.textContent.trim().slice(0, 20) || el.className };
        }).filter(c => c.r.right - c.r.left > 0.5);
        const res = [];
        for (let i = 0; i < cajas.length; i++) for (let j = i + 1; j < cajas.length; j++) {
          const x1 = cajas[i].r, x2 = cajas[j].r;
          const x = Math.min(x1.right, x2.right) - Math.max(x1.left, x2.left), y = Math.min(x1.bottom, x2.bottom) - Math.max(x1.top, x2.top);
          if (x > 0.5 && y > 0.5) res.push(`«${cajas[i].nombre}» y «${cajas[j].nombre}» ${x.toFixed(0)} px`);
        }
        return res;
      });
      if (s.length) solapes.push(`${ancho}px: ${s[0]}`);
    }
    if (solapes.length) malos++;
    if (cortados.length) malos++;
    if (sinIdioma.length) malos++;
    if (anchas.length) malos++;
    if (desalineados.length) malos++;
    if (escalones.length) malos++;
    if (tipo === 'clan' && !conEscalera) { malos++; escalones.push('la escalera de rangos no sale en columnas en ningún ancho'); }
    console.log(ruta(r), 'página más ancha que la pantalla 320–1440px y 1920px:', anchas.length ? `${anchas.length} anchos, p. ej. ${JSON.stringify(anchas.slice(0, 3))}` : 'nunca');
    console.log(ruta(r), 'marca y títulos alineados 320–1440px y 1920px:', desalineados.length ? `fallan ${desalineados.length} anchos, p. ej. ${JSON.stringify(desalineados.slice(0, 2))}` : 'siempre');
    if (tipo === 'clan') console.log(ruta(r), `rangos en escalera (${conEscalera} anchos en columnas):`, escalones.length ? `fallan ${escalones.length}, p. ej. ${escalones[0]}` : 'siempre');
    console.log(ruta(r), 'cabecera 320–1440px solapes:', solapes.length ? `${solapes.length} anchos, p. ej. ${JSON.stringify(solapes.slice(0, 3))}` : 'ninguno');
    console.log(ruta(r), 'idioma en la barra 320–1440px:', sinIdioma.length ? `falta en ${sinIdioma.length} anchos, de ${sinIdioma[0]} a ${sinIdioma[sinIdioma.length - 1]} px` : 'siempre');
    console.log(ruta(r), 'menú 320–1440px, en fila o tras su botón:', cortados.length ? `fallan ${cortados.length} anchos, p. ej. ${JSON.stringify(cortados.slice(0, 3))}` : 'siempre');
    await ctx.close();
  }
  // Menú en el móvil, con el dedo y con el teclado: el botón lo abre a pantalla completa con todos
  // los enlaces alcanzables (también en apaisado, donde no caben: se recorre el menú), el foco
  // entra por el primer enlace y no se escapa a la página de detrás, Escape y la X lo cierran
  // devolviendo el foco al botón, se cierra solo al pasar a escritorio y cada enlace lleva a su
  // página. Se recorren las páginas de una en una desde el menú, como haría alguien.
  const abierto = p => p.evaluate(() => document.querySelector('.menu').matches(':popover-open'));
  for (const [w, h] of [[375, 667], [667, 375], [568, 320]]) {
    const ctx = await navegador.newContext({ viewport: { width: w, height: h }, isMobile: true, hasTouch: true });
    const p = await ctx.newPage();
    await p.goto(BASE, { waitUntil: 'load' });
    await p.tap('.menu-boton');
    await p.waitForTimeout(700);
    const vista = await p.evaluate(() => {
      const W = innerWidth, H = innerHeight;
      const m = document.querySelector('.menu').getBoundingClientRect();
      const fuera = [...document.querySelectorAll('.menu a, .menu-cerrar')].filter(el => {
        el.scrollIntoView({ block: 'nearest', behavior: 'instant' });
        // 1 px de margen: el desplazamiento va en píxeles enteros y el enlace puede quedar a medio píxel.
        const rc = el.getBoundingClientRect();
        return !rc.width || rc.left < -1 || rc.right > W + 1 || rc.top < -1 || rc.bottom > H + 1;
      }).map(el => el.textContent.trim() || el.className);
      return { cubre: m.left <= 0 && m.top <= 0 && m.right >= W && m.bottom >= H, fuera, rueda: getComputedStyle(document.documentElement).overflow };
    });
    const fallos = [];
    if (!(await abierto(p)) || !vista.cubre || vista.fuera.length) fallos.push(`al abrir: ${JSON.stringify(vista)}`);
    if (vista.rueda !== 'hidden') fallos.push('con el menú abierto la página de detrás se mueve');
    if (fallos.length) malos++;
    console.log(ruta(''), `menú abierto a ${w}×${h}, todo alcanzable:`, fallos.length ? fallos.join('; ') : 'sí');
    await ctx.close();
  }
  for (const lang of ['', 'en/']) {
    const ctx = await navegador.newContext({ viewport: { width: 375, height: 667 }, isMobile: true, hasTouch: true });
    const p = await ctx.newPage();
    const errores = [];
    // Qué página lo da y con qué pila: un error suelto sin sitio no dice qué arreglar.
    p.on('pageerror', e => errores.push(`${p.url()}: ${e.name}: ${e.message}${e.stack ? ` (${e.stack.split('\n').slice(0, 3).join(' / ')})` : ''}`));
    await p.goto(BASE + lang, { waitUntil: 'load' });
    const fallos = [];
    const destinos = await p.evaluate(() => [...document.querySelectorAll('.menu a:not(.menu-idioma)')].map(a => a.href));
    // Con el teclado: el foco entra en el menú y, tabulando más veces que elementos tiene, nunca
    // cae en la página tapada.
    await p.focus('.menu-boton');
    await p.keyboard.press('Enter');
    await p.waitForTimeout(500);
    const dentro = () => p.evaluate(() => {
      const a = document.activeElement;
      return a === document.body || !!a.closest('.menu') ? '' : (a.className || a.tagName) + ' «' + a.textContent.trim().slice(0, 15) + '»';
    });
    const primero = await p.evaluate(() => document.activeElement === document.querySelector('.menu a'));
    if (!primero) fallos.push(`al abrir, el foco está en ${await p.evaluate(() => document.activeElement.className || document.activeElement.tagName)}`);
    const n = await p.evaluate(() => document.querySelectorAll('.menu a, .menu button').length);
    for (let i = 0; i < n + 2; i++) {
      await p.keyboard.press('Tab');
      const fuera = await dentro();
      if (fuera) { fallos.push(`con Tab el foco sale del menú a ${fuera}`); break; }
    }
    await p.keyboard.press('Escape');
    await p.waitForTimeout(200);
    const foco = await p.evaluate(() => document.activeElement.className);
    if (await abierto(p)) fallos.push('Escape no lo cierra');
    if (foco !== 'menu-boton') fallos.push(`tras cerrar, el foco está en «${foco}»`);
    if (await p.evaluate(() => !!document.querySelector('[inert]'))) fallos.push('al cerrar queda parte de la página inerte');
    await p.evaluate(() => { const m = document.querySelector('.menu'); if (m.matches(':popover-open')) m.hidePopover(); });
    await p.tap('.menu-boton');
    await p.waitForTimeout(400);
    await p.tap('.menu-cerrar');
    await p.waitForTimeout(200);
    if (await abierto(p)) fallos.push('la X no lo cierra');
    // Abierto y se ensancha la ventana hasta escritorio: se cierra y el menú vuelve a la barra.
    await p.tap('.menu-boton');
    await p.waitForTimeout(400);
    await p.setViewportSize({ width: 1366, height: 800 });
    await p.waitForTimeout(300);
    const barra = await p.evaluate(() => [...document.querySelectorAll('.menu a')].filter(a => { const rc = a.getBoundingClientRect(); return rc.width && rc.top >= 0 && rc.bottom < 120; }).length);
    if (await abierto(p) || barra !== EN_MENU) fallos.push(`al ensanchar con el menú abierto: ${await abierto(p) ? 'sigue abierto' : 'cerrado'}, ${barra} enlaces en la barra`);
    await p.setViewportSize({ width: 375, height: 667 });
    // Si algo de lo anterior lo dejó abierto (ya contado como fallo), se cierra para seguir.
    await p.evaluate(() => { const m = document.querySelector('.menu'); if (m.matches(':popover-open')) m.hidePopover(); });
    for (const destino of destinos) {
      await p.tap('.menu-boton');
      await p.waitForTimeout(400);
      // Se espera a que cargue la página nueva, también cuando es la misma (Inicio desde la portada).
      const cargada = p.waitForEvent('load', { timeout: 5000 }).then(() => true, () => false);
      await p.tap(`.menu a[href="${await p.evaluate(d => [...document.querySelectorAll('.menu a')].find(a => a.href === d).getAttribute('href'), destino)}"]`);
      if (!(await cargada) || p.url() !== destino) fallos.push(`no llega a ${destino} (está en ${p.url()})`);
      if (await abierto(p)) fallos.push(`${destino} se abre con el menú abierto`);
    }
    if (errores.length) fallos.push(`errores: ${JSON.stringify(errores)}`);
    if (fallos.length) malos++;
    console.log(ruta(lang), `menú en el móvil (${destinos.length} páginas):`, fallos.length ? fallos.join('; ') : 'bien');
    await ctx.close();
  }
  // Enlaces viejos a secciones de la portada, con JavaScript: a su página nueva. Sin él, se queda
  // en la portada sin romperse.
  {
    const ctx = await navegador.newContext({ viewport: { width: 1366, height: 850 } });
    const p = await ctx.newPage();
    const fallos = [];
    for (const [viejo, nuevo] of MOVIDAS) {
      await p.goto(BASE + viejo, { waitUntil: 'load' });
      await p.waitForURL(BASE + nuevo, { timeout: 5000 }).catch(() => fallos.push(`${viejo} acaba en ${p.url()} y debe ir a ${nuevo}`));
    }
    await p.goto(BASE + '#quienes', { waitUntil: 'load' });
    await p.waitForTimeout(500);
    if (p.url() !== BASE + '#quienes') fallos.push(`#quienes, que sigue en la portada, se va a ${p.url()}`);
    if (fallos.length) malos++;
    console.log(ruta(''), `enlaces viejos de la portada (${MOVIDAS.length}):`, fallos.length ? fallos.join('; ') : 'bien');
    await ctx.close();
  }
  // Transición entre páginas (zarpazo): la hay al pulsar un enlace, y no con «reducir movimiento».
  // Se mira en la página que se deja (pageswap): pagereveal llega antes de que la prueba escuche.
  for (const [nombre, opts, esperada] of [['normal', {}, true], ['reducir movimiento', { reducedMotion: 'reduce' }, false]]) {
    const ctx = await navegador.newContext({ viewport: { width: 1366, height: 850 }, ...opts });
    await ctx.addInitScript(() => addEventListener('pageswap', e => { sessionStorage.setItem('transicion', String(!!e.viewTransition)); }));
    const p = await ctx.newPage();
    await p.goto(BASE, { waitUntil: 'load' });
    await p.click('.menu a[href="clan/"]');
    await p.waitForURL(BASE + 'clan/');
    await p.waitForLoadState('load');
    const hay = await p.evaluate(() => sessionStorage.getItem('transicion') === 'true');
    if (hay !== esperada) malos++;
    console.log(ruta(''), `transición entre páginas (${nombre}):`, hay === esperada ? 'bien' : `${hay ? 'la hay' : 'no la hay'} y ${esperada ? 'debe haberla' : 'no debe'}`);
    await ctx.close();
  }
  // Modo ligero: la web mira si hay aceleración gráfica y mide sus propias imágenes por segundo. Si no
  // llega, sobre todo con la ventana muy grande, apaga el ambiente. La tarjeta y la pantalla son simuladas:
  // la prueba decide si hay WebGL «sin pegas» y la marca de tiempo de cada fotograma.
  {
    const fallos = [];
    const contexto = async conTarjeta => {
      const ctx = await contextoSinFijar({ viewport: { width: 1366, height: 850 } });
      await ctx.addInitScript(tarjeta => {
        window.__dt = 16;
        let t = 0, fotograma = -1;
        const raf = window.requestAnimationFrame.bind(window);
        window.requestAnimationFrame = f => raf(real => {
          if (real !== fotograma) { fotograma = real; t += window.__dt; }
          f(t);
        });
        const original = HTMLCanvasElement.prototype.getContext;
        HTMLCanvasElement.prototype.getContext = function (tipo, opciones) {
          return tipo === 'webgl' ? (tarjeta ? { getExtension: () => null } : null) : original.call(this, tipo, opciones);
        };
      }, conTarjeta);
      return ctx;
    };
    const ctx = await contexto(true);
    const p = await ctx.newPage();
    const esLigera = () => p.evaluate(() => document.documentElement.classList.contains('ligera'));
    await p.goto(BASE, { waitUntil: 'load' });
    await p.waitForSelector('canvas.ascuas');
    await p.waitForTimeout(2500);
    if (await esLigera()) fallos.push('fluida y aun así en modo ligero');
    await p.evaluate(() => { window.__dt = 50; });
    await p.setViewportSize({ width: 1700, height: 900 });
    await p.waitForFunction(() => document.documentElement.classList.contains('ligera'), null, { timeout: 8000 })
      .catch(() => fallos.push('la ventana crece, deja de dar imágenes y no pasa a modo ligero'));
    const estado = await p.evaluate(async () => {
      const lienzo = document.querySelector('canvas.ascuas');
      const antes = lienzo.toDataURL();
      await new Promise(z => setTimeout(z, 400));
      return {
        niebla: getComputedStyle(document.querySelector('.niebla')).display,
        bruma: getComputedStyle(document.querySelector('.bruma')).display,
        lienzo: getComputedStyle(lienzo).display,
        pinta: lienzo.toDataURL() !== antes,
        cristal: getComputedStyle(document.querySelector('.barra')).backdropFilter,
        brasa: getComputedStyle(document.querySelector('.portada'), '::after').animationName,
        foto: getComputedStyle(document.querySelector('.portada-fondo')).animationName,
        marca: getComputedStyle(document.querySelector('.h1-marca')).animationName,
        baldosa: getComputedStyle(document.querySelector('.baldosa-fondo')).animationName,
      };
    });
    if (estado.niebla !== 'none' || estado.bruma !== 'none' || estado.lienzo !== 'none') fallos.push(`sigue el ambiente: ${JSON.stringify(estado)}`);
    if (estado.pinta) fallos.push('las ascuas siguen pintándose');
    if (estado.cristal !== 'none') fallos.push(`la barra sigue con cristal: ${estado.cristal}`);
    if (estado.brasa !== 'none') fallos.push(`la brasa sigue latiendo: ${estado.brasa}`);
    if (estado.baldosa !== 'none') fallos.push(`las baldosas siguen animadas con el scroll: ${estado.baldosa}`);
    if (estado.foto !== 'none' || estado.marca !== 'none') fallos.push(`la foto o el título siguen animados: ${estado.foto}, ${estado.marca}`);
    await ctx.close();
    const sinTarjeta = await contexto(false);
    const q = await sinTarjeta.newPage();
    await q.goto(BASE + 'clan/', { waitUntil: 'load' });
    await q.waitForFunction(() => document.documentElement.classList.contains('ligera'), null, { timeout: 3000 })
      .catch(() => fallos.push('sin aceleración gráfica no pasa a modo ligero'));
    if (await q.locator('canvas.ascuas').count()) fallos.push('sin aceleración gráfica crea ascuas');
    if (await q.evaluate(() => document.documentElement.classList.contains('anim'))) fallos.push('sin aceleración gráfica hay animaciones de entrada');
    await sinTarjeta.close();
    // Lo caro no se pinta ni un instante: la página ya llega ligera, antes de que corra ningún script.
    const sinScripts = await navegador.newContext({ viewport: { width: 1366, height: 850 }, javaScriptEnabled: false });
    const s = await sinScripts.newPage();
    await s.goto(BASE, { waitUntil: 'load' });
    if (await s.locator('.niebla').isVisible()) fallos.push('la página llega con la niebla encendida');
    await sinScripts.close();
    // Al cambiar de página, en modo ligero se salta el zarpazo (es a pantalla completa); con ambiente, no.
    for (const [conTarjeta, esperada] of [[true, false], [false, true]]) {
      const c = await contexto(conTarjeta);
      await c.addInitScript(() => {
        const saltar = ViewTransition.prototype.skipTransition;
        ViewTransition.prototype.skipTransition = function () { sessionStorage.setItem('saltada', 'true'); return saltar.call(this); };
      });
      const r = await c.newPage();
      await r.goto(BASE + 'clan/', { waitUntil: 'load' });
      await r.waitForTimeout(800);
      await r.click('.barra .marca');
      await r.waitForURL(BASE);
      await r.waitForLoadState('load');
      const saltada = await r.evaluate(() => sessionStorage.getItem('saltada') === 'true');
      if (saltada !== esperada) fallos.push(`${conTarjeta ? 'con' : 'sin'} aceleración, se salta el zarpazo: ${saltada}`);
      await c.close();
    }
    if (fallos.length) malos++;
    console.log('modo ligero:', fallos.length ? fallos.join('; ') : 'se enciende sin aceleración y al dejar de dar imágenes, y apaga el ambiente');
  }
  // Reposo: con otra ventana delante, tras 20 s sin actividad o con el menú o el visor encima, el
  // ambiente se para (las ascuas dejan de pintarse y las animaciones de ambiente quedan en pausa) y
  // vuelve al mover el ratón o al cerrarlos.
  {
    const ctx = await navegador.newContext({ viewport: { width: 1366, height: 850 } });
    const p = await ctx.newPage();
    await p.goto(BASE, { waitUntil: 'load' });
    await p.waitForSelector('canvas.ascuas');
    await p.waitForTimeout(500);
    const estado = () => p.evaluate(async () => {
      const lienzo = document.querySelector('.portada canvas.ascuas');
      const foto = () => { const d = lienzo.getContext('2d').getImageData(0, 0, lienzo.width, lienzo.height).data; let h = 0; for (let i = 0; i < d.length; i += 97) h = (h * 31 + d[i]) | 0; return h; };
      const antes = foto();
      await new Promise(r => setTimeout(r, 400));
      return {
        reposo: document.documentElement.classList.contains('reposo'),
        ascuas: foto() !== antes,
        pulso: getComputedStyle(document.querySelector('.portada'), '::after').animationPlayState,
        niebla: getComputedStyle(document.querySelector('.niebla'), '::before').animationPlayState,
        acercar: getComputedStyle(document.querySelector('.portada-fondo')).animationPlayState,
      };
    });
    const fallos = [];
    const esperar = (cuando, e, quieto) => {
      // El pulso de la garra son varias animaciones: todas a la vez.
      if (e.reposo !== quieto || e.ascuas === quieto || e.pulso.split(', ').some(s => s !== (quieto ? 'paused' : 'running')) || e.niebla !== (quieto ? 'paused' : 'running') || e.acercar.split(', ').some(s => s !== (quieto ? 'paused' : 'running'))) fallos.push(`${cuando}: ${JSON.stringify(e)}`);
    };
    esperar('al cargar', await estado(), false);
    await p.evaluate(() => dispatchEvent(new Event('blur')));
    esperar('con otra ventana delante', await estado(), true);
    await p.mouse.move(300, 300);
    await p.mouse.move(320, 310);
    esperar('al volver con el ratón', await estado(), false);
    await ctx.close();
    // Los 20 s, con el reloj de la página adelantado.
    const ctx2 = await navegador.newContext({ viewport: { width: 1366, height: 850 } });
    const p2 = await ctx2.newPage();
    await p2.clock.install();
    await p2.goto(BASE, { waitUntil: 'load' });
    const enReposo = () => p2.evaluate(() => document.documentElement.classList.contains('reposo'));
    await p2.clock.runFor(19000);
    if (await enReposo()) fallos.push('en reposo antes de 20 s');
    await p2.clock.runFor(2000);
    if (!await enReposo()) fallos.push('sin reposo tras 21 s quieta');
    await p2.mouse.move(200, 200);
    if (await enReposo()) fallos.push('sigue en reposo tras mover el ratón');
    await ctx2.close();
    // Con el menú del móvil o el visor de la galería tapando la página, el ambiente de detrás se
    // para (el cristal no tiene que desenfocarlo en cada fotograma) y vuelve al cerrarlos.
    const ctx3 = await navegador.newContext({ viewport: { width: 375, height: 667 }, isMobile: true, hasTouch: true });
    const p3 = await ctx3.newPage();
    const quieta = () => p3.evaluate(() => document.documentElement.classList.contains('reposo'));
    await p3.goto(BASE, { waitUntil: 'load' });
    await p3.tap('.menu-boton');
    await p3.waitForTimeout(300);
    if (!await quieta()) fallos.push('el ambiente sigue con el menú abierto');
    await p3.tap('.menu-cerrar');
    await p3.waitForTimeout(300);
    if (await quieta()) fallos.push('el ambiente no vuelve al cerrar el menú');
    await p3.goto(BASE + 'galeria/', { waitUntil: 'load' });
    await p3.evaluate(() => document.querySelector('.galeria').scrollIntoView({ behavior: 'instant' }));
    await p3.waitForTimeout(400);
    await p3.tap('.foto-ampliar >> nth=0');
    await p3.waitForTimeout(300);
    if (!await quieta()) fallos.push('el ambiente sigue con el visor abierto');
    await p3.tap('.visor-cerrar');
    await p3.waitForTimeout(300);
    if (await quieta()) fallos.push('el ambiente no vuelve al cerrar el visor');
    await ctx3.close();
    if (fallos.length) malos++;
    console.log(ruta(''), 'ambiente en reposo:', fallos.length ? fallos.join('; ') : 'se para y vuelve');
  }
  // Volver arriba flotante: no sale al bajar leyendo, sí al subir en una página larga; lleva arriba
  // y se aparta con el pie a la vista.
  {
    const ctx = await navegador.newContext({ viewport: { width: 1366, height: 850 } });
    const p = await ctx.newPage();
    await p.goto(BASE + 'dinosaurios/', { waitUntil: 'load' });
    await p.mouse.move(600, 400);
    const visto = () => p.evaluate(() => { const b = document.querySelector('.subir'); return !!b && getComputedStyle(b).visibility === 'visible'; });
    const rueda = async dy => { await p.mouse.wheel(0, dy); await p.waitForTimeout(700); };
    const fallos = [];
    if (!await p.locator('.subir').count()) fallos.push('no hay botón');
    else {
      await rueda(3000);
      if (await visto()) fallos.push('se ve al bajar');
      await rueda(-300);
      if (!await visto()) fallos.push('no se ve al subir');
      await rueda(300);
      if (await visto()) fallos.push('no se aparta al volver a bajar');
      await rueda(-300);
      await p.click('.subir', { timeout: 3000 }).catch(() => fallos.push('no se puede pulsar'));
      await p.waitForFunction(() => scrollY < 10, null, { timeout: 5000 }).catch(() => fallos.push('no lleva arriba del todo'));
      await p.waitForTimeout(500);
      if (await visto()) fallos.push('sigue a la vista arriba del todo');
      await p.evaluate(() => scrollTo({ top: document.documentElement.scrollHeight, behavior: 'instant' }));
      await p.waitForTimeout(400);
      await rueda(-120);
      if (await visto()) fallos.push('tapa el pie');
    }
    await ctx.close();
    if (fallos.length) malos++;
    console.log(ruta('dinosaurios/'), 'volver arriba flotante:', fallos.length ? fallos.join('; ') : 'bien');
  }
  // Volver con «Atrás» a una página que se dejó con el menú abierto (la recupera de la memoria,
  // tal cual): el menú debe estar cerrado. Playwright apaga esa memoria por defecto; aquí no. Hace
  // falta el Chromium completo: el reducido para modo sin ventana (el de por defecto) no la tiene.
  {
    const conMemoria = await chromium.launch({ ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : { channel: 'chromium' }), ignoreDefaultArgs: ['--disable-back-forward-cache'] });
    const ctx = await sinSalir(await conMemoria.newContext({ viewport: { width: 375, height: 667 }, isMobile: true, hasTouch: true }));
    await ctx.addInitScript(() => addEventListener('pageshow', e => { window.__memoria = e.persisted; }));
    const p = await ctx.newPage();
    await p.goto(BASE, { waitUntil: 'load' });
    await p.tap('.menu-boton');
    await p.waitForTimeout(400);
    await p.tap('.menu a[href="clan/"]');
    await p.waitForURL(BASE + 'clan/');
    await p.waitForLoadState('load');
    // De memoria no hay evento «load»: basta con que vuelva.
    await p.goBack({ waitUntil: 'commit' });
    await p.waitForTimeout(400);
    const r = await p.evaluate(() => ({ memoria: window.__memoria, abierto: document.querySelector('.menu').matches(':popover-open'), inerte: !!document.querySelector('[inert]') }));
    // Si este Chromium no guarda la página, la prueba no dice nada: se avisa en vez de dar verde.
    if (!r.memoria || r.abierto || r.inerte) malos++;
    console.log(ruta(''), 'menú al volver atrás:', !r.memoria ? 'el navegador no recuperó la página de memoria: no se pudo probar' : r.abierto || r.inerte ? `sigue abierto o inerte ${JSON.stringify(r)}` : 'cerrado');
    await conMemoria.close();
  }
  const hastaQue = (p, cond, arg) => p.waitForFunction(cond, arg, { timeout: 8000 }).then(() => true, () => false);
  const fotoLista = () => { const v = document.querySelector('.visor'); const i = v && v.querySelector('.visor-img'); return !!i && v.open && i.complete && i.naturalWidth > 0 && !v.classList.contains('cargando'); };
  // Cada foto tiene su dirección: abrirla entra directo a esa foto, con su texto a la vista debajo; al
  // cambiar de foto cambia la dirección y es la que se copia; «Atrás» cierra el visor sin salir de la
  // galería, y cerrar deja la dirección limpia. Sin JavaScript, la dirección lleva a la foto.
  async function pruebaVisorEnlaces(r) {
    const fallos = [];
    const ctx = await navegador.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: BASE }).catch(() => {});
    const p = await ctx.newPage();
    await p.addInitScript(() => { delete Navigator.prototype.share; });
    await p.goto(`${BASE}${r}#foto-colina`, { waitUntil: 'load' });
    const leer = () => p.evaluate(() => {
      const v = document.querySelector('.visor'), z = v.querySelector('.visor-img').getBoundingClientRect(), i = v.querySelector('.visor-img');
      const pie = v.querySelector('.visor-pie'), ant = v.querySelector('.visor-ant').getBoundingClientRect();
      if (!pie) return { abierto: v.open, cuenta: v.querySelector('.visor-cuenta').textContent, hash: location.hash, sinPie: true };
      const caja = pie.getBoundingClientRect();
      const alto = z.width * i.naturalHeight / i.naturalWidth, fondoFoto = z.top + (z.height + Math.min(alto, z.height)) / 2;
      return { abierto: v.open, cuenta: v.querySelector('.visor-cuenta').textContent, pie: pie.textContent, hash: location.hash,
        separacion: caja.top - fondoFoto, pisaBotones: caja.bottom > ant.top && ant.top > fondoFoto, dentro: caja.top >= 0 && caja.bottom <= innerHeight };
    });
    if (!(await hastaQue(p, fotoLista))) fallos.push('el enlace a una foto no abre el visor');
    let e = await leer();
    const orden = await p.evaluate(() => { const f = [...document.querySelectorAll('.foto')]; return f.findIndex(x => x.id === 'foto-colina'); });
    const alt = await p.evaluate(() => document.querySelector('#foto-colina img')?.alt);
    if (!e.abierto || !e.cuenta.startsWith(`${orden + 1} /`)) fallos.push(`enlace directo: ${JSON.stringify(e)}, y es la ${orden + 1}`);
    if (e.pie !== alt) fallos.push(`pie «${e.pie}» y la foto dice «${alt}»`);
    if (e.separacion < 0 || e.separacion > 40 || e.pisaBotones || !e.dentro) fallos.push(`pie mal colocado: ${JSON.stringify(e)}`);
    // El pie se lee, pero no estorba: lo que se pulsa o se desliza encima llega al visor. Y el lector de
    // pantalla lo lee al abrir, y el aviso de «copiado» está en su sitio antes de hacer falta.
    const estorbo = await p.evaluate(() => {
      const v = document.querySelector('.visor'), c = v.querySelector('.visor-pie').getBoundingClientRect();
      return { alto: c.height, debajo: document.elementFromPoint(c.left + c.width / 2, c.top + c.height / 2)?.closest('.visor-pie') ? 'el pie' : 'el visor', describe: document.getElementById(v.getAttribute('aria-describedby'))?.className, aviso: getComputedStyle(v.querySelector('.visor-aviso')).display };
    });
    if (estorbo.alto > 120 || estorbo.debajo !== 'el visor') fallos.push(`el pie estorba: ${JSON.stringify(estorbo)}`);
    if (estorbo.describe !== 'visor-pie' || estorbo.aviso === 'none') fallos.push(`lector de pantalla: ${JSON.stringify(estorbo)}`);
    if (fallos.length) {
      malos++;
      console.log(ruta(r), 'enlace a cada foto, pie y «Atrás» en el visor:', fallos.join('; '));
      await ctx.close();
      return;
    }
    await p.tap('.visor-sig');
    await hastaQue(p, fotoLista);
    e = await leer();
    if (e.hash === '#foto-colina' || !e.hash.startsWith('#foto-')) fallos.push(`al cambiar de foto la dirección es «${e.hash}»`);
    await p.tap('.visor-pasar');
    const copiado = await hastaQue(p, () => document.querySelector('.visor-aviso').textContent !== '');
    const enlace = await p.evaluate(() => navigator.clipboard.readText()).catch(() => '');
    if (!copiado || !enlace.endsWith(e.hash)) fallos.push(`compartir copia «${enlace}» y la foto es ${e.hash}`);
    // Entró por enlace directo: cerrar deja la dirección limpia y se queda en la galería.
    await p.tap('.visor-cerrar');
    await p.waitForTimeout(300);
    e = await leer();
    if (e.abierto || e.hash) fallos.push(`al cerrar: ${JSON.stringify(e)}`);
    // Entró pulsando: «Atrás» cierra el visor y no sale de la galería.
    await p.evaluate(() => document.querySelector('.galeria').scrollIntoView({ behavior: 'instant' }));
    await p.waitForTimeout(400);
    await p.tap('.foto-ampliar >> nth=1');
    await hastaQue(p, fotoLista);
    e = await leer();
    if (!e.hash.startsWith('#foto-')) fallos.push(`al abrir, la dirección es «${e.hash}»`);
    // En todas las fotos, sean como sean de altas, el pie queda debajo y no encima.
    const total = await p.locator('.foto-ampliar').count();
    for (let i = 0; i < total; i++) {
      await p.tap('.visor-sig');
      await hastaQue(p, fotoLista);
      const paso = await leer();
      if (paso.separacion < 0 || paso.pisaBotones || !paso.dentro) fallos.push(`pie mal colocado en ${paso.cuenta}: ${JSON.stringify(paso)}`);
    }
    await p.goBack();
    await p.waitForTimeout(400);
    e = await leer();
    if (e.abierto || e.hash || !p.url().startsWith(BASE + r)) fallos.push(`«Atrás» con el visor abierto: ${JSON.stringify(e)} en ${p.url()}`);
    const restaurar = () => p.evaluate(() => history.scrollRestoration);
    if (await restaurar() !== 'auto') fallos.push('al cerrar, la página sigue sin recuperar su sitio al navegar');
    // «Adelante» la vuelve a abrir; recargar la deja abierta; cerrar con la X vuelve atrás una sola vez.
    await p.goForward();
    await hastaQue(p, fotoLista);
    e = await leer();
    if (!e.abierto || !e.hash.startsWith('#foto-')) fallos.push(`«Adelante»: ${JSON.stringify(e)}`);
    const conVisor = e.hash;
    await p.reload({ waitUntil: 'load' });
    await hastaQue(p, fotoLista);
    e = await leer();
    if (!e.abierto || e.hash !== conVisor) fallos.push(`recargar con el visor abierto: ${JSON.stringify(e)}, y era ${conVisor}`);
    await p.tap('.visor-cerrar');
    await p.waitForTimeout(400);
    e = await leer();
    if (e.abierto || e.hash || !p.url().startsWith(BASE + r)) fallos.push(`cerrar tras recargar: ${JSON.stringify(e)} en ${p.url()}`);
    // Cerrar con la X deshace la entrada del historial, igual que «Atrás»: no deja un paso de más.
    await p.evaluate(() => document.querySelector('.galeria').scrollIntoView({ behavior: 'instant' }));
    await p.waitForTimeout(300);
    await p.tap('.foto-ampliar >> nth=2');
    await hastaQue(p, fotoLista);
    await p.tap('.visor-cerrar');
    await p.waitForTimeout(400);
    await p.goForward();
    await p.waitForTimeout(400);
    e = await leer();
    if (!e.abierto) fallos.push('cerrar con la X deja un paso de más en el historial');
    await ctx.close();
    const sinJs = await navegador.newContext({ viewport: { width: 390, height: 844 }, javaScriptEnabled: false });
    const q = await sinJs.newPage();
    await q.goto(`${BASE}${r}#foto-colina`, { waitUntil: 'load' });
    await q.waitForTimeout(1500);
    const caja = await q.locator('#foto-colina').boundingBox();
    if (!caja || caja.y < 0 || caja.y > 844) fallos.push(`sin JavaScript, el enlace no lleva a la foto: ${JSON.stringify(caja)}`);
    await sinJs.close();
    if (fallos.length) malos++;
    console.log(ruta(r), 'enlace a cada foto, pie y «Atrás» en el visor:', fallos.length ? fallos.join('; ') : 'bien');
  }
  // Gestos del móvil: con el dedo la foto cambia de lado y se cierra hacia abajo; con dos dedos se amplía
  // la foto y no la página (los botones siguen igual), pide una versión más grande y se puede reducir.
  async function pruebaVisorGestos(r) {
    const fallos = [];
    const ctx = await navegador.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    const p = await ctx.newPage();
    await p.goto(BASE + r, { waitUntil: 'load' });
    await p.evaluate(() => document.querySelector('.galeria').scrollIntoView({ behavior: 'instant' }));
    await p.waitForTimeout(500);
    await p.tap('.foto-ampliar >> nth=0');
    await hastaQue(p, fotoLista);
    const cdp = await ctx.newCDPSession(p);
    const toque = (type, puntos) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: puntos.map(([x, y], id) => ({ x, y, id })) });
    const trazo = async (desde, hasta, pasos = 8) => {
      await toque('touchStart', desde);
      for (let i = 1; i <= pasos; i++) {
        await toque('touchMove', desde.map(([x, y], d) => [x + (hasta[d][0] - x) * i / pasos, y + (hasta[d][1] - y) * i / pasos]));
        await p.waitForTimeout(16);
      }
      await toque('touchEnd', []);
      await p.waitForTimeout(350);
    };
    const leer = () => p.evaluate(() => {
      const v = document.querySelector('.visor'), i = v.querySelector('.visor-img');
      return { abierto: v.open, real: v.classList.contains('real'), cuenta: v.querySelector('.visor-cuenta').textContent, ancho: i.getBoundingClientRect().width,
        escala: visualViewport.scale, boton: v.querySelector('.visor-cerrar').getBoundingClientRect().width, resto: i.style.transform, fuente: i.currentSrc, marcoX: v.querySelector('.visor-marco').scrollLeft };
    });
    // La foto entra creciendo un poco: se mide ya en su tamaño.
    await p.evaluate(() => Promise.all(document.querySelector('.visor-img').getAnimations().map(a => a.finished)));
    const e0 = await leer();
    await trazo([[300, 420]], [[90, 420]]);
    await hastaQue(p, fotoLista);
    const e1 = await leer();
    if (!e1.cuenta.startsWith('2 /')) fallos.push(`deslizar a un lado no cambia de foto: ${e1.cuenta}`);
    await trazo([[140, 420], [250, 420]], [[40, 420], [350, 420]]);
    await p.waitForTimeout(300);
    const e2 = await leer();
    if (!e2.real || e2.ancho < e0.ancho * 2 || e2.resto) fallos.push(`pellizcar no amplía la foto: ${JSON.stringify(e2)}`);
    if (e2.escala !== 1 || e2.boton !== e0.boton) fallos.push(`pellizcar amplía la página entera: ${JSON.stringify(e2)}`);
    if (!e2.fuente.includes('-3080.') && !e2.fuente.includes('-2400.')) fallos.push(`ampliada con pellizco y sin la foto grande: ${e2.fuente}`);
    await trazo([[40, 420], [350, 420]], [[185, 420], [205, 420]]);
    const e3 = await leer();
    if (e3.real || e3.ancho !== e0.ancho) fallos.push(`pellizcar hacia dentro no vuelve a ajustar: ${JSON.stringify(e3)}`);
    await trazo([[200, 300]], [[200, 560]]);
    const e4 = await leer();
    if (e4.abierto) fallos.push('deslizar hacia abajo no cierra');
    await ctx.close();
    const otraVez = async lenta => {
      const c = await navegador.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
      const q = await c.newPage();
      if (lenta) await q.route('**/*-ampliada-*', ruta => setTimeout(() => ruta.continue().catch(() => {}), 2500));
      await q.goto(BASE + r, { waitUntil: 'load' });
      await q.evaluate(() => document.querySelector('.galeria').scrollIntoView({ behavior: 'instant' }));
      await q.waitForTimeout(500);
      await q.tap('.foto-ampliar >> nth=0');
      await (lenta ? q.waitForTimeout(200) : hastaQue(q, fotoLista));
      const sesion = await c.newCDPSession(q);
      return { c, q, dedo: (type, puntos) => sesion.send('Input.dispatchTouchEvent', { type, touchPoints: puntos.map(([x, y, id]) => ({ x, y, id })) }) };
    };
    // Deslizar desde el pie cambia de foto, y un toque en el vacío bajo la foto cierra (cada uno en su visor:
    // el emulador se traga el primer toque que sigue a un deslizamiento rápido).
    {
      const { c, q, dedo } = await otraVez(false);
      const estado = () => q.evaluate(() => { const v = document.querySelector('.visor'), p = v.querySelector('.visor-pie').getBoundingClientRect(); return { abierto: v.open, cuenta: v.querySelector('.visor-cuenta').textContent, y: p.top + p.height / 2 }; });
      const { y } = await estado();
      await dedo('touchStart', [[300, y, 0]]);
      for (let i = 1; i <= 8; i++) {
        await dedo('touchMove', [[300 - i * 26, y, 0]]);
        await q.waitForTimeout(16);
      }
      await dedo('touchEnd', []);
      await q.waitForTimeout(350);
      await hastaQue(q, fotoLista);
      const deslizado = await estado();
      if (!deslizado.cuenta.startsWith('2 /')) fallos.push(`deslizar desde el pie no cambia de foto: ${JSON.stringify(deslizado)}`);
      await c.close();
    }
    {
      const { c, q } = await otraVez(false);
      const vacio = await q.evaluate(() => { const v = document.querySelector('.visor'), c = v.querySelector('.visor-pie').getBoundingClientRect(); return c.bottom + 20; });
      await q.touchscreen.tap(195, Math.min(vacio, 740));
      await q.waitForTimeout(400);
      if (await q.evaluate(() => document.querySelector('.visor').open)) fallos.push(`tocar el vacío bajo el pie, en ${vacio}, no cierra`);
      await c.close();
    }
    // Dos dedos con la foto aún cargando no son un deslizamiento, sea cual sea el dedo que se levanta antes.
    const { c: lenta, q, dedo } = await otraVez(true);
    await dedo('touchStart', [[150, 420, 0]]);
    await dedo('touchStart', [[150, 420, 0], [240, 420, 1]]);
    for (let i = 1; i <= 8; i++) {
      await dedo('touchMove', [[150 - i * 12, 420, 0], [240 + i * 12, 420, 1]]);
      await q.waitForTimeout(16);
    }
    await dedo('touchEnd', [[336, 420, 1]]);
    await q.waitForTimeout(30);
    await dedo('touchEnd', []);
    await q.waitForTimeout(350);
    const conPinza = await q.evaluate(() => { const v = document.querySelector('.visor'); return { abierto: v.open, cargando: v.classList.contains('cargando'), cuenta: v.querySelector('.visor-cuenta').textContent }; });
    if (!conPinza.cargando) fallos.push('la prueba de dos dedos llega tarde: la foto ya ha cargado');
    if (!conPinza.abierto || !conPinza.cuenta.startsWith('1 /')) fallos.push(`dos dedos con la foto cargando: ${JSON.stringify(conPinza)}`);
    await lenta.close();
    if (fallos.length) malos++;
    console.log(ruta(r), 'gestos del visor (deslizar y pellizcar):', fallos.length ? fallos.join('; ') : 'bien');
  }
  // Con el ratón, la foto ampliada se arrastra, también si se suelta encima de un botón, y al soltar deja de moverse.
  async function pruebaVisorRaton(r) {
    const fallos = [];
    const ctx = await navegador.newContext({ viewport: { width: 1366, height: 800 } });
    const p = await ctx.newPage();
    await p.goto(BASE + r, { waitUntil: 'load' });
    await p.evaluate(() => document.querySelector('.galeria').scrollIntoView({ behavior: 'instant' }));
    await p.waitForTimeout(400);
    await p.click('.foto-ampliar >> nth=0');
    await hastaQue(p, fotoLista);
    await p.mouse.click(683, 400);
    await p.waitForTimeout(300);
    const leer = () => p.evaluate(() => { const v = document.querySelector('.visor'), m = v.querySelector('.visor-marco'); return { abierto: v.open, real: v.classList.contains('real'), x: m.scrollLeft, y: m.scrollTop, arrastrando: m.classList.contains('arrastrando') }; });
    const e0 = await leer();
    if (!e0.real) fallos.push('pulsar no amplía');
    await p.mouse.move(800, 400);
    await p.mouse.down();
    await p.mouse.move(500, 400, { steps: 8 });
    await p.mouse.up();
    const e1 = await leer();
    if (Math.abs(e1.x - e0.x - 300) > 2 || !e1.real) fallos.push(`arrastrar 300 px mueve ${e1.x - e0.x} px: ${JSON.stringify(e1)}`);
    await p.mouse.move(800, 400);
    await p.mouse.down();
    const cerrar = await p.locator('.visor-cerrar').boundingBox();
    await p.mouse.move(cerrar.x + 10, cerrar.y + 10, { steps: 8 });
    await p.mouse.up();
    const e2 = await leer();
    await p.mouse.move(400, 500, { steps: 4 });
    const e3 = await leer();
    if (!e2.abierto || e3.x !== e2.x || e3.y !== e2.y || e3.arrastrando) fallos.push(`soltar sobre un botón: ${JSON.stringify([e2, e3])}`);
    await p.mouse.click(683, 400);
    await p.waitForTimeout(200);
    if ((await leer()).real) fallos.push('tras arrastrar, pulsar no vuelve a ajustar la foto');
    if (fallos.length) malos++;
    console.log(ruta(r), 'arrastrar con el ratón en el visor:', fallos.length ? fallos.join('; ') : 'bien');
    await ctx.close();
  }
  // Las fotos a lo ancho son fotos enteras: en la cuadrícula no se les recorta más de un 1,5 % por los
  // lados ni, salvo la de los cuernos (que se ancla arriba para no cortárselos), por arriba y por abajo.
  async function pruebaRecortes(r) {
    const fallos = [];
    const ctx = await navegador.newContext({ viewport: { width: 1366, height: 850 } });
    const p = await ctx.newPage();
    await p.goto(BASE + r, { waitUntil: 'load' });
    for (const w of [390, 700, 1366, 1920]) {
      await p.setViewportSize({ width: w, height: 850 });
      await p.waitForTimeout(100);
      const pierden = await p.evaluate(() => [...document.querySelectorAll('.foto-ancha img, .foto-panoramica img, .foto-grande img')].map(i => {
        const c = i.getBoundingClientRect(), caja = c.width / c.height, foto = +i.getAttribute('width') / +i.getAttribute('height');
        return { foto: i.closest('.foto').id, pierde: 100 * (1 - Math.min(caja / foto, foto / caja)), arriba: parseFloat(getComputedStyle(i).objectPosition.split(' ')[1]) };
      }));
      for (const f of pierden) {
        if (f.foto === 'foto-cuernos' ? f.arriba !== 0 : f.pierde > 1.5) fallos.push(`${w}px: ${f.foto} pierde ${f.pierde.toFixed(1)} %`);
      }
    }
    if (fallos.length) malos++;
    console.log(ruta(r), 'fotos a lo ancho sin recortar:', fallos.length ? fallos.join('; ') : 'bien');
    await ctx.close();
  }
  // Visor de la galería, con ratón y con el dedo: abre, cambia de foto, amplía y vuelve, cierra
  // devolviendo el foco a la foto. Las grandes no se descargan hasta abrir el visor.
  for (const [r] of PAGINAS.filter(([, tipo]) => CON_GALERIA.includes(tipo))) {
    for (const [tipo, opts] of [['ratón', { viewport: { width: 1366, height: 850 } }],
      ['dedo', { viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true }]]) {
      const ctx = await navegador.newContext(opts);
      const p = await ctx.newPage();
      const grandes = [];
      p.on('request', x => { if (x.url().includes('-ampliada-')) grandes.push(x.url()); });
      await p.goto(BASE + r, { waitUntil: 'load' });
      // Sin desplazamiento suave: en una máquina lenta la página seguía moviéndose y el toque caía
      // entre dos fotos.
      await p.evaluate(async () => {
        document.querySelector('.galeria').scrollIntoView({ behavior: 'instant' });
        for (let y = -1; y !== scrollY;) { y = scrollY; await new Promise(z => setTimeout(z, 200)); }
      });
      await p.waitForTimeout(600);
      const fallos = [];
      if (grandes.length) fallos.push(`descarga ${grandes.length} grandes sin abrir el visor`);
      const estado = () => p.evaluate(() => {
        const v = document.querySelector('.visor'), m = v && v.querySelector('.visor-marco'), i = v && v.querySelector('.visor-img');
        return v && { abierto: v.open, real: v.classList.contains('real'), cuenta: v.querySelector('.visor-cuenta').textContent,
          cargada: i.complete && i.naturalWidth > 0 && !v.classList.contains('cargando'), fuente: i.currentSrc.split('/').pop(),
          recorre: m.scrollWidth > m.clientWidth + 10, foco: document.activeElement.className };
      });
      let motivo = '';
      const esperar = cond => p.waitForFunction(cond, null, { timeout: 8000 }).then(() => true, err => { motivo = err.message.split('\n')[0]; return false; });
      // Funciones, no texto: un texto se evalúa dentro de la página y la CSP de la web (sin
      // 'unsafe-eval') lo bloquea a veces.
      const cargada = () => { const v = document.querySelector('.visor'); const i = v && v.querySelector('.visor-img'); return !!i && i.complete && i.naturalWidth > 0 && !v.classList.contains('cargando'); };
      const pulsar = sel => tipo === 'dedo' ? p.tap(sel) : p.click(sel);
      const total = await p.locator('.foto-ampliar').count();
      if (total < 2) fallos.push(`la galería tiene ${total} fotos`);
      await pulsar('.foto-ampliar >> nth=0');
      const cargo = await esperar(cargada);
      let e = await estado();
      if (!cargo) fallos.push(`la primera foto no carga (${motivo}): ${JSON.stringify(e)}`);
      if (!e || !e.abierto || e.cuenta !== `1 / ${total}` || !e.fuente.includes('-ampliada-')) fallos.push(`al abrir: ${JSON.stringify(e)}`);
      if (tipo === 'ratón') await p.keyboard.press('ArrowRight'); else await pulsar('.visor-sig');
      await esperar(cargada);
      e = await estado();
      if (e.cuenta !== `2 / ${total}` || !e.fuente.includes('roca-ampliada')) fallos.push(`siguiente: ${JSON.stringify(e)}`);
      const caja = await p.locator('.visor-img').boundingBox();
      const centro = [caja.x + caja.width / 2, caja.y + caja.height / 2];
      if (tipo === 'dedo') await p.touchscreen.tap(...centro); else await p.mouse.click(...centro);
      await p.waitForTimeout(400);
      e = await estado();
      if (!e.real || !e.recorre) fallos.push(`ampliar: ${JSON.stringify(e)}`);
      if (tipo === 'ratón') {
        if (!(await esperar(() => document.querySelector('.visor-img').currentSrc.includes('-3080.')))) fallos.push('ampliada sin la resolución original');
        await p.keyboard.press('Escape');
        e = await estado();
        if (e.real || !e.abierto) fallos.push(`Escape con la foto ampliada: ${JSON.stringify(e)}`);
        await p.keyboard.press('Escape');
      } else {
        await p.touchscreen.tap(...centro);
        await p.waitForTimeout(300);
        e = await estado();
        if (e.real) fallos.push('volver a ajustar no funciona');
        await pulsar('.visor-cerrar');
      }
      await p.waitForTimeout(300);
      e = await estado();
      const foco = await p.evaluate(() => document.activeElement === document.querySelectorAll('.foto-ampliar')[1]);
      if (e.abierto || !foco) fallos.push(`al cerrar: ${JSON.stringify(e)}, foco en la foto: ${foco}`);
      if (fallos.length) malos++;
      console.log(ruta(r), `visor de la galería (${tipo}):`, fallos.length ? fallos.join('; ') : 'bien');
      await ctx.close();
    }
    await pruebaVisorEnlaces(r);
    await pruebaVisorGestos(r);
    await pruebaVisorRaton(r);
    await pruebaRecortes(r);
  }
  // Con conexión lenta las fuentes llegan después del primer pintado: el texto no debe empujar
  // la página al cambiar de la fuente de reserva a la buena.
  for (const [r] of PAGINAS) {
    const saltos = [];
    for (const ancho of [320, 375, 412, 768, 1100, 1440]) {
      const ctx = await navegador.newContext({ viewport: { width: ancho, height: 800 } });
      await ctx.addInitScript(() => {
        window.__saltos = 0;
        new PerformanceObserver(l => l.getEntries().forEach(e => { if (!e.hadRecentInput) window.__saltos += e.value; }))
          .observe({ type: 'layout-shift', buffered: true });
      });
      const p = await ctx.newPage();
      await p.route(/\.woff2$/, async x => { await new Promise(z => setTimeout(z, 1500)); await x.continue(); });
      await p.goto(BASE + r, { waitUntil: 'load' });
      await p.waitForTimeout(800);
      const s = await p.evaluate(() => window.__saltos);
      if (s > 0.02) saltos.push(`${ancho}px: ${s.toFixed(3)}`);
      await ctx.close();
    }
    if (saltos.length) malos++;
    console.log(ruta(r), 'saltos al llegar tarde las fuentes:', saltos.length ? saltos.join(', ') : 'ninguno');
    // Y con conexión normal se pinta con las fuentes propias, no con las de reserva.
    const ctx = await navegador.newContext({ viewport: { width: 412, height: 800 } });
    const p = await ctx.newPage();
    await p.goto(BASE + r, { waitUntil: 'load' });
    const cdp = await ctx.newCDPSession(p);
    const { root } = await cdp.send('DOM.getDocument');
    await cdp.send('CSS.enable');
    const faltan = [];
    for (const [sel, esperada] of [['.pie-menu a', 'Barlow Condensed'], ['.marca', 'Anton']]) {
      const { nodeId } = await cdp.send('DOM.querySelector', { nodeId: root.nodeId, selector: sel });
      const familias = (await cdp.send('CSS.getPlatformFontsForNode', { nodeId })).fonts.map(f => f.familyName);
      if (!familias.length || !familias.every(f => f.startsWith(esperada))) faltan.push(`${sel} ${esperada} (se pinta ${familias.join('/') || 'nada'})`);
    }
    if (faltan.length) malos++;
    console.log(ruta(r), 'fuentes propias en pantalla:', faltan.length ? `faltan ${faltan.join(', ')}` : 'sí');
    await ctx.close();
  }
  // Escalera de sanciones (Normas): cada sanción en su línea y un peldaño más adentro que la
  // anterior. En fila se partía y la flecha se quedaba colgando al final de la línea de arriba.
  for (const r of ['normas/', 'en/rules/']) {
    const fallos = [];
    for (const w of [1440, 1024, 390, 320]) {
      const ctx = await navegador.newContext({ viewport: { width: w, height: 900 }, reducedMotion: 'reduce' });
      const p = await ctx.newPage();
      await p.goto(BASE + r, { waitUntil: 'load' });
      const pasos = await p.evaluate(() => [...document.querySelectorAll('.pasos-sancion li span')].map(s => {
        const rc = s.getBoundingClientRect();
        return { top: Math.round(rc.top), left: Math.round(rc.left), right: Math.round(rc.right), W: innerWidth };
      }));
      const mal = pasos.length < 2 || pasos.some((x, i) => x.right > x.W || (i && (x.top <= pasos[i - 1].top || x.left <= pasos[i - 1].left)));
      if (mal) fallos.push(`${w}px: ${JSON.stringify(pasos.map(x => [x.top, x.left]))}`);
      await ctx.close();
    }
    if (fallos.length) malos++;
    console.log(ruta(r), 'sanciones en escalera a 1440, 1024, 390 y 320 px:', fallos.length ? fallos.join('; ') : 'sí');
  }
  // La tira de la galería tiene todas sus fotos al llegar.
  for (const r of ['', 'en/']) {
    const ctx = await navegador.newContext({ viewport: { width: 1440, height: 900 } });
    const p = await ctx.newPage();
    await p.goto(BASE + r, { waitUntil: 'load' });
    await p.evaluate(() => document.querySelector('.mosaico').scrollIntoView({ behavior: 'instant' }));
    // Hasta 10 s: en una máquina cargada 2,5 s no siempre bastan, y la tira tarda más en deslizarlas.
    await p.waitForFunction(() => [...document.querySelectorAll('.tira img')].every(i => i.complete && i.naturalWidth), null, { timeout: 10000 }).catch(() => {});
    const sin = await p.evaluate(() => [...document.querySelectorAll('.tira img')].filter(i => !(i.complete && i.naturalWidth)).map(i => i.getAttribute('src').split('/').pop()));
    if (sin.length) malos++;
    console.log(ruta(r), 'tira de la galería cargada al llegar:', sin.length ? `faltan ${sin.join(', ')}` : 'sí');
    await ctx.close();
  }
  // Planificador de la guía: con JavaScript se ve, responde y cambia al elegir otra especie o
  // ritmo; sin JavaScript no aparece (no sabría calcular nada).
  for (const r of ['dinosaurios/', 'en/dinosaurs/']) {
    const fallos = [];
    for (const js of [true, false]) {
      const ctx = await navegador.newContext({ viewport: { width: 390, height: 844 }, javaScriptEnabled: js });
      const p = await ctx.newPage();
      await p.goto(BASE + r, { waitUntil: 'load' });
      const caja = p.locator('[data-plan]');
      if (!(await caja.count())) { fallos.push('no está'); await ctx.close(); break; }
      const visible = await caja.isVisible();
      if (!js) { if (visible) fallos.push('se ve sin JavaScript'); await ctx.close(); continue; }
      if (!visible) { fallos.push('no se ve con JavaScript'); await ctx.close(); continue; }
      const leer = () => p.evaluate(() => { const s = document.querySelector('[data-resultado]'); return { t: s.textContent.trim(), c: s.className }; });
      const antes = await leer();
      if (!antes.t || !/\b(si|no)\b/.test(antes.c)) fallos.push(`sin resultado (${antes.c})`);
      const [especie, ritmo] = await caja.locator('select').all();
      const opciones = await especie.locator('option').count();
      await especie.selectOption({ index: opciones - 1 });
      const otra = await leer();
      await ritmo.selectOption({ index: (await ritmo.locator('option').count()) - 1 });
      const rapido = await leer();
      if (otra.t === antes.t) fallos.push('no cambia con la especie');
      if (rapido.t === otra.t) fallos.push('no cambia con el ritmo');
      // Lo elegido va en la dirección y, al abrirla, sale igual; un valor que no existe se ignora. Si no
      // llega, dice a qué cacería llegaría: con pocas horas al día, el Tyrannosaurus nunca llega a la próxima.
      await especie.selectOption({ index: 0 });
      await ritmo.selectOption({ index: 0 });
      const [horas] = (await caja.locator('select').all()).slice(2);
      await horas.selectOption('2');
      const pocas = await leer();
      const direccion = await p.evaluate(() => location.href);
      if (!/[?&]horas=2\b/.test(direccion) || /[?&](especie|ritmo)=/.test(direccion)) fallos.push(`dirección «${direccion}»`);
      if (!/\bno\b/.test(pocas.c) || (pocas.t.match(/\d{1,2}:\d{2}/g) || []).length < 3) fallos.push(`a 2 h al día: «${pocas.t}»`);
      const otraVez = await ctx.newPage();
      await otraVez.goto(`${BASE}${r}?especie=triceratops&ritmo=2&horas=nada#${await caja.evaluate(c => c.closest('section').id)}`, { waitUntil: 'load' });
      const puestos = await otraVez.evaluate(() => [...document.querySelectorAll('[data-plan] select')].map(s => s.selectedIndex ? s.selectedOptions[0].dataset.ancla || s.value : ''));
      if (puestos[0] !== 'triceratops' || puestos[1] !== '2' || puestos[2]) fallos.push(`al abrir el enlace del planificador: ${puestos}`);
      await otraVez.close();
      await ctx.close();
    }
    if (fallos.length) malos++;
    console.log(ruta(r), 'planificador de crecimiento:', fallos.length ? fallos.join('; ') : 'sí');
  }
  // Comparativa de especies: sin JavaScript, la lista entera y sin selectores; con él, ordena por
  // cada criterio, filtra por dieta y por tamaño de grupo y la cuenta dice cuántas quedan.
  for (const r of ['dinosaurios/', 'en/dinosaurs/']) {
    const fallos = [];
    for (const js of [false, true]) {
      const ctx = await navegador.newContext({ viewport: { width: 390, height: 844 }, javaScriptEnabled: js });
      const p = await ctx.newPage();
      await p.goto(BASE + r, { waitUntil: 'load' });
      const caja = p.locator('[data-comparar]');
      const filas = () => p.evaluate(() => [...document.querySelectorAll('[data-comparar-lista] > div')]
        .filter(f => f.offsetParent).map(f => ({ ...f.dataset, enlace: f.querySelector('a').getAttribute('href'), destino: f.querySelector('a').href })));
      const todas = await filas();
      if (todas.length < 2) fallos.push(`${todas.length} especies en la lista`);
      if (!(await caja.count()) || (await caja.isVisible()) !== js) {
        fallos.push(js ? 'sin selectores con JavaScript' : 'selectores visibles sin JavaScript');
        await ctx.close();
        continue;
      }
      // Las cifras de cada especie, en columnas alineadas con su cabecera y sin salirse de la pantalla.
      const columnas = await p.evaluate(() => {
        const x = el => Math.round(el.getBoundingClientRect().left);
        const cabeza = ['peso', 'crece', 'grupo'].map(k => x(document.querySelector(`.comparar-cabeza .c-${k}`)));
        return [...document.querySelectorAll('[data-comparar-lista] > div')].flatMap(f => {
          const fila = ['peso', 'crece', 'grupo'].map(k => f.querySelector(`.c-${k}`));
          return fila.some((c, i) => x(c) !== cabeza[i] || c.getBoundingClientRect().right > innerWidth) ? [f.dataset.nombre] : [];
        });
      });
      if (columnas.length) fallos.push(`cifras fuera de su columna: ${columnas}`);
      // Fichas plegadas. Un enlace viejo a una (dinosaurios/#triceratops) lleva a ella y la abre; sin JavaScript
      // se queda en su fila, plegada, y se abre al pulsarla.
      const ficha = await ctx.newPage();
      await ficha.goto(`${BASE}${r}#triceratops`, { waitUntil: 'load' });
      await ficha.waitForTimeout(1500);
      const vista = await ficha.evaluate(() => {
        const d = document.getElementById('triceratops'), c = d.getBoundingClientRect();
        return { abierta: d.open, arriba: c.top, ve: c.top >= -2 && c.top < innerHeight, cerradas: document.querySelectorAll('details.dino:not([open])').length, total: document.querySelectorAll('details.dino').length, alto: document.documentElement.scrollHeight };
      });
      if (vista.abierta !== js || !vista.ve) fallos.push(`#triceratops: ${JSON.stringify(vista)}`);
      if (vista.cerradas !== vista.total - (js ? 1 : 0)) fallos.push(`fichas abiertas al entrar: ${vista.total - vista.cerradas}`);
      await ficha.close();
      const alto = await p.evaluate(() => document.documentElement.scrollHeight);
      // El apartado de dieta (unos 2500 px) es contenido real y debe coincidir con el Discord: no se pliega. Lo que
      // este tope vigila son las fichas: con todas abiertas la guía pasa de 32 000 px.
      if (alto > 13500) fallos.push(`la guía mide ${alto} px en el móvil (máximo 13 500: las fichas se leen plegadas o en su página)`);
      await p.locator('details.dino summary .dieta').first().click();
      await p.waitForTimeout(100);
      if (await p.evaluate(() => !document.querySelector('details.dino').open)) fallos.push('pulsar una ficha no la abre');
      if (!js) { await ctx.close(); continue; }
      const [orden, dieta, somos] = await caja.locator('select').all();
      for (const [criterio, campo, sentido] of [['peso', 'peso', -1], ['crece', 'crece', 1], ['grupo', 'grupo', -1]]) {
        await orden.selectOption(criterio);
        const v = (await filas()).map(f => +f[campo]);
        if (v.some((x, i) => i && (x - v[i - 1]) * sentido < 0)) fallos.push(`no ordena por ${criterio}: ${v.join(' ')}`);
      }
      const n = Math.max(...todas.map(f => +f.grupo));
      await somos.selectOption(String(n));
      const grandes = await filas();
      const cuenta = await caja.locator('[role="status"]').textContent();
      if (!grandes.length || grandes.some(f => +f.grupo < n)) fallos.push(`filtro de grupo ${n}: ${grandes.map(f => f.nombre)}`);
      if (!cuenta.includes(`${grandes.length} `) || !cuenta.includes(` ${todas.length} `)) fallos.push(`cuenta «${cuenta}» con ${grandes.length} de ${todas.length}`);
      await somos.selectOption('1');
      await dieta.selectOption('herbivoros');
      const herbivoros = await filas();
      if (!herbivoros.length || herbivoros.some(f => f.dieta !== 'herbivoros')) fallos.push('filtro de dieta');
      // Lo elegido queda en la dirección y, al abrirla, la lista sale igual; un valor que no existe se ignora.
      const enlace = await p.evaluate(() => location.href);
      if (!/[?&]dieta=herbivoros\b/.test(enlace) || /[?&]grupo=/.test(enlace)) fallos.push(`dirección «${enlace}»`);
      const otra = await ctx.newPage();
      await otra.goto(`${BASE}${r}?orden=peso&grupo=${n}&dieta=nada`, { waitUntil: 'load' });
      const abierta = await otra.evaluate(() => [...document.querySelectorAll('[data-comparar-lista] > div')].filter(f => f.offsetParent).map(f => +f.dataset.grupo));
      if (abierta.length !== grandes.length || abierta.some(g => g < n)) fallos.push(`al abrir ?grupo=${n}: ${abierta.length} especies y deberían ser ${grandes.length}`);
      await otra.close();
      if (herbivoros.length) {
        await Promise.all([p.waitForEvent('load', { timeout: 5000 }).catch(() => {}), p.locator(`[data-comparar-lista] a[href="${herbivoros[0].enlace}"]`).click()]);
        if (p.url() !== herbivoros[0].destino || !/\/[a-z0-9-]+\/$/.test(p.url())) fallos.push(`pulsar una especie lleva a ${p.url()} y no a su página`);
      }
      await ctx.close();
    }
    if (fallos.length) malos++;
    console.log(ruta(r), 'comparativa de especies:', fallos.length ? fallos.join('; ') : 'sí');
  }
  // Página de cada especie, en el móvil más estrecho: las mismas que lista la comparativa de la guía
  // (ni más ni menos que en el mapa del sitio), cada una carga sin errores ni nada más ancho que la
  // pantalla, con su nombre, el grupo que dice la guía, el cambio de idioma a la misma especie y el
  // enlace al planificador con ella ya puesta. «ver la lista» abre la comparativa ya ordenada y la señala.
  for (const guia of ['dinosaurios/', 'en/dinosaurs/']) {
    const fallos = [];
    const ctx = await navegador.newContext({ viewport: { width: 320, height: 700 }, isMobile: true, hasTouch: true });
    const p = await ctx.newPage();
    const errores = [];
    p.on('pageerror', e => errores.push(`${p.url()}: ${e.message}`));
    p.on('console', m => { if (m.type() === 'error') errores.push(`${p.url()}: ${m.text()}`); });
    p.on('response', x => { if (x.status() >= 400) errores.push(`${x.status()} ${x.url()}`); });
    await p.goto(BASE + guia, { waitUntil: 'load' });
    const lista = await p.evaluate(() => [...document.querySelectorAll('[data-comparar-lista] > div')]
      .map(f => ({ nombre: f.dataset.nombre, grupo: f.dataset.grupo, url: f.querySelector('a').href })));
    const delMapa = ESPECIES.filter(r => r.startsWith(guia)).map(r => BASE + r).sort();
    if (JSON.stringify(lista.map(e => e.url).sort()) !== JSON.stringify(delMapa)) fallos.push(`la guía enlaza ${lista.length} especies y el mapa del sitio tiene ${delMapa.length}`);
    for (const e of lista) {
      await p.goto(e.url, { waitUntil: 'load' });
      const v = await p.evaluate(() => ({
        h1: document.querySelector('h1').textContent.trim(),
        grupo: document.querySelector('[data-ficha="grupo"]')?.textContent,
        sobra: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        idioma: document.querySelector('.barra-acciones .idioma').href,
        guia: document.querySelector('.saltos a').href,
      }));
      const otra = guia === 'dinosaurios/' ? e.url.replace('/dinosaurios/', '/en/dinosaurs/') : e.url.replace('/en/dinosaurs/', '/dinosaurios/');
      const ancla = e.url.split('/').at(-2);
      if (v.h1 !== e.nombre) fallos.push(`${ancla}: título «${v.h1}»`);
      if (v.grupo !== e.grupo) fallos.push(`${ancla}: grupo ${v.grupo} y la guía dice ${e.grupo}`);
      if (v.sobra > 0) fallos.push(`${ancla}: ${v.sobra} px más ancha que la pantalla`);
      if (v.idioma !== otra) fallos.push(`${ancla}: el idioma lleva a ${v.idioma}`);
      // Los valores van tras el fragmento: Google no rastrea los fragmentos y sí cada dirección con parámetros.
      if (v.guia !== `${BASE}${guia}#${guia === 'dinosaurios/' ? 'planificador' : 'planner'}?especie=${ancla}`) fallos.push(`${ancla}: «¿llegas a la cacería?» lleva a ${v.guia}`);
      const leer = guia === 'dinosaurios/' ? 'como-leer' : 'how-to-read';
      if (await p.locator(`#${leer}`).count()) fallos.push(`${ancla}: repite «cómo leer» en vez de enlazarlo`);
      if (!await p.locator(`.saltos a[href$="${guia}#${leer}"]`).count()) fallos.push(`${ancla}: sin enlace a «cómo leer»`);
    }
    if (lista.length) {
      await p.goto(lista[0].url, { waitUntil: 'load' });
    }
    if (lista.length && !(await p.locator('[data-puesto="peso"] a').count())) fallos.push('sin «ver la lista» del peso');
    else if (lista.length) {
      await Promise.all([p.waitForEvent('load', { timeout: 5000 }).catch(() => {}), p.locator('[data-puesto="peso"] a').click()]);
      const pesos = await p.evaluate(() => [...document.querySelectorAll('[data-comparar-lista] > div')].filter(f => f.offsetParent).map(f => +f.dataset.peso));
      if (!pesos.length || pesos.some((x, i) => i && x > pesos[i - 1])) fallos.push(`«ver la lista» no abre la comparativa por peso: ${pesos.join(' ')}`);
      await p.waitForTimeout(800);
      const senal = await p.evaluate(() => { const m = document.querySelector('.marcada'), c = m && m.getBoundingClientRect(); return m && { nombre: m.dataset.nombre, ve: c.top >= 0 && c.bottom <= innerHeight }; });
      if (!senal || senal.nombre !== lista[0].nombre || !senal.ve) fallos.push(`«ver la lista» no señala la especie: ${JSON.stringify(senal)} y es ${lista[0].nombre}`);
      await p.goto(lista[1].url, { waitUntil: 'load' });
      await Promise.all([p.waitForEvent('load', { timeout: 5000 }).catch(() => {}), p.locator('.saltos a').first().click()]);
      const puesta = await p.evaluate(() => { const o = document.querySelector('[data-plan] select').selectedOptions[0]; return o && o.dataset.nombre; });
      if (puesta !== lista[1].nombre) fallos.push(`el planificador abre con ${puesta} y venía de ${lista[1].nombre}`);
      await p.waitForTimeout(500);
      const aVista = await p.evaluate(() => { const s = document.querySelector('[data-plan]').closest('section').getBoundingClientRect(); return s.top >= -1 && s.top < innerHeight / 2; });
      if (!aVista) fallos.push('el enlace al planificador no baja hasta él');
    }
    if (errores.length) fallos.push(`errores: ${JSON.stringify(errores.slice(0, 3))}`);
    if (fallos.length) malos++;
    console.log(ruta(guia), `páginas de especies (${lista.length}):`, fallos.length ? fallos.join('; ') : 'bien');
    await ctx.close();
  }
  // Batallas: la portada enlaza a la lista de El clan, y la lista tiene alguna batalla.
  for (const [inicio, clan] of [['', 'clan/'], ['en/', 'en/clan/']]) {
    const ctx = await navegador.newContext({ viewport: { width: 1366, height: 850 } });
    const p = await ctx.newPage();
    await p.goto(BASE + inicio, { waitUntil: 'load' });
    const destino = await p.evaluate(() => document.querySelector('.cifras-enlace a')?.getAttribute('href') || '');
    await p.goto(new URL(destino || '#', BASE + inicio).href, { waitUntil: 'load' });
    const ancla = destino.split('#')[1] || '-';
    const n = await p.evaluate(a => document.getElementById(a)?.querySelectorAll('.batalla').length || 0, ancla);
    const mal = !destino || !p.url().startsWith(BASE + clan) || !n;
    if (mal) malos++;
    console.log(ruta(inicio), 'batallas enlazadas a El clan:', mal ? `no (enlace «${destino}», ${n} batallas)` : `sí, ${n}`);
    await ctx.close();
  }
  malos += await cifrasPortada(navegador, ESPECIES);
  // Portada: en un móvil bajo el botón principal se ve sin bajar, y en ancho la guía y la Cacería
  // van lado a lado aunque en el móvil la Cacería vaya primero.
  for (const inicio of ['', 'en/']) {
    const fallos = [];
    for (const [ancho, alto] of [[360, 640], [375, 667], [390, 844]]) {
      const ctx = await navegador.newContext({ viewport: { width: ancho, height: alto }, isMobile: true, hasTouch: true, reducedMotion: 'reduce' });
      const p = await ctx.newPage();
      await p.goto(BASE + inicio, { waitUntil: 'load' });
      await p.evaluate(() => document.fonts.ready);
      const abajo = await p.evaluate(() => document.querySelector('.portada .boton').getBoundingClientRect().bottom);
      if (abajo > alto) fallos.push(`a ${ancho}x${alto} el botón acaba en ${Math.round(abajo)} px`);
      await ctx.close();
    }
    const ctx = await navegador.newContext({ viewport: { width: 1366, height: 850 } });
    const p = await ctx.newPage();
    await p.goto(BASE + inicio, { waitUntil: 'load' });
    const [g, c] = await p.evaluate(() => ['.baldosa-dinos', '.baldosa-caceria'].map(s => { const r = document.querySelector(s).getBoundingClientRect(); return { izq: r.left, arriba: r.top }; }));
    if (!(g.izq < c.izq) || Math.abs(g.arriba - c.arriba) > 1) fallos.push(`en ancho, guía y Cacería descolocadas (${JSON.stringify([g, c])})`);
    await ctx.close();
    if (fallos.length) malos++;
    console.log(ruta(inicio), 'botón principal a la vista y mosaico en su sitio:', fallos.length ? fallos.join('; ') : 'bien');
  }
  // Vídeos de las batallas: al abrir la página solo se bajan las portadas, no los vídeos; cada vídeo
  // (y su versión ligera) se sirve como vídeo y, al darle al play, arranca (si este Chromium sabe
  // leer H.264). En el móvil arranca la versión ligera (-movil) y en escritorio la normal.
  for (const r of ['clan/', 'en/clan/']) for (const [ancho, alto] of [[1366, 850], [390, 844]]) {
    const fallos = [];
    const ctx = await navegador.newContext({ viewport: { width: ancho, height: alto }, isMobile: ancho < 800, hasTouch: ancho < 800 });
    const p = await ctx.newPage();
    const pedidos = [];
    p.on('request', q => pedidos.push(q.url()));
    await p.goto(BASE + r, { waitUntil: 'load' });
    await p.evaluate(() => document.querySelector('.batallas')?.scrollIntoView({ behavior: 'instant' }));
    await p.waitForTimeout(1500);
    const videos = await p.evaluate(() => [...document.querySelectorAll('.batalla video')].map(v => ({
      fuentes: [...v.querySelectorAll('source')].map(s => s.src), poster: v.poster, ancho: v.getBoundingClientRect().width,
      h264: v.canPlayType('video/mp4; codecs="avc1.640020, mp4a.40.2"') })));
    if (!videos.length) fallos.push('sin vídeos');
    const bajados = pedidos.filter(u => u.endsWith('.mp4'));
    if (bajados.length) fallos.push(`bajados al abrir: ${bajados.map(u => u.split('/').pop()).join(', ')}`);
    for (const v of videos) {
      for (const src of v.fuentes) {
        const rv = await ctx.request.head(src);
        if (!rv.ok() || !rv.headers()['content-type']?.startsWith('video/mp4')) fallos.push(`${src.split('/').pop()}: ${rv.status()} ${rv.headers()['content-type']}`);
      }
      const nombre = v.fuentes.at(-1).split('/').pop();
      if (!v.fuentes.some(s => s.endsWith('-movil.mp4'))) fallos.push(`${nombre} sin versión ligera para el móvil`);
      const rp = await ctx.request.get(v.poster);
      if (!rp.ok()) fallos.push(`portada de ${nombre}: ${rp.status()}`);
      if (v.ancho < 300) fallos.push(`${nombre} de solo ${Math.round(v.ancho)} px de ancho`);
    }
    let reproduce = 'sin H.264 en este Chromium';
    if (videos[0]?.h264) {
      const ok = await p.evaluate(async () => {
        const v = document.querySelector('.batalla video');
        v.muted = true;
        try { await v.play(); } catch (e) { return e.message; }
        await new Promise(z => setTimeout(z, 1500));
        return v.currentTime > 0 ? '' : `parado en ${v.currentTime}`;
      });
      if (ok) fallos.push(`no arranca: ${ok}`);
      const suena = (await p.evaluate(() => document.querySelector('.batalla video').currentSrc)).split('/').pop();
      if (suena.endsWith('-movil.mp4') !== ancho < 800) fallos.push(`a ${ancho} px arranca ${suena}`);
      reproduce = `arranca ${suena}`;
    }
    await ctx.close();
    if (fallos.length) malos++;
    console.log(ruta(r), `vídeos de las batallas a ${ancho} px:`, fallos.length ? fallos.join('; ') : `${videos.length}, sin bajar al abrir; ${reproduce}`);
  }
  // Entrada de la portada y de las cabeceras al llegar desde otra página de la web: empieza cuando
  // acaban los zarpazos del cambio de página. Antes se jugaba entera detrás y solo se veía al entrar
  // de fuera («las animaciones solo salen la primera vez»).
  {
    const fallos = [];
    const ctx = await navegador.newContext({ viewport: { width: 1366, height: 850 } });
    await ctx.addInitScript(() => {
      addEventListener('pagereveal', e => {
        window.__finZarpazos = e.viewTransition ? null : 0;
        e.viewTransition?.finished.then(() => { window.__finZarpazos = performance.now(); });
      });
    });
    const p = await ctx.newPage();
    for (const [desde, pulsa, llega] of [['clan/', '.marca', ''], ['clan/', '.menu a[href*="dinosaurios"]', 'dinosaurios/'], ['en/hunt/', '.menu a:first-child', 'en/']]) {
      await p.goto(BASE + desde, { waitUntil: 'load' });
      await p.click(pulsa);
      await p.waitForURL(BASE + llega);
      await p.waitForTimeout(2500);
      const r = await p.evaluate(() => {
        const a = document.getAnimations().filter(x => ['subir', 'descubrir'].includes(x.animationName) && x.effect.target.closest('.portada-in, .cabecera-in'));
        return { fin: window.__finZarpazos, empieza: Math.min(...a.map(x => x.startTime + x.effect.getTiming().delay)), n: a.length };
      });
      if (r.fin === null || r.fin === undefined) fallos.push(`${llega || 'portada'}: sin cambio de página animado (no se puede medir)`);
      else if (!r.n || r.empieza < r.fin) fallos.push(`${llega || 'portada'}: la entrada empieza en ${Math.round(r.empieza)} ms y los zarpazos acaban en ${Math.round(r.fin)} ms`);
    }
    await ctx.close();
    if (fallos.length) malos++;
    console.log(ruta(''), 'entrada visible al llegar desde otra página:', fallos.length ? fallos.join('; ') : 'sí');
  }
  // Enlaces sueltos: en un móvil, 44 px de alto para el dedo, con la capa invisible si la llevan.
  {
    const ctx = await navegador.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    const p = await ctx.newPage();
    const pequenos = new Set();
    for (const r of ['', 'dinosaurios/', 'dinosaurios/triceratops/', 'en/dinosaurs/triceratops/']) {
      await p.goto(BASE + r, { waitUntil: 'load' });
      for (const x of await p.evaluate(() => [...document.querySelectorAll('.marca, .saltos a, .indice-grupo li a, .pie-menu a, .pie-enlaces a')].map(e => {
        const capa = getComputedStyle(e, '::before');
        const alto = Math.max(e.getBoundingClientRect().height, capa.position === 'absolute' ? parseFloat(capa.height) || 0 : 0);
        return alto < 43.5 ? `${e.parentElement.className || e.parentElement.tagName} ${Math.round(alto)}` : '';
      }).filter(Boolean))) pequenos.add(x);
    }
    await ctx.close();
    if (pequenos.size) malos++;
    console.log('enlaces para el dedo:', pequenos.size ? `pequeños: ${[...pequenos].join(', ')}` : '44 px o más');
  }
  // Botones: en un móvil táctil, tocar no los deja levantados (el hover se quedaba pegado), y con
  // teclado el botón rojo lleva un anillo que se distingue del rojo del botón.
  {
    const fallos = [];
    const movil = await navegador.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    const p = await movil.newPage();
    await p.goto(BASE, { waitUntil: 'load' });
    await p.hover('.acciones .boton:not(.boton-sec)');
    await p.waitForTimeout(500);
    const movido = await p.evaluate(() => getComputedStyle(document.querySelector('.acciones .boton:not(.boton-sec)')).transform);
    if (movido !== 'none') fallos.push(`en táctil se queda movido (${movido})`);
    await movil.close();
    const ctx = await navegador.newContext({ viewport: { width: 1366, height: 850 } });
    const q = await ctx.newPage();
    await q.goto(BASE, { waitUntil: 'load' });
    let anillo = '';
    for (let i = 0; i < 40 && !anillo; i++) {
      await q.keyboard.press('Tab');
      anillo = await q.evaluate(() => {
        const a = document.activeElement;
        return a.matches('.boton:not(.boton-sec)') ? getComputedStyle(a).outlineColor : '';
      });
    }
    if (anillo !== 'rgb(231, 231, 231)') fallos.push(`anillo de foco del botón rojo: ${anillo || 'no se llega con Tab'}`);
    await ctx.close();
    if (fallos.length) malos++;
    console.log(ruta(''), 'botones en táctil y con teclado:', fallos.length ? fallos.join('; ') : 'bien');
  }
  // Accesibilidad, en cada página a 375 y a 1366 px:
  // - el texto sobre fotos (portada, cabeceras, baldosas) se lee: se pinta la página sin texto y el
  //   píxel más claro detrás de cada línea (percentil 95) da el contraste con su color (WCAG: 4,5, o
  //   3 en letra grande);
  // - lo que se pulsa mide al menos 24 px (o lleva su capa invisible de 44), salvo enlaces en un párrafo.
  // Y de paso, sin coste: ningún adorno absoluto (::before/::after) cuelga de un elemento sin posición propia. Así
  // el trazo de ascua de las tarjetas del aviso legal, la Cacería y Únete acababa apilado en el borde de la pantalla.
  // Los enlaces sí pueden: su ::after cubre a propósito la tarjeta entera, para pulsarla toda.
  for (const [ancho, alto] of [[375, 812], [1366, 800]]) for (const [r] of PAGINAS) {
    const fallos = [];
    const ctx = await navegador.newContext({ viewport: { width: ancho, height: alto }, isMobile: ancho < 800, hasTouch: ancho < 800, reducedMotion: 'reduce', bypassCSP: true });
    const p = await ctx.newPage();
    await p.goto(BASE + r, { waitUntil: 'load' });
    await p.waitForTimeout(400);
    const { lineas, pequenos, sueltos } = await p.evaluate(() => {
      const sueltos = new Set();
      for (const el of document.querySelectorAll('main *:not(a)')) {
        if (getComputedStyle(el).position !== 'static') continue;
        for (const ps of ['::before', '::after']) {
          const c = getComputedStyle(el, ps);
          if (c.content !== 'none' && c.position === 'absolute') sueltos.add(`${el.tagName.toLowerCase()}${[...el.classList].map(c => '.' + c).join('')}${ps}`);
        }
      }
      const lineas = [];
      for (const zona of document.querySelectorAll('.portada, .cabecera, .baldosa')) {
        const w = document.createTreeWalker(zona, NodeFilter.SHOW_TEXT);
        while (w.nextNode()) {
          const t = w.currentNode, el = t.parentElement;
          if (!t.textContent.trim() || el.closest('.oculto, [aria-hidden="true"], .boton, .cuenta-grande')) continue;
          const cs = getComputedStyle(el);
          if (/rgba\(0, 0, 0, 0\)/.test(cs.webkitTextFillColor)) continue;
          const rango = document.createRange();
          rango.selectNodeContents(t);
          for (const q of rango.getClientRects()) {
            if (q.width > 4 && q.top >= 0 && q.bottom <= innerHeight) lineas.push({ x: q.left, y: q.top, w: q.width, h: q.height, color: cs.color, grande: parseFloat(cs.fontSize) >= 24 || (parseFloat(cs.fontSize) >= 18.66 && +cs.fontWeight >= 700), txt: t.textContent.trim().slice(0, 30) });
          }
        }
      }
      const pequenos = [];
      for (const el of document.querySelectorAll('a[href], button, summary, select, video[controls]')) {
        const q = el.getBoundingClientRect(), cs = getComputedStyle(el);
        if (!q.width || cs.visibility === 'hidden' || el.closest('[inert], dialog:not([open]), [popover]:not(:popover-open)')) continue;
        if (cs.display === 'inline' && el.closest('p, li, dd, td')) continue;
        const capa = getComputedStyle(el, '::before');
        if ((q.width < 24 || q.height < 24) && !(capa.content !== 'none' && parseFloat(capa.height) >= 44)) pequenos.push(`«${(el.textContent || el.getAttribute('aria-label') || '').trim().slice(0, 25)}» ${Math.round(q.width)}x${Math.round(q.height)}`);
      }
      return { lineas, pequenos, sueltos: [...sueltos] };
    });
    if (pequenos.length) fallos.push(`pequeño para pulsar: ${pequenos.join(', ')}`);
    if (sueltos.length) fallos.push(`adorno fuera de su caja (sin position): ${sueltos.join(', ')}`);
    if (lineas.length) {
      // Sin la hoja de estilos de la página (la política de seguridad no deja estilos sueltos; aquí se salta).
      await p.addStyleTag({ content: '* { color: transparent !important; -webkit-text-fill-color: transparent !important; text-decoration-color: transparent !important; text-shadow: none !important; } .boton, .cuenta-grande { visibility: hidden !important; }' });
      await p.waitForTimeout(150);
      const foto = (await p.screenshot()).toString('base64');
      const bajos = await p.evaluate(async ({ foto, lineas }) => {
        const img = new Image();
        img.src = `data:image/png;base64,${foto}`;
        await img.decode();
        const c = document.createElement('canvas');
        c.width = img.naturalWidth; c.height = img.naturalHeight;
        const g = c.getContext('2d');
        g.drawImage(img, 0, 0);
        const esc = img.naturalWidth / innerWidth;
        const lum = (r, gg, b) => [r, gg, b].map(v => { v /= 255; return v <= .03928 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4; }).reduce((a, v, i) => a + v * [.2126, .7152, .0722][i], 0);
        const peor = {};
        for (const l of lineas) {
          const d = g.getImageData(Math.round(l.x * esc), Math.round(l.y * esc), Math.max(1, Math.round(l.w * esc)), Math.max(1, Math.round(l.h * esc))).data;
          const vals = [];
          for (let i = 0; i < d.length; i += 8) vals.push(lum(d[i], d[i + 1], d[i + 2]));
          vals.sort((a, b) => a - b);
          const fondo = vals[Math.floor(vals.length * .95)], [r, gg, b] = l.color.match(/[\d.]+/g).map(Number), texto = lum(r, gg, b);
          const ratio = (Math.max(texto, fondo) + .05) / (Math.min(texto, fondo) + .05);
          if (ratio < (l.grande ? 3 : 4.5) && !(peor[l.txt] <= ratio)) peor[l.txt] = ratio;
        }
        return Object.entries(peor).map(([t, v]) => `«${t}» ${v.toFixed(1)}`);
      }, { foto, lineas });
      if (bajos.length) fallos.push(`texto sobre foto con poco contraste: ${bajos.join(', ')}`);
    }
    await ctx.close();
    if (fallos.length) { malos++; console.log(ruta(r), `accesibilidad a ${ancho} px:`, fallos.join('; ')); }
  }
  console.log(ruta(''), `accesibilidad (contraste sobre fotos y tamaño para pulsar) y adornos en su caja en ${PAGINAS.length} páginas a 375 y 1366 px: revisada`);
  // Alto contraste de Windows: el sistema borra los fondos, y los iconos dibujados con fondo (menú,
  // cerrar, abrir pregunta) se quedaban en blanco. Deben conservar un color distinto del de su botón.
  {
    const fallos = [];
    const ctx = await navegador.newContext({ viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true, forcedColors: 'active' });
    const p = await ctx.newPage();
    await p.goto(BASE + 'unete/', { waitUntil: 'load' });
    const color = (sel, pseudo) => p.evaluate(([s, ps]) => { const el = document.querySelector(s); return el && getComputedStyle(el, ps).backgroundColor; }, [sel, pseudo]);
    const fondo = await p.evaluate(() => getComputedStyle(document.body).backgroundColor);
    const iconos = [['.menu-boton span', null], ['.menu-boton span', '::before'], ['summary', '::before'], ['summary', '::after']];
    for (const [sel, ps] of iconos) {
      const c = await color(sel, ps);
      if (!c || c === fondo || /rgba\(0, 0, 0, 0\)/.test(c)) fallos.push(`${sel}${ps || ''} sin color (${c})`);
    }
    await p.click('.menu-boton');
    await p.waitForTimeout(400);
    for (const ps of ['::before', '::after']) {
      const c = await color('.menu-cerrar', ps);
      if (!c || c === fondo || /rgba\(0, 0, 0, 0\)/.test(c)) fallos.push(`.menu-cerrar${ps} sin color (${c})`);
    }
    // En la comparativa, sin sombras ni colores propios, la fila marcada y la columna activa se distinguen igual.
    await p.goto(`${BASE}dinosaurios/?orden=peso&marca=triceratops`, { waitUntil: 'load' });
    const resalte = await p.evaluate(() => {
      const fila = document.querySelector('.comparar-lista > .marcada'), activa = document.querySelector('.comparar-lista > div .c-peso'), otra = document.querySelector('.comparar-lista > div .c-grupo');
      return { fila: fila && getComputedStyle(fila).outlineStyle, activa: activa && getComputedStyle(activa).textDecorationLine, otra: otra && getComputedStyle(otra).textDecorationLine };
    });
    if (resalte.fila === 'none' || !resalte.fila || resalte.activa !== 'underline' || resalte.otra !== 'none') fallos.push(`comparativa en alto contraste: ${JSON.stringify(resalte)}`);
    await ctx.close();
    if (fallos.length) malos++;
    console.log(ruta('unete/'), 'iconos en alto contraste de Windows:', fallos.length ? fallos.join('; ') : 'se ven');
  }
  // La dirección antigua lleva a la misma página en la nueva, con su ancla; en la nueva no se mueve.
  {
    const fallos = [];
    const ANTIGUA = 'https://mmortexx.github.io/garra-iberica/';
    const NUEVA = (await (await fetch(BASE)).text()).match(/rel="canonical" href="([^"]+)"/)[1];
    const ctx = await navegador.newContext({ bypassCSP: true });
    for (const web of [ANTIGUA, NUEVA]) {
      await ctx.route(web + '**', async q => q.fulfill({ response: await q.fetch({ url: q.request().url().replace(web, BASE) }) }));
    }
    const p = await ctx.newPage();
    for (const [desde, hasta] of [
      [`${ANTIGUA}en/route/#all-achievements`, `${NUEVA}en/route/#all-achievements`],
      [`${ANTIGUA}?a=1`, `${NUEVA}?a=1`],
      [`${NUEVA}clan/`, `${NUEVA}clan/`],
    ]) {
      await p.goto(desde, { waitUntil: 'load' });
      await p.waitForTimeout(300);
      if (p.url() !== hasta) fallos.push(`${desde} acaba en ${p.url()}`);
    }
    // Un desvío aún en vuelo al cerrar mataba node con TargetClosedError (visto en GitHub): se quitan antes.
    await ctx.unrouteAll({ behavior: 'ignoreErrors' });
    await ctx.close();
    if (fallos.length) malos++;
    console.log('Dirección antigua, a la nueva:', fallos.length ? fallos.join('; ') : 'bien');
  }
  // Página 404: enlaza a la dirección pública, que aquí se sirve desde la copia local. Con red de
  // móvil, el título sale con la letra del clan (sin precargarla, «optional» la dejaba en Impact).
  {
    const fallos = [];
    const PUBLICA = (await (await fetch(BASE)).text()).match(/rel="canonical" href="([^"]+)"/)[1];
    const ctx = await navegador.newContext({ viewport: { width: 375, height: 812 }, bypassCSP: true });
    await ctx.route(PUBLICA + '**', async q => {
      const resp = await q.fetch({ url: q.request().url().replace(PUBLICA, BASE) });
      await q.fulfill({ response: resp, headers: { ...resp.headers(), 'access-control-allow-origin': '*' } });
    });
    const p = await ctx.newPage();
    const cdp = await ctx.newCDPSession(p);
    await cdp.send('Network.enable');
    await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 150, downloadThroughput: 1.6e6 / 8, uploadThroughput: 750e3 / 8 });
    await p.goto(BASE + '404.html', { waitUntil: 'load' });
    await p.waitForTimeout(500);
    await cdp.send('DOM.enable');
    await cdp.send('CSS.enable');
    const { root } = await cdp.send('DOM.getDocument');
    for (const [sel, letra] of [['h1', 'Anton'], ['.antetitulo', 'Barlow Condensed']]) {
      const { nodeId } = await cdp.send('DOM.querySelector', { nodeId: root.nodeId, selector: sel });
      const { fonts } = nodeId ? await cdp.send('CSS.getPlatformFontsForNode', { nodeId }) : { fonts: [] };
      if (!fonts.some(f => f.familyName.startsWith(letra))) fallos.push(`${sel} con ${fonts.map(f => f.familyName).join(', ') || 'nada'} en vez de ${letra}`);
    }
    if (!(await p.locator('.marca').isVisible())) fallos.push('sin la marca del clan');
    // Los dos idiomas a la vista, sin desbordar, con el tamaño para pulsar y sin nada solapado.
    for (const ancho of [320, 375, 1366]) {
      await p.setViewportSize({ width: ancho, height: 812 });
      const m = await p.evaluate(() => {
        const enlaces = [...document.querySelectorAll('main a')];
        const cajas = enlaces.map(a => a.getBoundingClientRect());
        const pisa = (u, v) => u.left < v.right && v.left < u.right && u.top < v.bottom && v.top < u.bottom;
        return {
          desborda: document.documentElement.scrollWidth > innerWidth,
          ingles: !!document.querySelector('[lang="en"] h2')?.getBoundingClientRect().height,
          pequenos: enlaces.filter(a => a.getBoundingClientRect().height < 24).map(a => a.textContent.trim()),
          solapados: enlaces.filter((a, i) => cajas.some((c, j) => j > i && pisa(cajas[i], c))).map(a => a.textContent.trim()),
        };
      });
      if (m.desborda) fallos.push(`${ancho}px: más ancha que la pantalla`);
      if (!m.ingles) fallos.push(`${ancho}px: sin la parte en inglés`);
      if (m.pequenos.length) fallos.push(`${ancho}px: enlaces de menos de 24 px: ${m.pequenos.join(', ')}`);
      if (m.solapados.length) fallos.push(`${ancho}px: enlaces solapados: ${m.solapados.join(', ')}`);
    }
    // Un desvío aún en vuelo al cerrar mataba node con TargetClosedError (visto en GitHub): se quitan antes.
    await ctx.unrouteAll({ behavior: 'ignoreErrors' });
    await ctx.close();
    if (fallos.length) malos++;
    console.log(ruta('404.html'), 'letra del clan, marca y los dos idiomas:', fallos.length ? fallos.join('; ') : 'sí');
  }
  // Procesador en el móvil: cada fotograma que pide la página la recalcula entera. Las ascuas piden
  // como mucho 30 por segundo (a 60 se llevaban un tercio del procesador de un móvil normal) y, en
  // táctil, ninguna animación en marcha repinta sombras o fondos (el latido y el brillo de la
  // portada lo hacían: casi la mitad del procesador durante la entrada).
  for (const r of ['', 'clan/']) {
    const fallos = [];
    const ctx = await navegador.newContext({ viewport: { width: 412, height: 915 }, isMobile: true, hasTouch: true });
    const p = await ctx.newPage();
    await p.goto(BASE + r, { waitUntil: 'load' });
    await p.waitForSelector('canvas.ascuas.encendido', { timeout: 5000 }).catch(() => fallos.push('sin ascuas'));
    await p.waitForTimeout(3000);
    const { fps, repintan } = await p.evaluate(async () => {
      let n = 0;
      const raf = window.requestAnimationFrame;
      window.requestAnimationFrame = f => raf(t => { n++; f(t); });
      await new Promise(z => setTimeout(z, 3000));
      window.requestAnimationFrame = raf;
      const repintan = document.getAnimations().filter(a => a.playState === 'running' && a.effect?.getKeyframes)
        .filter(a => a.effect.getKeyframes().some(k => 'boxShadow' in k || 'backgroundPosition' in k || 'filter' in k))
        .map(a => `${a.animationName} (${a.effect.target.className || a.effect.target.tagName}${a.effect.pseudoElement || ''})`);
      return { fps: n / 3, repintan };
    });
    // 30 con su temporizador; sin él, una pantalla normal da 60. 45 deja margen a un servidor lento.
    if (fps > 45) fallos.push(`las ascuas piden ${fps.toFixed(0)} fotogramas por segundo`);
    if (repintan.length) fallos.push(`animaciones que repintan en táctil: ${repintan.join(', ')}`);
    await ctx.close();
    if (fallos.length) malos++;
    console.log(ruta(r), 'procesador en el móvil:', fallos.length ? fallos.join('; ') : `ascuas a ${fps.toFixed(0)} fotogramas por segundo, nada que repinte`);
  }
  // Cacería según dónde se mire: la cuenta atrás y la semana dan primero la hora de quien mira, el
  // selector las cambia, en plena cacería lo dice sin hora, sin JavaScript quedan las de España y
  // abrir la página no paga los formateadores de hora del selector (es lo que bloqueaba la carga).
  {
    const fallos = [];
    const JUEVES = '2026-11-05T12:00:00Z';
    const abrir = async (r, zona, ahora, opts = {}) => {
      const ctx = await navegador.newContext({ viewport: { width: 390, height: 844 }, timezoneId: zona, ...opts });
      const p = await ctx.newPage();
      await p.clock.setFixedTime(new Date(ahora));
      return { ctx, p, ir: () => p.goto(BASE + r, { waitUntil: 'load' }) };
    };
    const horario = p => p.evaluate(() => ({
      caceria: document.querySelector('[data-aviso="caceria"]').textContent,
      encuesta: document.querySelector('[data-aviso="encuesta"]').textContent,
      recordatorio: document.querySelector('[data-aviso="recordatorio"]').textContent,
      rotulo: document.querySelector('[data-horas-rotulo]').textContent,
    }));
    const zonas = [
      // [página, zona del dispositivo, país que queda elegido, hora en la cuenta atrás, línea de España, hora de la cacería, encuesta, aviso, rótulo]
      ['caceria/', 'Europe/Madrid', 'Europe/Madrid', '22:00', null, 'Sábado, 22:00', 'Miércoles, 20:00', 'Sábado, 20:00', 'Horas en España (península y Baleares)'],
      ['caceria/', 'America/Bogota', 'America/Bogota', '16:00', '22:00 en España', 'Sábado, 16:00', 'Miércoles, 14:00', 'Sábado, 14:00', 'Horas en Colombia'],
      ['caceria/', 'Asia/Tokyo', '', '06:00', '22:00 en España', 'Domingo, 06:00', 'Jueves, 04:00', 'Domingo, 04:00', 'Tu hora'],
      ['en/hunt/', 'Europe/London', 'Europe/London', '21:00', '22:00 in Spain', 'Saturday, 21:00', 'Wednesday, 19:00', 'Saturday, 19:00', 'Times in United Kingdom'],
      ['en/hunt/', 'America/Argentina/Buenos_Aires', 'America/Argentina/Buenos_Aires', '18:00', '22:00 in Spain', 'Saturday, 18:00', 'Wednesday, 16:00', 'Saturday, 16:00', 'Times in Argentina'],
    ];
    for (const [r, zona, pais, hora, espana, caceria, encuesta, recordatorio, rotulo] of zonas) {
      const { ctx, p, ir } = await abrir(r, zona, JUEVES);
      await ir();
      await p.waitForFunction(() => document.querySelector('[data-resultado] b'), null, { timeout: 5000 }).catch(() => fallos.push(`${r} ${zona}: el selector no da resultado`));
      const v = await p.evaluate(() => ({
        pais: document.querySelector('[data-horas] select').value,
        fecha: document.querySelector('[data-cuenta] time').textContent,
        espana: document.querySelector('[data-local]').hidden ? null : document.querySelector('[data-local]').textContent,
        resultado: document.querySelector('[data-resultado] b')?.textContent,
      }));
      if (v.pais !== pais) fallos.push(`${r} ${zona}: elige «${v.pais}»`);
      if (!v.fecha.includes(hora)) fallos.push(`${r} ${zona}: la cuenta atrás dice «${v.fecha}», sin ${hora}`);
      if (v.espana !== espana) fallos.push(`${r} ${zona}: línea de España «${v.espana}»`);
      if (v.resultado !== caceria) fallos.push(`${r} ${zona}: el selector dice «${v.resultado}»`);
      const h = await horario(p).catch(() => null);
      if (!h || h.caceria !== caceria || h.encuesta !== encuesta || h.recordatorio !== recordatorio || h.rotulo !== rotulo) fallos.push(`${r} ${zona}: la semana dice ${JSON.stringify(h)}`);
      await ctx.close();
    }
    // Elegir otro país cambia el resultado y la semana.
    {
      const { ctx, p, ir } = await abrir('caceria/', 'America/Bogota', JUEVES);
      await ir();
      await p.waitForFunction(() => document.querySelector('[data-resultado] b'), null, { timeout: 5000 }).catch(() => {});
      await p.locator('[data-horas] select').selectOption('Europe/Madrid');
      const h = await horario(p).catch(() => null);
      if (!h || h.caceria !== 'Sábado, 22:00' || h.encuesta !== 'Miércoles, 20:00' || h.rotulo !== 'Horas en España (península y Baleares)') fallos.push(`al elegir España: ${JSON.stringify(h)}`);
      // Con varias zonas en un país, el rótulo dice cuál: Canarias lleva otra hora que la península.
      await p.locator('[data-horas] select').selectOption('Atlantic/Canary');
      const c = await horario(p).catch(() => null);
      if (!c || c.caceria !== 'Sábado, 21:00' || c.rotulo !== 'Horas en España (Canarias)') fallos.push(`al elegir Canarias: ${JSON.stringify(c)}`);
      await ctx.close();
    }
    // En plena cacería, la cuenta atrás lo dice y no da una hora que no sería la de quien mira.
    for (const [r, texto, titulo] of [['caceria/', 'Ya ha empezado', 'Cacería en marcha'], ['en/hunt/', 'It has started', 'Hunt under way']]) {
      const { ctx, p, ir } = await abrir(r, 'America/Bogota', '2026-11-07T21:30:00Z');
      await ir();
      const dice = await p.locator('[data-falta]').textContent();
      if (!dice.startsWith(texto)) fallos.push(`${r} en plena cacería dice «${dice}»`);
      if (await p.locator('.cuenta-titulo').first().textContent() !== titulo) fallos.push(`${r} en plena cacería no se titula «${titulo}»`);
      await ctx.close();
    }
    // Sin JavaScript: las horas de España, sin selector ni cuenta atrás.
    {
      const { ctx, p, ir } = await abrir('caceria/', 'America/Bogota', JUEVES, { javaScriptEnabled: false });
      await ir();
      const h = await horario(p).catch(() => null);
      if (!h || h.caceria !== 'Sábado, 22:00' || h.encuesta !== 'Miércoles, 20:00' || h.rotulo !== 'Hora de España') fallos.push(`sin JavaScript: ${JSON.stringify(h)}`);
      if (await p.locator('[data-horas]').isVisible()) fallos.push('sin JavaScript se ve el selector');
      await ctx.close();
    }
    // Al abrir: ningún formateador de hora antes de que la página esté lista. La cuenta atrás y el
    // selector los crean después, cada uno en su tarea.
    {
      const { ctx, p, ir } = await abrir('caceria/', 'Europe/Madrid', JUEVES);
      await p.addInitScript(() => {
        window.__intl = 0;
        Intl.DateTimeFormat = new Proxy(Intl.DateTimeFormat, {
          construct: (t, a) => { window.__intl++; return new t(...a); },
          apply: (t, _, a) => { window.__intl++; return t(...a); },
        });
        document.addEventListener('DOMContentLoaded', () => { window.__intlCarga = window.__intl; });
      });
      await ir();
      const n = await p.evaluate(() => window.__intlCarga);
      if (n !== 0) fallos.push(`se crean ${n} formateadores de hora al abrir`);
      await ctx.close();
    }
    if (fallos.length) malos++;
    console.log(ruta('caceria/'), 'hora de cada zona:', fallos.length ? fallos.join('; ') : 'sí');
  }
  malos += await frenoDeSalidas(navegador);
  malos += await efectos(navegador);
  malos += await ventana(navegador);
  malos += await fotosMovil(navegador);
  malos += await enlacesPuesto(navegador);
  malos += await imprimir(navegador);
  malos += await ahoraToca(navegador);
  malos += await transicionSaltada(navegador);
  await navegador.close();
  if (SALIDAS.length) {
    malos++;
    console.log('Ha intentado salir del ordenador (parado):', [...new Set(SALIDAS)].join('; '));
  }
  console.log(malos ? `${malos} casos con problemas` : 'Todo correcto');
  process.exit(malos ? 1 : 0);
})();
