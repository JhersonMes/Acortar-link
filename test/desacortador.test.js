'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const D = require('../shared/desacortador.js');

const b64 = (texto) => Buffer.from(texto).toString('base64');
const b64url = (texto) => Buffer.from(texto).toString('base64url');

test('normalizarEntrada acepta enlaces sin https y textos con un enlace dentro', () => {
  assert.equal(D.normalizarEntrada('bit.ly/abc'), 'https://bit.ly/abc');
  assert.equal(D.normalizarEntrada('  https://tinyurl.com/x  '), 'https://tinyurl.com/x');
  assert.equal(D.normalizarEntrada('mira esto: https://bit.ly/abc.'), 'https://bit.ly/abc');
  assert.equal(D.normalizarEntrada('hola mundo'), null);
  assert.equal(D.normalizarEntrada('javascript:alert(1)'), null);
  assert.equal(D.normalizarEntrada('ftp://sitio.com/a'), null);
  assert.equal(D.normalizarEntrada(''), null);
});

test('ouo.io: destino en ?s= sin codificar, con sus propios parámetros', () => {
  assert.equal(
    D.extraerDestino('https://ouo.io/qs/AbC123?s=https://ejemplo.com/a?b=1&c=2'),
    'https://ejemplo.com/a?b=1&c=2',
  );
});

test('linkvertise: destino en Base64 dentro de ?r=', () => {
  const r = encodeURIComponent(b64('https://ejemplo.com/descarga'));
  assert.equal(D.extraerDestino(`https://linkvertise.com/12345/archivo/dynamic?r=${r}`), 'https://ejemplo.com/descarga');
  assert.equal(
    D.extraerDestino(`https://link-to.net/1/2/dynamic/?r=${b64url('https://ejemplo.com/x?y=1')}`),
    'https://ejemplo.com/x?y=1',
  );
});

test('Base64 con "+" sin codificar en la query', () => {
  // "https://ejemplo.com/>>>" en Base64 contiene "+"
  const valor = b64('https://ejemplo.com/>>>?');
  assert.ok(valor.includes('+') || valor.includes('/'));
  assert.equal(D.extraerDestino('https://ouo.io/go?x=' + valor), 'https://ejemplo.com/%3E%3E%3E?');
});

test('redirectores de Google, Facebook y YouTube', () => {
  assert.equal(
    D.extraerDestino('https://www.google.com/url?q=https%3A%2F%2Fejemplo.com%2F&sa=D&ust=1'),
    'https://ejemplo.com/',
  );
  assert.equal(D.extraerDestino('https://www.google.com.pe/url?q=https://ejemplo.pe/'), 'https://ejemplo.pe/');
  assert.equal(
    D.extraerDestino('https://l.facebook.com/l.php?u=https%3A%2F%2Fejemplo.com%2Fp&h=AT0abc'),
    'https://ejemplo.com/p',
  );
  assert.equal(
    D.extraerDestino('https://www.youtube.com/redirect?event=video_description&redir_token=QUFFLUhqbTNa&q=https%3A%2F%2Fejemplo.com&v=x'),
    'https://ejemplo.com/',
  );
});

test('no confunde una búsqueda de Google con un redirector', () => {
  assert.equal(D.extraerDestino('https://www.google.com/search?q=https://ejemplo.com'), null);
  assert.equal(D.saltoAutomatico('https://www.google.com/search?q=https://ejemplo.com'), null);
});

test('destino en la ruta, en la query completa y en el #', () => {
  assert.equal(D.extraerDestino('https://sh.st/st/abc123/https://ejemplo.com/z'), 'https://ejemplo.com/z');
  assert.equal(D.extraerDestino('https://href.li/?https://ejemplo.com/a?b=c'), 'https://ejemplo.com/a?b=c');
  assert.equal(D.extraerDestino('https://adf.ly/go/' + b64url('https://ejemplo.com/ruta')), 'https://ejemplo.com/ruta');
  assert.equal(D.extraerDestino('https://ouo.io/x#https%3A%2F%2Fejemplo.com%2F'), 'https://ejemplo.com/');
});

test('doble codificación y doble Base64', () => {
  assert.equal(D.extraerDestino('https://out.reddit.com/t3?url=https%253A%252F%252Fejemplo.com%252F'), 'https://ejemplo.com/');
  assert.equal(D.extraerDestino('https://ouo.io/a?r=' + b64(b64('https://ejemplo.com/'))), 'https://ejemplo.com/');
});

test('sigue destinos anidados', () => {
  const interno = 'https://l.facebook.com/l.php?u=' + encodeURIComponent('https://ejemplo.com/final');
  assert.equal(
    D.extraerDestino('https://www.google.com/url?q=' + encodeURIComponent(interno)),
    'https://ejemplo.com/final',
  );
});

