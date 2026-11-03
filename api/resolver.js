'use strict';

// GET /api/resolver?url=<enlace>
// Funciona como función de Vercel y también desde server.js.

const { resolver } = require('../lib/resolver.js');

function responder(res, codigo, datos) {
  res.statusCode = codigo;
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.setHeader('cache-control', 'no-store');
  res.setHeader('access-control-allow-origin', '*');
  res.end(JSON.stringify(datos));
}

function crearManejador(opciones) {
  return async function manejar(req, res) {
    if (req.method === 'OPTIONS') {
      res.statusCode = 204;
      res.setHeader('access-control-allow-origin', '*');
      res.setHeader('access-control-allow-methods', 'GET, OPTIONS');
      res.end();
      return;
    }
    if (req.method !== 'GET') {
      responder(res, 405, { error: 'Usa GET /api/resolver?url=<enlace>' });
      return;
    }

    const enlace = new URL(req.url, 'http://localhost').searchParams.get('url');
    if (!enlace) {
      responder(res, 400, { error: 'Falta el parámetro ?url=' });
      return;
    }
    if (enlace.length > 4096) {
      responder(res, 400, { error: 'El enlace es demasiado largo.' });
      return;
    }

    try {
      responder(res, 200, await resolver(enlace, opciones));
    } catch (e) {
      const codigo = e.paraUsuario ? e.codigo || 400 : 500;
      responder(res, codigo, { error: e.paraUsuario ? e.message : 'Error inesperado al revisar el enlace.' });
    }
  };
}

module.exports = crearManejador();
module.exports.crearManejador = crearManejador;
