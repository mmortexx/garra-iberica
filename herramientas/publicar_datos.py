"""Lleva a la web pública las cifras y las batallas del proyecto del Discord, sin montar nada a mano.

La tarea nocturna del ranking lo ejecuta al acabar: este PC ya tiene permiso para subir a los dos repositorios, así que no
hace falta guardar ninguna credencial nueva en GitHub. Trabaja en una copia temporal de lo último de GitHub, nunca en la
carpeta de trabajo, y solo sube si:
- las cifras y las batallas pasan su validación y las cifras no retroceden de forma sospechosa (Nexus puede dar datos a medias).
  Cada dato se revisa por su cuenta: el que no pasa se queda fuera y dice por qué, sin frenar al otro;
- al montar la web cambian solo los ficheros de esos datos (si cambia algo más, es trabajo de otra persona: no se arrastra);
- comprobar.py da «Todo correcto», también con los apodos de herramientas/vigilar.local.txt.
GitHub vuelve a comprobarlo todo al recibirlo, y el vigilante del Discord avisa en #mando si la portada no coincide o esas
comprobaciones salen en rojo. No compara los textos con el Discord (lo hace el vigilante): un texto sin copiar no debe parar
las cifras de esta noche.

Uso: python herramientas/publicar_datos.py          publica si hay algo nuevo
     python herramientas/publicar_datos.py --vista  hace todo menos el commit y la subida
Sale con error, y diciendo por qué, si no ha podido o no ha debido publicar algo, aunque haya publicado lo demás.
"""
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
import time
from pathlib import Path

HERRAMIENTAS = Path(__file__).resolve().parent
sys.path.insert(0, str(HERRAMIENTAS))
import batallas_web  # noqa: E402
import cifras  # noqa: E402

REPO = HERRAMIENTAS.parent
RAMA = 'main'
APODOS = HERRAMIENTAS / 'vigilar.local.txt'
# Lo único que montar_web.py puede cambiar por unas cifras o unas batallas nuevas.
PERMITIDOS = re.compile(r'herramientas/(cifras|batallas)\.json|docs/(en/)?(clan/)?index\.html')
# Una baja mayor de esto no es gente que se va, sino datos a medias.
CAIDA_MAXIMA = 0.2
# Y una subida así tampoco es gente que llega, sino un dato equivocado.
SUBIDA_MAXIMA = 3
HUERFANA = 86400
AUTOR = ['-c', 'user.name=mmortexx', '-c', 'user.email=261957469+mmortexx@users.noreply.github.com']
FIRMA = 'Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>'


class NoPublico(Exception):
    pass


def git(*args, cwd=None, comprobar=True):
    r = subprocess.run(['git', *args], cwd=cwd or REPO, capture_output=True)
    if comprobar and r.returncode:
        raise NoPublico(f'git {args[0]} ha fallado: {r.stderr.decode("utf-8", "replace").strip()[:300]}')
    return r


def en_github(nombre):
    r = git('show', f'origin/{RAMA}:herramientas/{nombre}', comprobar=False)
    return r.stdout if r.returncode == 0 else None


def sospecha(antes, ahora):
    """Por qué no fiarse de las cifras nuevas, o None."""
    if ahora['fecha'] < antes['fecha']:
        return f'son del {ahora["fecha"]} y la web ya tiene las del {antes["fecha"]}'
    for k in ('bajas', 'horas', 'misiones', 'jugadores'):
        if ahora[k] < antes[k] * (1 - CAIDA_MAXIMA):
            return f'«{k}» baja de {antes[k]} a {ahora[k]}: parecen datos a medias'
        if ahora[k] > antes[k] * SUBIDA_MAXIMA + 100:
            return f'«{k}» sube de {antes[k]} a {ahora[k]}: parece un dato equivocado'
    return None


def leer_batallas(ruta):
    try:
        batallas_web.cargar(ruta)
    except SystemExit as e:
        raise NoPublico(str(e)) from None


def cifras_nuevas():
    """True si difieren de las de GitHub y son de fiar; NoPublico si no lo son."""
    if not cifras.ORIGINAL.is_file():
        return False
    crudo = cifras.ORIGINAL.read_bytes()
    try:
        ahora = cifras.leer(crudo, str(cifras.ORIGINAL))
        viejo = en_github('cifras.json')
        antes = cifras.leer(viejo, 'cifras.json de GitHub') if viejo else None
    except SystemExit as e:
        raise NoPublico(str(e)) from None
    if crudo == viejo:
        return False
    motivo = sospecha(antes, ahora) if antes else None
    if motivo:
        raise NoPublico(f'las cifras {motivo}')
    return True


def batallas_nuevas():
    """True si difieren de las de GitHub y están bien escritas; NoPublico si no lo están."""
    if not batallas_web.ORIGINAL.is_file() or batallas_web.ORIGINAL.read_bytes() == en_github('batallas.json'):
        return False
    leer_batallas(batallas_web.ORIGINAL)
    return True


def novedades():
    """Los datos que hay que subir y, aparte, los que se quedan fuera con su motivo: {nombre: motivo}."""
    nuevos, retenidos = [], {}
    for nombre, revisar in (('cifras', cifras_nuevas), ('batallas', batallas_nuevas)):
        try:
            if revisar():
                nuevos.append(nombre)
        except NoPublico as e:
            retenidos[nombre] = str(e)
    return nuevos, retenidos


