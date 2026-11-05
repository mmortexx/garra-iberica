// La ruta de logros: marcar y recordar, en el navegador y, si entras con Discord, en tu cuenta.
// Lo marcado se escribe siempre primero aquí y luego se sube: si el servicio se cae, nada se pierde y la página lo dice.
// Los nombres que vienen del servicio solo se pintan con textContent.
(() => {
  'use strict';
  const raiz = document.querySelector('[data-miembro]');
  if (!raiz) return;
  // La web vive en otra dirección y efectos.js lleva allí: en la antigua no se lee ni se guarda nada ni se canjea ninguna entrada.
  if (location.hostname === 'mmortexx.github.io') return;
  const en = document.documentElement.lang === 'en';
  const SERVICIO = raiz.dataset.servicio || '';
  const MAXIMOS = new Map(Object.entries(JSON.parse(raiz.dataset.logros)));
  // Cómo se llamaban antes los logros que se identificaban por su posición: lo guardado o copiado de antes sigue valiendo.
  const ANTIGUOS = new Map(Object.entries(JSON.parse(raiz.dataset.antiguos || '{}')));
  const CLAVE = 'garra-ruta-v1';
  const CLAVE_ENTRADA = 'garra-ruta-entrada';
  const ESPERAS = [5000, 15000, 60000, 300000];

  const T = en ? {
    total: (a, b) => `${a} of ${b} achievement steps`,
    soloNavegador: 'Saved in this browser only.',
    nube: 'Saved to your account.',
    subiendo: n => `Saving… (${n})`,
    pendientes: n => `No connection to the service. Ticks waiting to upload: ${n}. They are safe in this browser and will upload on their own when it comes back.`,
    caido: 'The accounts service is not responding. The page still works: your ticks are saved in this browser.',
    sinServicio: 'Accounts are not available yet. Your ticks are saved in this browser only: copy your code from time to time.',
    caducada: n => `Your session has expired. Sign in again.${n ? ` Ticks waiting to upload: ${n}. They stay here until then.` : ''}`,
    sinAlmacen: 'This browser does not allow saving: your ticks will be lost when you close it. Copy your code first.',
    noEntrarSinAlmacen: 'This browser does not allow saving, and signing in needs it. Try another browser or leave private mode.',
    importar: n => `Ticks in this browser that are not in your account: ${n}.`,
    importadas: n => `Ticks added: ${n}.`,
    nadaQueTraer: 'That code adds nothing new: you already had all of it.',
    codigoMalo: 'That code is not valid. Copy the whole code and try again.',
    ignoradas: n => `Ticks in the code ignored because they are not in the achievements list: ${n}.`,
    rechazadas: n => `The service does not accept ${n} ticks from the new list yet. They stay in this browser and will upload once it does.`,
    copiado: 'Code copied.',
    copiaAMano: 'Your code is in the box: copy it by hand.',
    salirConPendientes: n => `Unsaved ticks: ${n}. Signing out loses them. Press again to sign out anyway.`,
    salido: 'Signed out. Your ticks stay in your account.',
    salidoTodos: 'Signed out on all your devices.',
    borrado: 'Your account and all your data have been deleted from the service.',
    falloBorrar: 'It could not be deleted now: nothing has changed. Try again in a while.',
    falloDescarga: 'It could not be downloaded now. Try again in a while.',
    falloCopia: 'The backup could not be completed: no file was created. Try again in a while.',
    copiaEnCurso: n => `Downloading the backup… ${n} rows`,
    copiaFrenada: n => `Downloading the backup… ${n} rows. Waiting a minute for the request limit: keep this page open.`,
    copiaHecha: (m, p) => `Backup downloaded: ${m} members, ${p} rows of progress. Keep it somewhere safe: it has personal data.`,
    coord: c => `Copied: ${c}. Paste it into the Nexus map`,
    nexus: {
      error: 'Error:',
      vacio: 'There is nothing to read: paste the list Nexus gives you.',
      grande: 'That is too much text to be your Nexus list, so it has not been read. Copy only that page.',
      pagina: 'That is not your achievements list: it looks like another page. Sign in to Nexus, open the link above and copy what comes up.',
      sesion: 'Nexus says you are not signed in. Sign in to Nexus, open the link above again and copy what comes up.',
      cortado: 'The list arrives cut off: the end is missing. Copy the whole page again, leaving nothing out.',
      roto: 'The list is damaged and cannot be read. Copy the whole page again, without changing anything.',
      firefox: 'Firefox only copied a summary. In the Nexus tab, open the second tab at the top (Raw Data), then copy the whole page again.',
      forma: 'This list does not have the shape we expect: Nexus may have changed. Nothing has been ticked. Let us know on the clan’s Discord.',
      servidor: 'This list is from another Nexus server, not Asura 1, and only Asura 1 counts here. Nothing has been ticked.',
      hecho: (n, y) => `Steps added: ${n}. You already had: ${y}.`,
      desconocidos: (n, nombres) => `Achievements in your list we do not know: ${n} (${nombres}). The rest have been ticked.`,
      noCasan: (n, nombres) => `Achievements whose steps differ from ours, not ticked: ${n} (${nombres}).`,
      faltan: n => `Achievements of ours missing from your list: ${n}.`,
      saltos: n => `In ${n} achievements Nexus counts a step as done without the ones before it: ticked only up to the gap.`,
    },
    errores: {
      no_miembro: 'Only members of the clan’s Discord server can sign in. If you just joined, finish the server’s checks first. Nothing about you has been saved.',
      cancelado: 'You cancelled on Discord. Nothing has changed.',
      caducado: 'That sign-in attempt expired. Please try again.',
      rechazado: 'Discord did not accept that sign-in. Please try again.',
      discord_caido: 'Discord is not responding. We could not check your membership: try again in a while.',
      no_disponible: 'The accounts service is not available right now. Your ticks stay in this browser.',
      demasiadas: 'Too many attempts. Wait a minute and try again.',
      peticion: 'Something went wrong starting the sign-in. Reload the page and try again.',
      canje: 'The sign-in could not be completed. Please try again.',
    },
  } : {
    total: (a, b) => `${a} de ${b} tramos de logros`,
    soloNavegador: 'Guardado solo en este navegador.',
    nube: 'Guardado en tu cuenta.',
    subiendo: n => `Guardando… (${n})`,
    pendientes: n => `Sin conexión con el servicio. Marcas pendientes de subir: ${n}. Están a salvo en este navegador y se subirán solas cuando vuelva.`,
    caido: 'El servicio de cuentas no responde. La página sigue funcionando: tus marcas se guardan en este navegador.',
    sinServicio: 'Las cuentas aún no están disponibles. Tus marcas se guardan solo en este navegador: copia tu código de vez en cuando.',
    caducada: n => `Tu sesión ha caducado. Entra otra vez.${n ? ` Marcas pendientes de subir: ${n}. Siguen aquí hasta entonces.` : ''}`,
    sinAlmacen: 'Este navegador no deja guardar: tus marcas se perderán al cerrarlo. Copia antes tu código.',
    noEntrarSinAlmacen: 'Este navegador no deja guardar, y para entrar hace falta. Prueba con otro navegador o sal del modo privado.',
    importar: n => `Marcas en este navegador que no están en tu cuenta: ${n}.`,
    importadas: n => `Marcas añadidas: ${n}.`,
    nadaQueTraer: 'Ese código no añade nada nuevo: ya lo tenías todo.',
    codigoMalo: 'Ese código no vale. Copia el código entero y prueba otra vez.',
    ignoradas: n => `Marcas del código ignoradas porque no están en la lista de logros: ${n}.`,
    rechazadas: n => `El servicio aún no acepta ${n} marcas de la lista nueva. Siguen en este navegador y se subirán cuando las acepte.`,
    copiado: 'Código copiado.',
    copiaAMano: 'Tu código está en el recuadro: cópialo a mano.',
    salirConPendientes: n => `Marcas sin guardar: ${n}. Si sales, se pierden. Pulsa otra vez para salir igualmente.`,
    salido: 'Has salido. Tus marcas siguen en tu cuenta.',
    salidoTodos: 'Has salido en todos tus dispositivos.',
    borrado: 'Tu cuenta y todos tus datos se han borrado del servicio.',
    falloBorrar: 'No se ha podido borrar ahora: no ha cambiado nada. Prueba otra vez dentro de un rato.',
    falloDescarga: 'No se ha podido descargar ahora. Prueba otra vez dentro de un rato.',
    falloCopia: 'La copia no se ha completado: no se ha creado ningún fichero. Prueba otra vez dentro de un rato.',
    copiaEnCurso: n => `Descargando la copia… ${n} filas`,
    copiaFrenada: n => `Descargando la copia… ${n} filas. Esperando un minuto por el límite de peticiones: no cierres la página.`,
    copiaHecha: (m, p) => `Copia descargada: ${m} miembros, ${p} filas de progreso. Guárdala en lugar seguro: lleva datos personales.`,
    coord: c => `Copiado: ${c}. Pégalo en el mapa de Nexus`,
    nexus: {
      error: 'Error:',
      vacio: 'No hay nada que leer: pega la lista que te da Nexus.',
      grande: 'Eso es demasiado texto para ser tu lista de Nexus, y no se ha leído. Copia solo esa página.',
      pagina: 'Eso no es tu lista de logros: parece otra página. Entra en Nexus, abre el enlace de arriba y copia lo que salga.',
      sesion: 'Nexus dice que no has entrado. Entra en Nexus, abre otra vez el enlace de arriba y copia lo que salga.',
      cortado: 'La lista llega cortada: falta el final. Copia otra vez toda la página, sin dejarte nada.',
      roto: 'La lista está dañada y no se puede leer. Copia otra vez toda la página, sin cambiar nada.',
      firefox: 'Firefox solo ha copiado un resumen. En la pestaña de Nexus, abre la segunda pestaña de arriba (datos sin procesar, «Raw Data») y copia otra vez toda la página.',
      forma: 'Esta lista no tiene la forma que esperamos: puede que Nexus haya cambiado. No se ha marcado nada. Avísanos en el Discord del clan.',
      servidor: 'Esta lista es de otro servidor de Nexus, no de Asura 1, y aquí solo cuenta Asura 1. No se ha marcado nada.',
      hecho: (n, y) => `Tramos añadidos: ${n}. Ya tenías: ${y}.`,
      desconocidos: (n, nombres) => `Logros de tu lista que no conocemos: ${n} (${nombres}). El resto se ha marcado.`,
      noCasan: (n, nombres) => `Logros con tramos distintos a los nuestros, sin marcar: ${n} (${nombres}).`,
      faltan: n => `Logros nuestros que no venían en tu lista: ${n}.`,
      saltos: n => `En ${n} logros Nexus da por hecho un tramo sin los anteriores: se ha marcado solo hasta el hueco.`,
    },
    errores: {
      no_miembro: 'Solo pueden entrar los miembros del servidor de Discord del clan. Si acabas de unirte, termina antes las comprobaciones del servidor. No se ha guardado nada de ti.',
      cancelado: 'Has cancelado en Discord. No ha cambiado nada.',
      caducado: 'Ese intento de entrar ha caducado. Prueba otra vez.',
      rechazado: 'Discord no ha aceptado la entrada. Prueba otra vez.',
      discord_caido: 'Discord no responde. No hemos podido comprobar que seas miembro: prueba dentro de un rato.',
      no_disponible: 'El servicio de cuentas no está disponible ahora. Tus marcas siguen en este navegador.',
      demasiadas: 'Demasiados intentos. Espera un minuto y prueba otra vez.',
      peticion: 'Algo ha fallado al empezar a entrar. Recarga la página y prueba otra vez.',
      canje: 'No se ha podido completar la entrada. Prueba otra vez.',
    },
  };

  const $ = sel => raiz.querySelector(sel);
  const ver = (sel, visible) => { $(sel).hidden = !visible; };

  // ---------- lo guardado en este navegador ----------
  const vacio = () => ({ marcas: {}, subidas: {}, bajadas: {}, porImportar: {}, cuenta: null, nombre: '', token: null, tokenDe: null, caduca: 0 });
  let almacen = vacio();
  let hayAlmacen = true;
  function alNombreDeAhora(o) {
    const traducido = Object.create(null);
    for (const [k, v] of Object.entries(o)) {
      const nuevo = ANTIGUOS.get(k) ?? k;
      if (!Object.hasOwn(traducido, nuevo) || !(traducido[nuevo] >= v)) traducido[nuevo] = v;
    }
    return traducido;
  }
  const sano = o => {
    const fuera = {};
    if (!o || typeof o !== 'object' || Array.isArray(o)) return fuera;
    const propio = alNombreDeAhora(o);
    for (const [k, m] of MAXIMOS) {
      const v = Object.hasOwn(propio, k) ? propio[k] : undefined;
      if (Number.isInteger(v) && v >= 0 && v <= m) fuera[k] = v;
    }
    return fuera;
  };
  const sinCeros = o => Object.fromEntries(Object.entries(o).filter(([, v]) => v > 0));
  function leer() {
    try {
      const s = JSON.parse(localStorage.getItem(CLAVE) || 'null');
      if (s && typeof s === 'object') {
        almacen = {
          marcas: sinCeros(sano(s.marcas)), subidas: sano(s.subidas), bajadas: sano(s.bajadas), porImportar: sinCeros(sano(s.porImportar)),
          cuenta: typeof s.cuenta === 'string' ? s.cuenta : null,
          nombre: typeof s.nombre === 'string' ? s.nombre : '',
          token: typeof s.token === 'string' ? s.token : null,
          tokenDe: typeof s.tokenDe === 'string' ? s.tokenDe : null,
          caduca: Number(s.caduca) || 0,
        };
        if (almacen.token && almacen.caduca < Date.now()) almacen.token = null;
      } else almacen = vacio();
    } catch { hayAlmacen = false; }
  }
  function guardar() {
    try {
      localStorage.setItem(CLAVE, JSON.stringify(almacen));
      hayAlmacen = true;
    } catch { hayAlmacen = false; }
    pintarEstado();
  }
  // Si la lista de logros cambia, en la cuenta puede haber tramos de más: se guardan, pero no cuentan.
  const nivel = id => Math.min(almacen.marcas[id] || 0, MAXIMOS.get(id) || 0);
  // Lo que el servicio rechazó (suele ser un servicio más viejo que la página): se queda pendiente, pero no se reintenta en esta carga.
  const retenidas = new Set();
  const porSubir = () => new Set([...Object.keys(almacen.subidas), ...Object.keys(almacen.bajadas)].filter(k => !retenidas.has(k))).size;
  const sinSubir = () => new Set([...Object.keys(almacen.subidas), ...Object.keys(almacen.bajadas), ...Object.keys(almacen.porImportar)]).size;

  // ---------- pintar ----------
  const botones = new Map();
  const bloques = [];
  const sesiones = [];
  let servicioCaido = false;
  let caducada = false;
  let enVuelo = false;
  let cuenta = null;
  let historial = [];

  function prepararPagina() {
    document.querySelectorAll('button[data-logro]').forEach(b => {
      if (!botones.has(b.dataset.logro)) botones.set(b.dataset.logro, []);
      botones.get(b.dataset.logro).push(b);
      b.disabled = false;
    });
    document.querySelectorAll('button[data-copiar]').forEach(b => { b.disabled = false; });
    document.querySelectorAll('.ruta-grupo').forEach(d => bloques.push({ d, filas: [...d.querySelectorAll('[data-fila]')], contador: d.querySelector('[data-contador]') }));
    document.querySelectorAll('[data-sesion]').forEach(li => sesiones.push({
      li, d: li.querySelector('details'), contador: li.querySelector('[data-contador]'),
      tareas: [...li.querySelectorAll('button[data-logro]')].map(b => [b.dataset.logro, +b.dataset.nivel]),
    }));
    for (const s of ['[data-resumen]', '[data-nexus-caja]', '[data-codigo-caja]']) ver(s, true);
    document.querySelector('[data-filtros]').hidden = false;
  }

  const hecha = s => s.tareas.every(([id, n]) => nivel(id) >= n);
  let filtro = 'todos';
  let soloPendientes = false;

  function pintarMarcas() {
    let hechos = 0;
    let total = 0;
    for (const [id, lista] of botones) {
      const v = nivel(id);
      total += MAXIMOS.get(id);
      hechos += v;
      for (const b of lista) b.setAttribute('aria-pressed', String(v >= +b.dataset.nivel));
    }
    for (const b of bloques) {
      const suma = b.filas.reduce((a, f) => a + nivel(f.dataset.fila), 0);
      const tope = b.filas.reduce((a, f) => a + MAXIMOS.get(f.dataset.fila), 0);
      b.contador.textContent = `${suma}/${tope}`;
      b.completo = suma === tope;
      for (const f of b.filas) f.hidden = soloPendientes && nivel(f.dataset.fila) >= MAXIMOS.get(f.dataset.fila);
      b.d.hidden = (filtro !== 'todos' && b.d.dataset.grupo !== filtro) || (soloPendientes && b.completo);
    }
    const actual = sesiones.find(s => !hecha(s));
    for (const s of sesiones) {
      s.contador.textContent = `${s.tareas.filter(([id, n]) => nivel(id) >= n).length}/${s.tareas.length}`;
      s.li.classList.toggle('sesion-hecha', hecha(s));
      s.li.classList.toggle('sesion-actual', s === actual);
    }
    if (actual && actual !== pintarMarcas.abierta) {
      actual.d.open = true;
      pintarMarcas.abierta = actual;
    }
    $('[data-barra]').max = total;
    $('[data-barra]').value = hechos;
    $('[data-total]').textContent = T.total(hechos, total);
  }

  function pintarEstado() {
    const estado = $('[data-estado]');
    const n = porSubir();
    let texto;
    if (!hayAlmacen) texto = T.sinAlmacen;
    else if (!SERVICIO) texto = T.sinServicio;
    else if (caducada) texto = T.caducada(n);
    else if (almacen.token && servicioCaido) texto = n ? T.pendientes(n) : T.caido;
    else if (almacen.token && n) texto = T.subiendo(n);
    else if (almacen.token) texto = T.nube;
    else if (servicioCaido) texto = T.caido;
    else texto = T.soloNavegador;
    estado.textContent = texto;
    estado.hidden = false;
    estado.classList.toggle('ruta-estado-mal', !hayAlmacen || caducada || servicioCaido);
  }

  function aviso(texto) {
    const m = $('[data-mensaje]');
    m.textContent = texto || '';
    m.hidden = !texto;
  }

  function pintarCuenta() {
    // Sin servicio en la web no hay cuenta que enseñar, aunque quede una sesión guardada: se conserva para cuando vuelva.
    const dentro = Boolean(SERVICIO && almacen.token && cuenta);
    ver('[data-dentro]', dentro);
    ver('[data-fuera]', !dentro && Boolean(SERVICIO));
    if (dentro) {
      $('[data-nombre-miembro]').textContent = cuenta.nombre;
      ver('[data-copia]', cuenta.admin === true);
    }
    pintarEstado();
  }

  function pintarTrayectoria() {
    const lista = $('[data-trayectoria]');
    lista.replaceChildren();
    // El nombre de cada tramo sale de su botón: solo tienen botón los logros que la página enseña.
    const nombre = f => {
      const b = document.querySelector(`.ruta-grupos button[data-logro="${CSS.escape(f.logro)}"][data-nivel="${f.nivel}"]`);
      if (!b) return null;
      const de = b.closest('.ruta-grupo').dataset.nombre;
      return de ? `${de} · ${b.getAttribute('aria-label')}` : b.getAttribute('aria-label');
    };
    const conFecha = historial.filter(nombre).sort((a, b) => b.fecha.localeCompare(a.fecha) || b.nivel - a.nivel).slice(0, 10);
    const formato = new Intl.DateTimeFormat(en ? 'en-GB' : 'es-ES', { dateStyle: 'medium', timeZone: 'UTC' });
    for (const f of conFecha) {
      const li = document.createElement('li');
      const cuando = document.createElement('time');
      cuando.dateTime = f.fecha;
      cuando.textContent = formato.format(new Date(`${f.fecha}T00:00:00Z`));
      const que = document.createElement('span');
      que.textContent = nombre(f);
      li.append(cuando, que);
      lista.append(li);
    }
    ver('[data-trayectoria-caja]', conFecha.length > 0);
  }

  // ---------- hablar con el servicio ----------
  async function pedir(ruta, { metodo = 'GET', cuerpo } = {}) {
    const cabeceras = {};
    if (almacen.token) cabeceras.Authorization = `Bearer ${almacen.token}`;
    if (cuerpo !== undefined) cabeceras['Content-Type'] = 'application/json';
    return fetch(SERVICIO + ruta, {
      method: metodo, headers: cabeceras, referrerPolicy: 'no-referrer', credentials: 'omit', cache: 'no-store',
      ...(cuerpo !== undefined ? { body: JSON.stringify(cuerpo) } : {}),
    });
  }

  function alCaducar() {
    caducada = true;
    almacen.token = null;
    almacen.tokenDe = null;
    almacen.caduca = 0;
    cuenta = null;
    historial = [];
    ver('[data-trayectoria-caja]', false);
    guardar();
    pintarCuenta();
  }

  // Lo mismo que hace el servicio al guardar, para no volver a pedirle todo tras cada marca.
  function anotarHistorial(bajadas, subidas, rechazados) {
    const fuera = new Set(rechazados.map(r => r.logro));
    const fecha = new Date().toISOString().slice(0, 10);
    for (const [logro, n] of Object.entries(bajadas)) historial = historial.filter(f => f.logro !== logro || f.nivel <= n);
    for (const [logro, n] of Object.entries(subidas)) {
      if (fuera.has(logro)) continue;
      for (let i = 1; i <= n; i++) if (!historial.some(f => f.logro === logro && f.nivel === i)) historial.push({ logro, nivel: i, fecha });
    }
    pintarTrayectoria();
  }

  let acuses = 0;
  let temporizador = null;
  let intentos = 0;
  function programarSubida(espera = 600) {
    clearTimeout(temporizador);
    temporizador = setTimeout(subir, espera);
  }

  async function enviarLote(valores, modo) {
    const cambios = Object.entries(valores).map(([logro, n]) => ({ logro, nivel: n }));
    if (!cambios.length) return [];
    const r = await pedir('/yo/progreso', { metodo: 'PUT', cuerpo: { cambios, modo } });
    if (r.status === 401) throw Object.assign(new Error('sesión'), { caducada: true });
    if (!r.ok) throw new Error(String(r.status));
    return (await r.json()).rechazados || [];
  }

  // Lo que se baja a propósito y lo que sube van aparte: subir nunca pisa lo que otro dispositivo marcó de más.
  async function subir() {
    // Lo pendiente es de almacen.cuenta: no sale hasta saber que esta sesión es suya.
    if (enVuelo || !almacen.token || !SERVICIO || !porSubir() || almacen.tokenDe !== almacen.cuenta) return;
    enVuelo = true;
    const bajadas = { ...almacen.bajadas };
    const subidas = { ...almacen.subidas };
    try {
      const rechazados = [...await enviarLote(bajadas, 'fijar'), ...await enviarLote(subidas, 'subir')];
      const retener = new Set(rechazados.map(r => r.logro));
      for (const [k, v] of Object.entries(bajadas)) if (almacen.bajadas[k] === v && !retener.has(k)) delete almacen.bajadas[k];
      for (const [k, v] of Object.entries(subidas)) if (almacen.subidas[k] === v && !retener.has(k)) delete almacen.subidas[k];
      for (const k of retener) retenidas.add(k);
      acuses++;
      if (retener.size) aviso(T.rechazadas(retener.size));
      anotarHistorial(bajadas, subidas, rechazados);
      intentos = 0;
      servicioCaido = false;
      guardar();
    } catch (e) {
      if (e.caducada) alCaducar();
      else {
        servicioCaido = true;
        pintarEstado();
        programarSubida(ESPERAS[Math.min(intentos++, ESPERAS.length - 1)]);
      }
    } finally {
      enVuelo = false;
    }
    if (almacen.token && !servicioCaido && porSubir()) programarSubida();
  }

  // Subir nunca baja lo que otro dispositivo marcó de más; por eso, tras bajar algo, lo último que se marque ahí se fija.
  function apuntar(id, n) {
    const antes = nivel(id);
    if (n > 0) almacen.marcas[id] = n;
    else delete almacen.marcas[id];
    if (!almacen.cuenta) return;
    if (n < antes || Object.hasOwn(almacen.bajadas, id)) {
      almacen.bajadas[id] = n;
      delete almacen.subidas[id];
    } else almacen.subidas[id] = n;
  }

  function marcar(id, n) {
    if (n === nivel(id)) return;
    apuntar(id, n);
    guardar();
    pintarMarcas();
    if (almacen.token) programarSubida();
  }

  // Lo del servidor manda, salvo lo que aún no ha subido.
  function aplicarServidor(datos) {
    const marcas = {};
    for (const f of datos.progreso) marcas[f.logro] = Math.max(marcas[f.logro] || 0, f.nivel);
    for (const [k, v] of Object.entries(almacen.subidas)) marcas[k] = Math.max(marcas[k] || 0, v);
    for (const [k, v] of Object.entries(almacen.bajadas)) {
      if (v > 0) marcas[k] = v;
      else delete marcas[k];
    }
    almacen.marcas = marcas;
    almacen.nombre = datos.cuenta.nombre;
    cuenta = datos.cuenta;
    historial = datos.progreso;
    pintarTrayectoria();
  }

  let ultimaLectura = 0;
  async function refrescar() {
    if (!almacen.token || !SERVICIO) return;
    ultimaLectura = Date.now();
    const acusesAntes = acuses;
    try {
      const r = await pedir('/yo');
      if (r.status === 401) return alCaducar();
      if (!r.ok) throw new Error(String(r.status));
      const datos = await r.json();
      // Se ha guardado algo mientras venía esta respuesta: ya es vieja y borraría lo guardado de la pantalla.
      if (acusesAntes !== acuses) return refrescar();
      servicioCaido = false;
      caducada = false;
      // Otra cuenta en este navegador: lo que no había subido no se manda a esta sin preguntar.
      if (almacen.cuenta && almacen.cuenta !== datos.cuenta.discord_id) {
        ofrecerImportar({ ...almacen.subidas });
        almacen.subidas = {};
        almacen.bajadas = {};
      }
      // Lo marcado sin cuenta en este navegador: se pregunta qué hacer, nunca se pierde ni se sube a escondidas.
      // Aquí y no al entrar: si esta lectura falla, sigue sin cuenta y se pregunta en la siguiente.
      const anonimas = almacen.cuenta ? {} : { ...almacen.marcas };
      almacen.cuenta = datos.cuenta.discord_id;
      almacen.tokenDe = datos.cuenta.discord_id;
      aplicarServidor(datos);
      const nuevas = {};
      for (const [k, v] of Object.entries(anonimas)) if (v > nivel(k)) nuevas[k] = v;
      ofrecerImportar(nuevas);
      guardar();
      pintarMarcas();
      pintarCuenta();
      programarSubida(0);
    } catch {
      servicioCaido = true;
      // Sin respuesta la cuenta sigue, y la página funciona con lo guardado aquí.
      cuenta ??= { nombre: almacen.nombre || '…', admin: false };
      pintarCuenta();
      programarSubida(ESPERAS[Math.min(intentos++, ESPERAS.length - 1)]);
    }
    return undefined;
  }

  // ---------- entrar ----------
  const b64url = b => btoa(String.fromCharCode(...b)).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');

  async function entrar() {
    aviso('');
    // Si el servicio está caído, mejor decirlo aquí que dejar a nadie en una página de error del navegador.
    try {
      if (!(await fetch(`${SERVICIO}/salud`, { referrerPolicy: 'no-referrer', credentials: 'omit', cache: 'no-store' })).ok) throw new Error('salud');
    } catch {
      servicioCaido = true;
      pintarEstado();
      aviso(T.errores.no_disponible);
      return;
    }
    servicioCaido = false;
    const verificador = b64url(crypto.getRandomValues(new Uint8Array(32)));
    try {
      localStorage.setItem(CLAVE_ENTRADA, JSON.stringify({ verificador, caduca: Date.now() + 600000 }));
    } catch {
      aviso(T.noEntrarSinAlmacen);
      return;
    }
    const reto = b64url(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verificador))));
    location.assign(`${SERVICIO}/auth/discord?reto=${reto}&idioma=${en ? 'en' : 'es'}`);
  }

  // Se guarda con lo demás: cerrar la página sin contestar no las pierde.
  function pintarImportar() {
    const n = Object.keys(almacen.porImportar).length;
    $('[data-importar-texto]').textContent = T.importar(n);
    ver('[data-importar]', n > 0 && Boolean(almacen.token));
  }
  function ofrecerImportar(valores) {
    Object.assign(almacen.porImportar, sinCeros(sano(valores)));
    guardar();
    pintarImportar();
  }

  async function canjear(codigo) {
    let verificador = null;
    try {
      const e = JSON.parse(localStorage.getItem(CLAVE_ENTRADA) || 'null');
      localStorage.removeItem(CLAVE_ENTRADA);
      if (e && e.caduca > Date.now()) verificador = e.verificador;
    } catch { /* sin almacén no hay verificador */ }
    if (!verificador) return aviso(T.errores.canje);
    try {
      const r = await fetch(`${SERVICIO}/sesion`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, referrerPolicy: 'no-referrer', credentials: 'omit',
        body: JSON.stringify({ codigo, verificador }),
      });
      if (!r.ok) return aviso(T.errores[r.status === 429 ? 'demasiadas' : 'canje']);
      const { token, caduca } = await r.json();
      almacen.token = token;
      almacen.tokenDe = null;
      almacen.nombre = '';
      cuenta = null;
      almacen.caduca = caduca;
      caducada = false;
      guardar();
      await refrescar();
    } catch {
      aviso(T.errores.no_disponible);
    }
    return undefined;
  }

  function leerFragmento() {
    const f = new URLSearchParams(location.hash.slice(1));
    const codigo = f.get('entrada');
    const error = f.get('error');
    if (!codigo && !error) return null;
    history.replaceState(null, '', location.pathname + location.search);
    if (error) aviso(Object.hasOwn(T.errores, error) ? T.errores[error] : T.errores.canje);
    return codigo;
  }

  // ---------- código de la ruta ----------
  const codigoActual = () => `GR1.${btoa(JSON.stringify(almacen.marcas))}`;

  function traerCodigo() {
    const campo = $('[data-codigo]');
    const texto = campo.value.trim();
    let datos;
    try {
      if (!texto.startsWith('GR1.')) throw new Error('prefijo');
      datos = JSON.parse(atob(texto.slice(4)));
      if (!datos || typeof datos !== 'object' || Array.isArray(datos)) throw new Error('forma');
    } catch {
      aviso(T.codigoMalo);
      return;
    }
    const validas = sinCeros(sano(datos));
    const ignoradas = Object.keys(datos).length - Object.keys(validas).length;
    let nuevas = 0;
    for (const [k, v] of Object.entries(validas)) {
      if (v > nivel(k)) {
        apuntar(k, v);
        nuevas++;
      }
    }
    campo.value = '';
    guardar();
    pintarMarcas();
    if (almacen.token) programarSubida(0);
    aviso([nuevas ? T.importadas(nuevas) : T.nadaQueTraer, ignoradas ? T.ignoradas(ignoradas) : ''].filter(Boolean).join(' '));
  }

  // ---------- la lista de Nexus ----------
  // Lo pegado es de fuera y no se fía de nada: se mide antes de interpretarlo, solo se leen campos concretos y sus nombres
  // se pintan como texto. No sale de aquí: lo único que se guarda son las marcas, por el camino de siempre.
  const TOPE_NEXUS = 2000000;
  const SERVIDOR_NEXUS = 'Asura 1';

  // ¿Se queda abierta alguna llave, corchete o cadena? Entonces falta el final, no es que esté mal escrito.
  function sinCerrar(texto) {
    let abiertos = 0;
    let enCadena = false;
    for (let i = 0; i < texto.length; i++) {
      const c = texto[i];
      if (enCadena) {
        if (c === '\\') i++;
        else if (c === '"') enCadena = false;
      } else if (c === '"') enCadena = true;
      else if (c === '{' || c === '[') abiertos++;
      else if (c === '}' || c === ']') abiertos--;
    }
    return enCadena || abiertos > 0;
  }

  // { fallo } o { logros }. Por delante o por detrás del JSON puede venir algo más, según lo que el navegador copie.
  function leerNexus(pegado) {
    if (pegado.length > TOPE_NEXUS) return { fallo: 'grande' };
    const texto = pegado.trim();
    if (!texto) return { fallo: 'vacio' };
    // La vista de JSON de Firefox copia un resumen, no la lista.
    if (/(?:^|\n)snapshot_seconds\t/.test(texto.slice(0, 2000))) return { fallo: 'firefox' };
    const inicio = texto.indexOf('{');
    if (inicio < 0 || /<(?:html|!doctype|head|body)\b|^</i.test(texto.slice(0, 2000))) return { fallo: 'pagina' };
    const fin = texto.lastIndexOf('}');
    const json = fin > inicio ? texto.slice(inicio, fin + 1) : texto.slice(inicio);
    let datos;
    try {
      datos = JSON.parse(json);
    } catch {
      return { fallo: sinCerrar(json) ? 'cortado' : 'roto' };
    }
    if (typeof datos.error === 'string' && !Array.isArray(datos.achievements)) return { fallo: 'sesion' };
    if (typeof datos.server?.name !== 'string' || !Array.isArray(datos.achievements) || !datos.achievements.length) return { fallo: 'forma' };
    if (datos.server.name !== SERVIDOR_NEXUS) return { fallo: 'servidor' };
    return { logros: datos.achievements };
  }

  const pocosNombres = lista => lista.filter(n => typeof n === 'string').slice(0, 5).map(n => n.slice(0, 60)).join(', ');

  // { tramos: logro → [tramo hecho o no], vistos, desconocidos, noCasan }
  function casarNexus(logros, tabla, ocultas) {
    const tapar = ocultas.length ? new RegExp(`\\b(${ocultas.join('|')})[a-z]*`, 'g') : null;
    const claveNexus = (categoria, nombre) => {
      const clave = `${categoria}|${nombre}`;
      return tapar ? clave.replace(tapar, '$1') : clave;
    };
    const tramos = new Map();
    const vistos = new Set();
    const desconocidos = [];
    const noCasan = [];
    for (const l of logros) {
      const clave = typeof l?.category_path === 'string' && typeof l.name === 'string' ? claveNexus(l.category_path, l.name) : null;
      if (clave === null || !tabla.has(clave) || vistos.has(clave)) {
        desconocidos.push(l?.name);
        continue;
      }
      vistos.add(clave);
      const [id, desde, objetivos] = tabla.get(clave);
      const c = l.conditions;
      if (!Array.isArray(c) || c.length !== objetivos.length || !c.every((x, i) => x?.target === objetivos[i] && typeof x.done === 'boolean')) {
        noCasan.push(l.name);
        continue;
      }
      if (!tramos.has(id)) tramos.set(id, new Array(MAXIMOS.get(id)).fill(false));
      c.forEach((x, i) => { tramos.get(id)[desde + i] = x.done; });
    }
    return { tramos, vistos, desconocidos, noCasan };
  }

  function traerNexus(pegado) {
    const campo = $('[data-nexus-pegar]');
    // Un error se distingue sin depender del color: lleva su rótulo escrito y, para quien usa lector de pantalla, se anuncia al momento.
    const decir = (texto, mal = false) => {
      campo.value = '';
      const bien = $('[data-nexus-bien]');
      const error = $('[data-nexus-mal]');
      bien.textContent = mal ? '' : texto;
      bien.hidden = mal;
      error.replaceChildren();
      if (mal) {
        const rotulo = document.createElement('b');
        rotulo.textContent = T.nexus.error;
        error.append(rotulo, ' ', texto);
      }
      error.hidden = !mal;
    };
    const { fallo, logros } = leerNexus(pegado);
    if (fallo) return decir(T.nexus[fallo], true);
    const { ocultas, logros: entradas } = JSON.parse(raiz.dataset.nexus);
    const tabla = new Map(Object.entries(entradas));
    const { tramos, vistos, desconocidos, noCasan } = casarNexus(logros, tabla, ocultas);
    if (!tramos.size) return decir(T.nexus.forma, true);
    let nuevos = 0;
    let ya = 0;
    let saltos = 0;
    for (const [id, hechos] of tramos) {
      // Un tramo sin los anteriores no se da por hecho: la marca es «hasta aquí», y la ruta se saltaría lo que falta.
      const hueco = hechos.indexOf(false);
      const n = hueco < 0 ? hechos.length : hueco;
      if (hechos.lastIndexOf(true) > n) saltos++;
      const antes = nivel(id);
      // Lo oculto se guarda, pero no se cuenta: la barra de la página solo suma lo que enseña.
      if (botones.has(id)) {
        ya += Math.min(n, antes);
        nuevos += Math.max(n - antes, 0);
      }
      if (n > antes) apuntar(id, n);
    }
    const faltan = [...tabla].filter(([clave, [id]]) => !vistos.has(clave) && botones.has(id)).length;
    guardar();
    pintarMarcas();
    if (almacen.token) programarSubida(0);
    return decir([
      T.nexus.hecho(nuevos, ya),
      desconocidos.length ? T.nexus.desconocidos(desconocidos.length, pocosNombres(desconocidos)) : '',
      noCasan.length ? T.nexus.noCasan(noCasan.length, pocosNombres(noCasan)) : '',
      faltan ? T.nexus.faltan(faltan) : '',
      saltos ? T.nexus.saltos(saltos) : '',
    ].filter(Boolean).join(' '));
  }

  // Se coge del portapapeles sin que llegue a pintarse en el recuadro: una página entera ahí pesa, y más si es enorme.
  $('[data-nexus-pegar]').addEventListener('paste', e => {
    const pegado = e.clipboardData?.getData('text');
    if (typeof pegado !== 'string') return;
    e.preventDefault();
    traerNexus(pegado);
  });

  function alPortapapeles(texto, bien, mal) {
    try {
      navigator.clipboard.writeText(texto).then(bien, mal);
    } catch { mal(); }
  }

  function bajarFichero(nombre, contenido) {
    const url = URL.createObjectURL(new Blob([contenido], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = nombre;
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  }

  // ---------- acciones ----------
  async function descargarDatos() {
    aviso('');
    try {
      const r = await pedir('/yo/datos');
      if (r.status === 401) return alCaducar();
      if (!r.ok) throw new Error(String(r.status));
      bajarFichero('garra-iberica-mis-datos.json', await r.text());
    } catch {
      aviso(T.falloDescarga);
    }
    return undefined;
  }

  // true si hay algo que se perdería y aún no se ha avisado de esa cantidad: el segundo intento ya sale.
  let avisadoCon = 0;
  function frenarSalida() {
    const n = sinSubir();
    if (!n || avisadoCon === n) return false;
    avisadoCon = n;
    aviso(T.salirConPendientes(n));
    return true;
  }

  async function salir() {
    if (frenarSalida()) return;
    try { await pedir('/sesion', { metodo: 'DELETE' }); } catch { /* la clave local se borra igual; caduca sola */ }
    limpiarLocal();
    aviso(T.salido);
  }

  async function salirDeTodos() {
    if (frenarSalida()) return;
    try {
      const r = await pedir('/sesiones', { metodo: 'DELETE' });
      if (!r.ok && r.status !== 401) throw new Error(String(r.status));
      limpiarLocal();
      aviso(T.salidoTodos);
    } catch {
      aviso(T.errores.no_disponible);
    }
  }

  function limpiarLocal() {
    almacen = vacio();
    cuenta = null;
    caducada = false;
    historial = [];
    avisadoCon = 0;
    ver('[data-importar]', false);
    ver('[data-confirmar]', false);
    ver('[data-trayectoria-caja]', false);
    guardar();
    pintarMarcas();
    pintarCuenta();
  }

  async function borrarTodo() {
    try {
      const r = await pedir('/yo/borrar', { metodo: 'POST', cuerpo: { confirmar: 'BORRAR' } });
      if (r.status === 401) return alCaducar();
      if (!r.ok) throw new Error(String(r.status));
      limpiarLocal();
      aviso(T.borrado);
    } catch {
      ver('[data-confirmar]', false);
      aviso(T.falloBorrar);
    }
    return undefined;
  }

  async function copiaDelClan() {
    const b = $('[data-copia]');
    b.disabled = true;
    const copia = { formato: 'garra-copia-1', hecha: new Date().toISOString(), miembros: [], progreso: [] };
    try {
      for (const tabla of ['miembros', 'progreso']) {
        let desde = null;
        let frenazos = 0;
        for (;;) {
          const r = await pedir(`/admin/copia?tabla=${tabla}${desde ? `&desde=${encodeURIComponent(desde)}` : ''}`);
          if (r.status === 401) return alCaducar();
          // Una copia grande llega al límite de peticiones: se espera lo que pide y se sigue por donde iba.
          if (r.status === 429 && frenazos++ < 5) {
            aviso(T.copiaFrenada(copia.miembros.length + copia.progreso.length));
            await new Promise(hecho => { setTimeout(hecho, (Number(r.headers.get('Retry-After')) || 60) * 1000); });
            continue;
          }
          if (!r.ok) throw new Error(String(r.status));
          frenazos = 0;
          const pagina = await r.json();
          for (const fila of pagina.filas) copia[tabla].push(fila);
          desde = pagina.siguiente;
          aviso(T.copiaEnCurso(copia.miembros.length + copia.progreso.length));
          if (!desde) break;
        }
      }
      bajarFichero(`garra-iberica-copia-${copia.hecha.slice(0, 10)}.json`, JSON.stringify(copia));
      aviso(T.copiaHecha(copia.miembros.length, copia.progreso.length));
    } catch {
      aviso(T.falloCopia);
    } finally {
      b.disabled = false;
    }
    return undefined;
  }

  document.addEventListener('click', e => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.logro) {
      const n = +b.dataset.nivel;
      marcar(b.dataset.logro, nivel(b.dataset.logro) === n ? n - 1 : n);
    } else if (b.dataset.copiar) {
      const c = b.dataset.copiar;
      alPortapapeles(c, () => aviso(T.coord(c)), () => aviso(c));
    } else if (b.dataset.filtro) {
      filtro = b.dataset.filtro;
      document.querySelectorAll('[data-filtro]').forEach(x => x.setAttribute('aria-pressed', String(x === b)));
      pintarMarcas();
    } else if ('pendientes' in b.dataset) {
      soloPendientes = !soloPendientes;
      b.setAttribute('aria-pressed', String(soloPendientes));
      pintarMarcas();
    } else if ('entrar' in b.dataset) entrar();
    else if ('salir' in b.dataset) salir();
    else if ('salirTodos' in b.dataset) salirDeTodos();
    else if ('descargar' in b.dataset) descargarDatos();
    else if ('borrar' in b.dataset) ver('[data-confirmar]', true);
    else if ('borrarNo' in b.dataset) ver('[data-confirmar]', false);
    else if ('borrarSi' in b.dataset) borrarTodo();
    else if ('copia' in b.dataset) copiaDelClan();
    else if ('traer' in b.dataset) traerCodigo();
    else if ('nexusTraer' in b.dataset) traerNexus($('[data-nexus-pegar]').value);
    else if ('copiarCodigo' in b.dataset) {
      const c = codigoActual();
      const mal = () => {
        $('[data-codigo]').value = c;
        $('[data-codigo]').select();
        aviso(T.copiaAMano);
      };
      alPortapapeles(c, () => aviso(T.copiado), mal);
    } else if ('importarSi' in b.dataset) {
      const lista = Object.entries(almacen.porImportar);
      for (const [k, v] of lista) {
        if (v > nivel(k)) apuntar(k, v);
      }
      aviso(T.importadas(lista.length));
      almacen.porImportar = {};
      guardar();
      pintarImportar();
      pintarMarcas();
      programarSubida(0);
    } else if ('importarNo' in b.dataset) {
      almacen.porImportar = {};
      guardar();
      pintarImportar();
    }
  });

  // Otra pestaña ha guardado: sin esto, lo siguiente que se guardara aquí pisaría lo suyo.
  addEventListener('storage', e => {
    if (e.key !== CLAVE && e.key !== null) return;
    leer();
    if (!almacen.token) {
      cuenta = null;
      caducada = Boolean(almacen.cuenta);
    } else cuenta ??= { nombre: almacen.nombre || '…', admin: false };
    pintarMarcas();
    pintarCuenta();
    pintarImportar();
  });

  // Reintentar en cuanto vuelve la conexión, y ver lo marcado en otro dispositivo al volver a la página.
  addEventListener('online', () => { intentos = 0; programarSubida(0); });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && almacen.token && Date.now() - ultimaLectura > 60000) refrescar();
  });
  addEventListener('beforeunload', e => {
    if (!hayAlmacen && Object.keys(almacen.marcas).length) e.preventDefault();
  });

  // ---------- arrancar ----------
  leer();
  prepararPagina();
  caducada = Boolean(almacen.cuenta && !almacen.token);
  if (almacen.token) cuenta = { nombre: almacen.nombre || '…', admin: false };
  const codigoEntrada = leerFragmento();
  pintarMarcas();
  pintarCuenta();
  pintarImportar();
  if (!SERVICIO) return;
  if (codigoEntrada) canjear(codigoEntrada);
  else if (almacen.token) refrescar();
})();
