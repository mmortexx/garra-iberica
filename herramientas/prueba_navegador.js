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
        };
      });
      if (r.ocultos || errores.length) malos++;
      console.log(('/' + ruta).padEnd(5), nombre.padEnd(20), JSON.stringify(r), 'errores:', JSON.stringify(errores));
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
    const anchos = [1100, 1170];
    for (let w = 1000; w <= 1440; w += 5) anchos.push(w);
    const solapes = [];
    for (const ancho of anchos) {
      await p.setViewportSize({ width: ancho, height: 850 });
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
    console.log(('/' + ruta).padEnd(5), 'cabecera 1000–1440px solapes:', solapes.length ? `${solapes.length} anchos, p. ej. ${JSON.stringify(solapes.slice(0, 3))}` : 'ninguno');
    await ctx.close();
  }
  await navegador.close();
  console.log(malos ? `${malos} casos con problemas` : 'Todo correcto');
  process.exit(malos ? 1 : 0);
})();
