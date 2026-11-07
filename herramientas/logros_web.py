"""La página de la ruta de logros, a partir de logros.json (la misma lista que acepta servicio/).

Las listas salen en el HTML: se leen sin JavaScript y ruta.js solo les pone el estado de cada uno. Lo que va `oculto` en
logros.json (Oviraptor, sin datos confirmados: ver borradores/) no se nombra en la web; sus marcas se aceptan igualmente,
por eso sus identificadores van en data-logros.
"""
import json
from html import escape
from math import hypot
from pathlib import Path
import re

HERRAMIENTAS = Path(__file__).resolve().parent
LOGROS = HERRAMIENTAS / 'logros.json'
CUENTAS = HERRAMIENTAS / 'cuentas.json'

T = {
    'es': {
        'grupos': {'C': 'Carnívoro', 'H': 'Herbívoro', 'O': 'Omnívoro', 'G': 'General'},
        'explorador': 'Explorador', 'crecer': 'Crecer', 'prime': 'Llegar a Prime', 'horas': 'Horas jugadas',
        'fauna': 'Morir por fauna', 'herb': 'Cazar herbívoros', 'carn': 'Cazar carnívoros', 'huella': 'Huella', 'puerta': 'Puerta',
        'bajas': ('baja', 'bajas'), 'muertes': ('muerte', 'muertes'), 'muerte_por': 'Que te mate un', 'total': 'Horas totales con cualquier dino',
        'mapa': 'Puertas y huellas', 'mapa_nota': 'Puntos del mapa, con cualquier dino', 'totales': 'Horas totales', 'totales_nota': 'Con cualquier dino',
        'matan': 'Que te maten', 'matan_nota': 'La especie que te mata tiene que estar al ≥75%',
        'radio': 'radio {r} ≈ {m} m · quédate ~1 min', 'crecer_ruta': 'Crecer hasta el 100%', 'crecer_nota': 'a mano o con carta de crecimiento si la tienes',
        'prime_nota': 'a mano o con carta de Prime si la tienes', 'hecho': 'hecho',
        'aparece': 'Aparece con <b>{d}</b>.', 'tp': 'Recién salido, con menos del 30%, teletranspórtate desde Nexus a <b>{z}</b>.',
        'pega': 'Pega las coordenadas de cada punto en el mapa de Nexus para ver si estás encima.', 'que_hacer': 'Qué hacer',
        'copiar': 'Copiar las coordenadas', 'sesion': 'Sesión {n}',
    },
    'en': {
        'grupos': {'C': 'Carnivore', 'H': 'Herbivore', 'O': 'Omnivore', 'G': 'General'},
        'explorador': 'Explorer', 'crecer': 'Grow', 'prime': 'Reach Prime', 'horas': 'Hours played',
        'fauna': 'Die to wildlife', 'herb': 'Hunt herbivores', 'carn': 'Hunt carnivores', 'huella': 'Footprint', 'puerta': 'Gate',
        'bajas': ('kill', 'kills'), 'muertes': ('death', 'deaths'), 'muerte_por': 'Die to', 'total': 'Total hours with any dino',
        'mapa': 'Gates and footprints', 'mapa_nota': 'Map points, with any dino', 'totales': 'Total hours', 'totales_nota': 'With any dino',
        'matan': 'Get killed', 'matan_nota': 'The species that kills you must be at ≥75%',
        'radio': 'radius {r} ≈ {m} m · stay ~1 min', 'crecer_ruta': 'Grow to 100%', 'crecer_nota': 'by hand or with a growth card if you have one',
        'prime_nota': 'by hand or with a Prime card if you have one', 'hecho': 'done',
        'aparece': 'Spawn as <b>{d}</b>.', 'tp': 'As soon as you spawn, under 30%, teleport from Nexus to <b>{z}</b>.',
        'pega': 'Paste each point’s coordinates into the Nexus map to check you are on it.', 'que_hacer': 'What to do',
        'copiar': 'Copy the coordinates', 'sesion': 'Session {n}',
    },
}
CRECER = ['1%', '50%', '80%', '100%']


def datos():
    return json.loads(LOGROS.read_text(encoding='utf-8'))


