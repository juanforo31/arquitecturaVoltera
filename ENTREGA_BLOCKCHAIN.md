# Entrega — Experimento Blockchain · Voltera (ARTI4208 · Módulo 4)

> Documento maestro de la entrega. Punto único de entrada para el evaluador.
> Caso: **liquidación del mercado energético P2P + certificados de origen renovable**.
> Todo 100% gratuito sobre **Polygon Amoy** (testnet). Última actualización: 2026-11-03.

---

## 1. Qué es esta POC

Voltera (plataforma de energía distribuida) usa blockchain para dar **prueba de integridad y no
repudio** a dos actos de alto valor que ocurren entre partes que no se confían del todo:

1. **Liquidación del mercado P2P** — se ancla on-chain el *hash* de cada casación (quién vendió, a
   quién, cuántos kWh, a qué precio, en qué intervalo). El regulador puede auditar sin confiar en el
   operador.
2. **Certificados de origen renovable** — se tokenizan como **NFT ERC-721** únicos; se transfieren
   billetera→billetera de forma trazable y no se pueden duplicar.

El diseño sale del **árbol de decisión de 9 compuertas** del curso (ver `BLOCKCHAIN_VOLTERA.md §5`):
cadena justificada (gates 1/4/7), cadena **fuera del camino crítico** (gate 6, confirmación por
evento Kafka), **solo el hash on-chain** (gate 8, off-chain storage).

---

## 2. Arquitectura de la DApp (3 zonas)

```
OFF-CHAIN                         BORDE                          ON-CHAIN
─────────                         ─────                          ────────
Angular SPA  ─▶ WSO2 / BFF ─▶  blockchain-gateway (web3j) ─JSON-RPC▶  Polygon Amoy
microservicios Spring Boot        · oráculo (empuja hash)              · LiquidacionP2PAnchor (LIVE)
(liquidacion-p2p, etc.)           · indexador (escucha emit)          · ComunidadEnergeticaRegistry
        ▲                         · OUTBOX + relay                     · CesionCertificadoMultisig
        └── evento Kafka ◀────────┘ (gate 6)                           · CertificadoOrigenNFT (ERC-721)
```

- **RPC vía un tercero gratuito** (publicnode / dRPC / Alchemy free tier) — sin nodo propio.
- **Confirmación por evento** (gate 6): el gateway republica `LiquidacionAnclada` en Redpanda/Kafka.
- Diagrama vivo completo: `Modificados/Voltera_Arquitectura_Completa.drawio` (capa 4 = blockchain).

---

## 3. Componentes de la entrega

| Capa | Ubicación | Estado |
|---|---|---|
| **Contratos Solidity (4)** | `Blockchain/contracts/` | ✅ Compilan (solc 0.8.24 / Cancun), **37 tests**, lint limpio. |
| **Gateway de borde** (web3j, hexagonal) | `Microservicios/ServiciosDeNegocio/blockchain-gateway-service/` | ✅ **15 tests**, BUILD SUCCESS. Desplegado en Render. |
| **Frontend** (Angular) | `Microservicios/voltera-frontend/` | ✅ Build OK. 4 páginas del Módulo 4 + página de experimento. |
| **CI** | `.github/workflows/blockchain-ci.yml` | ✅ lint + compile + test + integridad + coverage. |
| **Diagrama vivo** | `Modificados/Voltera_Arquitectura_Completa.{drawio,png}` | ✅ Capa blockchain. |

### 3.1 Contratos
| Contrato | Patrón / familia | Estado on-chain (Amoy) |
|---|---|---|
| `LiquidacionP2PAnchor` | off-chain storage + Embedded Permission | **LIVE** `0xd0Ef1686fcAF3f026134DE4188bd977c4EBcf530` |
| `ComunidadEnergeticaRegistry` | contract registry | ⏳ listo; pendiente de deploy (gas) |
| `CesionCertificadoMultisig` | Multiple Authorization (2 firmas) | ⏳ listo; pendiente de deploy (gas) |
| `CertificadoOrigenNFT` | Tokenización · ERC-721 no fungible | ⏳ listo; pendiente de deploy (gas) |

