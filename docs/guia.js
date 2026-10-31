// Guía de dinosaurios: ordenar y filtrar la comparativa de especies. Sin JavaScript la lista se ve
// entera, en el orden de las fichas, y los selectores no salen.
(() => {
  const caja = document.querySelector('[data-comparar]');
  const lista = document.querySelector('[data-comparar-lista]');
  if (!caja || !lista) return;
  const [orden, dieta, somos] = caja.querySelectorAll('select');
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
    estado.textContent = vistas
      ? caja.dataset.cuenta.replace('{n}', vistas).replace('{total}', filas.length)
      : caja.dataset.ninguna;
  };
  caja.addEventListener('change', poner);
  poner();
  caja.hidden = false;
})();
