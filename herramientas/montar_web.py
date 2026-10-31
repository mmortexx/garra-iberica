"""Monta la web (docs/): todas las páginas, en español e inglés, y el mapa del sitio.

El contenido de cada página está en paginas/<idioma>/<página>.html: unas líneas de datos (titulo,
descripcion, h1 y, si al compartir debe salir otra descripción, og_descripcion) y, tras una línea
«---», lo que va dentro de <main>. REVISADA es la fecha que el mapa del sitio da a esas páginas:
súbela al cambiar su contenido. La cabecera, el menú, el pie,
los metadatos y los datos estructurados son comunes y salen de aquí. La guía de dinosaurios sale de
herramientas/fichas_dinos.json (ver guia_dinos.py).

En los textos de paginas/:
  @/                   principio de la web; se cambia por la ruta relativa que toque
  {{discord}}          invitación de Discord
  {{n_fichas}}         número de fichas de dinosaurios
  {{especies}}         lista de especies con enlace a su ficha
  {{google_calendar}}  enlace para añadir la Cacería a Google Calendar (de datos_clan.json)
  {{migas}}            «Inicio / página», con enlace al inicio
  {{normas}}           las normas del clan, de datos_clan.json (copiadas de la tarjeta #normas)
  {{batallas_cifras}}  victorias y últimas batallas, para la portada (ver batallas_web.py)
  {{batallas}}         todas las batallas del clan, de la última a la primera

Uso: python herramientas/montar_web.py   (tras tocar paginas/, las fichas, estilos.css o los .js)
comprobar.py falla si docs/ no es lo que sale de aquí.
"""
import hashlib
import json
import re
import sys
from html import escape, unescape
from pathlib import Path

HERRAMIENTAS = Path(__file__).resolve().parent
sys.path.insert(0, str(HERRAMIENTAS))
import batallas_web  # noqa: E402
import calendario  # noqa: E402
import guia_dinos  # noqa: E402

RAIZ = HERRAMIENTAS.parent
DOCS = RAIZ / 'docs'
FUENTES = RAIZ / 'paginas'
DATOS_CLAN = HERRAMIENTAS / 'datos_clan.json'
INVITACION = guia_dinos.INVITACION
STEAM = guia_dinos.STEAM
VERSIONADOS = ['estilos.css', 'efectos.js', 'caceria.js']
# Última revisión del contenido, para el mapa del sitio (la guía lleva la fecha de sus fichas).
REVISADA = '2026-10-31'
LANGS = ('es', 'en')

# id, ruta (es, en), nombre en el pie y en las migas (es, en). Arriba solo van las de MENU; en el
# pie, todas menos el aviso legal, que va junto a la nota legal.
PAGINAS = [
    ('inicio', ('', 'en/'), ('Inicio', 'Home')),
    ('clan', ('clan/', 'en/clan/'), ('El clan', 'The clan')),
    ('dinosaurios', (guia_dinos.RUTAS['es'], guia_dinos.RUTAS['en']), ('Dinosaurios', 'Dinosaurs')),
    ('caceria', (calendario.RUTAS['es'], calendario.RUTAS['en']), ('Cacería', 'Clan hunt')),
    ('galeria', ('galeria/', 'en/gallery/'), ('Galería', 'Gallery')),
    ('unete', ('unete/', 'en/join/'), ('Cómo entrar', 'How to join')),
    ('normas', ('normas/', 'en/rules/'), ('Normas', 'Rules')),
    ('legal', ('legal/', 'en/legal/'), ('Aviso legal y privacidad', 'Legal notice and privacy')),
]
# Inicio, además de en la marca: no todo el mundo sabe que la marca lleva a la portada.
MENU = ('inicio', 'clan', 'dinosaurios', 'caceria', 'galeria', 'unete')
PIE = [p for p, _, _ in PAGINAS if p != 'legal']
RUTA = {(p, lang): rutas[i] for p, rutas, _ in PAGINAS for i, lang in enumerate(LANGS)}
NOMBRE = {(p, lang): nombres[i] for p, _, nombres in PAGINAS for i, lang in enumerate(LANGS)}
FICHEROS = {RUTA[clave] + 'index.html': clave for clave in RUTA}
# Secciones que antes estaban en la portada: un enlace viejo (/#normas) lleva a su sitio nuevo.
MOVIDAS = {
    'es': {'guia': 'dinosaurios/', 'galeria': 'galeria/', 'entrar': 'unete/', 'caceria': 'caceria/',
           'normas': 'normas/', 'rangos': 'clan/#rangos', 'preguntas': 'unete/#preguntas'},
    'en': {'guide': 'dinosaurs/', 'gallery': 'gallery/', 'join': 'join/', 'hunt': 'hunt/',
           'rules': 'rules/', 'ranks': 'clan/#ranks', 'faq': 'join/#faq'},
}

