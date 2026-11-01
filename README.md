# Web de GARRA IBÉRICA

Web estática del clan GARRA IBÉRICA (clan español de The Isle Evrima), publicada con GitHub Pages
desde la carpeta `docs/`. Sin dependencias: HTML, CSS y un poco de JavaScript propio.

Dirección: https://mmortexx.github.io/garra-iberica/ (inglés en `/en/`).

## Qué hay

| Fichero | Para qué |
|---|---|
| `paginas/es/`, `paginas/en/` | El texto de cada página (inicio, clan, cacería, guía de combate, galería, únete, normas y aviso legal), en español y en inglés. Aquí se cambian los textos; si cambias uno, cámbialo en los dos idiomas. |
| `docs/**/index.html` | Las páginas publicadas: 18 fijas (9 por idioma) y una por especie en cada idioma. Las genera `herramientas/montar_web.py`; no se editan a mano. |
| `docs/estilos.css` | Todo el diseño y las animaciones. |
| `docs/efectos.js` | Ascuas, paralaje, apariciones al hacer scroll, visor de la galería, el botón flotante de volver arriba (sale al subir en una página larga), los enlaces viejos de la portada (`/#normas`) a su página nueva y el reposo: tras 20 s sin actividad, con otra ventana delante o con el menú o el visor encima, los efectos de ambiente se quedan quietos para no gastar. Las ascuas van a 30 fotogramas por segundo: a 60 se llevaban un tercio del procesador de un móvil. La página funciona igual sin él (cada foto abre su imagen grande). |
| `docs/caceria.js` | Cuenta atrás de la Cacería (sábados 22:00, hora de España), en el idioma de la página, el planificador de la guía y el selector «¿A qué hora es en tu país?» de la página de la Cacería (hora de la cacería, la encuesta y el aviso en el país elegido; los países van en la página y `comprobar.py` exige que sean zonas horarias reales y las mismas en los dos idiomas, y que `AVISOS` diga las horas de `datos_clan.json`). |
| `docs/guia.js` | Ordena y filtra la comparativa de especies de la guía de dinosaurios (por peso, crecimiento, grupo, dieta y cuántos jugáis juntos). Sin él, la lista se ve entera en el orden de las fichas. |
| `docs/404.html` | Página de «no encontrada», con enlace al inicio y al Discord. Se escribe a mano. |
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
python herramientas/montar_web.py
python herramientas/comprobar.py
node herramientas/prueba_caceria.js
```

- `montar_web.py` genera las 18 páginas fijas, las de cada especie, el mapa del sitio y la versión de los estilos en
  `404.html`. Cabecera, menú, pie, metadatos, datos estructurados y migas son comunes y salen del
  script; el contenido de cada página sale de `paginas/<idioma>/<página>.html`: arriba unas líneas
  `titulo:`, `descripcion:` (70–160 letras), `h1:` y, opcional, `og_descripcion:` (la que sale al
  compartir el enlace), luego una línea `---` y después lo que va dentro de la página. Al cambiar el
  contenido, sube la fecha `REVISADA` de `montar_web.py` (es la que ven los buscadores en el mapa
  del sitio). En esos ficheros, `@/` es el principio de la web (el script pone la ruta que toque) y
  `{{discord}}`, `{{n_fichas}}`, `{{especies}}`, `{{google_calendar}}`, `{{migas}}`, `{{normas}}` y `{{grupo:Especie}}` se
  rellenan solos. El menú de arriba lleva solo las siete páginas de `MENU` (Inicio incluida); Normas y el aviso legal
  van en el pie, y Normas además desde El clan y Cómo entrar. También pone a `estilos.css`, `efectos.js` y `caceria.js` una marca (`?v=…`) que cambia con
  el fichero, para que nadie vea la página nueva con estilos viejos guardados en su navegador.
  `comprobar.py` falla si `docs/` no es exactamente lo que sale del script.
- La guía de dinosaurios sale de `herramientas/fichas_dinos.json` (con `guia_dinos.py`, que usa
  `montar_web.py`), copia exacta de `wiki/fichas.json` del proyecto del Discord. Si cambian las
  fichas: copiar ese fichero encima de `fichas_dinos.json` y ejecutar `montar_web.py`.
  `comprobar.py` falla si alguna página dice otro número de fichas o, cuando encuentra el original
  (variable `GARRA_FICHAS` o `~/Downloads/garra-iberica/wiki/fichas.json`), si la copia se ha
  quedado atrás. El planificador de cada ficha («¿Llegas adulto a la cacería?») usa los tiempos de
  crecimiento de esas mismas fichas; `guia_dinos.py` se para si no entiende alguno.
  La comparativa de especies («Comparar especies», arriba de la guía) sale de esas mismas fichas:
  peso máximo (el Prime, o el único si no lo hay), crecimiento y grupo máximo. `guia_dinos.py` se para
  si un peso no se entiende, si el español y el inglés dan pesos distintos o si un grupo no es un número.
  Cada ficha tiene además su página, en español y en inglés (`dinosaurios/<especie>/` y
  `en/dinosaurs/<especie>/`, con el nombre en minúsculas y sin tildes): la ficha entera, su puesto
  frente a las demás en peso, crecimiento y grupo, las otras de su dieta y «Cómo leer las fichas».
  Se crean y se borran solas con las fichas al ejecutar `montar_web.py`; el nombre de cada ficha en la
  guía, la comparativa, la portada y la guía de combate enlazan a ella. `comprobar.py` falla si falta
  o sobra alguna, si la española y la inglesa no se enlazan entre sí, si no está en el mapa del sitio
  o si un dato (marcado con `data-ficha` / `data-mut`) no es el de `fichas_dinos.json`. Cambiar el
  nombre de una especie cambia su dirección: los enlaces que ya circulen a la vieja dejan de funcionar.
- Las batallas del clan (portada y El clan, marcadores `{{batallas_cifras}}` y `{{batallas}}`) salen
  de `herramientas/batallas.json`, copia exacta de `batallas/batallas.json` del proyecto del
  Discord. `montar_web.py` la pone al día sola si encuentra el original (variable
  `GARRA_BATALLAS` o `~/Downloads/garra-iberica/batallas/batallas.json`); `comprobar.py` avisa si
  falta el original y falla si la copia se ha quedado atrás. Para que una batalla nueva salga en la
  web hay que volver a montar y publicar: no aparece sola.
- La guía de combate (`paginas/<idioma>/combate.html`) es la del canal #wiki del Discord, con otra
  presentación: cada apartado lleva `data-guia-titulo` y cada viñeta (o trozo de viñeta separado
  por « · ») `data-guia`; los canales del Discord van en `<span data-canal>` y el grupo máximo de
  cada especie sale de su ficha con `{{grupo:Especie}}`. Si `comprobar.py` encuentra el original
  (`posts.json`, junto a `fichas.json`), falla si la web no dice exactamente lo mismo, en el mismo
  orden, y avisa si la guía del Discord da un grupo distinto del de la ficha. Si el staff cambia la
  guía en Discord: copiar el texto nuevo a las dos páginas.
- Vídeos de las batallas: `python herramientas/preparar_videos.py` los genera desde los vídeos
  exportados (lista `VIDEOS`, clave de `batallas.json` → fichero dentro de `~/Videos`) en
  `docs/video/batalla-<clave>.mp4`, más una versión ligera para móviles (`-movil.mp4`, un tercio del
  peso, la que se reproduce en pantallas de hasta 700 px), con su portada en `docs/img/`. La lista de El clan pone el
  vídeo a cada batalla que lo tiene. Se oyen tal cual (con la voz, si la hay): lo decidió Quilez.
  Para una batalla nueva: añadir su línea a `VIDEOS`, ejecutar el script y montar.
- Las secciones que antes estaban en la portada tienen ahora su página; `montar_web.MOVIDAS` dice a
  dónde lleva cada enlace viejo (`/#normas` → `normas/`) y `comprobar.py` vigila que el destino
  exista.

