"""Pone a cada CSS/JS de la web una versión (?v=huella) que cambia cuando cambia el fichero,
para que los navegadores no mezclen una página nueva con estilos o scripts viejos en caché.

Uso: python herramientas/versionar.py   (ejecutar tras tocar estilos.css, efectos.js o caceria.js)
"""
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from comprobar import PAGINAS, VERSIONADOS, huella  # noqa: E402

WEB = Path(__file__).resolve().parent.parent / 'docs'


def main():
    huellas = {n: huella(WEB / n) for n in VERSIONADOS}
    patron = re.compile(r'(["/])(' + '|'.join(re.escape(n) for n in VERSIONADOS) + r')(\?v=[0-9a-f]*)?"')
    for nombre in [*PAGINAS, '404.html']:
        p = WEB / nombre
        texto = p.read_bytes().decode('utf-8')
        nuevo, veces = patron.subn(lambda m: f'{m.group(1)}{m.group(2)}?v={huellas[m.group(2)]}"', texto)
        if veces == 0:
            sys.exit(f'{nombre}: no enlaza ningún CSS/JS versionable; no se ha tocado')
        p.write_bytes(nuevo.encode('utf-8'))
        print(f'{nombre}: {veces} referencias')
    for n, h in huellas.items():
        print(f'  {n} -> {h}')


if __name__ == '__main__':
    main()
