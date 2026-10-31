"""Genera las fotos de la galería a partir de las capturas del juego (3439x1439).

Uso: python herramientas/preparar_galeria.py <carpeta con las capturas> [nombre ...]
Con nombres (p. ej. galeria-tarde), solo genera esas fotos y deja las demás como están.
     python herramientas/preparar_galeria.py --compartir
Solo las imágenes para compartir de OG (las que salen al pegar el enlace en Discord o WhatsApp), a
partir de las vistas ampliadas ya generadas; no necesita las capturas.
Solo lee las capturas; escribe docs/img/galeria-*.webp. Ningún recorte toca la marca de agua del
juego (arriba a la derecha). Por cada captura salen dos juegos de ficheros:
- las fotos de la galería, encuadradas en el dinosaurio, con la mejor calidad que cabe en
  PESO_GALERIA (las carga la página);
- la vista ampliada, la captura entera menos la franja de la marca, en varios anchos hasta la
  resolución original (solo se descargan al abrir una foto).
Las capturas de noche salen casi negras: las de ACLARAR se aclaran antes de recortar, canal a canal,
con valor = 255·(v/255)^gamma (gamma por debajo de 1 levanta las sombras sin quemar las luces).
"""
import io
import sys
from pathlib import Path

try:
    from PIL import Image
except ImportError:  # comprobar.py solo lee FOTOS y AMPLIADA_PROPIA, sin Pillow
    Image = None

IMG = Path(__file__).resolve().parent.parent / 'docs' / 'img'
TAMANO = (3439, 1439)
# Zona de la marca de agua «THE ISLE» en las capturas originales: ningún recorte la toca.
MARCA = (3080, 0, 3439, 330)
AMPLIADA = (0, 0, 3080, 1439)
ANCHOS_AMPLIADA = (1600, 2400, 3080)
CALIDAD_AMPLIADA = 78
# Las de mucho follaje pesan más: bajan de calidad hasta caber (máximo de comprobar.py: 750 KB).
PESO_AMPLIADA = 740 * 1024
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
    'galeria-desfiladero': ('Captura de pantalla 2026-10-30 210612.png', (0, 0, 3080, 1439), (800, 1200, 1600)),
    'galeria-colina': ('Captura de pantalla 2026-10-30 210254.png', (0, 200, 3080, 1439), (600, 1000, 1300)),
    'galeria-manada': ('Captura de pantalla 2026-10-30 210318.png', (0, 200, 3080, 1439), (600, 1000, 1300)),
    'galeria-descanso': ('Captura de pantalla 2026-10-30 190521.png', (0, 0, 3080, 1439), (800, 1200, 1600)),
    'galeria-brasas': ('Captura de pantalla 2026-10-30 213422.png', (300, 150, 2900, 1439), (800, 1200, 1600)),
    'galeria-deino-acecho': ('Captura de pantalla 2026-10-31 161713.png', (870, 330, 2980, 1220), (800, 1200, 1600)),
    'galeria-deino-lomo': ('Captura de pantalla 2026-10-31 161859.png', (870, 330, 2980, 1220), (600, 1000, 1300)),
    'galeria-deino-ojos': ('Captura de pantalla 2026-10-31 161902.png', (870, 330, 2980, 1220), (600, 1000, 1300)),
}
ACLARAR = {'galeria-brasas': 0.45}
# Capturas cuya vista ampliada no puede ser la captura entera (chat con nombres de jugadores de otros
# clanes, interfaz, avisos): se amplía el mismo recorte de la galería. comprobar.py lo vigila.
AMPLIADA_PROPIA = {n: FOTOS[n][1] for n in ('galeria-deino-acecho', 'galeria-deino-lomo', 'galeria-deino-ojos')}
# Imagen al compartir cada página (1200x630, JPEG: WhatsApp no enseña WebP). Las demás páginas usan
# og-garra-iberica.jpg (preparar_imagenes.py). página: (fichero, foto, centro horizontal del recorte
# de 0 a 1, texto alternativo en español e inglés). montar_web.py y comprobar.py leen OG.
OG = {
    'galeria': ('og-galeria.jpg', 'galeria-colina', .5,
                'Manada del clan GARRA IBÉRICA en The Isle Evrima: un carnívoro con la skin del clan ruge al cielo en una ladera verde mientras el resto avanza detrás',
                'GARRA IBÉRICA clan pack in The Isle Evrima: a carnivore in the clan skin roars at the sky on a green hillside while the rest move up behind it'),
    'dinosaurios': ('og-dinosaurios.jpg', 'galeria-cuernos', .6,
                    'Un triceratops y un carnívoro con la skin del clan GARRA IBÉRICA junto a una gran roca en The Isle Evrima',
                    'A triceratops and a carnivore in the GARRA IBÉRICA clan skin beside a big rock in The Isle Evrima'),
}
OG_TAMANO = (1200, 630)
PESO_OG = 115 * 1024


