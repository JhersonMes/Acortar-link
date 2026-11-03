// Ajustes de la extensión (compartidos por todas sus partes).
(function (raiz) {
  'use strict';

  const ext = raiz.browser || raiz.chrome;

  const PREDETERMINADOS = {
    autoSaltar: true,
    reescribirEnlaces: true,
    dominiosExtra: [],
  };

  async function leer() {
    const guardados = await ext.storage.sync.get(PREDETERMINADOS);
    return { ...PREDETERMINADOS, ...guardados };
  }

  function guardar(cambios) {
    return ext.storage.sync.set(cambios);
  }

  raiz.Ajustes = { ext, PREDETERMINADOS, leer, guardar };
})(globalThis);
