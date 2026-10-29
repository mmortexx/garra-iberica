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
  }
  await navegador.close();
  console.log(malos ? `${malos} casos con problemas` : 'Todo correcto');
  process.exit(malos ? 1 : 0);
})();