def servicio():
    """Dirección del servicio de cuentas, o '' mientras no exista: la página funciona entonces solo en el navegador."""
    direccion = json.loads(CUENTAS.read_text(encoding='utf-8'))['servicio']
    if direccion and not (direccion.startswith('https://') and direccion.count('/') == 2):
        raise SystemExit(f'{CUENTAS.name}: «{direccion}» debe ser https://dominio, sin ruta ni barra final')
    return direccion


def id_huella(codigo):
    return f'f-{codigo}'


def id_puerta(codigo):
    return 'g-' + codigo.replace(' ', '-')


def id_caza(especie, caza):
    return f'{especie["id"]}-h-{caza["tipo"]}'


def ids_muertes(d):
    """[(id del logro, especie)] de «muerte por»: por el id de la especie, no por su posición en la lista."""
    por_nombre = {e['nombre']: e for e in d['especies']}
    faltan = [n for n in d['muertes']['especies'] if n not in por_nombre]
    if faltan:
        raise SystemExit(f'logros.json: muertes.especies nombra especies que no existen: {faltan}')
    return [(f'fed-{por_nombre[n]["id"]}', por_nombre[n]) for n in d['muertes']['especies']]


def maximos(d):
    """{logro: número de tramos}, ocultos incluidos: lo mismo que servicio/src/catalogo.js."""
    m = {}
    for e in d['especies']:
        m[f'{e["id"]}-exp'] = 1
        m[f'{e["id"]}-grow'] = len(CRECER)
        m[f'{e["id"]}-prime'] = 1
        for c in e['cazas']:
            if id_caza(e, c) in m:
                raise SystemExit(f'logros.json: {e["id"]} tiene dos cacerías repetidas de tipo {c["tipo"]}')
            m[id_caza(e, c)] = len(c['tramos'])
        m[f'{e["id"]}-add'] = len(e['horas'])
        if e['fauna']:
            m[f'{e["id"]}-unl'] = 1
    for h in d['huellas']:
        m[id_huella(h['codigo'])] = 1
    for p in d['puertas']:
        m[id_puerta(p['codigo'])] = 1
    for id_muerte, _ in ids_muertes(d):
        m[id_muerte] = len(d['muertes']['tramos'])
    m['addict'] = len(d['horas_totales'])
    return m


def _pos_coord(x, y):
    return ((y + 560) / 1234 * 1000, (x + 616) / 1234 * 1000)


def _pos_ll(ll):
    return (ll[1] / 1920 * 1000, (1 - ll[0] / 1923) * 1000)


def puntos_mapa(d):
    return [(id_huella(h['codigo']), 'huella', h['codigo'], h['x'], h['y'], h['r']) for h in d['huellas']] + \
           [(id_puerta(p['codigo']), 'puerta', p['codigo'], p['x'], p['y'], 5) for p in d['puertas']]


def sesiones(d, con_ocultos=False):
    """Una sesión por dino, en el orden del plan; cada punto del mapa va en la sesión que le pilla más cerca.
    Lo oculto no cuenta: si no, un punto caería en una sesión que la página no enseña."""
    especie = {e['id']: e for e in d['especies']}
    plan = [p for p in d['plan'] if con_ocultos or not especie[p['especie']].get('oculto')]
    tareas = {p['especie']: [(f'{p["especie"]}-exp', 1)] for p in plan}
    ancladas = [p['especie'] for p in plan if especie[p['especie']]['ll']]
    for logro, _, _, x, y, _ in puntos_mapa(d):
        px, py = _pos_coord(x, y)

        def distancia(s):
            sx, sy = _pos_ll(especie[s]['ll'])
            return hypot(sx - px, sy - py)
        tareas[min(ancladas, key=distancia)].append((logro, 1))
    salida = []
    for p in plan:
        sp = p['especie']
        salida.append({**p, 'tareas': tareas[sp] + [(f'{sp}-grow', len(CRECER)), (f'{sp}-prime', 1)]})
    return salida


def visibles(d):
    """Los logros que la página enseña, ocultos fuera."""
    ocultas = {e['id'] for e in d['especies'] if e.get('oculto')}
    ocultos = {i for i, e in ids_muertes(d) if e['id'] in ocultas}
    return [k for k in maximos(d) if k.split('-')[0] not in ocultas and k not in ocultos]


