"""Genera las fotos de la galería a partir de las capturas del juego (3439x1439).

Uso: python herramientas/preparar_galeria.py <carpeta con las capturas>
Solo lee las capturas; escribe docs/img/galeria-*.webp. Los recortes dejan fuera la marca de agua
del juego (arriba a la derecha) y encuadran al dinosaurio.
"""
import sys
from pathlib import Path

from PIL import Image

IMG = Path(__file__).resolve().parent.parent / 'docs' / 'img'
TAMANO = (3439, 1439)
# Zona de la marca de agua «THE ISLE» en las capturas originales: ningún recorte la toca.
MARCA = (3080, 0, 3439, 330)
# nombre: (captura, recorte (x0, y0, x1, y1), anchos a generar)
FOTOS = {
    'galeria-cielo': ('Captura de pantalla 2026-10-30 120745.png', (200, 0, 3078, 1439), (600, 1000, 1500)),
    'galeria-roca': ('Captura de pantalla 2026-10-30 120711.png', (1000, 0, 2439, 1439), (400, 800)),
    'galeria-bosque': ('Captura de pantalla 2026-10-30 120523.png', (820, 0, 2739, 1439), (400, 800)),
    'galeria-rugido': ('Captura de pantalla 2026-10-30 120652.png', (500, 0, 2419, 1439), (400, 800)),
    'galeria-valle': ('Captura de pantalla 2026-10-30 120933.png', (800, 0, 2719, 1439), (400, 800)),
}


def solapa(a, b):
    return a[0] < b[2] and b[0] < a[2] and a[1] < b[3] and b[1] < a[3]


def main(origen):
    for nombre, (fichero, caja, anchos) in FOTOS.items():
        im = Image.open(origen / fichero)
        if im.size != TAMANO:
            sys.exit(f'{fichero} mide {im.size}, no {TAMANO}: revisa los recortes')
        if solapa(caja, MARCA):
            sys.exit(f'{nombre}: el recorte {caja} toca la marca de agua {MARCA}')
        recorte = im.convert('RGB').crop(caja)
        for w in anchos:
            salida = IMG / f'{nombre}-{w}.webp'
            recorte.resize((w, round(recorte.height * w / recorte.width)), Image.LANCZOS).save(
                salida, 'WEBP', quality=68, method=6)
            print(f'{salida.name}: {salida.stat().st_size / 1024:.0f} KB')


if __name__ == '__main__':
    if len(sys.argv) != 2 or not Path(sys.argv[1]).is_dir():
        sys.exit(__doc__)
    main(Path(sys.argv[1]))
