"""Prueba de publicar_datos.py con git de verdad, sobre un repositorio de mentira: qué sube, qué se niega a subir y que no
deja nada a medias. El montaje y la comprobación son dos scripts diminutos dentro de ese repositorio; la red no se toca.

Uso: python herramientas/prueba_publicar.py
"""
import json
import os
import shutil
import stat
import subprocess
import sys
import tempfile
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import batallas_web  # noqa: E402
import cifras  # noqa: E402
import publicar_datos as P  # noqa: E402

sys.stdout.reconfigure(encoding='utf-8')

BUENAS = {'bajas': 587, 'horas': 1608.4, 'misiones': 2047, 'jugadores': 9, 'fecha': '2026-11-02',
          'especies': [{'name': 'Tyrannosaurus', 'kills': 140}]}
BATALLAS = {'batallas': [{'clave': 'smoke-1', 'rival': 'Smoke', 'nosotros': 3, 'ellos': 6, 'resultado': 'victoria'}]}
MONTAR = """import os, pathlib, sys
aqui = pathlib.Path('herramientas')
(aqui / 'cifras.json').write_bytes(pathlib.Path(os.environ['GARRA_CIFRAS']).read_bytes())
(aqui / 'batallas.json').write_bytes(pathlib.Path(os.environ['GARRA_BATALLAS']).read_bytes())
pathlib.Path('docs/index.html').write_bytes((aqui / 'cifras.json').read_bytes())
if pathlib.Path('herramientas/ensuciar').exists():
    pathlib.Path('docs/otra.html').write_text('cambio ajeno')
"""
COMPROBAR = """import os, pathlib, sys
if os.environ.get('VIGILAR_APODOS', '').strip() != 'Fulano':
    print('FALLO: sin apodos'); sys.exit(1)
if os.environ.get('GITHUB_ACTIONS') != 'true':
    print('FALLO: un texto sin copiar pararía las cifras de esta noche'); sys.exit(1)
if pathlib.Path(os.environ.get('GARRA_TARJETAS', 'tarjetas.json')).exists() or 'GARRA_TARJETAS' not in os.environ:
    print('FALLO: compara con el Discord'); sys.exit(1)
if pathlib.Path('herramientas/chivar').exists():
    print('FALLO: docs/index.html lleva el apodo de un miembro (fulano), de Fulano'); sys.exit(1)
if pathlib.Path('herramientas/romper').exists():
    print('FALLO: docs/index.html está mal'); sys.exit(1)
print('Todo correcto')
"""
fallos = 0


def borrar(carpeta):
    # git deja sus objetos en solo lectura, y en Windows eso impide borrarlos.
    def forzar(borra, ruta, _):
        os.chmod(ruta, stat.S_IWRITE)
        borra(ruta)
    shutil.rmtree(carpeta, onerror=forzar)


def cmd(*a, cwd):
    return subprocess.run(a, cwd=cwd, capture_output=True, text=True, encoding='utf-8', check=True).stdout.strip()


class Mundo:
    """un origin, una carpeta de trabajo y los dos originales del Discord"""
    def __init__(self, base, extra=()):
        base = Path(base)
        self.origin, self.repo = base / 'origin.git', base / 'repo'
        cmd('git', 'init', '--quiet', '--bare', '--initial-branch=main', str(self.origin), cwd=base)
        cmd('git', 'clone', '--quiet', str(self.origin), str(self.repo), cwd=base)
        h = self.repo / 'herramientas'
        h.mkdir()
        (self.repo / 'docs').mkdir()
        (self.repo / '.gitattributes').write_text('herramientas/cifras.json -text\nherramientas/batallas.json -text\n')
        (h / 'montar_web.py').write_text(MONTAR, encoding='utf-8')
        (h / 'comprobar.py').write_text(COMPROBAR, encoding='utf-8')
        self.datos(h / 'cifras.json', BUENAS)
        self.datos(h / 'batallas.json', BATALLAS)
        (self.repo / 'docs' / 'index.html').write_bytes((h / 'cifras.json').read_bytes())
        (self.repo / '.gitignore').write_text('*.local.txt\n')
        for nombre in extra:
            (h / nombre).write_text('x')
        self.commit('inicio')
        cmd('git', 'push', '--quiet', 'origin', 'HEAD:refs/heads/main', cwd=self.repo)
        (h / 'vigilar.local.txt').write_text('Fulano\n')
        self.discord = base / 'discord'
        self.discord.mkdir()
        self.cifras, self.batallas = self.discord / 'cifras.json', self.discord / 'batallas.json'
        self.datos(self.cifras, BUENAS)
        self.datos(self.batallas, BATALLAS)
        P.REPO, P.APODOS = self.repo, h / 'vigilar.local.txt'
        # Una prueba nunca puede llegar a la web de verdad: git solo habla con este origin.
        assert cmd('git', 'remote', 'get-url', 'origin', cwd=P.REPO) == str(self.origin), 'no es el repositorio de mentira'
        assert P.git('remote', 'get-url', 'origin').stdout.decode().strip() == str(self.origin), 'publicar_datos mira otro repositorio'
        cifras.ORIGINAL, batallas_web.ORIGINAL = self.cifras, self.batallas

    def datos(self, ruta, valor):
        ruta.write_text(json.dumps(valor), encoding='utf-8')

    def commit(self, texto):
        cmd('git', 'add', '-A', cwd=self.repo)
        cmd('git', '-c', 'user.name=x', '-c', 'user.email=x@x', 'commit', '--quiet', '-m', texto, cwd=self.repo)

    def en_origin(self):
        return cmd('git', '--git-dir', str(self.origin), 'rev-parse', 'main', cwd=self.repo)

    def subido(self, nombre):
        return cmd('git', '--git-dir', str(self.origin), 'show', f'main:{nombre}', cwd=self.repo)

    def limpio(self):
        assert len(cmd('git', 'worktree', 'list', cwd=self.repo).splitlines()) == 1, 'queda una copia temporal'
        assert cmd('git', 'status', '--porcelain', cwd=self.repo) == '', 'ha ensuciado la carpeta de trabajo'


