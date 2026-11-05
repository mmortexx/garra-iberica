"""Prueba de la ruta de logros: que la página enseña toda la lista y solo ella, y que comprobar.py caza lo que dejaría
las cuentas rotas o desmentiría el aviso legal.

Uso: python herramientas/prueba_logros.py
"""
from html import unescape
import json
import re
import shutil
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import comprobar  # noqa: E402
import guia_dinos  # noqa: E402
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


def caza_configuracion_desalineada():
    with tempfile.TemporaryDirectory() as t:
        raiz = Path(t) / 'docs'
        copia_web(raiz)
        base = guia_dinos.base_web(raiz)
        real = comprobar.SERVICIO_CUENTAS
        assert mensajes(lambda f: comprobar.revisar_cuentas(raiz, base, f, real)) == []
        otro = Path(t) / 'wrangler.toml'
        otro.write_text(real.read_text(encoding='utf-8').replace('/en/route/', '/en/ruta/'), encoding='utf-8')
        m = mensajes(lambda f: comprobar.revisar_cuentas(raiz, base, f, otro))
        assert any('PAGINA_EN' in x for x in m), f'no caza PAGINA_EN mal: {m}'
        pagina = raiz / 'clan' / 'index.html'
        pagina.write_bytes(pagina.read_bytes().replace(b"connect-src 'self';", b"connect-src 'self' https://cuentas.prueba;"))
        m = mensajes(lambda f: comprobar.revisar_cuentas(raiz, base, f, real))
        assert any('clan/index.html' in x and 'connect-src' in x for x in m), f'no caza que otra página hable con el servicio: {m}'
        ruta = raiz / 'ruta' / 'index.html'
        ruta.write_bytes(ruta.read_bytes().replace(b'data-servicio=""', b'data-servicio="https://cuentas.prueba"'))
        m = mensajes(lambda f: comprobar.revisar_cuentas(raiz, base, f, real))
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
    with tempfile.TemporaryDirectory() as t:
        raiz = Path(t) / 'docs'
        copia_web(raiz)
        base = guia_dinos.base_web(raiz)
        real = comprobar.SERVICIO_CUENTAS
        for sitio, frase in (('legal', 'Si entras con Discord'), ('en/legal', 'If you sign in with Discord')):
            pagina = raiz / sitio / 'index.html'
            bien = pagina.read_bytes()
            assert frase.encode() not in bien, f'{sitio}: describe cuentas mientras cuentas.json está vacío'
            pagina.write_bytes(bien.replace(b'</main>', f'<p>{frase}</p></main>'.encode()))
            m = mensajes(lambda f: comprobar.revisar_cuentas(raiz, base, f, real))
            assert any('aviso legal' in x and sitio in x for x in m), f'no caza {sitio} describiendo cuentas: {m}'
            pagina.write_bytes(bien)
        direccion = logros_web.servicio
        logros_web.servicio = lambda: 'https://cuentas.prueba'
        try:
            m = mensajes(lambda f: comprobar.revisar_cuentas(raiz, base, f, real))
        finally:
            logros_web.servicio = direccion
        assert any('aviso legal' in x for x in m), f'con servicio, no caza un aviso que no describe las cuentas: {m}'


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
    prueba('cada punto del mapa está en una sesión y solo una', cada_punto_en_una_sesion)
    prueba('los datos de la página son los del catálogo', datos_de_la_pagina)
    prueba('una dirección de servicio mal escrita para el montaje', direccion_mal_escrita)
    prueba('comprobar.py caza web y servicio desalineados', caza_configuracion_desalineada)
    prueba('el aviso legal solo describe cuentas que existen', el_aviso_solo_describe_cuentas_que_existen)
    prueba('comprobar.py caza lo que desmiente el aviso legal', caza_lo_que_desmiente_el_aviso)
    if fallos:
        sys.exit(f'{fallos} pruebas fallan')
    print('Todas bien')


if __name__ == '__main__':
    main()
