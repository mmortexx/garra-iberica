"""Comprueba la web antes de publicarla. Sale con código 1 si algo falla.

Uso: python herramientas/comprobar.py [carpeta]   (por defecto, docs/ del proyecto)
"""
import hashlib
import json
import re
import sys
import xml.etree.ElementTree as ET
from html.parser import HTMLParser
from pathlib import Path

PAGINAS = {
    'index.html': ('es', '', 'GARRA IBÉRICA – Clan español de The Isle Evrima'),
    'en/index.html': ('en', 'en/', 'GARRA IBÉRICA – Spanish-Speaking The Isle Evrima Clan'),
}
INVITACION = 'https://discord.com/invite/txpBJzXvtK'
VERSIONADOS = ['estilos.css', 'efectos.js', 'caceria.js']
MAX_KB_IMAGEN = 120
# IDs de Discord: no deben salir en la web pública. Los apodos de miembros a vigilar están en
# herramientas/vigilar.local.txt (uno por línea), que git ignora para no publicarlos.
ID_DISCORD = r'\b\d{17,20}\b'
VIGILAR = Path(__file__).resolve().parent / 'vigilar.local.txt'
AVISO_PESTANA = {'es': 'se abre en una pestaña nueva', 'en': 'opens in a new tab'}


def huella(ruta):
    return hashlib.sha256(ruta.read_bytes()).hexdigest()[:10]


def plano(texto):
    return ' '.join(re.sub(r'<[^>]+>', ' ', texto).split())


