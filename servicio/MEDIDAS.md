# Con mil veces más datos

Hoy el clan son unos 13 jugadores. Medido el 5 de noviembre de 2026 con `npm run medir`: 13.000 miembros con los 535 tramos
marcados, el peor caso posible (6.955.000 filas), en local con el motor de Cloudflare. Dos ejecuciones de tres pasadas de 50
peticiones cada una; se da el rango entre todas.

| Petición | Mediana | Peor 5 % |
| --- | --- | --- |
| Abrir la página con sesión (`GET /yo`, 535 filas) | 4,8–6,4 ms | 5,7–8,3 ms |
| Guardar 50 logros (`PUT /yo/progreso`) | 8,8–11,0 ms | 10,2–14,1 ms |
| Una sesión inventada (`GET /yo`) | 2,5–3,3 ms | 2,9–6,3 ms |
| Una página de la copia, a mitad de tabla (1000 filas) | 5,8–8,3 ms | 7,4–9,9 ms |

Tamaño de la base: 310 MB. Ninguna petición recorre la tabla entera: todas van por la clave de cada miembro.

Es tiempo en este ordenador. Publicado se suma la red, y **no mide los 10 ms de procesador por petición del plan gratuito**:
eso solo se ve publicado (`npx wrangler tail`, error 1102).

## Qué límite se alcanza primero

Con el [plan gratuito](https://developers.cloudflare.com/d1/platform/pricing/), a esa escala:

1. **5 millones de filas leídas al día: el primero.** Abrir la página cuenta unas 537 filas a quien lo tiene todo marcado:
   unas 9.300 aperturas al día. Hoy, 13 personas abriendo la página 3 veces al día son unas 21.000 filas: el 0,4 %.
2. **[100.000 peticiones al día](https://developers.cloudflare.com/workers/platform/limits/).** Unas 8 por miembro y día a esa
   escala, contando las de permiso previo del navegador.
3. **100.000 filas escritas al día.** Unos 8 tramos marcados por miembro y día.
4. **[500 MB por base](https://developers.cloudflare.com/d1/platform/limits/).** A 310 MB por 13.000 miembros completos, unos
   21.000 miembros completos.

La copia del administrador lee todas las filas: 7 millones superan el límite diario de lectura, así que a esa escala no cabe en
el plan gratuito; hay que partirla en dos días, o pasar al de pago.

Al pasar un límite del plan gratuito el servicio da error hasta las 00:00 UTC y no se cobra nada. La página sigue, dice que no
hay conexión y sube lo marcado cuando vuelve. El [plan de pago](https://developers.cloudflare.com/workers/platform/pricing/), 5 $
al mes, lo sube a 25.000 millones de filas leídas y 50 millones escritas al mes, 10 millones de peticiones y 10 GB por base.
