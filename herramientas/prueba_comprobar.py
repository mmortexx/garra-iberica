"""Prueba de lo que comprobar.py y los scripts de montar deben parar: un script de más que guarde algo en el navegador,
un ID o un apodo en fichas_dinos.json, mutaciones sin traducir y una foto de la tira que no está en la galería.

Uso: python herramientas/prueba_comprobar.py
"""
import json
import shutil
import sys
import tempfile
import uuid
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import comprobar  # noqa: E402
import guia_dinos  # noqa: E402
import montar_web  # noqa: E402

sys.stdout.reconfigure(encoding='utf-8')

DOCS = Path(__file__).resolve().parent.parent / 'docs'
GUARDAN = ('localStorage', 'sessionStorage', 'indexedDB', 'openDatabase', 'document.cookie', 'caches.open', 'serviceWorker')
APODO_FALSO = 'ApodoDePruebaXyz'
fallos = 0


def prueba(nombre, comprobar_algo):
    global fallos
    try:
        comprobar_algo()
        print('ok   ', nombre)
    except Exception as e:  # Un KeyError es justo lo que no debe salir: cuenta como fallo, no para la prueba.
        fallos += 1
        print('FALLO', nombre, '→', f'{type(e).__name__}: {e}')


def privacidad(raiz):
    mensajes = []
    comprobar.revisar_privacidad(raiz, mensajes.append)
    return mensajes


def copia_web():
    """Una copia de docs/ sin imágenes, vídeos ni fuentes: revisar_privacidad solo lee texto."""
    d = Path(tempfile.mkdtemp())
    shutil.copytree(DOCS, d, dirs_exist_ok=True, ignore=shutil.ignore_patterns('*.webp', '*.jpg', '*.png', '*.mp4', '*.woff2', '*.ico'))
    return d


def web_tal_cual():
    d = copia_web()
    try:
        assert not privacidad(d), privacidad(d)
    finally:
        shutil.rmtree(d, ignore_errors=True)


def script_de_mas(palabra, carpeta):
    """Un nombre y un sitio que no conoce nadie: si la revisión tira de una lista de ficheros, no lo ve."""
    def f():
        d = copia_web()
        try:
            nombre = f'{uuid.uuid4().hex}.js'
            sitio = d / carpeta / nombre
            sitio.parent.mkdir(parents=True, exist_ok=True)
            sitio.write_text(f'{palabra};\n', encoding='utf-8')
            mensajes = privacidad(d)
            assert any(nombre in m for m in mensajes), f'un script con {palabra} en {carpeta or "la raíz"} pasa: {mensajes}'
        finally:
            shutil.rmtree(d, ignore_errors=True)
    return f


def con_fichas(cambiar, hacer):
    """Ejecuta hacer() como si fichas_dinos.json tuviera el cambio. Se llama igual: los mensajes nombran el fichero."""
    with tempfile.TemporaryDirectory() as d:
        ruta = Path(d) / guia_dinos.FICHAS.name
        fichas = json.loads(guia_dinos.FICHAS.read_text(encoding='utf-8'))
        cambiar(fichas)
        ruta.write_text(json.dumps(fichas, ensure_ascii=False), encoding='utf-8')
        real, guia_dinos.FICHAS = guia_dinos.FICHAS, ruta
        try:
            return hacer()
        finally:
            guia_dinos.FICHAS = real


def comprobar_web():
    return comprobar.main(DOCS, sin_apodos=True, avisa=lambda _: None)


def id_en_las_fichas():
    numero = '123456789012345678'
    mensajes = con_fichas(lambda f: f.update(apunte=numero), comprobar_web)
    assert any('fichas_dinos.json' in m and numero in m for m in mensajes), f'un ID en una clave de arriba pasa: {mensajes}'


