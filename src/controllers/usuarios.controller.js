const prisma = require("../config/prisma");
const bcrypt = require("bcryptjs");

exports.crear = async (req, res) => {
  try {
    const { nombre, email, password, role, clienteId } = req.body;

    const hash = await bcrypt.hash(password, 10);

    const user = await prisma.user.create({
      data: {
        nombre,
        email,
        password: hash,
        role,
        clienteId: role === "CLIENTE" ? clienteId : null
      }
    });

    res.json(user);
  } catch (error) {
    res.status(500).json({ message: "Error al crear usuario", error });
  }
};
