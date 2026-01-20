#!/bin/bash
echo "🔍 Verificando estado de Render..."
echo "=================================="

echo ""
echo "1. Health Check:"
curl -s https://erp-cotizador-backend.onrender.com/api/health

echo ""
echo ""
echo "2. Login Test:"
curl -s -X POST https://erp-cotizador-backend.onrender.com/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@demo.com","password":"123456"}'

echo ""
echo ""
echo "3. Status Code:"
curl -s -o /dev/null -w "%{http_code}" https://erp-cotizador-backend.onrender.com/api/health

echo ""
echo ""
echo "✅ Si ves 'Backend funcionando' y 'Conectada' = ¡ÉXITO!"
echo "❌ Si ves error de DATABASE_URL = Variables no configuradas"