def entorno(retenidos=()):
    """Igual que en GitHub, sin el resto del proyecto del Discord: solo cuentan los dos originales que se publican.
    Sin original, montar_web.py deja la copia que ya hay: así un dato retenido no llega a la web."""
    if not APODOS.is_file() or not APODOS.read_text(encoding='utf-8').strip():
        raise NoPublico(f'falta {APODOS.name}: sin buscar apodos no se publica en una web pública')
    nada = str(REPO / 'no-existe')
    return {**os.environ, 'GITHUB_ACTIONS': 'true', 'PYTHONIOENCODING': 'utf-8', 'PYTHONDONTWRITEBYTECODE': '1',
            'GARRA_CIFRAS': nada if 'cifras' in retenidos else str(cifras.ORIGINAL),
            'GARRA_BATALLAS': nada if 'batallas' in retenidos else str(batallas_web.ORIGINAL),
            'GARRA_TARJETAS': str(Path(nada) / 'tarjetas.json'), 'GARRA_DISCORD': nada, 'GARRA_FICHAS': str(Path(nada) / 'fichas.json'),
            'GARRA_POSTS': str(Path(nada) / 'posts.json'), 'GARRA_FOTOS': str(Path(nada) / 'fotos.json'),
            'VIGILAR_APODOS': APODOS.read_text(encoding='utf-8')}


def sin_apodos(texto, lista):
    """Este mensaje acaba en registros y avisos: nombra el fichero, nunca a la persona."""
    for apodo in sorted((a.strip() for a in lista.splitlines() if a.strip()), key=len, reverse=True):
        texto = re.sub(re.escape(apodo), '«…»', texto, flags=re.I)
    return texto


def ejecutar(copia, env, script):
    r = subprocess.run([sys.executable, str(Path('herramientas') / script)], cwd=copia, env=env, capture_output=True,
                       encoding='utf-8', errors='replace', timeout=600)
    if r.returncode:
        fallos = [l for l in r.stdout.splitlines() if l.startswith('FALLO')] or (r.stdout + r.stderr).strip().splitlines()[-3:]
        raise NoPublico(sin_apodos(f'{script} no da el visto bueno: ' + ' · '.join(fallos[:5]), env['VIGILAR_APODOS']))


def limpiar_huerfanas():
    """Si matan la tarea a mitad, el finally de publicar no llega a limpiar su copia."""
    limite = time.time() - HUERFANA
    for carpeta in Path(tempfile.gettempdir()).glob('garra-datos-*'):
        if carpeta.is_dir() and carpeta.stat().st_mtime < limite:
            shutil.rmtree(carpeta, ignore_errors=True)
    git('worktree', 'prune', comprobar=False)


def publicar(vista=False):
    limpiar_huerfanas()
    git('fetch', '--quiet', 'origin', RAMA)
    nuevos, retenidos = novedades()
    motivos = ' · '.join(retenidos.values())
    if nuevos:
        try:
            subir(nuevos, retenidos, vista)
        except NoPublico as e:
            raise NoPublico(f'{e} · {motivos}' if motivos else str(e)) from None
    if retenidos:
        raise NoPublico(motivos)
    if not nuevos:
        print('Ya estaba al día: no publico nada.')


def subir(nuevos, retenidos, vista):
    env = entorno(retenidos)
    carpeta = tempfile.mkdtemp(prefix='garra-datos-')
    copia = str(Path(carpeta) / 'web')
    try:
        git('worktree', 'add', '--quiet', '--detach', copia, f'origin/{RAMA}')
        ejecutar(copia, env, 'montar_web.py')
        cambios = sorted(l[3:] for l in git('status', '--porcelain', cwd=copia).stdout.decode('utf-8').splitlines())
        ajenos = [c for c in cambios if not PERMITIDOS.fullmatch(c)]
        if ajenos:
            raise NoPublico(f'al montar cambian también {ajenos[:5]}: hay algo sin publicar que no es de estos datos')
        if not cambios:
            print('Ya estaba al día: no publico nada.')
            return
        ejecutar(copia, env, 'comprobar.py')
        print(f'{" y ".join(nuevos).capitalize()} nuevas; cambian: {", ".join(cambios)}. Comprobaciones en verde.')
        if vista:
            print('Vista: no he hecho commit ni he subido nada.')
            return
        git('add', '--', *cambios, cwd=copia)
        fecha = json.loads(cifras.ORIGINAL.read_bytes())['fecha'] if 'cifras' in nuevos else ''
        titulo = f'Datos del clan al día: {" y ".join(nuevos)}{f" del {fecha}" if fecha else ""}'
        git(*AUTOR, 'commit', '--quiet', '-m', titulo, '-m', FIRMA, cwd=copia)
        git('push', '--quiet', 'origin', f'HEAD:refs/heads/{RAMA}', cwd=copia)
        print(f'Publicado en GitHub: {titulo}.')
    finally:
        git('worktree', 'remove', '--force', copia, comprobar=False)
        shutil.rmtree(carpeta, ignore_errors=True)
        git('worktree', 'prune', comprobar=False)


if __name__ == '__main__':
    sys.stdout.reconfigure(encoding='utf-8')
    try:
        publicar(vista='--vista' in sys.argv)
    except NoPublico as e:
        sys.exit(f'No he publicado: {e}.')
