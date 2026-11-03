// Convierte los enlaces de la página que pasan por un acortador o redirector
// conocido en enlaces directos (solo si el destino viene dentro del enlace).
(async () => {
  'use strict';

  const D = globalThis.Desacortador;
  const A = globalThis.Ajustes;
  if (!D || !A) return;

  let ajustes;
  try {
    ajustes = await A.leer();
  } catch (_) {
    return;
  }
  if (!ajustes.reescribirEnlaces) return;

  const { dominiosExtra } = ajustes;

  function revisar(enlace) {
    const destino = D.saltoAutomatico(enlace.href, dominiosExtra);
    if (!destino) return;
    enlace.dataset.saltaAcortadoresOriginal = enlace.href;
    enlace.href = destino;
    if (!enlace.title) enlace.title = 'Enlace directo (Salta Acortadores): ' + destino;
    const rel = new Set((enlace.getAttribute('rel') || '').split(/\s+/).filter(Boolean));
    rel.add('noreferrer');
    enlace.setAttribute('rel', [...rel].join(' '));
  }

  function procesar(nodo) {
    if (nodo.nodeType !== 1) return;
    if (nodo.matches('a[href]')) revisar(nodo);
    for (const enlace of nodo.querySelectorAll('a[href]')) revisar(enlace);
  }

  procesar(document.documentElement);

  new MutationObserver((cambios) => {
    for (const cambio of cambios) {
      if (cambio.type === 'attributes') {
        if (cambio.target.matches('a[href]')) revisar(cambio.target);
      } else {
        cambio.addedNodes.forEach(procesar);
      }
    }
  }).observe(document.documentElement, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['href'],
  });
})();