test('en sitios desconocidos solo usa parámetros típicos', () => {
  assert.equal(D.extraerDestino('https://acortador.xyz/a?url=' + b64('https://ejemplo.com/')), 'https://ejemplo.com/');
  assert.equal(D.extraerDestino('https://acortador.xyz/a?link=https://ejemplo.com/'), 'https://ejemplo.com/');
  assert.equal(D.extraerDestino('https://blog.com/nota?compartir=https://twitter.com/x'), null);
  assert.equal(D.extraerDestino('https://archivo.org/web/2020/https://ejemplo.com'), null);
});

test('ignora destinos en el mismo sitio y protocolos peligrosos', () => {
  assert.equal(D.extraerDestino('https://linkvertise.com/login?redirect=https://linkvertise.com/panel'), null);
  assert.equal(D.extraerDestino('https://ouo.io/a?s=' + b64('javascript:alert(1)')), null);
  assert.equal(D.extraerDestino('https://ouo.io/a?s=javascript:alert(1)'), null);
  assert.equal(D.extraerDestino('https://ouo.io/AbCdEfGhIjKl'), null);
});

test('saltoAutomatico solo actúa en sitios conocidos o agregados por el usuario', () => {
  assert.equal(D.saltoAutomatico('https://cualquiera.com/login?redirect=https://otro.com/'), null);
  assert.equal(D.saltoAutomatico('https://misitio.xyz/salir?destino=https://ejemplo.com/'), null);
  assert.equal(
    D.saltoAutomatico('https://misitio.xyz/salir?destino=https://ejemplo.com/', ['misitio.xyz']),
    'https://ejemplo.com/',
  );
  assert.equal(
    D.saltoAutomatico('https://misitio.xyz/otra?destino=https://ejemplo.com/', ['misitio.xyz/salir']),
    null,
  );
  assert.equal(D.saltoAutomatico('https://ouo.io/qs/x?s=https://ejemplo.com/'), 'https://ejemplo.com/');
});

test('reglaDesdeTexto limpia lo que escribe el usuario', () => {
  assert.deepEqual(D.reglaDesdeTexto('https://www.Ejemplo.com/'), { host: 'ejemplo.com', propia: true });
  assert.deepEqual(D.reglaDesdeTexto('sitio.com/salir'), { host: 'sitio.com', ruta: '/salir', propia: true });
  assert.deepEqual(D.reglaDesdeTexto('127.0.0.1:8080'), { host: '127.0.0.1', propia: true });
  assert.equal(D.reglaDesdeTexto('no válido'), null);
  assert.equal(D.reglaDesdeTexto(''), null);
});

test('buscarEnHtml: meta refresh en cualquier orden de atributos', () => {
  const base = 'https://corto.ly/a';
  assert.deepEqual(
    D.buscarEnHtml('<meta http-equiv="refresh" content="0; url=https://ejemplo.com/">', base),
    { url: 'https://ejemplo.com/', tipo: 'meta' },
  );
  assert.deepEqual(
    D.buscarEnHtml("<META CONTENT='3;URL=/destino?a=1&amp;b=2' HTTP-EQUIV='Refresh'>", base),
    { url: 'https://corto.ly/destino?a=1&b=2', tipo: 'meta' },
  );
  assert.equal(D.buscarEnHtml('<meta http-equiv="refresh" content="30">', base), null);
});

test('buscarEnHtml: redirecciones por JavaScript', () => {
  const base = 'https://corto.ly/a';
  assert.deepEqual(
    D.buscarEnHtml('<script>window.location.replace("https:\\/\\/ejemplo.com\\/x")</script>', base),
    { url: 'https://ejemplo.com/x', tipo: 'js' },
  );
  assert.deepEqual(
    D.buscarEnHtml("<script>location.href = 'https://ejemplo.com/y';</script>", base),
    { url: 'https://ejemplo.com/y', tipo: 'js' },
  );
  assert.equal(D.buscarEnHtml('<script>location.href = "javascript:void(0)"</script>', base), null);
  assert.equal(D.buscarEnHtml('<script>if (location.href == "x") {}</script>', base), null);
  // En páginas grandes (las de anuncios) no se adivina por JavaScript.
  const grande = '<script>location.href="https://anuncio.com"</script>' + 'x'.repeat(60000);
  assert.equal(D.buscarEnHtml(grande, base), null);
});

function obtenerFalso(sitios) {
  return async (url) => {
    const respuesta = sitios[url];
    if (!respuesta) throw new Error('sin respuesta para ' + url);
    if (respuesta instanceof Error) throw respuesta;
    return respuesta;
  };
}

