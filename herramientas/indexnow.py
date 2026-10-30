"""Avisa a los buscadores de IndexNow (Bing, y con él DuckDuckGo, Yahoo y Ecosia; también Yandex,
Seznam, Naver y Yep) de que las páginas del sitemap han cambiado, para que las rastreen pronto.
Google no usa IndexNow: para Google está Search Console.

Uso, después de publicar: python herramientas/indexnow.py
La clave es pública por diseño: es el fichero docs/<clave>.txt, que demuestra que la web es nuestra.
"""
import json
import re
import sys
import urllib.error
import urllib.request
import xml.etree.ElementTree as ET
from pathlib import Path
from urllib.parse import urlsplit

DOCS = Path(__file__).resolve().parent.parent / 'docs'
API = 'https://api.indexnow.org/indexnow'
RESPUESTAS = {
    200: 'aceptado', 202: 'recibido; la clave se validará en un rato',
    400: 'petición mal formada', 403: 'la clave no es válida o no se encuentra en la web',
    422: 'alguna dirección no pertenece a la web o no casa con la clave', 429: 'demasiados avisos seguidos: espera y repite',
}


def clave():
    candidatas = [f for f in DOCS.glob('*.txt') if re.fullmatch(r'[0-9a-f]{32}', f.stem)]
    if len(candidatas) != 1 or candidatas[0].read_text(encoding='utf-8').strip() != candidatas[0].stem:
        sys.exit('Debe haber un único docs/<clave>.txt cuyo contenido sea la propia clave')
    return candidatas[0].stem


def direcciones():
    ns = {'s': 'http://www.sitemaps.org/schemas/sitemap/0.9'}
    raiz = ET.fromstring((DOCS / 'sitemap.xml').read_bytes())
    return [u.text for u in raiz.findall('s:url/s:loc', ns)]


def main():
    k = clave()
    urls = direcciones()
    base = urls[0]
    ubicacion = f'{base}{k}.txt'
    try:
        with urllib.request.urlopen(ubicacion, timeout=20) as r:
            publicada = r.read().decode('utf-8').strip()
    except urllib.error.URLError as e:
        sys.exit(f'La clave aún no está publicada en {ubicacion} ({e}): sube la web y espera a que GitHub Pages termine')
    if publicada != k:
        sys.exit(f'{ubicacion} no contiene la clave esperada')
    cuerpo = json.dumps({'host': urlsplit(base).hostname, 'key': k, 'keyLocation': ubicacion, 'urlList': urls}).encode('utf-8')
    peticion = urllib.request.Request(API, data=cuerpo, headers={'Content-Type': 'application/json; charset=utf-8'})
    try:
        with urllib.request.urlopen(peticion, timeout=30) as r:
            estado = r.status
    except urllib.error.HTTPError as e:
        estado = e.code
    print(f'IndexNow {estado}: {RESPUESTAS.get(estado, "respuesta inesperada")}')
    for u in urls:
        print('  ', u)
    sys.exit(0 if estado in (200, 202) else 1)


if __name__ == '__main__':
    sys.stdout.reconfigure(encoding='utf-8')
    sys.stderr.reconfigure(encoding='utf-8')
    main()
