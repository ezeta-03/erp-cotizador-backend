// utils/glosa.js
function generarGlosa(producto, adicionales) {
  let partes = [producto.servicio || producto.nombre];

  adicionales.forEach((a) => {
    partes.push(a.seleccionado ? `con ${a.adicional.nombre}` : `sin ${a.adicional.nombre}`);
  });

  return partes.join(" ");
}

module.exports = { generarGlosa };
