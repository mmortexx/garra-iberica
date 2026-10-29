"""Cambia la dirección pública de la web en todos los ficheros que la llevan.

Uso: python herramientas/cambiar_dominio.py https://usuario.github.io/
     python herramientas/cambiar_dominio.py https://usuario.github.io/nombre-repo/
La dirección actual se lee del <link rel="canonical"> de index.html.
"""
import re
import sys
from pathlib import Path

WEB = Path(__file__).resolve().parent.parent / 'docs'
FICHEROS = ['index.html', 'en/index.html', '404.html', 'robots.txt', 'sitemap.xml']


def base_actual():
    html = (WEB / 'index.html').read_text(encoding='utf-8')
    m = re.search(r'<link rel="canonical" href="([^"]+)"', html)
    if not m:
        sys.exit('index.html no tiene <link rel="canonical">')
    return m.group(1)


def main(nueva):
    if not re.fullmatch(r'https://[a-z0-9.-]+(/[A-Za-z0-9._-]+)*/', nueva):
        sys.exit('La dirección debe empezar por https:// y acabar en /')
    vieja = base_actual()
    if vieja == nueva:
        sys.exit(f'Ya es {nueva}')
    for nombre in FICHEROS:
        p = WEB / nombre
        datos = p.read_bytes().decode('utf-8')
        veces = datos.count(vieja)
        if veces == 0:
            sys.exit(f'{nombre}: no contiene {vieja}; no se ha cambiado nada en este ni en los siguientes')
        p.write_bytes(datos.replace(vieja, nueva).encode('utf-8'))
        quedan = p.read_bytes().decode('utf-8').count(vieja)
        if quedan:
            sys.exit(f'{nombre}: siguen quedando {quedan} apariciones de {vieja}')
        print(f'{nombre}: {veces} cambios')
    print(f'Hecho: {vieja} -> {nueva}. Ejecuta ahora python herramientas/comprobar.py')


if __name__ == '__main__':
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    main(sys.argv[1])
