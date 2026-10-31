// Importe en letras para la leyenda 1000 del comprobante (catálogo 52).
// Ej.: 1180.5 → "UN MIL CIENTO OCHENTA CON 50/100 SOLES"

const UNIDADES = ["", "UNO", "DOS", "TRES", "CUATRO", "CINCO", "SEIS", "SIETE", "OCHO", "NUEVE",
  "DIEZ", "ONCE", "DOCE", "TRECE", "CATORCE", "QUINCE", "DIECISEIS", "DIECISIETE", "DIECIOCHO", "DIECINUEVE",
  "VEINTE", "VEINTIUNO", "VEINTIDOS", "VEINTITRES", "VEINTICUATRO", "VEINTICINCO", "VEINTISEIS",
  "VEINTISIETE", "VEINTIOCHO", "VEINTINUEVE"];
const DECENAS = ["", "", "", "TREINTA", "CUARENTA", "CINCUENTA", "SESENTA", "SETENTA", "OCHENTA", "NOVENTA"];
const CENTENAS = ["", "CIENTO", "DOSCIENTOS", "TRESCIENTOS", "CUATROCIENTOS", "QUINIENTOS",
  "SEISCIENTOS", "SETECIENTOS", "OCHOCIENTOS", "NOVECIENTOS"];

function menorMil(n) {
  if (n === 0) return "";
  if (n === 100) return "CIEN";
  const c = Math.floor(n / 100);
  const r = n % 100;
  let resto;
  if (r < 30) resto = UNIDADES[r];
  else resto = DECENAS[Math.floor(r / 10)] + (r % 10 ? " Y " + UNIDADES[r % 10] : "");
  return [CENTENAS[c], resto].filter(Boolean).join(" ");
}

function enteroALetras(n) {
  if (n === 0) return "CERO";
  const millones = Math.floor(n / 1e6);
  const miles = Math.floor((n % 1e6) / 1000);
  const resto = n % 1000;
  const partes = [];
  if (millones) partes.push(millones === 1 ? "UN MILLON" : `${menorMil(millones).replace(/UNO$/, "UN")} MILLONES`);
  if (miles) partes.push(`${menorMil(miles).replace(/UNO$/, "UN")} MIL`);
  if (resto) partes.push(menorMil(resto));
  return partes.join(" ");
}

const NOMBRE_MONEDA = { PEN: "SOLES", USD: "DOLARES AMERICANOS" };

module.exports = function numeroALetras(monto, moneda = "PEN") {
  const centavosTotales = Math.round(monto * 100);
  const entero = Math.floor(centavosTotales / 100);
  const centavos = String(centavosTotales % 100).padStart(2, "0");
  return `${enteroALetras(entero)} CON ${centavos}/100 ${NOMBRE_MONEDA[moneda] || moneda}`;
};
