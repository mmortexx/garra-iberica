"""Genera la guía de dinosaurios de la web (docs/dinosaurios/ y docs/en/dinosaurs/) a partir de
herramientas/fichas_dinos.json, copia exacta de las fichas de la wiki del Discord del clan
(garra-iberica/wiki/fichas.json).

Uso: python herramientas/guia_dinos.py
Hay que ejecutarlo si cambian las fichas (copiar antes wiki/fichas.json encima de fichas_dinos.json),
estilos.css o efectos.js. comprobar.py falla si las páginas no coinciden con lo que genera esto.
"""
import json
import re
import sys
import unicodedata
from html import escape
from pathlib import Path

HERRAMIENTAS = Path(__file__).resolve().parent
DOCS = HERRAMIENTAS.parent / 'docs'
FICHAS = HERRAMIENTAS / 'fichas_dinos.json'
INVITACION = 'https://discord.com/invite/txpBJzXvtK'
STEAM = 'https://store.steampowered.com/app/376210/'
RUTAS = {'es': 'dinosaurios/', 'en': 'en/dinosaurs/'}
FICHEROS = {lang: ruta + 'index.html' for lang, ruta in RUTAS.items()}
GRUPO = {'Carnívoro': 'carnivoros', 'Carnívoro (pescador)': 'carnivoros', 'Herbívoro': 'herbivoros', 'Omnívoro': 'omnivoros'}