- `calendario.py` genera `docs/caceria.ics` y `docs/en/caceria.ics` (la Cacería semanal, para
  añadirla al calendario con aviso 30 minutos antes) y escribe el enlace de Google Calendar que va
  en las páginas, todo a partir de `herramientas/datos_clan.json` y de la dirección de la web. Hay
  que ejecutarlo si cambia la hora de la Cacería o la dirección. Los `.ics` llevan finales de línea
  CRLF, como pide el formato; `.gitattributes` evita que git los cambie.

- `comprobar.py` revisa todas las páginas (las fijas y las de cada especie): título, encabezado, metadatos, idiomas, datos estructurados
  (y que las preguntas frecuentes coincidan con las visibles), sitemap, robots, enlaces, imágenes,
  fuentes sin hinting (con él, en pantallas normales la «i» y la «j» pierden el punto) y
  que no se cuele ningún dato de miembros ni ID de Discord. Los apodos a vigilar se leen de
  `herramientas/vigilar.local.txt`, uno por línea; ese fichero no se sube a GitHub. Sin él, el
  comprobador se niega a dar el visto bueno.
  También exige que la web diga lo mismo que `herramientas/datos_clan.json`: los plazos de ascenso
  y la franja horaria de la Cacería en Latinoamérica (calculada con las zonas horarias de cada país
  para todos los sábados de este año y el siguiente). Ese fichero es un extracto, sin IDs ni más
  apodos que los de los tres jefes, de `tarjetas.json` (los textos del Discord, fuera de este repositorio). Si el comprobador
  encuentra `tarjetas.json` (variable `GARRA_TARJETAS` o `~/Downloads/garra-iberica/tarjetas.json`),
  comprueba además que el extracto siga al día; si no, lo avisa. Si cambian los textos del
  Discord: actualizar el extracto y la web a la vez.
  La página de normas sale entera de ese extracto (`normas` en `datos_clan.json`): cada norma, con
  su número, tiene que estar tal cual en la tarjeta `#normas`, y la tarjeta no puede tener ni una
  más. Si el staff cambia o añade una norma en Discord, el comprobador falla hasta copiarla aquí.
  Los tres jefes (Alfa) de El clan salen de la frase de la tarjeta de rangos copiada en `alfas`
  (`{{alfas}}` en la página, en orden alfabético y con el mismo estilo). Son la única excepción a
  los apodos vigilados: solo esos tres (`JEFES` en `comprobar.py`), solo dentro de ese fragmento y
  de esa cita, y el comprobador falla si la tarjeta cambia de jefes o si un apodo sale en otro sitio.
  También revisa que `datos_clan.json` no lleve apodos ni IDs (el repositorio es público) y que la 404 solo enlace fuera de la web a la invitación de Discord.
