"""Prueba de cifras.py: qué cifras del clan acepta, qué rechaza, cómo se copian y cómo salen en la portada
(también cuando no hay datos). No necesita el proyecto del Discord.

Uso: python herramientas/prueba_cifras.py
"""
import json
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import cifras  # noqa: E402
import guia_dinos  # noqa: E402
import montar_web  # noqa: E402

sys.stdout.reconfigure(encoding='utf-8')

BUENAS = {
    'bajas': 587, 'horas': 1608.4, 'misiones': 2047, 'jugadores': 9, 'fecha': '2026-11-02',
    'especies': [{'name': 'Tyrannosaurus', 'kills': 140}, {'name': 'Allosaurus', 'kills': 88}],
}
fallos = 0


def prueba(nombre, comprobar):
    global fallos
    try:
        comprobar()
        print('ok   ', nombre)
    except AssertionError as e:
        fallos += 1
        print('FALLO', nombre, '→', e)


def con(**cambios):
    return {**BUENAS, **cambios}


def sin(clave):
    return {k: v for k, v in BUENAS.items() if k != clave}


def rechaza(datos, contiene):
    """El validador se para, y el motivo menciona lo que se espera."""
    try:
        cifras.leer(json.dumps(datos).encode('utf-8') if not isinstance(datos, bytes) else datos, 'x.json')
    except SystemExit as e:
        assert contiene in str(e), f'se para por «{e}» y debía mencionar «{contiene}»'
        return
    raise AssertionError('lo acepta y no debería')


# Lo que vale.
prueba('el formato acordado vale', lambda: cifras.leer(json.dumps(BUENAS).encode('utf-8'), 'x.json'))
prueba('sin especies también vale', lambda: cifras.leer(json.dumps(con(especies=[])).encode('utf-8'), 'x.json'))
prueba('ceros y horas enteras valen', lambda: cifras.leer(json.dumps(con(bajas=0, horas=0, misiones=0, jugadores=0)).encode('utf-8'), 'x.json'))
prueba('nombre con espacio o guion vale', lambda: cifras.leer(json.dumps(con(especies=[{'name': 'Allo saurus-X', 'kills': 1}])).encode('utf-8'), 'x.json'))

# Lo que se rechaza: cualquier campo que no sea del formato, y los valores que no son lo que dicen.
prueba('campo de más en la raíz', lambda: rechaza(con(apodo='Fulano'), 'apodo'))
prueba('campo de más en una especie', lambda: rechaza(con(especies=[{'name': 'Allosaurus', 'kills': 3, 'jugador': 'Fulano'}]), 'solo'))
prueba('campo de menos en una especie', lambda: rechaza(con(especies=[{'name': 'Allosaurus'}]), 'solo'))
prueba('falta un campo', lambda: rechaza(sin('misiones'), 'misiones'))
prueba('no es un objeto', lambda: rechaza([BUENAS], 'objeto'))
prueba('bajas negativas', lambda: rechaza(con(bajas=-1), 'bajas'))
prueba('bajas con decimales', lambda: rechaza(con(bajas=5.5), 'bajas'))
prueba('bajas como texto', lambda: rechaza(con(bajas='587'), 'bajas'))
prueba('un booleano no es un número', lambda: rechaza(con(jugadores=True), 'jugadores'))
prueba('horas como texto', lambda: rechaza(con(horas='1608'), 'horas'))
prueba('horas negativas', lambda: rechaza(con(horas=-0.5), 'horas'))
prueba('cifra desmesurada', lambda: rechaza(con(misiones=10**12), 'misiones'))
prueba('NaN en el JSON', lambda: rechaza(b'{"bajas": NaN}', 'no es un número'))
prueba('Infinity en el JSON', lambda: rechaza(json.dumps(BUENAS).replace('1608.4', 'Infinity').encode('utf-8'), 'no es un número'))
prueba('JSON roto', lambda: rechaza(b'{"bajas": 5', 'no se puede leer'))
prueba('no es UTF-8', lambda: rechaza(b'\xff\xfe{}', 'no se puede leer'))
prueba('fecha con otro formato', lambda: rechaza(con(fecha='02/11/2026'), 'fecha'))
prueba('fecha que no existe', lambda: rechaza(con(fecha='2026-13-01'), 'fecha'))
prueba('fecha que no es texto', lambda: rechaza(con(fecha=20261102), 'fecha'))
prueba('especies que no es una lista', lambda: rechaza(con(especies={'Allosaurus': 3}), 'especies'))
prueba('demasiadas especies', lambda: rechaza(con(especies=[{'name': f'Especie{chr(97 + i % 26) * (i // 26 + 1)}', 'kills': 1} for i in range(cifras.MAX_ESPECIES + 1)]), 'especies'))
prueba('especie con un ID de Discord', lambda: rechaza(con(especies=[{'name': '743866660481663056', 'kills': 3}]), 'especie'))
prueba('especie con un apodo con cifras', lambda: rechaza(con(especies=[{'name': 'xX_Fulano_99', 'kills': 3}]), 'especie'))
prueba('especie con etiquetas', lambda: rechaza(con(especies=[{'name': '<b>Allosaurus</b>', 'kills': 3}]), 'especie'))
prueba('especie vacía', lambda: rechaza(con(especies=[{'name': '', 'kills': 3}]), 'especie'))
prueba('especie demasiado larga', lambda: rechaza(con(especies=[{'name': 'A' * 41, 'kills': 3}]), 'especie'))
prueba('especie repetida', lambda: rechaza(con(especies=[{'name': 'Allosaurus', 'kills': 3}, {'name': 'allosaurus', 'kills': 4}]), 'dos veces'))
prueba('bajas de una especie con decimales', lambda: rechaza(con(especies=[{'name': 'Allosaurus', 'kills': 2.5}]), 'Allosaurus'))