T = {
    'es': {
        'locale': ('es_ES', 'en_GB'), 'saltar': 'Saltar al contenido', 'secciones': 'Secciones',
        'abrir': 'Abrir el menú', 'cerrar': 'Cerrar el menú', 'marca': 'GARRA IBÉRICA, ir al inicio',
        'otra': ('en', 'English version', 'EN'), 'migas': 'Estás en',
        'unete': 'Únete<span class="oculto"> en Discord (se abre en una pestaña nueva)</span>',
        'nueva': ' (se abre en una pestaña nueva)',
        'pie_texto': 'Clan español de The Isle Evrima, abierto a jugadores de España y Latinoamérica.',
        'pie_menu': 'Pie de página', 'pie_discord': 'Discord del clan', 'pie_steam': 'The Isle en Steam',
        'arriba': 'Volver arriba ↑', 'subir': 'Volver arriba',
        'legal': 'Web de fans hecha por el clan. No estamos afiliados a los creadores de The Isle ni a Discord. Las marcas pertenecen a sus dueños.',
        'og_alt': 'Cartel del clan GARRA IBÉRICA de The Isle Evrima: tres arañazos de garra al rojo vivo sobre una roca en la selva',
        'org': {
            'alternateName': ['Garra Ibérica', 'Garra Iberica', 'Clan GARRA IBÉRICA', 'GARRA IBÉRICA clan'],
            'description': 'Clan español de The Isle Evrima abierto a jugadores de España y Latinoamérica. Jugamos en manada en un servidor no oficial, con canales de voz en Discord y una cacería del clan cada sábado a las 22:00 (hora peninsular española).',
            'disambiguatingDescription': 'Clan de jugadores del videojuego de supervivencia de dinosaurios The Isle (versión Evrima). No es un servidor de juego.',
            'areaServed': ['España', 'Latinoamérica'],
            'keywords': 'clan The Isle Evrima, clan español The Isle, clan latino The Isle, clan hispano The Isle Evrima, Discord The Isle en español, manada The Isle, buscar clan The Isle, reclutamiento The Isle',
        },
        'web_alt': ['Garra Ibérica', 'GARRA IBÉRICA – Clan de The Isle Evrima'],
    },
    'en': {
        'locale': ('en_GB', 'es_ES'), 'saltar': 'Skip to content', 'secciones': 'Sections',
        'abrir': 'Open the menu', 'cerrar': 'Close the menu', 'marca': 'GARRA IBÉRICA, go to the home page',
        'otra': ('es', 'Versión en español', 'ES'), 'migas': 'You are in',
        'unete': 'Join<span class="oculto"> on Discord (opens in a new tab)</span>',
        'nueva': ' (opens in a new tab)',
        'pie_texto': 'Spanish-speaking The Isle Evrima clan, open to players from Spain and Latin America.',
        'pie_menu': 'Footer', 'pie_discord': 'Clan Discord', 'pie_steam': 'The Isle on Steam',
        'arriba': 'Back to top ↑', 'subir': 'Back to top',
        'legal': 'Fan site made by the clan. We are not affiliated with the creators of The Isle or with Discord. All trademarks belong to their owners.',
        'og_alt': 'Banner of the GARRA IBÉRICA clan for The Isle Evrima: three red-hot claw marks on a rock in the jungle',
        'org': {
            'alternateName': ['Garra Ibérica', 'Garra Iberica', 'GARRA IBÉRICA clan'],
            'description': 'Spanish-speaking The Isle Evrima clan open to players from Spain and Latin America. We play as a pack on an unofficial server, with Discord voice channels and a clan hunt every Saturday at 22:00 Spanish mainland time.',
            'disambiguatingDescription': 'Player clan for the dinosaur survival video game The Isle (Evrima version). Not a game server.',
            'areaServed': ['Spain', 'Latin America'],
            'keywords': 'The Isle Evrima clan, Spanish The Isle clan, Spanish-speaking The Isle clan, Latin American The Isle clan, The Isle Discord, The Isle pack, looking for a clan in The Isle, The Isle clan recruitment, The Isle Evrima Discord',
        },
        'web_alt': ['Garra Ibérica', 'GARRA IBÉRICA – The Isle Evrima clan'],
    },
}
# Solo en la portada en español: con ellas Google Search Console y Bing Webmaster verifican la web.
VERIFICACION = [('google-site-verification', 'TjZ3UO9z_tfPs5RZnAKtSvgGJ08vOeuVpI8ob2YMVbQ'),
                ('msvalidate.01', '06F63226A2F1AE3F8270F972B3FCA4D2')]
