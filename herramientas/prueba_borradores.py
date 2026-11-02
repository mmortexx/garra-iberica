"""Prueba de los borradores sin publicar (borradores/): que comprobar.py los da por buenos tal como están, los
rechaza si dicen algo sin fuente o se salen del formato, y detecta uno que se cuele en la web; y que montar_web.py
no genera nada de ellos.

Uso: python herramientas/prueba_borradores.py
"""
import json
import shutil
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import comprobar  # noqa: E402
import guia_dinos  # noqa: E402
import montar_web  # noqa: E402

sys.stdout.reconfigure(encoding='utf-8')

REAL = comprobar.BORRADORES
fallos = 0


def prueba(nombre, comprobar_algo):
    global fallos
    try:
        comprobar_algo()
        print('ok   ', nombre)
    except AssertionError as e:
        fallos += 1
        print('FALLO', nombre, '→', e)


def revisar(carpeta=REAL, raiz=None):
    """Lo que dice comprobar.revisar_borradores sobre una carpeta de borradores y una web (vacía por defecto)."""
    with tempfile.TemporaryDirectory() as d:
        web = raiz or Path(d)
        mensajes = []
        comprobar.revisar_borradores(web, mensajes.append, carpeta)
        return mensajes


def copia(modificar_ficha=None, modificar_zonas=None):
    """Una carpeta de borradores igual que la real, con los cambios que se pidan."""
    d = Path(tempfile.mkdtemp())
    ficha = json.loads((REAL / 'oviraptor.json').read_text(encoding='utf-8'))
    if modificar_ficha:
        modificar_ficha(ficha)
    (d / 'oviraptor.json').write_text(json.dumps(ficha, ensure_ascii=False), encoding='utf-8')
    zonas = (REAL / 'zonas-compartidas.md').read_text(encoding='utf-8')
    if modificar_zonas:
        zonas = modificar_zonas(zonas)
    (d / 'zonas-compartidas.md').write_text(zonas, encoding='utf-8')
    return d


def rechaza(carpeta, contiene):
    try:
        mensajes = revisar(carpeta)
    finally:
        shutil.rmtree(carpeta, ignore_errors=True)
    assert any(contiene in m for m in mensajes), f'debía fallar por «{contiene}» y dice {mensajes}'


def cambia(clave, valor, idioma='es'):
    def f(ficha):
        (ficha['ficha'] if idioma == 'es' else ficha['ficha']['en'])[clave] = valor
    return f


prueba('los borradores tal como están valen', lambda: (lambda m: None if not m else (_ for _ in ()).throw(AssertionError(m)))(revisar()))
prueba('un peso inventado en la ficha', lambda: rechaza(copia(cambia('peso', '1,2 t')), 'peso'))
prueba('una dieta inventada', lambda: rechaza(copia(cambia('dieta', 'Omnívoro')), 'dieta'))
prueba('un grupo inventado', lambda: rechaza(copia(cambia('grupo', '4')), 'grupo'))
prueba('un crecimiento inventado en inglés', lambda: rechaza(copia(cambia('crece', '2 h', 'en')), 'crece'))
prueba('una mutación recomendada sin comprobar', lambda: rechaza(copia(cambia('mut', ['CR'])), 'mutaciones'))
prueba('una habilidad de más', lambda: rechaza(copia(cambia('hab', ['Come huevos: por ahora es el único dino que puede (DevBlog #74, 31/10/2026)', 'Salta mucho'])), 'hab'))
prueba('un consejo inventado en inglés', lambda: rechaza(copia(cambia('consejo', 'Hit and run.', 'en')), 'consejo'))
prueba('una clave de más en la ficha', lambda: rechaza(copia(lambda f: f['ficha'].update(velocidad='rápido')), 'claves'))
prueba('una clave de menos en la ficha en inglés', lambda: rechaza(copia(lambda f: f['ficha']['en'].pop('hab')), 'claves'))
prueba('sin la fuente', lambda: rechaza(copia(lambda f: f.update(_fuente='un rumor')), 'DevBlog #74'))
prueba('sin el aviso de sin publicar', lambda: rechaza(copia(lambda f: f.update(_estado='listo')), 'SIN PUBLICAR'))
prueba('zonas: otra cifra', lambda: rechaza(copia(modificar_zonas=lambda t: t.replace('15 minutos', '20 minutos')), 'minutos'))
prueba('zonas: una cifra de más', lambda: rechaza(copia(modificar_zonas=lambda t: t.replace('cooldown', 'cooldown of 30 seconds')), 'cifra'))
prueba('zonas: falta el tiempo de espera', lambda: rechaza(copia(modificar_zonas=lambda t: t.replace('tiempo de espera', 'descanso')), 'tiempo de espera'))
prueba('zonas: sin decir que no está en el juego', lambda: rechaza(copia(modificar_zonas=lambda t: t.replace('Aún no está en el juego', 'Está en el juego')), 'cabecera'))