test('resolverCon: recorre redirecciones, meta refresh y destinos escondidos', async () => {
  const destino = 'https://ejemplo.com/final';
  const datos = await D.resolverCon('bit.ly/abc', obtenerFalso({
    'https://bit.ly/abc': { estado: 301, ubicacion: 'https://t.co/xyz' },
    'https://t.co/xyz': { estado: 200, html: '<meta http-equiv="refresh" content="0;URL=https://ouo.io/qs/1?s=' + destino + '">' },
    [destino]: { estado: 200, html: '<h1>Hola</h1>' },
  }));
  assert.equal(datos.final, destino);
  assert.equal(datos.estado, 'completo');
  assert.equal(datos.aviso, null);
  assert.deepEqual(datos.pasos.map((p) => p.via), ['http', 'meta', 'enlace']);
  assert.equal(datos.pasos[0].codigo, 301);
});

test('resolverCon: modo navegador (redirecciones ya seguidas)', async () => {
  const datos = await D.resolverCon('https://bit.ly/abc', obtenerFalso({
    'https://bit.ly/abc': { estado: 200, url: 'https://ejemplo.com/', html: '<p>ok</p>' },
    'https://ejemplo.com/': { estado: 200, html: '<p>ok</p>' },
  }));
  assert.equal(datos.final, 'https://ejemplo.com/');
  assert.deepEqual(datos.pasos.map((p) => p.via), ['http']);
});

test('resolverCon: acortador con anuncios sin destino escondido', async () => {
  const datos = await D.resolverCon('https://bit.ly/abc', obtenerFalso({
    'https://bit.ly/abc': { estado: 302, ubicacion: 'https://ouo.io/AbCd12' },
    'https://ouo.io/AbCd12': { estado: 200, html: '<html>anuncios</html>' },
  }));
  assert.equal(datos.estado, 'bloqueado');
  assert.equal(datos.final, 'https://ouo.io/AbCd12');
  assert.match(datos.aviso, /captcha/);
});

test('resolverCon: sin redirección, en círculo, demasiados saltos y errores', async () => {
  const sin = await D.resolverCon('https://ejemplo.com/', obtenerFalso({ 'https://ejemplo.com/': { estado: 200 } }));
  assert.equal(sin.estado, 'sin-cambios');

  const circulo = await D.resolverCon('https://a.com/', obtenerFalso({
    'https://a.com/': { estado: 302, ubicacion: 'https://b.com/' },
    'https://b.com/': { estado: 302, ubicacion: 'https://a.com/' },
  }));
  assert.equal(circulo.estado, 'incompleto');
  assert.match(circulo.aviso, /círculo/);

  const sitios = {};
  for (let i = 0; i < 20; i++) sitios[`https://s${i}.com/`] = { estado: 302, ubicacion: `https://s${i + 1}.com/` };
  const largo = await D.resolverCon('https://s0.com/', obtenerFalso(sitios), { maxSaltos: 5 });
  assert.equal(largo.estado, 'incompleto');
  assert.equal(largo.pasos.length, 5);

  await assert.rejects(
    D.resolverCon('https://caido.com/', obtenerFalso({ 'https://caido.com/': new Error('el dominio no existe') })),
    (e) => e.paraUsuario && e.codigo === 502 && /dominio no existe/.test(e.message),
  );

  const parcial = await D.resolverCon('https://bit.ly/a', obtenerFalso({
    'https://bit.ly/a': { estado: 301, ubicacion: 'https://caido.com/' },
    'https://caido.com/': new Error('el dominio no existe'),
  }));
  assert.equal(parcial.estado, 'incompleto');
  assert.equal(parcial.final, 'https://caido.com/');

  const roto = await D.resolverCon('https://bit.ly/b', obtenerFalso({
    'https://bit.ly/b': { estado: 301, ubicacion: 'https://ejemplo.com/borrado' },
    'https://ejemplo.com/borrado': { estado: 404 },
  }));
  assert.equal(roto.estado, 'completo');
  assert.match(roto.aviso, /404/);

  await assert.rejects(D.resolverCon('no es un enlace', obtenerFalso({})), /no parece un enlace/);
});

test('resolverCon sin servidor: solo revisa el propio enlace', async () => {
  const datos = await D.resolverCon('https://acortador.xyz/a?url=https://ejemplo.com/', null);
  assert.equal(datos.final, 'https://ejemplo.com/');
  assert.equal(datos.estado, 'completo');

  const nada = await D.resolverCon('https://bit.ly/abc', null);
  assert.equal(nada.estado, 'sin-cambios');
  assert.match(nada.aviso, /sin visitarlo/);
});
