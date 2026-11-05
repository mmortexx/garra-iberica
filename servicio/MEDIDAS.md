# Con mil veces más datos

Hoy el clan son unos 13 jugadores. Medido el 5 de noviembre de 2026 con `npm run medir`: 13.000 miembros con los 535 tramos
marcados, el peor caso posible (6.955.000 filas), en local con el motor de Cloudflare. Dos ejecuciones de tres pasadas de 50
peticiones cada una (seis pasadas); se da el rango entre todas. Se midió con otro programa pesado abierto en el ordenador: una
tercera ejecución se descartó por tener picos de hasta 79 ms, y entre las dos buenas el rango llega a 1,5 veces. Sirve para el
orden de magnitud (unos 10 ms por petición), **no para comparar 1 ms arriba o abajo con otra medición**.

| Petición | Mediana | Peor 5 % |
| --- | --- | --- |
| Abrir la página con sesión (`GET /yo`, 535 filas) | 7,5–9,8 ms | 8,9–11,2 ms |
| Guardar 50 logros (`PUT /yo/progreso`) | 6,6–10,1 ms | 7,8–11,7 ms |
| Marcar un solo tramo teniéndolos todos (`PUT /yo/progreso`) | 8,5–10,3 ms | 10,2–23,4 ms |
| Una sesión inventada (`GET /yo`) | 3,9–5,3 ms | 5,2–7,0 ms |
| Volver de Discord (`GET /auth/discord/callback`) | 7,3–9,1 ms | 9,2–12,3 ms |
| Canjear el código de entrada (`POST /sesion`) | 7,0–8,2 ms | 9,3–17,4 ms |
| Una página de la copia, a mitad de tabla (1000 filas) | 8,3–9,5 ms | 10,4–13,4 ms |

Tamaño de la base: 310 MB. Ninguna petición recorre una tabla entera: todas van por la clave o un índice de cada miembro
(la prueba «limpiar los códigos de un miembro no recorre la tabla» lo vigila donde faltaba).

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
