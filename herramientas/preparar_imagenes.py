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

BANNERS = ['evento_caceria']
EMOJIS = ['garra', 'caza', 'nido', 'voz', 'sinmicro', 'carnivoro', 'votacion', 'clips',
          'alfa', 'beta', 'lider', 'veterano', 'miembro', 'recluta', 'aliado', 'normas', 'trofeo']
# Los rangos llevan el color de su rol en Discord y el trofeo es de oro: no pasan a la paleta.
SIN_PALETA = {'alfa', 'beta', 'lider', 'veterano', 'miembro', 'recluta', 'aliado', 'trofeo'}
ROJO_LAVA = 6  # grados; el mismo tono que --ascua en estilos.css
CARACTERES = (''.join(chr(c) for c in range(0x20, 0x7f))
              + 'áéíóúüñÁÉÍÓÚÜÑ¡¿«»–—·‘’“”…➜•ºª€')


def ancho(im, w):
    return im if im.width <= w else im.resize((w, round(im.height * w / im.width)), Image.LANCZOS)


def a_la_paleta(im):
    """El material del clan es cobre y naranja; la web es negra, gris y roja. Lo cálido y apagado
    pasa a gris y lo cálido y vivo (lava, brasas) a rojo, con el mismo brillo."""
    alfa = im.getchannel('A') if im.mode == 'RGBA' else None
    rgb = im.convert('RGB')
    h, s, v = rgb.convert('HSV').split()
    gris = rgb.convert('L').convert('RGB')
    rojo = Image.merge('HSV', (Image.new('L', rgb.size, round(ROJO_LAVA * 255 / 360)), s, v)).convert('RGB')
    viveza = s.point(lambda x: max(0, min(255, round((x / 255 - 0.45) / 0.3 * 255))))
    calido = h.point(lambda x: 255 if x < 32 or x > 241 else 0)
    out = Image.composite(Image.composite(rojo, gris, viveza), rgb, calido)
    if alfa:
        out.putalpha(alfa)
    return out


def webp(im, nombre, q=78):
    im.save(IMG / f'{nombre}.webp', 'WEBP', quality=q, method=6)


def jpg(im, nombre, q=80):
    im.convert('RGB').save(IMG / f'{nombre}.jpg', 'JPEG', quality=q, optimize=True, progressive=True)


def main(origen):
    if not (origen / 'gfx' / 'invitacion.jpg').is_file():
        sys.exit(f'No encuentro gfx/invitacion.jpg en {origen}')
    IMG.mkdir(exist_ok=True)
    FONTS.mkdir(exist_ok=True)

    fondo = a_la_paleta(Image.open(origen / 'gemini' / 'banner_fondo.jpg').convert('RGB'))
    for w in (800, 1600):
        webp(ancho(fondo, w), f'portada-{w}', q=72)
    niebla = ancho(fondo, 480).filter(ImageFilter.GaussianBlur(10))
    webp(ImageEnhance.Brightness(niebla).enhance(0.55), 'atmosfera', q=60)

    inv = a_la_paleta(Image.open(origen / 'gfx' / 'invitacion.jpg').convert('RGB'))
    og = ancho(inv, 1200)
    top = (og.height - 630) // 2
    jpg(og.crop((0, top, 1200, top + 630)), 'og-garra-iberica', q=82)

    for b in BANNERS:
        im = a_la_paleta(Image.open(origen / 'gfx' / f'{b}.jpg').convert('RGB'))
        for w in (800, 1400):
            webp(ancho(im, w), f'{b}-{w}')

    for e in EMOJIS:
        im = ancho(Image.open(origen / 'emoji' / f'gi_{e}.png').convert('RGBA'), 96)
        webp(im if e in SIN_PALETA else a_la_paleta(im), f'emoji-{e}', q=85)

    garra = a_la_paleta(Image.open(origen / 'emoji' / 'gi_garra.png').convert('RGBA'))
    garra.save(WEB / 'favicon.ico', sizes=[(16, 16), (32, 32), (48, 48)])
    tactil = Image.new('RGBA', (180, 180), (13, 13, 13, 255))
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
        # Sin hinting: en pantallas normales (1×) pega el punto de la «i» y la «j» al palo y se
        # leen como «l». Además pesan un 40 % menos. comprobar.py lo vigila.
        opts.hinting = False
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
