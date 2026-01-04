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

  await prisma.usuario.update({
    where: { id: user.id },
    data: {
      password: await bcrypt.hash(password, 10),
      activo: true,
      activationToken: null,
    },
  });

  res.json({ message: "Cuenta activada" });
};
