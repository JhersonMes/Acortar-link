// Fondo de la extensión.
//  - Salta automáticamente las páginas intermedias cuando el destino viene
//    escondido en el enlace (antes de que cargue la página de anuncios).
//  - Menú contextual "Revelar destino real del enlace".

// En Chrome es un service worker (carga las librerías aquí); en Firefox las
// carga el manifest ("background.scripts").
if (typeof importScripts === 'function') importScripts('lib/desacortador.js', 'lib/ajustes.js');

const { ext, leer } = globalThis.Ajustes;
const D = globalThis.Desacortador;

const MENU = 'revelar-destino';

async function sumarSalto() {
  const { saltados = 0 } = await ext.storage.local.get('saltados');
  await ext.storage.local.set({ saltados: saltados + 1 });
}

ext.webNavigation.onBeforeNavigate.addListener(async (detalle) => {
  if (detalle.frameId !== 0 || detalle.tabId < 0) return;
  const { autoSaltar, dominiosExtra } = await leer();
  if (!autoSaltar) return;
  const destino = D.saltoAutomatico(detalle.url, dominiosExtra);
  if (!destino) return;
  try {
    await ext.tabs.update(detalle.tabId, { url: destino });
    await sumarSalto();
  } catch (_) {
    // La pestaña se cerró o cambió mientras tanto.
  }
}, { url: [{ schemes: ['http', 'https'] }] });

function crearMenu() {
  ext.contextMenus.removeAll(() => {
    ext.contextMenus.create({
      id: MENU,
      title: 'Revelar destino real del enlace',
      contexts: ['link'],
    });
  });
}

ext.runtime.onInstalled.addListener(crearMenu);
if (ext.runtime.onStartup) ext.runtime.onStartup.addListener(crearMenu);

ext.contextMenus.onClicked.addListener((info) => {
  if (info.menuItemId !== MENU || !info.linkUrl) return;
  ext.tabs.create({ url: ext.runtime.getURL('popup.html?url=' + encodeURIComponent(info.linkUrl)) });
});
