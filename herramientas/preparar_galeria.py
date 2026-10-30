"""Genera las fotos de la galería a partir de las capturas del juego (3439x1439).

Uso: python herramientas/preparar_galeria.py <carpeta con las capturas> [nombre ...]
Con nombres (p. ej. galeria-tarde), solo genera esas fotos y deja las demás como están.
Solo lee las capturas; escribe docs/img/galeria-*.webp. Ningún recorte toca la marca de agua del
juego (arriba a la derecha). Por cada captura salen dos juegos de ficheros:
- las fotos de la galería, encuadradas en el dinosaurio, con la mejor calidad que cabe en
  PESO_GALERIA (las carga la página);
- la vista ampliada, la captura entera menos la franja de la marca, en varios anchos hasta la
  resolución original (solo se descargan al abrir una foto).
"""
import io
import sys
from pathlib import Path

from PIL import Image

IMG = Path(__file__).resolve().parent.parent / 'docs' / 'img'
TAMANO = (3439, 1439)
# Zona de la marca de agua «THE ISLE» en las capturas originales: ningún recorte la toca.
MARCA = (3080, 0, 3439, 330)
AMPLIADA = (0, 0, 3080, 1439)
ANCHOS_AMPLIADA = (1600, 2400, 3080)
CALIDAD_AMPLIADA = 78
# Por debajo del máximo de comprobar.py (120 KB) con algo de margen.
PESO_GALERIA = 115 * 1024
CALIDADES = range(90, 59, -2)
# nombre: (captura, recorte (x0, y0, x1, y1), anchos a generar)
FOTOS = {
    'galeria-cielo': ('Captura de pantalla 2026-10-30 120745.png', (200, 0, 3078, 1439), (600, 1000, 1500)),
    'galeria-roca': ('Captura de pantalla 2026-10-30 120711.png', (1000, 0, 2439, 1439), (400, 800)),
    'galeria-bosque': ('Captura de pantalla 2026-10-30 120523.png', (820, 0, 2739, 1439), (400, 800)),
    'galeria-rugido': ('Captura de pantalla 2026-10-30 120652.png', (500, 0, 2419, 1439), (400, 800)),
    'galeria-valle': ('Captura de pantalla 2026-10-30 120933.png', (800, 0, 2719, 1439), (400, 800)),
    'galeria-charca': ('Captura de pantalla 2026-10-30 144319.png', (1221, 330, 3439, 1439), (600, 1000, 1500)),
    'galeria-secuoyas': ('Captura de pantalla 2026-10-30 144346.png', (1221, 330, 3439, 1439), (600, 1000, 1500)),
    'galeria-pareja': ('Captura de pantalla 2026-10-30 144646.png', (430, 330, 2648, 1439), (600, 1000, 1300)),
    'galeria-espesura': ('Captura de pantalla 2026-10-30 144625.png', (1221, 330, 3439, 1439), (600, 1000, 1500)),
    'galeria-noche': ('Captura de pantalla 2026-10-30 145144.png', (0, 150, 3080, 1439), (800, 1200, 1600)),
    'galeria-tarde': ('Captura de pantalla 2026-10-30 175817.png', (560, 200, 3080, 1439), (600, 1000, 1300)),
    'galeria-cuernos': ('Captura de pantalla 2026-10-30 175839.png', (500, 40, 3080, 1439), (600, 1000, 1300)),
    'galeria-desfiladero': ('Captura de pantalla 2026-10-30 210612.png', (0, 150, 3080, 1439), (800, 1200, 1600)),
    'galeria-colina': ('Captura de pantalla 2026-10-30 210254.png', (200, 0, 3078, 1439), (600, 1000, 1300)),
    'galeria-manada': ('Captura de pantalla 2026-10-30 210318.png', (202, 0, 3080, 1439), (600, 1000, 1300)),
    'galeria-descanso': ('Captura de pantalla 2026-10-30 190521.png', (0, 0, 3080, 1439), (800, 1200, 1600)),
}


def solapa(a, b):
    return a[0] < b[2] and b[0] < a[2] and a[1] < b[3] and b[1] < a[3]


def a_ancho(im, w):
    return im.resize((w, round(im.height * w / im.width)), Image.LANCZOS)


def webp(im, calidad):
    b = io.BytesIO()
    im.save(b, 'WEBP', quality=calidad, method=6)
    return b.getvalue()


def main(origen, nombres):
    desconocidas = set(nombres) - set(FOTOS)
    if desconocidas:
        sys.exit(f'No hay ninguna foto llamada {", ".join(sorted(desconocidas))}; las hay: {", ".join(FOTOS)}')
    for nombre, (fichero, caja, anchos) in FOTOS.items():
        if nombres and nombre not in nombres:
            continue
        im = Image.open(origen / fichero)
        if im.size != TAMANO:
            sys.exit(f'{fichero} mide {im.size}, no {TAMANO}: revisa los recortes')
        for c in (caja, AMPLIADA):
            if solapa(c, MARCA):
                sys.exit(f'{nombre}: el recorte {c} toca la marca de agua {MARCA}')
        im = im.convert('RGB')
        recorte = im.crop(caja)
        for w in anchos:
            reducida = a_ancho(recorte, w)
            for calidad in CALIDADES:
                datos = webp(reducida, calidad)
                if len(datos) <= PESO_GALERIA:
                    break
            else:
                sys.exit(f'{nombre}-{w}: ni con calidad {calidad} baja de {PESO_GALERIA // 1024} KB')
            salida = IMG / f'{nombre}-{w}.webp'
            salida.write_bytes(datos)
            print(f'{salida.name}: {len(datos) / 1024:.0f} KB (calidad {calidad})')
        ampliada = im.crop(AMPLIADA)
        for w in ANCHOS_AMPLIADA:
            salida = IMG / f'{nombre}-ampliada-{w}.webp'
            salida.write_bytes(webp(a_ancho(ampliada, w), CALIDAD_AMPLIADA))
            print(f'{salida.name}: {salida.stat().st_size / 1024:.0f} KB')


if __name__ == '__main__':
    if len(sys.argv) < 2 or not Path(sys.argv[1]).is_dir():
        sys.exit(__doc__)
    main(Path(sys.argv[1]), sys.argv[2:])
