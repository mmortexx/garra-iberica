"""Prueba de la ruta de logros: que la página enseña toda la lista y solo ella, y que comprobar.py caza lo que dejaría
las cuentas rotas o desmentiría el aviso legal.

Uso: python herramientas/prueba_logros.py
"""
from contextlib import contextmanager
from html import unescape
import json
import os
import re
import shutil
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import comprobar  # noqa: E402
import guia_dinos  # noqa: E402
import limpiar_muestra_nexus  # noqa: E402
import logros_web  # noqa: E402
import montar_web  # noqa: E402

fallos = 0


def prueba(nombre, comprobar_algo):
    global fallos
    try:
        comprobar_algo()
        print('ok   ', nombre)
    except AssertionError as e:
        fallos += 1
        print('FALLO', nombre, '→', e)


d = logros_web.datos()
MAX = logros_web.maximos(d)
VISIBLES = logros_web.visibles(d)
HTML = {lang: logros_web.ruta(lang, d) + logros_web.lista(lang, d) for lang in montar_web.LANGS}


def cuenta_del_catalogo():
    # Lo que dice la página de origen; un cambio aquí es una lista nueva, no un descuido.
    assert len(MAX) == 184, f'{len(MAX)} logros'
    assert sum(MAX.values()) == 535, f'{sum(MAX.values())} tramos'
    assert len(d['plan']) == 23, f'{len(d["plan"])} sesiones'


def ids_congelados():
    congelados = json.loads((logros_web.HERRAMIENTAS / 'logros_congelados.json').read_text(encoding='utf-8'))['logros']
    ahora = logros_web.maximos(d)
    assert ahora == congelados, ('hay que decidir qué pasa con lo ya guardado antes de tocar los ids (servicio/README.md): '
                                 f'quitados {sorted(set(congelados) - set(ahora))}, nuevos {sorted(set(ahora) - set(congelados))}, '
                                 f'tramos distintos {[k for k in ahora if k in congelados and ahora[k] != congelados[k]]}')
    revuelta = json.loads(json.dumps(d))
    revuelta['especies'].reverse()
    revuelta['muertes']['especies'].reverse()
    for e in revuelta['especies']:
        e['cazas'].reverse()
    assert logros_web.maximos(revuelta) == ahora, 'cambiar el orden de la lista cambia los ids'
    for antes, despues in d['ids_antiguos'].items():
        assert despues in ahora and antes not in ahora, f'{antes} → {despues}'
    assert len(set(d['ids_antiguos'].values())) == len(d['ids_antiguos']) == 46
    # Lo que ve la página: los mismos ids y la misma tabla, sin pasar por el orden de nada.
    assert json.loads(unescape(logros_web.antiguos_pagina(d))) == d['ids_antiguos']


def oculto_fuera():
    ocultas = [e for e in d['especies'] if e.get('oculto')]
    assert [e['id'] for e in ocultas] == ['ovi'], 'lo oculto debe seguir siendo decisión de borradores/'
    for e in ocultas:
        for lang, html in HTML.items():
            assert e['nombre'].casefold() not in html.casefold(), f'{e["nombre"]} sale en {lang}'
            assert f'"{e["id"]}-' not in html, f'{e["id"]} tiene botones en {lang}'
    assert all(k in MAX for k in ('ovi-exp', 'fed-ovi')), 'sus marcas se tienen que seguir aceptando'
    assert not [k for k in VISIBLES if k.startswith('ovi-') or k == 'fed-ovi']


def cada_tramo_tiene_boton():
    for lang, html in HTML.items():
        lista = logros_web.lista(lang, d)
        botones = re.findall(r'data-logro="([^"]+)" data-nivel="(\d+)"', lista)
        assert len(botones) == len(set(botones)), f'botones repetidos en {lang}'
        assert set(botones) == {(k, str(n)) for k in VISIBLES for n in range(1, MAX[k] + 1)}, f'la lista de {lang} no coincide con el catálogo'


