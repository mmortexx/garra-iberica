"""Prueba de preparar_galeria.py: qué capturas acepta y qué recortes rechaza. No necesita Pillow
ni las capturas.

Uso: python herramientas/prueba_galeria.py
"""
import json
import sys
import tempfile
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
    ('imagen propia con sus medidas', 'galeria-manada-atardecer', (1672, 941), (0, 0, 1672, 941), True),
    ('imagen propia con otras medidas', 'galeria-manada-atardecer', (3439, 1439), (0, 0, 1672, 941), False),
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
# Una imagen propia se amplía hasta su ancho original, entera y sin agrandarla.
propia = g.ampliada_de('galeria-manada-atardecer')
if propia == ((0, 0, 1672, 941), (1600, 1672)):
    print('ok    ampliada de la imagen propia hasta su ancho')
else:
    fallos += 1
    print('FALLO ampliada de la imagen propia →', propia)
# Ninguna foto se agranda: un ancho mayor que su recorte se rechaza.
g.FOTOS['prueba-pequena'] = ('x.png', (0, 0, 1000, 500), (800, 1200))
if g.problemas('prueba-pequena', (3439, 1439), (0, 0, 1000, 500), (0, 0, 1000, 500)):
    print('ok    no deja agrandar una foto')
else:
    fallos += 1
    print('FALLO deja agrandar una foto: 1200 de ancho con un recorte de 1000')
del g.FOTOS['prueba-pequena']
# Con «carpeta» en fotos.json, el original sale de ahí; sin ella, de la carpeta de capturas.
with tempfile.TemporaryDirectory() as t:
    proyecto = Path(t)
    (proyecto / 'galeria').mkdir()
    fotos = proyecto / 'galeria' / 'fotos.json'
    fotos.write_text(json.dumps({'fotos': [{'archivo': 'a.png', 'carpeta': 'galeria/originales'}, {'archivo': 'b.png'}]}), encoding='utf-8')
    capturas = proyecto / 'capturas'
    rutas = [g.original(capturas, 'a.png', fotos), g.original(capturas, 'b.png', fotos), g.original(capturas, 'b.png', proyecto / 'no-existe.json')]
    if rutas == [proyecto / 'galeria' / 'originales' / 'a.png', capturas / 'b.png', capturas / 'b.png']:
        print('ok    el original sale de la carpeta de fotos.json')
    else:
        fallos += 1
        print('FALLO de dónde sale el original →', rutas)
# Cada foto de la lista cabe en su captura con las medidas que se esperan de ella.
for foto, (_, caja, _) in g.FOTOS.items():
    hay = g.problemas(foto, g.medidas(foto), caja, g.ampliada_de(foto)[0])
    if hay:
        fallos += 1
        print('FALLO', foto, '→', hay)

print(f'{fallos} fallos' if fallos else f'Todo correcto ({len(CASOS) + 4} casos y {len(g.FOTOS)} fotos)')
sys.exit(1 if fallos else 0)