def apodo_en_las_fichas():
    with tempfile.TemporaryDirectory() as d:
        lista = Path(d) / 'vigilar.txt'
        lista.write_text(APODO_FALSO + '\n', encoding='utf-8')
        real, comprobar.VIGILAR = comprobar.VIGILAR, lista
        try:
            mensajes = con_fichas(lambda f: f.update(apunte=f'Lo dijo {APODO_FALSO}'), lambda: comprobar.main(DOCS, avisa=lambda _: None))
        finally:
            comprobar.VIGILAR = real
    assert any('fichas_dinos.json' in m and APODO_FALSO in m for m in mensajes), f'un apodo en una clave de arriba pasa: {mensajes}'


def fichas_reales_limpias():
    mensajes = [m for m in comprobar_web() if 'fichas_dinos.json' in m]
    assert not mensajes, mensajes


def mutacion_en(falta_en, sobra_en):
    def cambiar(fichas):
        # Una que no recomienda ninguna ficha: las recomendadas ya las paraba la revisión de cada ficha.
        fichas[sobra_en]['ZZ'] = next(iter(fichas[sobra_en].values()))

    def f():
        mensaje = ''
        try:
            con_fichas(cambiar, guia_dinos.datos)
        except SystemExit as e:
            mensaje = str(e)
        assert falta_en in mensaje and sobra_en in mensaje, f'datos() debía parar nombrando {falta_en} y {sobra_en}; dice «{mensaje}»'
        mensajes = con_fichas(cambiar, comprobar_web)
        assert any(falta_en in m and m.startswith(guia_dinos.FICHAS.name) for m in mensajes), f'comprobar.py no lo recoge: {mensajes}'
    return f


def sin_seccion_de_mutaciones():
    mensaje = ''
    try:
        con_fichas(lambda f: f.pop('mut_en'), guia_dinos.datos)
    except SystemExit as e:
        mensaje = str(e)
    assert 'mut_en' in mensaje, f'sin mut_en debía parar con un mensaje claro; dice «{mensaje}»'


def tira(nombre):
    return f'<li><img src="@/img/{nombre}-600.webp" width="600" alt=""></li>'


def tira_con_foto_de_la_galeria():
    galeria = (montar_web.FUENTES / 'es' / 'galeria.html').read_text(encoding='utf-8')
    foto = galeria.split('class="foto-ampliar" href="@/img/')[1].split('-ampliada-')[0]
    assert 'alt=""' not in montar_web.textos_tira(tira(foto), 'es')


def tira_con_foto_de_fuera():
    mensaje = ''
    try:
        montar_web.textos_tira(tira('galeria-no-existe'), 'es')
    except SystemExit as e:
        mensaje = str(e)
    assert 'galeria-no-existe' in mensaje and 'galeria.html' in mensaje, f'debía parar nombrando la foto y la galería; dice «{mensaje}»'


prueba('la web publicada no guarda nada en el navegador', web_tal_cual)
for palabra in GUARDAN:
    prueba(f'un script suelto en la raíz con {palabra}', script_de_mas(palabra, ''))
prueba('un script suelto en una subcarpeta', script_de_mas('localStorage', f'{uuid.uuid4().hex}/{uuid.uuid4().hex}'))
prueba('un ID de Discord en una clave de arriba de las fichas', id_en_las_fichas)
prueba('un apodo en una clave de arriba de las fichas', apodo_en_las_fichas)
prueba('las fichas reales, sin IDs', fichas_reales_limpias)
prueba('una mutación sin traducir al inglés', mutacion_en('mut_en', 'mut'))
prueba('una mutación solo en inglés', mutacion_en('mut', 'mut_en'))
prueba('sin la lista de mutaciones en inglés', sin_seccion_de_mutaciones)
prueba('la tira toma el texto de la foto de la galería', tira_con_foto_de_la_galeria)
prueba('la tira con una foto que no está en la galería', tira_con_foto_de_fuera)

print(f'{fallos} fallos' if fallos else 'Todo correcto')
sys.exit(1 if fallos else 0)
