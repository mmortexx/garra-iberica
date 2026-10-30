// Prueba la web en un navegador real: contenido visible con y sin JavaScript y con «reducir
// movimiento», sin errores en consola, y ningún texto cortado en móviles de 320 a 412 px.
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
    const ctx = await navegador.newContext({ viewport: { width: 1366, height: 850 } });
    const p = await ctx.newPage();
    await p.goto(BASE + ruta, { waitUntil: 'load' });
    await p.evaluate(() => document.fonts.ready);
    // Además, ningún enlace del menú fuera de la pantalla y, desde 360 px, todos en una línea.
    const anchos = [];
    for (let w = 320; w <= 1440; w += 5) anchos.push(w);
    const solapes = [], cortados = [];
    for (const ancho of anchos) {
      await p.setViewportSize({ width: ancho, height: 850 });
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
    console.log(('/' + ruta).padEnd(5), 'cabecera 320–1440px solapes:', solapes.length ? `${solapes.length} anchos, p. ej. ${JSON.stringify(solapes.slice(0, 3))}` : 'ninguno');
    console.log(('/' + ruta).padEnd(5), 'menú 320–1440px cortado:', cortados.length ? `${cortados.length} anchos, p. ej. ${JSON.stringify(cortados.slice(0, 3))}` : 'nunca');
    await ctx.close();
  }
  await navegador.close();
  console.log(malos ? `${malos} casos con problemas` : 'Todo correcto');
  process.exit(malos ? 1 : 0);
})();
