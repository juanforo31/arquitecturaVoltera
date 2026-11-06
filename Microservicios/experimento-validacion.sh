#!/usr/bin/env bash
# =============================================================================
# Voltera · Experimento de validación (lámina 06, Módulo 4 · Blockchain)
# =============================================================================
# Ejecuta los DOS experimentos de la lámina 06 contra el blockchain-gateway y
# mide sus criterios, incluida la PRUEBA DE INTEGRIDAD (que la cadena detecte la
# manipulación). Imprime ✓/✗ por criterio y guarda la evidencia en JSON.
#
#   EXPERIMENTO 1 — Supervisión de telemetría vía ORÁCULO (patrón Chainlink):
#     se ancla el hash de una medición y luego se VERIFICA; con los datos
#     intactos -> integro:true; con los datos ALTERADOS -> integro:false
#     (100% de alteraciones detectadas). Publicación en <=60 s.
#
#   EXPERIMENTO 2 — Generación de NFT (ERC-721):
#     se emite un certificado (token único), se TRANSFIERE (trazable) y se
#     intenta una EMISIÓN DUPLICADA para el mismo (medidor, periodo), que debe
#     ser RECHAZADA (0 duplicados · 100% intentos duplicados rechazados).
#
# USO:
#   ./experimento-validacion.sh                      # contra el gateway público (Render)
#   GATEWAY=http://localhost:8101 ./experimento-validacion.sh
#
# REQUISITOS: bash, curl, python3 (usa el de CommandLineTools si el del sistema
# está bloqueado por la licencia de Xcode). No requiere Docker ni la LAN.
# =============================================================================
set -uo pipefail

GATEWAY="${GATEWAY:-https://voltera-blockchain-gateway.onrender.com}"
MEDIDOR="${MEDIDOR:-MEDIDOR-IOT-EXP06}"
PERIODO="${PERIODO:-202610}"
PROP="${PROP:-0x1111111111111111111111111111111111111111}"
OTRO="${OTRO:-0x2222222222222222222222222222222222222222}"
EMISOR="${EMISOR:-0xB7aCd8EEeE86Be961EAf832657b3B6807220fbCf}"

PY="${PY:-python3}"
if ! printf '{}' | "$PY" -c 'import sys,json;json.load(sys.stdin)' >/dev/null 2>&1; then
  [ -x /Library/Developer/CommandLineTools/usr/bin/python3 ] && PY=/Library/Developer/CommandLineTools/usr/bin/python3
fi

OUT_DIR="${OUT_DIR:-evidencia-experimento}"
TS="$(date +%Y%m%d-%H%M%S)"
mkdir -p "$OUT_DIR"
EVID="$OUT_DIR/validacion-$TS.json"

PASS=0; FAIL=0
ok()  { echo "   ✓ $1"; PASS=$((PASS+1)); }
bad() { echo "   ✗ $1"; FAIL=$((FAIL+1)); }
jqpy(){ "$PY" -c "import sys,json;d=json.load(sys.stdin);print($1)" 2>/dev/null; }

echo "============================================================"
echo " Voltera · Experimento de validación (lámina 06)"
echo " Gateway: $GATEWAY"
echo " Medidor: $MEDIDOR · periodo: $PERIODO"
echo "============================================================"

TXID="EXP06-$TS"
BODY=$(cat <<JSON
{"transaccionId":"$TXID","vendedorId":"$PROP","compradorId":"$OTRO","energiaWh":1000000,"precioPorKwh":"450","valorTotal":"450000","liquidadaEn":"$(date -u +%Y-%m-%dT%H:%M:%SZ)","comunidadId":"COMUNIDAD-SOLAR-01"}
JSON
)

# ---------------------------------------------------------------------------
echo ""
echo "── EXPERIMENTO 1 · Supervisión de telemetría vía oráculo (prueba de integridad)"
T0=$(date +%s)
ANCLA=$(curl -s -X POST "$GATEWAY/api/v1/anclajes" -H 'Content-Type: application/json' -d "$BODY")
T1=$(date +%s)
ESTADO=$(printf '%s' "$ANCLA" | jqpy "d.get('estado','?')")
HASH=$(printf '%s' "$ANCLA" | jqpy "d.get('hashCasacion','')")
DUR=$((T1-T0))
echo "   anclaje: estado=$ESTADO hash=${HASH:0:14}… (t=${DUR}s)"
[ -n "$HASH" ] && ok "medición anclada con evidencia verificable (hash on-chain)" || bad "no se obtuvo hash"
[ "$DUR" -le 60 ] && ok "publicación de evidencia en <=60 s (t=${DUR}s)" || bad "publicación tardó más de 60 s"

