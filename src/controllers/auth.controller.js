const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const prisma = require("../config/prisma");
// const bcrypt = require("bcryptjs");

exports.login = async (req, res) => {
  try {
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

    // 👇 incluye nombre, email y role en el payload
    const token = jwt.sign(
      { id: user.id, nombre: user.nombre, role: user.role, email: user.email },
      process.env.JWT_SECRET,
      { expiresIn: "8h" }
    );

    // 👇 devuelve también el objeto user
    res.json({
      token,
      user: {
        id: user.id,
        nombre: user.nombre,
        role: user.role,
        email: user.email,
      },
    });
  } catch (error) {
    console.error("❌ Error en /auth/login:", error);
    res.status(500).json({ message: "Error interno al iniciar sesión" });
  }
};

// Activar cuenta
exports.activarCuenta = async (req, res) => {
  const { token, password } = req.body;

  if (!password || password.length < 6) {
    return res.status(400).json({ message: "La contraseña debe tener al menos 6 caracteres" });
  }

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

  await prisma.usuarioLog.create({
    data: { usuarioId: user.id, evento: "ACTIVADO", realizadoPorId: null },
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

// Obtener usuario actual
exports.me = async (req, res) => {
  try {
    const user = await prisma.usuario.findUnique({
      where: { id: req.user.id },
      select: {
        id: true,
        nombre: true,
        role: true,
        email: true,
        activo: true,
      },
    });

    if (!user) {
      return res.status(404).json({ message: "Usuario no encontrado" });
    }

    res.json(user);
  } catch (error) {
    console.error("❌ Error en /auth/me:", error);
    res.status(500).json({ message: "Error obteniendo usuario actual" });
  }
};