class Lector(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.etiquetas = []
        self.pila = []
        self.textos = {'title': '', 'h1': ''}
        self.h1 = 0
        self.jsonld = []
        self.preguntas = []
        self.nuevas = []
        self.lang = None
        self._jsonld = False
        self._details = None
        self._campo = None
        self._a_nueva = False

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        self.etiquetas.append((tag, a))
        if tag == 'html':
            self.lang = a.get('lang')
        if tag == 'h1':
            self.h1 += 1
        if tag == 'script' and a.get('type') == 'application/ld+json':
            self._jsonld = True
            self.jsonld.append('')
        if tag == 'details':
            self._details = ['', '']
        if self._details is not None and tag == 'summary':
            self._campo = 0
        if self._details is not None and tag == 'p':
            self._campo = 1
        if tag == 'a':
            self._a_nueva = a.get('target') == '_blank'
            if self._a_nueva:
                self.nuevas.append([a.get('href'), a.get('rel') or '', ''])
        if tag not in ('img', 'meta', 'link', 'br', 'source', 'input', 'path', 'stop'):
            self.pila.append(tag)

    def handle_endtag(self, tag):
        if tag == 'script':
            self._jsonld = False
        if tag in ('summary', 'p'):
            self._campo = None
        if tag == 'a':
            self._a_nueva = False
        if tag == 'details' and self._details is not None:
            self.preguntas.append(tuple(' '.join(t.split()) for t in self._details))
            self._details = None
        if tag in self.pila:
            while self.pila and self.pila.pop() != tag:
                pass

    def handle_data(self, data):
        if self._jsonld:
            self.jsonld[-1] += data
        if self._details is not None and self._campo is not None:
            self._details[self._campo] += data
        if self._a_nueva:
            self.nuevas[-1][2] += data
        for t in ('title', 'h1'):
            if t in self.pila:
                self.textos[t] += data


def leer(raiz, nombre):
    return (raiz / nombre).read_text(encoding='utf-8')


def revisar_pagina(raiz, nombre, lang, sufijo, titulo, base, falla):
    html = leer(raiz, nombre)
    doc = Lector()
    doc.feed(html)
    metas = {a.get('name') or a.get('property'): a.get('content') for t, a in doc.etiquetas if t == 'meta'}
    canon = [a.get('href') for t, a in doc.etiquetas if t == 'link' and a.get('rel') == 'canonical']
    alternas = {a.get('hreflang'): a.get('href') for t, a in doc.etiquetas
                if t == 'link' and a.get('rel') == 'alternate' and a.get('hreflang')}
    csp = next((a.get('content') for t, a in doc.etiquetas if t == 'meta' and a.get('http-equiv') == 'Content-Security-Policy'), '')

    if doc.lang != lang:
        falla(f'{nombre}: <html lang="{doc.lang}"> y debe ser «{lang}»')
    if doc.textos['title'].strip() != titulo:
        falla(f'{nombre}: <title> es «{doc.textos["title"].strip()}» y debe ser «{titulo}»')
    if doc.h1 != 1:
        falla(f'{nombre}: tiene {doc.h1} <h1> y debe tener 1')
    if ' '.join(doc.textos['h1'].split()) != titulo:
        falla(f'{nombre}: <h1> es «{" ".join(doc.textos["h1"].split())}» y debe ser «{titulo}»')
    desc = metas.get('description') or ''
    if not 70 <= len(desc) <= 160:
        falla(f'{nombre}: meta description mide {len(desc)} caracteres (70–160)')
    if canon != [base + sufijo]:
        falla(f'{nombre}: canonical {canon} y debe ser {base + sufijo}')
    if alternas != {'es': base, 'en': base + 'en/', 'x-default': base}:
        falla(f'{nombre}: hreflang {alternas} no enlaza bien las versiones es/en')
    for clave, valor in {'og:url': base + sufijo, 'og:image': base + 'img/og-garra-iberica.jpg'}.items():
        if metas.get(clave) != valor:
            falla(f'{nombre}: {clave} es «{metas.get(clave)}» y debe ser «{valor}»')
    for clave in ('og:title', 'og:description', 'og:image:alt', 'twitter:card'):
        if not metas.get(clave):
            falla(f'{nombre}: falta la meta {clave}')
    if "script-src 'self'" not in csp or "default-src 'none'" not in csp:
        falla(f'{nombre}: falta la política de seguridad (CSP) o es más laxa de lo previsto')

    if len(doc.jsonld) != 1:
        falla(f'{nombre}: hay {len(doc.jsonld)} bloques JSON-LD y debe haber 1')
    else:
        try:
            grafo = json.loads(doc.jsonld[0])['@graph']
            tipos = {n.get('@type'): n for n in grafo}
            org = tipos['Organization']
            if org.get('url') != base or org.get('name') != 'GARRA IBÉRICA':
                falla(f'{nombre}: JSON-LD Organization con url o name distintos de la web')
            for clave in ('logo', 'image'):
                ruta = org.get(clave, '')
                if not ruta.startswith(base) or not (raiz / ruta[len(base):]).is_file():
                    falla(f'{nombre}: JSON-LD Organization.{clave} «{ruta}» no apunta a un fichero de la web')
            if INVITACION not in org.get('sameAs', []):
                falla(f'{nombre}: JSON-LD Organization.sameAs no lleva la invitación de Discord')
            faq = tipos.get('FAQPage')
            visibles = doc.preguntas
            if not faq or not visibles:
                falla(f'{nombre}: faltan las preguntas frecuentes visibles o su FAQPage en JSON-LD')
            else:
                datos = [(q['name'], plano(q['acceptedAnswer']['text'])) for q in faq['mainEntity']]
                if datos != visibles:
                    distintas = [d for d, v in zip(datos, visibles) if d != v] or ['número de preguntas distinto']
                    falla(f'{nombre}: FAQPage no coincide con las preguntas visibles: {distintas[0]}')
        except (ValueError, KeyError, TypeError) as e:
            falla(f'{nombre}: JSON-LD no válido: {e!r}')

    invitaciones = re.findall(r'https://discord\.(?:com|gg)/[^"\s<]+', html)
    if not invitaciones or set(invitaciones) != {INVITACION}:
        falla(f'{nombre}: enlaces a Discord distintos de la invitación: {sorted(set(invitaciones))}')
    for href, rel, texto in doc.nuevas:
        if 'noopener' not in rel:
            falla(f'{nombre}: enlace {href} abre pestaña nueva sin rel="noopener"')
        if AVISO_PESTANA[lang] not in texto:
            falla(f'{nombre}: enlace {href} abre pestaña nueva sin avisarlo («{AVISO_PESTANA[lang]}»)')

    carpeta = (raiz / nombre).parent
    locales = set()
    for t, a in doc.etiquetas:
        for attr in ('src', 'href'):
            v = a.get(attr)
            if v and not re.match(r'(https?:|#|mailto:)', v):
                locales.add(v)
        for attr in ('srcset', 'imagesrcset'):
            for parte in (a.get(attr) or '').split(','):
                if parte.strip():
                    locales.add(parte.split()[0])
        if t == 'img':
            if 'alt' not in a:
                falla(f'{nombre}: <img src="{a.get("src")}"> sin atributo alt')
            if not (a.get('width') and a.get('height')):
                falla(f'{nombre}: <img src="{a.get("src")}"> sin width/height (provoca saltos al cargar)')
    usados = set()
    for ruta in sorted(locales):
        limpia, _, version = ruta.partition('?v=')
        destino = (carpeta / (limpia + 'index.html' if limpia.endswith('/') else limpia)).resolve()
        if not destino.is_file():
            falla(f'{nombre}: referencia a un fichero que no existe: {ruta}')
            continue
        usados.add(destino)
        if destino.name in VERSIONADOS and version != huella(destino):
            falla(f'{nombre}: {limpia} lleva ?v={version or "(nada)"} y debe llevar ?v={huella(destino)}; ejecuta herramientas/versionar.py')
    for ancla in sorted(set(re.findall(r'href="#([^"]+)"', html))):
        if f'id="{ancla}"' not in html:
            falla(f'{nombre}: enlace interno #{ancla} sin destino')
    return usados


def main(raiz):
    fallos = []
    falla = fallos.append
    if not VIGILAR.is_file():
        return [f'Falta herramientas/{VIGILAR.name}: crea ese fichero con los apodos de miembros que no deben aparecer, uno por línea']
    apodos = [l.strip() for l in VIGILAR.read_text(encoding='utf-8').splitlines() if l.strip()]
    prohibidos = [ID_DISCORD] + [r'(?i)\b' + re.escape(a) + r'\b' for a in apodos]

    for nombre in [*PAGINAS, '404.html', 'estilos.css', 'robots.txt', 'sitemap.xml', *VERSIONADOS]:
        if not (raiz / nombre).is_file():
            falla(f'Falta {nombre}')
    if fallos:
        return fallos

    canon = re.search(r'<link rel="canonical" href="([^"]+)"', leer(raiz, 'index.html'))
    base = canon.group(1) if canon else ''
    if not re.fullmatch(r'https://[^/]+/(.+/)?', base):
        return [f'canonical de index.html «{base}» no es una dirección https que acabe en /']

    usados = set()
    for nombre, (lang, sufijo, titulo) in PAGINAS.items():
        usados |= revisar_pagina(raiz, nombre, lang, sufijo, titulo, base, falla)

    if f'Sitemap: {base}sitemap.xml' not in leer(raiz, 'robots.txt'):
        falla('robots.txt no apunta al sitemap de la dirección canónica')
    try:
        ns = {'s': 'http://www.sitemaps.org/schemas/sitemap/0.9', 'x': 'http://www.w3.org/1999/xhtml'}
        urls = ET.fromstring(leer(raiz, 'sitemap.xml').encode('utf-8')).findall('s:url', ns)
        locs = [u.find('s:loc', ns).text for u in urls]
        if locs != [base, base + 'en/']:
            falla(f'sitemap.xml lista {locs} y debe listar {[base, base + "en/"]}')
        for u in urls:
            alt = {l.get('hreflang'): l.get('href') for l in u.findall('x:link', ns)}
            if alt != {'es': base, 'en': base + 'en/', 'x-default': base}:
                falla(f'sitemap.xml: {u.find("s:loc", ns).text} sin las alternativas de idioma correctas')
    except (ET.ParseError, AttributeError) as e:
        falla(f'sitemap.xml no es válido: {e}')

    pagina404 = leer(raiz, '404.html')
    for url in re.findall(r'(?:href|src)="(https://[^"]+)"', pagina404):
        limpia, _, version = url.partition('?v=')
        relativa = limpia[len(base):]
        destino = raiz / (relativa + 'index.html' if relativa.endswith('/') or not relativa else relativa)
        if not url.startswith(base):
            falla(f'404.html enlaza a {url}, fuera de {base}')
        elif not destino.is_file():
            falla(f'404.html enlaza a {url}, que no existe en la web')
        else:
            usados.add(destino.resolve())
            if destino.name in VERSIONADOS and version != huella(destino):
                falla(f'404.html: {destino.name} con versión desfasada; ejecuta herramientas/versionar.py')

    css = leer(raiz, 'estilos.css')
    for u in re.findall(r'url\("?([^")]+)"?\)', css):
        if u.startswith(('data:', '#')):
            continue
        if not (raiz / u).is_file():
            falla(f'estilos.css: referencia a un fichero que no existe: {u}')
        usados.add((raiz / u).resolve())
    usados.add((raiz / 'img' / 'og-garra-iberica.jpg').resolve())
    for img in sorted((raiz / 'img').glob('*')):
        if img.resolve() not in usados:
            falla(f'img/{img.name} no se usa en ninguna página: sobra')
        kb = img.stat().st_size / 1024
        if kb > MAX_KB_IMAGEN:
            falla(f'img/{img.name} pesa {kb:.0f} KB (máximo {MAX_KB_IMAGEN} KB)')

    for fichero in sorted(raiz.rglob('*')):
        if fichero.suffix not in ('.html', '.css', '.js', '.txt', '.xml', '.json', '.md'):
            continue
        texto = fichero.read_text(encoding='utf-8')
        for patron in prohibidos:
            for m in re.finditer(patron, texto):
                linea = texto.count('\n', 0, m.start()) + 1
                falla(f'{fichero.relative_to(raiz).as_posix()}:{linea}: dato de miembro o de Discord en la web pública: «{m.group(0)}»')

    return fallos


if __name__ == '__main__':
    raiz = Path(sys.argv[1]) if len(sys.argv) > 1 else Path(__file__).resolve().parent.parent / 'docs'
    fallos = main(raiz)
    for f in fallos:
        print('FALLO:', f)
    print(f'{len(fallos)} fallos' if fallos else 'Todo correcto')
    sys.exit(1 if fallos else 0)
