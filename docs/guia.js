// Guía de dinosaurios: ordenar y filtrar la comparativa de especies. Sin JavaScript la lista se ve
// entera, en el orden de las fichas, y los selectores no salen. Lo elegido va en la dirección
// (?orden=peso&dieta=herbivoros&grupo=5#comparar) para poder pasar el enlace ya filtrado. Con
// &marca=triceratops, la página de una especie enseña dónde queda esa especie en la lista.
(() => {
  // Las fichas van plegadas: un enlace a una (dinosaurios/#triceratops) la abre.
  const abrirFicha = () => {
    const destino = location.hash && document.getElementById(location.hash.slice(1));
    if (destino && destino.matches('details')) { destino.open = true; destino.scrollIntoView(); }
  };
  addEventListener('hashchange', abrirFicha);
  abrirFicha();

  const caja = document.querySelector('[data-comparar]');
  const lista = document.querySelector('[data-comparar-lista]');
  if (!caja || !lista) return;
  const [orden, dieta, somos] = caja.querySelectorAll('select');
  const campos = { orden, dieta, grupo: somos };
  const estado = caja.querySelector('[role="status"]');
  const filas = [...lista.children];
  const abc = new Intl.Collator(document.documentElement.lang);
  const criterios = {
    fichas: (a, b) => filas.indexOf(a) - filas.indexOf(b),
    peso: (a, b) => b.dataset.peso - a.dataset.peso,
    crece: (a, b) => a.dataset.crece - b.dataset.crece,
    grupo: (a, b) => b.dataset.grupo - a.dataset.grupo,
    nombre: () => 0,
  };
  const poner = () => {
    const criterio = criterios[orden.value] || criterios.fichas;
    const ordenadas = [...filas].sort((a, b) => criterio(a, b) || abc.compare(a.dataset.nombre, b.dataset.nombre));
    let vistas = 0;
    for (const f of ordenadas) {
      const ve = (dieta.value === 'todas' || f.dataset.dieta === dieta.value) && +f.dataset.grupo >= +somos.value;
      f.hidden = !ve;
      vistas += ve;
    }
    lista.append(...ordenadas);
    lista.parentElement.dataset.orden = orden.value;
    estado.textContent = vistas
      ? caja.dataset.recuento.replace('{n}', vistas).replace('{total}', filas.length)
      : caja.dataset.ninguna;
  };
  // De la dirección, solo valores que existen en su selector; lo demás se ignora.
  const pedidos = new URLSearchParams(location.search);
  for (const [nombre, sel] of Object.entries(campos)) {
    const v = pedidos.get(nombre);
    if (v !== null && [...sel.options].some(o => o.value === v)) sel.value = v;
  }
  const marcada = filas.find(f => f.querySelector('a').pathname.endsWith(`/${pedidos.get('marca')}/`));
  caja.addEventListener('change', () => {
    poner();
    const url = new URL(location.href);
    url.searchParams.delete('marca');
    for (const [nombre, sel] of Object.entries(campos)) {
      if (sel.selectedIndex) url.searchParams.set(nombre, sel.value); else url.searchParams.delete(nombre);
    }
    url.hash = caja.closest('section').id;
    history.replaceState(history.state, '', url);
  });
  poner();
  caja.hidden = false;
  if (marcada) {
    marcada.classList.add('marcada');
    // Al terminar de cargar: antes, el navegador aún saltaría al ancla de la dirección.
    const irAella = () => { if (!marcada.hidden) marcada.scrollIntoView({ block: 'center', behavior: 'instant' }); };
    if (document.readyState === 'complete') irAella(); else addEventListener('load', irAella, { once: true });
  }
})();