CSP = ("default-src 'none'; script-src 'self'; connect-src 'self'; style-src 'self'; font-src 'self'; "
       "img-src 'self' data:; media-src 'self'; base-uri 'none'; form-action 'none'")
ACERO = ('<svg class="oculto" aria-hidden="true" focusable="false"><defs><linearGradient id="acero" x1="0" y1="0" x2="1" y2="1">'
         '<stop offset="0" stop-color="#dadada"/><stop offset=".35" stop-color="#929292"/><stop offset=".6" stop-color="#474747"/>'
         '<stop offset="1" stop-color="#aeaeae"/></linearGradient></defs></svg>')


def huella(ruta):
    return hashlib.sha256(ruta.read_bytes()).hexdigest()[:10]


def plano(texto):
    return unescape(' '.join(re.sub(r'<[^>]+>', '', texto).split()))


def prefijo(ruta):
    return '../' * ruta.count('/')


def enlace(desde, hasta):
    """Ruta relativa de una página de la web a otra (o a un fichero), nunca vacía."""
    return prefijo(desde) + hasta or './'


def fuente(pagina, lang):
    """Datos y contenido de una página escrita a mano en paginas/."""
    ruta = FUENTES / lang / f'{pagina}.html'
    texto = ruta.read_bytes().decode('utf-8').replace('\r\n', '\n')
    cabeza, separador, cuerpo = texto.partition('\n---\n')
    if not separador:
        sys.exit(f'{ruta}: falta la línea «---» entre los datos y el contenido')
    datos = {}
    for linea in cabeza.splitlines():
        clave, dos_puntos, valor = linea.partition(': ')
        if not dos_puntos or clave not in ('titulo', 'descripcion', 'h1', 'og_descripcion'):
            sys.exit(f'{ruta}: línea de datos no válida «{linea}»')
        datos[clave] = valor.strip()
    for clave in ('titulo', 'descripcion', 'h1'):
        if not datos.get(clave):
            sys.exit(f'{ruta}: falta «{clave}:»')
    return datos, cuerpo


def especies(lang, d):
    filas = []
    for g in ('carnivoros', 'herbivoros', 'omnivoros'):
        enlaces = ', '.join(f'<a href="@/{guia_dinos.RUTAS[lang]}#{guia_dinos.ancla(f["nombre"])}">{escape(f["nombre"])}</a>'
                            for f in d['fichas'] if guia_dinos.GRUPO[f['dieta']] == g)
        if enlaces:
            filas.append(f'<div><dt>{guia_dinos.T[lang]["grupos"][g]}</dt><dd>{enlaces}</dd></div>')
    return '<dl class="especies">' + ''.join(filas) + '</dl>'


