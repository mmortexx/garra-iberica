"""Genera las imágenes y fuentes ligeras de la web a partir del material del clan.

Uso: python herramientas/preparar_imagenes.py <carpeta garra-iberica>
Solo lee la carpeta de origen; escribe en docs/img/ y docs/fonts/ de este proyecto.
"""
import sys
from pathlib import Path

from PIL import Image, ImageEnhance, ImageFilter
from fontTools import subset

WEB = Path(__file__).resolve().parent.parent / 'docs'
IMG = WEB / 'img'
FONTS = WEB / 'fonts'

BANNERS = ['bienvenida', 'normas', 'rangos', 'evento_caceria']
EMOJIS = ['garra', 'caza', 'nido', 'voz', 'sinmicro', 'carnivoro', 'votacion', 'clips',
          'alfa', 'beta', 'lider', 'veterano', 'miembro', 'recluta', 'aliado', 'normas', 'trofeo']
CARACTERES = (''.join(chr(c) for c in range(0x20, 0x7f))
              + 'áéíóúüñÁÉÍÓÚÜÑ¡¿«»–—·‘’“”…➜•ºª€')


def ancho(im, w):
    return im if im.width <= w else im.resize((w, round(im.height * w / im.width)), Image.LANCZOS)


def webp(im, nombre, q=78):
    im.save(IMG / f'{nombre}.webp', 'WEBP', quality=q, method=6)


def jpg(im, nombre, q=80):
    im.convert('RGB').save(IMG / f'{nombre}.jpg', 'JPEG', quality=q, optimize=True, progressive=True)


def main(origen):
    if not (origen / 'gfx' / 'invitacion.jpg').is_file():
        sys.exit(f'No encuentro gfx/invitacion.jpg en {origen}')
    IMG.mkdir(exist_ok=True)
    FONTS.mkdir(exist_ok=True)

    fondo = Image.open(origen / 'gemini' / 'banner_fondo.jpg').convert('RGB')
    for w in (800, 1600):
        webp(ancho(fondo, w), f'portada-{w}', q=72)
    niebla = ancho(fondo, 480).filter(ImageFilter.GaussianBlur(10))
    webp(ImageEnhance.Brightness(niebla).enhance(0.55), 'atmosfera', q=60)

    inv = Image.open(origen / 'gfx' / 'invitacion.jpg').convert('RGB')
    og = ancho(inv, 1200)
    top = (og.height - 630) // 2
    jpg(og.crop((0, top, 1200, top + 630)), 'og-garra-iberica', q=82)

    for b in BANNERS:
        im = Image.open(origen / 'gfx' / f'{b}.jpg').convert('RGB')
        for w in (800, 1400):
            webp(ancho(im, w), f'{b}-{w}')

    for e in EMOJIS:
        webp(ancho(Image.open(origen / 'emoji' / f'gi_{e}.png'), 96), f'emoji-{e}', q=85)

    garra = Image.open(origen / 'emoji' / 'gi_garra.png').convert('RGBA')
    garra.save(WEB / 'favicon.ico', sizes=[(16, 16), (32, 32), (48, 48)])
    tactil = Image.new('RGBA', (180, 180), (18, 12, 8, 255))
    tactil.alpha_composite(garra.resize((160, 160), Image.LANCZOS), (10, 10))
    tactil.convert('RGB').save(WEB / 'apple-touch-icon.png', optimize=True)

    ofl = (origen / 'fonts' / 'fontsource-metal-mania-5.3.0' / 'package' / 'LICENSE').read_text(encoding='utf-8')
    avisos = []
    for ttf, salida in (('anton.ttf', 'anton'), ('barlow-600.ttf', 'barlow-600')):
        nombres = subset.load_font(str(origen / 'fonts' / ttf), subset.Options())['name']
        avisos.append(f'{salida}.woff2 (subconjunto de {ttf}): {nombres.getDebugName(0)}')
        opts = subset.Options()
        opts.flavor = 'woff2'
        opts.layout_features = ['kern', 'liga']
        f = subset.load_font(str(origen / 'fonts' / ttf), opts)
        s = subset.Subsetter(opts)
        s.populate(text=CARACTERES)
        s.subset(f)
        subset.save_font(f, str(FONTS / f'{salida}.woff2'), opts)
    (FONTS / 'LICENCIA-OFL.txt').write_text(
        '\n'.join(avisos) + '\n\nAmbas fuentes se distribuyen bajo la SIL Open Font License 1.1:\n\n'
        + ofl[ofl.index('This Font Software is licensed'):], encoding='utf-8')

    for p in sorted(list(IMG.iterdir()) + list(FONTS.glob('*.woff2'))):
        extra = ''
        if p.suffix in ('.webp', '.jpg', '.png'):
            with Image.open(p) as im:
                extra = f'{im.width}x{im.height}'
        print(f'{p.relative_to(WEB)}\t{p.stat().st_size // 1024} KB\t{extra}')


if __name__ == '__main__':
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    main(Path(sys.argv[1]))