def se_niega(m, palabra):
    antes = m.en_origin()
    try:
        P.publicar()
    except P.NoPublico as e:
        assert palabra in str(e), f'dice «{e}» y esperaba «{palabra}»'
    else:
        raise AssertionError('ha publicado')
    assert m.en_origin() == antes, 'ha subido algo'
    m.limpio()


def prueba(nombre, comprobar, extra=()):
    global fallos
    base = tempfile.mkdtemp(prefix='garra-prueba-')
    try:
        comprobar(Mundo(base, extra))
        print('ok   ', nombre)
    except (AssertionError, P.NoPublico) as e:
        fallos += 1
        print('FALLO', nombre, '→', e)
    finally:
        borrar(base)


def nuevas(m, **cambios):
    m.datos(m.cifras, {**BUENAS, 'fecha': '2026-11-03', **cambios})


def al_dia(m):
    antes = m.en_origin()
    P.publicar()
    assert m.en_origin() == antes
    m.limpio()


def sube(m):
    nuevas(m, bajas=600)
    P.publicar()
    assert json.loads(m.subido('herramientas/cifras.json'))['bajas'] == 600
    assert json.loads(m.subido('docs/index.html'))['bajas'] == 600
    assert 'cifras del 2026-11-03' in cmd('git', '--git-dir', str(m.origin), 'log', '-1', '--format=%s', 'main', cwd=m.repo)
    assert 'Co-Authored-By' in cmd('git', '--git-dir', str(m.origin), 'log', '-1', '--format=%b', 'main', cwd=m.repo)
    m.limpio()
    al_dia_otra = m.en_origin()
    P.publicar()
    assert m.en_origin() == al_dia_otra, 'publica dos veces lo mismo'


def batallas_nuevas(m):
    m.datos(m.batallas, {'batallas': BATALLAS['batallas'] + [{'clave': 'x-1', 'rival': 'X', 'nosotros': 4, 'ellos': 5, 'resultado': 'derrota'}]})
    P.publicar()
    assert 'x-1' in m.subido('herramientas/batallas.json')
    m.limpio()


def vista(m):
    nuevas(m, bajas=600)
    antes = m.en_origin()
    P.publicar(vista=True)
    assert m.en_origin() == antes
    m.limpio()


def sin_original(m):
    m.cifras.unlink()
    m.batallas.unlink()
    al_dia(m)


def carpeta_de_trabajo_sucia(m):
    (m.repo / 'docs' / 'index.html').write_text('a medias, de otra sesión', encoding='utf-8')
    nuevas(m, bajas=600)
    P.publicar()
    assert (m.repo / 'docs' / 'index.html').read_text(encoding='utf-8') == 'a medias, de otra sesión'
    assert json.loads(m.subido('docs/index.html'))['bajas'] == 600
    assert len(cmd('git', 'worktree', 'list', cwd=m.repo).splitlines()) == 1


def push_rechazado(m):
    gancho = m.origin / 'hooks' / 'pre-receive'
    gancho.write_text('#!/bin/sh\nexit 1\n')
    gancho.chmod(0o755)
    nuevas(m, bajas=600)
    se_niega(m, 'push')


