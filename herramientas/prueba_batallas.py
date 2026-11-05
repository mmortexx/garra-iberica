"""Prueba de batallas_web.py: el recuento de ganadas y los rótulos de cada resultado en la tira de la portada y en la
lista de El clan, también en curso y sin ninguna batalla; la fecha y la nota de cada batalla salen cuando existen, en
el idioma de la página, y no salen cuando no existen; el fichero con una fecha o una nota mal puesta se rechaza.

Uso: python herramientas/prueba_batallas.py
"""
import json
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import batallas_web as b  # noqa: E402

sys.stdout.reconfigure(encoding='utf-8')

BASE = {'clave': 'a-1', 'rival': 'Alfa', 'nosotros': 3, 'ellos': 6, 'resultado': 'victoria'}
fallos = 0


def prueba(nombre, comprobar):
    global fallos
    try:
        comprobar()
        print('ok   ', nombre)
    except AssertionError as e:
        fallos += 1
        print('FALLO', nombre, '→', e)


def cargadas(*batallas):
    """Lo que devuelve cargar() para un fichero con estas batallas."""
    with tempfile.TemporaryDirectory() as d:
        ruta = Path(d) / 'batallas.json'
        ruta.write_text(json.dumps({'batallas': list(batallas)}), encoding='utf-8')
        return b.cargar(ruta)


def rechaza(batalla, contiene):
    try:
        cargadas(batalla)
    except SystemExit as e:
        assert contiene in str(e), f'se para por «{e}» y debía mencionar «{contiene}»'
        return
    raise AssertionError('lo acepta y no debería')


def con_fecha_y_nota():
    lista = cargadas({**BASE, 'fecha': '2026-10-31', 'nota_es': 'Cayeron en el río & huyeron <rápido>.', 'nota_en': 'They fell at the river.'})
    es, en = b.lista('es', lista), b.lista('en', lista)
    assert '<time datetime="2026-10-31">31 de octubre de 2026</time>' in es, es
    assert '<time datetime="2026-10-31">31 October 2026</time>' in en, en
    assert '<p class="batalla-nota">Cayeron en el río &amp; huyeron &lt;rápido&gt;.</p>' in es, 'la nota en español, escapada'
    assert '<p class="batalla-nota">They fell at the river.</p>' in en and 'Cayeron' not in en, 'la nota en inglés'
    assert es.index('Victoria<time') < es.index('batalla-nota'), 'la fecha va con el resultado y la nota detrás'


def fecha_de_un_digito():
    lista = cargadas({**BASE, 'fecha': '2026-11-02'})
    assert '>2 de noviembre de 2026</time>' in b.lista('es', lista) and '>2 November 2026</time>' in b.lista('en', lista)


def sin_fecha_ni_nota():
    lista = cargadas(BASE)
    for lang in ('es', 'en'):
        html = b.lista(lang, lista)
        assert '<time' not in html and 'batalla-nota' not in html, html


def solo_fecha():
    html = b.lista('es', cargadas({**BASE, 'fecha': '2026-10-31'}))
    assert '<time datetime="2026-10-31">' in html and 'batalla-nota' not in html


def solo_nota():
    html = b.lista('en', cargadas({**BASE, 'nota_es': 'Una nota.', 'nota_en': 'A note.'}))
    assert '<p class="batalla-nota">A note.</p>' in html and '<time' not in html


def varias_batallas():
    lista = cargadas({**BASE, 'clave': 'a-1', 'fecha': '2026-10-31', 'nota_es': 'Primera.', 'nota_en': 'First.'},
                     {**BASE, 'clave': 'b-1', 'rival': 'Beta'})
    html = b.lista('es', lista)
    assert html.index('Beta') < html.index('Alfa'), 'la última batalla, arriba'
    assert html.count('<time') == 1 and html.count('batalla-nota') == 1, 'la fecha y la nota son de su batalla'


def videos_en_el_orden_de_la_lista():
    lista = cargadas({**BASE, 'clave': 'smoke-1', 'rival': 'Smoke'}, {**BASE, 'clave': 'delta-1', 'rival': 'Delta'})
    html = b.lista('es', lista)
    assert html.index('batalla-delta-1.mp4') < html.index('batalla-smoke-1.mp4'), 'la lista, de la última a la primera'
    urls = [n['contentUrl'] for n in b.videos_declarados('es', 'https://x/', lista)]
    assert urls == ['https://x/video/batalla-delta-1.mp4', 'https://x/video/batalla-smoke-1.mp4'], urls


VICTORIA = {**BASE, 'clave': 'v-1', 'rival': 'Vencidos', 'nosotros': 6, 'ellos': 3}
DERROTA = {**BASE, 'clave': 'd-1', 'rival': 'Duros', 'nosotros': 6, 'ellos': 3, 'resultado': 'derrota'}
EMPATE = {**BASE, 'clave': 'e-1', 'rival': 'Iguales', 'nosotros': 4, 'ellos': 4, 'resultado': 'empate'}
EN_CURSO = {**BASE, 'clave': 'c-1', 'rival': 'Pendientes', 'resultado': None}


def cuenta_solo_las_ganadas():
    filas = b.filas('es', 'clan/', cargadas(VICTORIA, DERROTA, EMPATE, EN_CURSO))
    assert '<b>1 de 3</b><span>batallas ganadas</span>' in filas[0], filas[0]
    filas = b.filas('en', 'clan/', cargadas(VICTORIA, DERROTA, EMPATE, EN_CURSO))
    assert '<b>1 of 3</b><span>battles won</span>' in filas[0], filas[0]


