const nodemailer = require("nodemailer");

const transporter = nodemailer.createTransport({
  host: process.env.MAIL_HOST,
  port: process.env.MAIL_PORT,
  secure: false,
  auth: {
    user: process.env.MAIL_USER,
    pass: process.env.MAIL_PASS,
  },
});

exports.sendActivationEmail = async ({ to, name, token }) => {
  const activationLink = `${process.env.FRONTEND_URL}/activar?token=${token}`;

  await transporter.sendMail({
    from: process.env.MAIL_FROM,
    to,
    subject: "Activa tu cuenta - Sistema de Cotización",
    html: `
      <h2>Hola ${name} 👋</h2>
      <p>Has sido invitado a nuestro sistema de cotización.</p>
      <p>Para activar tu cuenta, haz clic en el siguiente enlace:</p>
      <a href="${activationLink}">${activationLink}</a>
      <p><strong>Este enlace es válido una sola vez.</strong></p>
      <br/>
      <p>Saludos,<br/>Equipo de Cotización</p>
    `,
  });
};