T = {
    'es': {
        'titulo': 'Guía de dinosaurios de The Isle Evrima en español – GARRA IBÉRICA',
        'og': 'Guía de dinosaurios de The Isle Evrima – GARRA IBÉRICA',
        'h1': 'Guía de dinosaurios de The Isle Evrima',
        'desc': 'Las {n} especies jugables de The Isle Evrima en español: peso, crecimiento, grupo máximo, '
                'controles, consejos y mutaciones recomendadas por la comunidad.',
        'og_alt': 'Cartel del clan GARRA IBÉRICA de The Isle Evrima: tres arañazos de garra al rojo vivo sobre una roca en la selva',
        'locale': ('es_ES', 'en_GB'), 'saltar': 'Saltar al contenido', 'secciones': 'Secciones',
        'marca': 'GARRA IBÉRICA, volver a la web del clan', 'otra': ('en', 'English version', 'EN'),
        'unete': 'Únete<span class="oculto"> en Discord (se abre en una pestaña nueva)</span>',
        'nueva': ' (se abre en una pestaña nueva)',
        'grupos': {'carnivoros': 'Carnívoros', 'herbivoros': 'Herbívoros', 'omnivoros': 'Omnívoros'},
        'especies': lambda n: f'{n} especies' if n != 1 else '1 especie',
        'menu_mut': 'Mutaciones',
        'antetitulo': 'Guía del clan',
        'intro': 'Las {n} fichas que usamos en el Discord del clan, para que nadie empiece a ciegas: peso, crecimiento, '
                 'tamaño máximo de grupo, controles, un consejo y las mutaciones que recomienda la comunidad.',
        'revisado': 'Revisado el {fecha} · parche {parche}',
        'indice': 'Especies',
        'leer_ante': 'Antes de empezar', 'leer_h2': 'Cómo leer las fichas',
        # (título, frases copiadas de la guía del Discord, frases propias de la web).
        'bloques': [
            ('Términos', [
                '<b>Prime</b>: adulto que cumplió 5 requisitos antes del 75 % de crecimiento (dieta perfecta, santuario, migraciones…): más peso, bonus y un hueco más de mutación.',
                '<b>Frail</b>: adulto que no llegó a Prime; desde el 87,5 % va perdiendo fuerza.',
                '<b>Crecimiento</b>: tiempo base del juego (1×). En servidores con multiplicador es menor.',
            ], [
                '<b>Grupo máx.</b>: tamaño máximo de grupo de la especie.',
            ]),
            ('Mutaciones', [
                'Al crecer eliges mutaciones en huecos (slots); otras se desbloquean cumpliendo tareas.',
                'Con el animal al 100 % puedes hacer <b>Entomb</b>: vuelves a empezar de cría conservando mutaciones mejoradas (parche 0.21.321, 28/12/2025).',
                'Huecos: uno de juvenil, otro de subadulto y otro de adulto; el Prime gana un 4.º. Los pequeños se heredan de los padres.',
                'Las recomendadas de cada ficha son <b>orientativas</b>: salen de guías de la comunidad.',
            ], []),
            ('Datos al día', [], [
                '{revisado}.',
                'Fuentes: Evrima Quick Guide, theisle.info y la web oficial de The Isle.',
                '¿Ves un dato mal o desfasado? Avísanos en el Discord y lo corregimos.',
            ]),
        ],
        'peso': 'Peso adulto', 'crece': 'Crecimiento', 'grupo': 'Grupo máx.', 'hab': 'Habilidades',
        'consejo': 'Consejo', 'mut': 'Mutaciones recomendadas',
        'fuente': 'Orientativas: {fuente}.', 'sin': 'Aún no hay una recomendación fiable para esta especie.',
        'dieta': {'Carnívoro': 'Carnívoro', 'Carnívoro (pescador)': 'Carnívoro (pescador)', 'Herbívoro': 'Herbívoro', 'Omnívoro': 'Omnívoro'},
        'mut_ante': 'Glosario', 'mut_h2': 'Mutaciones',
        'mut_intro': 'Las que recomiendan las fichas y lo que hace cada una. Son orientativas: salen de guías de la comunidad.',
        'cta_h2': '¿Con qué especie te unes?',
        'cta_p': 'En el Discord tienes estas fichas, una manada con la que jugarlas y una cacería cada sábado.',
        'cta_boton': 'Únete a GARRA IBÉRICA en Discord', 'volver': 'Volver a la web del clan',
        'pie_texto': 'Clan español de The Isle Evrima, abierto a jugadores de España y Latinoamérica.',
        'pie_menu_label': 'Pie de página',
        'pie_menu': [('quienes', 'Quiénes somos'), ('buscas-clan', 'Reclutamiento'), ('ofrecemos', 'Qué ofrecemos'),
                     ('galeria', 'Galería'), ('entrar', 'Cómo entrar'), ('caceria', 'Cacería'), ('normas', 'Normas'),
                     ('rangos', 'Rangos'), ('preguntas', 'Preguntas')],
        'pie_discord': 'Discord del clan', 'pie_steam': 'The Isle en Steam', 'arriba': 'Volver arriba ↑',
        'legal': 'Web de fans hecha por el clan. No estamos afiliados a los creadores de The Isle ni a Discord. Las marcas pertenecen a sus dueños.',
        'inicio': 'inicio',
    },
    'en': {
        'titulo': 'The Isle Evrima Dinosaur Guide – GARRA IBÉRICA',
        'og': 'The Isle Evrima Dinosaur Guide – GARRA IBÉRICA',
        'h1': 'The Isle Evrima dinosaur guide',
        'desc': 'All {n} playable species in The Isle Evrima: weight, growth, max group, controls, tips and '
                'community-recommended mutations. A guide by clan GARRA IBÉRICA.',
        'og_alt': 'Poster of the GARRA IBÉRICA The Isle Evrima clan: three red-hot claw marks on a rock in the jungle',
        'locale': ('en_GB', 'es_ES'), 'saltar': 'Skip to content', 'secciones': 'Sections',
        'marca': 'GARRA IBÉRICA, back to the clan website', 'otra': ('es', 'Versión en español', 'ES'),
        'unete': 'Join<span class="oculto"> on Discord (opens in a new tab)</span>',
        'nueva': ' (opens in a new tab)',
        'grupos': {'carnivoros': 'Carnivores', 'herbivoros': 'Herbivores', 'omnivoros': 'Omnivores'},
        'especies': lambda n: f'{n} species',
        'menu_mut': 'Mutations',
        'antetitulo': 'Clan guide',
        'intro': 'The {n} cards we use on the clan Discord, so nobody starts blind: weight, growth, max group size, '
                 'controls, a tip and the mutations the community recommends.',
        'revisado': 'Reviewed {fecha} · patch {parche}',
        'indice': 'Species',
        'leer_ante': 'Before you start', 'leer_h2': 'How to read the cards',
        'bloques': [
            ('Terms', [
                '<b>Prime</b>: adult that met 5 requirements before 75% growth (perfect diet, sanctuary, migrations…): more weight, bonuses and one more mutation slot.',
                '<b>Frail</b>: adult that did not reach Prime; from 87.5% it slowly gets weaker.',
                "<b>Growth</b>: the game's base time (1×). On servers with a multiplier it is shorter.",
            ], [
                '<b>Max group</b>: the largest group size for the species.',
            ]),
            ('Mutations', [
                'As you grow you pick mutations in slots; others unlock by completing tasks.',
                'With your animal at 100% you can <b>Entomb</b>: you start over as a hatchling and keep your upgraded mutations (patch 0.21.321, 28 Dec 2025).',
                'Slots: one as a juvenile, one as a sub-adult and one as an adult; a Prime gets a 4th. The small ones are inherited from your parents.',
                'The recommended ones in each card are <b>only a rough guide</b>: they come from community guides.',
            ], []),
            ('Up-to-date data', [], [
                '{revisado}.',
                'Sources: Evrima Quick Guide, theisle.info and the official The Isle website.',
                'Spotted something wrong or outdated? Tell us on Discord and we will fix it.',
            ]),
        ],
        'peso': 'Adult weight', 'crece': 'Growth', 'grupo': 'Max group', 'hab': 'Abilities',
        'consejo': 'Tip', 'mut': 'Recommended mutations',
        'fuente': 'A rough guide: {fuente}.', 'sin': 'No reliable recommendation for this species yet.',
        'dieta': {'Carnívoro': 'Carnivore', 'Carnívoro (pescador)': 'Carnivore (fish-eater)', 'Herbívoro': 'Herbivore', 'Omnívoro': 'Omnivore'},
        'mut_ante': 'Glossary', 'mut_h2': 'Mutations',
        'mut_intro': 'The ones the cards recommend and what each one does. They are only a rough guide: they come from community guides.',
        'cta_h2': 'Which species will you join with?',
        'cta_p': 'On Discord you get these cards, a pack to play them with and a hunt every Saturday. The clan speaks Spanish.',
        'cta_boton': 'Join GARRA IBÉRICA on Discord', 'volver': 'Back to the clan website',
        'pie_texto': 'Spanish-speaking The Isle Evrima clan, open to players from Spain and Latin America.',
        'pie_menu_label': 'Footer',
        'pie_menu': [('about', 'About'), ('recruiting', 'Recruitment'), ('offer', 'What we offer'), ('gallery', 'Gallery'),
                     ('join', 'How to join'), ('hunt', 'Clan hunt'), ('rules', 'Rules'), ('ranks', 'Ranks'), ('faq', 'FAQ')],
        'pie_discord': 'Clan Discord', 'pie_steam': 'The Isle on Steam', 'arriba': 'Back to top ↑',
        'legal': 'Fan site made by the clan. We are not affiliated with the creators of The Isle or with Discord. All trademarks belong to their owners.',
        'inicio': 'top',
    },
}
MENU_GRUPOS = {'es': ['carnivoros', 'herbivoros', 'omnivoros'], 'en': ['carnivores', 'herbivores', 'omnivores']}