def ingles_sin_a_ante_vocal(html=None):
    # Los nombres de especie entran por plantilla: «a Allosaurus» saldría en cada tramo y en su aria-label.
    texto = unescape(html if html is not None else HTML['en'])
    malos = sorted(set(re.findall(r'\b[Aa] ([AEIOU]\w*)', texto)))
    assert not malos, f'«a» delante de vocal en inglés: {malos}'


def cada_punto_en_una_sesion():
    for s in logros_web.sesiones(d):
        assert s['tareas'][0] == (f'{s["especie"]}-exp', 1)
    asignadas = [k for s in logros_web.sesiones(d) for k, _ in s['tareas']]
    assert len(asignadas) == len(set(asignadas)), 'una tarea en dos sesiones'
    puntos = [p[0] for p in logros_web.puntos_mapa(d)]
    for p in puntos:
        assert asignadas.count(p) == 1, f'{p} no está en ninguna sesión'
    ocultas = {e['id'] for e in d['especies'] if e.get('oculto')}
    assert not ocultas & {s['especie'] for s in logros_web.sesiones(d)}


def datos_de_la_pagina():
    from html import unescape
    assert json.loads(unescape(logros_web.datos_pagina(d))) == MAX


MUESTRA = json.loads(limpiar_muestra_nexus.MUESTRA.read_text(encoding='utf-8'))


def diferencias_nexus(tabla, muestra, maximos):
    """Todo lo que no casa uno a uno entre nuestra lista y lo que dice Nexus."""
    fuera = []
    reales = {}
    for x in muestra['achievements']:
        clave = (x['category_path'], x['name'])
        if clave in reales:
            fuera.append(f'repetido en Nexus: {clave}')
        reales[clave] = x
    fuera += [f'sin decidir, Nexus trae: {k}' for k in reales.keys() - tabla.keys()]
    fuera += [f'ya no está en Nexus: {k}' for k in tabla.keys() - reales.keys()]
    cubiertos = {}
    for clave, (logro, desde, objetivos) in tabla.items():
        if clave in reales and [c['target'] for c in reales[clave]['conditions']] != objetivos:
            fuera.append(f'tramos distintos en {clave}')
        for i in range(desde, desde + len(objetivos)):
            if (logro, i) in cubiertos:
                fuera.append(f'tramo repetido: {logro} {i + 1}')
            cubiertos[logro, i] = clave
    tramos = {(k, i) for k, n in maximos.items() for i in range(n)}
    fuera += [f'tramo sin correspondencia: {k} {i + 1}' for k, i in tramos - cubiertos.keys()]
    fuera += [f'tramo que no existe: {k} {i + 1}' for k, i in cubiertos.keys() - tramos]
    return fuera


def nexus_casa_uno_a_uno():
    tabla = logros_web.nexus(d)
    assert len(MUESTRA['achievements']) == 253 == len(tabla), f'{len(MUESTRA["achievements"])} y {len(tabla)}'
    assert not (f := diferencias_nexus(tabla, MUESTRA, MAX)), f
    assert len({v[0] for v in tabla.values()}) == 184 == len(MAX)
    assert sum(len(v[2]) for v in tabla.values()) == 535 == sum(MAX.values())


def nexus_sin_decidir_falla():
    # Nexus renombra uno.
    copia = json.loads(json.dumps(MUESTRA))
    copia['achievements'][0]['name'] = 'Renombrado'
    assert any('sin decidir' in x for x in diferencias_nexus(logros_web.nexus(d), copia, MAX))
    # Nexus cambia los tramos de uno.
    copia = json.loads(json.dumps(MUESTRA))
    copia['achievements'][0]['conditions'][0]['target'] += 1
    assert any('tramos distintos' in x for x in diferencias_nexus(logros_web.nexus(d), copia, MAX))
    # Nosotros añadimos una especie, una huella o un tramo sin decidir cómo se llaman en Nexus.
    nueva = json.loads(json.dumps(d))
    nueva['especies'].append({**nueva['especies'][0], 'id': 'nueva', 'nombre': 'Nueva'})
    assert any('ya no está' in x for x in diferencias_nexus(logros_web.nexus(nueva), MUESTRA, logros_web.maximos(nueva)))
    nueva = json.loads(json.dumps(d))
    nueva['huellas'].append({**nueva['huellas'][0], 'codigo': 'Z99'})
    assert any('ya no está' in x for x in diferencias_nexus(logros_web.nexus(nueva), MUESTRA, logros_web.maximos(nueva)))
    # Un logro nuestro que no sale de nexus(): se queda sin correspondencia.
    tabla = logros_web.nexus(d)
    del tabla['Dino Addict', "It's addicting, isn't it ?"]
    assert any('tramo sin correspondencia: addict' in x for x in diferencias_nexus(tabla, MUESTRA, MAX))


