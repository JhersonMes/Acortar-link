'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const { crearServidor } = require('../server.js');
const manejarApi = require('../api/resolver.js');
const { origen, COPIAS } = require('../scripts/sincronizar.js');

async function conServidor(t, manejador) {
  const servidor = crearServidor(manejador);
  await new Promise((r) => servidor.listen(0, '127.0.0.1', r));
  t.after(() => new Promise((r) => servidor.close(r)));
  return `http://127.0.0.1:${servidor.address().port}`;
}

test('las copias de shared/desacortador.js están al día (npm run sync)', () => {
  const original = fs.readFileSync(origen, 'utf8');
  for (const copia of COPIAS) assert.equal(fs.readFileSync(copia, 'utf8'), original, copia);
});

test('sirve la página y sus archivos', async (t) => {
  const base = await conServidor(t);
  const pagina = await fetch(base + '/');
  assert.equal(pagina.status, 200);
  assert.match(pagina.headers.get('content-type'), /text\/html/);
  assert.match(await pagina.text(), /Salta Acortadores/);

  const script = await fetch(base + '/js/desacortador.js');
  assert.equal(script.status, 200);
  assert.match(script.headers.get('content-type'), /javascript/);

  assert.equal((await fetch(base + '/no-existe.txt')).status, 404);
});

test('no deja salir de la carpeta public/', async (t) => {
  const base = await conServidor(t);
  const puerto = new URL(base).port;
  const estado = await new Promise((resolve) => {
    http.get({ host: '127.0.0.1', port: puerto, path: '/../package.json' }, (res) => {
      res.resume();
      resolve(res.statusCode);
    });
  });
  assert.notEqual(estado, 200);
  assert.notEqual((await fetch(base + '/%2e%2e/package.json')).status, 200);
});

test('API: errores claros', async (t) => {
  const base = await conServidor(t);

  const sinUrl = await fetch(base + '/api/resolver');
  assert.equal(sinUrl.status, 400);
  assert.equal(sinUrl.headers.get('access-control-allow-origin'), '*');
  assert.match((await sinUrl.json()).error, /Falta/);

  const invalida = await fetch(base + '/api/resolver?url=' + encodeURIComponent('hola mundo'));
  assert.equal(invalida.status, 400);
  assert.match((await invalida.json()).error, /no parece un enlace/);

  const interna = await fetch(base + '/api/resolver?url=' + encodeURIComponent(base));
  assert.equal(interna.status, 400);
  assert.match((await interna.json()).error, /dirección interna/);

  const post = await fetch(base + '/api/resolver', { method: 'POST' });
  assert.equal(post.status, 405);
});

async function sitio(t, manejador) {
  const servidor = http.createServer(manejador);
  await new Promise((r) => servidor.listen(0, '127.0.0.1', r));
  t.after(() => new Promise((r) => servidor.close(r)));
  return `http://127.0.0.1:${servidor.address().port}`;
}

test('API: resuelve un enlace', async (t) => {
  const destino = await sitio(t, (req, res) => res.writeHead(200).end());
  const corto = await sitio(t, (req, res) => res.writeHead(302, { location: destino + '/final' }).end());
  const base = await conServidor(t, manejarApi.crearManejador({ permitirInternas: true }));

  const respuesta = await fetch(base + '/api/resolver?url=' + encodeURIComponent(corto + '/x'));
  assert.equal(respuesta.status, 200);
  const datos = await respuesta.json();
  assert.equal(datos.final, destino + '/final');
  assert.equal(datos.estado, 'completo');
  assert.deepEqual(datos.pasos, [{ url: corto + '/x', via: 'http', codigo: 302 }]);
});
