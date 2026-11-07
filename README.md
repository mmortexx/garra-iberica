# Código de la web

**La web está en https://clan.garra-iberica.workers.dev/**. Esto es solo su código.

Web estática publicada en Cloudflare (`wrangler.toml`) desde la carpeta `docs/`, cada vez que se sube algo a `main`. GitHub Pages solo hace falta para servir los vídeos (`docs/_redirects`), porque Cloudflare los entrega enteros y no por trozos, y sin trozos no se puede saltar a un punto del vídeo. Pages no debe publicar `docs/` entero: los buscadores verían dos webs iguales y a veces se quedan con la de github.io. `.github/workflows/pages.yml` publica allí solo los vídeos y, en lugar de cada página, un aviso noindex que lleva a la misma página en Cloudflare (`herramientas/copia_pages.py`, probado por `prueba_pages.py`); para eso, en GitHub, Settings → Pages → Source tiene que ser «GitHub Actions». Mientras siga siendo la rama, `docs/efectos.js` manda a la dirección nueva a quien abra la antigua, pero los buscadores que no ejecutan scripts siguen viendo la copia. Sin dependencias: HTML, CSS y un poco de JavaScript propio.

Dirección: https://clan.garra-iberica.workers.dev/ (inglés en `/en/`).

## Qué hay

