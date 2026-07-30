const jwt = require("jsonwebtoken");
const prisma = require("../config/prisma");

module.exports = async (req, res, next) => {
  const authHeader = req.headers.authorization;

  let token = authHeader?.split(" ")[1];

  // ✅ permitir token por query (PDF)
  if (!token && req.query.token) {
    token = req.query.token;
  }

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
};
