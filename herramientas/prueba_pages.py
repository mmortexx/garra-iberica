"""Prueba de lo que publica GitHub Pages (copia_pages.py): solo los vídeos y avisos noindex que llevan a la web.

Uso: python herramientas/prueba_pages.py   (necesita node en el PATH para probar la 404)
"""
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path
from urllib.parse import urlsplit

sys.path.insert(0, str(Path(__file__).resolve().parent))
import copia_pages  # noqa: E402
import guia_dinos  # noqa: E402

sys.stdout.reconfigure(encoding='utf-8')

DOCS = copia_pages.DOCS
BASE = guia_dinos.base_web(DOCS)
fallos = 0


def prueba(nombre, comprobar_algo):
    global fallos
    try:
        comprobar_algo()
        print('ok   ', nombre)
    except Exception as e:
        fallos += 1
        print('FALLO', nombre, '→', f'{type(e).__name__}: {e}')


SALIDA = copia_pages.montar()
PAGINAS = sorted(f.relative_to(DOCS).as_posix() for f in DOCS.rglob('*.html'))


def solo_videos_y_avisos():
    # Todo lo que haya en docs/video, sea lo que sea: Cloudflare no sirve esa carpeta.
    videos = {Path(d, f).relative_to(DOCS).as_posix() for d, _, fs in os.walk(DOCS / 'video') for f in fs}
    assert videos, 'docs/video sin vídeos'
    sobran = set(SALIDA) - videos - set(PAGINAS)
    assert not sobran, f'Pages publicaría además {sorted(sobran)}'
    faltan = (videos | set(PAGINAS)) - set(SALIDA)
    assert not faltan, f'Pages no publicaría {sorted(faltan)}'
    for v in videos:
        assert SALIDA[v] == DOCS / v, f'{v} no se copia tal cual de docs/'


def cada_pagina_es_un_aviso():
    for nombre in PAGINAS:
        if nombre == '404.html':
            continue
        html = SALIDA[nombre]
        url = BASE + nombre.removesuffix('index.html')
        assert '<meta name="robots" content="noindex">' in html, f'{nombre}: el aviso no lleva noindex'
        assert re.findall(r'<link rel="canonical" href="([^"]+)">', html) == [url], f'{nombre}: canonical distinto de {url}'
        assert re.findall(r'<meta http-equiv="refresh" content="0; url=([^"]+)">', html) == [url], f'{nombre}: no redirige al momento a {url}'
        assert f'<a href="{url}">' in html, f'{nombre}: sin enlace visible a {url}'
        lang = 'en' if nombre.startswith('en/') else 'es'
        assert f'<html lang="{lang}">' in html, f'{nombre}: idioma distinto de {lang}'
        # Ni una palabra de la página de verdad: si no, seguiría habiendo contenido duplicado.
        real = (DOCS / nombre).read_text(encoding='utf-8')
        h1 = re.search(r'<h1[^>]*>(.*?)</h1>', real, re.S)
        assert '<main' not in html and (not h1 or h1.group(1) not in html), f'{nombre}: el aviso copia contenido de la página'


def a_donde_lleva_la_404(ruta):
    """Ejecuta el script de la 404 de Pages con location en `ruta` y devuelve a dónde manda."""
    script = re.search(r'<script>(.*?)</script>', SALIDA['404.html'], re.S).group(1)
    partes = urlsplit(ruta)
    busqueda, ancla = ('?' + partes.query if partes.query else ''), ('#' + partes.fragment if partes.fragment else '')
    falso = (f'let destino;const location={{pathname:{json.dumps(partes.path)},search:{json.dumps(busqueda)},'
             f'hash:{json.dumps(ancla)},replace(u){{destino=u}}}};'
             f'{script};console.log(destino)')
    r = subprocess.run(['node', '-e', falso], capture_output=True, text=True, encoding='utf-8', timeout=30)
    assert r.returncode == 0, r.stderr
    return r.stdout.strip()


def la_404_lleva_a_la_misma_ruta():
    html = SALIDA['404.html']
    assert '<meta name="robots" content="noindex">' in html, '404 sin noindex'
    casos = {
        '/garra-iberica/clan/': BASE + 'clan/',
        '/garra-iberica/en/dinosaurs/tyrannosaurus/': BASE + 'en/dinosaurs/tyrannosaurus/',
        '/garra-iberica/caceria.ics': BASE + 'caceria.ics',
        '/garra-iberica/dinosaurios/?x=1#dieta': BASE + 'dinosaurios/?x=1#dieta',
        '/garra-iberica/': BASE,
        '/otra-cosa/': BASE,
        # La web manda video/ a Pages: devolverlo a la web sería un bucle.
        '/garra-iberica/video/falta.mp4': BASE,
        '/garra-iberica/video/': BASE,
    }
    for ruta, esperado in casos.items():
        assert a_donde_lleva_la_404(ruta) == esperado, f'{ruta} lleva a {a_donde_lleva_la_404(ruta)} y no a {esperado}'