### 3.2 Frontend (Módulo 4)
- `/blockchain` — Marketplace P2P (libro de órdenes, casación, anclaje on-chain, verificación).
- `/certificados` — Certificados NFT (emitir, transferir billetera→billetera, quemar, libro mayor).
- `/microservicios-cadena` — 2 microservicios DDD lámina 04 (quién toca la cadena y quién no).
- `/experimento-validacion` — **Lámina 06**: ejecuta los 2 experimentos desde la UI con criterios ✓/✗.

---

## 4. El experimento de validación (lámina 06)

### Experimento 1 — Oráculo + prueba de integridad
| Criterio | Cómo se mide |
|---|---|
| Medición anclada con evidencia verificable | el anclaje devuelve `hashCasacion` |
| Publicación ≤ 60 s | se cronometra el POST de anclaje |
| Datos originales → `integro:true` | `POST /anclajes/verificar` con el payload original |
| **Datos alterados → `integro:false`** | se altera `energiaWh` y se re-verifica: la cadena **detecta la manipulación** |

### Experimento 2 — NFT ERC-721
| Criterio | Cómo se mide |
|---|---|
| Token emitido con `tokenId` único | `POST /certificados` devuelve el tokenId |
| Confirmación ≤ 60 s | se cronometra la emisión |
| Transferencia trazable billetera→billetera | `POST /certificados/{id}/transferir` y se comprueba el nuevo propietario |
| **0 duplicados** | emitir con mismo `(idMedidor, periodo)` → **rechazado** (HTTP 4xx / revert on-chain) |

Se puede correr **desde la UI** (`/experimento-validacion`) o con el script
`Microservicios/experimento-validacion.sh`. Evidencia previa en `Microservicios/evidencia-experimento/`.

---

## 5. Cómo reproducir (de un tirón)

### 5.1 Contratos — sin internet, sin gas
```bash
cd Blockchain
npm install
npm run check        # lint + compile + 37 tests
npm run integridad   # demo de los 4 contratos en memoria (prueba de integridad + unicidad)
npm run test:gas     # (opcional) reporte de coste de gas por función
npm run coverage     # (opcional) cobertura de los contratos
```

### 5.2 Camino on-chain real (anclaje confirmado en Amoy, usa el contrato LIVE)
```bash
cd Blockchain
AMOY_RPC_URL=https://polygon-amoy-bor-rpc.publicnode.com \
  npx hardhat run scripts/anclar-prueba.js --network amoy
# -> imprime txHash + bloque + gasUsed, verificable en amoy.polygonscan.com
```

### 5.3 Backend (gateway)
```bash
cd Microservicios/ServiciosDeNegocio/blockchain-gateway-service
./mvnw test                 # 15 tests
./mvnw spring-boot:run      # arranca en :8101 (modo demo si no hay RPC/clave)
```

### 5.4 Frontend
```bash
cd Microservicios/voltera-frontend
npm install && npm run build       # build de producción
# en vivo: https://voltera-frontend.vercel.app/experimento-validacion
```

---

## 6. Qué falta (acciones del usuario, no de código)

Para dejar los 3 contratos restantes LIVE y que el anclaje P2P confirme desde Render:

1. **Recargar gas de prueba:** faucet de Amoy → wallet `0xa0A18C1D64272f9a6a248Deb5106994F5D8AFDf2`
   (~0.2 POL). https://faucet.polygon.technology (red Amoy, token POL).
2. **Desplegar los faltantes** (preserva el anchor LIVE):
   ```bash
   cd Blockchain
   AMOY_RPC_URL=https://polygon-amoy-bor-rpc.publicnode.com npm run deploy:faltantes
   ```
3. **Render:** poner `VOLTERA_BLOCKCHAIN_RPC_URL = https://polygon-amoy-bor-rpc.publicnode.com`
   (el `drpc.org` rechaza el envío de transacciones con "Temporary internal error").

Nada de esto requiere cambios de código: todo está escrito, probado y versionado.

---

## 7. Documentos relacionados
- `BLOCKCHAIN_VOLTERA.md` — fundamentos, árbol de decisión y diseño (secciones 5/6/7).
- `PATRONES_BLOCKCHAIN_VOLTERA.md` — los patrones de la lámina 05 (off-chain, oráculo, multisig, NFT).
- `EXPERIMENTO_VALIDACION_VOLTERA.md` — detalle del experimento de la lámina 06.
- `Blockchain/README.md` — guía técnica de los contratos y despliegue.
- `SESION_BLOCKCHAIN_ESTADO.md` — bitácora de estado entre sesiones.