def ninguna_ganada():
    filas = b.filas('es', 'clan/', cargadas(DERROTA, EMPATE))
    assert '<b>0 de 2</b><span>batallas ganadas</span>' in filas[0], filas[0]


def en_singular():
    es, en = b.filas('es', 'clan/', cargadas(VICTORIA))[0], b.filas('en', 'clan/', cargadas(DERROTA))[0]
    assert '<b>1 de 1</b><span>batalla ganada</span>' in es, es
    assert '<b>0 of 1</b><span>battle won</span>' in en, en


def solo_en_curso_no_cuenta():
    filas = b.filas('es', 'clan/', cargadas(EN_CURSO))
    assert not any(' de ' in f.split('<span>')[0] for f in filas), f'sin batallas terminadas no hay recuento: {filas}'
    assert any('En curso contra Pendientes' in f for f in filas), filas


def lista_vacia():
    for lang in ('es', 'en'):
        assert b.filas(lang, 'clan/', []) == [], 'la tira, vacía'
        assert '<li' not in b.lista(lang, []) and '<ol' in b.lista(lang, []), 'la lista, sin filas'


def rotulos(batalla, es, en, resultado_es, resultado_en, clase):
    def f():
        lista = cargadas(batalla)
        assert any(f'<span>{es}</span>' in x for x in b.filas('es', 'clan/', lista)), b.filas('es', 'clan/', lista)
        assert any(f'<span>{en}</span>' in x for x in b.filas('en', 'clan/', lista)), b.filas('en', 'clan/', lista)
        assert f'class="batalla-resultado {clase}">{resultado_es}<' in b.lista('es', lista), b.lista('es', lista)
        assert f'class="batalla-resultado {clase}">{resultado_en}<' in b.lista('en', lista), b.lista('en', lista)
    return f


def inferioridad_solo_terminada():
    inferior = {'nosotros': 3, 'ellos': 6}
    assert b.frase({**DERROTA, **inferior}, 'es') == 'Derrota ante Duros, en inferioridad'
    assert b.frase({**DERROTA, **inferior}, 'en') == 'Defeat against Duros, outnumbered'
    assert 'inferioridad' not in b.frase({**EN_CURSO, **inferior}, 'es'), 'una batalla en curso aún no se califica'
    assert 'inferioridad' not in b.frase(DERROTA, 'es'), 'con más jugadores que el rival no hay inferioridad'


def portada_solo_las_ultimas():
    varias = [{**VICTORIA, 'clave': f'v-{n}', 'rival': f'Rival{n}'} for n in range(b.EN_PORTADA + 1)]
    filas = b.filas('es', 'clan/', cargadas(*varias))
    texto = ' '.join(filas)
    assert f'<b>{len(varias)} de {len(varias)}</b>' in filas[0], 'el recuento es de todas, no de las que salen'
    assert 'Rival0' not in texto, 'la más vieja no sale en la portada'
    assert texto.index(f'Rival{b.EN_PORTADA}') < texto.index('Rival1'), 'la última, primero'
    assert 'href="@/clan/#batallas"' in filas[-1], filas[-1]


prueba('cuenta solo las ganadas, de las terminadas', cuenta_solo_las_ganadas)
prueba('ninguna ganada', ninguna_ganada)
prueba('el recuento de una sola, en singular', en_singular)
prueba('solo en curso: sin recuento', solo_en_curso_no_cuenta)
prueba('sin batallas: tira y lista vacías', lista_vacia)
prueba('rótulos de una victoria', rotulos(VICTORIA, 'Victoria ante Vencidos', 'Victory over Vencidos', 'Victoria', 'Victory', 'batalla-victoria'))
prueba('rótulos de una derrota', rotulos(DERROTA, 'Derrota ante Duros', 'Defeat against Duros', 'Derrota', 'Defeat', 'batalla-derrota'))
prueba('rótulos de un empate', rotulos(EMPATE, 'Empate con Iguales', 'Draw with Iguales', 'Empate', 'Draw', 'batalla-empate'))
prueba('rótulos de una en curso', rotulos(EN_CURSO, 'En curso contra Pendientes', 'In progress against Pendientes', 'En curso', 'In progress', 'batalla-curso'))
prueba('«en inferioridad» solo si terminó y eran menos', inferioridad_solo_terminada)
prueba('la portada lleva las últimas y el recuento de todas', portada_solo_las_ultimas)
prueba('la fecha y la nota salen en su idioma, con la nota escapada', con_fecha_y_nota)
prueba('los vídeos declarados van en el orden de la lista', videos_en_el_orden_de_la_lista)
prueba('el día de un solo dígito sale sin cero', fecha_de_un_digito)
prueba('sin fecha ni nota no sale ninguna', sin_fecha_ni_nota)
prueba('solo la fecha', solo_fecha)
prueba('solo la nota', solo_nota)
prueba('cada una con su batalla', varias_batallas)
prueba('fecha con otro formato', lambda: rechaza({**BASE, 'fecha': '31/10/2026'}, 'AAAA-MM-DD'))
prueba('fecha que no existe', lambda: rechaza({**BASE, 'fecha': '2026-02-30'}, 'AAAA-MM-DD'))
prueba('nota solo en español', lambda: rechaza({**BASE, 'nota_es': 'Una nota.'}, 'español y en inglés'))
prueba('nota solo en inglés', lambda: rechaza({**BASE, 'nota_en': 'A note.'}, 'español y en inglés'))

print(f'{fallos} fallos' if fallos else 'Todo correcto')
sys.exit(1 if fallos else 0)