def _sitio(e, lang):
    return e.get('sitio_en', e['sitio']) if lang == 'en' else e['sitio']


def _unidad(n, u):
    return u[0] if n == 1 else u[1]


def filas_especie(e, lang):
    """[(logro, nombre, [(texto del tramo, nombre para el lector de pantalla)])] de una especie."""
    t = T[lang]
    sp = e['id']
    filas = [(f'{sp}-exp', f'{t["explorador"]} · {_sitio(e, lang)}', [(t['hecho'], f'{t["explorador"]} · {_sitio(e, lang)}: {t["hecho"]}')]),
             (f'{sp}-grow', t['crecer'], [(c, f'{t["crecer"]} {c}') for c in CRECER]),
             (f'{sp}-prime', t['prime'], [(t['hecho'], f'{t["prime"]}: {t["hecho"]}')])]
    for c in e['cazas']:
        nombre = t['herb' if c['tipo'] == 'H' else 'carn'] + (f' ≥{c["min"]}%' if c['min'] else '')
        filas.append((id_caza(e, c), nombre, [(str(n), f'{nombre}: {n} {_unidad(n, t["bajas"])}') for n in c['tramos']]))
    filas.append((f'{sp}-add', t['horas'], [(f'{n} h', f'{t["horas"]}: {n} h') for n in e['horas']]))
    if e['fauna']:
        nombre = f'{t["fauna"]} · {e["fauna"]} {t["muertes"][1]}'
        filas.append((f'{sp}-unl', nombre, [(t['hecho'], f'{nombre}: {t["hecho"]}')]))
    return filas


def _tramo(logro, nivel, texto, etiqueta):
    return (f'<button type="button" class="tramo" data-logro="{logro}" data-nivel="{nivel}" aria-pressed="false" '
            f'aria-label="{escape(etiqueta)}" disabled>{escape(texto)}</button>')


def _fila(logro, nombre, tramos, coord=None):
    botones = ''.join(_tramo(logro, i, texto, etiqueta) for i, (texto, etiqueta) in enumerate(tramos, 1))
    extra = f'<span class="logro-coord">X {coord[0]}, Y {coord[1]}</span>' if coord else ''
    return (f'<li class="logro" data-fila="{logro}">'
            f'<span class="logro-nombre">{escape(nombre)}{extra}</span><span class="tramos">{botones}</span></li>')


def _grupo(clave, grupo, nombre, nota, filas, especie=False):
    t = ''.join(filas)
    # data-nombre: la especie, para que «Crecer 80%» se entienda fuera de su grupo, en la trayectoria.
    nombre_tramos = f' data-nombre="{escape(nombre)}"' if especie else ''
    return (f'<details class="plegable ruta-grupo" data-bloque="{clave}" data-grupo="{grupo}"{nombre_tramos}>'
            f'<summary><span class="ruta-grupo-t"><b>{escape(nombre)}</b><small>{escape(nota)}</small></span>'
            f'<span class="contador" data-contador></span></summary>'
            f'<ul class="logros" role="list">{t}</ul></details>')


def lista(lang, d=None):
    """Todos los logros por especie y los generales."""
    d = d or datos()
    t = T[lang]
    bloques = []
    for e in d['especies']:
        if e.get('oculto'):
            continue
        filas = [_fila(*f) for f in filas_especie(e, lang)]
        bloques.append(_grupo(e['id'], e['grupo'], e['nombre'], t['grupos'][e['grupo']], filas, especie=True))
    mapa = [_fila(k, f'{t[tipo]} {cod}', [(t['hecho'], f'{t[tipo]} {cod}: {t["hecho"]}')], (x, y)) for k, tipo, cod, x, y, _ in puntos_mapa(d)]
    bloques.append(_grupo('mapa', 'G', t['mapa'], t['mapa_nota'], mapa))
    bloques.append(_grupo('horas', 'G', t['totales'], t['totales_nota'],
                          [_fila('addict', t['total'], [(f'{n} h', f'{t["total"]}: {n} h') for n in d['horas_totales']])]))
    ocultas = {e['nombre'] for e in d['especies'] if e.get('oculto')}
    muertes = [_fila(id_muerte, f'{t["muerte_por"]} {e["nombre"]}', [(str(k), f'{t["muerte_por"]} {e["nombre"]}: {k} {_unidad(k, t["muertes"])}') for k in d['muertes']['tramos']])
               for id_muerte, e in ids_muertes(d) if e['nombre'] not in ocultas]
    bloques.append(_grupo('muertes', 'G', t['matan'], t['matan_nota'], muertes))
    return '<div class="ruta-grupos" data-grupos>' + ''.join(bloques) + '</div>'