def datos():
    d = json.loads(FICHAS.read_text(encoding='utf-8'))
    nombres = [f['nombre'] for f in d['fichas']]
    if len(set(nombres)) != len(nombres):
        sys.exit(f'{FICHAS.name}: especies repetidas')
    anclas = [ancla(n) for n in nombres]
    if '' in anclas or len(set(anclas)) != len(anclas):
        sys.exit(f'{FICHAS.name}: dos especies dan el mismo enlace o uno vacío: {anclas}')
    for f in d['fichas']:
        if f['dieta'] not in GRUPO:
            sys.exit(f'{FICHAS.name}: {f["nombre"]} con dieta desconocida «{f["dieta"]}»')
        for k in f['mut']:
            if k not in d['mut'] or k not in d['mut_en']:
                sys.exit(f'{FICHAS.name}: {f["nombre"]} recomienda la mutación desconocida {k}')
    return d


def base_web(docs=DOCS):
    canon = re.search(r'<link rel="canonical" href="([^"]+)"', (docs / 'index.html').read_text(encoding='utf-8'))
    if not canon:
        sys.exit('index.html no tiene <link rel="canonical">')
    return canon.group(1)


def revision(d):
    m = re.search(r'Revisado el (\d{2})/(\d{2})/(\d{4}) · parche ([\d.]+)', d['pie'])
    if not m:
        sys.exit(f'{FICHAS.name}: «pie» no dice «Revisado el DD/MM/AAAA · parche X»')
    dia, mes, anio, parche = m.groups()
    meses = 'Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec'.split()
    fechas = {'es': f'{dia}/{mes}/{anio}', 'en': f'{int(dia)} {meses[int(mes) - 1]} {anio}'}
    return fechas, f'{anio}-{mes}-{dia}', parche


