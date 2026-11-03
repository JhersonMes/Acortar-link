/*
 * Salta Acortadores — lógica compartida.
 *
 * Este archivo lo usan la página web, la extensión y el servidor (Node).
 * La copia original es shared/desacortador.js: después de editarla ejecuta
 * `npm run sync` para copiarla a public/js/ y extension/lib/.
 */
(function (raiz) {
  'use strict';

  // ---------------------------------------------------------------------------
  // Sitios intermedios conocidos.
  //   host     dominio (incluye sus subdominios). "google.*" acepta cualquier
  //            dominio de país: google.com, google.com.pe, google.es...
  //   ruta     limita la regla a una parte del sitio (p. ej. google.com/url).
  //   param    parámetro donde suele ir el destino (se revisa primero).
  //   anuncios el sitio muestra anuncios antes de dar el enlace.
  // ---------------------------------------------------------------------------
  const REGLAS = [
    // Acortadores que pagan por visitas (muestran anuncios)
    { host: 'ouo.io', param: 's', anuncios: true },
    { host: 'ouo.press', param: 's', anuncios: true },
    { host: 'linkvertise.com', param: 'r', anuncios: true },
    { host: 'link-to.net', param: 'r', anuncios: true },
    { host: 'up-to-down.net', param: 'r', anuncios: true },
    { host: 'direct-link.net', param: 'r', anuncios: true },
    { host: 'file-link.net', param: 'r', anuncios: true },
    { host: 'link-center.net', param: 'r', anuncios: true },
    { host: 'link-hub.net', param: 'r', anuncios: true },
    { host: 'link-target.net', param: 'r', anuncios: true },
    { host: 'adf.ly', anuncios: true },
    { host: 'sh.st', anuncios: true },
    { host: 'shorte.st', anuncios: true },
    { host: 'shrinkme.io', anuncios: true },
    { host: 'shrinke.me', anuncios: true },
    { host: 'exe.io', anuncios: true },
    { host: 'exey.io', anuncios: true },
    { host: 'fc.lc', anuncios: true },
    { host: 'cuty.io', anuncios: true },
    { host: 'adfoc.us', anuncios: true },
    { host: 'shrtfly.com', anuncios: true },
    { host: 'clk.sh', anuncios: true },

    // Redirectores de buscadores y redes sociales (avisos de "estás saliendo")
    { host: 'google.*', ruta: '/url', param: 'q' },
    { host: 'youtube.com', ruta: '/redirect', param: 'q' },
    { host: 'l.facebook.com', ruta: '/l.php', param: 'u' },
    { host: 'lm.facebook.com', ruta: '/l.php', param: 'u' },
    { host: 'l.messenger.com', ruta: '/l.php', param: 'u' },
    { host: 'l.instagram.com', param: 'u' },
    { host: 'out.reddit.com', param: 'url' },
    { host: 'steamcommunity.com', ruta: '/linkfilter', param: 'url' },
    { host: 'away.vk.com', ruta: '/away.php', param: 'to' },
    { host: 't.umblr.com', ruta: '/redirect', param: 'z' },
    { host: 'href.li' },
    { host: 'anonym.to' },
  ];

  // Nombres de parámetro que suelen llevar el destino en cualquier sitio.
  const PARAMETROS_COMUNES = [
    'url', 'u', 'link', 'dest', 'destination', 'target', 'redirect',
    'redirect_url', 'redirecturl', 'redir', 'goto', 'out', 'away', 'href',
  ];

  const MAX_NIVELES = 5;
  const LIMITE_HTML_JS = 50000;

  // ---------------------------------------------------------------------------
  // Utilidades
  // ---------------------------------------------------------------------------

  function aUrl(valor) {
    if (valor instanceof URL) return valor;
    try {
      return new URL(valor);
    } catch (_) {
      return null;
    }
  }

  function esHttp(url) {
    return !!url && (url.protocol === 'http:' || url.protocol === 'https:') && !!url.hostname;
  }

  function sinWww(host) {
    return host.toLowerCase().replace(/^www\./, '');
  }

  function mismoSitio(a, b) {
    return sinWww(a.hostname) === sinWww(b.hostname);
  }

  function absoluta(valor, base) {
    try {
      const url = new URL(valor, base);
      return esHttp(url) ? url.href : null;
    } catch (_) {
      return null;
    }
  }

  function decodificar(texto) {
    try {
      return decodeURIComponent(texto);
    } catch (_) {
      return texto;
    }
  }

  // Convierte un texto en URL http(s) si lo es (también si viene codificado
  // una o varias veces: https%3A%2F%2F..., https%253A%252F%252F...).
  function textoAUrl(texto) {
    let t = String(texto).trim();
    for (let i = 0; i < 3 && /^https?%3A/i.test(t); i++) t = decodificar(t);
    if (!/^https?:\/\//i.test(t)) return null;
    const url = aUrl(t);
    return esHttp(url) ? url.href : null;
  }

  // Decodifica Base64 (normal o "url-safe") y devuelve la URL si lo era.
  function base64AUrl(valor, profundidad) {
    const limpio = String(valor).trim().replace(/ /g, '+');
    if (!/^[A-Za-z0-9+/_-]{12,}={0,2}$/.test(limpio)) return null;
    let b64 = limpio.replace(/-/g, '+').replace(/_/g, '/').replace(/=+$/, '');
    if (b64.length % 4 === 1) return null;
    b64 += '='.repeat((4 - (b64.length % 4)) % 4);
    let texto;
    try {
      const binario = atob(b64);
      const bytes = new Uint8Array(binario.length);
      for (let i = 0; i < binario.length; i++) bytes[i] = binario.charCodeAt(i);
      texto = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    } catch (_) {
      return null;
    }
    const url = textoAUrl(texto);
    if (url) return url;
    // Algunos sitios codifican dos veces.
    return (profundidad || 0) < 1 ? base64AUrl(texto, 1) : null;
  }

  // Valor de un parámetro -> URL (texto plano, codificado o Base64).
  function valorAUrl(valor) {
    return textoAUrl(valor) || base64AUrl(valor);
  }

  // Lee los parámetros de la URL sin perder los "&" de una URL sin codificar:
  // en ?s=https://sitio.com/a?b=1&c=2 el valor de "s" es todo lo que sigue.
  function leerParametros(url) {
    const crudo = url.search.slice(1);
    if (!crudo) return [];
    const partes = crudo.split('&');
    const lista = [];
    for (let i = 0; i < partes.length; i++) {
      const parte = partes[i];
      const igual = parte.indexOf('=');
      const nombre = decodificar((igual < 0 ? parte : parte.slice(0, igual)).replace(/\+/g, ' ')).toLowerCase();
      const valor = igual < 0 ? '' : parte.slice(igual + 1);
      if (/^https?:\/\//i.test(valor)) {
        lista.push({ nombre, valor: partes.slice(i).join('&').slice(igual + 1) + url.hash });
        break;
      }
      lista.push({ nombre, valor: decodificar(valor.replace(/\+/g, ' ')) });
    }
    return lista;
  }

  // ---------------------------------------------------------------------------
  // Reglas
  // ---------------------------------------------------------------------------

  function hostCoincide(host, patron) {
    if (patron.endsWith('.*')) {
      const base = patron.slice(0, -2).replace(/[.]/g, '\\.');
      return new RegExp('(^|\\.)' + base + '\\.[a-z]{2,3}(\\.[a-z]{2})?$').test(host);
    }
    return host === patron || host.endsWith('.' + patron);
  }

  // "ejemplo.com" o "ejemplo.com/ruta" -> regla
  function reglaDesdeTexto(texto) {
    const limpio = String(texto).trim().toLowerCase()
      .replace(/^[a-z]+:\/\//, '').replace(/^www\./, '');
    if (!limpio || /\s/.test(limpio)) return null;
    const barra = limpio.indexOf('/');
    const conPuerto = barra < 0 ? limpio : limpio.slice(0, barra);
    const ruta = barra < 0 ? '' : limpio.slice(barra);
    if (!/^[a-z0-9.*-]+(:\d+)?$/.test(conPuerto)) return null;
    const host = conPuerto.replace(/:\d+$/, '');
    return ruta && ruta !== '/' ? { host, ruta, propia: true } : { host, propia: true };
  }

  function buscarRegla(entrada, dominiosExtra) {
    const url = aUrl(entrada);
    if (!esHttp(url)) return null;
    const host = url.hostname.toLowerCase();
    const ruta = url.pathname.toLowerCase();
    const extras = (dominiosExtra || []).map(reglaDesdeTexto).filter(Boolean);
    for (const regla of REGLAS.concat(extras)) {
      if (hostCoincide(host, regla.host) && (!regla.ruta || ruta.startsWith(regla.ruta))) return regla;
    }
    return null;
  }

  function esAcortadorConAnuncios(entrada) {
    const regla = buscarRegla(entrada);
    return !!(regla && regla.anuncios);
  }

  // ---------------------------------------------------------------------------
  // Destino escondido dentro del enlace
  // ---------------------------------------------------------------------------

  // Devuelve el siguiente destino escondido en el enlace (un solo nivel).
  // En sitios conocidos revisa todo el enlace; en el resto, solo los
  // parámetros típicos (?url=, ?link=, ?redirect=...).
  function extraerSiguiente(entrada, opciones) {
    const url = aUrl(entrada);
    if (!esHttp(url)) return null;
    const regla = buscarRegla(url, opciones && opciones.dominiosExtra);
    const parametros = leerParametros(url);
    const candidatos = [];

    if (regla && regla.param) {
      for (const p of parametros) if (p.nombre === regla.param) candidatos.push(p.valor);
    }
    for (const p of parametros) if (PARAMETROS_COMUNES.includes(p.nombre)) candidatos.push(p.valor);

    if (regla) {
      for (const p of parametros) candidatos.push(p.valor);
      // href.li/?https://destino.com
      candidatos.push(decodificar(url.search.slice(1)) + url.hash);
      // sh.st/st/abc/https://destino.com
      const resto = url.href.slice(url.origin.length);
      const enRuta = /\/(https?(?::|%3A)(?:\/\/|%2F%2F).*)$/i.exec(resto);
      if (enRuta) candidatos.push(enRuta[1]);
      // /go/aHR0cHM6Ly9... (Base64 en la ruta)
      for (const segmento of url.pathname.split('/')) if (segmento) candidatos.push(segmento);
      // #https://destino.com o #aHR0cHM6Ly9...
      if (url.hash.length > 1) candidatos.push(decodificar(url.hash.slice(1)));
    }

    for (const candidato of candidatos) {
      if (!candidato) continue;
      const destino = valorAUrl(candidato);
      if (destino && !mismoSitio(new URL(destino), url)) return destino;
    }
    return null;
  }

  // Sigue los destinos escondidos dentro de otros (google -> facebook -> destino).
  function extraerDestino(entrada, opciones) {
    let actual = aUrl(entrada);
    if (!esHttp(actual)) return null;
    let encontrado = null;
    for (let i = 0; i < MAX_NIVELES; i++) {
      const siguiente = extraerSiguiente(actual, opciones);
      if (!siguiente || siguiente === actual.href) break;
      encontrado = siguiente;
      actual = new URL(siguiente);
    }
    return encontrado;
  }

  // Para la extensión: solo salta en sitios intermedios conocidos (o los que
  // agregó el usuario), para no romper inicios de sesión ni otras páginas.
  function saltoAutomatico(entrada, dominiosExtra) {
    if (!buscarRegla(entrada, dominiosExtra)) return null;
    return extraerDestino(entrada, { dominiosExtra });
  }

  // ---------------------------------------------------------------------------
  // Redirecciones escritas en el HTML
  // ---------------------------------------------------------------------------

  function decodificarEntidades(texto) {
    return texto
      .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
      .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(parseInt(d, 10)))
      .replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>').replace(/&amp;/g, '&');
  }

  function desescaparJs(texto) {
    return texto
      .replace(/\\u([0-9a-fA-F]{4})/g, (_, h) => String.fromCharCode(parseInt(h, 16)))
      .replace(/\\x([0-9a-fA-F]{2})/g, (_, h) => String.fromCharCode(parseInt(h, 16)))
      .replace(/\\(.)/g, '$1');
  }

  // Busca <meta http-equiv="refresh"> y, en páginas pequeñas, redirecciones
  // por JavaScript (location.href = "...", location.replace("...")).
  function buscarEnHtml(html, base) {
    if (typeof html !== 'string' || !html) return null;

    const metas = html.match(/<meta\b[^>]*>/gi) || [];
    for (const etiqueta of metas) {
      if (!/http-equiv\s*=\s*["']?refresh/i.test(etiqueta)) continue;
      const c = /\bcontent\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i.exec(etiqueta);
      if (!c) continue;
      const contenido = decodificarEntidades(c[1] ?? c[2] ?? c[3] ?? '');
      const m = /url\s*=\s*['"]?([^'"]+)/i.exec(contenido);
      const url = m && absoluta(m[1].trim(), base);
      if (url && url !== base) return { url, tipo: 'meta' };
    }

    if (html.length <= LIMITE_HTML_JS) {
      const patrones = [
        /\blocation\.(?:replace|assign)\(\s*(["'])((?:\\.|(?!\1).)+)\1\s*\)/,
        /\blocation(?:\.href)?\s*=\s*(["'])((?:\\.|(?!\1).)+)\1/,
      ];
      for (const patron of patrones) {
        const m = patron.exec(html);
        const url = m && absoluta(desescaparJs(m[2]).trim(), base);
        if (url && url !== base) return { url, tipo: 'js' };
      }
    }
    return null;
  }

  // ---------------------------------------------------------------------------
  // Recorrido completo
  // ---------------------------------------------------------------------------

  // Acepta "bit.ly/abc", "https://..." o un texto con un enlace dentro.
  function normalizarEntrada(texto) {
    if (typeof texto !== 'string') return null;
    let t = texto.trim();
    const enTexto = /https?:\/\/[^\s<>"']+/i.exec(t);
    if (enTexto) t = enTexto[0].replace(/[.,;:!?)\]}]+$/, '');
    else if (!t || /\s/.test(t)) return null;
    if (!/^https?:\/\//i.test(t)) {
      if (/^[a-z][a-z0-9+.-]*:\/\//i.test(t)) return null;
      t = 'https://' + t.replace(/^\/+/, '');
    }
    const url = aUrl(t);
    if (!esHttp(url)) return null;
    const host = url.hostname;
    if (!host.includes('.') && !host.includes(':') && host !== 'localhost') return null;
    return url.href;
  }

  function error(mensaje, codigo) {
    const e = new Error(mensaje);
    e.codigo = codigo || 400;
    e.paraUsuario = true;
    return e;
  }

  function hostDe(url) {
    try {
      return new URL(url).hostname;
    } catch (_) {
      return url;
    }
  }

  /**
   * Recorre el enlace hasta su destino final.
   *
   * `obtener(url, msRestantes)` visita una URL y devuelve
   *   { estado, ubicacion?, url?, html? }
   *   - ubicacion: cabecera Location (si no siguió la redirección)
   *   - url:       URL final (si el navegador ya siguió las redirecciones)
   *   - html:      contenido, si la página es HTML
   * Si `obtener` es null, solo se revisa el propio enlace (sin visitarlo).
   */
  async function resolverCon(entrada, obtener, opciones) {
    const op = opciones || {};
    const maxSaltos = op.maxSaltos || 10;
    const plazo = Date.now() + (op.plazoTotal || 9000);
    const extras = { dominiosExtra: op.dominiosExtra };

    const original = normalizarEntrada(entrada);
    if (!original) throw error('Eso no parece un enlace válido.');

    const pasos = [];
    const vistas = new Set();
    let actual = original;
    let estado = 'completo';
    let aviso = null;
    let visitada = null;

    const avanzar = (via, siguiente, codigo) => {
      const paso = { url: actual, via };
      if (codigo) paso.codigo = codigo;
      pasos.push(paso);
      actual = siguiente;
    };

    for (;;) {
      if (pasos.length >= maxSaltos) {
        estado = 'incompleto';
        aviso = 'El enlace tiene demasiadas redirecciones; se muestra la última conocida.';
        break;
      }
      if (vistas.has(actual)) {
        estado = 'incompleto';
        aviso = 'El enlace redirige en círculo.';
        break;
      }
      vistas.add(actual);

      const conocido = !!buscarRegla(actual, op.dominiosExtra);
      if (conocido || !obtener) {
        const escondido = extraerSiguiente(actual, extras);
        if (escondido) {
          avanzar('enlace', escondido);
          continue;
        }
      }
      if (!obtener) {
        aviso = 'Se revisó el enlace sin visitarlo. Para seguir redirecciones hace falta el servidor.';
        break;
      }

      const restante = plazo - Date.now();
      if (restante <= 0) {
        estado = 'incompleto';
        aviso = 'Se acabó el tiempo de espera; se muestra el último destino conocido.';
        break;
      }

      let r;
      try {
        r = await obtener(actual, restante);
      } catch (e) {
        if (!pasos.length) throw e.paraUsuario ? e : error('No se pudo abrir el enlace: ' + e.message, 502);
        estado = 'incompleto';
        aviso = 'No se pudo visitar ' + hostDe(actual) + ' (' + e.message + '). Este es el último destino conocido.';
        break;
      }
      visitada = { url: actual, estado: r.estado };

      if (r.ubicacion) {
        const siguiente = absoluta(r.ubicacion, actual);
        if (siguiente && siguiente !== actual) {
          avanzar('http', siguiente, r.estado);
          continue;
        }
      }
      if (r.url && r.url !== actual && esHttp(aUrl(r.url))) {
        avanzar('http', r.url);
        vistas.add(actual);
        visitada = { url: actual, estado: r.estado };
        if (buscarRegla(actual, op.dominiosExtra)) {
          const escondido = extraerSiguiente(actual, extras);
          if (escondido) {
            avanzar('enlace', escondido);
            continue;
          }
        }
      }
      const enHtml = r.html ? buscarEnHtml(r.html, actual) : null;
      if (enHtml && !vistas.has(enHtml.url)) {
        avanzar(enHtml.tipo, enHtml.url);
        continue;
      }
      if (!buscarRegla(actual, op.dominiosExtra)) {
        const escondido = extraerSiguiente(actual, extras);
        if (escondido) {
          avanzar('enlace', escondido);
          continue;
        }
      }
      break;
    }

    if (estado === 'completo') {
      if (esAcortadorConAnuncios(actual)) {
        estado = 'bloqueado';
        aviso = 'Este acortador esconde el destino detrás de anuncios, una cuenta regresiva o un captcha, ' +
          'y solo lo entrega a quien completa esos pasos. No se puede revelar sin abrirlo.';
      } else if (!pasos.length) {
        estado = 'sin-cambios';
        aviso = aviso || 'No se encontró ninguna redirección: puede que este ya sea el enlace final, ' +
          'o que el acortador necesite que lo abras en el navegador.';
      } else if (visitada && visitada.url === actual && visitada.estado >= 400) {
        aviso = 'El destino respondió con error ' + visitada.estado + '; puede que la página ya no exista.';
      }
    }

    return { original, final: actual, estado, aviso, pasos };
  }

  // ---------------------------------------------------------------------------
  // Textos para mostrar
  // ---------------------------------------------------------------------------

  const TEXTOS_VIA = {
    http: 'Redirección del servidor',
    meta: 'Redirección automática de la página',
    js: 'Redirección por JavaScript',
    enlace: 'Destino escondido dentro del enlace',
  };

  const TEXTOS_ESTADO = {
    completo: 'Destino encontrado',
    bloqueado: 'Protegido con anuncios',
    'sin-cambios': 'Sin redirección',
    incompleto: 'Destino parcial',
  };

  function describirPaso(paso) {
    const texto = TEXTOS_VIA[paso.via] || 'Redirección';
    return paso.codigo ? texto + ' (' + paso.codigo + ')' : texto;
  }

  function describirEstado(estado) {
    return TEXTOS_ESTADO[estado] || estado;
  }

  const api = {
    REGLAS,
    PARAMETROS_COMUNES,
    normalizarEntrada,
    buscarRegla,
    esAcortadorConAnuncios,
    extraerSiguiente,
    extraerDestino,
    saltoAutomatico,
    buscarEnHtml,
    resolverCon,
    describirPaso,
    describirEstado,
    reglaDesdeTexto,
    error,
  };

  if (typeof module === 'object' && module.exports) module.exports = api;
  else raiz.Desacortador = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
