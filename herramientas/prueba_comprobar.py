"""Prueba de lo que comprobar.py y los scripts de montar deben parar: un script de más que guarde algo en el navegador,
un ID o un apodo en fichas_dinos.json, mutaciones sin traducir y una foto de la tira que no está en la galería.

Uso: python herramientas/prueba_comprobar.py
"""
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
import uuid
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import comprobar  # noqa: E402
import guia_dinos  # noqa: E402
import logros_web  # noqa: E402
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


def script_de_mas(palabra, carpeta, nombre=None):
    """Un nombre y un sitio que no conoce nadie: si la revisión tira de una lista de ficheros, no lo ve."""
    def f():
        d = copia_web()
        try:
            nombre_real = nombre or f'{uuid.uuid4().hex}.js'
            sitio = d / carpeta / nombre_real
            sitio.parent.mkdir(parents=True, exist_ok=True)
            sitio.write_text(f'{palabra};\n', encoding='utf-8')
            mensajes = privacidad(d)
            assert any(nombre_real in m for m in mensajes), f'un script con {palabra} en {carpeta or "la raíz"} pasa: {mensajes}'
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


def caceria_con_fallos():
    """Con todo roto, la prueba de la cacería tiene que contar cada fallo y salir en rojo, no romperse al contarlo."""
    with tempfile.TemporaryDirectory() as d:
        rota = Path(d) / 'caceria.js'
        rota.write_text("const f = () => { throw new Error('a propósito'); };\n"
                        'module.exports = { proximaCaceria: f, restante: f, planCrecer: f, semana: f, enZona: f };\n', encoding='utf-8')
        r = subprocess.run(['node', str(Path(__file__).with_name('prueba_caceria.js')), str(rota)], capture_output=True, text=True, encoding='utf-8')
    lineas = r.stdout.splitlines() or ['']
    fallidas = sum(l.startswith('FALLO') for l in lineas)
    assert r.returncode == 1 and fallidas and lineas[-1] == f'{fallidas} fallos' and not r.stderr, \
        f'código {r.returncode}, {fallidas} FALLO, última línea «{lineas[-1]}», error «{r.stderr.strip()[:200]}»'


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


SERVICIO_FALSO = 'https://servicio-de-prueba.example.workers.dev'
VIGILADOS = (*comprobar.JEFES, APODO_FALSO)


def con_cuentas(cambiar, hacer):
    """Ejecuta hacer(web) con una copia de docs/ montada con el servicio de cuentas encendido (el aviso legal ya nombra a
    quién escribir) y vigilando a los tres jefes. Los ficheros de la copia son enlaces duros: se sustituyen, no se editan."""
    with tempfile.TemporaryDirectory() as d:
        d = Path(d)
        (d / 'cuentas.json').write_text(json.dumps({'servicio': SERVICIO_FALSO}), encoding='utf-8')
        (d / 'vigilar.txt').write_text('\n'.join(VIGILADOS) + '\n', encoding='utf-8')
        web = d / 'docs'
        shutil.copytree(DOCS, web, copy_function=os.link)
        reales = logros_web.CUENTAS, comprobar.VIGILAR
        logros_web.CUENTAS, comprobar.VIGILAR = d / 'cuentas.json', d / 'vigilar.txt'
        try:
            for nombre, texto in montar_web.montar(web).items():
                (web / nombre).unlink(missing_ok=True)
                (web / nombre).write_bytes(texto.encode('utf-8'))
            cambiar(web)
            return hacer(web)
        finally:
            logros_web.CUENTAS, comprobar.VIGILAR = reales


def cambiando_legal(antes, despues):
    def cambiar(web):
        for lang in montar_web.LANGS:
            fichero = web / montar_web.RUTA['legal', lang] / 'index.html'
            texto = fichero.read_text(encoding='utf-8')
            nuevo = texto.replace(*(antes[lang], despues[lang]))
            assert nuevo != texto, f'{fichero}: no dice «{antes[lang]}»'
            fichero.unlink()
            fichero.write_text(nuevo, encoding='utf-8')
    return cambiar


def mensajes_de_legal(cambiar):
    return con_cuentas(cambiar, lambda web: [m for m in comprobar.main(web, avisa=lambda _: None) if m.startswith(tuple(montar_web.RUTA['legal', l] for l in montar_web.LANGS))])


def jefes_en_el_aviso_legal():
    mensajes = mensajes_de_legal(lambda web: None)
    assert not mensajes, f'el aviso legal con cuentas no pasa: {mensajes}'


