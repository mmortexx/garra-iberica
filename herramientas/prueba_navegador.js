// Prueba la web en un navegador real: contenido visible con y sin JavaScript y con «reducir
// movimiento», sin errores en consola, ningún texto cortado en móviles de 320 a 412 px, cabecera
// sin solapes, menú (en fila o a pantalla completa) que lleva a cada página, enlaces viejos de la
// portada a su sitio nuevo, página nunca más ancha que la pantalla, marca alineada con los títulos,
// rangos en escalera, ambiente que se para en reposo, visor de la galería, fuentes sin saltos al
// llegar tarde, sanciones en escalera, fotos del mosaico a su tamaño, planificador de crecimiento,
// comparativa de especies, página de cada especie, batallas de la portada enlazadas a El clan,
// botón principal de la portada a la vista en móviles bajos,
// vídeo ligero en el móvil,
// hora de la Cacería en cada zona, efectos (menú al cerrarse, bruma, arañazos, fotos, vídeos, comparativa),
// contraste del texto sobre fotos, tamaño para pulsar e iconos en el alto contraste de Windows.
// Uso: con la web servida en http://127.0.0.1:8765/ (ver README) y Playwright instalado:
//   node herramientas/prueba_navegador.js
// CHROME_PATH opcional, para usar un Chromium concreto.
const { chromium } = require('playwright');
// WEB: otra dirección local (p. ej. para probar una versión anterior servida en otro puerto).
const BASE = process.env.WEB || 'http://127.0.0.1:8765/';
// Las 18 páginas (mismo orden que montar_web.PAGINAS) y lo que lleva cada una. Las de cada especie se
// añaden al empezar, desde el mapa del sitio.
const PAGINAS = [
  ['', 'inicio'], ['en/', 'inicio'], ['clan/', 'clan'], ['en/clan/', 'clan'],
  ['dinosaurios/', 'dinosaurios'], ['en/dinosaurs/', 'dinosaurios'], ['caceria/', 'caceria'], ['en/hunt/', 'caceria'],
  ['combate/', 'combate'], ['en/combat/', 'combate'],
  ['galeria/', 'galeria'], ['en/gallery/', 'galeria'], ['unete/', 'unete'], ['en/join/', 'unete'],
  ['normas/', 'normas'], ['en/rules/', 'normas'], ['legal/', 'legal'], ['en/legal/', 'legal'],
];
// Páginas que no están en el menú (se llega desde el pie o desde la página de su tema): no marcan ninguno.
const FUERA_MENU = ['normas', 'legal', 'especie'];
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
const efectos = async navegador => {
  const fallos = [];
  const abrir = async (r, opts = {}) => {
    const ctx = await navegador.newContext({ viewport: { width: 1366, height: 850 }, ...opts });
    const p = await ctx.newPage();
    await p.goto(BASE + r, { waitUntil: 'load' });
    return { ctx, p };
  };
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
  console.log('Efectos (menú, bruma, arañazos, fotos, vídeos, comparativa):', fallos.length ? fallos.join('; ') : 'bien');
  return fallos.length;
};
(async () => {
  const navegador = await chromium.launch(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {});
  if (process.env.SOLO === 'efectos') {
    const n = await efectos(navegador);
    await navegador.close();
    process.exit(n ? 1 : 0);
  }
  // Páginas de cada especie: iguales por dentro, así que a la batería completa van solo, en cada idioma,
  // la de nombre más largo y la de más corto. Todas pasan por la prueba de especies, más abajo.
  const mapa = await (await fetch(BASE + 'sitemap.xml')).text();
  const ESPECIES = [...mapa.matchAll(/<loc>[^<]*?\/((?:en\/dinosaurs|dinosaurios)\/[a-z0-9-]+\/)<\/loc>/g)].map(m => m[1]);
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
        const titulos = [...document.querySelectorAll('main .seccion h2')].map(h => [h.id, Math.round(h.getBoundingClientRect().left)]);
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
    p.on('pageerror', e => errores.push(e.message));
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
      };
    });
    const fallos = [];
    const esperar = (cuando, e, quieto) => {
      if (e.reposo !== quieto || e.ascuas === quieto || e.pulso !== (quieto ? 'paused' : 'running') || e.niebla !== (quieto ? 'paused' : 'running')) fallos.push(`${cuando}: ${JSON.stringify(e)}`);
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
    const ctx = await conMemoria.newContext({ viewport: { width: 375, height: 667 }, isMobile: true, hasTouch: true });
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
  // Mosaico de la portada: a cada ancho, el tamaño que declara cada foto (sizes, que es lo que da
  // naturalWidth con srcset) no es menor que el que se pinta; si lo es, el navegador elige una
  // versión pequeña y sale borrosa. Y la tira de la galería tiene todas sus fotos al llegar.
  for (const r of ['', 'en/']) {
    const borrosas = [];
    for (const w of [400, 760, 900, 960, 999, 1000, 1200, 1440]) {
      const ctx = await navegador.newContext({ viewport: { width: w, height: 900 }, deviceScaleFactor: 1 });
      const p = await ctx.newPage();
      await p.goto(BASE + r, { waitUntil: 'load' });
      await p.evaluate(() => document.querySelector('.mosaico').scrollIntoView({ behavior: 'instant' }));
      await p.waitForFunction(() => [...document.querySelectorAll('.baldosa-fondo')].every(i => i.complete && i.naturalWidth), null, { timeout: 10000 });
      const fotos = await p.evaluate(() => [...document.querySelectorAll('.baldosa-fondo')].map(i => ({
        foto: i.currentSrc.split('/').pop(), pinta: i.getBoundingClientRect().width, trae: i.naturalWidth })));
      for (const f of fotos) if (f.trae < f.pinta * 0.98) borrosas.push(`${w}px: ${f.foto} de ${f.trae} px pintada a ${Math.round(f.pinta)}`);
      await ctx.close();
    }
    if (borrosas.length) malos++;
    console.log(ruta(r), 'fotos del mosaico a su tamaño:', borrosas.length ? borrosas.join('; ') : 'sí');
    const ctx = await navegador.newContext({ viewport: { width: 1440, height: 900 } });
    const p = await ctx.newPage();
    await p.goto(BASE + r, { waitUntil: 'load' });
    await p.evaluate(() => document.querySelector('.mosaico').scrollIntoView({ behavior: 'instant' }));
    await p.waitForTimeout(2500);
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
      if (alto > 13000) fallos.push(`la guía mide ${alto} px en el móvil (máximo 13 000: las fichas se leen plegadas o en su página)`);
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
      if (!v.guia.startsWith(`${BASE}${guia}?especie=${ancla}#`)) fallos.push(`${ancla}: «¿llegas a la cacería?» lleva a ${v.guia}`);
      if (await p.evaluate(() => document.querySelector('details.lectura').open)) fallos.push(`${ancla}: «cómo leer» debería empezar plegado`);
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
  for (const [ancho, alto] of [[375, 812], [1366, 800]]) for (const [r] of PAGINAS) {
    const fallos = [];
    const ctx = await navegador.newContext({ viewport: { width: ancho, height: alto }, isMobile: ancho < 800, hasTouch: ancho < 800, reducedMotion: 'reduce', bypassCSP: true });
    const p = await ctx.newPage();
    await p.goto(BASE + r, { waitUntil: 'load' });
    await p.waitForTimeout(400);
    const { lineas, pequenos } = await p.evaluate(() => {
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
      return { lineas, pequenos };
    });
    if (pequenos.length) fallos.push(`pequeño para pulsar: ${pequenos.join(', ')}`);
    if (lineas.length) {
      // Sin la hoja de estilos de la página (la política de seguridad no deja estilos sueltos; aquí se salta).
      await p.addStyleTag({ content: '* { color: transparent !important; -webkit-text-fill-color: transparent !important; text-shadow: none !important; } .boton, .cuenta-grande { visibility: hidden !important; }' });
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
  console.log(ruta(''), `accesibilidad (contraste sobre fotos y tamaño para pulsar) en ${PAGINAS.length} páginas a 375 y 1366 px: revisada`);
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
  // Página 404: enlaza a la dirección pública, que aquí se sirve desde la copia local. Con red de
  // móvil, el título sale con la letra del clan (sin precargarla, «optional» la dejaba en Impact).
  {
    const fallos = [];
    const PUBLICA = 'https://mmortexx.github.io/garra-iberica/';
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
    await ctx.close();
    if (fallos.length) malos++;
    console.log(ruta('404.html'), 'letra del clan y marca:', fallos.length ? fallos.join('; ') : 'sí');
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
      ['caceria/', 'Europe/Madrid', 'Europe/Madrid', '22:00', null, 'Sábado, 22:00', 'Miércoles, 20:00', 'Sábado, 20:00', 'Horas en España'],
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
      if (!h || h.caceria !== 'Sábado, 22:00' || h.encuesta !== 'Miércoles, 20:00' || h.rotulo !== 'Horas en España') fallos.push(`al elegir España: ${JSON.stringify(h)}`);
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
  malos += await efectos(navegador);
  await navegador.close();
  console.log(malos ? `${malos} casos con problemas` : 'Todo correcto');
  process.exit(malos ? 1 : 0);
})();
