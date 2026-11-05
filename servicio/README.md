# Servicio de cuentas de la web

Permite que un miembro del clan entre en la ruta de logros con Discord y vea su progreso en cualquier dispositivo.
Corre en Cloudflare Workers con una base D1. Aquí no hay ningún secreto: el repositorio es público y los secretos van
en Cloudflare. La web solo publica `docs/`, así que este código no se sirve en ella.

Mientras `herramientas/cuentas.json` tenga `servicio` vacío, la página funciona solo en el navegador de cada uno y lo dice.

## Ponerlo en marcha

Se hace una vez. Los comandos se ejecutan dentro de `servicio/`, con Node 22 o superior.

Estado el 5 de noviembre de 2026: hechos los pasos 1 a 8, con el servicio en `https://garra-cuentas.garra-iberica.workers.dev`
(la aplicación de Discord existe y los tres secretos están puestos en Cloudflare). **Faltan** la migración `0002`, publicar
el servicio de este repositorio y el paso 9. Lo publicado ahora es una versión anterior: no conoce los ids de logro de
esta versión y rechazaría lo que la web nueva le mande. Por eso el paso 9 se hace en el orden de «Encender las cuentas»,
no a la letra: **seguirlo tal cual desde el paso 5 saltaría la `0002` y el `deploy`**.

1. Crea una cuenta en <https://dash.cloudflare.com/sign-up>.
2. Instala y entra: `npm ci`, y `npx wrangler login` (abre el navegador).
3. Crea la base **en la Unión Europea**. Esto solo se puede elegir ahora:
   `npx wrangler d1 create garra-cuentas --jurisdiction=eu`
4. Copia el `database_id` que imprime y pégalo en `wrangler.toml`, en lugar de los ceros.
5. Crea las tablas: `npx wrangler d1 migrations apply garra-cuentas --remote`
6. Publica por primera vez: `npx wrangler deploy`. Imprime la dirección del servicio, algo como
   `https://garra-cuentas.TU-CUENTA.workers.dev`.
7. Crea la aplicación en <https://discord.com/developers/applications> («New Application»). En **OAuth2**:
   - en **Redirects**, añade `https://garra-cuentas.TU-CUENTA.workers.dev/auth/discord/callback`;
   - copia el **Client ID** y, con «Reset Secret», el **Client Secret**.
   No hace falta bot ni invitarla al servidor.
8. Pega los secretos en Cloudflare. Cada comando te pide el valor; no lo escribas en ningún fichero:
   - `npx wrangler secret put DISCORD_CLIENT_ID`
   - `npx wrangler secret put DISCORD_CLIENT_SECRET`
   - `npx wrangler secret put ADMIN_IDS`: los identificadores de Discord de quien puede descargar la copia de seguridad,
     separados por comas. Sin él, nadie puede.
9. Encender las cuentas, como se explica justo debajo.

## Encender las cuentas

En este orden, y **el servicio primero, la web después**. Cada paso, dentro de `servicio/` salvo el último.

1. `npx wrangler d1 migrations apply garra-cuentas --remote`: aplica lo que falte (hoy, `0002`, un índice) y no toca los
   datos. Comprueba con `npx wrangler d1 migrations list garra-cuentas --remote`: no debe quedar nada pendiente.
2. `npx wrangler deploy`: publica el servicio de este repositorio.
3. Comprueba el servicio solo, con la web aún sin cuentas: `curl https://garra-cuentas.garra-iberica.workers.dev/salud`
   debe devolver `{"ok":true}`.
4. En `herramientas/cuentas.json`, pon esa dirección en `servicio`, sin barra final. Desde la raíz:
   `python herramientas/montar_web.py`, `python herramientas/comprobar.py` y sube los cambios.
5. Haz la prueba de humo de abajo.

### Prueba de humo

Con la web ya publicada con cuentas, en una ventana privada y con `npx wrangler tail` abierto en otra terminal
(no debe salir ningún error):

