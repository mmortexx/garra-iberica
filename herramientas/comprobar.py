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
import xml.etree.ElementTree as ET
from zoneinfo import ZoneInfo

import calendario
import guia_dinos
import montar_web
from html.parser import HTMLParser
from montar_web import RUTA, huella
from pathlib import Path

# Todas las páginas las genera herramientas/montar_web.py: {fichero: (página, idioma)}.
PAGINAS = montar_web.FICHEROS
FICHAS_ORIGINAL = Path(os.environ.get('GARRA_FICHAS') or Path.home() / 'Downloads' / 'garra-iberica' / 'wiki' / 'fichas.json')
# Guía de la wiki del Discord: las frases de «Cómo leer las fichas» marcadas como suyas deben seguir diciéndolo.
POSTS_ORIGINAL = Path(os.environ.get('GARRA_POSTS') or FICHAS_ORIGINAL.with_name('posts.json'))
INVITACION = 'https://discord.com/invite/txpBJzXvtK'
VERSIONADOS = montar_web.VERSIONADOS
MAX_KB_IMAGEN = 120
# Las fotos de la galería a tamaño grande solo se descargan si alguien abre una.
AMPLIADA = '-ampliada-'
MAX_KB_AMPLIADA = 1200
# IDs de Discord: no deben salir en la web pública. Los apodos de miembros a vigilar están en
# herramientas/vigilar.local.txt (uno por línea), que git ignora para no publicarlos.
ID_DISCORD = r'\b\d{17,20}\b'
VIGILAR = Path(__file__).resolve().parent / 'vigilar.local.txt'
AVISO_PESTANA = {'es': 'se abre en una pestaña nueva', 'en': 'opens in a new tab'}
# Datos del clan que la web debe repetir tal cual (extracto sin datos personales de tarjetas.json).
DATOS = Path(__file__).resolve().parent / 'datos_clan.json'
PREPARAR_IMAGENES = Path(__file__).resolve().parent / 'preparar_imagenes.py'
TARJETAS = Path(os.environ.get('GARRA_TARJETAS') or Path.home() / 'Downloads' / 'garra-iberica' / 'tarjetas.json')
FRANJA = {'es': r'entre las (\d{2}):00 y las (\d{2}):00', 'en': r'between (\d{2}):00 and (\d{2}):00'}


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


def revisar_pagina(raiz, nombre, lang, sufijo, titulo, base, falla, h1, pareja, con_faq):
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
    for clave, valor in {'og:url': base + sufijo, 'og:image': base + 'img/og-garra-iberica.jpg'}.items():
        if metas.get(clave) != valor:
            falla(f'{nombre}: {clave} es «{metas.get(clave)}» y debe ser «{valor}»')
    if 'max-image-preview:large' not in (metas.get('robots') or ''):
        falla(f'{nombre}: falta <meta name="robots" content="max-image-preview:large, …"> (foto grande en Google)')
    for clave in ('og:title', 'og:description', 'og:image:alt', 'twitter:card'):
        if not metas.get(clave):
            falla(f'{nombre}: falta la meta {clave}')
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
        for attr in ('src', 'href'):
            v = a.get(attr)
            if v and not re.match(r'(https?:|#|mailto:)', v):
                locales.add(v)
        for attr in ('srcset', 'imagesrcset', 'data-srcset'):
            for parte in (a.get(attr) or '').split(','):
                if parte.strip():
                    locales.add(parte.split()[0])
        if t in ('img', 'link', 'source') and AMPLIADA in ' '.join(a.get(x) or '' for x in ('src', 'srcset', 'href', 'imagesrcset')):
            falla(f'{nombre}: <{t}> carga una foto ampliada al abrir la página; solo se enlazan')
        if t == 'img':
            if 'alt' not in a:
                falla(f'{nombre}: <img src="{a.get("src")}"> sin atributo alt')
            if not (a.get('width') and a.get('height')):
                falla(f'{nombre}: <img src="{a.get("src")}"> sin width/height (provoca saltos al cargar)')
    usados = set()
    for ruta in sorted(locales):
        limpia, _, version = ruta.partition('?v=')
        limpia, _, fragmento = limpia.partition('#')
        destino = (carpeta / (limpia + 'index.html' if limpia.endswith('/') else limpia)).resolve()
        if not destino.is_file():
            falla(f'{nombre}: referencia a un fichero que no existe: {ruta}')
            continue
        if fragmento and f'id="{fragmento}"' not in destino.read_text(encoding='utf-8'):
            falla(f'{nombre}: enlace {ruta} a una sección que no existe en esa página')
        usados.add(destino)
        if destino.name in VERSIONADOS and version != huella(destino):
            falla(f'{nombre}: {limpia} lleva ?v={version or "(nada)"} y debe llevar ?v={huella(destino)}; ejecuta herramientas/montar_web.py')
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

    base = re.search(r'<link rel="canonical" href="([^"]+)"', leer(raiz, 'index.html')).group(1)
    for lang, nombre in calendario.FICHEROS.items():
        fichero = raiz / nombre
        if not fichero.is_file() or fichero.read_bytes() != calendario.ics(lang, base).encode('utf-8'):
            falla(f'{nombre} no coincide con {DATOS.name}: ejecuta herramientas/calendario.py')
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
        # una menos todo el año): si cambia en datos_clan.json, ningún texto se queda en la vieja.
        resto = re.sub(FRANJA[lang], '', plano(html))
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


