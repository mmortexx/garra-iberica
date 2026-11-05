// La ruta de logros: marcar y recordar, en el navegador y, si entras con Discord, en tu cuenta.
// Lo marcado se escribe siempre primero aquí y luego se sube: si el servicio se cae, nada se pierde y la página lo dice.
// Los nombres que vienen del servicio solo se pintan con textContent.
(() => {
  'use strict';
  const raiz = document.querySelector('[data-miembro]');
  if (!raiz) return;
  const en = document.documentElement.lang === 'en';
  const SERVICIO = raiz.dataset.servicio || '';
  const MAXIMOS = new Map(Object.entries(JSON.parse(raiz.dataset.logros)));
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
    rechazadas: n => `Ticks the service did not accept because they are no longer in the list: ${n}.`,
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
    rechazadas: n => `Marcas que el servicio no ha aceptado porque ya no están en la lista: ${n}.`,
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
  const sano = o => {
    const fuera = {};
    if (!o || typeof o !== 'object') return fuera;
    for (const [k, m] of MAXIMOS) {
      const v = Object.hasOwn(o, k) ? o[k] : undefined;
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
  const porSubir = () => new Set([...Object.keys(almacen.subidas), ...Object.keys(almacen.bajadas)]).size;
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
    for (const s of ['[data-resumen]', '[data-codigo-caja]']) ver(s, true);
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
    else if (caducada) texto = T.caducada(n);
    else if (almacen.token && servicioCaido) texto = n ? T.pendientes(n) : T.caido;
    else if (almacen.token && n) texto = T.subiendo(n);
    else if (almacen.token) texto = T.nube;
    else if (!SERVICIO) texto = T.sinServicio;
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
    const dentro = Boolean(almacen.token && cuenta);
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
      for (const [k, v] of Object.entries(bajadas)) if (almacen.bajadas[k] === v) delete almacen.bajadas[k];
      for (const [k, v] of Object.entries(subidas)) if (almacen.subidas[k] === v) delete almacen.subidas[k];
      acuses++;
      if (rechazados.length) aviso(T.rechazadas(rechazados.length));
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