| Fichero | Para qué |
|---|---|
| `paginas/es/`, `paginas/en/` | El texto de cada página (inicio, clan, cacería, guía de combate, galería, únete, normas, ruta de logros y aviso legal), en español y en inglés. Aquí se cambian los textos; si cambias uno, cámbialo en los dos idiomas. |
| `docs/**/index.html` | Las páginas publicadas: 20 fijas (10 por idioma) y una por especie en cada idioma. Las genera `herramientas/montar_web.py`; no se editan a mano. |
| `docs/estilos.css` | Todo el diseño y las animaciones. |
| `docs/efectos.js` | Ascuas y bruma rasante (portada, cabeceras y llamadas), modo ligero automático si el navegador no da abasto, paralaje, apariciones al hacer scroll, fotos que se funden al llegar, portada de los vídeos de las batallas al acercarse (como `poster` se pediría al abrir la página y competiría con la cabecera en un móvil lento), botón grande de reproducir en ellos, visor de la galería (con el texto de la foto debajo, dos dedos para ampliar, deslizar para cambiar o cerrar, «Atrás» lo cierra y cada foto tiene su enlace), el botón flotante de volver arriba (sale al subir en una página larga), los enlaces viejos de la portada (`/#normas`) a su página nueva, lo plegado que nombre la dirección (una ficha, `dinosaurios/#triceratops`, o una respuesta, `unete/#micro`: esas direcciones circulan y la prueba de navegador falla si cambian) y el reposo: tras 20 s sin actividad, con otra ventana delante o con el menú o el visor encima, los efectos de ambiente se quedan quietos para no gastar. Las ascuas van a 30 fotogramas por segundo: a 60 se llevaban un tercio del procesador de un móvil. La página funciona igual sin él (cada foto abre su imagen grande). |
| `docs/caceria.js` | Cuenta atrás de la Cacería (sábados 22:00, hora de España), en el idioma de la página, el planificador de la guía y el selector «¿A qué hora es en tu país?» de la página de la Cacería (hora de la cacería, la encuesta y el aviso en el país elegido; los países van en la página y `comprobar.py` exige que sean zonas horarias reales y las mismas en los dos idiomas, y que `AVISOS` diga las horas de `datos_clan.json`). El planificador guarda lo elegido en la dirección (`?especie=triceratops&ritmo=2&horas=4#planificador`). Los enlaces de la web a él llevan los valores tras el fragmento (`#planificador?especie=triceratops`): Google no rastrea los fragmentos y sí cada dirección con parámetros, y `comprobar.py` falla si un enlace interno lleva parámetros. Las direcciones con `?` siguen funcionando. Mientras se calcula la fecha, el sitio de la cuenta atrás lleva un texto sin fecha escrita a mano (`reserva`). |
| `docs/guia.js` | Ordena y filtra la comparativa de especies de la guía de dinosaurios (por peso, crecimiento, grupo, dieta y cuántos jugáis juntos); las filas viajan a su sitio nuevo. Sin él, la lista se ve entera en el orden de las fichas. |
| `docs/ruta.js` | La ruta de logros: marcar y recordar en el navegador y, si entras con Discord, en tu cuenta. Trae además los logros que el miembro pega desde Nexus: se interpretan en su navegador y solo se guardan las marcas. Es lo único de la web que guarda algo en el navegador, y solo si lo usas. Sin él, la ruta se lee entera. |
| `herramientas/logros.json`, `herramientas/logros_web.py` | La lista de logros, una sola para la página y el servicio de cuentas, y lo que la convierte en HTML. |
| `herramientas/nexus_muestra.json`, `herramientas/limpiar_muestra_nexus.py` | De una respuesta real de Asura Nexus, solo lo que el importador lee: categoría, nombre y objetivos de cada logro, con un progreso de ejemplo. Sin premios ni nada de ninguna cuenta: el repositorio es público y eso solo se ve tras entrar en Nexus. Con ella se prueba que lo que un miembro pega en la ruta casa uno a uno con nuestra lista. Si Nexus cambia sus logros, `prueba_logros.py` falla al refrescarla: se decide la correspondencia en `logros_web.py` (`nexus()`). Se refresca con ese script, nunca copiando la respuesta tal cual. |
| `herramientas/cuentas.json` | La dirección del servicio de cuentas. Vacía, la ruta funciona solo en el navegador de cada uno y lo dice. |
| `servicio/` | El servicio de cuentas, en Cloudflare; no se publica en la web. Cómo ponerlo en marcha, copias de seguridad y límites: [servicio/README.md](servicio/README.md). |
| `docs/404.html` | Página de «no encontrada», en los dos idiomas a la vez (sin scripts no puede saber cuál toca): cada uno enlaza a su inicio, su guía, su Cacería y su Discord, y `comprobar.py` lo vigila. Se escribe a mano. |
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
python herramientas/prueba_galeria.py
python herramientas/prueba_cifras.py
python herramientas/prueba_batallas.py
python herramientas/prueba_borradores.py
python herramientas/prueba_comprobar.py
python herramientas/prueba_pages.py
```

- `montar_web.py` genera las 20 páginas fijas, las de cada especie, el mapa del sitio y la versión de los estilos en
  `404.html`. Cabecera, menú, pie, metadatos, datos estructurados y migas son comunes y salen del
  script; el contenido de cada página sale de `paginas/<idioma>/<página>.html`: arriba unas líneas
  `titulo:` (60 como mucho), `descripcion:` (70–155 letras), `h1:` y, opcional, `og_descripcion:` (la que sale al
  compartir el enlace), luego una línea `---` y después lo que va dentro de la página. Al cambiar el
  contenido, sube la fecha `REVISADA` de `montar_web.py` (es la que ven los buscadores en el mapa
  del sitio). En esos ficheros, `@/` es el principio de la web (el script pone la ruta que toque) y
  `{{discord}}`, `{{steam}}`, `{{n_fichas}}`, `{{especies}}`, `{{google_calendar}}`, `{{migas}}`, `{{normas}}`, `{{cifras}}` y `{{grupo:Especie}}` se
  rellenan solos. El menú de arriba lleva solo las siete páginas de `MENU` (Inicio incluida); Normas y el aviso legal
  van en el pie, y Normas además desde El clan y Cómo entrar. También pone a `estilos.css`, `efectos.js` y `caceria.js` una marca (`?v=…`) que cambia con
  el fichero, para que nadie vea la página nueva con estilos viejos guardados en su navegador.
  `comprobar.py` falla si `docs/` no es exactamente lo que sale del script.
- La guía de dinosaurios sale de `herramientas/fichas_dinos.json` (con `guia_dinos.py`, que usa
  `montar_web.py`), copia exacta de `wiki/fichas.json` del proyecto del Discord. Si cambian las
  fichas: copiar ese fichero encima de `fichas_dinos.json` y ejecutar `montar_web.py`.
  `comprobar.py` falla si alguna página dice otro número de fichas o, cuando encuentra el original
  (variable `GARRA_FICHAS` o `~/Documents/Cosas/garra-iberica/wiki/fichas.json`), si la copia se ha
  quedado atrás. El planificador de cada ficha («¿Llegas adulto a la cacería?») usa los tiempos de
  crecimiento de esas mismas fichas, y las horas que se juega al día; `guia_dinos.py` se para si no entiende alguno.
  En la guía las fichas van plegadas: para elegir está la comparativa y para leer una entera, su página.
  La comparativa de especies («Comparar especies», arriba de la guía) sale de esas mismas fichas:
  peso máximo (el Prime, o el único si no lo hay), crecimiento y grupo máximo. `guia_dinos.py` se para
  si un peso no se entiende, si el español y el inglés dan pesos distintos o si un grupo no es un número.
  Cada ficha tiene además su página, en español y en inglés (`dinosaurios/<especie>/` y
  `en/dinosaurs/<especie>/`, con el nombre en minúsculas y sin tildes): la ficha entera, con su puesto
  frente a las demás junto a cada dato (peso, crecimiento y grupo), las otras de su dieta y «Cómo leer las fichas», plegado.
  Se crean y se borran solas con las fichas al ejecutar `montar_web.py`; el nombre de cada ficha en la
  guía, la comparativa, la portada y la guía de combate enlazan a ella. `comprobar.py` falla si falta
  o sobra alguna, si la española y la inglesa no se enlazan entre sí, si no está en el mapa del sitio
  o si un dato (marcado con `data-ficha` / `data-mut`) no es el de `fichas_dinos.json`. Cambiar el
  nombre de una especie cambia su dirección: los enlaces que ya circulen a la vieja dejan de funcionar.
  Los enlaces de cada especie a la guía (el planificador y «ver la lista» de la comparativa) llevan lo
  elegido tras el fragmento (`dinosaurios/#comparar?orden=peso&marca=triceratops`), no en la consulta: así
  Google no cuenta cinco direcciones nuevas por especie. `guia.js` y `caceria.js` leen las dos formas.
