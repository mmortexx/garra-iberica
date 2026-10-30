// Prueba la web en un navegador real: contenido visible con y sin JavaScript y con «reducir
// movimiento», sin errores en consola, ningún texto cortado en móviles de 320 a 412 px, cabecera
// sin solapes, página nunca más ancha que la pantalla, marca alineada con los títulos, visor de la
// galería y fuentes sin saltos al llegar tarde.
// Uso: con la web servida en http://127.0.0.1:8765/ (ver README) y Playwright instalado:
//   node herramientas/prueba_navegador.js
// CHROME_PATH opcional, para usar un Chromium concreto.
const { chromium } = require('playwright');
const BASE = 'http://127.0.0.1:8765/';
(async () => {
  const navegador = await chromium.launch(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {});
  const casos = [
    ['normal tras scroll', {}],
    ['reducir movimiento', { reducedMotion: 'reduce' }],
    ['sin JavaScript', { javaScriptEnabled: false }],
  ];
  let malos = 0;
  for (const ruta of ['', 'en/']) {
    for (const [nombre, opts] of casos) {
      const ctx = await navegador.newContext({ viewport: { width: 1366, height: 850 }, ...opts });
      const p = await ctx.newPage();
      const errores = [];
      p.on('pageerror', e => errores.push(e.message));
      p.on('console', m => { if (m.type() === 'error') errores.push(m.text()); });
      await p.goto(BASE + ruta, { waitUntil: 'load' });
      if (nombre === 'normal tras scroll') {
        for (let y = 0; y < 9500; y += 300) { await p.mouse.wheel(0, 300); await p.waitForTimeout(40); }
        await p.waitForTimeout(2500);
      } else {
        await p.waitForTimeout(800);
      }
      const r = await p.evaluate(() => {
        const ocultos = [...document.querySelectorAll('.revelar, .entra')].filter(el => parseFloat(getComputedStyle(el).opacity) < 0.99);
        return {
          claseAnim: document.documentElement.classList.contains('anim'),
          ascuas: document.querySelectorAll('canvas.ascuas').length,
          ocultos: ocultos.length,
          ejemplo: ocultos.slice(0, 3).map(e => e.className),
          cuentaVisible: !document.querySelector('[data-cuenta]').hidden,
          bloques: [...document.querySelectorAll('.cuenta-falta .t')].filter(e => !e.hidden && e.querySelector('.n').textContent && e.querySelector('.u').textContent).length,
          compartir: !!document.querySelector('[data-compartir]:not([hidden])'),
        };
      });
      // Con JavaScript: cuenta atrás en bloques (3 o 4, según queden días) y botón de compartir.
      // Sin él, ninguna de las dos cosas, que no funcionarían.
      const conJs = nombre !== 'sin JavaScript';
      if (conJs !== r.cuentaVisible || conJs !== r.compartir || (conJs && r.bloques < 3)) malos++;
      if (r.ocultos || errores.length) malos++;
      // «Compartir» sin menú del sistema: copia la dirección canónica y lo dice.
      if (nombre === 'normal tras scroll' && r.compartir) {
        await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: BASE.slice(0, -1) });
        await p.evaluate(() => { Object.defineProperty(navigator, 'share', { value: undefined }); });
        await p.click('[data-compartir] button');
        await p.waitForTimeout(300);
        r.copiado = await p.evaluate(async () => {
          const c = document.querySelector('[data-compartir]');
          return c.querySelector('[role="status"]').textContent === c.dataset.copiado
            && await navigator.clipboard.readText() === document.querySelector('link[rel="canonical"]').href;
        });
        if (!r.copiado) malos++;
      }
      console.log(('/' + ruta).padEnd(5), nombre.padEnd(20), JSON.stringify(r), 'errores:', JSON.stringify(errores));
      await ctx.close();
    }
    // Menú: con cada sección en la franja de lectura se marca su enlace, o ninguno si no está en él.
    {
      const ctx = await navegador.newContext({ viewport: { width: 1366, height: 850 }, reducedMotion: 'reduce' });
      const p = await ctx.newPage();
      await p.goto(BASE + ruta, { waitUntil: 'load' });
      await p.evaluate(() => document.fonts.ready);
      const ids = await p.evaluate(() => [...document.querySelectorAll('main section[id]')].map(s => s.id));
      const estado = id => ({
        marcado: [...document.querySelectorAll('.menu a[aria-current]')].map(a => a.hash.slice(1)).join(','),
        esperado: document.querySelector(`.menu a[href="#${id}"]`) ? id : '',
      });
      const mal = [];
      for (const id of ids) {
        // El borde de la sección al 40 % de la altura: la franja de lectura (45–50 %) queda dentro.
        await p.evaluate(id => scrollTo(0, document.getElementById(id).getBoundingClientRect().top + scrollY - innerHeight * 0.40), id);
        // Se espera a que el menú llegue a lo esperado; si no llega en 2 s, se informa de lo que hay.
        await p.waitForFunction(`(e => e.marcado === e.esperado)((${estado})(${JSON.stringify(id)}))`, null, { timeout: 2000 })
          .catch(() => {});
        const r = await p.evaluate(estado, id);
        if (r.marcado !== r.esperado) mal.push(`#${id}: marcado «${r.marcado}», esperado «${r.esperado}»`);
      }
      if (mal.length) malos++;
      console.log(('/' + ruta).padEnd(5), 'menú marca la sección:', mal.length ? JSON.stringify(mal) : `bien en ${ids.length} secciones`);
      await ctx.close();
    }
    // Texto que se sale de la pantalla en móviles estrechos (overflow:hidden lo esconde sin avisar).
    for (const ancho of [320, 360, 412]) {
      const ctx = await navegador.newContext({ viewport: { width: ancho, height: 760 }, isMobile: true, hasTouch: true });
      const p = await ctx.newPage();
      await p.goto(BASE + ruta, { waitUntil: 'load' });
      await p.evaluate(() => document.fonts.ready);
      const fuera = await p.evaluate(() => {
        const W = document.documentElement.clientWidth;
        return [...document.querySelectorAll('body *')].filter(el => {
          if (el.closest('.menu, .oculto, canvas, svg') || !el.childNodes.length) return false;
          const conTexto = [...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim());
          if (!conTexto) return false;
          const rc = el.getBoundingClientRect();
          return rc.width && (rc.right > W + 0.5 || rc.left < -0.5 || el.clientWidth && el.scrollWidth > el.clientWidth + 1);
        }).map(el => el.tagName + '.' + [...el.classList].join('.') + ' «' + el.textContent.trim().slice(0, 40) + '»');
      });
      if (fuera.length) malos++;
      console.log(('/' + ruta).padEnd(5), `${ancho}px desbordes:`, fuera.length ? JSON.stringify(fuera.slice(0, 5)) : 'ninguno');
      // Cartel de la Cacería: en móvil, a todo el ancho y recortado (a su proporción original,
      // 2,5:1, el rótulo queda ilegible).
      const cartel = await p.evaluate(async () => {
        const img = document.querySelector('.marco-ancho img');
        img.loading = 'eager';
        await img.decode();
        const r = img.getBoundingClientRect();
        return { ancho: Math.round(r.width), proporcion: +(r.width / r.height).toFixed(2), pantalla: document.documentElement.clientWidth };
      });
      if (cartel.ancho < cartel.pantalla || cartel.proporcion > 1.7) {
        malos++;
        console.log(('/' + ruta).padEnd(5), `${ancho}px cartel de la Cacería pequeño:`, JSON.stringify(cartel));
      }
      await ctx.close();
    }
    // Cabecera: marca, enlaces del menú, idioma y botón no se pisan a ningún ancho de escritorio.
    // Se mide lo que se pinta (el contenido), no la caja: con white-space:nowrap el texto puede
    // salirse de una caja que la rejilla ha encogido. Los enlaces cuentan solo en la parte que
    // deja ver el menú (en móvil se desliza).
    // bypassCSP: para medir el ancho se quita un momento, con una hoja en línea, el recorte de las
    // secciones (si no, escondería lo que se salga).
    const ctx = await navegador.newContext({ viewport: { width: 1366, height: 850 }, bypassCSP: true });
    const p = await ctx.newPage();
    await p.goto(BASE + ruta, { waitUntil: 'load' });
    await p.evaluate(() => document.fonts.ready);
    // Además, ningún enlace del menú fuera de la pantalla y, desde 360 px, todos en una línea.
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
      if (a.titulos.length < 8) fuera.push(`solo ${a.titulos.length} títulos de sección`);
      if (fuera.length) desalineados.push(`${ancho}px: marca en ${a.marca}, ${fuera.join(', ')}`);
      if (ancho > 1440) continue;
      const m = await p.evaluate(() => {
        const W = document.documentElement.clientWidth;
        const rs = [...document.querySelectorAll('.menu a')].map(a => a.getBoundingClientRect());
        return { fuera: rs.filter(r => r.left < -0.5 || r.right > W + 0.5).length, lineas: new Set(rs.map(r => Math.round(r.top))).size };
      });
      if (m.fuera || (ancho >= 360 && m.lineas > 1)) cortados.push(`${ancho}px: ${m.fuera} fuera, ${m.lineas} líneas`);
      const s = await p.evaluate(() => {
        const menu = document.querySelector('.menu').getBoundingClientRect();
        const cajas = [...document.querySelectorAll('.marca, .menu a, .idioma, .barra-acciones .boton')].map(el => {
          const caja = el.getBoundingClientRect(), rango = document.createRange();
          rango.selectNodeContents(el);
          const c = rango.getBoundingClientRect();
          let r = { left: Math.min(caja.left, c.left), right: Math.max(caja.right, c.right), top: caja.top, bottom: caja.bottom };
          if (el.closest('.menu')) r = { left: Math.max(r.left, menu.left), right: Math.min(r.right, menu.right), top: r.top, bottom: r.bottom };
          return { r, nombre: el.textContent.trim().slice(0, 20) };
        }).filter(c => c.r.right - c.r.left > 0.5);
        const res = [];
        for (let i = 0; i < cajas.length; i++) for (let j = i + 1; j < cajas.length; j++) {
          const a = cajas[i].r, b = cajas[j].r;
          const x = Math.min(a.right, b.right) - Math.max(a.left, b.left), y = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
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
    console.log(('/' + ruta).padEnd(5), 'página más ancha que la pantalla 320–1440px y 1920px:', anchas.length ? `${anchas.length} anchos, p. ej. ${JSON.stringify(anchas.slice(0, 3))}` : 'nunca');
    console.log(('/' + ruta).padEnd(5), 'marca y títulos alineados 320–1440px y 1920px:', desalineados.length ? `fallan ${desalineados.length} anchos, p. ej. ${JSON.stringify(desalineados.slice(0, 2))}` : 'siempre');
    console.log(('/' + ruta).padEnd(5), 'cabecera 320–1440px solapes:', solapes.length ? `${solapes.length} anchos, p. ej. ${JSON.stringify(solapes.slice(0, 3))}` : 'ninguno');
    console.log(('/' + ruta).padEnd(5), 'menú 320–1440px cortado:', cortados.length ? `${cortados.length} anchos, p. ej. ${JSON.stringify(cortados.slice(0, 3))}` : 'nunca');
    await ctx.close();
  }
  // Visor de la galería, con ratón y con el dedo: abre, cambia de foto, amplía y vuelve, cierra
  // devolviendo el foco a la foto. Las grandes no se descargan hasta abrir el visor.
  for (const ruta of ['', 'en/']) {
    for (const [tipo, opts] of [['ratón', { viewport: { width: 1366, height: 850 } }],
      ['dedo', { viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true }]]) {
      const ctx = await navegador.newContext(opts);
      const p = await ctx.newPage();
      const grandes = [];
      p.on('request', r => { if (r.url().includes('-ampliada-')) grandes.push(r.url()); });
      await p.goto(BASE + ruta, { waitUntil: 'load' });
      await p.locator('.galeria').scrollIntoViewIfNeeded();
      await p.waitForTimeout(600);
      const fallos = [];
      if (grandes.length) fallos.push(`descarga ${grandes.length} grandes sin abrir el visor`);
      const estado = () => p.evaluate(() => {
        const v = document.querySelector('.visor'), m = v && v.querySelector('.visor-marco'), i = v && v.querySelector('.visor-img');
        return v && { abierto: v.open, real: v.classList.contains('real'), cuenta: v.querySelector('.visor-cuenta').textContent,
          cargada: i.complete && i.naturalWidth > 0 && !v.classList.contains('cargando'), fuente: i.currentSrc.split('/').pop(),
          recorre: m.scrollWidth > m.clientWidth + 10, foco: document.activeElement.className };
      });
      const esperar = cond => p.waitForFunction(cond, null, { timeout: 8000 }).then(() => true, () => false);
      const cargada = '(() => { const v = document.querySelector(".visor"); const i = v.querySelector(".visor-img"); return i.complete && i.naturalWidth > 0 && !v.classList.contains("cargando"); })()';
      const pulsar = sel => tipo === 'dedo' ? p.tap(sel) : p.click(sel);
      await pulsar('.foto-ampliar >> nth=0');
      if (!(await esperar(cargada))) fallos.push('la primera foto no carga');
      let e = await estado();
      if (!e || !e.abierto || e.cuenta !== '1 / 5' || !e.fuente.includes('-ampliada-')) fallos.push(`al abrir: ${JSON.stringify(e)}`);
      if (tipo === 'ratón') await p.keyboard.press('ArrowRight'); else await pulsar('.visor-sig');
      await esperar(cargada);
      e = await estado();
      if (e.cuenta !== '2 / 5' || !e.fuente.includes('roca-ampliada')) fallos.push(`siguiente: ${JSON.stringify(e)}`);
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
      console.log(('/' + ruta).padEnd(5), `visor de la galería (${tipo}):`, fallos.length ? fallos.join('; ') : 'bien');
      await ctx.close();
    }
  }
  // Con conexión lenta las fuentes llegan después del primer pintado: el texto no debe empujar
  // la página al cambiar de la fuente de reserva a la buena.
  for (const ruta of ['', 'en/']) {
    const saltos = [];
    for (const ancho of [320, 375, 412, 768, 1100, 1440]) {
      const ctx = await navegador.newContext({ viewport: { width: ancho, height: 800 } });
      await ctx.addInitScript(() => {
        window.__saltos = 0;
        new PerformanceObserver(l => l.getEntries().forEach(e => { if (!e.hadRecentInput) window.__saltos += e.value; }))
          .observe({ type: 'layout-shift', buffered: true });
      });
      const p = await ctx.newPage();
      await p.route(/\.woff2$/, async r => { await new Promise(z => setTimeout(z, 1500)); await r.continue(); });
      await p.goto(BASE + ruta, { waitUntil: 'load' });
      await p.waitForTimeout(800);
      const s = await p.evaluate(() => window.__saltos);
      if (s > 0.02) saltos.push(`${ancho}px: ${s.toFixed(3)}`);
      await ctx.close();
    }
    if (saltos.length) malos++;
    console.log(('/' + ruta).padEnd(5), 'saltos al llegar tarde las fuentes:', saltos.length ? saltos.join(', ') : 'ninguno');
    // Y con conexión normal se pinta con las fuentes propias, no con las de reserva.
    const ctx = await navegador.newContext({ viewport: { width: 412, height: 800 } });
    const p = await ctx.newPage();
    await p.goto(BASE + ruta, { waitUntil: 'load' });
    const cdp = await ctx.newCDPSession(p);
    const { root } = await cdp.send('DOM.getDocument');
    await cdp.send('CSS.enable');
    const faltan = [];
    for (const [sel, esperada] of [['.menu a', 'Barlow Condensed'], ['.marca', 'Anton']]) {
      const { nodeId } = await cdp.send('DOM.querySelector', { nodeId: root.nodeId, selector: sel });
      const familias = (await cdp.send('CSS.getPlatformFontsForNode', { nodeId })).fonts.map(f => f.familyName);
      if (!familias.length || !familias.every(f => f.startsWith(esperada))) faltan.push(`${sel} ${esperada} (se pinta ${familias.join('/') || 'nada'})`);
    }
    if (faltan.length) malos++;
    console.log(('/' + ruta).padEnd(5), 'fuentes propias en pantalla:', faltan.length ? `faltan ${faltan.join(', ')}` : 'sí');
    await ctx.close();
  }
  await navegador.close();
  console.log(malos ? `${malos} casos con problemas` : 'Todo correcto');
  process.exit(malos ? 1 : 0);
})();