1. La ruta de logros (`/ruta/`) enseña «Entrar con Discord» y la consola del navegador no muestra errores de seguridad.
2. Entra con tu cuenta de Discord: vuelves a la ruta con tu nombre, sin código en la dirección.
3. Marca un logro, recarga y comprueba que sigue marcado. Ábrela en otro navegador, entra y comprueba que también está.
4. «Descargar mis datos» baja un fichero con tu nombre y ese logro.
5. «Salir» te deja sin sesión, y «Entrar con Discord» te lleva otra vez a Discord.
6. En la base: `npx wrangler d1 execute garra-cuentas --remote --command "SELECT COUNT(*) AS miembros FROM miembros"`
   cuenta uno más. Si no quieres conservar la prueba, bórrala con «Borrar mis datos».
7. Si algo falla y hay que dar marcha atrás en la web, ve a «Apagar las cuentas».

## Apagar las cuentas

Vaciar `servicio` en `cuentas.json` **no borra nada de la base**, y a la vez hace que el aviso legal diga que no hay cuentas.
Si se hace con miembros dentro, el aviso mentiría sobre datos que siguen guardados. Se hace así, en este orden y **la web
primero, el servicio después**:

1. Avisa en el Discord con fecha. Quien quiera sus datos puede bajarlos con «Descargar mis datos» mientras la web aún los ofrece.
2. Descarga una copia de seguridad (arriba) si quieres conservarla, y guárdala fuera del repositorio.
3. Si no se van a conservar los datos, bórralos todos y comprueba que no queda nada:
   `npx wrangler d1 execute garra-cuentas --remote --command "DELETE FROM miembros"` y luego
   `npx wrangler d1 execute garra-cuentas --remote --command "SELECT COUNT(*) AS n FROM miembros"` (debe dar 0). Las
   sesiones, los códigos de entrada y los logros caen en cascada con cada miembro.
   Si se conservan, **no se apaga**: no hay forma honesta de dejar datos guardados con un aviso que dice que no existen.
   Deja las cuentas encendidas.
4. Solo con la base en 0: `servicio` vacío en `herramientas/cuentas.json`, `python herramientas/montar_web.py`,
   `python herramientas/comprobar.py` y sube los cambios.
5. Después, y solo después, `npx wrangler delete` dentro de `servicio/` (quita el servicio publicado) y, si quieres, borra
   la aplicación de Discord y los secretos.

Con la web ya sin servicio, quien tenía una sesión guardada en su navegador no ve nada raro: la página dice que las cuentas
no están disponibles, conserva sus marcas en ese navegador y no habla con ningún servicio. Si las cuentas vuelven sin
haber borrado la base, esa sesión (si no ha caducado) y lo que quedó pendiente de subir siguen donde estaban.

## Copia de seguridad y vuelta atrás

- **Descargarla:** entra en la ruta de logros con una cuenta de `ADMIN_IDS` y pulsa «Copia de seguridad del clan». Lleva
  datos personales: guárdala en lugar seguro y sustituye las viejas.
- **Cargarla:** `node scripts/restaurar.mjs COPIA.json > restaurar.sql` y
  `npx wrangler d1 execute garra-cuentas --remote --file=restaurar.sql`. Las sesiones no se copian: cada uno vuelve a entrar.
  Solo añade lo que falte: lo que ya esté en la base se queda como está, y se salta a quien esté en
  `borrados.local.txt`. Lo que alguien borró con el botón de la web después de hacer esa copia sí vuelve con ella: no queda
  rastro de esos borrados. Al cargar una copia, avísalo en el Discord con su fecha para que quien borró lo suyo después
  pueda volver a borrarlo.
- **Con muchísimos datos:** la copia desde la página espera al límite de peticiones (unas 120.000 filas por minuto) y carga
  todo en el navegador, así que deja de servir hacia el millón de filas. Entonces, `npx wrangler d1 export garra-cuentas --remote --output=copia.sql`.