# Copiar el original: solo si es válido, y la copia se queda como estaba si no.
def copia_del_original():
    with tempfile.TemporaryDirectory() as d:
        original, copia = Path(d) / 'original.json', Path(d) / 'copia.json'
        antes = (cifras.ORIGINAL, cifras.COPIA)
        cifras.ORIGINAL, cifras.COPIA = original, copia
        try:
            assert cifras.al_dia() is False and not copia.exists(), 'sin original no hay nada que copiar'
            assert cifras.cargar() is None, 'sin copia, cargar() devuelve None'
            original.write_bytes(json.dumps(BUENAS).encode('utf-8'))
            assert cifras.al_dia() is True and copia.read_bytes() == original.read_bytes(), 'no copia el original válido'
            assert cifras.al_dia() is False, 'lo copia otra vez aunque no ha cambiado'
            assert cifras.cargar()['bajas'] == 587
            bueno = copia.read_bytes()
            original.write_bytes(json.dumps(con(apodo='Fulano')).encode('utf-8'))
            try:
                cifras.al_dia()
            except SystemExit:
                assert copia.read_bytes() == bueno, 'copia un original con un campo de más'
            else:
                raise AssertionError('acepta un original con un campo de más')
        finally:
            cifras.ORIGINAL, cifras.COPIA = antes


prueba('la copia sigue al original, solo si es válido', copia_del_original)


# Cómo salen. Los esperados están escritos a mano, no sacados del programa.
def numeros():
    assert cifras.numero(1608.4, 'es') == '1608', cifras.numero(1608.4, 'es')
    assert cifras.numero(1608.6, 'es') == '1609'
    assert cifras.numero(9999, 'es') == '9999'
    assert cifras.numero(12345, 'es') == '12 345'
    assert cifras.numero(1234567, 'es') == '1 234 567'
    assert cifras.numero(1608.4, 'en') == '1,608'
    assert cifras.numero(587, 'en') == '587'
    assert cifras.numero(0, 'es') == '0'


prueba('los números, a la española y a la inglesa', numeros)


def filas_es():
    lis = cifras.filas('es', BUENAS)
    assert lis == [
        '<li class="revelar"><b>587</b><span>bajas del clan</span></li>',
        '<li class="revelar"><b>1608</b><span>horas jugadas</span></li>',
        '<li class="revelar"><b>2047</b><span>misiones completadas</span></li>',
        '<li class="revelar"><b>9</b><span>jugadores en Nexus</span></li>',
        '<li class="cifras-nota"><span>Datos de Asura Nexus a <time datetime="2026-11-02">2 de noviembre de 2026</time></span></li>',
    ], lis