- Las cifras del clan de la portada (`{{cifras}}`: bajas, horas y misiones totales, jugadores en Asura Nexus y
  la fecha de los datos, junto a las victorias y las últimas batallas) y el podio de especies (las bajas de
  cada una, de más a menos, con enlace a su ficha si la hay) salen de `herramientas/cifras.json`, copia
  exacta de `ranking/cifras.json` del proyecto del Discord, que lo escribe a partir del ranking de todo el
  tiempo (`historico.json`). El formato es cerrado, sin nombres ni IDs de jugadores:
  `{"bajas", "horas", "misiones", "jugadores", "especies": [{"name", "kills"}], "fecha": "AAAA-MM-DD"}`.
  `cifras.py` lo valida y rechaza cualquier campo de más, un nombre de especie que no sea solo letras o un
  número que no lo sea; `montar_web.py` copia el original (variable `GARRA_CIFRAS` o
  `~/Documents/Cosas/garra-iberica/ranking/cifras.json`) solo si es válido, y `comprobar.py` falla si la
  copia no es válida o difiere del original, y avisa si es de hace más de 14 días o si el original aún no
  existe. Sin `cifras.json`, la portada sale sin cifras del clan ni podio (siguen las batallas).
  `python herramientas/prueba_cifras.py` prueba qué acepta y qué rechaza, cómo se copia y cómo sale la portada con
  y sin datos. Las bajas del podio (las de cada especie) no tienen por qué sumar las bajas del clan: son dos
  recuentos distintos de Asura Nexus.
- «Empezar en Asura» (`unete/` y `en/join/`, apartado `#empezar-asura` / `#start-asura`) resume lo que decía la web
  oficial de Asura el 2 de noviembre de 2026 (los dos servidores, el boleto de lotería diario, el plan gratis de
  Nexus con mapa en vivo y el aviso de hacer safelog, con su temporizador de 45 s) y manda a comprobar allí las
  normas. Solo dice eso: ninguna promesa más. Si la web de Asura cambia, hay que cambiar el texto en los dos
  idiomas y la fecha; `comprobar.py` (`ASURA`) falla si falta el apartado, una de esas frases, la fecha o si enlaza a
  algo que no sea su web, y el aviso legal nombra Asura entre los sitios a los que sacan los enlaces.
