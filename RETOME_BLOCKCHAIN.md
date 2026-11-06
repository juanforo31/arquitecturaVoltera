# 🔖 Punto de retome — Blockchain Voltera

> Última actualización: 2026-10-21. Lee este archivo PRIMERO al reconectar, junto con
> `SESION_BLOCKCHAIN_ESTADO.md` (detalle completo). Este es el resumen accionable.

---

## ✅ Estado actual (verificado en vivo el 2026-10-21)

| Pieza | Estado | Evidencia |
|---|---|---|
| **Git** `main` | ✅ todo pusheado | HEAD `084fce7`, árbol limpio, origin == local |
| **Gateway (Render)** | ✅ LIVE y al día | `/actuator/health` 200; `/api/v1/anclajes/comunidades` 200; red `configurada:true, disponible:true` |
| **Contrato LiquidacionP2PAnchor (Amoy)** | ✅ desplegado | `0x59965b91bE294D1da408eAc8BB5455ca1C828000`, chainId 80002 |
| **Código en GitHub** | ✅ completo | proyecto Hardhat + diagrama ya versionados (antes estaban ignorados) |
| **Front (Vercel)** | ✅ LIVE y al día | sirve `main-JNXGBHCI.js` (== build local nuevo); `/` y `/blockchain` 200; feature de comunidades desplegada el 2026-10-21 |

URLs:
- Front: https://voltera-frontend.vercel.app  (y `/blockchain`)
- Gateway: https://voltera-blockchain-gateway.onrender.com  (free tier: duerme ~15 min, cold-start ~50-90 s)
- Repo: https://github.com/vimapeco24/arquitecturaVoltera.git

---

## ❌ LO QUE FALTA POR AJUSTAR (requiere credenciales del usuario — el agente no puede)

### 1. Re-deploy del FRONT a Vercel  ✅ HECHO (2026-10-21)
Desplegado a producción con el CLI local. Vercel ahora sirve `main-JNXGBHCI.js` (== build local),
con el marketplace nuevo (comunidades, detalle, exportar, re-sincronizar, bloque/gas). Sitio público
OK (`/` y `/blockchain` 200; título "Voltera · Comunidades Energéticas").
Producción: https://voltera-frontend-d3mfd9k7o-vimapeco.vercel.app  ·  alias https://voltera-frontend.vercel.app
> Para futuros deploys: `cd Microservicios/voltera-frontend && VERCEL_TOKEN=<token> node_modules/.bin/vercel deploy --prod --yes`

### 2. (OPCIONAL) Desplegar ComunidadEnergeticaRegistry a Polygon Amoy
El contrato nuevo del padrón de comunidades está **escrito y probado (17/17 tests)** pero NO
desplegado. Hoy la comunidad funciona como metadato off-chain (suficiente para el marketplace);
desplegarlo solo añade el registro de membresía on-chain. Requiere tu wallet de prueba con POL:

```bash
cd blockchain
npm run deploy:amoy          # despliega AMBOS contratos y guarda direcciones en deployments/amoy.json
# luego poner en el gateway (Render → Environment):
#   VOLTERA_BLOCKCHAIN_REGISTRO_COMUNIDADES=<direccion_registro>
```

### 3. (SEGURIDAD) Rotar el token de Vercel  ← PENDIENTE, HAZLO YA
El `VERCEL_TOKEN` se pegó en el chat (el `vcp_0xcF...` del 2026-10-21 usado para este deploy, y el
de la sesión previa). Ambos quedaron expuestos → **revócalos en Vercel → Settings → Tokens** y
genera uno nuevo para la próxima vez. La wallet de prueba de Amoy es desechable.

---

## 🧭 Checklist rápido al volver

```bash
export PATH="/Library/Developer/CommandLineTools/usr/bin:$PATH"
cd /Users/vimapeco/Downloads/ArquitectutaNuevaGenegeracion
git log --oneline -1 && git status --short            # limpio, HEAD >= 084fce7

# gateway vivo + feature nueva (puede tardar por cold-start)
curl -s -m 120 https://voltera-blockchain-gateway.onrender.com/api/v1/anclajes/red
curl -s -m 60  -o /dev/null -w "comunidades: %{http_code}\n" \
  https://voltera-blockchain-gateway.onrender.com/api/v1/anclajes/comunidades

# ¿el front en Vercel ya es el nuevo? (busca la feature)
curl -s https://voltera-frontend.vercel.app/ | grep -oE 'main-[A-Z0-9]+\.js'
#   -> si NO es el build local nuevo, falta el deploy del punto 1
```

---

## 📦 Lo que se implementó en la última sesión (ya en git, commits 58acd2f → 084fce7)

**Gateway (retrocompatible, no rompe el contrato ya desplegado):**
- `comunidadId` como metadato OFF-CHAIN (no entra en el hash → no afecta idempotencia/verificación).
- `AnclajeResponse` expone `bloque` y `gasUsado` del recibo on-chain.
- Fix: `Web3jCadenaAdapter` llamaba `waitForTransactionReceipt` dos veces.
- Nuevo `GET /api/v1/anclajes/comunidades` (resumen por comunidad).
- Tests 6 → 8.

**Contrato (blockchain/):**
- Nuevo `ComunidadEnergeticaRegistry.sol` (padrón + membresía + `puedenCasar()`), 9 tests.
- `deploy.js` despliega ambos contratos. Total tests Hardhat: 17/17.

**Frontend (pages/blockchain):**
- Campo comunidad + regla "solo casan ofertas de la misma comunidad".
- Panel de comunidades, detalle de contrato (modal con copiar hash/txHash, bloque, gas, timeline),
  re-sincronizar desde el gateway, exportar evidencia CSV/JSON.
- `tsc` OK, `ng build` prod OK (blockchain-component 44.79 kB).

**Git / repo:**
- Arreglado el `.gitignore`: `/Blockchain/` tapaba (en macOS case-insensitive) la carpeta
  `blockchain/` del Hardhat → ahora se ignoran solo PDFs + artefactos de build, y se versiona
  el código del contrato, los tests, `deploy.js`, `hardhat.config.js`, `package.json`, el diagrama
  (`Modificados/Voltera_Arquitectura_Completa.drawio` + `.png`) y las plantillas `.env.example`
  (el `.env` real sigue ignorado).

**Validado en producción:** anclaje real con comunidad → CONFIRMADO, `bloque:50778774`,
`gasUsado:119976`; `/comunidades` agrega bien.

---

## ⚙️ Notas técnicas (no olvidar)
- **git bloqueado por licencia Xcode**: usar `export PATH="/Library/Developer/CommandLineTools/usr/bin:$PATH"` antes de cualquier `git`.
- **Render free tier duerme**: el 1er request tras inactividad puede dar HTTP 000 / tardar ~50-90 s. No es un fallo: reintentar.
- **Puerto gateway**: 8101. **Modo nube**: solo-REST (`KAFKA_ENABLED=false`), Kafka del server es LAN privada.
- **Ruta del endpoint verificar**: `/api/v1/anclajes/verificar` (NO `/api/v1/verificar`).
- **Diagrama vivo**: si se cambia arquitectura, actualizar también
  `Modificados/Voltera_Arquitectura_Completa.drawio` (regla permanente en `.kiro/steering/`).