def filas_en_y_singular():
    lis = cifras.filas('en', con(bajas=1, jugadores=1, horas=0.4, misiones=0))
    assert lis == [
        '<li class="revelar"><b>1</b><span>clan kill</span></li>',
        '<li class="revelar"><b>0</b><span>hours played</span></li>',
        '<li class="revelar"><b>0</b><span>quests completed</span></li>',
        '<li class="revelar"><b>1</b><span>player on Nexus</span></li>',
        '<li class="cifras-nota"><span>Asura Nexus data as of <time datetime="2026-11-02">2 November 2026</time></span></li>',
    ], lis


prueba('las cifras en español', filas_es)
prueba('las cifras en inglés, con singular y ceros', filas_en_y_singular)

FICHAS = [{'nombre': 'Tyrannosaurus'}, {'nombre': 'Allosaurus'}]


def podio_con_enlaces():
    html = cifras.podio('es', con(especies=[{'name': 'Allosaurus', 'kills': 88}, {'name': 'Tyrannosaurus', 'kills': 140}, {'name': 'Zzzsaurus', 'kills': 1}]), FICHAS)
    esperado = (
        '<section class="podio" aria-labelledby="t-podio"><div class="envoltura"><h2 id="t-podio" class="podio-titulo">Bajas por especie</h2>'
        '<ol class="podio-lista escalonado" role="list">'
        '<li class="revelar"><span class="podio-nombre"><a href="@/dinosaurios/tyrannosaurus/">Tyrannosaurus</a></span><b>140</b><span class="oculto"> bajas</span></li>'
        '<li class="revelar"><span class="podio-nombre"><a href="@/dinosaurios/allosaurus/">Allosaurus</a></span><b>88</b><span class="oculto"> bajas</span></li>'
        '<li class="revelar"><span class="podio-nombre">Zzzsaurus</span><b>1</b><span class="oculto"> baja</span></li>'
        '</ol></div></section>')
    assert html == esperado, html


def podio_sin_especies():
    assert cifras.podio('es', con(especies=[]), FICHAS) == ''


prueba('el podio ordena de más a menos y enlaza solo las fichas que hay', podio_con_enlaces)
prueba('sin especies no hay podio', podio_sin_especies)


def fichas_del_podio_existen():
    """Las seis especies de las cifras iniciales tienen ficha: cada una enlaza a su página."""
    inicial = cifras.leer((Path(cifras.__file__).parent / 'cifras.json').read_bytes(), 'cifras.json')
    nombres = {f['nombre'] for f in guia_dinos.datos()['fichas']}
    html = cifras.podio('en', inicial, guia_dinos.datos()['fichas'])
    for e in inicial['especies']:
        assert e['name'] in nombres, f'{e["name"]} no tiene ficha'
        assert f'<a href="@/{guia_dinos.ruta_especie(e["name"], "en")}">{e["name"]}</a>' in html, e['name']


prueba('las especies de las cifras de la web enlazan a su ficha', fichas_del_podio_existen)


# La portada con y sin cifras.
def portada_sin_copia():
    with tempfile.TemporaryDirectory() as d:
        antes = cifras.COPIA
        cifras.COPIA = Path(d) / 'no_hay.json'
        try:
            for lang in montar_web.LANGS:
                html = montar_web.pagina_web('inicio', lang)
                assert 'class="podio"' not in html and 'cifras-nota' not in html, 'salen cifras sin datos'
                assert '<ul class="cifras' in html, 'sin cifras del clan, las batallas siguen en la portada'
                assert '{{' not in html, 'queda un marcador sin rellenar'
        finally:
            cifras.COPIA = antes


def portada_con_copia():
    html = montar_web.pagina_web('inicio', 'es')
    assert '<b>587</b><span>bajas del clan</span>' in html and 'class="podio"' in html
    assert html.index('<ul class="cifras') < html.index('class="podio"') < html.index('id="quienes"')
    assert html.count('<ul class="cifras') == 1, 'las cifras del clan y las batallas van en la misma tira'
    en = montar_web.pagina_web('inicio', 'en')
    assert '<a href="../en/dinosaurs/tyrannosaurus/">Tyrannosaurus</a>' in en, 'en inglés, el enlace va a la ficha inglesa'
    assert 'Kills by species' in en and 'dinosaurios/tyrannosaurus' not in en.split('Kills by species')[1].split('id="quienes"')[0]


prueba('la portada sale sin romperse si no hay cifras', portada_sin_copia)
prueba('la portada con cifras las pone junto a las batallas, con el podio debajo', portada_con_copia)

print(f'{fallos} fallos' if fallos else 'Todo correcto')
sys.exit(1 if fallos else 0)
