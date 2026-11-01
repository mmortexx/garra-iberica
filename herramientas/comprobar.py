"""Comprueba la web antes de publicarla. Sale con código 1 si algo falla.

Uso: python herramientas/comprobar.py [carpeta] [--sin-apodos]   (por defecto, docs/ del proyecto)

Los apodos a vigilar salen de herramientas/vigilar.local.txt o, si no existe, de la variable
VIGILAR_APODOS (uno por línea; así los recibe la integración continua desde un secreto).
--sin-apodos se salta solo esa parte, y lo dice.
"""
import colorsys
import datetime as dt
import json
import os
import re
import sys
import unicodedata
import xml.etree.ElementTree as ET
from zoneinfo import ZoneInfo

import batallas_web
import calendario
import guia_dinos
import montar_web
import preparar_galeria
from html import unescape
from html.parser import HTMLParser
from montar_web import RUTA, huella
from pathlib import Path
from urllib.parse import urlparse

# Todas las páginas las genera herramientas/montar_web.py: {fichero: (página, idioma)}.
PAGINAS = montar_web.FICHEROS
FICHAS_ORIGINAL = Path(os.environ.get('GARRA_FICHAS') or Path.home() / 'Downloads' / 'garra-iberica' / 'wiki' / 'fichas.json')
# Guía de la wiki del Discord: las frases de «Cómo leer las fichas» marcadas como suyas deben seguir diciéndolo.
FOTOS_ORIGINAL = Path(os.environ.get('GARRA_FOTOS') or FICHAS_ORIGINAL.parent.parent / 'galeria' / 'fotos.json')
POSTS_ORIGINAL = Path(os.environ.get('GARRA_POSTS') or FICHAS_ORIGINAL.with_name('posts.json'))
GUIA_WIKI = 'Cómo usar la wiki'
GUIA_COMBATE = 'Guía de combate'
INVITACION = 'https://discord.com/invite/txpBJzXvtK'
VERSIONADOS = montar_web.VERSIONADOS
MAX_KB_IMAGEN = 120
# Las fotos de la galería a tamaño grande solo se descargan si alguien abre una; aun así, en el
# móvil cada KB cuenta al ampliar (preparar_galeria.py baja la calidad hasta caber).
AMPLIADA = '-ampliada-'
MAX_KB_AMPLIADA = 750
# Vídeos de las batallas (preparar_videos.py): solo se bajan al darle al play, pero en el móvil pesan.
MAX_MB_VIDEO = 40
# IDs de Discord: no deben salir en la web pública. Los apodos de miembros a vigilar están en
# herramientas/vigilar.local.txt (uno por línea), que git ignora para no publicarlos.
ID_DISCORD = r'\b\d{17,20}\b'
VIGILAR = Path(__file__).resolve().parent / 'vigilar.local.txt'
# Única excepción a los apodos: los tres jefes del clan, por decisión del clan (1/11/2026), y solo
# donde los pone montar_web.alfas() con los nombres de la cita de la tarjeta #rangos. Un nombre
# más, o estos mismos en cualquier otro sitio, sigue fallando.
JEFES = ('Imaginary', 'Quilez', 'Ray')
AVISO_PESTANA = {'es': 'se abre en una pestaña nueva', 'en': 'opens in a new tab'}
# A dónde sacan los enlaces de la web y cómo los nombra el aviso legal.
SITIOS_FUERA = {'discord.com': 'Discord', 'store.steampowered.com': 'Steam', 'calendar.google.com': 'Google Calendar', 'docs.github.com': 'GitHub'}
# Datos del clan que la web debe repetir tal cual (extracto sin datos personales de tarjetas.json).
DATOS = Path(__file__).resolve().parent / 'datos_clan.json'
PREPARAR_IMAGENES = Path(__file__).resolve().parent / 'preparar_imagenes.py'
TARJETAS = Path(os.environ.get('GARRA_TARJETAS') or Path.home() / 'Downloads' / 'garra-iberica' / 'tarjetas.json')
FRANJA = {'es': r'entre las (\d{2}):00 y las (\d{2}):00', 'en': r'between (\d{2}):00 and (\d{2}):00'}
# La encuesta y el recordatorio de la Cacería los publican scripts del proyecto del Discord.
DISCORD = Path(os.environ.get('GARRA_DISCORD') or TARJETAS.parent)
DIAS = {'es': ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'],
        'en': ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']}


def tablas_woff2(datos):
    """Etiquetas de las tablas de un WOFF2, leídas de su directorio (que no va comprimido)."""
    conocidas = ('cmap head hhea hmtx maxp name OS/2 post cvt  fpgm glyf loca prep CFF  VORG EBDT '
                 'EBLC gasp hdmx kern LTSH PCLT VDMX vhea vmtx BASE GDEF GPOS GSUB EBSC JSTF MATH '
                 'CBDT CBLC COLR CPAL SVG  sbix acnt avar bdat bloc bsln cvar fdsc feat fmtx fvar '
                 'gvar hsty just lcar mort morx opbd prop trak Zapf Silf Glat Gloc Feat Sill')
    conocidas = [conocidas[i:i + 4] for i in range(0, len(conocidas), 5)]
    if datos[:4] != b'wOF2':
        raise ValueError('no es WOFF2')
    pos, tablas = 48, []

    def base128():
        nonlocal pos
        valor = 0
        for _ in range(5):
            b = datos[pos]
            pos += 1
            valor = (valor << 7) | (b & 0x7f)
            if not b & 0x80:
                return valor
        raise ValueError('UIntBase128 mal formado')

    for _ in range(int.from_bytes(datos[12:14], 'big')):
        marcas = datos[pos]
        pos += 1
        if marcas & 0x3f == 63:
            etiqueta = datos[pos:pos + 4].decode('latin-1')
            pos += 4
        else:
            etiqueta = conocidas[marcas & 0x3f]
        base128()
        transformada = marcas >> 6
        if (transformada == 0) == (etiqueta in ('glyf', 'loca')):
            base128()
        tablas.append(etiqueta)
    return tablas


# Cabecera WOFF2 y directorio de 9 tablas: etiquetas conocidas, hmtx transformada (lleva
# transformLength), glyf/loca sin transformar a la manera de WOFF2 (también lo llevan), un
# UIntBase128 de dos bytes y una etiqueta escrita a mano.
MUESTRA_WOFF2 = (b'wOF2' + bytes(8) + (9).to_bytes(2, 'big') + bytes(34)
                 + bytes([0, 0x10, 1, 0x36, 0x43, 0x20, 0x10, 8, 4, 9, 0x20,
                          10, 0x81, 0x00, 0x40, 11, 8, 0, 12, 2, 63]) + b'Zzzz' + bytes([1]))


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
        self._oculto = False

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        self.etiquetas.append((tag, a))
        if tag == 'span' and 'oculto' in (a.get('class') or '').split():
            self._oculto = True
        if tag == 'html':
            self.lang = a.get('lang')
        if tag == 'h1':
            self.h1 += 1
        if tag == 'script' and a.get('type') == 'application/ld+json':
            self._jsonld = True
            self.jsonld.append('')
        # Las preguntas frecuentes son desplegables; las fichas plegadas (plegable) no son preguntas.
        if tag == 'details' and 'plegable' not in (a.get('class') or '').split():
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
        if tag == 'span':
            self._oculto = False
        if tag == 'details' and self._details is not None:
            self.preguntas.append(tuple(' '.join(t.split()) for t in self._details))
            self._details = None
        if tag in self.pila:
            while self.pila and self.pila.pop() != tag:
                pass

    def handle_data(self, data):
        if self._jsonld:
            self.jsonld[-1] += data
        # El aviso oculto de pestaña nueva no forma parte de la respuesta (montar_web.preguntas lo quita).
        if self._details is not None and self._campo is not None and not self._oculto:
            self._details[self._campo] += data
        if self._a_nueva:
            self.nuevas[-1][2] += data
        for t in ('title', 'h1'):
            if t in self.pila:
                self.textos[t] += data


def leer(raiz, nombre):
    return (raiz / nombre).read_text(encoding='utf-8')


def medidas_jpeg(fichero):
    """(ancho, alto) de un JPEG leyendo sus marcadores hasta el SOF, sin Pillow"""
    b = fichero.read_bytes()
    i = 2
    while b[:2] == b'\xff\xd8' and i + 9 <= len(b) and b[i] == 0xFF:
        if b[i + 1] in (0xC0, 0xC1, 0xC2):
            return int.from_bytes(b[i + 7:i + 9], 'big'), int.from_bytes(b[i + 5:i + 7], 'big')
        i += 2 + int.from_bytes(b[i + 2:i + 4], 'big')
    return None


def revisar_pagina(raiz, nombre, lang, sufijo, titulo, base, falla, h1, pareja, con_faq, og):
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
    if ' '.join(doc.textos['h1'].split()) != h1:
        falla(f'{nombre}: <h1> es «{" ".join(doc.textos["h1"].split())}» y debe ser «{h1}»')
    desc = metas.get('description') or ''
    if not 70 <= len(desc) <= 160:
        falla(f'{nombre}: meta description mide {len(desc)} caracteres (70–160)')
    if canon != [base + sufijo]:
        falla(f'{nombre}: canonical {canon} y debe ser {base + sufijo}')
    if alternas != {'es': base + pareja[0], 'en': base + pareja[1], 'x-default': base + pareja[0]}:
        falla(f'{nombre}: hreflang {alternas} no enlaza bien las versiones es/en')
    for clave, valor in {'og:url': base + sufijo, 'og:image': base + 'img/' + og, 'og:image:type': 'image/jpeg'}.items():
        if metas.get(clave) != valor:
            falla(f'{nombre}: {clave} es «{metas.get(clave)}» y debe ser «{valor}»')
    # Discord, WhatsApp y compañía la recortan o no la enseñan si no mide lo que dice la página.
    imagen_og = raiz / 'img' / og
    medidas = (metas.get('og:image:width'), metas.get('og:image:height'))
    if not imagen_og.is_file() or medidas_jpeg(imagen_og) != (1200, 630) or medidas != ('1200', '630'):
        falla(f'{nombre}: la imagen al compartir img/{og} no es un JPEG de 1200x630 o la página dice {medidas}')
    if 'max-image-preview:large' not in (metas.get('robots') or ''):
        falla(f'{nombre}: falta <meta name="robots" content="max-image-preview:large, …"> (foto grande en Google)')
    for clave in ('og:title', 'og:description', 'og:image:alt', 'twitter:card'):
        if not metas.get(clave):
            falla(f'{nombre}: falta la meta {clave}')
    if metas.get('twitter:image:alt') != metas.get('og:image:alt'):
        falla(f'{nombre}: twitter:image:alt no dice lo mismo que og:image:alt')
    # Google Search Console verifica la propiedad con esta etiqueta: si desaparece, se pierde el acceso.
    for meta, servicio in (('google-site-verification', 'Google Search Console'), ('msvalidate.01', 'Bing Webmaster Tools')):
        if nombre == 'index.html' and not metas.get(meta):
            falla(f'{nombre}: falta <meta name="{meta}">; sin ella {servicio} deja de verificar la web')
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
            pagina_ld = next((n for n in grafo if n.get('@id', '').endswith('#pagina')), {})
            # Galería: una ImageObject por foto del mosaico, apuntando a su ampliada; guía: una entrada por ficha.
            fotos = re.findall(r'<a class="foto-ampliar" href="([^"]+)"', html)
            imagenes = [i.get('contentUrl', '') for i in pagina_ld.get('image', [])]
            if [Path(f).name for f in fotos] != [Path(i).name for i in imagenes]:
                falla(f'{nombre}: JSON-LD con {len(imagenes)} fotos y la galería enseña {len(fotos)}')
            for i in imagenes:
                if not i.startswith(base) or not (raiz / i[len(base):]).is_file():
                    falla(f'{nombre}: JSON-LD ImageObject «{i}» no apunta a un fichero de la web')
            fichas = re.findall(r'<details class="dino[^"]*" id="([^"]+)"', html)
            lista = [e.get('url', '') for e in pagina_ld.get('mainEntity', {}).get('itemListElement', [])]
            if lista != [f'{base}{sufijo}{a}/' for a in fichas]:
                falla(f'{nombre}: JSON-LD ItemList con {len(lista)} especies y la página tiene {len(fichas)} fichas')
            faq = tipos.get('FAQPage')
            visibles = doc.preguntas
            if not con_faq:
                if faq or visibles:
                    falla(f'{nombre}: tiene preguntas frecuentes y no debería')
            elif not faq or not visibles:
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
        for attr in ('src', 'href', 'poster'):
            v = a.get(attr)
            if v and not re.match(r'(https?:|#|mailto:)', v):
                locales.add(v)
        for attr in ('srcset', 'imagesrcset', 'data-srcset'):
            for parte in (a.get(attr) or '').split(','):
                if parte.strip():
                    locales.add(parte.split()[0])
        if t in ('img', 'link', 'source') and AMPLIADA in ' '.join(a.get(x) or '' for x in ('src', 'srcset', 'href', 'imagesrcset')):
            falla(f'{nombre}: <{t}> carga una foto ampliada al abrir la página; solo se enlazan')
        if t == 'video':
            if a.get('preload') != 'none' or not a.get('poster'):
                falla(f'{nombre}: <video> sin preload="none" y portada: bajaría el vídeo al abrir la página')
            if "media-src 'self'" not in csp:
                falla(f'{nombre}: <video> y la política de seguridad no deja cargar vídeos (media-src)')
        if t == 'img':
            if 'alt' not in a:
                falla(f'{nombre}: <img src="{a.get("src")}"> sin atributo alt')
            if not (a.get('width') and a.get('height')):
                falla(f'{nombre}: <img src="{a.get("src")}"> sin width/height (provoca saltos al cargar)')
    usados = set()
    for ruta in sorted(locales):
        limpia, _, fragmento = ruta.partition('#')
        limpia, _, consulta = limpia.partition('?')
        version = consulta[2:] if consulta.startswith('v=') else ''
        destino = (carpeta / (limpia + 'index.html' if limpia.endswith('/') else limpia)).resolve()
        if not destino.is_file():
            falla(f'{nombre}: referencia a un fichero que no existe: {ruta}')
            continue
        if fragmento and f'id="{fragmento}"' not in destino.read_text(encoding='utf-8'):
            falla(f'{nombre}: enlace {ruta} a una sección que no existe en esa página')
        usados.add(destino)
        # Los carteles llevan el texto dentro: si hay versión en inglés (-en), la página inglesa la usa.
        cartel = re.fullmatch(r'(.+)-(\d+\.webp)', destino.name)
        if lang == 'en' and cartel and destino.with_name(f'{cartel[1]}-en-{cartel[2]}').is_file():
            falla(f'{nombre}: usa {destino.name}, con texto en español; existe {cartel[1]}-en-{cartel[2]}')
        if destino.name in VERSIONADOS and version != huella(destino):
            falla(f'{nombre}: {limpia} lleva ?v={version or "(nada)"} y debe llevar ?v={huella(destino)}; ejecuta herramientas/montar_web.py')
    usados.add(imagen_og.resolve())
    ids = re.findall(r'\sid="([^"]+)"', html)
    for repetido in sorted({i for i in ids if ids.count(i) > 1}):
        falla(f'{nombre}: id="{repetido}" repetido')
    for ancla in sorted(set(re.findall(r'href="#([^"]+)"', html))):
        if f'id="{ancla}"' not in html:
            falla(f'{nombre}: enlace interno #{ancla} sin destino')
    return usados


def franja_latinoamerica(datos, anios):
    """Primera y última hora local en Latinoamérica a la que empieza la Cacería, en todos los
    sábados de esos años."""
    cac = datos['caceria']
    madrid = ZoneInfo(cac['zona'])
    zonas = [ZoneInfo(z) for z in datos['zonas_latinoamerica']]
    horas = set()
    dia = dt.date(anios[0], 1, 1)
    while dia.year <= anios[-1]:
        if dia.isoweekday() % 7 == cac['dia_semana']:
            inicio = dt.datetime(dia.year, dia.month, dia.day, cac['hora'], tzinfo=madrid)
            for z in zonas:
                local = inicio.astimezone(z)
                horas.add(local.hour + local.minute / 60)
        dia += dt.timedelta(days=1)
    return min(horas), max(horas)


def revisar_datos(raiz, falla, avisa):
    datos = json.loads(DATOS.read_text(encoding='utf-8'))
    cac = datos['caceria']
    js = leer(raiz, 'caceria.js')
    for constante, valor in (('ZONA', f"'{cac['zona']}'"), ('SABADO', str(cac['dia_semana'])),
                             ('HORA', str(cac['hora'])), ('DURACION_MIN', str(cac['duracion_min']))):
        if not re.search(rf'const {constante} = {re.escape(valor)};', js):
            falla(f'caceria.js: {constante} no vale {valor} como dice {DATOS.name}')
    avisos_js = re.search(r'const AVISOS = \{([^}]*)\};', js)
    esperados = ', '.join(f"{a['que']}: [{a['dia_semana']}, {a['hora']}]" for a in cac['avisos'])
    if not avisos_js or avisos_js.group(1).strip() != esperados:
        falla(f'caceria.js: AVISOS no es {{ {esperados} }} como dice {DATOS.name}')
    # El selector «¿A qué hora es en tu país?»: zonas que existen y las mismas en los dos idiomas.
    zonas_selector = {}
    for nombre, (pagina, lang) in PAGINAS.items():
        if pagina == 'caceria':
            bloque = re.search(r'<div class="plan" data-horas.*?</select>', leer(raiz, nombre), re.S)
            zonas_selector[lang] = re.findall(r'<option value="([^"]+)"', bloque.group(0)) if bloque else []
            if not zonas_selector[lang]:
                falla(f'{nombre}: falta el selector de la hora en cada país')
            for z in zonas_selector[lang]:
                try:
                    ZoneInfo(z)
                except (KeyError, ValueError):
                    falla(f'{nombre}: la zona horaria {z} del selector no existe')
    if len({frozenset(z) for z in zonas_selector.values()}) > 1:
        falla('El selector de la hora en cada país no tiene las mismas zonas en español y en inglés')

    base = re.search(r'<link rel="canonical" href="([^"]+)"', leer(raiz, 'index.html')).group(1)
    for lang, nombre in calendario.FICHEROS.items():
        fichero = raiz / nombre
        if not fichero.is_file() or fichero.read_bytes() != calendario.ics(lang, base).encode('utf-8'):
            falla(f'{nombre} no coincide con {DATOS.name}: ejecuta herramientas/calendario.py')
        # El enlace del evento abre la página de la Cacería, no la portada (sin el salto de los /#viejos).
        if fichero.is_file() and f'\r\nURL:{base}{RUTA["caceria", lang]}\r\n' not in fichero.read_bytes().decode('utf-8'):
            falla(f'{nombre}: la URL del evento no es la página de la Cacería ({base}{RUTA["caceria", lang]})')
    hoy = dt.date.today()
    primera, ultima = franja_latinoamerica(datos, [hoy.year, hoy.year + 1])
    if primera % 1 or ultima % 1:
        falla(f'La Cacería no cae en hora en punto en Latinoamérica ({primera}–{ultima}): revisa el texto de la franja')
    esperada = (f'{int(primera):02d}', f'{int(ultima):02d}')
    for nombre, (pagina, lang) in PAGINAS.items():
        html = leer(raiz, nombre)
        franjas = re.findall(FRANJA[lang], html)
        for f in set(franjas):
            if f != esperada:
                falla(f'{nombre}: dice {f[0]}:00–{f[1]}:00 en Latinoamérica y, con {DATOS.name}, es {esperada[0]}:00–{esperada[1]}:00')
        # Cualquier otra hora en punto que diga la página es la de la Cacería (o la del Reino Unido,
        # una menos todo el año, o la de un aviso en la página de la Cacería): si cambia en
        # datos_clan.json, ningún texto se queda en la vieja.
        resto = re.sub(FRANJA[lang], '', plano(html))
        if pagina == 'caceria':
            for a in cac['avisos']:
                cita = f'{DIAS[lang][a["dia_semana"] - 1]}, {a["hora"]:02d}:00'
                if cita not in resto:
                    falla(f'{nombre}: no dice «{cita}» ({a["que"]} de la Cacería, {DATOS.name})')
                resto = resto.replace(cita, '')
        for h in re.findall(r'\b(\d{2}):00 in the UK\b', resto):
            if int(h) != (cac['hora'] - 1) % 24:
                falla(f'{nombre}: dice {h}:00 en el Reino Unido y, con {DATOS.name}, son las {(cac["hora"] - 1) % 24:02d}:00')
        resto = re.sub(r'\b\d{2}:00 in the UK\b', '', resto)
        for h in sorted(set(re.findall(r'\b(\d{1,2}):00\b', resto))):
            if int(h) != cac['hora']:
                falla(f'{nombre}: dice {h}:00 y la Cacería es a las {cac["hora"]:02d}:00 ({DATOS.name})')
        if pagina == 'caceria':
            if not franjas:
                falla(f'{nombre}: no dice a qué hora cae la Cacería en Latinoamérica')
            ics = montar_web.enlace(RUTA[pagina, lang], calendario.FICHEROS[lang])
            if f'href="{ics}"' not in html:
                falla(f'{nombre}: falta el enlace para añadir la Cacería al calendario ({ics})')
            if f'href="{calendario.enlace_google(lang, base)}"' not in html:
                falla(f'{nombre}: el enlace a Google Calendar no coincide con {DATOS.name}: ejecuta herramientas/montar_web.py')
        if pagina != 'clan':
            continue
        for a in datos['ascensos']:
            m = re.search(rf'<h4>{re.escape(a["rango"])}(?: \([^)<]*\))?</h4><p>([^<]*)</p>', html)
            if not m:
                falla(f'{nombre}: no encuentro la tarjeta del rango {a["rango"]}')
            elif a[f'web_{lang}'] not in m.group(1):
                falla(f'{nombre}: el rango {a["rango"]} no dice «{a[f"web_{lang}"]}» ({DATOS.name}); dice «{m.group(1)}»')

    for a in cac['avisos']:
        script = DISCORD / a['script']
        if not script.is_file():
            avisa(f'sin {script}: no se comprueba que el {a["que"]} de la Cacería siga a la hora de {DATOS.name}')
            continue
        horas = re.findall(r'^[A-Z]+DAY, HOUR = (\d), (\d+)$', script.read_text(encoding='utf-8'), re.M)
        if horas != [(str(a['dia_semana'] - 1), str(a['hora']))]:
            falla(f'{script.name} publica el {a["que"]} en (día, hora) {horas} y {DATOS.name} dice día {a["dia_semana"]} a las {a["hora"]}:00: actualiza el extracto y la web')

    if not TARJETAS.is_file():
        avisa(f'sin {TARJETAS}: no se comprueba que {DATOS.name} siga al día con el original')
        return
    tarjetas = json.loads(TARJETAS.read_text(encoding='utf-8'))
    citas = [(cac['fuente'], tarjetas['indice']['texto'])]
    for a in datos['ascensos']:
        citas += [(a['fuente_es'], tarjetas['rangos']['texto']), (a['fuente_en'], tarjetas['rangos']['ingles'])]
    for cita, texto in citas:
        if cita not in texto:
            falla(f'{DATOS.name} cita «{cita}» y tarjetas.json ya no lo dice: actualiza el extracto y la web')
    revisar_normas(datos['normas'], tarjetas, falla)
    for lang, clave in (('es', 'texto'), ('en', 'ingles')):
        if datos['alfas'][f'fuente_{lang}'] not in tarjetas['rangos'][clave]:
            falla(f'{DATOS.name} cita «{datos["alfas"][f"fuente_{lang}"]}» y la tarjeta de rangos ya no lo dice: actualiza el extracto')


def sin_formato(texto):
    """Texto de una tarjeta de Discord sin sus emojis propios (<:nombre:id>) ni negritas o cursivas."""
    return re.sub(r'\*', '', re.sub(r'<a?:\w+:\d+>\s*', '', texto))


def revisar_normas(normas, tarjetas, falla):
    """La página de normas sale del extracto: cada norma, con su número, igual que en la tarjeta,
    y ni una más ni una menos."""
    for lang, clave in (('es', 'texto'), ('en', 'ingles')):
        tarjeta = '\n' + sin_formato(tarjetas['normas'][clave]) + '\n'
        n = normas[lang]
        reglas = [r for a in n['apartados'] for r in a['normas']]
        en_tarjeta = re.findall(r'^\d+\. ', tarjeta, re.M)
        if len(en_tarjeta) != len(reglas):
            falla(f'La tarjeta de normas ({clave}) tiene {len(en_tarjeta)} normas y {DATOS.name} ({lang}) {len(reglas)}: actualiza el extracto')
        for i, regla in enumerate(reglas, 1):
            if f'\n{i}. {regla}\n' not in tarjeta:
                falla(f'{DATOS.name} ({lang}): la norma {i} no dice lo mismo que la tarjeta de normas: «{regla}»')
        for a in n['apartados']:
            if f'\n### {a["titulo"]}\n' not in tarjeta:
                falla(f'{DATOS.name} ({lang}): el apartado «{a["titulo"]}» no está en la tarjeta de normas')
        for frase in (n['sanciones_titulo'], ' ➜ '.join(n['sanciones']), n['sanciones_nota'], n['cierre']):
            if frase not in tarjeta:
                falla(f'{DATOS.name} ({lang}): «{frase}» no está en la tarjeta de normas')
        if n['rango'] not in sin_formato(tarjetas['rangos'][clave]):
            falla(f'{DATOS.name} ({lang}): «{n["rango"]}» no está en la tarjeta de rangos')


def revisar_alfas(raiz, falla):
    """Los jefes de El clan son los de la cita de la tarjeta #rangos y justo los de JEFES. Devuelve,
    por fichero, el único texto en el que pueden salir sus nombres sin que salte «sin apodos»."""
    permitidos = {}
    for lang in montar_web.LANGS:
        nombres = montar_web.nombres_alfas(lang)
        if nombres != sorted(JEFES):
            falla(f'{DATOS.name}: la cita de la tarjeta de rangos ({lang}) nombra a {nombres} y la excepción de apodos es para {list(JEFES)}')
            continue
        pagina = raiz / RUTA['clan', lang] / 'index.html'
        fragmento = montar_web.alfas(lang)
        if leer(raiz, RUTA['clan', lang] + 'index.html').count(fragmento) != 1:
            falla(f'{RUTA["clan", lang]}index.html: los tres jefes no salen una vez, tal como los pone montar_web.alfas()')
        permitidos.setdefault(pagina.resolve(), []).append(fragmento)
        permitidos.setdefault(DATOS.resolve(), []).append(json.loads(DATOS.read_text(encoding='utf-8'))['alfas'][f'fuente_{lang}'])
    return permitidos


def revisar_montaje(raiz, d, falla):
    """docs/ debe ser exactamente lo que genera montar_web.py: páginas, guía, mapa del sitio y 404.
    Cualquier retoque a mano en docs/ o fuente sin volver a montar aparece aquí."""
    try:
        salida = montar_web.montar(raiz)
    except SystemExit as e:
        falla(f'montar_web.py no puede montar la web: {e}')
        return
    for nombre, texto in salida.items():
        fichero = raiz / nombre
        if not fichero.is_file() or fichero.read_bytes() != texto.encode('utf-8'):
            falla(f'{nombre} no es lo que genera montar_web.py (paginas/, fichas, estilos o scripts cambiados): ejecuta herramientas/montar_web.py')
    sobrantes = {f.relative_to(raiz).as_posix() for f in raiz.rglob('index.html')} - set(salida)
    for nombre in sorted(sobrantes):
        falla(f'{nombre} no lo genera montar_web.py: sobra (o falta su página en montar_web.PAGINAS)')
    n = str(len(d['fichas']))
    for nombre, (pagina, lang) in PAGINAS.items():
        cuentas = re.findall(r'\b(\d+) (?:fichas|dinosaur cards|cards)\b', plano(leer(raiz, nombre)))
        if set(cuentas) - {n} or (pagina == 'inicio' and not cuentas):
            falla(f'{nombre}: dice {cuentas} fichas y hay {n}')
        if pagina == 'dinosaurios':
            # Cada ficha con mutaciones enlaza al glosario que las explica, y el glosario existe.
            html = leer(raiz, nombre)
            mut_id = guia_dinos.T[lang]['mut_id']
            con_mut = html.count('class="dino-lista dino-mut"')
            enlaces = len(re.findall(rf'<h4 class="dino-h4">[^<]*<a class="dino-glosario" href="#{mut_id}">', html))
            if not con_mut or enlaces != con_mut or f'id="{mut_id}"' not in html:
                falla(f'{nombre}: {con_mut} fichas con mutaciones y {enlaces} enlaces a su glosario (#{mut_id})')


def direccion_especie(nombre):
    """Carpeta de la página de una especie. Es una copia aparte de guia_dinos.ancla() a propósito: si
    alguien cambia esa regla, cambian las direcciones ya publicadas y compartidas, y aquí falla."""
    sin_tildes = unicodedata.normalize('NFKD', nombre).encode('ascii', 'ignore').decode()
    return re.sub(r'[^a-z0-9]+', '-', sin_tildes.lower()).strip('-')


def revisar_especies(raiz, base, falla):
    """Una página por ficha en cada idioma, ni una más ni una menos; cada una enlazada con la de la otra
    lengua, en el mapa del sitio, enlazada desde su ficha de la guía y desde la comparativa, y diciendo lo
    mismo que fichas_dinos.json, que se lee aquí directamente (no a través de montar_web.py)."""
    d = json.loads(guia_dinos.FICHAS.read_text(encoding='utf-8'))
    fichas = {direccion_especie(f['nombre']): f for f in d['fichas']}
    mapa = leer(raiz, 'sitemap.xml')
    for lang, guia in guia_dinos.RUTAS.items():
        otra = 'en' if lang == 'es' else 'es'
        hay = {p.parent.name for p in (raiz / guia).glob('*/index.html')}
        for a in sorted(set(fichas) - hay):
            falla(f'{guia}{a}/: falta la página de {fichas[a]["nombre"]}')
        for a in sorted(hay - set(fichas)):
            falla(f'{guia}{a}/: página de una especie que no tiene ficha en {guia_dinos.FICHAS.name}')
        html_guia = leer(raiz, guia + 'index.html')
        muts = d['mut_en' if lang == 'en' else 'mut']
        for a, f in fichas.items():
            nombre = f'{guia}{a}/index.html'
            if a not in hay:
                continue
            html = leer(raiz, nombre)
            pareja = base + guia_dinos.RUTAS[otra] + a + '/'
            if not (raiz / guia_dinos.RUTAS[otra] / a / 'index.html').is_file() or \
                    f'<link rel="alternate" hreflang="{otra}" href="{pareja}">' not in html:
                falla(f'{nombre}: su versión en «{otra}» ({pareja}) no existe o la página no la enlaza')
            if f'<loc>{base}{guia}{a}/</loc>' not in mapa:
                falla(f'sitemap.xml: falta la página de {f["nombre"]} ({base}{guia}{a}/)')
            enlace = re.escape(f'href="{montar_web.enlace(guia, guia + a + "/")}"')
            if not re.search(rf'<details class="dino[^"]*" id="{a}"[^>]*>\s*<summary class="dino-cabeza"><h3[^>]*><a {enlace}>', html_guia):
                falla(f'{guia}index.html: la ficha de {f["nombre"]} no enlaza a su página')
            if not re.search(rf'data-nombre="{re.escape(f["nombre"])}"[^>]*><dt><a {enlace}>', html_guia):
                falla(f'{guia}index.html: la comparativa no enlaza {f["nombre"]} a su página')
            h1 = re.findall(r'<h1[^>]*>([^<]*)</h1>', html)
            if h1 != [f['nombre']]:
                falla(f'{nombre}: el título es {h1} y debe ser «{f["nombre"]}»')
            en = f['en'] if lang == 'en' else {}
            v = {k: en.get(k, f[k]) for k in ('peso', 'crece', 'hab', 'consejo', 'mutfuente')}
            esperado = {'peso': [v['peso']], 'crece': [v['crece']], 'grupo': [f['grupo']], 'hab': v['hab'],
                        'consejo': [v['consejo']], 'mutfuente': [v['mutfuente']] if f['mut'] else [],
                        'dieta': [guia_dinos.T[lang]['dieta'][f['dieta']]]}
            visto = {}
            for campo, texto in re.findall(r'<\w+ [^>]*data-ficha="(\w+)"[^>]*>(.*?)</', html):
                visto.setdefault(campo, []).append(unescape(texto))
            for campo in sorted(esperado.keys() | visto.keys()):
                if visto.get(campo, []) != esperado.get(campo, []):
                    falla(f'{nombre}: «{campo}» dice {visto.get(campo, [])} y la ficha, {esperado.get(campo, [])}')
            vistas = re.findall(r'<li data-mut="([^"]+)">(.*?)</li>', html)
            if [(k, sin_etiquetas(texto)) for k, texto in vistas] != [(k, muts[k]) for k in f['mut']]:
                falla(f'{nombre}: las mutaciones no son las de la ficha ({[k for k, _ in vistas]} y {f["mut"]})')


def revisar_movidas(raiz, falla):
    """Enlaces viejos a secciones de la portada (/#normas): cada uno lleva a una página y sección
    que existen, y ninguno tapa una sección que siga en la portada."""
    for lang, movidas in montar_web.MOVIDAS.items():
        inicio = RUTA['inicio', lang]
        portada = leer(raiz, inicio + 'index.html')
        for viejo, nuevo in movidas.items():
            if f'id="{viejo}"' in portada:
                falla(f'{inicio}index.html: #{viejo} sigue en la portada y efectos.js lo mandaría a {nuevo}')
            ruta, _, seccion = nuevo.partition('#')
            destino = raiz / inicio / ruta / 'index.html'
            if not destino.is_file():
                falla(f'MOVIDAS[{lang}]: #{viejo} lleva a {inicio}{nuevo}, que no existe')
            elif seccion and f'id="{seccion}"' not in destino.read_text(encoding='utf-8'):
                falla(f'MOVIDAS[{lang}]: #{viejo} lleva a la sección #{seccion}, que no está en {inicio}{ruta}')


def revisar_privacidad(raiz, falla):
    """El aviso legal promete que la web no guarda ni pide nada y nombra a dónde llevan sus enlaces:
    si el código o un enlace nuevo lo desmiente, falla hasta cambiar una de las dos cosas."""
    for js in raiz.glob('*.js'):
        guarda = re.search(r'localStorage|sessionStorage|indexedDB|document\.cookie', js.read_text(encoding='utf-8'))
        if guarda:
            falla(f'{js.name} usa {guarda.group(0)} y el aviso legal dice que la web no guarda nada en el navegador')
    dominios = set()
    for nombre in PAGINAS:
        html = leer(raiz, nombre)
        if re.search(r'<form\b', html):
            falla(f'{nombre}: tiene un formulario y el aviso legal dice que no los hay')
        dominios |= set(re.findall(r'href="https?://([^/"]+)', html))
    dominios -= {urlparse(guia_dinos.base_web(raiz)).netloc}
    for lang in montar_web.LANGS:
        legal = plano(leer(raiz, RUTA['legal', lang] + 'index.html'))
        for dominio in sorted(dominios):
            if dominio not in SITIOS_FUERA:
                falla(f'hay enlaces a {dominio} y no está en SITIOS_FUERA de comprobar.py: añádelo y nómbralo en el aviso legal')
            elif not re.search(rf'{SITIOS_FUERA[dominio]}[^.]*(?:llevan fuera|take you off)', legal):
                falla(f'{RUTA["legal", lang]}index.html: hay enlaces a {dominio} y el apartado de enlaces no nombra {SITIOS_FUERA[dominio]}')
        for dominio, sitio in SITIOS_FUERA.items():
            if dominio not in dominios:
                falla(f'SITIOS_FUERA nombra {dominio} y ninguna página enlaza allí: quítalo también del aviso legal ({sitio})')


def guia_del_discord(posts, titulo):
    """La guía de posts.json (lista «guias») cuyo título contiene `titulo`, o None si no está."""
    try:
        guias = json.loads(posts.read_text(encoding='utf-8'))['guias']
        return next((g for g in guias if titulo in g['titulo'] and g.get('texto') and g.get('ingles')), None)
    except (ValueError, KeyError, TypeError):
        return None


def sin_etiquetas(texto):
    return unescape(' '.join(re.sub(r'<[^>]+>', '', texto).split()))


def grupos_citados(texto, especies):
    """[(especie, número)] de los «Especie N» que dice el texto."""
    return re.findall(rf'\b({"|".join(map(re.escape, especies))})(?:</a>)? (\d+)\b', texto)


def con_grupo_n(texto, especies):
    # El grupo de cada especie se compara aparte, contra su ficha.
    return re.sub(rf'\b({"|".join(map(re.escape, especies))}) \d+\b', r'\1 N', texto)


def combate_discord(texto, especies):
    """Títulos y trozos de la guía de combate del Discord, en orden: cada viñeta, partida por « · »,
    con los canales como «#canal»."""
    titulos, trozos = [], []
    for linea in texto.splitlines():
        if m := re.fullmatch(r'\*\*\d+\. (.+?)\*\*.*', linea.strip()):
            titulos.append(m.group(1))
        elif linea.startswith('• '):
            linea = re.sub(r'<#\d+>', '#canal', linea[2:].replace('**', ''))
            trozos += [con_grupo_n(' '.join(t.split()), especies) for t in linea.split(' · ')]
    return titulos, trozos


def combate_web(html, especies):
    """Lo mismo, de la página: elementos data-guia-titulo y data-guia, con <span data-canal> como «#canal»."""
    html = re.sub(r'<span data-canal>.*?</span>', '#canal', html, flags=re.S)
    titulos = [sin_etiquetas(t) for _, t in re.findall(r'<(\w+)[^>]* data-guia-titulo>(.*?)</\1>', html, re.S)]
    trozos = [con_grupo_n(sin_etiquetas(t), especies) for _, t in re.findall(r'<(\w+)[^>]* data-guia>(.*?)</\1>', html, re.S)]
    return titulos, trozos


def revisar_combate(raiz, d, falla, avisa):
    """La guía de combate de la web dice lo mismo que la del Discord, en el mismo orden, ni más ni menos;
    los tamaños de grupo salen de las fichas (si el Discord dice otro, se avisa)."""
    especies = [f['nombre'] for f in d['fichas']]
    grupo = {f['nombre']: f['grupo'] for f in d['fichas']}
    paginas = {lang: leer(raiz, RUTA['combate', lang] + 'index.html') for lang in montar_web.LANGS}
    for lang, html in paginas.items():
        titulos, trozos = combate_web(html, especies)
        if not titulos or not trozos:
            falla(f'{RUTA["combate", lang]}: no encuentro los apartados (data-guia-titulo) o las viñetas (data-guia) de la guía')
        for especie, n in grupos_citados(html, especies):
            if grupo[especie] != n:
                falla(f'{RUTA["combate", lang]}: dice {especie} {n} y su ficha, {grupo[especie]}')
    if not POSTS_ORIGINAL.is_file():
        avisa(f'sin {POSTS_ORIGINAL}: no se comprueba que la guía de combate siga diciendo lo mismo que el Discord')
        return
    original = guia_del_discord(POSTS_ORIGINAL, GUIA_COMBATE)
    if not original:
        falla(f'{POSTS_ORIGINAL.name}: no encuentro la guía «{GUIA_COMBATE}» (¿ha cambiado su formato?)')
        return
    for lang, campo in (('es', 'texto'), ('en', 'ingles')):
        esperado, web = combate_discord(original[campo], especies), combate_web(paginas[lang], especies)
        for que, a, b in (('apartados', esperado[0], web[0]), ('viñetas', esperado[1], web[1])):
            if a != b:
                distinto = next((f'«{x}» / «{y}»' for x, y in zip(a, b) if x != y), f'{len(a)} en el Discord y {len(b)} en la web')
                falla(f'{RUTA["combate", lang]}: las {que} de la guía de combate no son las del Discord (Discord / web): {distinto}')
        for especie, n in grupos_citados(original[campo], especies):
            if grupo[especie] != n:
                avisa(f'la guía de combate del Discord ({lang}) dice {especie} {n} y su ficha, {grupo[especie]}: la web pone el de la ficha; corrígelo en el Discord')


def medidas_webp(fichero):
    """(ancho, alto) de un WebP leyendo su cabecera (VP8, VP8L o VP8X), sin Pillow"""
    b = fichero.read_bytes()[:30]
    if b[:4] != b'RIFF' or b[8:12] != b'WEBP':
        return None
    if b[12:16] == b'VP8 ':
        return int.from_bytes(b[26:28], 'little') & 0x3FFF, int.from_bytes(b[28:30], 'little') & 0x3FFF
    if b[12:16] == b'VP8L':
        v = int.from_bytes(b[21:25], 'little')
        return (v & 0x3FFF) + 1, ((v >> 14) & 0x3FFF) + 1
    if b[12:16] == b'VP8X':
        return int.from_bytes(b[24:27], 'little') + 1, int.from_bytes(b[27:30], 'little') + 1
    return None


def revisar_galeria(raiz, falla, avisa):
    """Cada foto de la galería, y su vista ampliada, mide lo que da su recorte en preparar_galeria.py:
    si alguien regenera una ampliada con la captura entera donde no toca (chat con nombres de otros
    clanes), cambian sus proporciones y esto falla."""
    for nombre, (_, caja, anchos) in preparar_galeria.FOTOS.items():
        caja_ampliada, anchos_ampliada = preparar_galeria.ampliada_de(nombre)
        for c, ws, sufijo in ((caja, anchos, ''), (caja_ampliada, anchos_ampliada, '-ampliada')):
            cw, ch = c[2] - c[0], c[3] - c[1]
            for w in ws:
                fichero = raiz / 'img' / f'{nombre}{sufijo}-{w}.webp'
                if not fichero.exists():
                    falla(f'falta img/{fichero.name}: ejecuta herramientas/preparar_galeria.py')
                    continue
                esperado, real = (w, round(ch * w / cw)), medidas_webp(fichero)
                if real != esperado:
                    falla(f'img/{fichero.name} mide {real} y su recorte da {esperado}: regenérala con preparar_galeria.py')
    # Cada foto se puede enlazar (galeria/#foto-colina): dirección fija a partir del nombre del fichero, en
    # los dos idiomas igual, porque esos enlaces se pasan por Discord. Y dice lo que dice galeria/fotos.json.
    original = None
    if not FOTOS_ORIGINAL.is_file():
        avisa(f'sin {FOTOS_ORIGINAL}: no se comprueba que el texto de cada foto siga siendo el del Discord')
    else:
        original = {f['archivo']: f for f in json.loads(FOTOS_ORIGINAL.read_text(encoding='utf-8'))['fotos']}
    anclas = {}
    for lang, ruta in (('es', 'galeria/'), ('en', 'en/gallery/')):
        fotos = re.findall(r'<li id="([^"]*)" class="foto[^"]*"><a class="foto-ampliar" href="[^"]*?img/([a-z-]+)-ampliada-\d+\.webp"[^>]*><img [^>]*? alt="([^"]+)"', leer(raiz, ruta + 'index.html'))
        anclas[lang] = [i for i, _, _ in fotos]
        if len(fotos) != len(preparar_galeria.FOTOS) or {n for _, n, _ in fotos} != set(preparar_galeria.FOTOS):
            falla(f'{ruta}: enseña {len(fotos)} fotos con su enlace y preparar_galeria.py tiene {len(preparar_galeria.FOTOS)}')
        for ancla, nombre, alt in fotos:
            if ancla != 'foto-' + nombre.removeprefix('galeria-'):
                falla(f'{ruta}: la foto {nombre} tiene el enlace #{ancla}: los enlaces de las fotos no se cambian')
            f = original and original.get(preparar_galeria.FOTOS[nombre][0])
            if original and not f:
                falla(f'{ruta}: {nombre} no está en {FOTOS_ORIGINAL.name}')
            elif f and f[lang] != unescape(alt):
                falla(f'{ruta}: {nombre} dice «{unescape(alt)}» y {FOTOS_ORIGINAL.name}, «{f[lang]}»')
    if anclas['es'] != anclas['en']:
        falla('la galería no tiene las mismas fotos en el mismo orden en español y en inglés')


def revisar_guia(falla, avisa):
    """Los textos de la guía que vienen del Discord y las fichas siguen al día con el original."""
    if not POSTS_ORIGINAL.is_file():
        avisa(f'sin {POSTS_ORIGINAL}: no se comprueba que «Cómo leer las fichas» siga diciendo lo mismo que el Discord')
    elif not (guia := guia_del_discord(POSTS_ORIGINAL, GUIA_WIKI)):
        falla(f'{POSTS_ORIGINAL.name}: no encuentro la guía «{GUIA_WIKI}» (¿ha cambiado su formato?)')
    else:
        for lang, campo in (('es', 'texto'), ('en', 'ingles')):
            original = ' '.join(guia[campo].replace('**', '').split())
            for _, del_discord, _ in guia_dinos.T[lang]['bloques']:
                for frase in del_discord:
                    frase = re.sub(r'<[^>]+>', '', frase)
                    if frase not in original:
                        falla(f'guia_dinos.py ({lang}) dice «{frase}» y la guía del Discord ya no: copia el texto nuevo')
    if not FICHAS_ORIGINAL.is_file():
        avisa(f'sin {FICHAS_ORIGINAL}: no se comprueba que {guia_dinos.FICHAS.name} siga al día con las fichas del Discord')
    elif FICHAS_ORIGINAL.read_bytes() != guia_dinos.FICHAS.read_bytes():
        falla(f'{guia_dinos.FICHAS.name} no es igual que {FICHAS_ORIGINAL}: cópialo encima y ejecuta herramientas/montar_web.py')
    # Batallas: la fuente es el proyecto del Discord; montar_web.py copia el original al montar.
    if not batallas_web.ORIGINAL.is_file():
        avisa(f'sin {batallas_web.ORIGINAL}: no se comprueba que {batallas_web.COPIA.name} siga al día con las batallas del Discord')
    elif not batallas_web.COPIA.is_file() or batallas_web.ORIGINAL.read_bytes() != batallas_web.COPIA.read_bytes():
        falla(f'{batallas_web.COPIA.name} no es igual que {batallas_web.ORIGINAL}: ejecuta herramientas/montar_web.py (la copia sola)')


def main(raiz, sin_apodos=False, avisa=print):
    fallos = []
    falla = fallos.append
    if sin_apodos:
        avisa('--sin-apodos: no se buscan apodos de miembros (sí los IDs de Discord)')
        apodos = []
    elif VIGILAR.is_file():
        apodos = [l.strip() for l in VIGILAR.read_text(encoding='utf-8').splitlines() if l.strip()]
    elif os.environ.get('VIGILAR_APODOS', '').strip():
        apodos = [l.strip() for l in os.environ['VIGILAR_APODOS'].splitlines() if l.strip()]
    else:
        return [f'Falta herramientas/{VIGILAR.name} (o la variable VIGILAR_APODOS): los apodos de miembros que no deben aparecer, uno por línea']
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
    try:
        d = guia_dinos.datos()
    except SystemExit as e:
        return [f'{guia_dinos.FICHAS.name}: {e}']

    usados = set()
    vistos = {}
    for nombre, (pagina, lang) in PAGINAS.items():
        datos = montar_web.contenido(pagina, lang, d)[0]
        # Cada página con su título y su descripción: repetidos, los buscadores muestran solo una.
        for campo in ('titulo', 'descripcion'):
            if (campo, datos[campo]) in vistos:
                falla(f'{nombre}: misma {campo} que {vistos[campo, datos[campo]]}')
            vistos[campo, datos[campo]] = nombre
        pareja = (RUTA[pagina, 'es'], RUTA[pagina, 'en'])
        usados |= revisar_pagina(raiz, nombre, lang, RUTA[pagina, lang], datos['titulo'], base, falla,
                                 h1=datos['h1'], pareja=pareja, con_faq=pagina == 'unete',
                                 og=montar_web.imagen_og(pagina, lang)[0])
    revisar_montaje(raiz, d, falla)
    revisar_especies(raiz, base, falla)
    revisar_movidas(raiz, falla)
    revisar_privacidad(raiz, falla)
    revisar_datos(raiz, falla, avisa)
    revisar_guia(falla, avisa)
    revisar_combate(raiz, d, falla, avisa)
    revisar_galeria(raiz, falla, avisa)
    permitidos = revisar_alfas(raiz, falla)

    if f'Sitemap: {base}sitemap.xml' not in leer(raiz, 'robots.txt'):
        falla('robots.txt no apunta al sitemap de la dirección canónica')
    try:
        ns = {'s': 'http://www.sitemaps.org/schemas/sitemap/0.9', 'x': 'http://www.w3.org/1999/xhtml',
              'i': 'http://www.google.com/schemas/sitemap-image/1.1'}
        urls = ET.fromstring(leer(raiz, 'sitemap.xml').encode('utf-8')).findall('s:url', ns)
        locs = [u.find('s:loc', ns).text for u in urls]
        esperadas = [base + RUTA[p, lang] for p in montar_web.ORDEN for lang in montar_web.LANGS]
        if locs != esperadas:
            falla(f'sitemap.xml lista {locs} y debe listar {esperadas}')
        for u in urls:
            loc = u.find('s:loc', ns).text
            p = next((p for p in montar_web.ORDEN if loc in (base + RUTA[p, 'es'], base + RUTA[p, 'en'])), 'inicio')
            alt = {l.get('hreflang'): l.get('href') for l in u.findall('x:link', ns)}
            if alt != {'es': base + RUTA[p, 'es'], 'en': base + RUTA[p, 'en'], 'x-default': base + RUTA[p, 'es']}:
                falla(f'sitemap.xml: {loc} sin las alternativas de idioma correctas')
            fotos = [i.text for i in u.findall('i:image/i:loc', ns)]
            if (p == 'galeria') != bool(fotos):
                falla(f'sitemap.xml: {loc} con {len(fotos)} fotos (solo la galería las lista, y todas)')
            for f in fotos:
                if not f.startswith(base) or not (raiz / f[len(base):]).is_file():
                    falla(f'sitemap.xml: la foto {f} no está en la web')
    except (ET.ParseError, AttributeError) as e:
        falla(f'sitemap.xml no es válido: {e}')

    pagina404 = leer(raiz, '404.html')
    # Fuera de la web, la 404 solo puede llevar a la invitación de Discord, avisando de la pestaña nueva.
    discord404 = re.findall(r'<a [^>]*href="https://discord\.[^"]*"[^>]*>.*?</a>', pagina404, re.S)
    if len(discord404) != 1 or f'href="{INVITACION}"' not in discord404[0]:
        falla(f'404.html debe llevar un enlace, y solo uno, a la invitación de Discord ({INVITACION})')
    elif 'rel="noopener"' not in discord404[0] or AVISO_PESTANA['es'] not in discord404[0]:
        falla('404.html: el enlace a Discord abre pestaña nueva sin rel="noopener" o sin avisarlo')
    for url in re.findall(r'(?:href|src)="(https://[^"]+)"', pagina404):
        if url == INVITACION:
            continue
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
                falla(f'404.html: {destino.name} con versión desfasada; ejecuta herramientas/montar_web.py')

    css = leer(raiz, 'estilos.css')
    for u in re.findall(r'url\("?([^")]+)"?\)', css):
        if u.startswith(('data:', '#')):
            continue
        if not (raiz / u).is_file():
            falla(f'estilos.css: referencia a un fichero que no existe: {u}')
        usados.add((raiz / u).resolve())
    # Fuentes sin hinting: con él, a 1× la «i» y la «j» de Barlow pierden el punto y parecen «l».
    # El lector se prueba antes con un directorio hecho a mano: si deja de ver el hinting, falla aquí.
    if tablas_woff2(MUESTRA_WOFF2) != ['cmap', 'head', 'hmtx', 'cvt ', 'fpgm', 'glyf', 'loca', 'prep', 'Zzzz']:
        falla('tablas_woff2 no lee bien el directorio de un WOFF2 de muestra: revisa la función')
    fuentes = re.findall(r'url\("?([^")]+\.woff2)"?\)', css)
    if not fuentes:
        falla('estilos.css no declara ninguna fuente .woff2: revisa esta comprobación')
    for u in fuentes:
        if not (raiz / u).is_file():
            continue
        try:
            tablas = set(tablas_woff2((raiz / u).read_bytes()))
        except (ValueError, IndexError) as e:
            falla(f'{u}: no se puede leer como WOFF2 ({e})')
            continue
        if not {'cmap', 'glyf', 'head'} <= tablas:
            falla(f'{u}: no se encuentran sus tablas básicas; revisa tablas_woff2')
        con_hinting = sorted(t.strip() for t in {'fpgm', 'prep', 'cvt '} & tablas)
        if con_hinting:
            falla(f'{u} lleva hinting ({", ".join(con_hinting)}): regenérala con herramientas/preparar_imagenes.py')
    # Las imágenes del clan pasan al rojo de --ascua en preparar_imagenes.py: los dos tonos van a la par.
    ascua = re.search(r'--ascua:\s*#([0-9a-fA-F]{6});', css)
    lava = re.search(r'^ROJO_LAVA = (\d+)', PREPARAR_IMAGENES.read_text(encoding='utf-8'), re.M)
    if not ascua or not lava:
        falla(f'no encuentro --ascua en estilos.css o ROJO_LAVA en {PREPARAR_IMAGENES.name}: revisa esta comprobación')
    else:
        tono = colorsys.rgb_to_hls(*(int(ascua.group(1)[i:i + 2], 16) / 255 for i in (0, 2, 4)))[0] * 360
        if abs((tono - int(lava.group(1)) + 180) % 360 - 180) > 2:
            falla(f'--ascua tiene tono {tono:.0f}° y ROJO_LAVA es {lava.group(1)}°: iguálalos y ejecuta {PREPARAR_IMAGENES.name}')
    usados.add((raiz / 'img' / 'og-garra-iberica.jpg').resolve())
    for img in sorted((raiz / 'img').glob('*')):
        if img.resolve() not in usados:
            falla(f'img/{img.name} no se usa en ninguna página: sobra')
        kb = img.stat().st_size / 1024
        maximo = MAX_KB_AMPLIADA if AMPLIADA in img.name else MAX_KB_IMAGEN
        if kb > maximo:
            falla(f'img/{img.name} pesa {kb:.0f} KB (máximo {maximo} KB)')
    for video in sorted((raiz / 'video').glob('*')):
        if video.resolve() not in usados:
            falla(f'video/{video.name} no se usa en ninguna página: sobra')
        if video.stat().st_size > MAX_MB_VIDEO * 2**20:
            falla(f'video/{video.name} pesa {video.stat().st_size / 2**20:.0f} MB (máximo {MAX_MB_VIDEO} MB)')

    # También el extracto de herramientas/: el repositorio es público.
    for fichero in [*sorted(raiz.rglob('*')), DATOS, batallas_web.COPIA]:
        if fichero.suffix not in ('.html', '.css', '.js', '.txt', '.xml', '.json', '.md', '.ics'):
            continue
        texto = fichero.read_text(encoding='utf-8')
        for fragmento in permitidos.get(fichero.resolve(), ()):
            texto = texto.replace(fragmento, '')
        nombre = fichero.relative_to(raiz).as_posix() if fichero.is_relative_to(raiz) else f'herramientas/{fichero.name}'
        for patron in prohibidos:
            for m in re.finditer(patron, texto):
                linea = texto.count('\n', 0, m.start()) + 1
                falla(f'{nombre}:{linea}: dato de miembro o de Discord en la web pública: «{m.group(0)}»')

    return fallos


if __name__ == '__main__':
    sys.stdout.reconfigure(encoding='utf-8')
    args = [a for a in sys.argv[1:] if not a.startswith('--')]
    raiz = Path(args[0]) if args else Path(__file__).resolve().parent.parent / 'docs'
    fallos = main(raiz, sin_apodos='--sin-apodos' in sys.argv, avisa=lambda t: print('Aviso:', t))
    for f in fallos:
        print('FALLO:', f)
    print(f'{len(fallos)} fallos' if fallos else 'Todo correcto')
    sys.exit(1 if fallos else 0)
