const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const prisma = require("../config/prisma");
// const bcrypt = require("bcryptjs");

exports.login = async (req, res) => {
  const { email, password } = req.body;

  const user = await prisma.usuario.findUnique({
    where: { email },
  });

  if (!user) {
    return res.status(401).json({ message: "Usuario no existe" });
  }

  if (!user.activo) {
    return res.status(403).json({
      message: "Tu cuenta aún no ha sido activada",
    });
  }

  const ok = await bcrypt.compare(password, user.password);

  if (!ok) {
    return res.status(401).json({ message: "Contraseña incorrecta" });
  }

  const token = jwt.sign(
    { id: user.id, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: "8h" }
  );

  res.json({ token });
};

// Activar cuenta
exports.activarCuenta = async (req, res) => {
  const { token, password } = req.body;

  const user = await prisma.usuario.findUnique({
    where: { activationToken: token },
  });

  if (!user) {
    return res.status(400).json({ message: "Token inválido" });
  }

  if (user.activationExpires < new Date()) {
    return res.status(400).json({
      message: "El link de activación ha expirado",
    });
  }

  await prisma.usuario.update({
    where: { id: user.id },
    data: {
      password: await bcrypt.hash(password, 10),
      activo: true,
      activationToken: null,
      activationExpires: null,
    },
  });

  res.json({ message: "Cuenta activada" });
};

exports.cambiarPassword = async (req, res) => {
  const { actual, nueva } = req.body;

  const user = await prisma.usuario.findUnique({
    where: { id: req.user.id },
  });

  const ok = await bcrypt.compare(actual, user.password);
  if (!ok) {
    return res.status(400).json({ message: "Contraseña actual incorrecta" });
  }

  await prisma.usuario.update({
    where: { id: user.id },
    data: {
      password: await bcrypt.hash(nueva, 10),
    },
  });

  res.json({ message: "Contraseña actualizada" });
};
