require('dotenv').config();
const nodemailer = require("nodemailer");

async function testMail() {
  console.log("🧪 Probando envío de correo...\n");

  // Verificar variables de entorno
  const requiredVars = ['MAIL_HOST', 'MAIL_PORT', 'MAIL_USER', 'MAIL_PASS', 'MAIL_FROM'];
  console.log("📋 Variables de mail:");
  requiredVars.forEach(varName => {
    const value = process.env[varName];
    if (value) {
      if (varName === 'MAIL_PASS') {
        console.log(`   ✅ ${varName}: ****`);
      } else {
        console.log(`   ✅ ${varName}: ${value}`);
      }
    } else {
      console.log(`   ❌ ${varName}: NO CONFIGURADO`);
    }
  });

  // Crear transporter
  const transporter = nodemailer.createTransport({
    host: process.env.MAIL_HOST,
    port: process.env.MAIL_PORT,
    secure: false,
    auth: {
      user: process.env.MAIL_USER,
      pass: process.env.MAIL_PASS,
    },
  });

  try {
    // Verificar conexión
    console.log("\n🔗 Verificando conexión con SMTP...");
    await transporter.verify();
    console.log("   ✅ Conexión exitosa");

    // Enviar correo de prueba
    console.log("\n📧 Enviando correo de prueba...");
    const info = await transporter.sendMail({
      from: process.env.MAIL_FROM,
      to: process.env.MAIL_USER, // Enviar a ti mismo
      subject: "Test - Sistema de Cotización",
      html: "<h2>Test exitoso</h2><p>El envío de correos funciona correctamente.</p>",
    });

    console.log("   ✅ Correo enviado exitosamente");
    console.log(`   📨 ID del mensaje: ${info.messageId}`);

  } catch (error) {
    console.log("   ❌ Error:", error.message);
    if (error.code === 'EAUTH') {
      console.log("   💡 Posible problema: Credenciales incorrectas o autenticación 2FA requerida");
    } else if (error.code === 'ECONNREFUSED') {
      console.log("   💡 Posible problema: Puerto o host incorrecto");
    }
  }
}

testMail();