def normas(lang):
    n = json.loads(DATOS_CLAN.read_text(encoding='utf-8'))['normas'][lang]
    bloques, numero = [], 1
    for a in n['apartados']:
        ancla = guia_dinos.ancla(a['titulo'])
        reglas = ''.join(f'<li>{escape(r)}</li>' for r in a['normas'])
        bloques.append(
            f'<section class="bloque panel luz revelar" id="{ancla}" aria-labelledby="t-{ancla}">'
            f'<h3 id="t-{ancla}"><img src="@/img/emoji-{a["emoji"]}.webp" alt="" width="42" height="42" loading="lazy">{escape(a["titulo"])}</h3>'
            f'<ol class="reglas" start="{numero}">{reglas}</ol></section>')
        numero += len(a['normas'])
    ancla = guia_dinos.ancla(n['sanciones_titulo'])
    pasos = ''.join(f'<li><span>{escape(s)}</span></li>' for s in n['sanciones'])
    bloques.append(
        f'<section class="bloque panel luz revelar" id="{ancla}" aria-labelledby="t-{ancla}">'
        f'<h3 id="t-{ancla}"><img src="@/img/emoji-normas.webp" alt="" width="42" height="42" loading="lazy">{escape(n["sanciones_titulo"])}</h3>'
        f'<ol class="pasos-sancion" role="list">{pasos}</ol>'
        f'<p>{escape(n["sanciones_nota"])}</p><p>{escape(n["rango"])}</p></section>')
    return (f'<div class="reglamento escalonado">{"".join(bloques)}</div>'
            f'<p class="cierre-normas revelar"><em>{escape(n["cierre"])}</em></p>')


def migas(pagina, lang):
    inicio = NOMBRE['inicio', lang]
    return (f'<nav class="migas" aria-label="{T[lang]["migas"]}"><a href="@/{RUTA["inicio", lang]}">{inicio}</a>'
            f'<span aria-current="page">{NOMBRE[pagina, lang]}</span></nav>')


def rellenar(cuerpo, pagina, lang, base, d):
    # Cada marcador se calcula solo si la página lo usa.
    valores = {
        'discord': lambda: INVITACION,
        'n_fichas': lambda: str(len(d['fichas'])),
        'especies': lambda: especies(lang, d),
        'google_calendar': lambda: calendario.enlace_google(lang, base),
        'migas': lambda: migas(pagina, lang),
        'normas': lambda: normas(lang),
        'batallas_cifras': lambda: batallas_web.marcador(lang, RUTA['clan', lang]),
        'batallas': lambda: batallas_web.lista(lang),
    }

    def poner(m):
        if m.group(1) not in valores:
            sys.exit(f'paginas/{lang}/{pagina}.html: marcador desconocido {m.group(0)}')
        return valores[m.group(1)]()
    cuerpo = re.sub(r'\{\{(\w+)\}\}', poner, cuerpo)
    pre = prefijo(RUTA[pagina, lang])
    cuerpo = cuerpo.replace('@/', pre)
    return re.sub(r'(href|src)=""', r'\1="./"', cuerpo)


def preguntas(cuerpo):
    # El aviso de «se abre en una pestaña nueva» es para lectores de pantalla, no parte de la respuesta.
    sin_aviso = re.sub(r'<span class="oculto">.*?</span>', '', cuerpo)
    return [(plano(q), plano(a)) for q, a in re.findall(r'<summary>(.*?)</summary>\s*<p>(.*?)</p>', sin_aviso, re.S)]


def grafo(pagina, lang, base, datos, cuerpo, fecha):
    t = T[lang]
    url = base + RUTA[pagina, lang]
    nodos = [
        {'@type': 'Organization', '@id': base + '#clan', 'name': 'GARRA IBÉRICA', 'alternateName': t['org']['alternateName'],
         'description': t['org']['description'], 'disambiguatingDescription': t['org']['disambiguatingDescription'],
         'url': base, 'logo': base + 'apple-touch-icon.png', 'image': base + 'img/og-garra-iberica.jpg',
         'areaServed': t['org']['areaServed'], 'knowsLanguage': ['es', 'en'], 'keywords': t['org']['keywords'],
         'sameAs': [INVITACION]},
        {'@type': 'WebSite', '@id': base + '#web', 'name': 'GARRA IBÉRICA', 'alternateName': t['web_alt'], 'url': base,
         'inLanguage': ['es', 'en'], 'publisher': {'@id': base + '#clan'}},
        {'@type': 'WebPage', '@id': url + '#pagina', 'url': url, 'name': datos['titulo'], 'description': datos['descripcion'],
         'inLanguage': lang, 'isPartOf': {'@id': base + '#web'},
         'about': [{'@id': base + '#clan'}, {'@id': base + '#juego'}],
         'primaryImageOfPage': base + 'img/og-garra-iberica.jpg'},
        {'@type': 'VideoGame', '@id': base + '#juego', 'name': 'The Isle', 'alternateName': 'The Isle Evrima',
         'gamePlatform': 'PC', 'sameAs': [STEAM, 'https://www.theisle-game.com/']},
    ]
    if fecha:
        nodos[2]['dateModified'] = fecha
    if pagina != 'inicio':
        nodos[2]['breadcrumb'] = {'@id': url + '#migas'}
        nodos.append({'@type': 'BreadcrumbList', '@id': url + '#migas', 'itemListElement': [
            {'@type': 'ListItem', 'position': 1, 'name': NOMBRE['inicio', lang], 'item': base + RUTA['inicio', lang]},
            {'@type': 'ListItem', 'position': 2, 'name': NOMBRE[pagina, lang], 'item': url}]})
    faq = preguntas(cuerpo)
    if faq:
        nodos.append({'@type': 'FAQPage', '@id': url + '#preguntas', 'inLanguage': lang, 'mainEntity': [
            {'@type': 'Question', 'name': q, 'acceptedAnswer': {'@type': 'Answer', 'text': a}} for q, a in faq]})
    return json.dumps({'@context': 'https://schema.org', '@graph': nodos}, ensure_ascii=False, indent=2)


