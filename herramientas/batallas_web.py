"""Las batallas del clan en la web: el marcador de la portada y la lista de El clan.

La fuente es batallas/batallas.json del proyecto del Discord (el mismo que publica cada batalla en
#batallas). GitHub no ve ese proyecto, así que la web lee una copia exacta, herramientas/batallas.json:
montar_web.py la pone al día sola cada vez que encuentra el original (variable GARRA_BATALLAS o
~/Downloads/garra-iberica/batallas/batallas.json), y comprobar.py falla si la copia y el original
difieren. Una batalla nueva se apunta solo en el Discord; aquí no se escribe nada a mano.
"""
import datetime
import json
import os
import sys
from html import escape
from pathlib import Path

COPIA = Path(__file__).resolve().parent / 'batallas.json'
ORIGINAL = Path(os.environ.get('GARRA_BATALLAS') or Path.home() / 'Downloads' / 'garra-iberica' / 'batallas' / 'batallas.json')
# Más puntos que estos por bando no caben en una línea del móvil: a partir de ahí, solo la cifra.
MAX_PUNTOS = 12
# Batallas que salen en la portada (las últimas); la lista entera está en El clan.
EN_PORTADA = 3
ANCLA = {'es': 'batallas', 'en': 'battles'}
T = {
    'es': {
        'resultado': {'victoria': 'Victoria', 'derrota': 'Derrota', 'empate': 'Empate', None: 'En curso'},
        'ante': {'victoria': 'Victoria ante {r}', 'derrota': 'Derrota ante {r}', 'empate': 'Empate con {r}', None: 'En curso contra {r}'},
        'inferioridad': ', en inferioridad', 'contra': 'contra', 'de': 'de', 'ganadas': ['batalla ganada', 'batallas ganadas'],
        'aria': 'Batallas del clan', 'todas': 'Todas las batallas', 'nuestros': 'de los nuestros', 'suyos': 'de {r}',
        'mes': ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'],
    },
    'en': {
        'resultado': {'victoria': 'Victory', 'derrota': 'Defeat', 'empate': 'Draw', None: 'In progress'},
        'ante': {'victoria': 'Victory over {r}', 'derrota': 'Defeat against {r}', 'empate': 'Draw with {r}', None: 'In progress against {r}'},
        'inferioridad': ', outnumbered', 'contra': 'vs', 'de': 'of', 'ganadas': ['battle won', 'battles won'],
        'aria': 'Clan battles', 'todas': 'All battles', 'nuestros': 'of ours', 'suyos': 'from {r}',
        'mes': ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'],
    },
}


def al_dia():
    """Copia el original encima de la copia si ha cambiado. Devuelve True si la ha cambiado."""
    if not ORIGINAL.is_file() or (COPIA.is_file() and COPIA.read_bytes() == ORIGINAL.read_bytes()):
        return False
    COPIA.write_bytes(ORIGINAL.read_bytes())
    return True


def cargar(ruta=COPIA):
    """Las batallas, en orden (la última, al final), revisadas como las revisa el Discord."""
    try:
        batallas = json.loads(ruta.read_text(encoding='utf-8'))['batallas']
    except (OSError, ValueError, KeyError) as e:
        sys.exit(f'{ruta.name}: no se puede leer ({e})')
    vistas = set()
    for b in batallas:
        k = b.get('clave')
        if not k or k in vistas:
            sys.exit(f'{ruta.name}: batalla sin clave o repetida: {k}')
        vistas.add(k)
        if not str(b.get('rival', '')).strip():
            sys.exit(f'{ruta.name}: {k} sin rival')
        for lado in ('nosotros', 'ellos'):
            if not isinstance(b.get(lado), int) or isinstance(b[lado], bool) or b[lado] < 1:
                sys.exit(f'{ruta.name}: {k}: «{lado}» tiene que ser un número de jugadores (1 o más)')
        if b.get('resultado') not in T['es']['resultado']:
            sys.exit(f'{ruta.name}: {k}: resultado «{b.get("resultado")}» no válido')
        if 'fecha' in b:
            try:
                datetime.date.fromisoformat(b['fecha'])
            except (TypeError, ValueError):
                sys.exit(f'{ruta.name}: {k}: la fecha va como AAAA-MM-DD')
        if bool(b.get('nota_es')) != bool(b.get('nota_en')):
            sys.exit(f'{ruta.name}: {k}: la nota va en español y en inglés, o en ninguno')
    return batallas