def apodo_en_el_error(m):
    nuevas(m, bajas=600)
    try:
        P.publicar()
    except P.NoPublico as e:
        assert 'fulano' not in str(e).lower(), f'el error enseña el apodo: {e}'
        assert 'docs/index.html' in str(e), f'no dice dónde: {e}'
    else:
        raise AssertionError('ha publicado')


def otro_subio_antes(m):
    otro = m.repo.parent / 'otro'
    cmd('git', 'clone', '--quiet', str(m.origin), str(otro), cwd=m.repo.parent)
    (otro / 'docs' / 'guia.html').write_text('de otra persona', encoding='utf-8')
    cmd('git', 'add', '-A', cwd=otro)
    cmd('git', '-c', 'user.name=x', '-c', 'user.email=x@x', 'commit', '--quiet', '-m', 'otra', cwd=otro)
    cmd('git', 'push', '--quiet', 'origin', 'HEAD:refs/heads/main', cwd=otro)
    nuevas(m, bajas=600)
    P.publicar()
    assert m.subido('docs/guia.html') == 'de otra persona', 'se ha basado en lo viejo'
    assert json.loads(m.subido('herramientas/cifras.json'))['bajas'] == 600


def copias_huerfanas(m):
    temporal = Path(tempfile.gettempdir())
    vieja, reciente = Path(tempfile.mkdtemp(prefix='garra-datos-')), Path(tempfile.mkdtemp(prefix='garra-datos-'))
    ajena = Path(tempfile.mkdtemp(prefix='garra-prueba-ajena-'))
    try:
        hace = time.time() - 2 * 86400
        os.utime(vieja, (hace, hace))
        os.utime(ajena, (hace, hace))
        assert vieja.parent == temporal
        P.publicar()
        assert not vieja.exists(), 'la copia de una tarea que murió se queda para siempre'
        assert reciente.exists(), 'ha borrado una copia que puede estar en uso'
        assert ajena.exists(), 'ha borrado algo que no es suyo'
    finally:
        for carpeta in (vieja, reciente, ajena):
            if carpeta.exists():
                borrar(carpeta)


prueba('sin nada nuevo no publica ni crea copias', al_dia)
prueba('cifras nuevas: suben datos y portada, una vez', sube)
prueba('batallas nuevas también suben', batallas_nuevas)
prueba('la vista no sube nada', vista)
prueba('sin originales no hace nada', sin_original)
prueba('no toca la carpeta de trabajo aunque esté a medias', carpeta_de_trabajo_sucia)
prueba('caída fuerte de las bajas: datos a medias', lambda m: (nuevas(m, bajas=100), se_niega(m, 'bajas')))
prueba('caída fuerte de los jugadores', lambda m: (nuevas(m, jugadores=2), se_niega(m, 'jugadores')))
prueba('una baja pequeña sí vale (alguien se va)', lambda m: (nuevas(m, bajas=500), P.publicar(), m.limpio()))
prueba('subida disparatada de las bajas', lambda m: (nuevas(m, bajas=58700), se_niega(m, 'bajas')))
prueba('una subida normal sí vale', lambda m: (nuevas(m, bajas=700), P.publicar(), m.limpio()))
prueba('cifras más viejas que las de la web', lambda m: (nuevas(m, fecha='2026-10-01'), se_niega(m, '2026-10-01')))
prueba('un campo de más (un apodo) en las cifras', lambda m: (nuevas(m, apodo='Fulano'), se_niega(m, 'apodo')))
prueba('un fichero roto', lambda m: (m.cifras.write_text('<html>'), se_niega(m, 'no se puede leer')))
prueba('batallas mal escritas', lambda m: (m.datos(m.batallas, {'batallas': [{'clave': 'x'}]}), se_niega(m, 'rival')))
prueba('comprobar.py en rojo no sube', lambda m: (nuevas(m, bajas=600), se_niega(m, 'docs/index.html está mal')), extra=['romper'])
prueba('si al montar cambia algo ajeno no lo arrastra', lambda m: (nuevas(m, bajas=600), se_niega(m, 'otra.html')), extra=['ensuciar'])
prueba('sin la lista de apodos no sube', lambda m: (nuevas(m, bajas=600), P.APODOS.unlink(), se_niega(m, 'vigilar')))
prueba('la lista de apodos vacía tampoco', lambda m: (nuevas(m, bajas=600), P.APODOS.write_text('\n'), se_niega(m, 'vigilar')))
prueba('GitHub rechaza la subida: lo dice y no deja nada', push_rechazado)
prueba('el error nunca enseña un apodo', apodo_en_el_error, extra=['chivar'])
prueba('si otro subió antes, se basa en lo último', otro_subio_antes)
prueba('la copia de una tarea que murió se limpia sola', copias_huerfanas)

print(f'{fallos} fallos' if fallos else 'Todo correcto')
sys.exit(1 if fallos else 0)
