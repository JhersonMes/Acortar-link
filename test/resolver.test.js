'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const zlib = require('node:zlib');
const { resolver, esDireccionInterna } = require('../lib/resolver.js');

function levantar(manejador) {
  return new Promise((resolve) => {
    const servidor = http.createServer(manejador);
    servidor.listen(0, '127.0.0.1', () => {
      const base = `http://127.0.0.1:${servidor.address().port}`;
      resolve({ base, cerrar: () => new Promise((r) => servidor.close(r)) });
    });
  });
}

test('esDireccionInterna bloquea redes privadas y deja pasar las públicas', () => {
  for (const ip of ['127.0.0.1', '10.1.2.3', '172.20.0.1', '192.168.1.1', '169.254.169.254', '0.0.0.0',
    '100.64.0.1', '::1', '::', 'fe80::1', 'fd00::1', '::ffff:127.0.0.1', '::ffff:7f00:1', '[::1]', 'no-es-ip']) {
    assert.equal(esDireccionInterna(ip), true, ip);
  }
  for (const ip of ['8.8.8.8', '1.1.1.1', '93.184.216.34', '2606:4700:4700::1111', '::ffff:8.8.8.8']) {
    assert.equal(esDireccionInterna(ip), false, ip);
  }
});

test('sigue una cadena real: 301 -> meta refresh -> JavaScript -> destino escondido', async (t) => {
  const { base, cerrar } = await levantar((req, res) => {
    const destino = 'http://localhost:1/final';
    switch (req.url) {
      case '/corto':
        res.writeHead(301, { location: '/meta' }).end();
        break;
      case '/meta':
        res.writeHead(200, { 'content-type': 'text/html' });
        res.end('<html><head><meta http-equiv="refresh" content="0;url=/js"></head></html>');
        break;
      case '/js': {
        const html = `<script>location.replace("${base}/salir?url=${encodeURIComponent(destino)}")</script>`;
        res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'content-encoding': 'gzip' });
        res.end(zlib.gzipSync(html));
        break;
      }
      default:
        res.writeHead(200, { 'content-type': 'text/html' }).end('<p>pagina</p>');
    }
  });
  t.after(cerrar);

  const datos = await resolver(`${base}/corto`, { permitirInternas: true, tiempo: 2000 });
  assert.deepEqual(datos.pasos.map((p) => p.via), ['http', 'meta', 'js', 'enlace']);
  assert.equal(datos.final, 'http://localhost:1/final');
  // El último salto falla (puerto 1 cerrado): se muestra el último destino conocido.
  assert.equal(datos.estado, 'incompleto');
  assert.match(datos.aviso, /rechazó la conexión/);
});

test('se corta si el sitio tarda demasiado', async (t) => {
  const { base, cerrar } = await levantar((req, res) => {
    if (req.url === '/corto') res.writeHead(302, { location: '/lento' }).end();
    else setTimeout(() => res.writeHead(200).end(), 2000).unref();
  });
  t.after(cerrar);

  const inicio = Date.now();
  const datos = await resolver(`${base}/corto`, { permitirInternas: true, tiempo: 300 });
  assert.ok(Date.now() - inicio < 1500);
  assert.equal(datos.final, `${base}/lento`);
  assert.match(datos.aviso, /tardó demasiado/);
});

test('no visita direcciones internas', async (t) => {
  const { base, cerrar } = await levantar((req, res) => res.writeHead(200).end('secreto'));
  t.after(cerrar);
  const puerto = new URL(base).port;

  await assert.rejects(resolver(base), (e) => e.codigo === 400 && /dirección interna/.test(e.message));
  await assert.rejects(resolver(`http://localhost:${puerto}/`), (e) => e.codigo === 400 && /dirección interna/.test(e.message));
  await assert.rejects(resolver(`http://[::ffff:127.0.0.1]:${puerto}/`), /dirección interna/);
});