def frase(b, lang):
    t = T[lang]
    texto = t['ante'][b.get('resultado')].format(r=b['rival'])
    if b.get('resultado') and b['nosotros'] < b['ellos']:
        texto += t['inferioridad']
    return texto


def marcador(lang, ruta_clan, batallas=None):
    """Tira de cifras de la portada: victorias y las últimas batallas. Vacía si no hay ninguna."""
    batallas = cargar() if batallas is None else batallas
    if not batallas:
        return ''
    t = T[lang]
    terminadas = [b for b in batallas if b.get('resultado')]
    ganadas = sum(b['resultado'] == 'victoria' for b in terminadas)
    filas = []
    if terminadas:
        filas.append(f'<li class="revelar"><b>{ganadas} {t["de"]} {len(terminadas)}</b>'
                     f'<span>{t["ganadas"][len(terminadas) != 1]}</span></li>')
    for b in reversed(batallas[-EN_PORTADA:]):
        filas.append(f'<li class="revelar"><b>{b["nosotros"]} vs {b["ellos"]}</b><span>{escape(frase(b, lang))}</span></li>')
    filas.append(f'<li class="revelar cifras-enlace"><a href="@/{ruta_clan}#{ANCLA[lang]}">{t["todas"]}</a></li>')
    return f'<ul class="cifras escalonado" role="list" aria-label="{t["aria"]}">' + ''.join(filas) + '</ul>'


def bando(n, quien, clase):
    puntos = '<i></i>' * min(n, MAX_PUNTOS)
    return f'<span class="bando {clase}" aria-hidden="true">{puntos}</span><span class="oculto">{n} {quien}</span>'


def lista(lang, batallas=None):
    """Lista de El clan, de la última a la primera."""
    batallas = cargar() if batallas is None else batallas
    t = T[lang]
    filas = []
    for b in reversed(batallas):
        r = escape(b['rival'])
        res = b.get('resultado')
        fecha = ''
        if 'fecha' in b:
            d = datetime.date.fromisoformat(b['fecha'])
            dia = f'{d.day} de {t["mes"][d.month - 1]} de {d.year}' if lang == 'es' else f'{d.day} {t["mes"][d.month - 1]} {d.year}'
            fecha = f'<time datetime="{d.isoformat()}">{dia}</time>'
        nota = f'<p class="batalla-nota">{escape(b["nota_" + lang])}</p>' if b.get('nota_es') else ''
        filas.append(
            f'<li class="batalla revelar">'
            f'<p class="batalla-cara"><span class="batalla-clan">GARRA IBÉRICA</span><span class="batalla-vs">vs</span>'
            f'<span class="batalla-rival">{r}</span></p>'
            f'<p class="batalla-bandos">{bando(b["nosotros"], t["nuestros"], "nuestro")}'
            f'<b>{b["nosotros"]} {t["contra"]} {b["ellos"]}</b>{bando(b["ellos"], t["suyos"].format(r=r), "suyo")}</p>'
            f'<p class="batalla-resultado batalla-{res or "curso"}">{t["resultado"][res]}{fecha}</p>{nota}</li>')
    return f'<ol class="batallas escalonado" role="list">{"".join(filas)}</ol>'


if __name__ == '__main__':
    sys.stdout.reconfigure(encoding='utf-8')
    print('copia puesta al día' if al_dia() else 'copia ya al día (o sin original)')
    print(len(cargar()), 'batallas')