def un_nombre_mas_en_el_aviso_legal():
    sitios = {'es': 'Imaginary, Quilez o Ray', 'en': 'Imaginary, Quilez or Ray'}
    con_uno_mas = {'es': f'Imaginary, Quilez, Ray o {APODO_FALSO}', 'en': f'Imaginary, Quilez, Ray or {APODO_FALSO}'}
    mensajes = mensajes_de_legal(cambiando_legal(sitios, con_uno_mas))
    assert sum(APODO_FALSO in m for m in mensajes) >= 2, f'un cuarto nombre pasa en alguna de las dos páginas: {mensajes}'


def los_jefes_en_otro_sitio_del_aviso_legal():
    sitios = {'es': 'Menores.</b>', 'en': 'Minors.</b>'}
    con_jefe = {'es': 'Menores.</b> Quilez', 'en': 'Minors.</b> Quilez'}
    mensajes = mensajes_de_legal(cambiando_legal(sitios, con_jefe))
    assert sum('Quilez' in m for m in mensajes) >= 2, f'un jefe suelto en otro párrafo pasa en alguna de las dos páginas: {mensajes}'


def la_frase_de_los_jefes_dos_veces():
    sitios = {'es': 'Menores.</b>', 'en': 'Minors.</b>'}
    repetida = {'es': 'Menores.</b> Escribe a Imaginary, Quilez o Ray.', 'en': 'Minors.</b> Write to Imaginary, Quilez or Ray.'}
    mensajes = mensajes_de_legal(cambiando_legal(sitios, repetida))
    assert sum('sale 2 veces' in m for m in mensajes) == 2, f'repetir la frase de los jefes pasa en alguna de las dos páginas: {mensajes}'


CABECERAS = ('X-Content-Type-Options: nosniff', 'X-Frame-Options: DENY', "Content-Security-Policy: frame-ancestors 'none'",
             'Strict-Transport-Security: max-age=31536000', 'Referrer-Policy: strict-origin-when-cross-origin')


def mensajes_de_cabeceras(nuevas):
    """Ejecuta comprobar.main sobre una copia de docs/ cuyo _headers lo decide nuevas(texto): None lo borra, un texto lo
    sustituye. Los ficheros de la copia son enlaces duros: se sustituyen, no se editan."""
    with tempfile.TemporaryDirectory() as d:
        web = Path(d) / 'docs'
        shutil.copytree(DOCS, web, copy_function=os.link)
        fichero = web / '_headers'
        texto = fichero.read_text(encoding='utf-8')
        fichero.unlink()
        resultado = nuevas(texto)
        if resultado is not None:
            fichero.write_text(resultado, encoding='utf-8')
        return [m for m in comprobar.main(web, sin_apodos=True, avisa=lambda _: None) if '_headers' in m]


def sin_la_linea(texto, linea):
    lineas = texto.splitlines()
    assert lineas.count(f'  {linea}') == 1, f'docs/_headers ya no lleva «{linea}» una sola vez'
    lineas.remove(f'  {linea}')
    return '\n'.join(lineas) + '\n'


def cabeceras_reales_pasan():
    mensajes = mensajes_de_cabeceras(lambda texto: texto)
    assert not mensajes, mensajes


def sin_el_fichero_de_cabeceras():
    mensajes = mensajes_de_cabeceras(lambda texto: None)
    assert mensajes, 'sin docs/_headers pasa'


def sin_una_cabecera(linea):
    def f():
        mensajes = mensajes_de_cabeceras(lambda texto: sin_la_linea(texto, linea))
        assert any(linea.split(':')[0] in m for m in mensajes), f'sin «{linea}» pasa: {mensajes}'
    return f


def cabecera_en_otro_bloque(linea):
    def f():
        mensajes = mensajes_de_cabeceras(lambda texto: sin_la_linea(texto, linea).rstrip('\n') + f'\n/otra/*\n  {linea}\n')
        assert any(linea.split(':')[0] in m for m in mensajes), f'«{linea}» solo en /otra/* pasa: {mensajes}'
    return f


def cabecera_con_otro_valor(nombre, antes, despues):
    def f():
        mensajes = mensajes_de_cabeceras(lambda texto: texto.replace(antes, despues, 1))
        assert any(nombre in m for m in mensajes), f'«{despues}» en vez de «{antes}» pasa: {mensajes}'
    return f


def cabecera_quitada_por_otro_bloque():
    mensajes = mensajes_de_cabeceras(lambda texto: texto.rstrip('\n') + '\n/ruta/*\n  ! X-Frame-Options\n')
    assert any('X-Frame-Options' in m for m in mensajes), f'quitar X-Frame-Options en /ruta/* pasa: {mensajes}'


