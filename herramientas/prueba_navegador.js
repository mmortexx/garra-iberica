// Prueba la web en un navegador real: contenido visible con y sin JavaScript y con «reducir
// movimiento», sin errores en consola, ningún texto cortado en móviles de 320 a 412 px, cabecera
// sin solapes, menú (en fila o a pantalla completa) que lleva a cada página, enlaces viejos de la
// portada a su sitio nuevo, página nunca más ancha que la pantalla, marca alineada con los títulos,
// visor de la galería y fuentes sin saltos al llegar tarde.
// Uso: con la web servida en http://127.0.0.1:8765/ (ver README) y Playwright instalado:
//   node herramientas/prueba_navegador.js
// CHROME_PATH opcional, para usar un Chromium concreto.
const { chromium } = require('playwright');
const BASE = 'http://127.0.0.1:8765/';
// Las 12 páginas (mismo orden que montar_web.PAGINAS) y lo que lleva cada una.
const PAGINAS = [
  ['', 'inicio'], ['en/', 'inicio'], ['clan/', 'clan'], ['en/clan/', 'clan'],
  ['dinosaurios/', 'dinosaurios'], ['en/dinosaurs/', 'dinosaurios'], ['caceria/', 'caceria'], ['en/hunt/', 'caceria'],
  ['galeria/', 'galeria'], ['en/gallery/', 'galeria'], ['unete/', 'unete'], ['en/join/', 'unete'],
];
const CON_CUENTA = ['inicio', 'caceria'];
const CON_COMPARTIR = ['inicio'];
const CON_CARTEL = ['caceria'];
const CON_GALERIA = ['galeria'];
// Enlaces de cuando todo estaba en la portada: deben llevar a su página nueva.
const MOVIDAS = [['#normas', 'clan/#normas'], ['#guia', 'dinosaurios/'], ['en/#faq', 'en/join/#faq'], ['en/#hunt', 'en/hunt/']];
const ruta = r => ('/' + r).padEnd(15);
(async () => {
  const navegador = await chromium.launch(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {});
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
          compartir: !!document.querySelector('[data-compartir]:not([hidden])'),
        };
      });
      // Con JavaScript: cuenta atrás en bloques (3 o 4, según queden días) y botón de compartir
      // donde los hay. Sin él, ninguna de las dos cosas, que no funcionarían.
      const js = nombre !== 'sin JavaScript';
      const cuenta = js && CON_CUENTA.includes(tipo), compartir = js && CON_COMPARTIR.includes(tipo);
      if (cuenta !== res.cuentaVisible || compartir !== res.compartir || (cuenta && res.bloques < 3)) malos++;
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
    // Menú en escritorio: en una fila, marcando la página en la que se está (el inicio no está en él).
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
      if (m.visibles !== 5 || m.boton) fallos.push(`${m.visibles} enlaces a la vista y botón ${m.boton ? 'visible' : 'oculto'}`);
      const esperado = tipo === 'inicio' ? [] : [m.aqui];
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
    const solapes = [], cortados = [], anchas = [], desalineados = [];
    for (const ancho of [...anchos, 1920]) {
      await p.setViewportSize({ width: ancho, height: 850 });
      // Nada más ancho que la pantalla: en móvil deja arrastrar la página de lado o la aleja. Se
      // mide sin el recorte de las secciones y sin la luz de los paneles, que se sale a propósito.
      // La marca de la cabecera y los títulos de todas las secciones, en la misma vertical.
      const a = await p.evaluate(() => {
        const hoja = document.createElement('style');
        hoja.textContent = '.seccion { overflow-x: visible !important } .luz::before { display: none !important }';
        document.head.append(hoja);
        const sobra = document.documentElement.scrollWidth - document.documentElement.clientWidth;
        hoja.remove();
        const izq = sel => Math.round(document.querySelector(sel).getBoundingClientRect().left);
        const titulos = [...document.querySelectorAll('main .seccion h2')].map(h => [h.id, Math.round(h.getBoundingClientRect().left)]);
        return { sobra, marca: izq('.marca'), titulos };
      });
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
      const bien = ancho >= 1020 ? m.visibles === 5 && !m.boton && m.lineas === 1 && !m.fuera : m.visibles === 0 && m.boton;
      if (!bien) cortados.push(`${ancho}px: ${m.visibles} enlaces en ${m.lineas} líneas, ${m.fuera} fuera, botón ${m.boton ? 'sí' : 'no'}`);
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
    if (anchas.length) malos++;
    if (desalineados.length) malos++;
    console.log(ruta(r), 'página más ancha que la pantalla 320–1440px y 1920px:', anchas.length ? `${anchas.length} anchos, p. ej. ${JSON.stringify(anchas.slice(0, 3))}` : 'nunca');
    console.log(ruta(r), 'marca y títulos alineados 320–1440px y 1920px:', desalineados.length ? `fallan ${desalineados.length} anchos, p. ej. ${JSON.stringify(desalineados.slice(0, 2))}` : 'siempre');
    console.log(ruta(r), 'cabecera 320–1440px solapes:', solapes.length ? `${solapes.length} anchos, p. ej. ${JSON.stringify(solapes.slice(0, 3))}` : 'ninguno');
    console.log(ruta(r), 'menú 320–1440px, en fila o tras su botón:', cortados.length ? `fallan ${cortados.length} anchos, p. ej. ${JSON.stringify(cortados.slice(0, 3))}` : 'siempre');
    await ctx.close();
  }
  // Menú en el móvil, con el dedo y con el teclado: el botón lo abre a pantalla completa con todos
  // los enlaces a la vista, Escape y la X lo cierran devolviendo el foco al botón, y cada enlace
  // lleva a su página. Se recorren las páginas de una en una desde el menú, como haría alguien.
  for (const lang of ['', 'en/']) {
    const ctx = await navegador.newContext({ viewport: { width: 375, height: 667 }, isMobile: true, hasTouch: true });
    const p = await ctx.newPage();
    const errores = [];
    p.on('pageerror', e => errores.push(e.message));
    await p.goto(BASE + lang, { waitUntil: 'load' });
    const fallos = [];
    const abierto = () => p.evaluate(() => document.querySelector('.menu').matches(':popover-open'));
    const destinos = await p.evaluate(() => [...document.querySelectorAll('.menu a:not(.menu-idioma)')].map(a => a.href));
    await p.tap('.menu-boton');
    await p.waitForTimeout(700);
    const vista = await p.evaluate(() => {
      const W = innerWidth, H = innerHeight;
      const m = document.querySelector('.menu').getBoundingClientRect();
      const fuera = [...document.querySelectorAll('.menu a, .menu-cerrar')].filter(el => {
        const rc = el.getBoundingClientRect();
        return !rc.width || rc.left < 0 || rc.right > W || rc.top < 0 || rc.bottom > H;
      }).map(el => el.textContent.trim() || el.className);
      return { cubre: m.left <= 0 && m.top <= 0 && m.right >= W && m.bottom >= H, fuera, rueda: getComputedStyle(document.documentElement).overflow };
    });
    if (!(await abierto()) || !vista.cubre || vista.fuera.length) fallos.push(`al abrir: ${JSON.stringify(vista)}`);
    if (vista.rueda !== 'hidden') fallos.push('con el menú abierto la página de detrás se mueve');
    await p.keyboard.press('Escape');
    await p.waitForTimeout(200);
    const foco = await p.evaluate(() => document.activeElement.className);
    if (await abierto()) fallos.push('Escape no lo cierra');
    if (foco !== 'menu-boton') fallos.push(`tras cerrar, el foco está en «${foco}»`);
    await p.tap('.menu-boton');
    await p.waitForTimeout(400);
    await p.tap('.menu-cerrar');
    await p.waitForTimeout(200);
    if (await abierto()) fallos.push('la X no lo cierra');
    for (const destino of destinos) {
      await p.tap('.menu-boton');
      await p.waitForTimeout(400);
      await p.tap(`.menu a[href="${await p.evaluate(d => [...document.querySelectorAll('.menu a')].find(a => a.href === d).getAttribute('href'), destino)}"]`);
      await p.waitForURL(destino, { timeout: 5000 }).catch(() => fallos.push(`no llega a ${destino} (está en ${p.url()})`));
      await p.waitForLoadState('load');
      if (await abierto()) fallos.push(`${destino} se abre con el menú abierto`);
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
      const cargada = '(() => { const v = document.querySelector(".visor"); const i = v && v.querySelector(".visor-img"); return !!i && i.complete && i.naturalWidth > 0 && !v.classList.contains("cargando"); })()';
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
        if (!(await esperar('document.querySelector(".visor-img").currentSrc.includes("-3080.")'))) fallos.push('ampliada sin la resolución original');
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
  await navegador.close();
  console.log(malos ? `${malos} casos con problemas` : 'Todo correcto');
  process.exit(malos ? 1 : 0);
})();
