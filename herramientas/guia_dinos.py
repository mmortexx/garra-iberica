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
INVITACION = 'https://discord.com/invite/z5mU6a9Kf8'
STEAM = 'https://store.steampowered.com/app/376210/'
RUTAS = {'es': 'dinosaurios/', 'en': 'en/dinosaurs/'}
# Cómo buscan algunas especies quienes juegan: salen en el autocompletado de los buscadores o en la wiki del Discord.
APODOS = {'Tyrannosaurus': ['Rex', 'T-Rex'], 'Triceratops': ['Trike'], 'Stegosaurus': ['Stego'], 'Carnotaurus': ['Carno'],
          'Allosaurus': ['Allo'], 'Deinosuchus': ['Deino'], 'Ceratosaurus': ['Cerato']}
GRUPO = {'Carnívoro': 'carnivoros', 'Carnívoro (pescador)': 'carnivoros', 'Herbívoro': 'herbivoros', 'Omnívoro': 'omnivoros'}

T = {
    'es': {
        'titulo': 'Guía de The Isle Evrima: dinosaurios, mutaciones y dieta',
        'h1': 'Guía de dinosaurios de The Isle Evrima',
        'desc': 'Las {n} especies jugables de The Isle Evrima en español: peso, crecimiento, grupo máximo, controles, '
                'mutaciones recomendadas y cómo funciona la dieta.',
        'nueva': ' (se abre en una pestaña nueva)',
        'grupos': {'carnivoros': 'Carnívoros', 'herbivoros': 'Herbívoros', 'omnivoros': 'Omnívoros'},
        'grupos_h2': {'carnivoros': 'Dinosaurios carnívoros', 'herbivoros': 'Dinosaurios herbívoros', 'omnivoros': 'Dinosaurios omnívoros'},
        'especies': lambda n: f'{n} especies' if n != 1 else '1 especie',
        'intro': 'Las {n} fichas que usamos en el Discord del clan, para que nadie empiece a ciegas: peso, crecimiento, '
                 'tamaño máximo de grupo, controles, un consejo y las mutaciones que recomienda la comunidad.',
        'revisado': 'Revisado el {fecha} · parche {parche}',
        'fichas_corto': 'Todas las fichas', 'ficha_pagina': 'Ver la página de {nombre}',
        'leer_ante': 'Términos y datos', 'leer_h2': 'Cómo leer las fichas',
        # (título, frases copiadas de la guía del Discord, frases propias de la web).
        'bloques': [
            ('Términos', [
                '<b>Prime</b>: adulto que cumplió 5 requisitos antes del 75 % de crecimiento (dieta perfecta, santuario, migraciones…): más peso, bonus y un hueco más de mutación.',
                '<b>Frail</b>: adulto que no llegó a Prime; desde el 87,5 % va perdiendo fuerza.',
                '<b>Crecimiento</b>: tiempo base del juego (1×). En servidores con multiplicador es menor.',
            ], [
                '<b>Grupo máx.</b>: tamaño máximo de grupo de la especie.',
                '<b>Dieta perfecta</b>: los 3 nutrientes a la vez. <a href="#dieta">Qué da cada uno y qué comer</a>.',
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
        'consejo': 'Consejo', 'mut': 'Mutaciones recomendadas', 'mut_ver': 'Qué hace cada una',
        'fuente': 'Orientativas: {fuente}.', 'sin': 'Aún no hay una recomendación fiable para esta especie.',
        'dieta': {'Carnívoro': 'Carnívoro', 'Carnívoro (pescador)': 'Carnívoro (pescador)', 'Herbívoro': 'Herbívoro', 'Omnívoro': 'Omnívoro'},
        'mut_ante': 'Glosario', 'mut_h2': 'Mutaciones', 'mut_h2_largo': 'Mutaciones recomendadas de The Isle Evrima',
        'mut_intro': 'Las que recomiendan las fichas y lo que hace cada una. Son orientativas: salen de guías de la comunidad.',
        'cta_h2': '¿Con qué especie te unes?',
        'cta_p': 'En el Discord tienes estas fichas, una manada con la que jugarlas y una cacería cada sábado.',
        'cta_boton': 'Únete a GARRA IBÉRICA en Discord', 'volver': 'Volver al inicio',
        'inicio': 'inicio', 'ids': ['carnivoros', 'herbivoros', 'omnivoros'], 'mut_id': 'mutaciones', 'leer_id': 'como-leer',
        'plan_sin_js': 'Esta calculadora necesita JavaScript. Lo que tarda cada especie está en la <a href="#comparar">lista de dinosaurios</a>.',
        'plan_id': 'planificador', 'plan_ante': 'Antes de la cacería', 'plan_h2': '¿Llegas adulto a la cacería?',
        'plan_intro': 'Elige especie, el ritmo de crecimiento del servidor (si no lo sabes, deja 1×, el del juego) y cuánto '
                      'juegas al día. Se calcula con el crecimiento de cada ficha, a partir de ahora.',
        'plan_especie': 'Especie', 'plan_ritmo': 'Crecimiento del servidor', 'plan_base': 'base', 'plan_coma': ',',
        'plan_horas': 'Horas de juego al día', 'plan_sin_parar': 'Sin parar', 'plan_h': '{n} h',
        'plan_si_t': 'Llegas', 'plan_no_t': 'No llegas',
        'plan_si': 'Con {dino} serías adulto el {adulto} (hora de España): {tiempo} antes de la cacería del {caceria}.',
        'plan_no': 'Con {dino} serías adulto el {adulto} (hora de España): {tiempo} después de que empiece la cacería del {caceria}. Llegarías a la del {alcanza}.',
        'plan_locale': 'es-ES', 'plan_unidades': {'d': ['día', 'días'], 'h': 'h', 'm': 'min'},
        'comp_id': 'comparar', 'comp_ante': 'De un vistazo', 'comp_h2': 'Lista de dinosaurios jugables', 'comp_corto': 'Comparar especies',
        'comp_intro': 'Las {n} especies con su peso máximo, lo que tardan en ser adultas (1×) y su grupo máximo. '
                      'Ordénalas, filtra por cuántos vais a jugar juntos y pulsa una para ver su página. '
                      'El enlace de la página guarda lo que elijas: pásalo a tu grupo.',
        'comp_cols': ('Especie', 'Peso máx.', 'Hasta adulto', 'Grupo máx.'),
        'comp_orden': 'Ordenar', 'comp_dieta': 'Dieta', 'comp_somos': '¿Cuántos jugáis juntos?',
        'comp_ordenes': [('fichas', 'Como las fichas'), ('peso', 'Más pesado primero'), ('crece', 'Crece antes'),
                         ('grupo', 'Grupo más grande'), ('nombre', 'Nombre (A–Z)')],
        'comp_todas': 'Todas', 'comp_igual': 'Da igual', 'comp_n': '{n} o más',
        'comp_cuenta': '{n} de {total} especies', 'comp_ninguna': 'Ninguna especie cumple las dos cosas.',
        'plan_corto': '¿Llegas a la cacería?',
        # El primero si la ficha trae mutaciones recomendadas.
        'esp_titulo': ('{nombre} en The Isle Evrima: guía y mutaciones', '{nombre} en The Isle Evrima: guía y controles'),
        'esp_apodo': 'También lo llaman {apodos}.', 'o': ' o ',
        'esp_desc': '{nombre} en The Isle Evrima: hasta {peso}, adulto en {crece} (1×) y grupo máx. de {grupo}. {resto}',
        'esp_resto': ('Controles, consejo y mutaciones recomendadas.', 'Controles y consejo.'),
        'esp_ficha_ante': 'Su ficha', 'esp_ficha_h2': 'Cómo se juega {nombre}',
        'esp_puestos': {'peso': 'en peso', 'crece': 'en crecer antes', 'grupo': 'en tamaño de grupo'},
        'esp_puesto': 'n.º {n} de {total} {criterio}', 'esp_lista': 'ver la lista',
        'esp_empata': lambda e: ' (empata con otra)' if e == 1 else f' (empata con otras {e})',
        'esp_otras_ante': 'Más especies', 'esp_otras': 'Otros {grupo}', 'esp_todas': 'Las {n} especies en la guía',
        'esp_cta_h2': '¿Vas a jugar {nombre}?', 'esp_volver': 'Volver a la guía',
        'nutri_id': 'dieta', 'nutri_corto': 'Cómo funciona la dieta', 'nutri_ante': 'Qué comer',
        'nutri_h2': 'Dieta en The Isle Evrima: proteínas, lípidos y carbohidratos',
        'nutri_intro': 'Las «proteínas» son solo uno de los 3 nutrientes: los 3 hexágonos junto a la barra de hambre (también en Tab). No hace falta llenarlos: dan más bonus cuanto más llenos, hasta un tope. A 0 % no dan nada.',
        # Como 'bloques': (título, frases copiadas de la guía de dieta del Discord, frases propias de la web).
        'nutri_bloques': [
            ('Qué da cada uno', [
                '<b>β Proteínas:</b> regeneras vida (hasta 10 %).',
                '<b>γ Lípidos:</b> las fracturas se curan antes (hasta 10 %).',
                '<b>α Carbohidratos:</b> el sangrado se corta antes (hasta 10 %).',
            ], []),
            ('Con dos a la vez (el tope de esos dos sube +10 %)', [
                '<b>β + α:</b> resistes el sangrado (hasta 10 %).',
                '<b>β + γ:</b> resistes las fracturas (hasta 10 %).',
                '<b>α + γ:</b> regeneras la vida bloqueada (hasta 10 %).',
            ], []),
            ('Dieta perfecta: los 3 a la vez', [
                'Basta con algo de cada uno (la cantidad mínima: no confirmado).',
                'Regeneras aguante (hasta 15 %), sumas los 3 bonus de arriba y los topes suben +20 %.',
                'Cuenta como requisito para <b>Prime</b>. Si una barra llega a 0, se pierde hasta rellenarla.',
            ], []),
            ('Crecer más rápido', [
                'Cada nutriente sube el tope: 100 %, 200 % y 300 %. Cuántas horas ahorra de verdad: no confirmado.',
                'De adulto ya no acelera; los demás bonus siguen.',
            ], [
                'Cuánto tarda cada especie, en la <a href="#comparar">lista de dinosaurios</a>; si llegas adulto a la cacería, en el <a href="#planificador">planificador</a>.',
            ]),
            ('Qué comer (tu lista está en Tab)', [
                '<b>Carnívoros:</b> en un cadáver fresco de cualquier especie, corazón β, pulmones α e intestinos γ; el estómago varía según el animal. Cerato: los huesos dan los 3.',
                '<b>Herbívoros:</b> cada especie tiene sus plantas; lo que no está en la lista solo quita hambre. De juvenil, las setas del santuario dan los 3.',
                '<b>Omnívoros:</b> su lista mezcla plantas y presas pequeñas.',
                '<b>Ejemplo:</b> Carnotaurus sin lípidos: come intestinos de cualquier cadáver fresco. Con corazón y pulmones, ya tienes dieta perfecta.',
            ], []),
            ('Trucos', [
                'Sal: cura el vómito, pero baja el nutriente que marques en Tab.',
                'Gastrolitos: vacían antes el estómago para seguir comiendo; no quitan nutrientes.',
                'Las crías que alimentas reciben tu dieta.',
            ], []),
        ],
        'nutri_nota': 'Revisado el 3/11/2026 · último parche anunciado: 0.21.772. Las cifras son de guías de la comunidad, no hay tabla oficial. Fuentes: Steam oficial, Evrima Quick Guide, theisle.info.',
    },
    'en': {
        'titulo': 'The Isle Evrima Guide: Dinosaurs, Mutations and Diet',
        'h1': 'The Isle Evrima dinosaur guide',
        'desc': 'All {n} playable species in The Isle Evrima: weight, growth times, max group, controls, recommended '
                'mutations and how diet and nutrients work.',
        'nueva': ' (opens in a new tab)',
        'grupos': {'carnivoros': 'Carnivores', 'herbivoros': 'Herbivores', 'omnivoros': 'Omnivores'},
        'grupos_h2': {'carnivoros': 'Carnivorous dinosaurs', 'herbivoros': 'Herbivorous dinosaurs', 'omnivoros': 'Omnivorous dinosaurs'},
        'especies': lambda n: f'{n} species',
        'intro': 'The {n} cards we use on the clan Discord, so nobody starts blind: weight, growth, max group size, '
                 'controls, a tip and the mutations the community recommends.',
        'revisado': 'Reviewed {fecha} · patch {parche}',
        'fichas_corto': 'All the cards', 'ficha_pagina': 'Open the {nombre} page',
        'leer_ante': 'Terms and data', 'leer_h2': 'How to read the cards',
        'bloques': [
            ('Terms', [
                '<b>Prime</b>: adult that met 5 requirements before 75% growth (perfect diet, sanctuary, migrations…): more weight, bonuses and one more mutation slot.',
                '<b>Frail</b>: adult that did not reach Prime; from 87.5% it slowly gets weaker.',
                "<b>Growth</b>: the game's base time (1×). On servers with a multiplier it is shorter.",
            ], [
                '<b>Max group</b>: the largest group size for the species.',
                '<b>Perfect diet</b>: all 3 nutrients at once. <a href="#diet">What each one gives and what to eat</a>.',
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
        'consejo': 'Tip', 'mut': 'Recommended mutations', 'mut_ver': 'What each one does',
        'fuente': 'A rough guide: {fuente}.', 'sin': 'No reliable recommendation for this species yet.',
        'dieta': {'Carnívoro': 'Carnivore', 'Carnívoro (pescador)': 'Carnivore (fish-eater)', 'Herbívoro': 'Herbivore', 'Omnívoro': 'Omnivore'},
        'mut_ante': 'Glossary', 'mut_h2': 'Mutations', 'mut_h2_largo': 'Recommended The Isle Evrima mutations',
        'mut_intro': 'The ones the cards recommend and what each one does. They are only a rough guide: they come from community guides.',
        'cta_h2': 'Which species will you join with?',
        'cta_p': 'On Discord you get these cards, a pack to play them with and a hunt every Saturday. The clan speaks Spanish.',
        'cta_boton': 'Join GARRA IBÉRICA on Discord', 'volver': 'Back to the home page',
        'inicio': 'top', 'ids': ['carnivores', 'herbivores', 'omnivores'], 'mut_id': 'mutations', 'leer_id': 'how-to-read',
        'plan_sin_js': 'This calculator needs JavaScript. How long each species takes is in the <a href="#compare">list of dinosaurs</a>.',
        'plan_id': 'planner', 'plan_ante': 'Before the hunt', 'plan_h2': 'Will you be adult for the hunt?',
        'plan_intro': "Pick a species, the server’s growth rate (if you don’t know it, leave 1×, the game’s own) and how "
                      "much you play each day. It uses each card’s growth time, starting from now.",
        'plan_especie': 'Species', 'plan_ritmo': 'Server growth rate', 'plan_base': 'base', 'plan_coma': '.',
        'plan_horas': 'Hours played per day', 'plan_sin_parar': 'Non-stop', 'plan_h': '{n} h',
        'plan_si_t': 'You make it', 'plan_no_t': "You don’t make it",
        'plan_si': 'With {dino} you would be adult on {adulto} (Spanish time): {tiempo} before the hunt on {caceria}.',
        'plan_no': 'With {dino} you would be adult on {adulto} (Spanish time): {tiempo} after the hunt on {caceria} starts. You would make the one on {alcanza}.',
        'plan_locale': 'en-GB', 'plan_unidades': {'d': ['day', 'days'], 'h': 'h', 'm': 'min'},
        'comp_id': 'compare', 'comp_ante': 'At a glance', 'comp_h2': 'List of playable dinosaurs', 'comp_corto': 'Compare species',
        'comp_intro': 'All {n} species with their top weight, how long they take to grow up (1×) and their max group. '
                      'Sort them, filter by how many of you will play together and tap one to open its page. '
                      'The page link keeps your choice: share it with your group.',
        'comp_cols': ('Species', 'Top weight', 'To adult', 'Max group'),
        'comp_orden': 'Sort by', 'comp_dieta': 'Diet', 'comp_somos': 'How many of you play together?',
        'comp_ordenes': [('fichas', 'Card order'), ('peso', 'Heaviest first'), ('crece', 'Fastest to grow'),
                         ('grupo', 'Largest group'), ('nombre', 'Name (A–Z)')],
        'comp_todas': 'All', 'comp_igual': 'Any', 'comp_n': '{n} or more',
        'comp_cuenta': '{n} of {total} species', 'comp_ninguna': 'No species matches both.',
        'plan_corto': 'Adult for the hunt?',
        'esp_titulo': ('{nombre} in The Isle Evrima: guide and mutations', '{nombre} in The Isle Evrima: guide and controls'),
        'esp_apodo': 'Also known as {apodos}.', 'o': ' or ',
        'esp_desc': '{nombre} in The Isle Evrima: up to {peso}, adult in {crece} (1×), max group {grupo}. {resto}',
        'esp_resto': ('Controls, a tip and recommended mutations.', 'Controls and a tip.'),
        'esp_ficha_ante': 'Its card', 'esp_ficha_h2': 'How to play {nombre}',
        'esp_puestos': {'peso': 'by weight', 'crece': 'for fastest growth', 'grupo': 'by group size'},
        'esp_puesto': 'no. {n} of {total} {criterio}', 'esp_lista': 'see the list',
        'esp_empata': lambda e: ' (tied with 1 other)' if e == 1 else f' (tied with {e} others)',
        'esp_otras_ante': 'More species', 'esp_otras': 'Other {grupo}', 'esp_todas': 'All {n} species in the guide',
        'esp_cta_h2': 'Playing {nombre}?', 'esp_volver': 'Back to the guide',
        'nutri_id': 'diet', 'nutri_corto': 'How diet works', 'nutri_ante': 'What to eat',
        'nutri_h2': 'The Isle Evrima diet: proteins, lipids and carbohydrates',
        'nutri_intro': '"Proteins" are just one of the 3 nutrients: the 3 hexagons next to the hunger bar (also in Tab). You don\'t need them full: the fuller they are the bigger the bonus, up to a cap. At 0% they give nothing.',
        'nutri_bloques': [
            ('What each one gives', [
                '<b>β Proteins:</b> you regenerate health (up to 10%).',
                '<b>γ Lipids:</b> fractures heal faster (up to 10%).',
                '<b>α Carbohydrates:</b> bleeding stops faster (up to 10%).',
            ], []),
            ('Two at once (the cap of those two goes up +10%)', [
                '<b>β + α:</b> you resist bleeding (up to 10%).',
                '<b>β + γ:</b> you resist fractures (up to 10%).',
                '<b>α + γ:</b> you regenerate locked health (up to 10%).',
            ], []),
            ('Perfect diet: all 3 at once', [
                'Some of each is enough (the minimum amount: not confirmed).',
                'You regenerate stamina (up to 15%), add the 3 bonuses above and the caps go up +20%.',
                'It counts as a requirement for <b>Prime</b>. If a bar hits 0, you lose it until you refill it.',
            ], []),
            ('Growing faster', [
                'Each nutrient raises the cap: 100%, 200% and 300%. How many hours it really saves: not confirmed.',
                'As an adult it no longer speeds you up; the other bonuses stay.',
            ], [
                'How long each species takes is in the <a href="#compare">list of dinosaurs</a>; whether you will be an adult for the hunt, in the <a href="#planner">planner</a>.',
            ]),
            ('What to eat (your list is in Tab)', [
                '<b>Carnivores:</b> in a fresh carcass of any species, heart β, lungs α and intestines γ; the stomach varies with the animal. Cerato: bones give all 3.',
                '<b>Herbivores:</b> each species has its own plants; anything not on the list only fills hunger. As a juvenile, the sanctuary mushrooms give all 3.',
                '<b>Omnivores:</b> their list mixes plants and small prey.',
                '<b>Example:</b> a Carnotaurus with no lipids: eat the intestines of any fresh carcass. With heart and lungs too, you have a perfect diet.',
            ], []),
            ('Tips', [
                'Salt: cures vomiting, but lowers the nutrient you mark in Tab.',
                'Gastroliths: empty your stomach faster so you can keep eating; they don\'t remove nutrients.',
                'Young you feed receive your diet.',
            ], []),
        ],
        'nutri_nota': 'Reviewed 3 Nov 2026 · latest announced patch: 0.21.772. The figures come from community guides; there is no official table. Sources: official Steam news, Evrima Quick Guide, theisle.info.',
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
    mut, mut_en = d.get('mut') or {}, d.get('mut_en') or {}
    if set(mut) != set(mut_en):
        sys.exit(f'{FICHAS.name}: «mut» y «mut_en» deben traer las mismas mutaciones; falta en mut_en: {sorted(set(mut) - set(mut_en))}, falta en mut: {sorted(set(mut_en) - set(mut))}')
    for f in d['fichas']:
        if f['dieta'] not in GRUPO:
            sys.exit(f'{FICHAS.name}: {f["nombre"]} con dieta desconocida «{f["dieta"]}»')
        for k in f['mut']:
            if k not in mut:
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


def ruta_especie(nombre, lang):
    """Dirección de la página de una especie dentro de la web: dinosaurios/tyrannosaurus/."""
    return f'{RUTAS[lang]}{ancla(nombre)}/'


def valores(f, lang):
    en = f['en'] if lang == 'en' else {}
    return {k: en.get(k, f[k]) for k in ('peso', 'crece', 'hab', 'consejo', 'mutfuente')}


# Lo que dice la ficha va marcado con data-ficha / data-mut: comprobar.py lo compara con fichas_dinos.json.
def datos_juego(f, lang, nivel, puesto=lambda criterio: ''):
    """puesto: en la página de la especie, cómo queda en cada dato frente a las demás."""
    t = T[lang]
    v = valores(f, lang)
    sub = ' class="dino-sub"' if nivel != 'h4' else ''
    return [
        '  <dl class="dino-datos">',
        f'    <div><dt>{t["peso"]}</dt><dd data-ficha="peso">{escape(v["peso"])}</dd>{puesto("peso")}</div>',
        f'    <div><dt>{t["crece"]}</dt><dd data-ficha="crece">{escape(v["crece"])}</dd>{puesto("crece")}</div>',
        f'    <div><dt>{t["grupo"]}</dt><dd data-ficha="grupo">{escape(f["grupo"])}</dd>{puesto("grupo")}</div>',
        '  </dl>',
        f'  <{nivel}{sub}>{t["hab"]}</{nivel}>',
        '  <ul class="dino-lista" role="list">',
        *[f'    <li data-ficha="hab">{escape(h)}</li>' for h in v['hab']],
        '  </ul>',
        f'  <p class="dino-consejo"><b>{t["consejo"]}:</b> <span data-ficha="consejo">{escape(v["consejo"])}</span></p>',
    ]


def mutaciones(f, d, lang, nivel, glosario=None):
    """glosario: enlace a la explicación de cada mutación, o None si no hace falta."""
    t = T[lang]
    v = valores(f, lang)
    muts = d['mut_en'] if lang == 'en' else d['mut']
    sub = ['dino-sub'] if nivel != 'h4' else []

    def titulo(clases, extra=''):
        attr = f' class="{" ".join(clases)}"' if clases else ''
        cabeza = f'<{nivel}{attr}>{t["mut"]}</{nivel}>'
        # El enlace, al lado y no dentro: dentro pasaría a formar parte del título que leen Google y los lectores de pantalla.
        return f'  <div class="dino-h4">{cabeza}{extra}</div>' if extra else f'  {cabeza}'
    if not f['mut']:
        return [titulo(sub), f'  <p class="dino-fuente">{t["sin"]}</p>']
    enlace = f' <a class="dino-glosario" href="{glosario}">{t["mut_ver"]}</a>' if glosario else ''
    fuente = escape(t['fuente']).format(fuente=f'<span data-ficha="mutfuente">{escape(v["mutfuente"])}</span>')
    return [titulo(sub, enlace),
            '  <ul class="dino-lista dino-mut" role="list">',
            *[f'    <li data-mut="{escape(k)}">{mutacion(muts[k])}</li>' for k in f['mut']],
            '  </ul>',
            f'  <p class="dino-fuente">{fuente}</p>']


def ficha(f, d, lang):
    t = T[lang]
    a = ancla(f['nombre'])
    dieta = GRUPO[f['dieta']].rstrip('s')
    # Plegada: para elegir está la comparativa y para leerla entera, su página. guia.js la abre si la
    # dirección la nombra (dinosaurios/#triceratops, los enlaces viejos).
    partes = [
        f'<details class="dino plegable panel luz revelar" id="{a}">',
        f'  <summary class="dino-cabeza"><h3 id="d-{a}">{escape(f["nombre"])}</h3>'
        f'<span class="dieta dieta-{dieta}">{escape(t["dieta"][f["dieta"]])}</span></summary>',
        # Fuera de summary: un enlace dentro del botón de plegar no lo alcanza un lector de pantalla.
        f'  <p class="dino-enlace"><a href="@/{ruta_especie(f["nombre"], lang)}">{t["ficha_pagina"].format(nombre=escape(f["nombre"]))}</a></p>',
        *datos_juego(f, lang, 'h4'),
        # El glosario, al final de la página, explica cada mutación: enlace para no perder el hilo.
        *mutaciones(f, d, lang, 'h4', f'#{t["mut_id"]}'),
        '</details>',
    ]
    return '\n'.join('        ' + p for p in partes)


CRECE = re.compile(r'(\d+)\s*h(?:\s*(\d+)\s*min)?')
RITMOS = (1, 1.5, 2, 3)
HORAS = (24, 8, 4, 2)


def minutos_crecer(texto):
    """Minutos de juego hasta adulto (1×) según la ficha: «35 h 33 min» → 2133. Manda la primera cifra."""
    m = CRECE.search(texto)
    if not m:
        sys.exit(f'{FICHAS.name}: no entiendo el crecimiento «{texto}» (se espera «N h» o «N h M min»)')
    return int(m.group(1)) * 60 + int(m.group(2) or 0)


PESO = r'(\d+(?:[.,]\d+)?) (t|kg)\b'


def peso_max(texto):
    """(kg, «12,3 t») del peso adulto más alto que da la ficha: el Prime o, si no lo hay, el único."""
    m = re.search(PESO + r' \(Prime\)', texto) or (None if 'Prime' in texto else re.search(PESO, texto))
    if not m:
        sys.exit(f'{FICHAS.name}: no entiendo el peso «{texto}» (se espera «N t/kg (Prime)» o un solo «N t/kg»)')
    return float(m.group(1).replace(',', '.')) * (1000 if m.group(2) == 't' else 1), m.group(0).split(' (')[0]


def kilos(f, lang):
    """Peso máximo de una ficha para comparar especies; se para si los idiomas no coinciden o el grupo no es un número."""
    v = valores(f, lang)
    kg = peso_max(v['peso'])[0]
    if kg != peso_max(f['peso'])[0]:
        sys.exit(f'{FICHAS.name}: {f["nombre"]} pesa distinto en español y en inglés')
    if not f['grupo'].isdigit():
        sys.exit(f'{FICHAS.name}: {f["nombre"]} con grupo máximo «{f["grupo"]}», que no es un número')
    return kg


def cifras(f, lang):
    """Las tres columnas de la comparativa; lo que la ficha matiza del crecimiento va debajo de la cifra."""
    t = T[lang]
    v = valores(f, lang)
    crece, parentesis, matiz = v['crece'].partition(' (')
    nota = f'<small>({escape(matiz)}</small>' if parentesis else ''
    celdas = [('peso', escape(peso_max(v['peso'])[1])), ('crece', escape(crece) + nota), ('grupo', escape(f['grupo']))]
    return ''.join(f'<span class="c-{k}"><span class="oculto">{col}: </span>{texto}</span>'
                   for (k, texto), col in zip(celdas, t['comp_cols'][1:]))


def puestos(d):
    """{especie: {criterio: (puesto, cuántas más empatan)}}, con los mismos criterios que la comparativa."""
    valor = {f['nombre']: {'peso': peso_max(f['peso'])[0], 'crece': -minutos_crecer(f['crece']), 'grupo': int(f['grupo'])}
             for f in d['fichas']}
    return {n: {k: (1 + sum(o[k] > x for o in valor.values()), sum(o[k] == x for o in valor.values()) - 1)
                for k, x in v.items()} for n, v in valor.items()}


def comparativa(d, lang):
    """Todas las especies en una lista; guia.js la ordena y la filtra. Sin JavaScript, en el orden de las fichas."""
    t = T[lang]
    filas, grupos = [], set()
    for f in d['fichas']:
        kg = kilos(f, lang)
        grupos.add(int(f['grupo']))
        g = GRUPO[f['dieta']]
        filas.append(f'        <div data-nombre="{escape(f["nombre"])}" data-dieta="{g}" data-peso="{kg:g}" '
                     f'data-crece="{minutos_crecer(f["crece"])}" data-grupo="{f["grupo"]}">'
                     f'<dt><a href="@/{ruta_especie(f["nombre"], lang)}">{escape(f["nombre"])}</a> '
                     f'<span class="dieta dieta-{g.rstrip("s")}">{escape(t["dieta"][f["dieta"]])}</span></dt><dd>{cifras(f, lang)}</dd></div>')
    dietas = [('todas', t['comp_todas'])] + [(g, t['grupos'][g]) for g in ('carnivoros', 'herbivoros', 'omnivoros')]
    somos = [('1', t['comp_igual'])] + [(str(n), t['comp_n'].format(n=n)) for n in sorted(grupos) if n > 1]

    def selector(etiqueta, opciones):
        return [f'        <label>{etiqueta}', '          <select>',
                *[f'            <option value="{v}">{escape(texto)}</option>' for v, texto in opciones],
                '          </select>', '        </label>']
    return [
        f'  <section class="seccion" id="{t["comp_id"]}" aria-labelledby="t-{t["comp_id"]}">',
        '    <div class="envoltura">',
        '      <div class="revelar">',
        f'        <p class="antetitulo">{t["comp_ante"]}</p>',
        f'        <h2 id="t-{t["comp_id"]}">{t["comp_h2"]}</h2>',
        f'        <p class="intro">{t["comp_intro"].format(n=len(d["fichas"]))}</p>',
        '      </div>',
        f'      <div class="plan plan-tres" data-comparar hidden data-recuento="{escape(t["comp_cuenta"])}" data-ninguna="{escape(t["comp_ninguna"])}">',
        *selector(t['comp_orden'], t['comp_ordenes']),
        *selector(t['comp_dieta'], dietas),
        *selector(t['comp_somos'], somos),
        '        <p class="dino-fuente" role="status"></p>',
        '      </div>',
        '      <div class="comparar">',
        '        <p class="comparar-fila comparar-cabeza" aria-hidden="true">'
        f'<span>{t["comp_cols"][0]}</span><span class="comparar-cifras">'
        + ''.join(f'<span class="c-{k}">{col}</span>' for k, col in zip(('peso', 'crece', 'grupo'), t['comp_cols'][1:]))
        + f'</span><span class="comparar-repite"><span>{t["comp_cols"][0]}</span><span class="comparar-cifras">'
        + ''.join(f'<span class="c-{k}">{col}</span>' for k, col in zip(('peso', 'crece', 'grupo'), t['comp_cols'][1:]))
        + '</span></span></p>',
        '        <dl class="comparar-lista" data-comparar-lista>',
        *filas,
        '        </dl>',
        '      </div>',
        '    </div>',
        '  </section>',
        '',
    ]


def planificador(d, lang):
    """¿Llego adulto a la cacería? Lo calcula caceria.js; sin JavaScript no se enseña."""
    t = T[lang]
    opciones = []
    for f in d['fichas']:
        crece = (f['en'] if lang == 'en' else {}).get('crece', f['crece'])
        # Lo que la ficha matiza entre paréntesis (aproximado, otra fuente) sale con el resultado.
        matiz = re.search(r'\(([^)]*)\)', crece)
        nota = f' data-nota="{escape(matiz.group(1)[:1].upper() + matiz.group(1)[1:])}"' if matiz else ''
        opciones.append(f'            <option value="{minutos_crecer(f["crece"])}" data-nombre="{escape(f["nombre"])}" data-ancla="{ancla(f["nombre"])}"{nota}>'
                        f'{escape(f["nombre"])} · {escape(crece.split(" (")[0])}</option>')
    ritmos = [f'            <option value="{r}">{str(r).replace(".", t["plan_coma"])}×{" (" + t["plan_base"] + ")" if r == 1 else ""}</option>'
              for r in RITMOS]
    horas = [f'            <option value="{h}">{t["plan_sin_parar"] if h == 24 else t["plan_h"].format(n=h)}</option>' for h in HORAS]
    datos = {'si': t['plan_si'], 'no': t['plan_no'], 'si-titulo': t['plan_si_t'], 'no-titulo': t['plan_no_t'],
             'locale': t['plan_locale'], 'unidades': json.dumps(t['plan_unidades'], ensure_ascii=False)}
    return [
        f'  <section class="seccion" id="{t["plan_id"]}" aria-labelledby="t-{t["plan_id"]}">',
        '    <div class="envoltura">',
        '      <div class="revelar">',
        f'        <p class="antetitulo">{t["plan_ante"]}</p>',
        f'        <h2 id="t-{t["plan_id"]}">{t["plan_h2"]}</h2>',
        f'        <p class="intro">{t["plan_intro"]}</p>',
        '      </div>',
        '      <div class="plan plan-tres" data-plan hidden ' + ' '.join(f'data-{k}="{escape(v)}"' for k, v in datos.items()) + '>',
        f'        <label>{t["plan_especie"]}',
        '          <select>',
        *opciones,
        '          </select>',
        '        </label>',
        f'        <label>{t["plan_ritmo"]}',
        '          <select>',
        *ritmos,
        '          </select>',
        '        </label>',
        f'        <label>{t["plan_horas"]}',
        '          <select>',
        *horas,
        '          </select>',
        '        </label>',
        '        <p class="plan-resultado" data-resultado role="status"></p>',
        '      </div>',
        f'      <noscript><p class="dino-fuente">{t["plan_sin_js"]}</p></noscript>',
        '    </div>',
        '  </section>',
        '',
    ]


def bloques_texto(lista, revisado=''):
    bloques = []
    for titulo, del_discord, propias in lista:
        bloques += [f'        <div class="bloque panel luz revelar">',
                    f'          <h3>{titulo}</h3>',
                    '          <ul role="list">',
                    *[f'            <li>{i.format(revisado=revisado)}</li>' for i in del_discord + propias],
                    '          </ul>',
                    '        </div>']
    return bloques


def nutrientes(t):
    """Cómo funciona la dieta, en la guía: la guía de dieta del Discord, con sus «no confirmado»."""
    lineas = [
        f'  <section class="seccion" id="{t["nutri_id"]}" aria-labelledby="t-{t["nutri_id"]}">',
        '    <div class="envoltura">',
        '      <div class="revelar">',
        f'        <p class="antetitulo">{t["nutri_ante"]}</p>',
        f'        <h2 id="t-{t["nutri_id"]}">{t["nutri_h2"]}</h2>',
        f'        <p class="intro">{t["nutri_intro"]}</p>',
        '      </div>',
        '      <div class="normas escalonado">',
        *bloques_texto(t['nutri_bloques']),
        '      </div>',
        f'      <p class="nota revelar"><span>{t["nutri_nota"]}</span></p>',
        '    </div>',
        '  </section>',
        '',
    ]
    # Que «10 %» no se parta entre dos líneas.
    return [linea.replace(' %', ' %') for linea in lineas]


def lectura(t, revisado):
    """«Cómo leer las fichas», en la guía; la página de cada especie enlaza aquí."""
    bloques = bloques_texto(t['bloques'], revisado)
    return [
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
    ]


def cabecera(t, lineas):
    """Cabecera con la foto de fondo de la guía; lineas va entre las migas y el final."""
    return [
        f'  <section class="cabecera" id="{t["inicio"]}" aria-labelledby="titulo" data-ascuas>',
        '    <img class="cabecera-fondo" src="@/img/galeria-noche-1200.webp" srcset="@/img/galeria-noche-800.webp 800w, '
        '@/img/galeria-noche-1200.webp 1200w, @/img/galeria-noche-1600.webp 1600w" sizes="(max-width: 700px) 45vw, 100vw" alt="" '
        'width="1600" height="670" fetchpriority="high">',
        '    <div class="envoltura cabecera-in">',
        '      {{migas}}',
        *lineas,
        '    </div>',
        '  </section>',
        '',
    ]


def llamada(t, h2, volver, volver_a, clase=''):
    return [
        '  <section class="llamada" aria-labelledby="t-llamada" data-ascuas>',
        '    <div class="envoltura centro revelar">',
        f'      <h2 id="t-llamada"{f' class="{clase}"' if clase else ''}>{h2}</h2>',
        f'      <p>{t["cta_p"]}</p>',
        f'      <a class="boton boton-grande latido" href="{{{{discord}}}}" rel="noopener" target="_blank">{t["cta_boton"]}<span class="oculto">{t["nueva"]}</span></a>',
        f'      <p class="volver"><a class="boton boton-sec boton-mini" href="{volver_a}">{volver}</a></p>',
        '    </div>',
        '  </section>',
    ]


def contenido_especie(nombre, lang, d=None):
    """(datos, contenido de <main>, fecha ISO) de la página de una especie: su ficha entera, cómo queda
    frente a las demás, las otras de su dieta y cómo leer la ficha. Todo sale de fichas_dinos.json."""
    d = d or datos()
    t = T[lang]
    f = next((f for f in d['fichas'] if f['nombre'] == nombre), None)
    if not f:
        sys.exit(f'{FICHAS.name}: no hay ficha de {nombre}')
    fechas, fecha_iso, parche = revision(d)
    revisado = t['revisado'].format(fecha=fechas[lang], parche=parche)
    n = len(d['fichas'])
    a = ancla(nombre)
    g = GRUPO[f['dieta']]
    guia = '@/' + RUTAS[lang]
    v = valores(f, lang)
    peso, crece = peso_max(v['peso'])[1], v['crece'].split(' (')[0]

    def puesto(criterio):
        lugar, empates = puestos(d)[nombre][criterio]
        texto = t['esp_puesto'].format(n=lugar, total=n, criterio=t['esp_puestos'][criterio]) + (t['esp_empata'](empates) if empates else '')
        return (f'<dd class="dino-puesto" data-puesto="{criterio}">{texto} · '
                f'<a href="{guia}#{t["comp_id"]}?orden={criterio}&amp;marca={a}">{t["esp_lista"]}</a></dd>')
    otras = [o for o in d['fichas'] if GRUPO[o['dieta']] == g and o is not f]
    otras_h2 = t['esp_otras'].format(grupo=t['grupos'][g].lower())

    lineas = [
        *cabecera(t, [
            f'      <p class="entra"><span class="dieta dieta-{g.rstrip("s")}" data-ficha="dieta">{escape(t["dieta"][f["dieta"]])}</span></p>',
            f'      <h1 id="titulo" class="entra especie-nombre">{escape(nombre)}</h1>',
            *([f'      <p class="entrada entra entra-2">{t["esp_apodo"].format(apodos=t["o"].join(APODOS[nombre]))}</p>'] if nombre in APODOS else []),
            f'      <p class="guia-revisado entra entra-2">{revisado}</p>',
            '      <p class="saltos entra entra-3">' + ''.join(f'<a href="{guia}#{i}?{q}">{texto}</a>' for q, i, texto in (
                (f'especie={a}', t['plan_id'], t['plan_corto']), (f'marca={a}', t['comp_id'], t['comp_corto']))) + '</p>',
        ]),
        '  <section class="seccion" id="ficha" aria-labelledby="t-ficha">',
        '    <div class="envoltura">',
        '      <div class="revelar">',
        f'        <p class="antetitulo">{t["esp_ficha_ante"]}</p>',
        f'        <h2 id="t-ficha">{t["esp_ficha_h2"].format(nombre=escape(nombre))}</h2>',
        '      </div>',
        '      <div class="dinos">',
        *['        ' + p for p in [
            '<article class="dino panel luz revelar">',
            *datos_juego(f, lang, 'h3', puesto),
            '</article>',
            '<article class="dino panel luz revelar">',
            *mutaciones(f, d, lang, 'h3'),
            '</article>']],
        '      </div>',
        '    </div>',
        '  </section>',
        '',
    ]
    # La guía entera, la dieta y cómo leer las fichas, juntos bajo las otras especies: en una sección
    # aparte eran dos botones sueltos entre dos divisores.
    a_la_guia = (f'      <p class="saltos saltos-guia revelar"><a href="{guia}">{t["esp_todas"].format(n=n)}</a>'
                 f'<a href="{guia}#{t["nutri_id"]}">{t["nutri_corto"]}</a><a href="{guia}#{t["leer_id"]}">{t["leer_h2"]}</a></p>')
    lineas += [
        '  <section class="seccion" id="otras"' + (' aria-labelledby="t-otras">' if otras else '>'),
        '    <div class="envoltura">',
        *([
            '      <div class="revelar">',
            f'        <p class="antetitulo">{t["esp_otras_ante"]}</p>',
            f'        <h2 id="t-otras">{otras_h2}</h2>',
            '      </div>',
            '      <div class="indice-grupo revelar">',
            '        <ul role="list">',
            *[f'          <li><a href="@/{ruta_especie(o["nombre"], lang)}">{escape(o["nombre"])}</a></li>' for o in otras],
            '        </ul>',
            '      </div>',
        ] if otras else []),
        a_la_guia,
        '    </div>',
        '  </section>',
        '',
        *llamada(t, t['esp_cta_h2'].format(nombre=escape(nombre)), t['esp_volver'], guia, 'especie-nombre')]
    resto = t['esp_resto'][0 if f['mut'] else 1]
    pagina = {'titulo': t['esp_titulo'][0 if f['mut'] else 1].format(nombre=nombre), 'h1': nombre,
              'descripcion': t['esp_desc'].format(nombre=nombre, peso=peso, crece=crece, grupo=f['grupo'], resto=resto)}
    return pagina, '\n'.join(lineas), fecha_iso


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

    secciones = []
    for g, id_ in ids.items():
        secciones += [
            f'  <section class="seccion" id="{id_}" aria-labelledby="t-{id_}">',
            '    <div class="envoltura">',
            '      <div class="revelar">',
            f'        <p class="antetitulo">{t["especies"](len(grupos[g]))}</p>',
            f'        <h2 id="t-{id_}">{t["grupos_h2"][g]}</h2>',
            '      </div>',
            '      <div class="dinos dinos-plegadas">',
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
        *cabecera(t, [
        f'      <h1 id="titulo" class="entra">{t["h1"]}</h1>',
        f'      <p class="entrada entra entra-2">{t["intro"].format(n=n)}</p>',
        f'      <p class="guia-revisado entra entra-3">{revisado}</p>',
        '      <p class="saltos entra entra-3">' + ''.join(
            f'<a href="#{i}">{texto}</a>' for i, texto in (
                (t['plan_id'], t['plan_corto']), (t['ids'][0], t['fichas_corto']), (t['leer_id'], t['leer_h2']), (t['nutri_id'], t['nutri_corto']), (t['mut_id'], t['mut_h2']))) + '</p>',
        ]),
        *comparativa(d, lang),
        *planificador(d, lang),
        *secciones,
        *lectura(t, revisado),
        *nutrientes(t),
        f'  <section class="seccion" id="{t["mut_id"]}" aria-labelledby="t-{t["mut_id"]}">',
        '    <div class="envoltura">',
        '      <div class="revelar">',
        f'        <p class="antetitulo">{t["mut_ante"]}</p>',
        f'        <h2 id="t-{t["mut_id"]}">{t["mut_h2_largo"]}</h2>',
        f'        <p class="intro">{t["mut_intro"]}</p>',
        '      </div>',
        '      <dl class="glosario revelar">',
        *glosario,
        '      </dl>',
        '    </div>',
        '  </section>',
        '',
        *llamada(t, t['cta_h2'], t['volver'], inicio_web),
    ]
    pagina = {'titulo': t['titulo'], 'descripcion': t['desc'].format(n=n), 'h1': t['h1']}
    return pagina, '\n'.join(lineas), fecha_iso
