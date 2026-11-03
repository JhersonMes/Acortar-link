// Resuelve enlaces desde la extensión: el navegador sigue las redirecciones
// (con el permiso de la extensión no hay bloqueo CORS) y se revisa el HTML.
(function (raiz) {
  'use strict';

  const D = raiz.Desacortador;
  const MAX_HTML = 512 * 1024;
  const TIEMPO_POR_SALTO = 8000;

  async function leerHtml(respuesta) {
    if (!respuesta.body) return '';
    const lector = respuesta.body.getReader();
    const decodificador = new TextDecoder();
    let html = '';
    while (html.length < MAX_HTML) {
      const { done, value } = await lector.read();
      if (done) break;
      html += decodificador.decode(value, { stream: true });
    }
    lector.cancel().catch(() => {});
    return html;
  }

  async function obtener(url, restante) {
    let respuesta;
    try {
      respuesta = await fetch(url, {
        credentials: 'omit',
        redirect: 'follow',
        cache: 'no-store',
        signal: AbortSignal.timeout(Math.min(TIEMPO_POR_SALTO, restante)),
      });
    } catch (e) {
      throw new Error(e.name === 'TimeoutError' ? 'el sitio tardó demasiado en responder' : 'no se pudo conectar');
    }
    const tipo = respuesta.headers.get('content-type') || '';
    let html = null;
    if (/html/i.test(tipo)) html = await leerHtml(respuesta);
    else if (respuesta.body) respuesta.body.cancel().catch(() => {});
    return { estado: respuesta.status, url: respuesta.url, html };
  }

  function resolverEnNavegador(entrada, opciones) {
    return D.resolverCon(entrada, obtener, opciones);
  }

  raiz.resolverEnNavegador = resolverEnNavegador;
})(globalThis);
