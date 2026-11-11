// Módulo Netwise: lo usan los usuarios con marca NETWISE y los Administradores.
const esNetwise = (user) => user?.role === "ADMIN" || user?.marca === "NETWISE";

const soloNetwise = (req, res, next) =>
  esNetwise(req.user) ? next() : res.status(403).json({ message: "Solo para el módulo Netwise" });

module.exports = { esNetwise, soloNetwise };