def precarga(cuerpo):
    """La imagen de cabecera (la que lleva fetchpriority="high"), para pedirla antes que nada."""
    m = re.search(r'<img [^>]*fetchpriority="high"[^>]*>', cuerpo)
    if not m:
        return []
    a = dict(re.findall(r'([\w-]+)="([^"]*)"', m.group(0)))
    if 'src' not in a or ('srcset' in a) != ('sizes' in a):
        sys.exit(f'imagen de cabecera sin src, o con srcset y sizes a medias: {m.group(0)[:120]}')
    extra = (f' imagesrcset="{a["srcset"]}" imagesizes="{a["sizes"]}"' if 'srcset' in a else '')
    return [f'<link rel="preload" as="image" href="{a["src"]}"{extra} fetchpriority="high">']


def cabecera(pagina, lang):
    t = T[lang]
    desde = RUTA[pagina, lang]
    otra_lang, otra_titulo, otra_corto = t['otra']
    actual = ' aria-current="page"'
    menu = [f'      <a href="{enlace(desde, RUTA[p, lang])}"{actual if p == pagina else ""}>{NOMBRE[p, lang]}</a>'
            for p in MENU]
    return [
        '<header class="barra">',
        '  <div class="barra-in">',
        f'    <a class="marca" href="{enlace(desde, RUTA["inicio", lang])}" aria-label="{t["marca"]}">',
        f'      <img src="{prefijo(desde)}img/emoji-garra.webp" alt="" width="36" height="36">',
        '      <span>GARRA IBÉRICA</span>',
        '    </a>',
        f'    <nav class="menu" id="menu" popover aria-label="{t["secciones"]}">',
        *menu,
        f'      <a class="menu-idioma" href="{enlace(desde, RUTA[pagina, otra_lang])}" hreflang="{otra_lang}" lang="{otra_lang}">{otra_titulo}</a>',
        f'      <button class="menu-cerrar" type="button" popovertarget="menu" popovertargetaction="hide" aria-label="{t["cerrar"]}"></button>',
        '    </nav>',
        '    <div class="barra-acciones">',
        f'      <a class="idioma" href="{enlace(desde, RUTA[pagina, otra_lang])}" hreflang="{otra_lang}" lang="{otra_lang}" title="{otra_titulo}">{otra_corto}</a>',
        f'      <a class="boton boton-mini" href="{INVITACION}" rel="noopener" target="_blank">{t["unete"]}</a>',
        f'      <button class="menu-boton" type="button" popovertarget="menu" aria-label="{t["abrir"]}"><span aria-hidden="true"></span></button>',
        '    </div>',
        '  </div>',
        '  <span class="progreso" aria-hidden="true"></span>',
        '</header>',
    ]