def ancla(nombre):
    sin_tildes = unicodedata.normalize('NFKD', nombre).encode('ascii', 'ignore').decode()
    return re.sub(r'[^a-z0-9]+', '-', sin_tildes.lower()).strip('-')


def mutacion(texto):
    nombre, _, efecto = texto.partition(': ')
    return f'<b>{escape(nombre)}</b>: {escape(efecto)}'


def ficha(f, d, lang):
    t = T[lang]
    en = f['en'] if lang == 'en' else {}
    v = {k: en.get(k, f[k]) for k in ('peso', 'crece', 'hab', 'consejo', 'mutfuente')}
    muts = d['mut_en'] if lang == 'en' else d['mut']
    a = ancla(f['nombre'])
    dieta = GRUPO[f['dieta']].rstrip('s')
    partes = [
        f'<article class="dino panel luz revelar" id="{a}" aria-labelledby="d-{a}">',
        f'  <div class="dino-cabeza"><h3 id="d-{a}">{escape(f["nombre"])}</h3>'
        f'<span class="dieta dieta-{dieta}">{escape(t["dieta"][f["dieta"]])}</span></div>',
        '  <dl class="dino-datos">',
        f'    <div><dt>{t["peso"]}</dt><dd>{escape(v["peso"])}</dd></div>',
        f'    <div><dt>{t["crece"]}</dt><dd>{escape(v["crece"])}</dd></div>',
        f'    <div><dt>{t["grupo"]}</dt><dd>{escape(f["grupo"])}</dd></div>',
        '  </dl>',
        f'  <h4>{t["hab"]}</h4>',
        '  <ul class="dino-lista" role="list">',
        *[f'    <li>{escape(h)}</li>' for h in v['hab']],
        '  </ul>',
        f'  <p class="dino-consejo"><b>{t["consejo"]}:</b> {escape(v["consejo"])}</p>',
        f'  <h4>{t["mut"]}</h4>',
    ]
    if f['mut']:
        partes += ['  <ul class="dino-lista dino-mut" role="list">',
                   *[f'    <li>{mutacion(muts[k])}</li>' for k in f['mut']],
                   '  </ul>',
                   f'  <p class="dino-fuente">{escape(t["fuente"].format(fuente=v["mutfuente"]))}</p>']
    else:
        partes.append(f'  <p class="dino-fuente">{t["sin"]}</p>')
    partes.append('</article>')
    return '\n'.join('        ' + p for p in partes)