- `prueba_caceria.js` revisa la cuenta atrás, incluidos los cambios de hora.
- `prueba_navegador.js` (opcional, necesita Playwright y la web servida en local) abre las 18
  páginas en un navegador real: todo visible con y sin JavaScript, sin errores, ningún texto
  cortado en móviles estrechos, la cabecera sin solapes y el menú entero en una fila desde 1020 px
  o, por debajo, tras su botón; de 320 a 1440 px (cada 5) y a 1920 px, la página nunca más ancha
  que la pantalla y la marca de la cabecera en la misma vertical que los títulos de las secciones.
  En el móvil abre el menú, lo cierra con Escape y con la X y recorre todas las páginas desde él;
  prueba los enlaces viejos de la portada, usa el visor de la galería con ratón y con el dedo,
  comprueba que la escalera de rangos sube en títulos y líneas, que el ambiente se para en reposo
  (y con el menú o el visor encima), que el botón de volver arriba sale al subir, lleva arriba y
  no tapa el pie y
  comprueba que, si las fuentes llegan tarde, la página no da saltos y que, si llegan a tiempo, se
  pintan las fuentes propias. En El clan, que el móvil reproduce el vídeo ligero y el escritorio el
  normal. Accesibilidad: el texto sobre fotos (portada, cabeceras, baldosas) con contraste suficiente
  medido sobre la foto real, nada que se pulse por debajo de 24 px y los iconos del menú y de las
  preguntas visibles en el alto contraste de Windows. Procesador en el móvil: las ascuas no piden más
  de 30 fotogramas por segundo y ninguna animación en marcha repinta sombras, fondos o filtros (en
  táctil el latido del botón es un anillo que solo se escala y se apaga).