def pie(pagina, lang):
    t = T[lang]
    desde = RUTA[pagina, lang]
    otra_lang, otra_titulo, _ = t['otra']
    nueva = t['nueva']
    return [
        '<footer class="pie">',
        '  <div class="envoltura pie-in">',
        '    <div class="pie-marca">',
        f'      <img src="{prefijo(desde)}img/emoji-garra.webp" alt="" width="48" height="48" loading="lazy">',
        f'      <p><b>GARRA IBÉRICA</b><br>{t["pie_texto"]}</p>',
        '    </div>',
        f'    <nav class="pie-menu" aria-label="{t["pie_menu"]}">',
        *[f'      <a href="{enlace(desde, RUTA[p, lang])}">{NOMBRE[p, lang]}</a>' for p in PIE],
        '    </nav>',
        '    <p class="pie-enlaces">',
        f'      <a href="{INVITACION}" rel="noopener" target="_blank">{t["pie_discord"]}<span class="oculto">{nueva}</span></a>',
        f'      <a href="{STEAM}" rel="noopener" target="_blank">{t["pie_steam"]}<span class="oculto">{nueva}</span></a>',
        f'      <a href="{enlace(desde, RUTA[pagina, otra_lang])}" hreflang="{otra_lang}" lang="{otra_lang}">{otra_titulo}</a>',
        f'      <a href="#contenido">{t["arriba"]}</a>',
        '    </p>',
        f'    <p class="pie-legal">{t["legal"]} <a href="{enlace(desde, RUTA["legal", lang])}">{NOMBRE["legal", lang]}</a></p>',
        '  </div>',
        '</footer>',
        # Atajo flotante (lo enseña efectos.js al subir en una página larga); el del pie es el de siempre.
        f'<a class="subir" href="#contenido"><span class="oculto">{t["subir"]}</span></a>',
    ]


def contenido(pagina, lang, d):
    """Datos (título, descripción, h1), contenido sin rellenar y fecha de revisión (o None)."""
    if pagina == 'dinosaurios':
        return guia_dinos.contenido(lang, d)
    return (*fuente(pagina, lang), None)


def pagina_web(pagina, lang, base=None, d=None, docs=DOCS):
    base = base or guia_dinos.base_web(docs)
    d = d or guia_dinos.datos()
    t = T[lang]
    desde = RUTA[pagina, lang]
    pre = prefijo(desde)
    datos, cuerpo, fecha = contenido(pagina, lang, d)
    cuerpo = rellenar(cuerpo, pagina, lang, base, d)
    desc = datos['descripcion']
    if not 70 <= len(desc) <= 160:
        sys.exit(f'{pagina} ({lang}): la descripción mide {len(desc)} caracteres (70–160)')
    v = {n: huella(docs / n) for n in VERSIONADOS}
    url = base + desde
    scripts = [f'<script src="{pre}efectos.js?v={v["efectos.js"]}" defer></script>']
    if 'data-cuenta' in cuerpo or 'data-plan' in cuerpo:
        scripts.append(f'<script src="{pre}caceria.js?v={v["caceria.js"]}" defer></script>')
    cuerpo_attrs = ''
    if pagina == 'inicio':
        cuerpo_attrs = f' data-movidas="{escape(json.dumps(MOVIDAS[lang], separators=(",", ":")))}"'
    lineas = [
        '<!doctype html>',
        f'<html lang="{lang}">',
        '<head>',
        '<meta charset="utf-8">',
        '<meta name="viewport" content="width=device-width, initial-scale=1">',
        f'<title>{datos["titulo"]}</title>',
        f'<meta name="description" content="{escape(desc)}">',
        '<meta name="robots" content="max-image-preview:large, max-snippet:-1">',
        *[f'<meta name="{n}" content="{c}">' for n, c in VERIFICACION if (pagina, lang) == ('inicio', 'es')],
        f'<meta http-equiv="Content-Security-Policy" content="{CSP}">',
        '<meta name="referrer" content="strict-origin-when-cross-origin">',
        '<meta name="theme-color" content="#080808">',
        f'<link rel="canonical" href="{url}">',
        f'<link rel="alternate" hreflang="es" href="{base + RUTA[pagina, "es"]}">',
        f'<link rel="alternate" hreflang="en" href="{base + RUTA[pagina, "en"]}">',
        f'<link rel="alternate" hreflang="x-default" href="{base + RUTA[pagina, "es"]}">',
        f'<link rel="preload" href="{pre}fonts/anton.woff2" as="font" type="font/woff2" crossorigin>',
        f'<link rel="preload" href="{pre}fonts/barlow-600.woff2" as="font" type="font/woff2" crossorigin>',
        *precarga(cuerpo),
        f'<link rel="stylesheet" href="{pre}estilos.css?v={v["estilos.css"]}">',
        *scripts,
        f'<link rel="icon" href="{pre}favicon.ico" sizes="16x16 32x32 48x48">',
        f'<link rel="apple-touch-icon" href="{pre}apple-touch-icon.png">',
        '',
        f'<meta property="og:type" content="{"article" if fecha else "website"}">',
        f'<meta property="og:locale" content="{t["locale"][0]}">',
        f'<meta property="og:locale:alternate" content="{t["locale"][1]}">',
        '<meta property="og:site_name" content="GARRA IBÉRICA">',
        f'<meta property="og:title" content="{escape(datos["titulo"])}">',
        f'<meta property="og:description" content="{escape(datos.get("og_descripcion", desc))}">',
        f'<meta property="og:url" content="{url}">',
        f'<meta property="og:image" content="{base}img/og-garra-iberica.jpg">',
        '<meta property="og:image:width" content="1200">',
        '<meta property="og:image:height" content="630">',
        f'<meta property="og:image:alt" content="{t["og_alt"]}">',
        '<meta name="twitter:card" content="summary_large_image">',
        '',
        '<script type="application/ld+json">',
        grafo(pagina, lang, base, datos, cuerpo, fecha),
        '</script>',
        '</head>',
        f'<body{cuerpo_attrs}>',
        f'<a class="saltar" href="#contenido">{t["saltar"]}</a>',
        *([ACERO] if 'class="hex"' in cuerpo else []),
        '<div class="niebla" aria-hidden="true"></div>',
        '',
        *cabecera(pagina, lang),
        '',
        '<main id="contenido">',
        cuerpo.strip('\n'),
        '</main>',
        '',
        *pie(pagina, lang),
        '</body>',
        '</html>',
        '',
    ]
    return '\n'.join(lineas)


