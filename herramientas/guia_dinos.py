"""Contenido de la guía de dinosaurios de la web (dinosaurios/ y en/dinosaurs/) a partir de
herramientas/fichas_dinos.json, copia exacta de las fichas de la wiki del Discord del clan
(garra-iberica/wiki/fichas.json). La página entera (cabecera, menú, pie) la monta montar_web.py.

Si cambian las fichas: copiar wiki/fichas.json encima de fichas_dinos.json y ejecutar
python herramientas/montar_web.py. comprobar.py falla si la copia se queda atrás.
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
GRUPO = {'Carnívoro': 'carnivoros', 'Carnívoro (pescador)': 'carnivoros', 'Herbívoro': 'herbivoros', 'Omnívoro': 'omnivoros'}

T = {
    'es': {
        'titulo': 'Guía de dinosaurios de The Isle Evrima en español – GARRA IBÉRICA',
        'h1': 'Guía de dinosaurios de The Isle Evrima',
        'desc': 'Las {n} especies jugables de The Isle Evrima en español: peso, crecimiento, grupo máximo, '
                'controles, consejos y mutaciones recomendadas por la comunidad.',
        'nueva': ' (se abre en una pestaña nueva)',
        'grupos': {'carnivoros': 'Carnívoros', 'herbivoros': 'Herbívoros', 'omnivoros': 'Omnívoros'},
        'especies': lambda n: f'{n} especies' if n != 1 else '1 especie',
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
        'cta_boton': 'Únete a GARRA IBÉRICA en Discord', 'volver': 'Volver al inicio',
        'inicio': 'inicio', 'ids': ['carnivoros', 'herbivoros', 'omnivoros'], 'mut_id': 'mutaciones', 'leer_id': 'como-leer',
    },
    'en': {
        'titulo': 'The Isle Evrima Dinosaur Guide – GARRA IBÉRICA',
        'h1': 'The Isle Evrima dinosaur guide',
        'desc': 'All {n} playable species in The Isle Evrima: weight, growth, max group, controls, tips and '
                'community-recommended mutations. A guide by clan GARRA IBÉRICA.',
        'nueva': ' (opens in a new tab)',
        'grupos': {'carnivoros': 'Carnivores', 'herbivoros': 'Herbivores', 'omnivoros': 'Omnivores'},
        'especies': lambda n: f'{n} species',
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
        'cta_boton': 'Join GARRA IBÉRICA on Discord', 'volver': 'Back to the home page',
        'inicio': 'top', 'ids': ['carnivores', 'herbivores', 'omnivores'], 'mut_id': 'mutations', 'leer_id': 'how-to-read',
    },
}


def datos():
    d = json.loads(FICHAS.read_text(encoding='utf-8'))
    if not d.get('fichas'):
        sys.exit(f'{FICHAS.name}: no trae ninguna ficha; la web diría «0 especies»')
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


def contenido(lang, d=None):
    """(datos de la página, contenido de <main> con los marcadores de montar_web.py, fecha ISO)."""
    d = d or datos()
    t = T[lang]
    fechas, fecha_iso, parche = revision(d)
    revisado = t['revisado'].format(fecha=fechas[lang], parche=parche)
    n = len(d['fichas'])
    ids = dict(zip(['carnivoros', 'herbivoros', 'omnivoros'], t['ids']))
    grupos = {g: [f for f in d['fichas'] if GRUPO[f['dieta']] == g] for g in ids}
    inicio_web = '@/' + ('en/' if lang == 'en' else '')

    indice = []
    for g, id_ in ids.items():
        indice += ['          <div class="indice-grupo">',
                   f'            <p><a href="#{id_}">{t["grupos"][g]}</a></p>',
                   '            <ul role="list">',
                   *[f'              <li><a href="#{ancla(f["nombre"])}">{escape(f["nombre"])}</a></li>' for f in grupos[g]],
                   '            </ul>',
                   '          </div>']

    bloques = []
    for titulo, del_discord, propias in t['bloques']:
        bloques += [f'        <section class="bloque panel luz revelar" aria-labelledby="b-{ancla(titulo)}">',
                    f'          <h3 id="b-{ancla(titulo)}">{titulo}</h3>',
                    '          <ul role="list">',
                    *[f'            <li>{i.format(revisado=revisado)}</li>' for i in del_discord + propias],
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

    lineas = [
        f'  <section class="cabecera" id="{t["inicio"]}" aria-labelledby="titulo" data-ascuas>',
        '    <img class="cabecera-fondo" src="@/img/galeria-noche-1200.webp" srcset="@/img/galeria-noche-800.webp 800w, '
        '@/img/galeria-noche-1200.webp 1200w, @/img/galeria-noche-1600.webp 1600w" sizes="100vw" alt="" '
        'width="1600" height="670" fetchpriority="high">',
        '    <div class="envoltura cabecera-in">',
        '      {{migas}}',
        f'      <h1 id="titulo" class="entra">{t["h1"]}</h1>',
        f'      <p class="entrada entra entra-2">{t["intro"].format(n=n)}</p>',
        f'      <p class="guia-revisado entra entra-3">{revisado}</p>',
        f'      <nav class="indice entra entra-4" aria-label="{t["indice"]}">',
        *indice,
        '      </nav>',
        '    </div>',
        '  </section>',
        '',
        f'  <section class="seccion" id="{t["leer_id"]}" aria-labelledby="t-leer">',
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
        f'  <section class="seccion" id="{t["mut_id"]}" aria-labelledby="t-{t["mut_id"]}">',
        '    <div class="envoltura">',
        '      <div class="revelar">',
        f'        <p class="antetitulo">{t["mut_ante"]}</p>',
        f'        <h2 id="t-{t["mut_id"]}">{t["mut_h2"]}</h2>',
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
        f'      <a class="boton boton-grande latido" href="{{{{discord}}}}" rel="noopener" target="_blank">{t["cta_boton"]}<span class="oculto">{t["nueva"]}</span></a>',
        f'      <p class="volver"><a class="boton boton-sec boton-mini" href="{inicio_web}">{t["volver"]}</a></p>',
        '    </div>',
        '  </section>',
    ]
    pagina = {'titulo': t['titulo'], 'descripcion': t['desc'].format(n=n), 'h1': t['h1']}
    return pagina, '\n'.join(lineas), fecha_iso