GitHub Actions (`.github/workflows/comprobar.yml`) ejecuta las tres en cada push y pull request.
Los apodos los recibe de un secreto del repositorio, `VIGILAR_APODOS`, que se crea una vez con
`gh secret set VIGILAR_APODOS < herramientas/vigilar.local.txt`. Pages publica aunque falle: si
sale en rojo, se arregla y se vuelve a subir.

## Cambiar la dirección

Si el repositorio o la cuenta cambian de nombre:

```
python herramientas/cambiar_dominio.py https://CUENTA.github.io/REPO/
python herramientas/calendario.py
python herramientas/montar_web.py
```

Con un dominio propio (`https://dominio.es/`) es igual, y además hay que poner el dominio en
GitHub (Settings → Pages → Custom domain), lo que crea `docs/CNAME`.

## Regenerar imágenes y fuentes

Desde la carpeta original del material del clan (solo se lee, no se modifica):

```
python herramientas/preparar_imagenes.py RUTA/A/garra-iberica
```

El material del clan es cobre y naranja; la web es negra, gris y roja lava. El script pasa la
portada, el cartel de la Cacería, la imagen para compartir, el favicon y los iconos a esa paleta
(lo cálido y apagado a gris, lo vivo a rojo). Los iconos de rango y el trofeo conservan su color
(`SIN_PALETA`). Si cambia el rojo de `--ascua` en `estilos.css`, cambia también `ROJO_LAVA`.
El cartel inglés de la Cacería (`BANNERS_EN`) se dibuja con el mismo `montar.py` del material
del clan, con el texto en inglés; `comprobar.py` falla si una página inglesa usa un cartel que
tiene versión `-en`.

Al compartir el enlace de la galería o de la guía (Discord, WhatsApp…) sale una foto propia con la
garra y el nombre del clan (`og-galeria.jpg`, `og-dinosaurios.jpg`); el resto de páginas, el cartel
del clan. Qué foto y qué recorte, y su texto alternativo, está en `OG` de `preparar_galeria.py`; se
regeneran con `python herramientas/preparar_galeria.py --compartir`. La galería lleva además en sus
datos estructurados y en el mapa del sitio cada foto con su descripción, para Google Imágenes, y la
guía, la lista de especies. `comprobar.py` falla si algo de eso no coincide con lo que se ve.

Las fotos de la galería salen de capturas del juego a 3439x1439 (los originales no se tocan):

```
python herramientas/preparar_galeria.py RUTA/A/LAS/CAPTURAS
```

Las capturas miden 3439 de ancho y 1439 de alto; una más baja se apunta en `ALTO` con su alto real, y
ningún recorte puede salirse de él (`python herramientas/prueba_galeria.py` lo prueba).
Saca de cada una la foto de la galería (encuadrada en el dinosaurio, la mejor calidad que cabe en
120 KB) y la versión ampliada (la captura entera menos la franja de la marca de agua, hasta la
resolución original), todo en WebP de varios tamaños (`docs/img/galeria-*.webp`). Qué captura y
qué recorte va en cada foto está al principio del script. Las de noche que salen casi negras se aclaran
en el mismo script (`ACLARAR`). Si una captura lleva chat con nombres de otros jugadores, interfaz o
avisos, su ampliada es el mismo recorte de la galería (`AMPLIADA_PROPIA`), nunca la captura entera;
`comprobar.py` falla si alguna foto o ampliada no mide lo que da su recorte. Las ampliadas solo se descargan al abrir
una foto en el visor; `comprobar.py` no deja que la página las cargue por su cuenta.

Necesita Python con Pillow y fontTools.

## Buscadores

Al estar en una subcarpeta (`/garra-iberica/`), Google no lee nuestro `robots.txt`: el mapa del sitio
hay que enviarlo a mano en Google Search Console y en Bing Webmaster Tools (`sitemap.xml`).

Después de publicar un cambio de contenido, `python herramientas/indexnow.py` avisa a Bing (y a
DuckDuckGo, Yahoo, Ecosia, Yandex y demás buscadores de IndexNow) para que vuelvan a pasar. Usa la
clave pública `docs/<clave>.txt`; no se borra ni se renombra. Google no usa IndexNow.

Las fuentes Anton y Barlow Condensed se distribuyen con su licencia OFL (`docs/fonts/LICENCIA-OFL.txt`).