# Verificación con datos INTACTOS -> debe ser integro:true
VER_OK=$(curl -s -X POST "$GATEWAY/api/v1/anclajes/verificar" -H 'Content-Type: application/json' -d "$BODY")
INTEGRO_OK=$(printf '%s' "$VER_OK" | jqpy "str(d.get('integro')).lower()")
[ "$INTEGRO_OK" = "true" ] && ok "datos originales -> integro:true (coincidencia original==verificado)" \
                            || bad "datos originales no verificaron (integro=$INTEGRO_OK)"

# PRUEBA DE INTEGRIDAD: datos ALTERADOS (energiaWh distinto) -> debe ser integro:false
BODY_ALT=$(printf '%s' "$BODY" | sed 's/"energiaWh":1000000/"energiaWh":999999/')
VER_ALT=$(curl -s -X POST "$GATEWAY/api/v1/anclajes/verificar" -H 'Content-Type: application/json' -d "$BODY_ALT")
INTEGRO_ALT=$(printf '%s' "$VER_ALT" | jqpy "str(d.get('integro')).lower()")
[ "$INTEGRO_ALT" = "false" ] && ok "datos ALTERADOS -> integro:false (100% alteraciones DETECTADAS)" \
                             || bad "la cadena NO detectó la manipulación (integro=$INTEGRO_ALT)"

# ---------------------------------------------------------------------------
echo ""
echo "── EXPERIMENTO 2 · Generación de NFT ERC-721 (unicidad + rechazo de duplicados)"
NFT_BODY=$(cat <<JSON
{"emisor":"$EMISOR","propietario":"$PROP","idMedidor":"$MEDIDOR","consumoNetoMensualWh":120000,"periodo":$PERIODO}
JSON
)
T2=$(date +%s)
EMIT=$(curl -s -X POST "$GATEWAY/api/v1/certificados" -H 'Content-Type: application/json' -d "$NFT_BODY")
T3=$(date +%s)
TOKEN=$(printf '%s' "$EMIT" | jqpy "d.get('tokenId','')")
DUR2=$((T3-T2))
[ -n "$TOKEN" ] && ok "token emitido con identificador único (tokenId=$TOKEN)" || bad "no se emitió el token"
[ "$DUR2" -le 60 ] && ok "confirmación de transacción en <=60 s (t=${DUR2}s)" || bad "emisión tardó más de 60 s"

# Transferencia trazable (de PROP a OTRO)
if [ -n "$TOKEN" ]; then
  TRANSF=$(curl -s -X POST "$GATEWAY/api/v1/certificados/$TOKEN/transferir" -H 'Content-Type: application/json' -d "{\"hacia\":\"$OTRO\"}")
  NUEVO_PROP=$(printf '%s' "$TRANSF" | jqpy "d.get('propietario','')")
  [ "$NUEVO_PROP" = "$OTRO" ] && ok "transferencia trazable (propietario $PROP -> $OTRO)" \
                              || bad "la transferencia no se reflejó (propietario=$NUEVO_PROP)"
fi

# PRUEBA DE UNICIDAD: intento de EMISIÓN DUPLICADA para el mismo (medidor, periodo) -> debe fallar (HTTP>=400)
HTTP_DUP=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$GATEWAY/api/v1/certificados" -H 'Content-Type: application/json' -d "$NFT_BODY")
[ "$HTTP_DUP" -ge 400 ] && ok "emisión duplicada RECHAZADA (HTTP $HTTP_DUP · 0 duplicados)" \
                        || bad "se permitió un duplicado (HTTP $HTTP_DUP)"

# ---------------------------------------------------------------------------
echo ""
echo "── Resumen"
echo "   Criterios superados: $PASS · fallidos: $FAIL"
cat > "$EVID" <<JSON
{
  "timestamp": "$TS",
  "gateway": "$GATEWAY",
  "experimento1_oraculo": {
    "transaccionId": "$TXID", "estado": "$ESTADO", "hash": "$HASH",
    "publicacion_segundos": $DUR,
    "integridad_datos_originales": "$INTEGRO_OK",
    "integridad_datos_alterados": "$INTEGRO_ALT"
  },
  "experimento2_nft": {
    "idMedidor": "$MEDIDOR", "periodo": $PERIODO, "tokenId": "${TOKEN:-null}",
    "confirmacion_segundos": $DUR2,
    "emision_duplicada_http": $HTTP_DUP
  },
  "criterios_ok": $PASS, "criterios_fallidos": $FAIL
}
JSON
echo "   Evidencia: $EVID"
[ "$FAIL" -eq 0 ] && { echo "   ✅ TODOS LOS CRITERIOS SUPERADOS"; exit 0; } || { echo "   ⚠ hubo criterios fallidos"; exit 1; }
