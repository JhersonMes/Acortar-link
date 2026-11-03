(() => {
  'use strict';

  const D = window.Desacortador;
  const meta = document.querySelector('meta[name="desacortador-api"]');
  const API = ((meta && meta.content) || '').trim().replace(/\/+$/, '') + '/api/resolver';

  const $ = (id) => document.getElementById(id);
  const formulario = $('formulario');
  const entrada = $('enlace');
  const boton = $('boton');
  const resultado = $('resultado');

  function crear(etiqueta, clase, texto) {
    const nodo = document.createElement(etiqueta);
    if (clase) nodo.className = clase;
    if (texto != null) nodo.textContent = texto;
    return nodo;
  }

  function enlaceSeguro(url) {
    return typeof url === 'string' && /^https?:\/\//i.test(url) ? url : null;
  }

  // Resalta el dominio para que se vea a dónde lleva de verdad.
  function urlConHost(url) {
    const nodo = crear('p', 'destino');
    try {
      const u = new URL(url);
      const inicio = u.protocol + '//';
      nodo.append(inicio, crear('span', 'host', u.host), url.slice(inicio.length + u.host.length));
    } catch (_) {
      nodo.textContent = url;
    }
    return nodo;
  }

  function cargando(activo) {
    boton.disabled = activo;
    boton.classList.toggle('cargando', activo);
    boton.textContent = activo ? 'Revisando' : 'Revelar destino';
  }

  function mostrarError(mensaje) {
    resultado.replaceChildren(crear('span', 'etiqueta error', 'No se pudo revisar'), crear('p', 'aviso', mensaje));
    resultado.hidden = false;
  }

  function botonCopiar(texto) {
    const copiar = crear('button', 'boton secundario pequeno', 'Copiar');
    copiar.type = 'button';
    copiar.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(texto);
        copiar.textContent = 'Copiado';
      } catch (_) {
        copiar.textContent = 'No se pudo copiar';
      }
      setTimeout(() => { copiar.textContent = 'Copiar'; }, 1600);
    });
    return copiar;
  }

  function mostrar(datos, sinServidor) {
    const hijos = [crear('span', 'etiqueta ' + datos.estado, D.describirEstado(datos.estado))];

    hijos.push(crear('p', 'titulo-destino', datos.estado === 'bloqueado' ? 'Llega hasta' : 'Destino'));
    hijos.push(urlConHost(datos.final));

    if (datos.aviso) hijos.push(crear('p', 'aviso', datos.aviso));
    if (sinServidor && !datos.aviso) {
      hijos.push(crear('p', 'aviso', 'Se revisó el enlace sin visitarlo, porque esta página está alojada sin servidor.'));
    }

    const acciones = crear('div', 'acciones');
    const url = enlaceSeguro(datos.final);
    if (url && datos.estado !== 'bloqueado') {
      const abrir = crear('a', 'boton pequeno', 'Abrir destino');
      abrir.href = url;
      abrir.target = '_blank';
      abrir.rel = 'noopener noreferrer';
      acciones.append(abrir);
    }
    acciones.append(botonCopiar(datos.final));
    hijos.push(acciones);

    if (datos.pasos && datos.pasos.length) {
      const detalles = crear('details', 'recorrido');
      const saltos = datos.pasos.length;
      detalles.append(crear('summary', null, 'Ver recorrido (' + saltos + (saltos === 1 ? ' salto)' : ' saltos)')));
      const lista = crear('ol');
      datos.pasos.forEach((paso, i) => {
        const item = crear('li');
        const cuerpo = crear('div');
        cuerpo.append(crear('div', 'url', paso.url), crear('div', 'via', D.describirPaso(paso)));
        item.append(crear('span', 'numero', String(i + 1)), cuerpo);
        lista.append(item);
      });
      const ultimo = crear('li', 'final');
      const cuerpo = crear('div');
      cuerpo.append(crear('div', 'url', datos.final), crear('div', 'via', 'Destino final'));
      ultimo.append(crear('span', 'numero', '✓'), cuerpo);
      lista.append(ultimo);
      detalles.append(lista);
      hijos.push(detalles);
    }

    resultado.replaceChildren(...hijos);
    resultado.hidden = false;
  }

  // Devuelve null si no hay servidor (página abierta como archivo o en un
  // hosting estático): entonces se revisa el enlace sin visitarlo.
  async function consultarServidor(url) {
    let respuesta;
    try {
      respuesta = await fetch(API + '?url=' + encodeURIComponent(url), {
        headers: { accept: 'application/json' },
        signal: AbortSignal.timeout(25000),
      });
    } catch (e) {
      if (e.name === 'TimeoutError') throw new Error('El servidor tardó demasiado en responder.');
      return null;
    }
    if (!(respuesta.headers.get('content-type') || '').includes('application/json')) return null;
    const datos = await respuesta.json();
    if (!respuesta.ok) throw new Error(datos.error || 'No se pudo revisar el enlace.');
    return datos;
  }

  async function revelar(texto) {
    const url = D.normalizarEntrada(texto);
    if (!url) {
      mostrarError('Eso no parece un enlace válido. Prueba con algo como https://bit.ly/abc123');
      return;
    }
    entrada.value = url;
    try {
      history.replaceState(null, '', '?url=' + encodeURIComponent(url));
    } catch (_) { /* p. ej. abierto como archivo */ }

    cargando(true);
    try {
      const datos = await consultarServidor(url);
      if (datos) mostrar(datos, false);
      else mostrar(await D.resolverCon(url, null), true);
    } catch (e) {
      mostrarError(e.message || 'No se pudo revisar el enlace.');
    } finally {
      cargando(false);
    }
  }

  formulario.addEventListener('submit', (evento) => {
    evento.preventDefault();
    revelar(entrada.value);
  });

  // Atajo de marcador (solo si la página está publicada en una web)
  if (/^https?:$/.test(location.protocol)) {
    const destino = (location.origin + location.pathname).replace(/'/g, '%27');
    const marcador = $('marcador');
    marcador.href = "javascript:void(location.href='" + destino + "?url='+encodeURIComponent(location.href))";
    marcador.addEventListener('click', (evento) => {
      evento.preventDefault();
      alert('Arrastra este botón a tu barra de marcadores para usarlo en cualquier página.');
    });
    $('tarjetaMarcador').hidden = false;
  }

  // Enlace recibido en la dirección: ?url=... (o ?text=... al compartir)
  const parametros = new URLSearchParams(location.search);
  const recibido = parametros.get('url') || parametros.get('text');
  if (recibido) revelar(recibido);
})();