def revisar_guia(falla, avisa):
    """Los textos de la guía que vienen del Discord y las fichas siguen al día con el original."""
    if not POSTS_ORIGINAL.is_file():
        avisa(f'sin {POSTS_ORIGINAL}: no se comprueba que «Cómo leer las fichas» siga diciendo lo mismo que el Discord')
    else:
        guia = json.loads(POSTS_ORIGINAL.read_text(encoding='utf-8'))['guia']
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
                                 h1=datos['h1'], pareja=pareja, con_faq=pagina == 'unete')
    revisar_montaje(raiz, d, falla)
    revisar_movidas(raiz, falla)
    revisar_datos(raiz, falla, avisa)
    revisar_guia(falla, avisa)

    if f'Sitemap: {base}sitemap.xml' not in leer(raiz, 'robots.txt'):
        falla('robots.txt no apunta al sitemap de la dirección canónica')
    try:
        ns = {'s': 'http://www.sitemaps.org/schemas/sitemap/0.9', 'x': 'http://www.w3.org/1999/xhtml'}
        urls = ET.fromstring(leer(raiz, 'sitemap.xml').encode('utf-8')).findall('s:url', ns)
        locs = [u.find('s:loc', ns).text for u in urls]
        esperadas = [base + RUTA[p, lang] for p, _, _ in montar_web.PAGINAS for lang in montar_web.LANGS]
        if locs != esperadas:
            falla(f'sitemap.xml lista {locs} y debe listar {esperadas}')
        for u in urls:
            loc = u.find('s:loc', ns).text
            p = next((p for p, _, _ in montar_web.PAGINAS if loc in (base + RUTA[p, 'es'], base + RUTA[p, 'en'])), 'inicio')
            alt = {l.get('hreflang'): l.get('href') for l in u.findall('x:link', ns)}
            if alt != {'es': base + RUTA[p, 'es'], 'en': base + RUTA[p, 'en'], 'x-default': base + RUTA[p, 'es']}:
                falla(f'sitemap.xml: {loc} sin las alternativas de idioma correctas')
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

    # También el extracto de herramientas/: el repositorio es público.
    for fichero in [*sorted(raiz.rglob('*')), DATOS]:
        if fichero.suffix not in ('.html', '.css', '.js', '.txt', '.xml', '.json', '.md', '.ics'):
            continue
        texto = fichero.read_text(encoding='utf-8')
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