def ruta(lang, d=None):
    """La ruta: una sesión por dino, con lo que le pilla de paso."""
    d = d or datos()
    t = T[lang]
    especie = {e['id']: e for e in d['especies']}
    puntos = {k: (tipo, cod, x, y, r) for k, tipo, cod, x, y, r in puntos_mapa(d)}
    bloques = []
    for n, s in enumerate(sesiones(d), 1):
        e = especie[s['especie']]
        nombre = s['especie']
        titulo = s.get('titulo_en', s['titulo']) if lang == 'en' else s['titulo']
        nota = s.get('nota_en', '') if lang == 'en' else s['nota']
        pasos = [t['aparece'].format(d=escape(e['nombre']))]
        if s['tp']:
            pasos.append(t['tp'].format(z=escape(s['tp'])))
        if any(k in puntos for k, _ in s['tareas']):
            pasos.append(t['pega'])
        filas = []
        for logro, nivel in s['tareas']:
            if logro in puntos:
                tipo, cod, x, y, r = puntos[logro]
                etiqueta = f'{t[tipo]} {cod}'
                detalle = t['radio'].format(r=r, m=r * 10)
                coord = f'X {x}, Y {y}'
                extra = (f'<button type="button" class="coord" data-copiar="{coord}" aria-label="{t["copiar"]}: {coord}" disabled>{coord}</button>')
            elif logro.endswith('-exp'):
                etiqueta, detalle, extra = f'{e["nombre"]} → {_sitio(e, lang)}', '', ''
            elif logro.endswith('-grow'):
                etiqueta, detalle, extra = t['crecer_ruta'], t['crecer_nota'], ''
            else:
                etiqueta, detalle, extra = t['prime'], t['prime_nota'], ''
            pie = f'<small>{escape(detalle)}</small>' if detalle else ''
            filas.append(f'<li class="tarea"><button type="button" class="tramo tramo-tarea" data-logro="{logro}" data-nivel="{nivel}" aria-pressed="false" '
                         f'aria-label="{escape(etiqueta)}" disabled><span aria-hidden="true">✓</span></button>'
                         f'<span class="tarea-t"><b>{escape(etiqueta)}</b>{pie}</span>{extra}</li>')
        nota_html = f'<p class="sesion-nota">{escape(nota)}</p>' if nota else ''
        bloques.append(
            f'<li class="sesion" data-sesion data-especie="{nombre}" data-grupo="{e["grupo"]}">'
            f'<details class="plegable">'
            f'<summary><span class="sesion-n">{n}</span><span class="ruta-grupo-t"><b>{escape(titulo)}</b><small>{escape(e["nombre"])}</small></span>'
            f'<span class="contador" data-contador></span></summary>'
            f'<div class="sesion-cuerpo">{nota_html}<p class="sesion-que">{t["que_hacer"]}</p>'
            f'<ol class="sesion-pasos">{"".join(f"<li>{p}</li>" for p in pasos)}</ol>'
            f'<ul class="tareas" role="list">{"".join(filas)}</ul></div></details></li>')
    return '<ol class="sesiones" role="list" data-sesiones>' + ''.join(bloques) + '</ol>'


def antiguos_pagina(d=None):
    """Cómo se llamaban antes los logros de posición, para traducir lo que un navegador o un código GR1 traiga de antes."""
    return escape(json.dumps((d or datos())['ids_antiguos'], separators=(',', ':')))


def datos_pagina(d=None):
    """Lo que ruta.js necesita saber de la lista: los tramos de cada logro, ocultos incluidos."""
    return escape(json.dumps(maximos(d or datos()), separators=(',', ':')))


