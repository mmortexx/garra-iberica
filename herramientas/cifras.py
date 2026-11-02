"""Las cifras del clan en la portada: bajas, horas y misiones totales, jugadores en Asura Nexus y las bajas
de cada especie.

La fuente es ranking/cifras.json del proyecto del Discord (lo escribe a partir del ranking de todo el
tiempo, ranking/historico.json, y no lleva nombres ni ID de jugadores). GitHub no ve ese proyecto, así que la
web lee una copia exacta, herramientas/cifras.json: montar_web.py la pone al día sola cada vez que encuentra
el original (variable GARRA_CIFRAS o ~/Documents/Cosas/garra-iberica/ranking/cifras.json) y solo si es
válido. El formato es cerrado: cualquier campo que no esté aquí se rechaza, para que un apodo o un ID no
lleguen a una web pública por descuido. Sin copia, la portada sale sin cifras.

    {"bajas": 587, "horas": 1608.4, "misiones": 2047, "jugadores": 9,
     "especies": [{"name": "Tyrannosaurus", "kills": 140}, ...], "fecha": "2026-11-02"}

Uso: python herramientas/cifras.py   (copia el original y dice qué ha hecho)
"""
import datetime
import json
import math
import os
import re
import sys
from html import escape
from pathlib import Path

import batallas_web
import guia_dinos

COPIA = Path(__file__).resolve().parent / 'cifras.json'
ORIGINAL = Path(os.environ.get('GARRA_CIFRAS') or Path.home() / 'Documents' / 'Cosas' / 'garra-iberica' / 'ranking' / 'cifras.json')
CLAVES = {'bajas', 'horas', 'misiones', 'jugadores', 'especies', 'fecha'}
CLAVES_ESPECIE = {'name', 'kills'}
# Una especie es un nombre de dinosaurio: letras, y espacios o guiones entre palabras.
NOMBRE_ESPECIE = re.compile(r'[^\W\d_]+(?:[ -][^\W\d_]+)*')
MAX_NOMBRE = 40
MAX_ESPECIES = 30
# Ninguna cifra real se acerca: un valor mayor es un error de quien lo escribió.
MAX_CIFRA = 10**9
T = {
    'es': {
        'bajas': ('baja del clan', 'bajas del clan'), 'horas': ('hora jugada', 'horas jugadas'),
        'misiones': ('misión completada', 'misiones completadas'), 'jugadores': ('jugador en Nexus', 'jugadores en Nexus'),
        'aria': 'El clan en cifras', 'nota': 'Datos de Asura Nexus a {fecha}', 'podio': 'Bajas por especie',
        'baja': ('baja', 'bajas'),
    },
    'en': {
        'bajas': ('clan kill', 'clan kills'), 'horas': ('hour played', 'hours played'),
        'misiones': ('quest completed', 'quests completed'), 'jugadores': ('player on Nexus', 'players on Nexus'),
        'aria': 'The clan in numbers', 'nota': 'Asura Nexus data as of {fecha}', 'podio': 'Kills by species',
        'baja': ('kill', 'kills'),
    },
}


def _rechazar(constante):
    raise ValueError(f'«{constante}» no es un número')


def _entero(v):
    return isinstance(v, int) and not isinstance(v, bool) and 0 <= v <= MAX_CIFRA


def _numero(v):
    return isinstance(v, (int, float)) and not isinstance(v, bool) and math.isfinite(v) and 0 <= v <= MAX_CIFRA


def validar(datos, nombre):
    """Se para con un mensaje si los datos no son exactamente el formato de arriba."""
    if not isinstance(datos, dict):
        sys.exit(f'{nombre}: tiene que ser un objeto con {sorted(CLAVES)}')
    sobran, faltan = sorted(set(datos) - CLAVES), sorted(CLAVES - set(datos))
    if sobran:
        sys.exit(f'{nombre}: campos que no se esperan: {sobran}')
    if faltan:
        sys.exit(f'{nombre}: faltan los campos {faltan}')
    for k in ('bajas', 'misiones', 'jugadores'):
        if not _entero(datos[k]):
            sys.exit(f'{nombre}: «{k}» tiene que ser un número entero de 0 a {MAX_CIFRA}')
    if not _numero(datos['horas']):
        sys.exit(f'{nombre}: «horas» tiene que ser un número de 0 a {MAX_CIFRA}')
    try:
        if not isinstance(datos['fecha'], str):
            raise TypeError
        datetime.date.fromisoformat(datos['fecha'])
    except (TypeError, ValueError):
        sys.exit(f'{nombre}: «fecha» va como AAAA-MM-DD')
    especies = datos['especies']
    if not isinstance(especies, list) or len(especies) > MAX_ESPECIES:
        sys.exit(f'{nombre}: «especies» tiene que ser una lista de {MAX_ESPECIES} como mucho')
    vistas = set()
    for e in especies:
        if not isinstance(e, dict) or set(e) != CLAVES_ESPECIE:
            sys.exit(f'{nombre}: cada especie lleva solo {sorted(CLAVES_ESPECIE)}: {e}')
        n = e['name']
        if not isinstance(n, str) or len(n) > MAX_NOMBRE or not NOMBRE_ESPECIE.fullmatch(n):
            sys.exit(f'{nombre}: «{n}» no parece el nombre de una especie (solo letras)')
        if n.casefold() in vistas:
            sys.exit(f'{nombre}: la especie {n} sale dos veces')
        vistas.add(n.casefold())
        if not _entero(e['kills']):
            sys.exit(f'{nombre}: las bajas de {n} tienen que ser un número entero de 0 a {MAX_CIFRA}')


