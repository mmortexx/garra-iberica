"""Cambia la dirección pública de la web en todos los ficheros que la llevan.

Uso: python herramientas/cambiar_dominio.py https://usuario.github.io/
     python herramientas/cambiar_dominio.py https://usuario.github.io/nombre-repo/
La dirección actual se lee del <link rel="canonical"> de index.html. Después hay que ejecutar
herramientas/calendario.py y herramientas/montar_web.py, que la toman de ahí.
"""
import re
import sys
from pathlib import Path

import montar_web

WEB = montar_web.DOCS
FICHEROS = [*montar_web.FICHEROS, '404.html', 'robots.txt', 'sitemap.xml']


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
    # Todo se prepara antes de escribir: si un fichero no lleva la dirección, no se toca ninguno.
    cambios = {}
    for nombre in FICHEROS:
        datos = (WEB / nombre).read_bytes().decode('utf-8')
        veces = datos.count(vieja)
        if veces == 0:
            sys.exit(f'{nombre}: no contiene {vieja}; no se ha cambiado nada')
        cambios[nombre] = (datos.replace(vieja, nueva), veces)
    for nombre, (datos, veces) in cambios.items():
        (WEB / nombre).write_bytes(datos.encode('utf-8'))
        # Se compara lo escrito con lo calculado (contar la vieja falla si la nueva la contiene,
        # p. ej. de …/garra-iberica/ a …/garra-iberica/web/).
        if (WEB / nombre).read_bytes() != datos.encode('utf-8'):
            sys.exit(f'{nombre}: lo escrito no es lo esperado; revisa ese fichero')
        print(f'{nombre}: {veces} cambios')
    print(f'Hecho: {vieja} -> {nueva}. Ejecuta ahora calendario.py, montar_web.py y comprobar.py')


if __name__ == '__main__':
    sys.stdout.reconfigure(encoding='utf-8')
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    main(sys.argv[1])
