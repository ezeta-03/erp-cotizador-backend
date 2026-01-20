#!/bin/bash
echo "🔍 DIAGNÓSTICO COMPLETO DE RENDER"
echo "=================================="

echo ""
echo "1. Verificando conectividad básica..."
curl -s -I https://erp-cotizador-backend.onrender.com/ | head -1

echo ""
echo "2. Probando health check..."
RESPONSE=$(curl -s https://erp-cotizador-backend.onrender.com/api/health)
echo "$RESPONSE"

echo ""
echo "3. Verificando si contiene error de DATABASE_URL..."
if echo "$RESPONSE" | grep -q "DATABASE_URL"; then
    echo "❌ ERROR: DATABASE_URL no configurada en Render"
    echo ""
    echo "📋 SOLUCIÓN:"
    echo "   1. Ve a https://render.com"
    echo "   2. Selecciona 'erp-cotizador-backend'"
    echo "   3. Settings → Environment"
    echo "   4. Agrega variable: DATABASE_URL"
    echo "   5. Valor: postgresql://postgres.qlqbhyfzdzlfwsqysveb:Dulc34lm3ndr4m1$@aws-0-us-west-2.pooler.supabase.com:5432/postgres"
    echo "   6. Save"
    echo "   7. Manual Deploy → Clear build cache and deploy"
else
    echo "✅ No hay error de DATABASE_URL"
fi

echo ""
echo "4. Probando login..."
LOGIN_RESPONSE=$(curl -s -X POST https://erp-cotizador-backend.onrender.com/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@demo.com","password":"123456"}')

if echo "$LOGIN_RESPONSE" | grep -q "token"; then
    echo "✅ Login funciona correctamente"
else
    echo "❌ Login falló"
fi