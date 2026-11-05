"""Convierte una respuesta real de Nexus (achievements/api/list) en nexus_muestra.json.

El repositorio es público, y lo que da Nexus solo se ve tras entrar en él. Por eso se copia únicamente lo que el importador
lee: el nombre del servidor y, de cada logro, su categoría, su nombre y el objetivo de cada tramo. Premios, descripciones,
ids y cualquier campo que Nexus añada mañana se quedan fuera sin tener que nombrarlos. Lo que depende de quien la pidió
se sustituye por un progreso de ejemplo que sale solo de la posición de cada logro.

Por eso limpiar la muestra la deja igual: prueba_logros.py lo exige, y así una respuesta subida sin limpiar no pasa.

Cuándo: si Nexus cambia sus logros. Uso: python herramientas/limpiar_muestra_nexus.py <respuesta.json>
"""
import json
from pathlib import Path
import sys

MUESTRA = Path(__file__).resolve().parent / 'nexus_muestra.json'
CRECER = [f'Growth {p}' for p in ('1%', '50%', '80%', '100%')]


def _tramos_hechos(logro, c, j):
    """Cuántos tramos lleva el logro de ejemplo: el crecimiento va siempre en orden, como en Nexus."""
    n = len(logro['conditions'])
    if logro['name'] in CRECER:
        return int(CRECER.index(logro['name']) < c % 5)
    return [0, min(1, n), n][(c + j) % 3]


def limpiar(respuesta):
    categorias = sorted({x['category_path'] for x in respuesta['achievements']})
    vistos = {}
    logros = []
    for x in respuesta['achievements']:
        c = categorias.index(x['category_path'])
        j = vistos[c] = vistos.get(c, -1) + 1
        hechos = _tramos_hechos(x, c, j)
        logros.append({
            'category_path': x['category_path'],
            'name': x['name'],
            'conditions': [{'target': t['target'], 'done': i < hechos} for i, t in enumerate(x['conditions'])],
        })
    return {'server': {'name': respuesta['server']['name']}, 'achievements': logros}


def main():
    respuesta = json.loads(Path(sys.argv[1]).read_text(encoding='utf-8'))
    MUESTRA.write_text(json.dumps(limpiar(respuesta), ensure_ascii=False) + '\n', encoding='utf-8', newline='\n')
    print(f'{MUESTRA.name}: {len(respuesta["achievements"])} logros, {MUESTRA.stat().st_size} bytes')


if __name__ == '__main__':
    main()
