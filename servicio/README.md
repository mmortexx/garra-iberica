# Servicio de cuentas de la web

Permite que un miembro del clan entre en la ruta de logros con Discord y vea su progreso en cualquier dispositivo.
Corre en Cloudflare Workers con una base D1. Aquí no hay ningún secreto: el repositorio es público y los secretos van
en Cloudflare. La web solo publica `docs/`, así que este código no se sirve en ella.

Mientras `herramientas/cuentas.json` tenga `servicio` vacío, la página funciona solo en el navegador de cada uno y lo dice.

## Ponerlo en marcha

Se hace una vez. Los comandos se ejecutan dentro de `servicio/`, con Node 22 o superior.

Hechos el 5 de noviembre de 2026: pasos 1 a 6, con el servicio en `https://garra-cuentas.garra-cuentas.workers.dev`. Faltan los pasos 7 a 9.

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
9. En `herramientas/cuentas.json`, pon la dirección del paso 6 en `servicio`, sin barra final. Después, desde la raíz:
   `python herramientas/montar_web.py`, `python herramientas/comprobar.py` y sube los cambios.

## Copia de seguridad y vuelta atrás

- **Descargarla:** entra en la ruta de logros con una cuenta de `ADMIN_IDS` y pulsa «Copia de seguridad del clan». Lleva
  datos personales: guárdala en lugar seguro y sustituye las viejas.
- **Cargarla:** `node scripts/restaurar.mjs COPIA.json > restaurar.sql` y
  `npx wrangler d1 execute garra-cuentas --remote --file=restaurar.sql`. Las sesiones no se copian: cada uno vuelve a entrar.
  Solo añade lo que falte: lo que ya esté en la base se queda como está. Lo que alguien haya borrado después de hacer esa
  copia vuelve con ella: hay que volver a borrarlo.
- **Con muchísimos datos:** la copia desde la página espera al límite de peticiones (unas 120.000 filas por minuto) y carga
  todo en el navegador, así que deja de servir hacia el millón de filas. Entonces, `npx wrangler d1 export garra-cuentas --remote --output=copia.sql`.
- **Un error de los últimos días:** D1 guarda 7 días de vuelta atrás (30 en el plan de pago),
  `npx wrangler d1 time-travel restore garra-cuentas --timestamp=FECHA`.

## Límites

Con el plan gratuito, al pasar un límite el servicio da error hasta el día siguiente y **no se cobra nada**. La página
sigue funcionando, dice que no hay conexión y guarda lo marcado para subirlo después. La medida está en
[MEDIDAS.md](MEDIDAS.md).

## Cambiar la lista de logros

La lista es `herramientas/logros.json`, para la página y para el servicio. Al cambiarla hay que montar la web **y** volver a
publicar el servicio (`npx wrangler deploy`). Quitar un logro no borra lo guardado; solo deja de enseñarse.

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
