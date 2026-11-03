// Identidad visual de Zaazmago para documentos generados en el servidor (PDF,
// Excel). Mismos valores que los tokens del frontend (src/styles/_theme.scss).
const path = require("path");

const colores = {
  naranja: "#FF6600", // acento de marca
  naranjaTexto: "#C24D00", // naranja legible como texto sobre blanco
  naranjaClaro: "#FFF0E5",
  carbon: "#161A1F", // texto principal y franjas oscuras
  texto2: "#4B5360",
  texto3: "#6B7380",
  fondo: "#F5F6F8",
  superficie2: "#F0F2F5",
  borde: "#E4E7EC",
  exito: "#059669",
  peligro: "#DC2626",
  info: "#2563EB",
  violeta: "#6366F1",
  advertencia: "#D97706",
};

// Logo claro (para fondo oscuro): va sobre la franja carbón.
const logoPath = path.join(__dirname, "..", "assets", "zaazmago_holding.png");

module.exports = { colores, logoPath };