def nexus_en_la_pagina():
    pagina = json.loads(unescape(logros_web.nexus_pagina(d)))
    tabla = logros_web.nexus(d)
    assert pagina['ocultas'] == ['Ovi']
    assert len(pagina['logros']) == len(tabla), 'al recortar lo oculto, dos logros se llaman igual'
    for (categoria, nombre), v in tabla.items():
        assert pagina['logros'][logros_web.nexus_clave(categoria, nombre, pagina['ocultas'])] == list(v)
    assert 'Oviraptor' not in logros_web.nexus_pagina(d), 'la tabla de la página nombra lo oculto'
    # Si Oviraptor deja de ser oculto, su nombre entero entra en la tabla sin tocar nada más.
    visible = json.loads(json.dumps(d))
    for e in visible['especies']:
        e.pop('oculto', None)
    assert 'Carnivores / Oviraptor|Growth 1%' in json.loads(unescape(logros_web.nexus_pagina(visible)))['logros']
    # El servicio acepta MAX_CAMBIOS logros por guardado: una importación siempre cabe en uno.
    servicio = (logros_web.HERRAMIENTAS.parent / 'servicio' / 'src' / 'index.js').read_text(encoding='utf-8')
    tope = int(re.search(r'const MAX_CAMBIOS = (\d+);', servicio).group(1))
    assert len(MAX) <= tope, f'{len(MAX)} logros no caben en un guardado de {tope}'


def aviso_legal_de_nexus():
    for lang, frase in (('es', 'Tu lista de Asura Nexus'), ('en', 'Your Asura Nexus list')):
        legal = (montar_web.FUENTES / lang / 'legal.html').read_text(encoding='utf-8')
        for activas in (True, False):
            assert frase in montar_web.segun_cuentas(legal, activas), f'{lang}: el aviso legal no habla de la lista con cuentas={activas}'


def muestra_sin_datos_de_nadie(muestra=None):
    muestra = muestra or MUESTRA
    assert set(muestra) == {'server', 'achievements'}, f'la muestra trae de más: {sorted(set(muestra) - {"server", "achievements"})}'
    assert set(muestra['server']) == {'name'}, 'el servidor de la muestra trae de más'
    for x in muestra['achievements']:
        assert set(x) == {'category_path', 'name', 'conditions'}, f'{x["name"]} trae de más: premios o algo que solo se ve tras entrar en Nexus'
        for c in x['conditions']:
            assert set(c) == {'target', 'done'}, f'un tramo de {x["name"]} trae de más: premios o datos de una cuenta'
    assert limpiar_muestra_nexus.limpiar(muestra) == muestra, 'el progreso de nexus_muestra.json no es el de ejemplo: pásala por limpiar_muestra_nexus.py'