def pagina(lang, base=None, d=None, docs=DOCS):
    base = base or base_web(docs)
    d = d or datos()
    t = T[lang]
    otro = 'en' if lang == 'es' else 'es'
    sube = '../' * RUTAS[lang].count('/')
    inicio_web = '../' if lang == 'en' else sube
    otra_guia = sube + RUTAS[otro]
    url = base + RUTAS[lang]
    portada = base + ('en/' if lang == 'en' else '')
    from comprobar import huella
    v = {n: huella(docs / n) for n in ('estilos.css', 'efectos.js')}
    fechas, fecha_iso, parche = revision(d)
    revisado = t['revisado'].format(fecha=fechas[lang], parche=parche)
    n = len(d['fichas'])
    desc = t['desc'].format(n=n)
    if not 70 <= len(desc) <= 160:
        sys.exit(f'Descripción en {lang} de {len(desc)} caracteres (70–160)')
    ids = dict(zip(['carnivoros', 'herbivoros', 'omnivoros'], MENU_GRUPOS[lang]))
    grupos = {g: [f for f in d['fichas'] if GRUPO[f['dieta']] == g] for g in ids}
    otra_lang, otra_titulo, otra_corto = t['otra']
    nueva = t['nueva']

    jsonld = {
        '@context': 'https://schema.org',
        '@graph': [
            {'@type': 'Organization', '@id': base + '#clan', 'name': 'GARRA IBÉRICA', 'url': base,
             'logo': base + 'apple-touch-icon.png', 'image': base + 'img/og-garra-iberica.jpg', 'sameAs': [INVITACION]},
            {'@type': 'VideoGame', '@id': base + '#juego', 'name': 'The Isle', 'alternateName': 'The Isle Evrima',
             'gamePlatform': 'PC', 'sameAs': [STEAM, 'https://www.theisle-game.com/']},
            {'@type': 'WebPage', '@id': url + '#pagina', 'url': url, 'name': t['titulo'], 'description': desc,
             'inLanguage': lang, 'dateModified': fecha_iso, 'isPartOf': {'@id': base + '#web'},
             'about': {'@id': base + '#juego'}, 'publisher': {'@id': base + '#clan'},
             'breadcrumb': {'@id': url + '#migas'}},
            {'@type': 'BreadcrumbList', '@id': url + '#migas', 'itemListElement': [
                {'@type': 'ListItem', 'position': 1, 'name': 'GARRA IBÉRICA', 'item': portada},
                {'@type': 'ListItem', 'position': 2, 'name': t['h1'], 'item': url}]},
        ],
    }
    ld = json.dumps(jsonld, ensure_ascii=False, indent=2)

    indice = []
    for g, id_ in ids.items():
        indice += [f'          <div class="indice-grupo">',
                   f'            <p><a href="#{id_}">{t["grupos"][g]}</a></p>',
                   '            <ul role="list">',
                   *[f'              <li><a href="#{ancla(f["nombre"])}">{escape(f["nombre"])}</a></li>' for f in grupos[g]],
                   '            </ul>',
                   '          </div>']

    bloques = []
    for titulo, del_discord, propias in t['bloques']:
        items = del_discord + propias
        bloques += [f'        <section class="bloque panel luz revelar" aria-labelledby="b-{ancla(titulo)}">',
                    f'          <h3 id="b-{ancla(titulo)}">{titulo}</h3>',
                    '          <ul role="list">',
                    *[f'            <li>{i.format(revisado=revisado)}</li>' for i in items],
                    '          </ul>',
                    '        </section>']

    secciones = []
    for g, id_ in ids.items():
        secciones += [
            f'  <section class="seccion" id="{id_}" aria-labelledby="t-{id_}">',
            '    <div class="envoltura">',
            '      <div class="revelar">',
            f'        <p class="antetitulo">{t["especies"](len(grupos[g]))}</p>',
            f'        <h2 id="t-{id_}">{t["grupos"][g]}</h2>',
            '      </div>',
            '      <div class="dinos">',
            *[ficha(f, d, lang) for f in grupos[g]],
            '      </div>',
            '    </div>',
            '  </section>',
            '']

    muts = d['mut_en'] if lang == 'en' else d['mut']
    glosario = []
    for k in d['mut']:
        nombre, _, efecto = muts[k].partition(': ')
        glosario.append(f'        <div><dt>{escape(nombre)}</dt><dd>{escape(efecto[:1].upper() + efecto[1:])}</dd></div>')

    mut_id = 'mutaciones' if lang == 'es' else 'mutations'
    lineas = [
        '<!doctype html>',
        f'<html lang="{lang}">',
        '<head>',
        '<meta charset="utf-8">',
        '<meta name="viewport" content="width=device-width, initial-scale=1">',
        f'<title>{t["titulo"]}</title>',
        f'<meta name="description" content="{escape(desc)}">',
        '<meta name="robots" content="max-image-preview:large, max-snippet:-1">',
        '<meta http-equiv="Content-Security-Policy" content="default-src \'none\'; script-src \'self\'; connect-src \'self\'; style-src \'self\'; font-src \'self\'; img-src \'self\' data:; base-uri \'none\'; form-action \'none\'">',
        '<meta name="referrer" content="strict-origin-when-cross-origin">',
        '<meta name="theme-color" content="#0b0806">',
        f'<link rel="canonical" href="{url}">',
        f'<link rel="alternate" hreflang="es" href="{base + RUTAS["es"]}">',
        f'<link rel="alternate" hreflang="en" href="{base + RUTAS["en"]}">',
        f'<link rel="alternate" hreflang="x-default" href="{base + RUTAS["es"]}">',
        f'<link rel="preload" href="{sube}fonts/anton.woff2" as="font" type="font/woff2" crossorigin>',
        f'<link rel="preload" href="{sube}fonts/barlow-600.woff2" as="font" type="font/woff2" crossorigin>',
        f'<link rel="stylesheet" href="{sube}estilos.css?v={v["estilos.css"]}">',
        f'<script src="{sube}efectos.js?v={v["efectos.js"]}" defer></script>',
        f'<link rel="icon" href="{sube}favicon.ico" sizes="16x16 32x32 48x48">',
        f'<link rel="apple-touch-icon" href="{sube}apple-touch-icon.png">',
        '',
        '<meta property="og:type" content="article">',
        f'<meta property="og:locale" content="{t["locale"][0]}">',
        f'<meta property="og:locale:alternate" content="{t["locale"][1]}">',
        '<meta property="og:site_name" content="GARRA IBÉRICA">',
        f'<meta property="og:title" content="{t["og"]}">',
        f'<meta property="og:description" content="{escape(desc)}">',
        f'<meta property="og:url" content="{url}">',
        f'<meta property="og:image" content="{base}img/og-garra-iberica.jpg">',
        '<meta property="og:image:width" content="1200">',
        '<meta property="og:image:height" content="630">',
        f'<meta property="og:image:alt" content="{t["og_alt"]}">',
        '<meta name="twitter:card" content="summary_large_image">',
        '',
        '<script type="application/ld+json">',
        ld,
        '</script>',
        '</head>',
        '<body>',
        f'<a class="saltar" href="#contenido">{t["saltar"]}</a>',
        '',
        '<header class="barra">',
        '  <div class="barra-in">',
        f'    <a class="marca" href="{inicio_web}" aria-label="{t["marca"]}">',
        f'      <img src="{sube}img/emoji-garra.webp" alt="" width="36" height="36">',
        '      <span>GARRA IBÉRICA</span>',
        '    </a>',
        f'    <nav class="menu" aria-label="{t["secciones"]}">',
        *[f'      <a href="#{id_}">{t["grupos"][g]}</a>' for g, id_ in ids.items()],
        f'      <a href="#{mut_id}">{t["menu_mut"]}</a>',
        '    </nav>',
        '    <div class="barra-acciones">',
        f'      <a class="idioma" href="{otra_guia}" hreflang="{otra_lang}" lang="{otra_lang}" title="{otra_titulo}">{otra_corto}</a>',
        f'      <a class="boton boton-mini" href="{INVITACION}" rel="noopener" target="_blank">{t["unete"]}</a>',
        '    </div>',
        '  </div>',
        '  <span class="progreso" aria-hidden="true"></span>',
        '</header>',
        '',
        '<main id="contenido">',
        f'  <section class="seccion guia-cabeza" id="{t["inicio"]}" aria-labelledby="titulo">',
        f'    <img class="guia-fondo" src="{sube}img/galeria-noche-1200.webp" srcset="{sube}img/galeria-noche-800.webp 800w, '
        f'{sube}img/galeria-noche-1200.webp 1200w, {sube}img/galeria-noche-1600.webp 1600w" sizes="100vw" alt="" '
        'width="1600" height="670" fetchpriority="high">',
        '    <div class="envoltura">',
        '      <div class="revelar">',
        f'        <p class="antetitulo">{t["antetitulo"]}</p>',
        f'        <h1 id="titulo">{t["h1"]}</h1>',
        f'        <p class="intro">{t["intro"].format(n=n)}</p>',
        f'        <p class="guia-revisado">{revisado}</p>',
        '      </div>',
        f'      <nav class="indice revelar" aria-label="{t["indice"]}">',
        *indice,
        '      </nav>',
        '    </div>',
        '  </section>',
        '',
        f'  <section class="seccion" id="{"como-leer" if lang == "es" else "how-to-read"}" aria-labelledby="t-leer">',
        '    <div class="envoltura">',
        '      <div class="revelar">',
        f'        <p class="antetitulo">{t["leer_ante"]}</p>',
        f'        <h2 id="t-leer">{t["leer_h2"]}</h2>',
        '      </div>',
        '      <div class="normas escalonado">',
        *bloques,
        '      </div>',
        '    </div>',
        '  </section>',
        '',
        *secciones,
        f'  <section class="seccion" id="{mut_id}" aria-labelledby="t-{mut_id}">',
        '    <div class="envoltura">',
        '      <div class="revelar">',
        f'        <p class="antetitulo">{t["mut_ante"]}</p>',
        f'        <h2 id="t-{mut_id}">{t["mut_h2"]}</h2>',
        f'        <p class="intro">{t["mut_intro"]}</p>',
        '      </div>',
        '      <dl class="glosario revelar">',
        *glosario,
        '      </dl>',
        '    </div>',
        '  </section>',
        '',
        '  <section class="llamada" aria-labelledby="t-llamada" data-ascuas>',
        '    <div class="envoltura centro revelar">',
        f'      <h2 id="t-llamada">{t["cta_h2"]}</h2>',
        f'      <p>{t["cta_p"]}</p>',
        f'      <a class="boton boton-grande latido" href="{INVITACION}" rel="noopener" target="_blank">{t["cta_boton"]}<span class="oculto">{nueva}</span></a>',
        f'      <p class="volver"><a class="boton boton-sec boton-mini" href="{inicio_web}">{t["volver"]}</a></p>',
        '    </div>',
        '  </section>',
        '</main>',
        '',
        '<footer class="pie">',
        '  <div class="envoltura pie-in">',
        '    <div class="pie-marca">',
        f'      <img src="{sube}img/emoji-garra.webp" alt="" width="48" height="48" loading="lazy">',
        f'      <p><b>GARRA IBÉRICA</b><br>{t["pie_texto"]}</p>',
        '    </div>',
        f'    <nav class="pie-menu" aria-label="{t["pie_menu_label"]}">',
        *[f'      <a href="{inicio_web}#{id_}">{texto}</a>' for id_, texto in t['pie_menu']],
        '    </nav>',
        '    <p class="pie-enlaces">',
        f'      <a href="{INVITACION}" rel="noopener" target="_blank">{t["pie_discord"]}<span class="oculto">{nueva}</span></a>',
        f'      <a href="{STEAM}" rel="noopener" target="_blank">{t["pie_steam"]}<span class="oculto">{nueva}</span></a>',
        f'      <a href="{otra_guia}" hreflang="{otra_lang}" lang="{otra_lang}">{otra_titulo}</a>',
        f'      <a href="#{t["inicio"]}">{t["arriba"]}</a>',
        '    </p>',
        f'    <p class="pie-legal">{t["legal"]}</p>',
        '  </div>',
        '</footer>',
        '</body>',
        '</html>',
        '',
    ]
    return '\n'.join(lineas)