def ampliada_de(nombre):
    """(caja, anchos) de la vista ampliada: hasta la resolución de la caja, sin agrandar nunca"""
    caja = AMPLIADA_PROPIA.get(nombre, AMPLIADA)
    ancho = caja[2] - caja[0]
    return caja, tuple(w for w in ANCHOS_AMPLIADA if w < ancho) + (ancho,)


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
        caja_ampliada, anchos_ampliada = ampliada_de(nombre)
        for c in (caja, caja_ampliada):
            if solapa(c, MARCA):
                sys.exit(f'{nombre}: el recorte {c} toca la marca de agua {MARCA}')
        im = im.convert('RGB')
        if nombre in ACLARAR:
            im = im.point([round(255 * (i / 255) ** ACLARAR[nombre]) for i in range(256)] * 3)
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
        ampliada = im.crop(caja_ampliada)
        for w in anchos_ampliada:
            reducida = a_ancho(ampliada, w)
            for calidad in range(CALIDAD_AMPLIADA, 39, -2):
                datos = webp(reducida, calidad)
                if len(datos) <= PESO_AMPLIADA:
                    break
            else:
                sys.exit(f'{nombre}-ampliada-{w}: ni con calidad {calidad} baja de {PESO_AMPLIADA // 1024} KB')
            salida = IMG / f'{nombre}-ampliada-{w}.webp'
            salida.write_bytes(datos)
            print(f'{salida.name}: {len(datos) / 1024:.0f} KB (calidad {calidad})')


def fuente(nombre, tamano):
    """Una fuente de la web (WOFF2) para Pillow, que solo lee TTF/OTF."""
    from PIL import ImageFont
    from fontTools.ttLib import TTFont
    f = TTFont(IMG.parent / 'fonts' / nombre)
    f.flavor = None
    b = io.BytesIO()
    f.save(b)
    b.seek(0)
    return ImageFont.truetype(b, tamano)


def compartir():
    """Las imágenes de OG: la foto recortada a 1200x630, oscurecida abajo, con la garra y el nombre del clan."""
    from PIL import ImageDraw
    ancho, alto = OG_TAMANO
    logo = Image.open(IMG / 'emoji-garra.webp').convert('RGBA')
    nombre, sub = fuente('anton.woff2', 66), fuente('barlow-600.woff2', 30)
    for fichero, foto, centro, _, _ in OG.values():
        caja, anchos = ampliada_de(foto)
        im = Image.open(IMG / f'{foto}-ampliada-{anchos[-1]}.webp').convert('RGB')
        w = round(im.height * ancho / alto)
        if w > im.width:
            sys.exit(f'{foto}: la ampliada es demasiado estrecha para {ancho}x{alto}')
        x0 = min(max(0, round(im.width * centro - w / 2)), im.width - w)
        im = im.crop((x0, 0, x0 + w, im.height)).resize(OG_TAMANO, Image.LANCZOS).convert('RGBA')
        sombra = Image.new('L', (1, alto))
        for y in range(alto):
            sombra.putpixel((0, y), round(215 * max(0, (y - alto * .45) / (alto * .55)) ** 1.6))
        im.alpha_composite(Image.merge('RGBA', [Image.new('L', OG_TAMANO, 0)] * 3 + [sombra.resize(OG_TAMANO)]))
        im.alpha_composite(logo, (48, alto - 48 - 96))
        d = ImageDraw.Draw(im)
        # Alineados por la línea base, a la altura del logo: nombre arriba y juego debajo.
        d.text((48 + 96 + 22, alto - 48 - 38), 'GARRA IBÉRICA', font=nombre, fill=(242, 242, 242), anchor='ls')
        d.text((48 + 96 + 24, alto - 48 - 2), 'THE ISLE EVRIMA', font=sub, fill=(255, 108, 92), anchor='ls')
        im = im.convert('RGB')
        for calidad in range(86, 59, -2):
            b = io.BytesIO()
            im.save(b, 'JPEG', quality=calidad, optimize=True, progressive=True)
            if b.tell() <= PESO_OG:
                break
        else:
            sys.exit(f'{fichero}: ni con calidad {calidad} baja de {PESO_OG // 1024} KB')
        (IMG / fichero).write_bytes(b.getvalue())
        print(f'{fichero}: {b.tell() / 1024:.0f} KB (calidad {calidad})')


if __name__ == '__main__':
    if sys.argv[1:] == ['--compartir']:
        compartir()
        sys.exit()
    if len(sys.argv) < 2 or not Path(sys.argv[1]).is_dir():
        sys.exit(__doc__)
    main(Path(sys.argv[1]), sys.argv[2:])
