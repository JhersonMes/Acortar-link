'use strict';

// Resolución de enlaces en el servidor (Node): sigue las redirecciones una a
// una para poder mostrar todo el recorrido. No visita direcciones internas
// (localhost, 192.168.x.x, etc.) para que nadie use el servicio contra la red
// donde está alojado.

const http = require('node:http');
const https = require('node:https');
const dns = require('node:dns');
const net = require('node:net');
const zlib = require('node:zlib');
const Desacortador = require('../shared/desacortador.js');

const AGENTE =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';
const MAX_HTML = 512 * 1024;
const TIEMPO_POR_SALTO = 6000;

const bloqueadas = new net.BlockList();
for (const [red, prefijo] of [
  ['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8],
  ['169.254.0.0', 16], ['172.16.0.0', 12], ['192.0.0.0', 24], ['192.0.2.0', 24],
  ['192.168.0.0', 16], ['198.18.0.0', 15], ['198.51.100.0', 24], ['203.0.113.0', 24],
  ['224.0.0.0', 4], ['240.0.0.0', 4],
]) bloqueadas.addSubnet(red, prefijo, 'ipv4');
for (const [red, prefijo] of [
  ['::', 128], ['::1', 128], ['64:ff9b::', 96], ['100::', 64], ['2001:db8::', 32],
  ['fc00::', 7], ['fe80::', 10], ['ff00::', 8],
]) bloqueadas.addSubnet(red, prefijo, 'ipv6');

// ::ffff:127.0.0.1 o ::ffff:7f00:1 -> 127.0.0.1
function ipv4Mapeada(ip) {
  const m = /^::ffff:(.+)$/i.exec(ip);
  if (!m) return null;
  if (net.isIPv4(m[1])) return m[1];
  const h = /^([0-9a-f]{1,4}):([0-9a-f]{1,4})$/i.exec(m[1]);
  if (!h) return null;
  const alto = parseInt(h[1], 16);
  const bajo = parseInt(h[2], 16);
  return [alto >> 8, alto & 255, bajo >> 8, bajo & 255].join('.');
}

function esDireccionInterna(ip) {
  const limpia = String(ip).replace(/^\[|\]$/g, '');
  const tipo = net.isIP(limpia);
  if (tipo === 4) return bloqueadas.check(limpia, 'ipv4');
  if (tipo === 6) {
    const v4 = ipv4Mapeada(limpia);
    return v4 ? bloqueadas.check(v4, 'ipv4') : bloqueadas.check(limpia, 'ipv6');
  }
  return true;
}

function errorInterno(host) {
  return Desacortador.error('El enlace apunta a una dirección interna (' + host + ') y no se permite visitarla.', 400);
}

// Se valida la IP en el momento de conectar, así no sirve cambiar el DNS
// entre la comprobación y la conexión.
function busquedaSegura(host, opciones, callback) {
  dns.lookup(host, { ...opciones, all: true }, (err, direcciones) => {
    if (err) return callback(err);
    if (direcciones.some((d) => esDireccionInterna(d.address))) return callback(errorInterno(host));
    if (opciones.all) return callback(null, direcciones);
    return callback(null, direcciones[0].address, direcciones[0].family);
  });
}

// Lee el HTML (como máximo MAX_HTML bytes). Devuelve una función que corta la
// lectura y entrega lo que haya llegado hasta ese momento.
function leerCuerpo(respuesta, entregar) {
  const codificacion = String(respuesta.headers['content-encoding'] || '').toLowerCase();
  let flujo = respuesta;
  if (codificacion === 'gzip' || codificacion === 'x-gzip') flujo = respuesta.pipe(zlib.createGunzip());
  else if (codificacion === 'deflate') flujo = respuesta.pipe(zlib.createInflate());
  else if (codificacion === 'br') flujo = respuesta.pipe(zlib.createBrotliDecompress());

  const trozos = [];
  let total = 0;
  let listo = false;
  const terminar = () => {
    if (listo) return;
    listo = true;
    respuesta.destroy();
    if (flujo !== respuesta) flujo.destroy();
    entregar(Buffer.concat(trozos).toString('utf8'));
  };
  flujo.on('data', (trozo) => {
    trozos.push(trozo);
    total += trozo.length;
    if (total >= MAX_HTML) terminar();
  });
  flujo.on('end', terminar);
  flujo.on('error', terminar);
  respuesta.on('error', terminar);
  return terminar;
}

// Visita una URL sin seguir redirecciones.
function visitar(direccion, opciones) {
  return new Promise((resolve, reject) => {
    const url = new URL(direccion);
    const host = url.hostname.replace(/^\[|\]$/g, '');
    if (!opciones.permitirInternas && net.isIP(host) && esDireccionInterna(host)) {
      reject(errorInterno(host));
      return;
    }

    let cortarLectura = null;
    let terminado = false;
    const reloj = setTimeout(() => {
      if (cortarLectura) cortarLectura();
      else peticion.destroy(new Error('el sitio tardó demasiado en responder'));
    }, opciones.tiempo);
    const fin = (accion, valor) => {
      if (terminado) return;
      terminado = true;
      clearTimeout(reloj);
      accion(valor);
    };

    const cliente = url.protocol === 'https:' ? https : http;
    const peticion = cliente.request(url, {
      method: 'GET',
      headers: {
        'user-agent': AGENTE,
        accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'accept-language': 'es-ES,es;q=0.9,en;q=0.8',
        'accept-encoding': 'gzip, deflate, br',
      },
      lookup: opciones.permitirInternas ? undefined : busquedaSegura,
    }, (respuesta) => {
      const estado = respuesta.statusCode;
      const ubicacion = respuesta.headers.location;
      if (estado >= 300 && estado < 400 && ubicacion) {
        respuesta.destroy();
        fin(resolve, { estado, ubicacion });
        return;
      }
      if (/html/i.test(String(respuesta.headers['content-type'] || ''))) {
        cortarLectura = leerCuerpo(respuesta, (html) => fin(resolve, { estado, html }));
        return;
      }
      respuesta.destroy();
      fin(resolve, { estado });
    });
    peticion.on('error', (e) => fin(reject, e.paraUsuario ? e : new Error(traducirError(e))));
    peticion.end();
  });
}

function traducirError(e) {
  switch (e.code) {
    case 'ENOTFOUND':
    case 'EAI_AGAIN':
      return 'el dominio no existe';
    case 'ECONNREFUSED':
      return 'el sitio rechazó la conexión';
    case 'ECONNRESET':
      return 'el sitio cortó la conexión';
    case 'CERT_HAS_EXPIRED':
    case 'DEPTH_ZERO_SELF_SIGNED_CERT':
    case 'UNABLE_TO_VERIFY_LEAF_SIGNATURE':
    case 'ERR_TLS_CERT_ALTNAME_INVALID':
      return 'el certificado de seguridad del sitio no es válido';
    default:
      return e.message || 'error de red';
  }
}

/**
 * Resuelve un enlace acortado.
 * opciones: { maxSaltos, plazoTotal, tiempo, permitirInternas, dominiosExtra }
 */
function resolver(entrada, opciones) {
  const op = { tiempo: TIEMPO_POR_SALTO, ...opciones };
  const obtener = (url, restante) => visitar(url, {
    tiempo: Math.min(op.tiempo, restante),
    permitirInternas: !!op.permitirInternas,
  });
  return Desacortador.resolverCon(entrada, obtener, op);
}

module.exports = { resolver, visitar, esDireccionInterna };
