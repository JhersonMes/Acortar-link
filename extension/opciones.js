(async () => {
  'use strict';

  const D = globalThis.Desacortador;
  const { leer, guardar } = globalThis.Ajustes;
  const $ = (id) => document.getElementById(id);

  const ajustes = await leer();

  for (const clave of ['autoSaltar', 'reescribirEnlaces']) {
    const casilla = $(clave);
    casilla.checked = !!ajustes[clave];
    casilla.addEventListener('change', () => guardar({ [clave]: casilla.checked }));
  }

  const area = $('dominiosExtra');
  area.value = ajustes.dominiosExtra.join('\n');

  $('guardar').addEventListener('click', async () => {
    const lineas = area.value.split('\n').map((l) => l.trim()).filter(Boolean);
    const validas = [];
    const invalidas = [];
    for (const linea of lineas) {
      if (D.reglaDesdeTexto(linea)) validas.push(linea.toLowerCase());
      else invalidas.push(linea);
    }
    const unicas = [...new Set(validas)];
    await guardar({ dominiosExtra: unicas });
    area.value = unicas.join('\n');
    $('estado').textContent = invalidas.length
      ? 'Guardado. Se ignoraron: ' + invalidas.join(', ')
      : 'Guardado.';
  });

  const lista = $('incluidos');
  for (const regla of D.REGLAS) {
    const item = document.createElement('li');
    item.textContent = regla.host + (regla.ruta || '');
    lista.append(item);
  }
})();
