"""Genera los vídeos de las batallas para la web a partir de los vídeos exportados del juego.

Uso: python herramientas/preparar_videos.py [carpeta de vídeos] [clave ...]
La carpeta por defecto es ~/Videos. Con claves (p. ej. delta-1), solo genera esas.
Solo lee los originales (2560x1440 a 120 fps, unos 35 Mb/s: no caben en la web). Vienen con franjas
negras arriba y abajo (formato de cine, 2,39:1): se quitan. Por cada batalla de VIDEOS escribe:
- docs/video/batalla-<clave>.mp4: 1280x536 a 30 fps, H.264 y AAC (lo reproduce cualquier navegador),
  con el índice al principio para que empiece a verse antes de bajar entero. Con sonido: lo decidió
  Quilez. Si pasa de PESO_MAX, se repite con menos calidad.
- docs/video/batalla-<clave>-movil.mp4: la misma a 854x358 y como mucho ~1,1 Mb/s, para pantallas de
  hasta 700 px (la página la elige con <source media>). En un móvil se ve igual y pesa un tercio:
  menos datos y no se para a cargar con poca cobertura.
- docs/img/batalla-<clave>.webp: la portada que se ve antes de darle al play, un fotograma del vídeo.
La web solo pone vídeo a las batallas que tienen su .mp4; la clave es la de batallas.json.
ffmpeg tiene que estar instalado.
"""
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

DOCS = Path(__file__).resolve().parent.parent / 'docs'
# Por debajo del máximo de comprobar.py (40 MB) con margen.
PESO_MAX = 38 * 1024 * 1024
# Franja central de 2,39:1 (sin las bandas negras).
RECORTE = 'crop=iw:trunc(iw/2.39/2)*2:0:(ih-oh)/2'
IMAGEN = RECORTE + ',scale=1280:536:flags=lanczos'
# sufijo del fichero: (escala, calidades a probar, límite de caudal, audio)
VERSIONES = {
    '': ('scale=1280:536:flags=lanczos', (24, 26, 28, 30, 32), [], '128k'),
    '-movil': ('scale=854:358:flags=lanczos', (26, 28, 30), ['-maxrate', '1100k', '-bufsize', '2200k'], '96k'),
}
# clave de batallas.json: (vídeo dentro de la carpeta, segundo del fotograma de portada)
VIDEOS = {
    'smoke-1': ('Medal/Video-Editor/exports/caaaa91e-6148-453f-8316-6c1e1f1a6741-render.mp4', 16),
    'delta-1': ('Medal/Video-Editor/exports/2 Batalla Garra Ibérica.mp4', 16),
}


def ffmpeg(*args):
    r = subprocess.run(['ffmpeg', '-v', 'error', '-y', *args], capture_output=True, text=True, encoding='utf-8', errors='replace')
    if r.returncode:
        sys.exit(f'ffmpeg falló: {r.stderr.strip()}')


def preparar(clave, origen, segundo):
    for sufijo, (escala, calidades, caudal, audio) in VERSIONES.items():
        salida = DOCS / 'video' / f'batalla-{clave}{sufijo}.mp4'
        salida.parent.mkdir(exist_ok=True)
        # Se escribe aparte y se mueve al final: si falla a medias, el vídeo anterior sigue entero.
        with tempfile.TemporaryDirectory() as tmp:
            prueba = Path(tmp) / 'v.mp4'
            for crf in calidades:
                ffmpeg('-i', str(origen), '-map', '0:v:0', '-map', '0:a:0?',
                       '-vf', f'{RECORTE},{escala},fps=30', '-c:v', 'libx264', '-preset', 'slow', '-crf', str(crf), *caudal,
                       '-profile:v', 'high', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', audio, '-ac', '2',
                       '-movflags', '+faststart', str(prueba))
                if prueba.stat().st_size <= PESO_MAX:
                    break
            else:
                sys.exit(f'{clave}{sufijo}: ni con calidad {calidades[-1]} baja de {PESO_MAX // 2**20} MB')
            shutil.move(str(prueba), salida)
        print(f'{salida.name}: {salida.stat().st_size / 2**20:.1f} MB (calidad {crf})')
    portada = DOCS / 'img' / f'batalla-{clave}.webp'
    ffmpeg('-ss', str(segundo), '-i', str(origen), '-frames:v', '1', '-vf', IMAGEN,
           '-c:v', 'libwebp', '-quality', '72', str(portada))
    print(f'{portada.name}: {portada.stat().st_size // 1024} KB')


def main():
    sys.stdout.reconfigure(encoding='utf-8')
    args = sys.argv[1:]
    carpeta = Path(args.pop(0)) if args and Path(args[0]).is_dir() else Path.home() / 'Videos'
    claves = args or list(VIDEOS)
    for clave in claves:
        if clave not in VIDEOS:
            sys.exit(f'{clave}: no está en VIDEOS')
        origen = carpeta / VIDEOS[clave][0]
        if not origen.is_file():
            sys.exit(f'{clave}: no encuentro {origen}')
        preparar(clave, origen, VIDEOS[clave][1])


if __name__ == '__main__':
    main()
