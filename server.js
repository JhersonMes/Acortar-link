'use strict';

// Servidor local: sirve la página (public/) y la API (/api/resolver).
//   npm start            -> http://localhost:3000
//   PORT=8080 npm start  -> otro puerto

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const manejarApi = require('./api/resolver.js');

const PUBLICO = path.join(__dirname, 'public');
const TIPOS = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
};

function servirArchivo(req, res) {
  let ruta;
  try {
    ruta = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  } catch (_) {
    res.writeHead(400).end('Ruta inválida');
    return;
  }
  if (ruta.endsWith('/')) ruta += 'index.html';
  const archivo = path.join(PUBLICO, path.normalize(ruta));
  if (!archivo.startsWith(PUBLICO + path.sep)) {
    res.writeHead(403).end('Prohibido');
    return;
  }
  fs.readFile(archivo, (err, datos) => {
    if (err) {
      res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' }).end('No encontrado');
      return;
    }
    res.writeHead(200, {
      'content-type': TIPOS[path.extname(archivo)] || 'application/octet-stream',
      'x-content-type-options': 'nosniff',
    });
    res.end(req.method === 'HEAD' ? undefined : datos);
  });
}

function crearServidor(manejador = manejarApi) {
  return http.createServer((req, res) => {
    const { pathname } = new URL(req.url, 'http://localhost');
    if (pathname === '/api/resolver') return manejador(req, res);
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405).end();
      return undefined;
    }
    return servirArchivo(req, res);
  });
}

if (require.main === module) {
  const puerto = Number(process.env.PORT) || 3000;
  crearServidor().listen(puerto, () => {
    console.log(`Salta Acortadores listo en http://localhost:${puerto}`);
  });
}

module.exports = { crearServidor };
