# 06 · Experimento de validación — Voltera

> Entregable del slide **06 · Experimento de validación** (ARTI-4208, Módulo 4 · 30% de la nota).
> Incluye **al menos una prueba de integridad** (que la cadena detecte la manipulación).
>
> Ejecutable de 3 formas: (a) desde el front en `/experimento-validacion`
> (botón "Ejecutar"), (b) por consola con `Microservicios/experimento-validacion.sh`
> (guarda evidencia JSON), (c) por tests automatizados (Hardhat / JUnit).

---

## Experimento 1 · Supervisión de telemetría vía oráculo

| Campo | Contenido |
|---|---|
| **Experimento** | Enviar mediciones de los dispositivos IoT a la cadena a través del servicio de oráculo (gateway, patrón Chainlink) para registrar evidencia verificable en blockchain. |
| **Hipótesis** | Si integramos el oráculo con la telemetría de los medidores, podremos verificar la integridad de los datos energéticos, detectar alteraciones y dar trazabilidad del proceso. |
| **Métrica y criterio** | 100% de las mediciones con evidencia verificable; ≥99% de coincidencia entre datos originales y verificados; **detección del 100% de las alteraciones** introducidas deliberadamente; publicación de evidencia en ≤ 60 s. |
| **Resultado y aprendizaje** | Mediciones verificables mediante hash + registro on-chain. Aprendizaje: la cadena verifica la **integridad** de la información registrada; la **autenticidad de origen** requiere mediciones firmadas y fuentes confiables (el oráculo es un punto de confianza). |

**Procedimiento (prueba de integridad):**
1. `POST /api/v1/anclajes` con la medición → se guarda el `keccak256` on-chain (hash de integridad). Se mide el tiempo de publicación.
2. `POST /api/v1/anclajes/verificar` con los **datos originales** → `integro:true` (el hash recomputado coincide).
3. `POST /api/v1/anclajes/verificar` con los **datos alterados** (p. ej. `energiaWh` distinto) → `integro:false`. **La cadena detecta la manipulación.** ← prueba de integridad.

**Evidencia real (circuito ya validado en sesiones previas):** anclaje `CONFIRMADO`, txHash on-chain
(status 0x1), `integro:true` con datos intactos y `integro:false` con datos alterados. El contrato
`LiquidacionP2PAnchor` está desplegado en Amoy (`0x5996…C828000`).

---

## Experimento 2 · Generación de NFT (ERC-721 en Polygon)

| Campo | Contenido |
|---|---|
| **Experimento** | Crear certificados únicos con ERC-721 usando ID del medidor, propietario, emisor y consumo neto. |
| **Hipótesis** | Si usamos Smart Contracts ERC-721 en Polygon, podremos generar tokens únicos, indivisibles y trazables, evitando duplicaciones y garantizando su propiedad. |
| **Métrica y criterio** | 100% de los tokens con identificador único; **0 duplicados para una misma certificación**; 100% de transferencias trazables; **100% de intentos de emisión duplicada rechazados**; confirmación de transacciones en ≤ 60 s. |
| **Resultado y aprendizaje** | Emisión y transferencia verificables. Aprendizaje: se requiere un **identificador de certificación y período** para impedir duplicados (en Voltera, la clave `(idMedidor, periodo)`), además de la validación del certificador externo. |

**Procedimiento (prueba de unicidad):**
1. `POST /api/v1/certificados` → acuña el token (identificador único `tokenId`). Se mide el tiempo.
2. `POST /api/v1/certificados/{tokenId}/transferir` → transferencia trazable billetera→billetera.
3. `POST /api/v1/certificados` con el **mismo `(idMedidor, periodo)`** → **RECHAZADO** (HTTP 4xx /
   `CertificadoDuplicado`). ← 0 duplicados.

**Respaldo en el contrato `CertificadoOrigenNFT.sol`:** la clave `keccak256(idMedidor, periodo)`
impide un segundo mint (revert `CertificadoDuplicado`); `supportsInterface(0x80ac58cd)` confirma que
es ERC-721. Probado con 9 tests de contrato + 7 del gateway.

---

## Cómo ejecutarlo

- **Front (recomendado para la sustentación):** https://voltera-frontend.vercel.app/experimento-validacion
  → "Ejecutar experimento 1" y "Ejecutar experimento 2". Cada criterio muestra ✓/✗ y su evidencia.
- **Consola (reproducible, guarda JSON):**
  ```bash
  cd Microservicios
  ./experimento-validacion.sh                       # contra el gateway público (Render)
  GATEWAY=http://localhost:8101 ./experimento-validacion.sh   # contra un gateway local
  ```
  Imprime ✓/✗ por criterio y escribe `evidencia-experimento/validacion-<ts>.json`.
- **Tests automatizados:**
  - Integridad on-chain: `cd Blockchain && npx hardhat test` (incluye "verificar() confirma el hash
    anclado y rechaza uno distinto" y "rechaza DUPLICADOS para el mismo (idMedidor, periodo)").
  - Gateway: `./mvnw test` en `blockchain-gateway-service` (incluye integridad y unicidad).

> Nota sobre Chainlink: el experimento 1 se materializa con el **oráculo del gateway** (web3j lleva
> la medición hasheada a la cadena y la cadena detecta la manipulación), que es exactamente la prueba
> de integridad del enunciado. Un Chainlink real (consumer + LINK) queda como el "resultado esperado"
> del diseño, no desplegado en esta iteración.
