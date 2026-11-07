"""Lo que publica GitHub Pages (.github/workflows/pages.yml): los vídeos y, en vez de cada página, un aviso que lleva a
la misma página en la web de verdad.

La web vive en Cloudflare (la dirección del canonical de docs/index.html); GitHub Pages solo hace falta para los
vídeos, que pesan más de lo que Cloudflare deja servir (docs/_redirects los manda allí). Si Pages publicara docs/
entero, los buscadores verían dos webs iguales y podrían quedarse con la de github.io. Cada aviso lleva noindex,
canonical y redirección inmediata; la 404 de Pages manda cualquier otra dirección vieja a su sitio en la web.

Uso: python herramientas/copia_pages.py <carpeta vacía o nueva>
"""
import shutil
import sys
from html import escape
from pathlib import Path

HERRAMIENTAS = Path(__file__).resolve().parent
sys.path.insert(0, str(HERRAMIENTAS))
import guia_dinos  # noqa: E402

DOCS = HERRAMIENTAS.parent / 'docs'
# Dirección de Pages bajo la que cuelga la web (repositorio de proyecto: /<repo>/).
PREFIJO_PAGES = '/garra-iberica/'
AVISO = {'es': ('GARRA IBÉRICA está en', 'Si la página no se abre sola en un momento, sigue este enlace:'),
         'en': ('GARRA IBÉRICA lives at', 'If the page does not open by itself in a moment, follow this link:')}


def destino(nombre, base):
    """Dirección en la web de verdad de la página docs/<nombre>."""
    return base + (nombre[:-len('index.html')] if nombre.endswith('index.html') else nombre)


def aviso(nombre, base):
    url = escape(destino(nombre, base))
    lang = 'en' if nombre.startswith('en/') else 'es'
    titulo, texto = AVISO[lang]
    return '\n'.join([
        '<!doctype html>',
        f'<html lang="{lang}">',
        '<head>',
        '<meta charset="utf-8">',
        '<meta name="viewport" content="width=device-width, initial-scale=1">',
        f'<title>{titulo} {url}</title>',
        '<meta name="robots" content="noindex">',
        f'<link rel="canonical" href="{url}">',
        f'<meta http-equiv="refresh" content="0; url={url}">',
        '</head>',
        '<body>',
        f'<p>{texto} <a href="{url}">{url}</a></p>',
        '</body>',
        '</html>',
        '',
    ])


def aviso_404(base):
    """Cualquier dirección que Pages no tenga: la misma ruta en la web. Solo puede llevar a la web: una ruta como
    //otro.sitio o https://otro.sitio sería otra web, así que si el destino no es de la web se va a la portada."""
    script = (f"const B={base!r},P={PREFIJO_PAGES!r},r=location.pathname;"
              "let q=(r.startsWith(P)?r.slice(P.length):'')+location.search+location.hash,u;"
              "try{u=new URL(q,B)}catch(e){u=new URL(B)}"
              "location.replace(u.origin===new URL(B).origin?u.href:B)")
    url = escape(base)
    return '\n'.join([
        '<!doctype html>',
        '<html lang="es">',
        '<head>',
        '<meta charset="utf-8">',
        '<meta name="viewport" content="width=device-width, initial-scale=1">',
        f'<title>GARRA IBÉRICA · {url}</title>',
        '<meta name="robots" content="noindex">',
        f'<script>{script}</script>',
        '</head>',
        '<body>',
        f'<p>{AVISO["es"][0]} <a href="{url}">{url}</a></p>',
        f'<p lang="en">{AVISO["en"][0]} <a href="{url}">{url}</a></p>',
        '</body>',
        '</html>',
        '',
    ])


def montar(docs=DOCS):
    """{ruta en Pages: texto (str) o fichero que se copia tal cual (Path)}. No escribe nada."""
    base = guia_dinos.base_web(docs)
    salida = {}
    for f in sorted(docs.rglob('*.html')):
        nombre = f.relative_to(docs).as_posix()
        salida[nombre] = aviso_404(base) if nombre == '404.html' else aviso(nombre, base)
    videos = sorted((docs / 'video').glob('*.mp4'))
    if not videos:
        sys.exit(f'{docs / "video"}: no hay vídeos que publicar')
    for v in videos:
        salida[f'video/{v.name}'] = v
    return salida


def main(carpeta):
    carpeta = Path(carpeta)
    if carpeta.exists() and any(carpeta.iterdir()):
        sys.exit(f'{carpeta} no está vacía')
    for nombre, contenido in montar().items():
        fichero = carpeta / nombre
        fichero.parent.mkdir(parents=True, exist_ok=True)
        if isinstance(contenido, Path):
            shutil.copyfile(contenido, fichero)
        else:
            fichero.write_bytes(contenido.encode('utf-8'))
    print(f'{carpeta}: {sum(1 for p in carpeta.rglob("*") if p.is_file())} ficheros para GitHub Pages')


if __name__ == '__main__':
    sys.stdout.reconfigure(encoding='utf-8')
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    main(sys.argv[1])