def muestra_real_no_pasa():
    premio = {'type': 'points', 'label': '5 000 Asura Points'}
    for tocar in (lambda m: m['achievements'][0].__setitem__('rewards', [premio]),
                  lambda m: m['achievements'][0]['conditions'][0].__setitem__('rewards', [premio]),
                  lambda m: m.__setitem__('category_rewards', [{'name': 'Carnivores', 'rewards': [premio]}]),
                  lambda m: m['achievements'][0].__setitem__('description', 'Texto de Nexus'),
                  lambda m: m['achievements'][0].__setitem__('done_at', '2026-10-24T11:30:52+00:00'),
                  lambda m: m['achievements'][0]['conditions'][0].__setitem__('current', 7),
                  lambda m: m['achievements'][0]['conditions'][0].__setitem__('done', not m['achievements'][0]['conditions'][0]['done']),
                  lambda m: m.__setitem__('snapshot_seconds', 20),
                  lambda m: m['server'].__setitem__('id', 1),
                  lambda m: m.__setitem__('account', {'name': 'alguien'})):
        copia = json.loads(json.dumps(MUESTRA))
        tocar(copia)
        try:
            muestra_sin_datos_de_nadie(copia)
        except AssertionError:
            continue
        raise AssertionError(f'pasa una muestra con datos de más: {[k for k in copia if k not in MUESTRA]}')


def limpiar_quita_lo_de_nexus():
    """Una respuesta como la real, con premios, ids, fechas y un campo que hoy no existe: de ahí sale justo la muestra."""
    real = json.loads(json.dumps(MUESTRA))
    real['server'].update(id=1, enabled=True)
    real.update(snapshot_seconds=20, summary={'done': 153}, categories=['Dino Addict'], category_rewards=[{'rewards': [{'label': 'Asura Points'}]}], campo_nuevo='x')
    for x in real['achievements']:
        x.update(id='6a7b', description='Texto', rewards=[{'label': 'Asura Points'}], done_at='2026-10-24', state='collected', progress={'current': 13}, campo_nuevo='x')
        for c in x['conditions']:
            c.update(current=13, collected=True, rewards=[{'label': 'Asura Points'}], campo_nuevo='x')
            c['done'] = not c['done']
    limpia = limpiar_muestra_nexus.limpiar(real)
    assert limpia == MUESTRA, 'limpiar deja pasar algo de la respuesta real'
    assert 'Asura Points' not in json.dumps(limpia) and 'campo_nuevo' not in json.dumps(limpia)


def direccion_mal_escrita():
    real = logros_web.CUENTAS
    with tempfile.TemporaryDirectory() as t:
        for mala in ('http://cuentas.prueba', 'https://cuentas.prueba/', 'https://cuentas.prueba/ruta', 'cuentas.prueba'):
            logros_web.CUENTAS = Path(t) / 'c.json'
            logros_web.CUENTAS.write_text(json.dumps({'servicio': mala}), encoding='utf-8')
            try:
                logros_web.servicio()
            except SystemExit:
                continue
            finally:
                logros_web.CUENTAS = real
            raise AssertionError(f'acepta «{mala}»')


def copia_web(destino):
    """Lo que leen las comprobaciones de la web (sin imágenes ni vídeos)."""
    shutil.copytree(montar_web.DOCS, destino, ignore=shutil.ignore_patterns('img', 'fonts', 'videos', '*.webp', '*.mp4'), dirs_exist_ok=True)


def mensajes(revisar):
    salida = []
    revisar(salida.append)
    return salida


@contextmanager
def web_montada(servicio):
    """Una copia de docs/ montada como si cuentas.json dijera `servicio` ('' = sin cuentas), diga lo que diga el de verdad:
    estas pruebas valen igual con las cuentas apagadas que encendidas."""
    with tempfile.TemporaryDirectory() as t:
        t = Path(t)
        (t / 'cuentas.json').write_text(json.dumps({'servicio': servicio}), encoding='utf-8')
        raiz = t / 'docs'
        shutil.copytree(montar_web.DOCS, raiz, copy_function=os.link)
        real, logros_web.CUENTAS = logros_web.CUENTAS, t / 'cuentas.json'
        try:
            for nombre, contenido in montar_web.montar(raiz).items():
                (raiz / nombre).unlink(missing_ok=True)
                (raiz / nombre).write_bytes(contenido.encode('utf-8'))
            yield raiz
        finally:
            logros_web.CUENTAS = real


