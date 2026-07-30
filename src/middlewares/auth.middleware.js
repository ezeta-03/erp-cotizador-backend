const jwt = require("jsonwebtoken");
const prisma = require("../config/prisma");

async function verificarToken(token, req, res, next) {
  if (!token) {
    return res.status(401).json({ message: "No token" });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    const usuario = await prisma.usuario.findUnique({
      where: { id: decoded.id },
      select: { activo: true },
    });
    if (!usuario || !usuario.activo) {
      return res.status(401).json({ message: "Cuenta desactivada" });
    }

    req.user = decoded;
    next();
  } catch {
    res.status(401).json({ message: "Token inválido" });
  }
}

module.exports = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  const token = authHeader?.split(" ")[1];
  await verificarToken(token, req, res, next);
};

// Variante que además acepta el token por query string (?token=...).
// Solo debe usarse en rutas abiertas directamente por el navegador (ej. descarga de PDF),
// donde no es posible enviar un header Authorization.
module.exports.conQueryToken = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  const token = authHeader?.split(" ")[1] || req.query.token;
  await verificarToken(token, req, res, next);
};