def script_sin_cache_larga():
    bloque = '/ruta.js\n  Cache-Control: public, max-age=31536000, immutable\n'
    def quitar(texto):
        assert texto.count(bloque) == 1, 'docs/_headers ya no lleva el bloque de /ruta.js una sola vez'
        return texto.replace(bloque, '')
    mensajes = mensajes_de_cabeceras(quitar)
    assert any('/ruta.js' in m for m in mensajes), f'sin caché larga en /ruta.js pasa: {mensajes}'


def fotos_inmutables():
    antes = '/img/*\n  Cache-Control: public, max-age=86400\n'
    def cambiar(texto):
        assert texto.count(antes) == 1, 'docs/_headers ya no lleva el bloque de /img/* una sola vez'
        return texto.replace(antes, '/img/*\n  Cache-Control: public, max-age=31536000, immutable\n')
    mensajes = mensajes_de_cabeceras(cambiar)
    assert any('/img/*' in m for m in mensajes), f'fotos sin huella con caché inmutable pasa: {mensajes}'


def script_sin_huella():
    """Con la caché de un año, un script cargado sin ?v= se quedaría viejo en el navegador para siempre."""
    with tempfile.TemporaryDirectory() as d:
        web = Path(d) / 'docs'
        shutil.copytree(DOCS, web, copy_function=os.link)
        pagina = web / 'index.html'
        texto = pagina.read_text(encoding='utf-8')
        nuevo, n = re.subn(r'efectos\.js\?v=[0-9a-f]+', 'efectos.js', texto)
        assert n == 1, f'docs/index.html carga efectos.js con huella {n} veces, no 1'
        pagina.unlink()
        pagina.write_text(nuevo, encoding='utf-8')
        mensajes = comprobar.main(web, sin_apodos=True, avisa=lambda _: None)
    assert any('efectos.js' in m and '?v=' in m for m in mensajes), f'efectos.js sin ?v= pasa: {mensajes}'


def script_nuevo_sin_versionar():
    with tempfile.TemporaryDirectory() as d:
        web = Path(d) / 'docs'
        shutil.copytree(DOCS, web, copy_function=os.link)
        (web / 'nuevo.js').write_text('', encoding='utf-8')
        mensajes = comprobar.main(web, sin_apodos=True, avisa=lambda _: None)
    assert any(m.startswith('nuevo.js') and 'VERSIONADOS' in m for m in mensajes), f'un script sin versionar pasa: {mensajes}'


MIEMBRO_FALSO = 'MiembroDePrueba1'


def perfiles_de(manada):
    """Un perfiles.json con la estructura del real: la jefatura (los tres jefes) y la manada (los miembros)."""
    return {'jefatura': [{'nombre': n, 'url': 'https://ejemplo.invalid/'} for n in comprobar.JEFES],
            'manada': [{'nombre': n, 'url': 'https://ejemplo.invalid/'} for n in manada]}


def con_repositorio(ficheros, sin_versionar=None, perfiles=perfiles_de((MIEMBRO_FALSO,))):
    """Ejecuta comprobar.main sobre docs/ real, pero con un repositorio de mentira (ficheros versionados y, aparte,
    sin_versionar) y un perfiles.json de mentira (un dict, un texto tal cual o None para que no exista). Vigila APODO_FALSO
    y a los tres jefes desde la lista local, como la real. Devuelve (fallos, avisos)."""
    with tempfile.TemporaryDirectory() as d:
        d = Path(d)
        repo = d / 'repo'
        for ruta, contenido in {**ficheros, **(sin_versionar or {})}.items():
            (repo / ruta).parent.mkdir(parents=True, exist_ok=True)
            (repo / ruta).write_bytes(contenido if isinstance(contenido, bytes) else contenido.encode('utf-8'))
        subprocess.run(['git', 'init', '-q'], cwd=repo, check=True)
        subprocess.run(['git', '-c', 'core.autocrlf=false', 'add', '--', *ficheros], cwd=repo, check=True)
        (d / 'vigilar.txt').write_text('\n'.join((APODO_FALSO, *comprobar.JEFES)) + '\n', encoding='utf-8')
        if perfiles is not None:
            (d / 'perfiles.json').write_text(perfiles if isinstance(perfiles, str) else json.dumps(perfiles), encoding='utf-8')
        reales = comprobar.VIGILAR, comprobar.PERFILES_ORIGINAL, comprobar.PROYECTO
        comprobar.VIGILAR, comprobar.PERFILES_ORIGINAL, comprobar.PROYECTO = d / 'vigilar.txt', d / 'perfiles.json', repo
        avisos = []
        try:
            return comprobar.main(DOCS, avisa=avisos.append), avisos
        finally:
            comprobar.VIGILAR, comprobar.PERFILES_ORIGINAL, comprobar.PROYECTO = reales