def la_404_no_lleva_fuera():
    origen = re.match(r'https://[^/]+', BASE).group(0)
    for ruta in ('/garra-iberica//otro.sitio/x', '/garra-iberica/\\\\otro.sitio/x', '/garra-iberica/\\/otro.sitio/',
                 '/garra-iberica/https://otro.sitio/', '/garra-iberica/javascript:alert(1)', '/garra-iberica/%2F%2Fotro.sitio'):
        destino = a_donde_lleva_la_404(ruta)
        assert destino.startswith(origen + '/'), f'{ruta} lleva fuera de la web: {destino}'


def redirecciones_de_videos_coinciden():
    """docs/_redirects manda los vídeos a la carpeta de Pages que publica copia_pages.py."""
    reglas = (DOCS / '_redirects').read_text(encoding='utf-8')
    esperado = f'/video/* https://mmortexx.github.io{copia_pages.PREFIJO_PAGES}video/:splat 302'
    assert esperado in reglas.splitlines(), f'_redirects no dice «{esperado}»'


def web_de_mentira(canonical, extra=()):
    d = Path(tempfile.mkdtemp())
    pagina = f'<!doctype html><html lang="es"><head><link rel="canonical" href="{canonical}"></head><body><h1>Hola</h1></body></html>'
    for nombre in ('index.html', '404.html', 'video/a.mp4', *extra):
        (d / nombre).parent.mkdir(parents=True, exist_ok=True)
        (d / nombre).write_bytes(pagina.encode('utf-8') if nombre.endswith('.html') else b'datos')
    return d


def publica_todo_lo_de_video():
    d = web_de_mentira(BASE, ['video/sub/a.vtt', 'video/portada.webp'])
    try:
        publicados = {n for n in copia_pages.montar(d) if n.startswith('video/')}
        assert publicados == {'video/a.mp4', 'video/sub/a.vtt', 'video/portada.webp'}, f'publica {sorted(publicados)}'
    finally:
        shutil.rmtree(d, ignore_errors=True)


def no_sirve_si_la_web_es_github_io():
    d = web_de_mentira('https://mmortexx.github.io/garra-iberica/')
    try:
        copia_pages.montar(d)
    except SystemExit:
        pass
    else:
        raise AssertionError('con la web en github.io, cada aviso llevaría a sí mismo y no para')
    finally:
        shutil.rmtree(d, ignore_errors=True)


def escapa_la_direccion():
    html = copia_pages.aviso('a&b"c/index.html', BASE)
    assert 'a&amp;b&quot;c/' in html and 'a&b' not in html, html


def escribe_en_carpeta_nueva():
    d = Path(tempfile.mkdtemp())
    try:
        destino = d / 'pages'
        copia_pages.main(destino)
        escritos = {p.relative_to(destino).as_posix() for p in destino.rglob('*') if p.is_file()}
        assert escritos == set(SALIDA), f'escribe {sorted(escritos ^ set(SALIDA))} de más o de menos'
        v = next(n for n in SALIDA if n.startswith('video/'))
        assert (destino / v).read_bytes() == (DOCS / v).read_bytes(), f'{v} no es igual al de docs/'
        try:
            copia_pages.main(destino)
        except SystemExit:
            pass
        else:
            raise AssertionError('escribe encima de una carpeta con ficheros')
    finally:
        shutil.rmtree(d, ignore_errors=True)


prueba('Pages publica solo los vídeos y un aviso por página', solo_videos_y_avisos)
prueba('cada aviso: noindex, canonical y redirección a la misma página', cada_pagina_es_un_aviso)
prueba('la 404 de Pages lleva a la misma ruta en la web', la_404_lleva_a_la_misma_ruta)
prueba('la 404 de Pages no lleva a otra web', la_404_no_lleva_fuera)
prueba('_redirects apunta a los vídeos de Pages', redirecciones_de_videos_coinciden)
prueba('escribe en una carpeta nueva y no pisa una con ficheros', escribe_en_carpeta_nueva)
prueba('publica todo lo de docs/video, no solo los .mp4', publica_todo_lo_de_video)
prueba('para si la web vive en github.io', no_sirve_si_la_web_es_github_io)
prueba('escapa la dirección en el aviso', escapa_la_direccion)

if fallos:
    sys.exit(f'{fallos} prueba(s) con fallos')
print('Todo correcto')