- Las batallas del clan (portada y El clan, marcadores `{{cifras}}` y `{{batallas}}`) salen
  de `herramientas/batallas.json`, copia exacta de `batallas/batallas.json` del proyecto del
  Discord. `montar_web.py` la pone al día sola si encuentra el original (variable
  `GARRA_BATALLAS` o `~/Documents/Cosas/garra-iberica/batallas/batallas.json`); `comprobar.py` avisa si
  falta el original y falla si la copia se ha quedado atrás. Para que una batalla nueva salga en la
  web hay que volver a montar y publicar: no aparece sola. Si una batalla trae `fecha` (AAAA-MM-DD) y
  `nota_es`/`nota_en`, la lista de El clan las enseña (la fecha junto al resultado y la nota debajo);
  `python herramientas/prueba_batallas.py` lo prueba.
- `borradores/` guarda lo que aún no se puede publicar, y `montar_web.py` no lo lee (solo lee `paginas/` y
  `fichas_dinos.json`): la ficha de Oviraptor (`oviraptor.json`, con el formato de `fichas_dinos.json`) y el texto de
  la guía de zonas compartidas (`zonas-compartidas.md`), que aún no está en el juego. De Oviraptor solo se ha
  tomado lo del DevBlog #74 (31/10/2026); lo demás dice «pendiente de comprobar». Para publicarlo: comprobar cada
  dato con una fuente, pasar la ficha a `fichas_dinos.json` y borrar el borrador. `comprobar.py` falla si un
  borrador dice algo más que lo permitido, si Oviraptor ya está en las fichas o si algo de un borrador aparece en
  `docs/`; `python herramientas/prueba_borradores.py` lo prueba.
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
  vídeo a cada batalla que lo tiene. Se oyen tal cual (con la voz, si la hay), a propósito.
  Para una batalla nueva: añadir su línea a `VIDEOS`, ejecutar el script, apuntar en `batallas_web.py` su fecha de
  publicación (`VIDEOS_PUBLICADOS`) y su duración (`DURACION_VIDEOS`), que no se pueden deducir al montar, y montar.
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
  comprobador se niega a dar el visto bueno. En este PC suma los nombres de la manada de
  `perfiles.json` del proyecto del Discord (se cambia la ruta con la variable `GARRA_PERFILES`; los
  tres jefes no cuentan, y los nombres de menos de tres letras o solo símbolos se ignoran y se
  cuentan en un aviso). Busca en la web y en todos los ficheros de texto versionados del repositorio
  (`paginas/`, `servicio/`, `herramientas/`, este README…); en lo que no es la web, los IDs de Discord
  y los tres jefes no se miran. También exige que `docs/_headers` lleve en el bloque `/*`
  `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY` y `Content-Security-Policy` con
  `frame-ancestors 'none'`: desde `<meta>` no funcionan y, sin ellas, otra web podría meter la
  nuestra en un marco invisible. Y, en `/*`, `Strict-Transport-Security` y `Referrer-Policy`; un
  bloque con caché de un año (`immutable`) por cada fichero de `VERSIONADOS`, que las páginas piden
  con `?v=<huella>` (una hoja o un script de la raíz que no esté en esa lista falla); y caché corta,
  sin `immutable`, en `/fonts/*` e `/img/*`, que no llevan huella.
  También exige que la web diga lo mismo que `herramientas/datos_clan.json`: los plazos de ascenso
  y la franja horaria de la Cacería en Latinoamérica (calculada con las zonas horarias de cada país
  para todos los sábados de este año y el siguiente). Ese fichero es un extracto, sin IDs ni más
  apodos que los de los tres jefes, de `tarjetas.json` (los textos del Discord, fuera de este repositorio). Si el comprobador
  encuentra `tarjetas.json` (variable `GARRA_TARJETAS` o `~/Documents/Cosas/garra-iberica/tarjetas.json`),
  comprueba además que el extracto siga al día; si no, lo avisa. Si cambian los textos del
  Discord: actualizar el extracto y la web a la vez.
  La página de normas sale entera de ese extracto (`normas` en `datos_clan.json`): cada norma, con
  su número, tiene que estar tal cual en la tarjeta `#normas`, y la tarjeta no puede tener ni una
  más. Si el staff cambia o añade una norma en Discord, el comprobador falla hasta copiarla aquí.
  Los tres jefes (Alfa) de El clan salen de la frase de la tarjeta de rangos copiada en `alfas`
  (`{{alfas}}` en la página, en orden alfabético y con el mismo estilo). Son la única excepción a
  los apodos vigilados: solo esos tres (`JEFES` en `comprobar.py`), solo dentro de ese fragmento y
  de esa cita, y el comprobador falla si la tarjeta cambia de jefes o si un apodo sale en otro sitio.
  Vigila también lo que promete el aviso legal: ningún `.js` de la web guarda nada en el navegador (salvo `ruta.js`, la ruta de logros, en `localStorage`), ninguna página tiene formularios y cada sitio al que sacan los enlaces (`SITIOS_FUERA`) está nombrado en él.
  También revisa que `datos_clan.json` no lleve apodos ni IDs (el repositorio es público) y que la 404 solo enlace fuera de la web a la invitación de Discord.