def mensajes_de_ids(mensajes):
    return [m for m in mensajes if '100000000000000001' in m]


def ficheros_con_fallo_de_apodos(mensajes):
    return {m.split(':')[0] for m in mensajes if 'dato de miembro' in m}


def miembro_de_perfiles_en_paginas():
    mensajes, _ = con_repositorio({'paginas/es/prueba.html': f'<p>Lo dijo {MIEMBRO_FALSO}.</p>\n'})
    assert ficheros_con_fallo_de_apodos(mensajes) == {'paginas/es/prueba.html'}, f'un miembro de perfiles.json en paginas/ pasa: {mensajes}'


def apodo_de_la_lista_en_servicio():
    mensajes, _ = con_repositorio({'servicio/src/prueba.js': f'// {APODO_FALSO}\n'})
    assert ficheros_con_fallo_de_apodos(mensajes) == {'servicio/src/prueba.js'}, f'un apodo de la lista en servicio/ pasa: {mensajes}'


def apodo_en_la_raiz_y_en_herramientas():
    mensajes, _ = con_repositorio({'README.md': f'{MIEMBRO_FALSO}\n', 'herramientas/prueba.py': f'# {APODO_FALSO}\n'})
    assert ficheros_con_fallo_de_apodos(mensajes) == {'README.md', 'herramientas/prueba.py'}, mensajes


def jefes_cortos_y_palabras_parecidas_no_fallan():
    texto = f'Imaginary, Quilez y Ray. Al lado, ★★★. {MIEMBRO_FALSO}0 no es {MIEMBRO_FALSO[:-1]}.\n'
    mensajes, _ = con_repositorio({'paginas/es/prueba.html': texto, 'servicio/src/prueba.js': '// Imaginary, Quilez, Ray\n'}, perfiles=perfiles_de((MIEMBRO_FALSO, 'Al', '★★★', *comprobar.JEFES)))
    assert not ficheros_con_fallo_de_apodos(mensajes), mensajes


def id_de_prueba_fuera_de_la_web():
    mensajes, _ = con_repositorio({'servicio/pruebas/banco.mjs': "const id = '100000000000000001';\n"})
    assert not mensajes_de_ids(mensajes), mensajes


def id_en_la_web_sigue_fallando():
    with tempfile.TemporaryDirectory() as d:
        web = Path(d) / 'docs'
        shutil.copytree(DOCS, web, copy_function=os.link)
        robots = web / 'robots.txt'
        texto = robots.read_text(encoding='utf-8')
        robots.unlink()
        robots.write_text(texto + '\n# 100000000000000001\n', encoding='utf-8')
        mensajes = comprobar.main(web, sin_apodos=True, avisa=lambda _: None)
    assert any(m.startswith('robots.txt:') and '100000000000000001' in m for m in mensajes), mensajes


def cuenta_de_nombres_vigilados_e_ignorados():
    _, avisos = con_repositorio({'README.md': 'nada\n'}, perfiles=perfiles_de((MIEMBRO_FALSO, 'Al', '★★★', *comprobar.JEFES)))
    cuenta = [a for a in avisos if 'perfiles.json' in a]
    assert len(cuenta) == 1 and 'vigilados: 1' in cuenta[0] and cuenta[0].endswith('solo símbolos: 2'), f'avisos: {avisos}'


def binarios_y_sin_versionar_no_se_miran():
    mensajes, _ = con_repositorio(
        {'paginas/es/prueba.html': MIEMBRO_FALSO, 'paginas/prueba.png': b'\x89PNG\0\0 ' + MIEMBRO_FALSO.encode()},
        sin_versionar={'herramientas/vigilar.local.txt': f'{APODO_FALSO}\n{MIEMBRO_FALSO}\n', 'herramientas/otro.txt': MIEMBRO_FALSO})
    assert ficheros_con_fallo_de_apodos(mensajes) == {'paginas/es/prueba.html'}, mensajes


def sin_perfiles_avisa_de_que_la_lista_es_la_del_secreto():
    mensajes, avisos = con_repositorio({'README.md': 'nada\n'}, perfiles=None)
    assert not ficheros_con_fallo_de_apodos(mensajes), mensajes
    assert any(a.startswith('sin perfiles.json') for a in avisos), f'avisos: {avisos}'


def perfiles_ilegible_falla():
    mensajes, _ = con_repositorio({'README.md': 'nada\n'}, perfiles='{"manada": 3}')
    assert any('perfiles.json' in m for m in mensajes), f'un perfiles.json sin lista de la manada pasa: {mensajes}'