- **Un error de los últimos días:** D1 guarda 7 días de vuelta atrás (30 en el plan de pago),
  `npx wrangler d1 time-travel restore garra-cuentas --timestamp=FECHA`. Luego, `node scripts/miembro.mjs reborrar`
  y el mismo aviso en el Discord.

## Datos de un miembro a petición

Quien deja el clan no puede entrar, así que no tiene los botones de la página: lo pide por mensaje privado de Discord desde
su cuenta (el aviso legal da ese camino). Eso mismo lo identifica: se atiende solo a la cuenta que escribe, nunca a otra,
y en un mes como máximo. Su identificador se copia de su perfil de Discord (modo desarrollador → «Copiar ID»).

- **Enviarle sus datos:** `node scripts/miembro.mjs exportar ID > datos.json`, y se le pasa ese fichero. Bórralo después.
- **Borrarlos:** `node scripts/miembro.mjs borrar ID`. Lo anota en `borrados.local.txt`, un fichero que no se sube nunca:
  guárdalo con las copias de seguridad. Sin él, una copia antigua lo devolvería al restaurarla.

Las copias de seguridad que ya tengas no se tocan: se sustituyen por nuevas, y `restaurar.mjs` se salta a los anotados.

## Límites

Con el plan gratuito, al pasar un límite el servicio da error hasta el día siguiente y **no se cobra nada**. La página
sigue funcionando, dice que no hay conexión y guarda lo marcado para subirlo después. La medida está en
[MEDIDAS.md](MEDIDAS.md).

## Cambiar la lista de logros

La lista es `herramientas/logros.json`, para la página y para el servicio. Al cambiarla, **primero** se publica el servicio
(`npx wrangler deploy`) y **después** se sube la web: al revés, el servicio rechazaría lo nuevo. La página no pierde esas
marcas (las guarda, lo dice y las sube cuando el servicio las acepte), pero nadie las vería en otro dispositivo hasta
entonces. Quitar un logro no borra lo guardado; solo deja de enseñarse.

Cada logro se identifica por especie y tipo (`allo-h-H`, `fed-rex`), no por su posición: reordenar la lista no cambia
ningún id. Los ids y sus tramos están congelados en `herramientas/logros_congelados.json` y una prueba falla con cualquier
cambio (logro quitado, tramos recortados o logro nuevo), para que alguien decida qué pasa con lo ya guardado: renombrar
(se añade a `ids_antiguos` de `logros.json` y la página traduce lo que traiga un navegador o un código GR1), o recortar o
retirar (lo guardado se queda de más y no cuenta, o se borra a mano). Solo entonces se actualiza la lista congelada.
`ids_antiguos` recoge cómo se llamaban antes (por posición) los 46 logros de caza y de muerte, y no se edita.

## Cambiar de dirección de la web

`wrangler.toml` guarda las direcciones de la página (`PAGINA_ES`, `PAGINA_EN`): si no coinciden, `comprobar.py` falla.
Cámbialas, y vuelve a publicar el servicio.

## Pruebas

- `npm test`: el servicio, ataques incluidos, en el mismo motor que Cloudflare y con un Discord simulado.
- `npm run recorrido`: la página en un navegador contra lo anterior. Necesita Playwright en la raíz del repositorio.
- `npm run mutaciones` y `npm run mutaciones:pagina`: quitan cada guarda y exigen que alguna prueba falle.
- `npm run medir`: el rendimiento con mil veces más datos.

Probarlo a mano en local: copia `.dev.vars.ejemplo` a `.dev.vars`, `npx wrangler d1 migrations apply garra-cuentas --local`
y `npx wrangler dev`.

Para ver lo que pasa en producción: `npx wrangler tail`, en directo. Cloudflare no guarda registros de cada petición porque están apagados en `wrangler.toml`; los mensajes de error del servicio no llevan datos de nadie.