def reescribir(fichero, antes, despues):
    """Cambia un trozo de una página de la copia (los ficheros son enlaces duros: se sustituye, no se edita)."""
    contenido = fichero.read_bytes()
    assert contenido.count(antes) == 1, f'{fichero.name}: «{antes}» sale {contenido.count(antes)} veces'
    fichero.unlink()
    fichero.write_bytes(contenido.replace(antes, despues))


def caza_configuracion_desalineada():
    servicio = 'https://cuentas.prueba'
    with web_montada(servicio) as raiz:
        base = guia_dinos.base_web(raiz)
        real = comprobar.SERVICIO_CUENTAS
        assert mensajes(lambda f: comprobar.revisar_cuentas(raiz, base, f, real)) == []
        with tempfile.TemporaryDirectory() as t:
            otro = Path(t) / 'wrangler.toml'
            otro.write_text(real.read_text(encoding='utf-8').replace('/en/route/', '/en/ruta/'), encoding='utf-8')
            m = mensajes(lambda f: comprobar.revisar_cuentas(raiz, base, f, otro))
        assert any('PAGINA_EN' in x for x in m), f'no caza PAGINA_EN mal: {m}'
        reescribir(raiz / 'clan' / 'index.html', b"connect-src 'self';", f"connect-src 'self' {servicio};".encode())
        m = mensajes(lambda f: comprobar.revisar_cuentas(raiz, base, f, real))
        assert any('clan/index.html' in x and 'connect-src' in x for x in m), f'no caza que otra página hable con el servicio: {m}'
    with web_montada(servicio) as raiz:
        reescribir(raiz / 'ruta' / 'index.html', f'data-servicio="{servicio}"'.encode(), b'data-servicio="https://otro.prueba"')
        m = mensajes(lambda f: comprobar.revisar_cuentas(raiz, guia_dinos.base_web(raiz), f, comprobar.SERVICIO_CUENTAS))
        assert any('data-servicio' in x for x in m), f'no caza data-servicio distinto: {m}'


def el_aviso_solo_describe_cuentas_que_existen():
    texto = 'a<!--si-cuentas-->con<!--sin-cuentas-->sin<!--fin-cuentas-->b'
    assert montar_web.segun_cuentas(texto, True) == 'aconb'
    assert montar_web.segun_cuentas(texto, False) == 'asinb'
    try:
        montar_web.segun_cuentas('<!--si-cuentas-->con', False)
        raise AssertionError('deja pasar un trozo sin cerrar')
    except SystemExit:
        pass
    frases = (('legal', 'Si entras con Discord'), ('en/legal', 'If you sign in with Discord'))
    with web_montada('') as raiz:
        base = guia_dinos.base_web(raiz)
        assert mensajes(lambda f: comprobar.revisar_cuentas(raiz, base, f, comprobar.SERVICIO_CUENTAS)) == []
        for sitio, frase in frases:
            pagina = raiz / sitio / 'index.html'
            assert frase.encode() not in pagina.read_bytes(), f'{sitio}: describe cuentas mientras cuentas.json está vacío'
            reescribir(pagina, b'</main>', f'<p>{frase}</p></main>'.encode())
            m = mensajes(lambda f: comprobar.revisar_cuentas(raiz, base, f, comprobar.SERVICIO_CUENTAS))
            assert any('aviso legal' in x and sitio in x for x in m), f'no caza {sitio} describiendo cuentas: {m}'
    with web_montada('https://cuentas.prueba') as raiz:
        base = guia_dinos.base_web(raiz)
        assert mensajes(lambda f: comprobar.revisar_cuentas(raiz, base, f, comprobar.SERVICIO_CUENTAS)) == []
        for sitio, frase in frases:
            pagina = raiz / sitio / 'index.html'
            assert frase.encode() in pagina.read_bytes(), f'{sitio}: con cuentas, el aviso no las describe'
            reescribir(pagina, frase.encode(), b'Otra cosa')
            m = mensajes(lambda f: comprobar.revisar_cuentas(raiz, base, f, comprobar.SERVICIO_CUENTAS))
            assert any('aviso legal' in x and sitio in x for x in m), f'con servicio, no caza un aviso de {sitio} que no describe las cuentas: {m}'


