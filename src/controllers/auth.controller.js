const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const prisma = require("../config/prisma");

exports.login = async (req, res) => {
  const { email, password } = req.body;

  const user = await prisma.usuario.findUnique({
    where: { email },
  });

  if (!user) {
    return res.status(401).json({ message: "Usuario no existe" });
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
