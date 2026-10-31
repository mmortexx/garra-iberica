"""Prueba de preparar_galeria.py: qué capturas acepta y qué recortes rechaza. No necesita Pillow
ni las capturas.

Uso: python herramientas/prueba_galeria.py
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import preparar_galeria as g  # noqa: E402

sys.stdout.reconfigure(encoding='utf-8')

CASOS = [
    # (nombre, foto, medidas de la captura, recorte, ¿vale?)
    ('captura normal', 'galeria-deino-guardia', (3439, 1439), (0, 0, 3080, 1439), True),
    ('captura más baja con su alto en ALTO', 'galeria-deino-fila', (3439, 1391), (0, 0, 3080, 1391), True),
    ('recorte que pasa del alto real', 'galeria-deino-fila', (3439, 1391), (0, 0, 3080, 1439), False),
    ('captura baja sin estar en ALTO', 'galeria-deino-guardia', (3439, 1391), (0, 0, 3080, 1391), False),
    ('otro ancho', 'galeria-deino-guardia', (3000, 1439), (0, 0, 2900, 1439), False),
    ('recorte que toca la marca de agua', 'galeria-deino-guardia', (3439, 1439), (0, 0, 3200, 1439), False),
    ('recorte al revés', 'galeria-deino-guardia', (3439, 1439), (3000, 0, 100, 1439), False),
]

fallos = 0
for titulo, foto, tamano, caja, vale in CASOS:
    caja_ampliada, _ = g.ampliada_de(foto)
    hay = g.problemas(foto, tamano, caja, caja_ampliada if vale else caja)
    if (not hay) == vale:
        print('ok   ', titulo)
    else:
        fallos += 1
        print('FALLO', titulo, '→', hay or 'lo acepta y no debería')

# La vista ampliada de la captura baja llega a su alto real, no a 1439.
ampliada = g.ampliada_de('galeria-deino-fila')[0]
if ampliada == (0, 0, 3080, 1391) and g.ampliada_de('galeria-deino-guardia')[0] == g.AMPLIADA:
    print('ok    ampliada de la captura baja con su alto real')
else:
    fallos += 1
    print('FALLO ampliada de la captura baja →', ampliada)
# Cada foto de la lista cabe en su captura con las medidas que se esperan de ella.
for foto, (_, caja, _) in g.FOTOS.items():
    hay = g.problemas(foto, (g.ANCHO, g.ALTO.get(foto, 1439)), caja, g.ampliada_de(foto)[0])
    if hay:
        fallos += 1
        print('FALLO', foto, '→', hay)

print(f'{fallos} fallos' if fallos else f'Todo correcto ({len(CASOS) + 1} casos y {len(g.FOTOS)} fotos)')
sys.exit(1 if fallos else 0)