PORTADAS = {'es': 'index.html', 'en': 'en/index.html'}
MARCAS = ('        <!-- guia:especies -->\n', '        <!-- /guia:especies -->')


def especies_portada(lang, d=None):
    """Lista de especies, con enlace a su ficha, que va en la portada entre las dos marcas."""
    d = d or datos()
    t = T[lang]
    ruta = RUTAS[lang].removeprefix('en/')
    filas = []
    for g in ('carnivoros', 'herbivoros', 'omnivoros'):
        enlaces = ', '.join(f'<a href="{ruta}#{ancla(f["nombre"])}">{escape(f["nombre"])}</a>'
                            for f in d['fichas'] if GRUPO[f['dieta']] == g)
        filas.append(f'          <div><dt>{t["grupos"][g]}</dt><dd>{enlaces}</dd></div>\n')
    return '        <dl>\n' + ''.join(filas) + '        </dl>\n'


def portada(lang, html, d=None):
    """La portada con la lista de especies al día. Sale si no encuentra las marcas una sola vez."""
    if html.count(MARCAS[0]) != 1 or html.count(MARCAS[1]) != 1:
        sys.exit(f'{PORTADAS[lang]}: las marcas de la lista de especies deben estar una vez cada una')
    antes, resto = html.split(MARCAS[0])
    _, despues = resto.split(MARCAS[1])
    return antes + MARCAS[0] + especies_portada(lang, d) + MARCAS[1] + despues


def main():
    sys.path.insert(0, str(HERRAMIENTAS))
    base, d = base_web(), datos()
    for lang, nombre in FICHEROS.items():
        destino = DOCS / nombre
        destino.parent.mkdir(parents=True, exist_ok=True)
        destino.write_bytes(pagina(lang, base, d).encode('utf-8'))
        print(f'{nombre}: {len(d["fichas"])} fichas')
    for lang, nombre in PORTADAS.items():
        p = DOCS / nombre
        p.write_bytes(portada(lang, p.read_bytes().decode('utf-8'), d).encode('utf-8'))
        print(f'{nombre}: lista de especies al día')


if __name__ == '__main__':
    sys.stdout.reconfigure(encoding='utf-8')
    main()