def caza_lo_que_desmiente_el_aviso():
    with tempfile.TemporaryDirectory() as t:
        raiz = Path(t) / 'docs'
        copia_web(raiz)
        assert mensajes(lambda f: comprobar.revisar_privacidad(raiz, f)) == []
        ruta = raiz / 'ruta.js'
        original = ruta.read_bytes()
        ruta.write_bytes(original + b'\nsessionStorage.setItem("a", 1);\n')
        assert any('sessionStorage' in x for x in mensajes(lambda f: comprobar.revisar_privacidad(raiz, f))), 'ruta.js con sessionStorage'
        ruta.write_bytes(original + b'\ndocument.cookie = "a=1";\n')
        assert any('cookie' in x for x in mensajes(lambda f: comprobar.revisar_privacidad(raiz, f))), 'ruta.js con cookie'
        ruta.write_bytes(original)
        efectos = raiz / 'efectos.js'
        efectos.write_bytes(efectos.read_bytes() + b'\nlocalStorage.setItem("a", 1);\n')
        assert any('efectos.js' in x for x in mensajes(lambda f: comprobar.revisar_privacidad(raiz, f))), 'efectos.js con localStorage'
        efectos.write_bytes((montar_web.DOCS / 'efectos.js').read_bytes())
        clan = raiz / 'clan' / 'index.html'
        clan.write_bytes(clan.read_bytes().replace(b'</body>', b'<script src="../ruta.js"></script></body>'))
        assert any('carga ruta.js' in x for x in mensajes(lambda f: comprobar.revisar_privacidad(raiz, f))), 'ruta.js en otra página'


def main():
    sys.stdout.reconfigure(encoding='utf-8')
    prueba('la lista tiene lo que tenía la página de origen', cuenta_del_catalogo)
    prueba('los ids de los logros son los congelados y no dependen del orden', ids_congelados)
    prueba('lo oculto no se enseña y se sigue aceptando', oculto_fuera)
    prueba('cada tramo visible tiene su botón, una vez', cada_tramo_tiene_boton)
    prueba('en inglés no sale «a» delante de un nombre que empieza por vocal', ingles_sin_a_ante_vocal)
    prueba('cada punto del mapa está en una sesión y solo una', cada_punto_en_una_sesion)
    prueba('los datos de la página son los del catálogo', datos_de_la_pagina)
    prueba('Nexus y nuestra lista casan uno a uno, con los mismos tramos', nexus_casa_uno_a_uno)
    prueba('un logro añadido o renombrado sin decidir su correspondencia se caza', nexus_sin_decidir_falla)
    prueba('la tabla de Nexus de la página no nombra lo oculto y cabe en un guardado', nexus_en_la_pagina)
    prueba('el aviso legal habla de la lista de Nexus, con cuentas y sin ellas', aviso_legal_de_nexus)
    prueba('la muestra de Nexus lleva solo lo que el importador lee', muestra_sin_datos_de_nadie)
    prueba('una muestra con premios o datos de una cuenta no pasa', muestra_real_no_pasa)
    prueba('limpiar deja fuera de la muestra todo lo demás de Nexus', limpiar_quita_lo_de_nexus)
    prueba('una dirección de servicio mal escrita para el montaje', direccion_mal_escrita)
    prueba('comprobar.py caza web y servicio desalineados', caza_configuracion_desalineada)
    prueba('el aviso legal solo describe cuentas que existen', el_aviso_solo_describe_cuentas_que_existen)
    prueba('comprobar.py caza lo que desmiente el aviso legal', caza_lo_que_desmiente_el_aviso)
    if fallos:
        sys.exit(f'{fallos} pruebas fallan')
    print('Todas bien')


if __name__ == '__main__':
    main()