prueba('la web publicada no guarda nada en el navegador', web_tal_cual)
prueba('el aviso legal con cuentas nombra a los tres jefes y pasa', jefes_en_el_aviso_legal)
prueba('un cuarto nombre en el aviso legal falla', un_nombre_mas_en_el_aviso_legal)
prueba('los jefes en otro párrafo del aviso legal fallan', los_jefes_en_otro_sitio_del_aviso_legal)
prueba('la frase de los jefes repetida en el aviso legal falla', la_frase_de_los_jefes_dos_veces)
for palabra in GUARDAN:
    prueba(f'un script suelto en la raíz con {palabra}', script_de_mas(palabra, ''))
prueba('un script suelto en una subcarpeta', script_de_mas('localStorage', f'{uuid.uuid4().hex}/{uuid.uuid4().hex}'))
prueba('la excepción de ruta.js no vale para otra carpeta', script_de_mas('localStorage', uuid.uuid4().hex, 'ruta.js'))
prueba('la excepción de ruta.js no vale para otra forma de guardar', script_de_mas('sessionStorage', '', 'ruta.js'))
prueba('un ID de Discord en una clave de arriba de las fichas', id_en_las_fichas)
prueba('un apodo en una clave de arriba de las fichas', apodo_en_las_fichas)
prueba('las fichas reales, sin IDs', fichas_reales_limpias)
prueba('una mutación sin traducir al inglés', mutacion_en('mut_en', 'mut'))
prueba('una mutación solo en inglés', mutacion_en('mut', 'mut_en'))
prueba('sin la lista de mutaciones en inglés', sin_seccion_de_mutaciones)
prueba('la tira toma el texto de la foto de la galería', tira_con_foto_de_la_galeria)
prueba('la tira con una foto que no está en la galería', tira_con_foto_de_fuera)
prueba('la prueba de la cacería cuenta sus fallos y sale en rojo', caceria_con_fallos)
prueba('docs/_headers real: lleva las tres cabeceras en /*', cabeceras_reales_pasan)
prueba('sin docs/_headers', sin_el_fichero_de_cabeceras)
for linea in CABECERAS:
    prueba(f'docs/_headers sin «{linea.split(":")[0]}»', sin_una_cabecera(linea))
    prueba(f'docs/_headers con «{linea.split(":")[0]}» solo en otro bloque', cabecera_en_otro_bloque(linea))
prueba('docs/_headers con frame-ancestors distinto de none', cabecera_con_otro_valor('frame-ancestors', "frame-ancestors 'none'", "frame-ancestors 'self'"))
prueba('docs/_headers con X-Frame-Options distinto de DENY', cabecera_con_otro_valor('X-Frame-Options', 'X-Frame-Options: DENY', 'X-Frame-Options: SAMEORIGIN'))
prueba('docs/_headers con X-Frame-Options quitada por otro bloque', cabecera_quitada_por_otro_bloque)
prueba('docs/_headers sin caché larga para un script', script_sin_cache_larga)
prueba('docs/_headers con las fotos inmutables', fotos_inmutables)
prueba('un script cargado sin ?v= con caché larga', script_sin_huella)
prueba('un script nuevo en la raíz sin versionar', script_nuevo_sin_versionar)
prueba('un miembro de perfiles.json en paginas/ falla', miembro_de_perfiles_en_paginas)
prueba('un apodo de la lista local en servicio/ falla', apodo_de_la_lista_en_servicio)
prueba('un apodo en la raíz y en herramientas/ falla', apodo_en_la_raiz_y_en_herramientas)
prueba('los tres jefes, un nombre corto, un símbolo y una palabra parecida no fallan', jefes_cortos_y_palabras_parecidas_no_fallan)
prueba('un ID de prueba fuera de la web no falla', id_de_prueba_fuera_de_la_web)
prueba('un ID en la web sigue fallando', id_en_la_web_sigue_fallando)
prueba('cuenta cuántos nombres de perfiles.json vigila y cuántos ignora', cuenta_de_nombres_vigilados_e_ignorados)
prueba('los binarios y lo que no está versionado no se miran', binarios_y_sin_versionar_no_se_miran)
prueba('sin perfiles.json avisa de que la lista es solo la del secreto', sin_perfiles_avisa_de_que_la_lista_es_la_del_secreto)
prueba('un perfiles.json sin lista de la manada falla', perfiles_ilegible_falla)

print(f'{fallos} fallos' if fallos else 'Todo correcto')
sys.exit(1 if fallos else 0)