def leer(contenido, nombre):
    try:
        datos = json.loads(contenido.decode('utf-8'), parse_constant=_rechazar)
    except (UnicodeDecodeError, ValueError) as e:
        sys.exit(f'{nombre}: no se puede leer ({e})')
    validar(datos, nombre)
    return datos


def cargar(ruta=None):
    """Las cifras de la copia, o None si aún no hay ninguna (la portada sale sin ellas)."""
    ruta = ruta or COPIA
    if not ruta.is_file():
        return None
    return leer(ruta.read_bytes(), ruta.name)


def al_dia():
    """Copia el original encima de la copia si ha cambiado, y solo si es válido. Devuelve True si la ha cambiado."""
    if not ORIGINAL.is_file():
        return False
    crudo = ORIGINAL.read_bytes()
    leer(crudo, str(ORIGINAL))
    if COPIA.is_file() and COPIA.read_bytes() == crudo:
        return False
    COPIA.write_bytes(crudo)
    return True


def numero(n, lang):
    """Miles con coma en inglés y con espacio fino a partir de 10 000 en español, como pide la RAE."""
    n = round(n)
    if lang == 'en':
        return f'{n:,}'
    return f'{n:,}'.replace(',', ' ') if n >= 10000 else str(n)


def _con_unidad(n, par):
    return par[round(n) != 1]


def filas(lang, datos):
    """Las cifras como elementos de la lista .cifras de la portada, y debajo la fecha de los datos."""
    t = T[lang]
    fecha = datetime.date.fromisoformat(datos['fecha'])
    etiquetas = {'bajas': t['bajas'], 'horas': t['horas'], 'misiones': t['misiones'], 'jugadores': t['jugadores']}
    lis = [f'<li class="revelar"><b>{numero(datos[k], lang)}</b><span>{_con_unidad(datos[k], par)}</span></li>'
           for k, par in etiquetas.items()]
    tiempo = f'<time datetime="{fecha.isoformat()}">{batallas_web.fecha_larga(fecha, lang)}</time>'
    lis.append(f'<li class="cifras-nota"><span>{t["nota"].format(fecha=tiempo)}</span></li>')
    return lis


def podio(lang, datos, fichas):
    """Las especies con sus bajas, de más a menos, cada una con enlace a su ficha si la hay. Vacío sin especies.
    fichas: las de guia_dinos.datos()['fichas']."""
    if not datos['especies']:
        return ''
    t = T[lang]
    por_nombre = {f['nombre'].casefold(): f['nombre'] for f in fichas}
    lis = []
    for e in sorted(datos['especies'], key=lambda e: -e['kills']):
        ficha = por_nombre.get(e['name'].casefold())
        nombre = (f'<a href="@/{guia_dinos.ruta_especie(ficha, lang)}">{escape(ficha)}</a>' if ficha else escape(e['name']))
        lis.append(f'<li class="revelar"><span class="podio-nombre">{nombre}</span>'
                   f'<b>{numero(e["kills"], lang)}</b><span class="oculto"> {_con_unidad(e["kills"], t["baja"])}</span></li>')
    return (f'<section class="podio" aria-labelledby="t-podio"><div class="envoltura">'
            f'<h2 id="t-podio" class="podio-titulo">{t["podio"]}</h2>'
            f'<ol class="podio-lista escalonado" role="list">{"".join(lis)}</ol></div></section>')


def portada(lang, ruta_clan, fichas):
    """La tira de cifras de la portada (las del clan y las batallas) y debajo el podio de especies. Sin datos de
    una parte, sale la otra; sin ninguna, nada."""
    datos = cargar()
    lis = [*(filas(lang, datos) if datos else []), *batallas_web.filas(lang, ruta_clan)]
    if not lis:
        return ''
    tira = f'<ul class="cifras escalonado" role="list" aria-label="{T[lang]["aria"]}">{"".join(lis)}</ul>'
    return tira + (podio(lang, datos, fichas) if datos else '')


if __name__ == '__main__':
    sys.stdout.reconfigure(encoding='utf-8')
    print('copia puesta al día' if al_dia() else 'copia ya al día (o sin original)')
    print('sin cifras' if cargar() is None else 'cifras válidas')