# Cómo se llama cada logro en Asura Nexus: por categoría y nombre, no por sus ids. Lo que no sale de una regla se decide aquí.
# prueba_logros.py lo compara uno a uno con la respuesta real (nexus_muestra.json).
NEXUS_GRUPO = {'C': 'Carnivores', 'H': 'Herbivores', 'O': 'Omnivores'}
NEXUS_PRIME = {'C': 'Apex predator', 'H': 'King of the herd', 'O': 'Master of both worlds'}
NEXUS_CAZA = {'H': 'Herbivores', 'C': 'Carnivores'}
NEXUS_SITIO = {'ptera': 'The Dome', 'troo': 'Shallow Beach Island', 'dryo': 'The Pit Buildings', 'pachy': 'South-West Sanctuary'}
NEXUS_ADICTO = {'troo': 'Troodon', 'teno': 'Tenonto', 'trice': 'Trike'}
# Nexus cuenta el tiempo en «minutos» de 20 segundos: 180 son una hora.
NEXUS_HORA = 180


def nexus(d=None):
    """{(categoría, nombre) en Nexus: (logro, tramo por el que empieza, lista de objetivos que debe traer)}, ocultos incluidos."""
    d = d or datos()
    tabla = {}

    def poner(categoria, nombre, logro, desde, objetivos):
        if (categoria, nombre) in tabla:
            raise SystemExit(f'logros_web.py: dos logros se llaman en Nexus «{categoria} | {nombre}»')
        tabla[categoria, nombre] = (logro, desde, list(objetivos))

    for e in d['especies']:
        sp = e['id']
        categoria = f'{NEXUS_GRUPO[e["grupo"]]} / {e["nombre"]}'
        for i, c in enumerate(CRECER):
            poner(categoria, f'Growth {c}', f'{sp}-grow', i, [1])
        poner(categoria, NEXUS_PRIME[e['grupo']], f'{sp}-prime', 0, [1])
        poner(categoria, f'Explorer: {NEXUS_SITIO.get(sp, e["sitio"])}', f'{sp}-exp', 0, [1])
        for c in e['cazas']:
            poner(categoria, f'Hunter: {NEXUS_CAZA[c["tipo"]]}', id_caza(e, c), 0, c['tramos'])
        poner(categoria, f'{NEXUS_ADICTO.get(sp, sp.capitalize())} addict', f'{sp}-add', 0, [h * NEXUS_HORA for h in e['horas']])
        if e['fauna']:
            poner(categoria, 'Super unlucky', f'{sp}-unl', 0, [e['fauna']])
    for h in d['huellas']:
        poner('In the footsteps of the creators', f'Visit site {h["codigo"]}', id_huella(h['codigo']), 0, [1])
    for p in d['puertas']:
        poner('The Gatekeepers', f'Gate {p["codigo"]}', id_puerta(p['codigo']), 0, [1])
    for id_muerte, e in ids_muertes(d):
        poner('Fed to the food chain', f'Die to {e["nombre"]}', id_muerte, 0, d['muertes']['tramos'])
    poner('Dino Addict', "It's addicting, isn't it ?", 'addict', 0, [h * NEXUS_HORA for h in d['horas_totales']])
    return tabla


def nexus_ocultas(d=None):
    """Lo oculto no se nombra en la web: en la tabla de la página su nombre va recortado a su id, y ruta.js recorta igual lo pegado."""
    ocultas = [e for e in (d or datos())['especies'] if e.get('oculto')]
    for e in ocultas:
        if not e['nombre'].startswith(e['id'].capitalize()):
            raise SystemExit(f'logros_web.py: {e["nombre"]} no empieza por su id, {e["id"]}: no se puede recortar')
    return [e['id'].capitalize() for e in ocultas]


def nexus_clave(categoria, nombre, ocultas):
    """La clave de la tabla de la página. La misma regla que claveNexus en ruta.js."""
    clave = f'{categoria}|{nombre}'
    return re.sub(rf'\b({"|".join(ocultas)})[a-z]*', r'\1', clave) if ocultas else clave


def nexus_pagina(d=None):
    """La correspondencia con Nexus, para ruta.js."""
    d = d or datos()
    ocultas = nexus_ocultas(d)
    logros = {nexus_clave(*k, ocultas): list(v) for k, v in nexus(d).items()}
    return escape(json.dumps({'ocultas': ocultas, 'logros': logros}, separators=(',', ':'), ensure_ascii=False))