- `prueba_comprobar.py` prueba que se paren un script de más que guarde algo en el navegador, un ID o un apodo en
  `fichas_dinos.json`, una mutación sin traducir y una foto de la tira de la portada que no está en la galería.
- `prueba_caceria.js` revisa la cuenta atrás, incluidos los cambios de hora.
- `prueba_pages.py` revisa lo que publica GitHub Pages: solo los vídeos y un aviso noindex por página que lleva a la
  misma página en Cloudflare, y que su 404 nunca mande a otra web.
- `prueba_navegador.js` (opcional, necesita Playwright y axe-core y la web servida en local) abre las 18
  páginas en un navegador real: todo visible con y sin JavaScript, sin errores, ningún texto
  cortado en móviles estrechos, la cabecera sin solapes y el menú entero en una fila desde 1020 px
  o, por debajo, tras su botón; de 320 a 1440 px (cada 5) y a 1920 px, la página nunca más ancha
  que la pantalla y la marca de la cabecera en la misma vertical que los títulos de las secciones.
  En el móvil abre el menú, lo cierra con Escape y con la X y recorre todas las páginas desde él;
  prueba los enlaces viejos de la portada, usa el visor de la galería con ratón y con el dedo (enlace directo a una foto, pie, «Atrás», deslizar y pellizcar), que las fotos a lo ancho no se recorten,
  comprueba que la escalera de rangos sube en títulos y líneas, que el ambiente se para en reposo, que el modo ligero se enciende sin aceleración gráfica o al dejar de dar imágenes
  (y con el menú o el visor encima), que el botón de volver arriba sale al subir, lleva arriba y
  no tapa el pie y
  comprueba que, si las fuentes llegan tarde, la página no da saltos y que, si llegan a tiempo, se
  pintan las fuentes propias. En El clan, que el móvil reproduce el vídeo ligero y el escritorio el
  normal. En la portada, que un móvil bajo ve el botón principal sin bajar y que, en ancho, la guía y la Cacería van lado a lado. Accesibilidad: el texto sobre fotos (portada, cabeceras, baldosas) con contraste suficiente
  medido sobre la foto real, nada que se pulse por debajo de 24 px y los iconos del menú y de las
  preguntas visibles en el alto contraste de Windows. Procesador en el móvil: las ascuas no piden más
  de 30 fotogramas por segundo y ninguna animación en marcha repinta sombras, fondos o filtros (en
  táctil el latido del botón es un anillo que solo se escala y se apaga). Efectos que, rotos, no dan ningún
  error (`SOLO=efectos` prueba solo estos): el menú del móvil sigue maquetado mientras se funde al cerrar, la
  bruma se para fuera de pantalla y en reposo y no existe con «reducir movimiento», los arañazos de los títulos
  acaban enteros, ninguna foto se queda invisible aunque falle al cargar, el botón de los vídeos va en su idioma
  y se aparta al reproducir, las filas de la comparativa viajan, salvo con «reducir movimiento», y todo lo
  ligado al scroll depende de la página y avanza al bajar y vuelve al subir: un `overflow: hidden` en la caja
  de fuera lo dejaría clavado sin ningún aviso (usad `overflow: clip`).
  Ventanas grandes (`SOLO=ventana` prueba solo esto), de 390 a 3440 px en las páginas de ambos idiomas: sin
  desbordes, de media 90 letras por línea como mucho, ninguna foto borrosa ni más alta que la ventana, secciones
  que usan el ancho, galería en filas sin recortar, y un barrido de 1300 a 3600 px sin saltos bruscos; hasta
  1440 px, letra y ancho no se mueven. La letra y el ancho salen de `html` y `--ancho` en `estilos.css`.
  Scroll con ratón (`SOLO=scroll` prueba solo esto): mientras se desplaza, lo que pasa bajo el ratón quieto no
  se enciende ni se apaga; al parar, al moverlo o con un botón pulsado responde como siempre.
  Fotos en móviles de alta densidad (`SOLO=fotos` prueba solo esto): las cabeceras interiores en un móvil 3x bajan su variante más pequeña, salvo la de la galería, que baja el mismo fichero que ya usa la galería (más nítido y sin descarga de más); las fotos de la galería a lo ancho bajan la de 600 px en densidad 2 hasta 400 px, y no piden más de 1200 px; ninguna se
  amplía más de 1,26× (las medias baldosas apaisadas, hasta 1,34×: se ve igual y pesan la mitad), las baldosas de la portada no salen borrosas a ningún ancho y la de la guía baja 600 px en el móvil.
  Cifras y podio de la portada, con su formato de miles y su redondeo (`SOLO=cifras` prueba solo esto).
  «Ver la lista» de las fichas (`SOLO=puesto` prueba solo esto): 44 px para el dedo, en una línea y sin pisar al de al lado.

  Al imprimir (`SOLO=imprimir` prueba solo esto): sin recorrer la página, cada texto y cada foto se ve, sin letra hueca, ambiente ni barra.

  Zarpazo saltado (`SOLO=transicion` prueba solo esto): se fuerza que la transición entre páginas se salte en la
  página que se deja y en la que llega, y ninguna da error («Transition was skipped» sin atender).

  Ruta de logros, recuadro «Ahora toca» (`SOLO=ahora` prueba solo esto), en los dos idiomas: enseña la sesión que toca
  con su dino, qué hacer y sus tareas; marcar en el recuadro marca en la lista y al revés; completar la sesión avanza
  y lo dice; Anterior, Siguiente, Ir a la actual, el índice «Toda la ruta» y el acceso de «Tu progreso» llevan donde
  dicen; sin scroll de lado a 360 px, sin fallos de axe, y sin JavaScript no aparece y la ruta se lee entera.

