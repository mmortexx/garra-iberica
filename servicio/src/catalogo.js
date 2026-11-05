// Qué logros existen y cuántos tramos tiene cada uno. Sale de la misma lista que la página: una sola fuente.
import lista from '../../herramientas/logros.json' with { type: 'json' };

function calcular() {
  const m = new Map();
  for (const e of lista.especies) {
    m.set(`${e.id}-exp`, 1);
    m.set(`${e.id}-grow`, 4);
    m.set(`${e.id}-prime`, 1);
    e.cazas.forEach((c, i) => m.set(`${e.id}-h${i}`, c.tramos.length));
    m.set(`${e.id}-add`, e.horas.length);
    if (e.fauna) m.set(`${e.id}-unl`, 1);
  }
  for (const h of lista.huellas) m.set(`f-${h.codigo}`, 1);
  for (const p of lista.puertas) m.set(`g-${p.codigo.replace(' ', '-')}`, 1);
  lista.muertes.especies.forEach((_, i) => m.set(`fed-${i}`, lista.muertes.tramos.length));
  m.set('addict', lista.horas_totales.length);
  return m;
}

export const MAXIMOS = calcular();
