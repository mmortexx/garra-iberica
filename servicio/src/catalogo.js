// Qué logros existen y cuántos tramos tiene cada uno. Sale de la misma lista que la página: una sola fuente.
import lista from '../../herramientas/logros.json' with { type: 'json' };

// Los ids no dependen del orden de la lista: la cacería es especie-h-tipo y la muerte, fed-especie.
export function calcular(lista) {
  const m = new Map();
  const porNombre = new Map(lista.especies.map(e => [e.nombre, e]));
  for (const e of lista.especies) {
    m.set(`${e.id}-exp`, 1);
    m.set(`${e.id}-grow`, 4);
    m.set(`${e.id}-prime`, 1);
    for (const c of e.cazas) {
      const id = `${e.id}-h-${c.tipo}`;
      if (m.has(id)) throw new Error(`logros.json: ${e.id} tiene dos cacerías repetidas de tipo ${c.tipo}`);
      m.set(id, c.tramos.length);
    }
    m.set(`${e.id}-add`, e.horas.length);
    if (e.fauna) m.set(`${e.id}-unl`, 1);
  }
  for (const h of lista.huellas) m.set(`f-${h.codigo}`, 1);
  for (const p of lista.puertas) m.set(`g-${p.codigo.replace(' ', '-')}`, 1);
  for (const nombre of lista.muertes.especies) {
    if (!porNombre.has(nombre)) throw new Error(`logros.json: «${nombre}» de muertes.especies no es una especie`);
    m.set(`fed-${porNombre.get(nombre).id}`, lista.muertes.tramos.length);
  }
  m.set('addict', lista.horas_totales.length);
  return m;
}

export const MAXIMOS = calcular(lista);