GitHub Actions (`.github/workflows/comprobar.yml`) ejecuta todas estas comprobaciones en cada push y pull request.

Las cifras de la portada y las batallas no se montan a mano: `herramientas/publicar_datos.py` las trae del proyecto del
Discord, monta en una copia temporal de lo último de GitHub, pasa `comprobar.py` y sube. Lo lanza la tarea nocturna del
ranking al acabar. Cada dato se revisa por su cuenta: unas cifras que caen más de un 20 % o son más viejas que las de la web, o
unas batallas mal escritas, se quedan fuera sin frenar al otro dato, y la tarea acaba en error diciendo por qué. Si cambia algún
fichero que no sea de esos datos o falla una comprobación, no sube nada. `--vista` hace todo menos subir. El vigilante del Discord
avisa en #mando si la portada no coincide con `ranking/cifras.json` o estas comprobaciones salen en rojo.
`python herramientas/prueba_publicar.py` lo prueba con git de verdad sobre un repositorio de mentira.
Los apodos los recibe de un secreto del repositorio, `VIGILAR_APODOS`, que se crea una vez con
`gh secret set VIGILAR_APODOS < herramientas/vigilar.local.txt`. Cloudflare publica aunque falle: si
sale en rojo, se arregla y se vuelve a subir.

## Cambiar la dirección

