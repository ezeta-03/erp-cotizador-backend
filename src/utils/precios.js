// src/utils/precios.js
function calcularPrecioAdicional(base, config) {
  const indirecto = base * (1 + config.costo_indirecto);
  const administrativo = indirecto * (1 + config.porcentaje_administrativo);
  const final = administrativo * (1 + config.rentabilidad);
  return final;
}

module.exports = { calcularPrecioAdicional };
