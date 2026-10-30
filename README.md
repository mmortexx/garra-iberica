# Web de GARRA IBÉRICA

Web estática del clan GARRA IBÉRICA (clan español de The Isle Evrima), publicada con GitHub Pages
desde la carpeta `docs/`. Sin dependencias: HTML, CSS y un poco de JavaScript propio.

Dirección: https://mmortexx.github.io/garra-iberica/ (inglés en `/en/`).

## Qué hay

| Fichero | Para qué |
|---|---|
| `docs/index.html` | La página en español (la principal). |
| `docs/en/index.html` | La versión en inglés. Si cambias un texto, cámbialo en las dos. |
| `docs/estilos.css` | Todo el diseño y las animaciones. |
| `docs/efectos.js` | Ascuas, paralaje, apariciones al hacer scroll, menú activo. La página funciona igual sin él. |
| `docs/caceria.js` | Cuenta atrás de la Cacería (sábados 22:00, hora de España), en el idioma de la página. |
| `docs/404.html` | Página de «no encontrada». |
| `docs/robots.txt`, `docs/sitemap.xml` | Para los buscadores. |
| `docs/img/`, `docs/fonts/` | Generados; no se editan a mano. |
| `herramientas/` | Scripts de mantenimiento (abajo). |

## Probar en local

```
python -m http.server 8765 --bind 127.0.0.1 --directory docs
```

y abrir http://127.0.0.1:8765/

## Después de tocar algo

```
python herramientas/calendario.py
python herramientas/versionar.py
python herramientas/comprobar.py
node herramientas/prueba_caceria.js
```

- `calendario.py` genera `docs/caceria.ics` y `docs/en/caceria.ics` (la Cacería semanal, para
  añadirla al calendario con aviso 30 minutos antes) y escribe el enlace de Google Calendar que va
  en las páginas, todo a partir de `herramientas/datos_clan.json` y de la dirección de la web. Hay
  que ejecutarlo si cambia la hora de la Cacería o la dirección. Los `.ics` llevan finales de línea
  CRLF, como pide el formato; `.gitattributes` evita que git los cambie.

- `versionar.py` pone a `estilos.css`, `efectos.js` y `caceria.js` una marca (`?v=…`) que cambia con
  el fichero, para que nadie vea la página nueva con estilos viejos guardados en su navegador.
- `comprobar.py` revisa las dos páginas: título, encabezado, metadatos, idiomas, datos estructurados
  (y que las preguntas frecuentes coincidan con las visibles), sitemap, robots, enlaces, imágenes y
  que no se cuele ningún dato de miembros ni ID de Discord. Los apodos a vigilar se leen de
  `herramientas/vigilar.local.txt`, uno por línea; ese fichero no se sube a GitHub. Sin él, el
  comprobador se niega a dar el visto bueno.
  También exige que la web diga lo mismo que `herramientas/datos_clan.json`: los plazos de ascenso
  y la franja horaria de la Cacería en Latinoamérica (calculada con las zonas horarias de cada país
  para todos los sábados de este año y el siguiente). Ese fichero es un extracto, sin IDs ni
  apodos, de `tarjetas.json` (los textos del Discord, fuera de este repositorio). Si el comprobador
  encuentra `tarjetas.json` (variable `GARRA_TARJETAS` o `~/Downloads/garra-iberica/tarjetas.json`),
  comprueba además que el extracto siga al día; si no, lo avisa. Si cambian los textos del
  Discord: actualizar el extracto y la web a la vez.
- `prueba_caceria.js` revisa la cuenta atrás, incluidos los cambios de hora.
- `prueba_navegador.js` (opcional, necesita Playwright y la web servida en local) abre las dos
  páginas en un navegador real: todo visible con y sin JavaScript, sin errores, ningún texto
  cortado en móviles estrechos y la cabecera sin solapes de 760 a 1440 px.

GitHub Actions (`.github/workflows/comprobar.yml`) ejecuta las tres en cada push y pull request.
Los apodos los recibe de un secreto del repositorio, `VIGILAR_APODOS`, que se crea una vez con
`gh secret set VIGILAR_APODOS < herramientas/vigilar.local.txt`. Pages publica aunque falle: si
sale en rojo, se arregla y se vuelve a subir.

## Cambiar la dirección

Si el repositorio o la cuenta cambian de nombre:

```
python herramientas/cambiar_dominio.py https://CUENTA.github.io/REPO/
```

## Regenerar imágenes y fuentes

Desde la carpeta original del material del clan (solo se lee, no se modifica):

```
python herramientas/preparar_imagenes.py RUTA/A/garra-iberica
```

Necesita Python con Pillow y fontTools.

## Buscadores

Al estar en una subcarpeta (`/garra-iberica/`), Google no lee nuestro `robots.txt`: el mapa del sitio
hay que enviarlo a mano en Google Search Console y en Bing Webmaster Tools (`sitemap.xml`).

Después de publicar un cambio de contenido, `python herramientas/indexnow.py` avisa a Bing (y a
DuckDuckGo, Yahoo, Ecosia, Yandex y demás buscadores de IndexNow) para que vuelvan a pasar. Usa la
clave pública `docs/<clave>.txt`; no se borra ni se renombra. Google no usa IndexNow.

Las fuentes Anton y Barlow Condensed se distribuyen con su licencia OFL (`docs/fonts/LICENCIA-OFL.txt`).