Si cambia la dirección de la web (también hay que cambiarla en `servicio/wrangler.toml` y volver a publicar el servicio):

```
python herramientas/cambiar_dominio.py https://NUEVA-DIRECCION/
python herramientas/calendario.py
python herramientas/montar_web.py
```

Con un dominio propio (`https://dominio.es/`) es igual, y además hay que añadirlo en Cloudflare
(Workers → clan → Settings → Domains & Routes). No se pone en GitHub Pages, que solo sirve los vídeos.

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
guía, la lista de especies. La página de la Cacería lista en el mapa del sitio su cartel, cada idioma el suyo.
`comprobar.py` falla si algo de eso no coincide con lo que se ve.

Las fotos de la galería salen de capturas del juego a 3439x1439 (los originales no se tocan):

```
python herramientas/preparar_galeria.py RUTA/A/LAS/CAPTURAS
```

Las capturas miden 3439 de ancho y 1439 de alto; una más baja se apunta en `ALTO` con su alto real, y
ningún recorte puede salirse de él (`python herramientas/prueba_galeria.py` lo prueba). Una imagen propia
que no es captura va en `PROPIAS` con sus medidas: su original sale de la `carpeta` de su entrada en
`galeria/fotos.json` y ningún tamaño pasa de su ancho original.
Saca de cada una la foto de la galería (encuadrada en el dinosaurio, la mejor calidad que cabe en
su tope: 60 KB a 600 px, 78 KB a 1000 y 1200 px y 115 KB en los demás tamaños, `comprobar.py` lo vigila) y la versión ampliada (la captura entera menos la franja de la marca de agua, hasta la
resolución original), todo en WebP de varios tamaños (`docs/img/galeria-*.webp`). Qué captura y
qué recorte va en cada foto está al principio del script. Las de noche que salen casi negras se aclaran
en el mismo script (`ACLARAR`). Si una captura lleva chat con nombres de otros jugadores, interfaz o
avisos, su ampliada es el mismo recorte de la galería (`AMPLIADA_PROPIA`), nunca la captura entera;
`comprobar.py` falla si alguna foto o ampliada no mide lo que da su recorte, si su texto no es el de `galeria/fotos.json` del proyecto del Discord (variable `GARRA_FOTOS`) o si cambia su enlace: cada foto se abre directa con `galeria/#foto-<nombre>` y esos enlaces circulan. Las ampliadas solo se descargan al abrir
una foto en el visor; `comprobar.py` no deja que la página las cargue por su cuenta.

Necesita Python con Pillow y fontTools.

## Buscadores

`robots.txt` indica el mapa del sitio (`sitemap.xml`). Para seguir la web en Google Search Console y en Bing Webmaster Tools
hay que dar de alta la dirección nueva y enviar allí el mapa.

`comprobar.py` vigila lo que depende de nosotros: títulos de 60 caracteres como mucho (Google corta el
resto, y al final va el nombre del clan), descripciones de 70 a 155, encabezados sin números pegados ni
enlaces dentro y, en el texto que se lee, las palabras con las que se busca un clan (`BUSQUEDAS`). Cada
vídeo de batalla nuevo necesita su fecha de publicación en `batallas_web.VIDEOS_PUBLICADOS`.

La Cacería no lleva marcado `Event`: se probó y se retiró (commit 3984c39), porque Google excluye los eventos sin parte física.

Después de publicar un cambio de contenido, `python herramientas/indexnow.py` avisa a Bing (y a
DuckDuckGo, Yahoo, Ecosia, Yandex y demás buscadores de IndexNow) para que vuelvan a pasar. Usa la
clave pública `docs/<clave>.txt`; no se borra ni se renombra. Google no usa IndexNow.

Las fuentes Anton y Barlow Condensed se distribuyen con su licencia OFL (`docs/fonts/LICENCIA-OFL.txt`).
