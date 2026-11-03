(async () => {
  'use strict';

  const D = globalThis.Desacortador;
  const { ext, leer, guardar } = globalThis.Ajustes;

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
    return /^https?:\/\//i.test(url) ? url : null;
  }

  function mostrarError(mensaje) {
    resultado.replaceChildren(crear('span', 'etiqueta error', 'Error'), crear('p', 'aviso', mensaje));
    resultado.hidden = false;
  }

  function mostrar(datos) {
    const hijos = [crear('span', 'etiqueta ' + datos.estado, D.describirEstado(datos.estado))];
    hijos.push(crear('div', 'destino', datos.final));
    if (datos.aviso) hijos.push(crear('p', 'aviso', datos.aviso));

    const acciones = crear('div', 'acciones');
    const url = enlaceSeguro(datos.final);
    if (url && datos.estado !== 'bloqueado') {
      const abrir = crear('a', 'boton', 'Abrir destino');
      abrir.href = url;
      abrir.target = '_blank';
      abrir.rel = 'noopener noreferrer';
      acciones.append(abrir);
    }
    const copiar = crear('button', 'boton secundario', 'Copiar');
    copiar.type = 'button';
    copiar.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(datos.final);
        copiar.textContent = 'Copiado';
      } catch (_) {
        copiar.textContent = 'No se pudo copiar';
      }
      setTimeout(() => { copiar.textContent = 'Copiar'; }, 1500);
    });
    acciones.append(copiar);
    hijos.push(acciones);

    if (datos.pasos.length) {
      const lista = crear('ol', 'recorrido');
      for (const paso of datos.pasos) {
        const item = crear('li');
        item.append(crear('span', 'url', paso.url), document.createElement('br'), D.describirPaso(paso));
        lista.append(item);
      }
      hijos.push(lista);
    }

    resultado.replaceChildren(...hijos);
    resultado.hidden = false;
  }

  async function revelar(texto) {
    boton.disabled = true;
    boton.textContent = 'Revisando…';
    try {
      const { dominiosExtra } = await leer();
      mostrar(await globalThis.resolverEnNavegador(texto, { dominiosExtra }));
    } catch (e) {
      mostrarError(e.message || 'No se pudo revisar el enlace.');
    } finally {
      boton.disabled = false;
      boton.textContent = 'Revelar';
    }
  }

  formulario.addEventListener('submit', (evento) => {
    evento.preventDefault();
    revelar(entrada.value);
  });

  // Ajustes
  const ajustes = await leer();
  for (const clave of ['autoSaltar', 'reescribirEnlaces']) {
    const casilla = $(clave);
    casilla.checked = !!ajustes[clave];
    casilla.addEventListener('change', () => guardar({ [clave]: casilla.checked }));
  }

  const { saltados = 0 } = await ext.storage.local.get('saltados');
  $('contador').textContent = saltados === 1 ? '1 página saltada' : saltados + ' páginas saltadas';

  $('abrirOpciones').addEventListener('click', (evento) => {
    evento.preventDefault();
    ext.runtime.openOptionsPage();
  });

  // Enlace recibido desde el menú contextual (se abre como pestaña)
  const recibido = new URLSearchParams(location.search).get('url');
  if (recibido) {
    document.body.classList.add('pestana');
    entrada.value = recibido;
    revelar(recibido);
    return;
  }

  // Si la pestaña actual es un acortador conocido, revisarla de una vez.
  try {
    const [pestana] = await ext.tabs.query({ active: true, currentWindow: true });
    if (pestana && pestana.url && D.buscarRegla(pestana.url, ajustes.dominiosExtra)) {
      entrada.value = pestana.url;
      revelar(pestana.url);
      return;
    }
  } catch (_) {
    // Sin acceso a la pestaña: no pasa nada.
  }
  entrada.focus();
})();