def sin_carpeta():
    mensajes = revisar(Path(tempfile.gettempdir()) / 'no-hay-borradores')
    assert any('oviraptor.json' in m for m in mensajes) and any('zonas-compartidas.md' in m for m in mensajes), mensajes


prueba('sin borradores, avisa de que faltan', sin_carpeta)


def ya_publicada():
    real = guia_dinos.datos
    d = real()
    d['fichas'] = d['fichas'] + [{**d['fichas'][0], 'nombre': 'Oviraptor'}]
    comprobar.guia_dinos.datos = lambda: d
    try:
        mensajes = revisar()
    finally:
        comprobar.guia_dinos.datos = real
    assert any('borra borradores/oviraptor.json' in m for m in mensajes), mensajes


prueba('una ficha de Oviraptor ya publicada pide borrar el borrador', ya_publicada)


# Que no se cuelen en la web: cada frase propia de un borrador, en un fichero cualquiera de docs/, salta.
def fuga(frase):
    def f():
        with tempfile.TemporaryDirectory() as d:
            web = Path(d)
            (web / 'sub').mkdir()
            (web / 'sub' / 'index.html').write_text(f'<p>Texto normal. {frase.upper()} más texto.</p>', encoding='utf-8')
            mensajes = revisar(raiz=web)
        assert any(frase in m for m in mensajes), f'una página con «{frase}» no salta: {mensajes}'
    return f


for frase in comprobar.FRASES_BORRADOR:
    prueba(f'se detecta «{frase}» en una página de la web', fuga(frase))


def web_real_limpia():
    web = Path(__file__).resolve().parent.parent / 'docs'
    mensajes = revisar(raiz=web)
    assert not mensajes, mensajes


prueba('la web publicada no lleva nada de los borradores', web_real_limpia)


def montar_no_los_publica():
    salida = montar_web.montar()
    assert not any('oviraptor' in nombre.casefold() for nombre in salida), 'monta una página de Oviraptor'
    for frase in comprobar.FRASES_BORRADOR:
        asoma = [n for n, texto in salida.items() if frase.casefold() in texto.casefold()]
        assert not asoma, f'montar_web.py escribe «{frase}» en {asoma[:3]}'
    assert 'especie-oviraptor' not in montar_web.ESPECIES


prueba('montar_web.py no genera nada de los borradores', montar_no_los_publica)


def montar_si_se_ficha_se_ve():
    """Si Oviraptor estuviera en las fichas, montar_web.py sí lo publicaría: la comprobación de arriba puede fallar."""
    fichas = json.loads(guia_dinos.FICHAS.read_text(encoding='utf-8'))
    fichas['fichas'].append({**fichas['fichas'][0], 'nombre': 'Oviraptor'})
    with tempfile.TemporaryDirectory() as d:
        ruta = Path(d) / 'fichas.json'
        ruta.write_text(json.dumps(fichas), encoding='utf-8')
        real = guia_dinos.FICHAS
        guia_dinos.FICHAS = ruta
        try:
            texto = montar_web.pagina_web('dinosaurios', 'es', d=guia_dinos.datos())
        finally:
            guia_dinos.FICHAS = real
    assert 'Oviraptor' in texto, 'una ficha nueva no sale en la guía: la comprobación anterior no demostraría nada'


prueba('una ficha de Oviraptor en fichas_dinos.json sí saldría en la guía', montar_si_se_ficha_se_ve)

print(f'{fallos} fallos' if fallos else 'Todo correcto')
sys.exit(1 if fallos else 0)