def sitemap(base, d):
    fecha = {'dinosaurios': guia_dinos.revision(d)[1]}
    lineas = ['<?xml version="1.0" encoding="UTF-8"?>',
              '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">']
    for pagina, _, _ in PAGINAS:
        for lang in LANGS:
            lineas += ['  <url>',
                       f'    <loc>{base + RUTA[pagina, lang]}</loc>',
                       f'    <lastmod>{fecha.get(pagina, REVISADA)}</lastmod>',
                       *[f'    <xhtml:link rel="alternate" hreflang="{h}" href="{base + RUTA[pagina, l]}"/>'
                         for h, l in (('es', 'es'), ('en', 'en'), ('x-default', 'es'))],
                       '  </url>']
    return '\n'.join(lineas + ['</urlset>', ''])


def pagina_404(texto, docs=DOCS):
    """404.html se escribe a mano; aquí solo se le pone al día la versión de la hoja de estilos."""
    nuevo, veces = re.subn(r'estilos\.css\?v=[0-9a-f]*"', f'estilos.css?v={huella(docs / "estilos.css")}"', texto)
    if veces != 1:
        sys.exit(f'404.html enlaza {veces} veces a estilos.css y debe ser 1')
    return nuevo


def montar(docs=DOCS):
    """Todo lo que genera este script: {fichero: contenido}. No escribe nada."""
    base, d = guia_dinos.base_web(docs), guia_dinos.datos()
    salida = {nombre: pagina_web(p, lang, base, d, docs) for nombre, (p, lang) in FICHEROS.items()}
    salida['sitemap.xml'] = sitemap(base, d)
    salida['404.html'] = pagina_404((docs / '404.html').read_bytes().decode('utf-8'), docs)
    return salida


def main():
    # Las batallas salen del proyecto del Discord: primero, la copia al día.
    if batallas_web.al_dia():
        print(f'{batallas_web.COPIA.name} puesto al día desde {batallas_web.ORIGINAL}')
    # Se monta todo antes de escribir: si algo falla, no queda nada a medias.
    salida = montar()
    for nombre, texto in salida.items():
        destino = DOCS / nombre
        destino.parent.mkdir(parents=True, exist_ok=True)
        destino.write_bytes(texto.encode('utf-8'))
    print(f'{len(salida)} ficheros al día en docs/:', ', '.join(salida))


if __name__ == '__main__':
    sys.stdout.reconfigure(encoding='utf-8')
    main()
