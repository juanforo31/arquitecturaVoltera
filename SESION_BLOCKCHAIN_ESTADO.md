# Estado de la sesión — Blockchain Voltera

> Punto de retome para la próxima sesión. Última actualización: 2026-11-03 (AUDITORÍA DE ENTREGA del
> proyecto Blockchain: sincronización de docs con el código real; sin cambios de arquitectura).
> Lee este archivo primero al reconectar.

## ✅ AUDITORÍA DE ENTREGA · carpeta `Blockchain/` (2026-11-03)

Pedido: validar qué más se requiere para que el proyecto Blockchain quede completo y específico para
entregar, incluyendo front y backend del experimento.

**Estado real confirmado:** contratos compilan (solc 0.8.24 / Cancun) y **37 tests passing**; gateway
**15 tests** BUILD SUCCESS; front **build OK** (395.94 kB). Anchor LIVE en Amoy (`0xd0Ef…EBcf530`).

**Mejoras de CALIDAD agregadas a `Blockchain/` (sin cambiar arquitectura):**
1. **solhint** (`.solhint.json` + `.solhintignore`) + script `npm run lint` → lint **0 errores,
   0 warnings** (se partieron líneas largas en Comunidad/Multisig, sin cambio de comportamiento).
2. **gas reporter** activable (`REPORT_GAS=true npm run test:gas`) y **coverage**
   (`npm run coverage`) — ambos ya venían con hardhat-toolbox, solo se cablearon.
3. **Script `scripts/verificar-integridad.js`** (`npm run integridad`): despliega los 4 contratos en
   memoria y corre el camino feliz + la **prueba de integridad** (gate 4) y la **unicidad** (lámina
   06) de un tirón, sin gas. Verificado: 4/4 OK.
4. **Script agregado `npm run check`** (lint+build+test) y `deploy:faltantes`.
5. **CI GitHub Actions** `.github/workflows/blockchain-ci.yml`: lint→compile→test→integridad→coverage
   en cada push que toque `Blockchain/`.

**Front y backend del experimento (validados, NO requerían cambios):**
- Gateway: endpoints completos (anclar, verificar, obtener, listar, comunidades, red + slice NFT
  emitir/transferir/quemar/consultar/red). 15 tests verdes. Modos demo/real/Kafka por env.
- Front: 4 páginas del Módulo 4 (`/blockchain`, `/certificados`, `/microservicios-cadena`,
  `/experimento-validacion`) con los 2 servicios cableados a todos los endpoints; página de
  experimento con prueba de integridad y de unicidad. Sin TODOs ni mocks pendientes. Build OK.

**NUEVO documento maestro `ENTREGA_BLOCKCHAIN.md` (raíz):** punto único de entrada para el evaluador
(qué es la POC, arquitectura 3 zonas, componentes, el experimento lámina 06, cómo reproducir de un
tirón, qué falta por gas).

**Gaps de consistencia corregidos antes (misma sesión):** README desincronizado (firma del NFT),
`ComunidadEnergeticaRegistry` ausente en README, `deployments/amoy.json` ahora honesto sobre qué
está LIVE vs pendiente. Detalle abajo.

**Diagrama `.drawio`:** NO se tocó — ninguna de estas mejoras cambió topología (ni servicios, ni
topics, ni puertos, ni patrones nuevos: solo calidad de código, scripts, CI y documentación). La
regla permanente se cumple.

**Pendiente (acción del usuario, requiere gas/credenciales — no es código):** recargar POL en el
faucet y `npm run deploy:faltantes`; en Render poner el RPC de publicnode. Ver `ENTREGA_BLOCKCHAIN.md §6`.

---

## ✅ SINCRONIZACIÓN DOC↔CÓDIGO · carpeta `Blockchain/` (2026-11-03, previo)

**Estado real confirmado:** compila (solc 0.8.24 / Cancun) y **37 tests passing** (8 anchor + 9
comunidad + 11 multisig + 9 NFT). Anchor LIVE en Amoy (`0xd0Ef…EBcf530`).

**Gaps encontrados y corregidos (solo docs/consistencia, NO arquitectura):**
1. **README desincronizado (bug):** la tabla de `CertificadoOrigenNFT` documentaba la firma vieja
   `emitirCertificado(propietario, uri, hashDetalle, energiaMWh, tecnologia)`. El contrato real usa
   `(propietario, uri, idMedidor, consumoNetoMensual, periodo, hashDetalle)`. **Corregido** + añadidos
   `tokenDe/totalEmitidos` y los 4 atributos de la lámina.
2. **`ComunidadEnergeticaRegistry` no estaba en el README** pese a ser contrato de primera clase (se
   despliega, 9 tests). **Añadida su tabla.**
3. **Cabecera del README** ahora lista los 4 contratos, el estado LIVE/pendiente de cada uno, y la
   nota de `evmVersion: cancun`. Añadida sección **"Estado de la entrega"** + receta reproducible
   (`npm test` y `anclar-prueba.js`).
4. **`deployments/amoy.json`** ahora dice honestamente que solo el anchor está LIVE y que Comunidad/
   Multisig/NFT están pendientes de deploy (faltó gas). `deploy-faltantes.js` limpia esa nota al
   desplegar. Añadido script npm `deploy:faltantes`.

**Pendiente (acción del usuario, requiere gas/credenciales — no es código):**
- Recargar POL en el faucet de Amoy para `0xa0A1…AFDf2` y correr `npm run deploy:faltantes` → deja
  los otros 3 contratos LIVE.
- Confirmar el anclaje P2P on-chain desde Render (RPC publicnode + gas), ya documentado abajo.

**Diagrama `.drawio`:** NO se tocó porque esta auditoría no cambió topología (ni servicios, ni
topics, ni puertos, ni patrones nuevos — solo sincronización doc↔código). La regla permanente se
cumple: no hubo cambio de arquitectura que reflejar.

## 🚀 DESPLIEGUE LÁMINA 04 EN EL CLÚSTER k8s (2026-10-27)

Pedido: validar qué hacía falta desplegar y, por indicación explícita del usuario, **NO poner los
servicios de blockchain en el clúster, sino los microservicios NUEVOS** (los de la lámina 04).

**Diagnóstico en vivo (SSH atiesia@192.168.3.11, ns `voltera-app`):**
- Clúster sano: 20/20 pods Running, KEDA operando (8 ScaledObjects + HPAs), master 77% mem / worker 57%.
- Faltaban en el clúster (vivían solo en Render/Vercel): `blockchain-gateway-service`,
  `certificacion-generacion-service`, `certificados-renovables-service` (ninguna imagen en Harbor).

**Qué se hizo (según la indicación del usuario):**
1. **Build + push amd64 a Harbor** (`192.168.3.13/app-voltaire`) de SOLO los 2 microservicios
   nuevos de lámina 04 (NO el blockchain-gateway): `certificacion-generacion-service:1.0.0` y
   `certificados-renovables-service:1.0.0` (verificado arch=amd64).
2. **`blockchain-gateway-service` se QUEDA en Render** (PaaS, `https://voltera-blockchain-gateway.onrender.com`),
   NO se desplegó en el clúster.
3. Ajustado `Microservicios/k8s/voltera-certificados.yaml`:
   - `certificados-renovables-service` ahora apunta a `VOLTERA_BLOCKCHAIN_GATEWAY_URL=
     https://voltera-blockchain-gateway.onrender.com` (antes apuntaba al gateway interno del clúster).
   - Ambos deployments anclados al worker (`nodeSelector node-role.kubernetes.io/worker`) para
     no cargar el master (procedimiento de scheduling).
4. **Aplicado al clúster** (dry-run server OK → apply): 2 Deployments + 2 Services + 2 HTTPRoutes.

**✅ VERIFICADO EN VIVO:**
- Pods `2/2 Running` en worker-01: `certificacion-generacion-service`, `certificados-renovables-service`.
- `/actuator/health` = UP en ambos (dentro del pod).
- Acceso externo por el LoadBalancer de Istio (`http://192.168.3.220`): `/certificacion-generacion/actuator/health`
  = **200** y `/certificados-renovables/actuator/health` = **200**.
- Env `VOLTERA_BLOCKCHAIN_GATEWAY_URL` inyectada = `https://voltera-blockchain-gateway.onrender.com`.
- Namespace pasó de 20 a **22/22 pods Running**.
- Diagrama vivo actualizado (cajas `ms-cert-gen`/`ms-cert-ren` → ✅ LIVE en clúster k8s; arista ACL
  marcada clúster→Render). XML validado.

**Nota de seguridad:** credenciales SSH/registry/namespace llegaron por chat → conviene rotarlas.

---

## 🧪 VALIDACIÓN E2E DEL EXPERIMENTO (2026-10-27)

Pedido: validar que el experimento esté completo para las pruebas end-to-end.

**Qué se corrió (contra infra real: Vercel + WSO2 + liquidacion-p2p clúster + gateway Render + Amoy):**

1. **`experimento-p2p.sh` (marketplace P2P + anclaje):** flujo completo OK salvo la confirmación
   on-chain. Pasos verificados en vivo:
   - PASO 0 cadena disponible (contrato `0xd0Ef…EBcf530`, chainId 80002). ✅
   - PASO 1 token OAuth2 del BFF. ✅
   - PASO 3 CASAR en `liquidacion-p2p` (clúster): contrato casado, 10 kWh @ 460, PARCIAL. ✅
   - PASO 4 ANCLAR: hash keccak256 calculado, estado PENDIENTE. ✅
   - PASO 5 confirmación on-chain: **NO confirmó** (quedó PENDIENTE tras 120 s). ⚠
   - PASO 6 verificar integridad (lectura): integro:true. ✅

2. **`experimento-validacion.sh` (lámina 06): 8/8 criterios OK** ✅ — incluido el Experimento 2
   (NFT) que antes daba 404: ahora `tokenId=1`, transferencia trazable, duplicado RECHAZADO (HTTP 400).
   Prueba de integridad del oráculo: datos originales → integro:true, datos alterados → integro:false.

**⚠ CAUSA RAÍZ de que el anclaje P2P no CONFIRME on-chain (2 problemas sumados, ambos externos
al código y al clúster):**
- **Gas insuficiente:** la wallet de prueba `0xa0A1…AFDf2` tiene **0.0047 POL** (consultado on-chain
  vía publicnode). El `.env` decía 0.1 POL pero ya se consumió en pruebas. Hace falta recargar en
  el faucet (https://faucet.polygon.technology, red Amoy) → ~0.2 POL.
- **RPC malo en Render:** el anclaje falla con `Invalid response 500 ... Temporary internal error,
  code 19` → es `https://polygon-amoy.drpc.org` rechazando `eth_sendRawTransaction`. Solución ya
  conocida: cambiar en el dashboard de Render `VOLTERA_BLOCKCHAIN_RPC_URL` a
  **`https://polygon-amoy-bor-rpc.publicnode.com`** (verificado que sí acepta envío). `render.yaml`
  actualizado con esta nota.

**Conclusión:** el experimento (código + orquestación) está COMPLETO y correcto. La validación
lámina 06 pasa 8/8. El único punto abierto es la **confirmación on-chain del anclaje P2P**, que
depende de 2 acciones tuyas (no de código): (1) recargar POL en el faucet, (2) poner el RPC de
publicnode en el dashboard de Render. Hechas esas dos, el PASO 5 confirmará (txHash+bloque+gas).
No tengo credenciales de Render ni del faucet, por eso no puedo cerrarlo yo.

### ✅ PRUEBA EMPÍRICA del camino on-chain SIN Render (2026-10-27) — DEMOSTRADO
Para avanzar sin esperar a Render, se creó `Blockchain/scripts/anclar-prueba.js` que ancla DIRECTO
al contrato ya desplegado usando el RPC bueno. Ejecutado:
```
AMOY_RPC_URL=https://polygon-amoy-bor-rpc.publicnode.com \
  npx hardhat run scripts/anclar-prueba.js --network amoy
```
**Resultado: ANCLAJE CONFIRMADO ON-CHAIN** (la wallet ES ORACULO_ROLE):
- txHash `0xe1a5b57c55173fc44a56065ee47b8bcdd63a5d6ee05d458d93cc56df387c8bd5`
- bloque 51297135 · gasUsed 119988 · `totalAncladas` 10 → **11**
- https://amoy.polygonscan.com/tx/0xe1a5b57c55173fc44a56065ee47b8bcdd63a5d6ee05d458d93cc56df387c8bd5

**Esto prueba que el bloqueo REAL era el RPC (drpc code 19), NO el código ni el gas** (con publicnode
la tx confirma; alcanzaba para 1 anclaje). Tras el envío el balance bajó a **0.0011 POL → ya NO
alcanza** para otro: ahora SÍ es obligatorio recargar el faucet antes de la demo final.

**Checklist para cerrar el experimento P2P on-chain (acciones tuyas):**
1. Faucet Amoy → `0xa0A18C1D64272f9a6a248Deb5106994F5D8AFDf2` (~0.2 POL): https://faucet.polygon.technology
2. Render dashboard → `VOLTERA_BLOCKCHAIN_RPC_URL = https://polygon-amoy-bor-rpc.publicnode.com` (redeploy).
3. Re-ejecutar `Microservicios/experimento-p2p.sh` → el PASO 5 debe salir CONFIRMADO.
   (Diagnóstico rápido sin gastar gas: `DRY_RUN=1 AMOY_RPC_URL=…publicnode… npx hardhat run
   scripts/anclar-prueba.js --network amoy` desde `Blockchain/`.)

---

## 📊 OBSERVABILIDAD · que Grafana registre TODO (2026-10-27)

Pedido: verificar que Grafana registre todo y, si no, implementarlo. La LAN (SSH/Harbor/LB) se
cayó a mitad de sesión → no pude inspeccionar Grafana en vivo, así que **audité el repo e
implementé el gap real** (listo para aplicar cuando vuelva la VPN).

**Gap detectado (causa de que Grafana NO registre métricas de aplicación):**
- Los 19 microservicios **exponían** `prometheus` en `management.endpoints.web.exposure.include`
  pero **ninguno tenía la dependencia** `micrometer-registry-prometheus` → `/actuator/prometheus`
  NO existía. Grafana solo veía métricas de Istio (tráfico/latencia del sidecar), nunca JVM/HTTP/pools.
- Además, **ningún Deployment tenía anotaciones `prometheus.io/scrape`** → aunque existiera el
  endpoint, Prometheus no raspaba esos pods.

**Implementado (todo en el repo, verificado):**
1. **19 `pom.xml`**: + `io.micrometer:micrometer-registry-prometheus` (runtime). XML de los 19 OK.
   Compilado `liquidacion-p2p` y **arrancado localmente: `/actuator/prometheus` responde con 65
   series reales** (jvm_memory_used_bytes, http_server_requests_seconds, threads, cpu…).
2. **Anotaciones de scrape** en los 19 Deployments (`prometheus.io/{scrape,path,port}` con el
   puerto real de cada servicio) en voltera-services/-eda/-negocio-eda/-cobros/-blockchain/
   -certificados.yaml. YAML validado.
3. **`voltera-observabilidad.yaml`** (NUEVO): PeerAuthentication que pone los puertos de métricas
   en PERMISSIVE (mantiene mTLS STRICT para el negocio) por si el Prometheus está fuera de la malla.
4. **`README-OBSERVABILIDAD.md`** (NUEVO): pasos para aplicar (rebuild+push imágenes, apply
   manifiestos, rollout, importar dashboards con `grafana-import-dashboards.sh`) + verificación.

**Pendiente de aplicar (requiere LAN, que está caída):** rebuild+push de las 19 imágenes
(`./build-push-all.sh`), `kubectl apply` de los manifiestos anotados + `voltera-observabilidad.yaml`,
rollout, y re-importar dashboards. Hasta entonces Grafana sigue con solo-mesh; tras aplicarlo
registrará también las métricas de aplicación de los 19 servicios.

**Nota:** las trazas (brave→Zipkin/Jaeger) ya tienen la dependencia en todos los servicios; la
latencia por salto (Istio) ya operaba. El único gap de registro era el de métricas de aplicación,
ya resuelto en código y manifiestos.

---

## 🧪 LÁMINA 06 · EXPERIMENTO DE VALIDACIÓN (opción C: doc + script + front + tests) (2026-10-26, noche 3)

Pedido: materializar el experimento de la lámina 06 (30% nota, con prueba de integridad) — opción C
(doc + script reproducible + panel en el front + tests) y subir a GitHub.

**Qué se hizo:**
1. **NUEVA página front `/experimento-validacion`** (enlazada desde `/blockchain`): ejecuta los 2
   experimentos desde la UI y muestra cada criterio ✓/✗ con evidencia. Build OK (31.6 kB).
2. **Script reproducible `Microservicios/experimento-validacion.sh`** — corre ambos experimentos
   contra el gateway, mide los criterios y guarda evidencia JSON.
3. **Doc `EXPERIMENTO_VALIDACION_VOLTERA.md`** (raíz) — los 2 experimentos (hipótesis/métrica/
   resultado/procedimiento) con la prueba de integridad y de unicidad.
4. **Tests** que respaldan la integridad ya existen: anchor Hardhat ("verificar() rechaza hash
   distinto") + NFT ("rechaza DUPLICADOS por (idMedidor, periodo)") + gateway.
5. **Diagrama vivo** actualizado (panel de estado con la prueba de integridad) · XML validado · PNG.
6. **Vercel LIVE**: `/experimento-validacion` = 200 (y el hub de `/blockchain` enlaza a las 4 vistas).

### ✅ EVIDENCIA REAL capturada contra el gateway LIVE (Render)
`evidencia-experimento/validacion-20261026-203201.json`:
- **Experimento 1 (oráculo): 4/4 criterios OK** — anclaje con hash, ≤60 s, `integro:true` con datos
  originales y **`integro:false` con datos alterados (PRUEBA DE INTEGRIDAD superada, la cadena detecta
  la manipulación)**.
- **Experimento 2 (NFT): el gateway en Render devuelve 404 en `/api/v1/certificados`** porque el
  código del slice NFT (y los 2 microservicios lámina 04) **aún no están desplegados en Render**
  (Render redeploya al hacer `git push`, que está bloqueado). El rechazo de duplicados sí se prueba
  con los tests del contrato/gateway locales (9+7). Al pushear y redeployar Render, el exp. 2 pasará
  también en vivo.

### ⛔ GIT: NO se pudo subir a GitHub (bloqueo de máquina, acción tuya)
`git` y hasta `brew install git` fallan con *"You have not agreed to the Xcode license"*. No puedo
aceptar la licencia (requiere `sudo xcodebuild -license accept` interactivo con tu contraseña).
**Para subir TODO a https://github.com/vimapeco24/arquitecturaVoltera.git:**
```bash
sudo xcodebuild -license accept     # una vez, tu contraseña
cd /Users/vimapeco/Downloads/ArquitectutaNuevaGenegeracion
git add -A
git commit -m "Lámina 04 (2 microservicios DDD) + lámina 05/06 (NFT 4 atributos + experimento de validación) + front"
git push origin main
```
Al pushear, Render redeploya el gateway con `/api/v1/certificados` y el experimento 2 pasará en vivo.

---


## 🧩 LÁMINA 04 · DOS MICROSERVICIOS DDD NUEVOS (NO tocan la cadena) + FRONT + VERCEL (2026-10-26, noche 2)

Pedido: a partir de la lámina 04 "Nuevos microservicios", crear los 2 microservicios identificados
con DDD, dejar claro **quién toca la cadena y quién no**, front muy completo accesible desde
`/blockchain`, desplegar a Vercel y subir a git.

**Qué se hizo (ambos servicios compilan, 5+5 tests verdes; front build OK; Vercel LIVE):**

1. **NUEVO `certificacion-generacion-service` (:8102) — NO toca la cadena.** Hexagonal Spring Boot.
   BC *Certificación de generación*. Agregados `BalanceGeneracionCertificable` (reserva bloques de
   1 MWh **sin reutilizar mediciones**) y `SolicitudCertificacion` (**doble aval**: Voltera +
   certificadora → APROBADA). REST `/api/v1/{generacion,balances,solicitudes,...}`. 5 tests.

2. **NUEVO `certificados-renovables-service` (:8103) — NO toca la cadena directamente: usa el gateway.**
   BC *Certificados renovables*, agregado `CertificadoRenovable` (emisión/titularidad/**transferencia
   billetera→billetera**/retiro + estado tras confirmación). Puerto de salida `GatewayCadenaPort`
   con dos adaptadores: `RestGatewayCadenaAdapter` (**anticorruption layer** → `/api/v1/certificados`
   del gateway) y `NoopGatewayCadenaAdapter` (demo, txHash simulado). Selección por `@Value` URL
   vacía = no-op. REST `/api/v1/certificados-renovables`. 5 tests.

3. **FRONT muy completo — NUEVA página `/microservicios-cadena`** (+ 2 servicios Angular + modelos
   + ruta + nav 🧩). Muestra el flujo DDD completo con panel **“¿quién toca la cadena y quién no?”**,
   registro de generación, reserva de bloque 1 MWh, doble aval, emisión del NFT (vía gateway) desde
   una solicitud APROBADA, transferencia billetera→billetera, retiro, detalle con cadena de custodia
   y métricas. **Hub del Módulo 4 añadido en `/blockchain`** (enlaces a Marketplace, Certificados NFT
   y Microservicios de la cadena) → todo accesible desde https://voltera-frontend.vercel.app/blockchain.

4. **k8s** `voltera-certificados.yaml` (Deployment+Service+HTTPRoute de ambos; el de renovables trae
   `VOLTERA_BLOCKCHAIN_GATEWAY_URL=http://blockchain-gateway-service:8101`) + añadidos a
   `build-push-all.sh`. **Doc** `PATRONES_BLOCKCHAIN_VOLTERA.md`: sección lámina 04 con la tabla de
   microservicios y "dónde queda el on-chain/off-chain". **Diagrama vivo** actualizado (2 cajas
   dashed "NO toca la cadena" + arista ACL al gateway); XML validado + PNG regenerado.

5. **DEPLOY VERCEL — LIVE** (con tu token, **RÓTALO**):
   https://voltera-frontend.vercel.app → `/blockchain`, `/certificados`, `/microservicios-cadena` = **200**.

### Dónde queda registrado on-chain vs off-chain (respuesta a la pregunta)
- **OFF-CHAIN:** estado de dominio en cada microservicio (repos in-memory). `certificacion-generacion`
  guarda balances+solicitudes; `certificados-renovables` guarda el agregado `CertificadoRenovable`
  (titular, historial, estado). **Ninguno escribe en la cadena.**
- **ON-CHAIN:** solo `blockchain-gateway-service` escribe en Polygon (contrato ERC-721). El servicio
  de certificados-renovables guarda el reflejo (`tokenId`, `txHash`, `estadoCadena`) tras la
  confirmación del gateway (patrón store-and-forward).

### ⛔ GIT: ver abajo — sigue bloqueado por licencia de Xcode (acción tuya)

Para subir TODO (incluye los 2 microservicios nuevos + front + diagrama/docs):
```bash
sudo xcodebuild -license            # acéptala una vez (tu input, interactivo)
cd /Users/vimapeco/Downloads/ArquitectutaNuevaGenegeracion
git add Microservicios/ServiciosDeNegocio/certificacion-generacion-service \
        Microservicios/ServiciosDeNegocio/certificados-renovables-service \
        Microservicios/ServiciosDeNegocio/blockchain-gateway-service \
        Microservicios/voltera-frontend/src Microservicios/k8s/voltera-certificados.yaml \
        Microservicios/k8s/build-push-all.sh \
        Blockchain/contracts/CertificadoOrigenNFT.sol Blockchain/test/CertificadoOrigenNFT.test.js \
        PATRONES_BLOCKCHAIN_VOLTERA.md SESION_BLOCKCHAIN_ESTADO.md \
        Modificados/Voltera_Arquitectura_Completa.drawio Modificados/Voltera_Arquitectura_Completa.png
git commit -m "Lámina 04: 2 microservicios DDD (certificación-generación + certificados-renovables) + front + láminas 05/06 NFT"
git push origin main
```

---


## 🎯 ALINEACIÓN A LÁMINAS 05/06 + SLICE NFT COMPLETO (backend+front) + DEPLOY VERCEL (2026-10-26, noche)

Pedido: a partir de las 4 láminas del profesor (05 patrones con 2 diagramas ArchiMate + tabla de 4
patrones; 06 experimento de validación), "hazlo todo": alinear NFT a los atributos de la lámina,
oráculo Chainlink, validar off-chain vs on-chain, front **y** backend completos, registrar
transferencias **billetera→billetera**, subir a git y desplegar a Vercel.

**Qué se hizo (todo compila y pasa tests; front LIVE en Vercel):**

1. **Contrato `CertificadoOrigenNFT.sol` RE-ALINEADO a la lámina** — ahora los atributos son los 4
   del enunciado: **idMedidor · propietario · emisor · consumoNetoMensual** (+ `periodo` AAAAMM y
   `hashDetalle`). Nueva firma `emitirCertificado(propietario, uri, idMedidor, consumoNetoMensual,
   periodo, hashDetalle)`. **Unicidad (medidor, periodo)** que rechaza duplicados on-chain
   (`CertificadoDuplicado`) — cumple lámina 06 ("0 duplicados / 100% intentos duplicados
   rechazados"). Tests actualizados: **9** (antes 8) → suite total **37 passing**.

2. **BACKEND NFT COMPLETO en el gateway (hexagonal + web3j)** — NUEVO slice vertical:
   - Dominio: `CertificadoNft` (con historial billetera→billetera: EMISION/TRANSFERENCIA/QUEMA).
   - Puertos: `GestionarCertificadoUseCase` (in) + `CertificadoNftPort` (out).
   - Aplicación: `CertificadoService` (unicidad, validación, solo-emisor, keccak256 del hash).
   - Adaptadores: `Web3jCertificadoNftAdapter` (emitirCertificado/transferFrom/burn on-chain) +
     `CertificadoNftDemoAdapter` (txHash simulado si no hay contrato desplegado).
   - REST: `CertificadoController` → `POST /api/v1/certificados`, `/{id}/transferir`,
     `/{id}/quemar`, `GET /{id}`, `GET ?propietario=`, `GET /red`.
   - `BlockchainProperties.certificadoNftAddress` (env `VOLTERA_BLOCKCHAIN_CERTIFICADO_NFT`) +
     wiring en `BeanConfiguration` + `GlobalExceptionHandler` (502 si falla on-chain).
   - Tests nuevos `CertificadoServiceTest` (7) → suite gateway **15 passing** (antes 8).

3. **FRONT NFT COMPLETO — NUEVA página `/certificados`** (`certificados.component` + servicio
   `certificado.service.ts` + modelos + ruta + nav 🪙):
   - Emitir (billetera emisora → propietaria), **transferir de billetera a billetera**, quemar.
   - **Libro mayor billetera→billetera** (desde/hacia/ejecutadoPor/txHash) + detalle con cadena de
     custodia. Rechazo de duplicados en el cliente. Exportar CSV/JSON. Gestión de billeteras.
   - **Panel OFF-CHAIN vs ON-CHAIN** explícito (valida la separación de la lámina): off-chain =
     ingesta/gemelo(AWS Lambda)/RDS/API Gateway/SQS/MQ/tokenURI; on-chain = nodo Polygon/ERC-721/
     propiedad+transferencias/hash/unicidad; puente = oráculo Chainlink.
   - Usa el backend si responde (`/api/v1/certificados`); si no, cae a **modo demo** local
     (persistencia localStorage) → el circuito es completo end-to-end siempre.
   - `ng build --configuration production` OK (certificados-component 49.24 kB).

4. **Doc `PATRONES_BLOCKCHAIN_VOLTERA.md`** — tabla oficial de la lámina 05 (4 patrones: off-chain
   telemetría · off-chain oráculo/gemelo · oráculo Chainlink · token NFT ERC-721) + tabla de
   validación **OFF-CHAIN vs ON-CHAIN** + mapa de dónde está cada patrón. Fichas de seguridad
   (multiple authorization, embedded permission) conservadas como extra.

5. **Diagrama vivo** `Modificados/Voltera_Arquitectura_Completa.{drawio,png}` (regla permanente) —
   `bc-nft` con los 4 atributos + off-chain/on-chain + backend/front; band y status alineados a la
   lámina (Chainlink, off/on-chain, 37+15 tests). XML validado · PNG regenerado.

6. **DEPLOY VERCEL — LIVE** — `vercel deploy --prod` OK (con tu token, que **DEBES ROTAR**):
   - Producción: https://voltera-frontend-hhov0skmu-vimapeco.vercel.app
   - Alias: **https://voltera-frontend.vercel.app** → `/`, `/certificados`, `/blockchain` = **200**.

### ⛔ GIT BLOQUEADO EN ESTA MÁQUINA (acción tuya) — NO se pudo hacer commit/push
`git` falla con *"You have not agreed to the Xcode license agreements"* (exit 69). No puedo
aceptar la licencia (requiere `sudo xcodebuild -license` interactivo). **Los cambios de backend y
front están en disco pero NO commiteados.** Para subirlos:
```bash
sudo xcodebuild -license            # acéptala una vez (tu input)
cd /Users/vimapeco/Downloads/ArquitectutaNuevaGenegeracion
git add Blockchain/contracts/CertificadoOrigenNFT.sol Blockchain/test/CertificadoOrigenNFT.test.js \
        Microservicios/ServiciosDeNegocio/blockchain-gateway-service \
        Microservicios/voltera-frontend/src PATRONES_BLOCKCHAIN_VOLTERA.md \
        Modificados/Voltera_Arquitectura_Completa.drawio Modificados/Voltera_Arquitectura_Completa.png \
        SESION_BLOCKCHAIN_ESTADO.md
git commit -m "Alinear blockchain a láminas 05/06: NFT 4 atributos + backend/front certificados + off/on-chain"
git push origin main
```
(Render auto-desplegará el gateway con el nuevo `/api/v1/certificados` al hacer push.)

### ⚠️ SEGURIDAD
Pegaste el token de Vercel en el chat (`vcp_…`). Está comprometido → **rótalo/revócalo** en
Vercel → Settings → Tokens. No se escribió en ningún archivo del repo (solo como env var del comando).

---

## 🪙 TOKEN ERC-721 (NO FUNGIBLE) + DESPLIEGUE INTENTADO + FRONT VALIDADO (2026-10-26, tarde)

Pedido: "haz el despliegue de todo lo que haga falta, valida que el front esté completo" +
steering "especificar si son tokens fungibles o no fungibles, de OpenZeppelin, implementación de
especificaciones".

**Qué se hizo (todo compila con evm cancun, 36 tests verdes, front build OK):**

1. **NUEVO contrato `blockchain/contracts/CertificadoOrigenNFT.sol`** — patrón **TOKENIZACIÓN**
   (familia datos). Certificado de origen renovable como **TOKEN NO FUNGIBLE · ERC-721** usando
   las implementaciones de **OpenZeppelin**: `ERC721` + `ERC721URIStorage` (metadata off-chain) +
   `ERC721Burnable` + `AccessControl` (EMISOR_ROLE). Se eligió ERC-721 (no fungible) y NO ERC-20
   (fungible) ni ERC-1155 (semi-fungible) porque cada certificado es único. **8 tests nuevos**
   (incluye `supportsInterface(0x80ac58cd)` que confirma que es ERC-721).
   - Total suite: **36 passing** (8 anchor + 9 comunidad + 11 multisig + 8 NFT).

2. **evmVersion subido a `cancun`** en `hardhat.config.js` — OZ 5.6 usa `mcopy` (EIP-5656), que
   requiere Cancun. Amoy lo soporta (PIP-31). OJO: el anchor ya desplegado se compiló con `paris`;
   el cambio solo afecta compilaciones futuras, NO el bytecode on-chain existente.

3. **Doc de patrones ampliado** `PATRONES_BLOCKCHAIN_VOLTERA.md` — ahora **5 patrones**, con la
   ficha nueva de tokenización que incluye la TABLA ERC-20 (fungible) / ERC-721 (no fungible, el
   elegido) / ERC-1155 (semi-fungible), y la justificación del tipo de token.

4. **Diagrama vivo** `Modificados/Voltera_Arquitectura_Completa.{drawio,png}` — caja `bc-nft`
   (CertificadoOrigenNFT, ERC-721 no fungible) + arista; etiqueta capa 4 con los 5 patrones;
   stack y panel de estado actualizados. XML validado, PNG regenerado.

5. **FRONT VALIDADO** — `ng build --configuration production` OK en `Microservicios/voltera-frontend`
   (blockchain-component 44.79 kB, bundle inicial 394.71 kB). Compila completo sin errores. El
   `blockchain.service.ts` cubre anclar/obtener/listar/red/verificar/comunidades.

6. **Scripts de deploy** — `deploy.js` ahora despliega los 4 contratos; NUEVO
   `scripts/deploy-faltantes.js` despliega SOLO los que faltan (comunidad+multisig+NFT) SIN tocar
   el anchor LIVE, con reintentos y gas price fijo a 30 gwei.

### ⛔ DESPLIEGUE BLOQUEADO POR GAS (no por código) — acción tuya requerida
Intenté desplegar los 3 contratos faltantes a Amoy. Diagnóstico con datos reales:
- La wallet de prueba `0xa0A1…AFDf2` tiene **0.0134 POL**.
- El contrato más pequeño (multisig) estima **925.379 gas = 0.0278 POL** a 30 gwei.
- Los 3 juntos ≈ **0.16 POL**. **Falta gas.** (Un deploy huérfano de prueba quedó en
  `0x36b725b608eF3524E93BD7e5D0ac4b27dE182B73`, ignorable, es testnet.)
- Además el RPC `drpc.org` rechazaba el ENVÍO de transacciones ("Temporary internal error");
  **`https://polygon-amoy-bor-rpc.publicnode.com` SÍ las acepta** (ya actualizado en `.env.example`).

**Para completar el deploy (cuando recargues gas):**
```bash
# 1) Pide POL gratis al faucet con la wallet de prueba (necesitas ~0.2 POL):
#    https://faucet.polygon.technology  (red Amoy, token POL) -> 0xa0A18C1D64272f9a6a248Deb5106994F5D8AFDf2
# 2) Despliega SOLO los faltantes (preserva el anchor LIVE):
cd Blockchain
AMOY_RPC_URL=https://polygon-amoy-bor-rpc.publicnode.com npx hardhat run scripts/deploy-faltantes.js --network amoy
# 3) Autoriza un 2o firmante en el multisig (si no, no registra nada) y, opcional,
#    configura el gateway con las VOLTERA_BLOCKCHAIN_* que imprime el script.
```
El anchor LIVE (`0xd0Ef…EBcf530`) sigue intacto y verificado; nada de lo desplegado se tocó.

---


## 🧩 PATRONES DE BLOCKCHAIN (slide 05) + CONTRATO MULTIPLE AUTHORIZATION (2026-10-26)

Pedido: a partir de las imágenes del enunciado "05 · Patrones de blockchain" (al menos 2 patrones
con problema/solución/consecuencias/familia) y los diagramas del profesor (que mostraban
multiple authorization, token ERC-721, oráculo ChainLink), "agregar todo acá" en el proyecto.

**Qué se hizo (todo compila, 28 tests verdes, XML del diagrama válido):**

1. **NUEVO contrato `blockchain/contracts/CesionCertificadoMultisig.sol`** — implementa el patrón
   **MULTIPLE AUTHORIZATION** (familia seguridad) que faltaba y que el enunciado pedía
   ("dos firmas antes de registrar"). Cesión de certificados de origen: `proponerCesion` (1ª firma)
   → `confirmarCesion` (2ª firma de OTRA cuenta) → `CesionRegistrada`. Un firmante no puede firmar
   dos veces. `AccessControl` (FIRMANTE_ROLE) + `Pausable`. **11 tests nuevos**.
   - `test/CesionCertificadoMultisig.test.js` (11) → total suite **28 passing**
     (8 anchor + 9 comunidad + 11 multisig).
   - `scripts/deploy.js` ahora despliega los **3** contratos y guarda `cesionCertificados.address`
     en `deployments/<red>.json` (+ aviso de autorizar 2º firmante).
   - README del blockchain: añadida la tabla del contrato multisig.

2. **NUEVO documento `PATRONES_BLOCKCHAIN_VOLTERA.md` (raíz)** — entregable del slide 05. Documenta
   **4 patrones** (el enunciado pedía ≥2), cada uno con problema / solución / consecuencias
   (qué se gana y qué se paga) / familia:
   - Off-chain storage (datos) · Oráculo + confirmación por evento (exterior) ·
     Multiple Authorization (seguridad) · Embedded Permission/Zero Trust (seguridad).
   - Checklist "LISTO CUANDO" del enunciado marcado.

3. **Diagrama vivo `Modificados/Voltera_Arquitectura_Completa.drawio` (regla permanente)** —
   añadida la caja `bc-multisig` (CesionCertificadoMultisig, patrón multiple authorization) con su
   arista JSON-RPC desde el gateway; banda blockchain ampliada; etiqueta de capa 4 lista los 4
   patrones; stack y panel de estado actualizados a 2026-10-26; observabilidad/estado/pie corridos
   para no solapar. **PNG regenerado** (`drawio --export`, 1.9 MB). XML verificado bien formado.

**NOTA sobre las imágenes del profesor vs. lo implementado:** los diagramas del profesor muestran
un **ERC-721 (token no fungible)** y un **oráculo tipo ChainLink** como ilustración del patrón
*token* y *oráculo*. Voltera implementa el patrón **oráculo** con su `blockchain-gateway` (web3j),
y los patrones *off-chain storage* + *multiple authorization* + *embedded permission* en Solidity.
NO se implementó un ERC-721: el caso elegido (liquidación P2P + certificados) encaja mejor con
anclaje de hash + multisig que con tokenización NFT. Si se quisiera el token ERC-721 como 5º
patrón (familia datos), sería un contrato adicional — queda anotado como opción, no hecho.

**PENDIENTE (requiere tu wallet con POL):** `cd blockchain && npm run deploy:amoy` desplegaría los
3 contratos a Amoy y daría la dirección del multisig; luego autorizar un 2º firmante. Hoy el
multisig está escrito+probado pero NO desplegado (igual que ComunidadEnergeticaRegistry).

---


## 🧪 EXPERIMENTO REPRODUCIBLE + ORQUESTACIÓN EDA CERRADA (2026-10-22)

Objetivo: dejar la página /blockchain como un experimento profesional y reproducible
para la entrega, orquestando bien los servicios existentes.

**Qué se implementó (todo compilado y probado, BUILD SUCCESS, 13 tests verdes):**

1. **Script `Microservicios/experimento-p2p.sh`** — ejecuta el flujo completo end-to-end
   (token OAuth2 → casar → anclar → confirmar → verificar) contra Vercel+Render, imprime
   evidencia por paso y guarda un JSON en `evidencia-experimento/`. Verificado en vivo:
   contrato `e1671590…`, txHash `0xd6330049…`, bloque 50862256, gas 119988, integridad ✓.
   (Usa el python3 de CommandLineTools automáticamente si el del sistema está bloqueado por Xcode.)

2. **Orquestación por eventos (EDA) en `liquidacion-p2p`** — se cerró el eslabón que faltaba:
   - Nuevo evento de dominio `LiquidacionCalculada` (domain/model).
   - Puerto de salida `LiquidacionEventPublisherPort` (domain/port/out).
   - Adaptador `KafkaLiquidacionEventPublisher` + `NoopLiquidacionEventPublisher` (infra/messaging).
   - `MessagingConfiguration`: crea KafkaTemplate+publisher solo si `voltera.kafka.enabled=true`;
     no-op por defecto (Render sigue solo-REST; el broker es LAN).
   - `LiquidacionService` publica el evento al casar (emparejar y actualizar).
   - `EmparejarRequest`/`ComandoEmparejar` ganan `comunidadId` opcional (retrocompatible).
   - Al casar, `liquidacion-p2p` publica `topic.facturacion.liquidacion`; el gateway ya lo
     consumía (LiquidacionCalculadaListener) → anclaje automático. Idempotente por transaccionId.
   - pom: + `spring-kafka`. application.yml: `voltera.kafka.enabled`, topic y bootstrap.
   - Test nuevo `OrquestacionEdaTest` (verifica publicación, comunidad y Wh).

3. **Manifiesto k8s** `voltera-services.yaml`: `KAFKA_ENABLED=true` + `KAFKA_BOOTSTRAP` para
   el `liquidacion-p2p` del clúster (activa EDA donde sí hay broker Redpanda).

4. **Guía de entrega** `GUIA_EXPERIMENTO_P2P.md` (raíz): qué demuestra, cómo ejecutarlo
   (script y web), arquitectura, evidencia real, limitaciones honestas (estado in-memory).

5. **Diagramas** (regla permanente): `Voltera_Flujo_Experimento_P2P.{drawio,png}` (secuencia del
   experimento) y actualizado `Voltera_Arquitectura_Completa.{drawio,png}` (liquidacion-p2p ahora
   "casación + publica EDA"; arista anclaje = REST o evento topic.facturacion.liquidacion).

**PENDIENTE DE DESPLIEGUE (requiere Docker, apagado en esta sesión):** reconstruir la imagen
`liquidacion-p2p-service` y aplicar el manifiesto para activar el EDA en el clúster:
`cd Microservicios/k8s && ./build-push-all.sh && kubectl -n voltera-app apply -f voltera-services.yaml && kubectl -n voltera-app rollout restart deploy/liquidacion-p2p-service`.
Mientras tanto el experimento funciona end-to-end por REST (Vercel+Render), que es lo que se demuestra.

## 🗺️ DIAGRAMA ACTUALIZADO + VALIDACIÓN EN VIVO (2026-10-22)

Se validó todo el stack contra el estado real (no bitácoras) y se actualizó el diagrama vivo
`Modificados/Voltera_Arquitectura_Completa.drawio` (+ PNG regenerado con `drawio --export`, XML
verificado bien formado).

Qué se cambió en el `.drawio` y por qué:
- **Nuevo panel "ESTADO VERIFICADO EN VIVO · 2026-10-22"** (banda verde al pie) con el health de los
  5 frentes, para que el diagrama muestre de un vistazo qué está arriba.
- **SPA (Vercel)** y **gateway (Render)**: etiqueta `✅ LIVE`.
- **Contrato LiquidacionP2PAnchor**: marcado `✅ DESPLEGADO` (0xd0Ef…EBcf530, Amoy chainId 80002).
- **Contrato ComunidadEnergeticaRegistry**: borde punteado + `⚠ escrito+probado (9 tests), NO
  desplegado` (hoy comunidad = metadato off-chain). Refleja el único pendiente real.
- Pie con fecha 2026-10-22.

Evidencia de la validación en vivo (22-oct-2026):
- Git: `main == origin/main`, árbol limpio (HEAD `3655a1b`); nada pendiente de subir.
- Front (Vercel): sirve `main-JNXGBHCI.js` (idéntico al build local); `/` y `/blockchain` → 200.
- Gateway (Render): `/actuator/health` UP; `/api/v1/anclajes/comunidades` → 200 (endpoint del commit 58acd2f).
- WSO2 `atiesia.synology.me:3000` → 200.
- Clúster k8s `voltera-app` (SSH 192.168.3.11): 20/20 pods Running; 8 ScaledObjects READY; HPA sin
  targets unknown. Imágenes en vivo ≥ tags del repo → nada que empujar al clúster.
- Conclusión: lo "nuevo" (comunidades/marketplace) vive en Render + Vercel, NO en el clúster, y ya
  estaba desplegado. No había cambios pendientes de subir.

## 🏘️ COMUNIDADES ENERGÉTICAS + MEJORAS FRONT/CONTRATO (2026-10-21)
Trabajo nuevo pedido: "implementa todo lo que puedas de blockchain para las comunidades
energéticas y lo del contrato". Todo compila y pasa tests; el deploy a Amoy del contrato
nuevo queda pendiente (necesita tu wallet/gas).

### Contrato (carpeta `blockchain/`)
- **NUEVO `contracts/ComunidadEnergeticaRegistry.sol`**: padrón on-chain de comunidades
  energéticas y su membresía. `AccessControl` (rol `OPERADOR_ROLE`, Embedded Permission) +
  `Pausable`. Funciones: `registrarComunidad`, `agregarMiembro`, `removerMiembro`,
  `esMiembro`, `puedenCasar(comunidad, vendedor, comprador)` (regla de dominio: solo casan
  miembros activos de la MISMA comunidad), eventos para EDA, errores de no repudio.
- **Tests**: `test/ComunidadEnergeticaRegistry.test.js` (9) + anchor (8) = **17 passing**.
- `scripts/deploy.js` ahora despliega AMBOS contratos y guarda las 2 direcciones en
  `deployments/<red>.json` (`registroComunidades.address`). Verificado en red hardhat in-process.
- ⏳ PENDIENTE (requiere tu wallet con POL): `npm run deploy:amoy` para publicar el registro
  en Amoy y poner `VOLTERA_BLOCKCHAIN_REGISTRO_COMUNIDADES=<dir>` en el gateway.

### Gateway (`blockchain-gateway-service`) — retrocompatible, SIN romper lo Live
- `comunidadId` como **metadato OFF-CHAIN** en el anclaje (NO entra en el hash → no rompe
  idempotencia/verificación del contrato ya desplegado). DTO `AnclarRequest` y `AnclajeResponse`
  lo exponen; `LiquidacionP2P`/`Anclaje` lo portan; el listener Kafka lo extrae del evento.
- El `AnclajeResponse` ahora devuelve también **`bloque`** y **`gasUsado`** del recibo on-chain
  (capturados en `Web3jCadenaAdapter`; de paso se arregló un bug que llamaba
  `waitForTransactionReceipt` dos veces).
- **NUEVO endpoint** `GET /api/v1/anclajes/comunidades` → resumen agregado por comunidad
  (total, confirmados, pendientes, energíaWh total).
- Tests gateway: **8 passing** (antes 6; +2 de comunidad y de "comunidad no altera el hash").

### Frontend (`voltera-frontend`, página `/blockchain`)
- Campo **Comunidad energética** en el formulario de ofertas (con datalist de comunidades
  conocidas) y la comunidad mostrada en cada orden del libro.
- **Regla de casación**: solo casan órdenes de la MISMA comunidad; mensaje de motivo si no.
- **Panel de comunidades** (tarjetas con métricas, clic = filtrar contratos por comunidad).
- **Detalle de contrato** (modal): hash completo + copiar, txHash + copiar, bloque, gasUsado,
  intentos, último error, timeline de hitos, enlaces a PolygonScan y verificar.
- **Re-sincronizar** (re-hidrata desde el gateway tras un reinicio del store en memoria).
- **Exportar evidencia** a CSV y JSON (hash, txHash, bloque, gas, comunidad).
- Verificado: `tsc --noEmit` OK, `ng build --configuration production` OK
  (blockchain-component 44.79 kB).
- ⏳ Para que estos cambios lleguen a producción: `git push` (Render auto-deploya el gateway) y
  re-deploy del front a Vercel (ver sección Deploy Vercel).

### ✅ VALIDADO EN PRODUCCIÓN (2026-10-21, commit 58acd2f pusheado)
- Render auto-desplegó el gateway. `/actuator/health` 200; nuevo `/api/v1/anclajes/comunidades` 200.
- Anclaje real CON comunidad → CONFIRMADO, y la respuesta ahora incluye:
  `comunidadId:"COMUNIDAD-SOLAR-01"`, **`bloque:50778774`**, **`gasUsado:119976`**,
  txHash `0xf2a39159…b1b49fd`.
- `/comunidades` → agrega COMUNIDAD-SOLAR-01: 1 contrato, 1 confirmado, 11000 Wh.
- Tests: contrato Hardhat **17/17** (8 anchor + 9 comunidad), gateway **8/8**, liquidacion-p2p **12/12**.

### ⚠️ HALLAZGO IMPORTANTE sobre git (RESUELTO 2026-10-21)
- El `.gitignore` tenía `/Blockchain/` (para los PDFs del curso). En macOS (FS case-insensitive)
  ESA regla también ignoraba la carpeta **`blockchain/`** del proyecto Hardhat → el contrato
  Solidity, sus tests y `deploy.js` **NO estaban en git**.
- **RESUELTO**: se ajustó `.gitignore` para ignorar SOLO los PDFs (`*.pdf`) y los artefactos de
  build (`blockchain/node_modules|artifacts|cache|deployments`), y se versionó el código. También
  se añadieron negaciones para versionar el diagrama `Modificados/Voltera_Arquitectura_Completa.
  drawio` (+ `.png`) y las plantillas `**/.env.example` (el `.env` real sigue ignorado).
- Commits `eab68ab` (proyecto Hardhat + diagrama) y `c624af0` (.env.example). Ahora en GitHub:
  `blockchain/contracts/{LiquidacionP2PAnchor,ComunidadEnergeticaRegistry}.sol`, `test/` (17),
  `scripts/deploy.js`, `hardhat.config.js`, `package.json`, `README.md`, `.env.example`.
- Verificado post-commit: `npx hardhat test` → **17 passing**. Sin PDFs, node_modules ni .env reales.

### ⏳ Pendientes que requieren TUS credenciales
1. **Front a Vercel**: re-deploy con tu `VERCEL_TOKEN` (rotar el anterior). CLI local ya instalado:
   `cd Microservicios/voltera-frontend && VERCEL_TOKEN=<token> node_modules/.bin/vercel deploy --prod --yes`.
2. **Deploy del registro de comunidades a Amoy**: `cd blockchain && npm run deploy:amoy` (con tu
   wallet de prueba con POL) → poner `VOLTERA_BLOCKCHAIN_REGISTRO_COMUNIDADES=<dir>` en el gateway.

## 🔒 HARDENING CORS DEL GATEWAY (2026-10-21) — commit 0cc9da9 (local, sin push)
- `WebCorsConfiguration` ya NO usa el comodín `allowedOriginPatterns("*")`.
  Ahora lee `voltera.cors.allowed-origins` (env `VOLTERA_CORS_ORIGINS`), default:
  `https://voltera-frontend.vercel.app, https://*.vercel.app, http://localhost:4200`.
  Métodos reducidos a GET/POST/OPTIONS; headers a Content-Type/Accept/Authorization;
  `allowCredentials=false`; `maxAge=3600`.
- `application.yml`: añadido bloque `voltera.cors.allowed-origins`.
- Verificado: `./mvnw test` → **6/6 OK** con el cambio.
- Verificado que el origen real de producción (`voltera-frontend.vercel.app`) matchea los
  patrones permitidos → el front NO se romperá al redeplegar.
- ✅ **PUSHEADO y DESPLEGADO** (2026-10-21): `git push origin main` OK (7b8d8fb..24615a1).
  Render auto-desplegó el commit `24615a1` (trigger Auto-Deploy, 2m29s) y quedó **Live**.
- ✅ **CORS endurecido VERIFICADO en producción** (preflight live sobre Render):
  - Origen permitido (`voltera-frontend.vercel.app`) → `allow-methods: GET,POST,OPTIONS`,
    `max-age: 3600`, `allow-origin` correcto.
  - Origen NO permitido (`malicioso.example.com`) → NO devuelve ninguna cabecera `access-control-*`.
  - (Las verificaciones previas que mostraban el CORS viejo fueron falsos negativos por el
    cold-start del free tier: la instancia dormida tarda ~50-80s en despertar; health dio HTTP 000
    durante ese arranque. Tras despertar, el CORS nuevo responde correctamente.)
- Diagrama `.drawio`: SIN cambios estructurales (CORS es política del mismo gateway ya dibujado,
  no un nuevo componente/puerto/topic).

## TL;DR — dónde vamos
**TODO FUNCIONANDO END-TO-END Y EN LA NUBE.**
- Código blockchain terminado, probado y en GitHub (`main`, https://github.com/vimapeco24/arquitecturaVoltera.git).
- **Frontend LIVE en Vercel:** https://voltera-frontend.vercel.app (marketplace P2P completo).
- **Gateway blockchain LIVE en Render:** https://voltera-blockchain-gateway.onrender.com
  (free tier: duerme tras ~15 min, 1er request ~50 s).
- **Contrato real en Polygon Amoy:** `0xd0Ef1686fcAF3f026134DE4188bd977c4EBcf530`.
- **Anclaje real CONFIRMADO on-chain** (txHash `0x4963bf…0182f5d`, status 0x1). Circuito verificado.
- Diagrama de arquitectura: `Modificados/Voltera_Arquitectura_Completa.drawio` (+ PNG).
- PENDIENTE opcional: conectar `liquidacion-p2p-service` del cluster con
  `VOLTERA_BLOCKCHAIN_GATEWAY_URL=https://voltera-blockchain-gateway.onrender.com` (si el server está activo).
- ⚠️ SEGURIDAD: rotar el token de Vercel (`vcp_...`) pegado en el chat; la wallet de prueba es desechable.

## Deploy Vercel — COMPLETADO (2026-10-20)
- Vercel CLI instalado **local** en `Microservicios/voltera-frontend` (`npm install --no-save vercel@latest`)
  porque el global requería sudo (EACCES). Binario: `node_modules/.bin/vercel` (v64.7.0).
- Deploy a producción OK: `VERCEL_TOKEN=<token> node_modules/.bin/vercel deploy --prod --yes`.
  - Producción: https://voltera-frontend-9se8bi455-vimapeco.vercel.app
  - Alias: https://voltera-frontend.vercel.app  → responde **HTTP 200** público.
  - Cuenta: `vimapeco24-2439`. Build en Vercel compiló las API functions gw/obs/token.
- Verificaciones de código re-ejecutadas y OK: frontend `ng build`, contrato Hardhat **8/8**,
  `blockchain-gateway-service` **6/6**, `liquidacion-p2p-service` **12/12**.
- ⚠️ El token de Vercel usado se pegó en el chat → **rotarlo/revocarlo** en Vercel → Settings → Tokens.

## ✅✅ VALIDACIÓN COMPLETA END-TO-END (2026-10-21, tras hardening CORS) — TODO OK
Re-validado el circuito entero después del redeploy con el CORS endurecido:
- **Git**: `main` en `1e1e39f`, árbol limpio, todo pusheado (origin == local).
- **Gateway Render**: `/actuator/health` 200; `/api/v1/anclajes/red` → `configurada:true,
  disponible:true, contrato 0xd0Ef…EBcf530, polygon-amoy, chainId 80002`.
- **Front Vercel**: `/` 200 y `/blockchain` 200.
- **Anclaje REAL nuevo** `VALIDA-1792597781` → estado **CONFIRMADO**, txHash
  `0x377cf87bc9287c4ad560eef7cb13e0e6f6633ded67d0b0476a40cb03f5470782`.
  - Receipt on-chain (RPC Amoy): **status 0x1**, bloque 0x306c4b8, gasUsed 0xb0ac,
    to = contrato 0xd0ef…cf530. CONFIRMADO de verdad en la cadena.
- **Integridad**: `/api/v1/anclajes/verificar` con los mismos datos → `integro:true`
  (hashRecomputado == hashAnclado); con datos alterados (energiaWh) → `integro:false`. ✔
  (Ruta correcta del endpoint: `/api/v1/anclajes/verificar`, no `/api/v1/verificar`.)
- **Tests locales**: contrato Hardhat **8/8**, blockchain-gateway **6/6**,
  liquidacion-p2p **12/12**. BUILD SUCCESS en todos.
> Nota: la lista del gateway arrancó en `[]` tras el redeploy porque el store es en memoria;
> los anclajes on-chain previos siguen en la cadena, solo se pierde el estado local al reiniciar.

## ✅ Hecho y verificado (commit 2086dd7, ya en GitHub)
- **Contrato** `blockchain/contracts/LiquidacionP2PAnchor.sol` + Hardhat — **8 tests pasan**.
- **Microservicio** `blockchain-gateway-service` (puerto **8101**, Spring Boot hexagonal + web3j)
  — **6 tests pasan**; verificado en vivo (anclar, listar, red, verificar integridad).
  Endpoints REST: `POST /api/v1/anclajes`, `GET /{id}`, `GET /`, `GET /red`, `POST /verificar`.
- **Integración** `liquidacion-p2p-service` → gateway por REST (puerto de salida opcional,
  no-op si no se configura `VOLTERA_BLOCKCHAIN_GATEWAY_URL`) — **12 tests pasan**.
- **k8s**: `k8s/voltera-blockchain.yaml` + topic `topic.blockchain.anclada` en `voltera-topics.yaml`
  + gateway añadido a `build-push-all.sh`.
- **WSO2**: `wso2-gateway/publish-blockchain-api.sh` (API `/blockchain`).
- **PaaS**: `fly.toml`, `render.yaml`, `railway.json`, `.dockerignore` en el gateway.
- **Frontend Angular**: página **Marketplace P2P** (`pages/blockchain/`) con libro de órdenes,
  casar+anclar, registro de contratos on-chain, botón verificar integridad, barra de estado de
  red. Service + modelos + ruta `/blockchain` + menú. **Build OK**.
- **Docs**: `BLOCKCHAIN_VOLTERA.md` (análisis + árbol de decisión + implementación),
  `GUIA_DESPLIEGUE_BLOCKCHAIN.md` (paso a paso completo), `DESPLIEGUE.md`, `DESPLIEGUE_PAAS.md`,
  colección `Voltera_Postman_Blockchain.json`.

## ✅✅ CIRCUITO BLOCKCHAIN VERIFICADO END-TO-END (2026-10-20) — CERRADO
Tras 3 fixes de depuración en PaaS, un anclaje REAL quedó confirmado en la cadena:
- Fixes finales de gas en `Web3jCadenaAdapter`:
  - `resolverGasPrice()`: eth_gasPrice +20%, piso 30 gwei (Amoy exige >=25 gwei).
  - gasLimit acotado a **200k** (el default web3j 9M causaba "insufficient funds" con el saldo del faucet).
  - Commit `0dc09e7`.
- **Anclaje real LIQ-FINAL-001 → CONFIRMADO**:
  - txHash `0x4963bf3b9662327bb5d32a42d86802a6123ceecb4ae4ad1df93ce5cef0182f5d`
  - PolygonScan: https://amoy.polygonscan.com/tx/0x4963bf3b9662327bb5d32a42d86802a6123ceecb4ae4ad1df93ce5cef0182f5d
  - Receipt on-chain: status 0x1 (OK), bloque 0x305ef53, gasUsed 137928.
  - Verificación de integridad: `integro:true` (hash recomputado == hash anclado).
- Flujo probado: Front (Vercel) / REST → gateway (Render) → web3j → contrato (Polygon Amoy) → txHash real.
- Saldo wallet tras anclaje: ~0.077 POL menos ~0.004 → alcanza para ~15 anclajes más.

## 🗺️ DIAGRAMA DE ARQUITECTURA VIVO (2026-10-20)
- Creado/actualizado **`Modificados/Voltera_Arquitectura_Completa.drawio`** + PNG exportado
  (`Voltera_Arquitectura_Completa.png`, 4705×2464, vía `drawio` CLI de Homebrew).
- El diagrama rotula en NEGRITA la TECNOLOGÍA de cada componente y marca los NUEVOS (blockchain):
  Angular 18 · Vercel · WSO2 API Manager · Istio/mTLS · Spring Boot 3.3/Java 21 · Docker · K8s ·
  Redpanda/Kafka · KEDA · TSDB/Redis · Spring Boot+web3j (Render) · Solidity+Hardhat · Polygon Amoy ·
  Prometheus/Grafana/Kiali/Jaeger. Barra superior con el stack completo.
- Exportar PNG: `drawio --export --format png --scale 2 --border 20 --output <png> <drawio>`.
- **REGLA PERMANENTE** en `.kiro/steering/arquitectura-voltera.md`: cada vez que se agregue/
  modifique/elimine algo de arquitectura, hay que actualizar TAMBIÉN este .drawio en el mismo
  trabajo, y dejar constancia aquí. La regla se incluye siempre (todas las sesiones).

## 🟢 GATEWAY BLOCKCHAIN EN RENDER — LIVE (2026-10-20)
- **URL pública:** https://voltera-blockchain-gateway.onrender.com (free tier, "duerme" tras ~15 min).
- Desplegado por **Blueprint** (`render.yaml` en raíz con `rootDir`). Variables de cadena como env vars.
- `/actuator/health` = 200; `/api/v1/anclajes/red` = `disponible:true, configurada:true, contrato 0xd0Ef…EBcf530`.
- **Front conectado:** `environment.prod.blockchainBase = https://voltera-blockchain-gateway.onrender.com`;
  `blockchain.service.ts` llama DIRECTO a esa URL (no vía WSO2 LAN). CORS abierto en el gateway.
- **3 fixes aplicados al depurar el deploy en PaaS (todos en git):**
  1. `BeanConfiguration.normalizar()` — quita espacios/saltos de la private key.
  2. `BlockchainProperties` setters — limpian rpc/key/contrato (el CONTRACT_ADDRESS llegó con `\n`).
  3. `Web3jCadenaAdapter.resolverGasPrice()` — gas dinámico `eth_gasPrice x2`, piso 30 gwei
     (Amoy rechazaba 4.1 gwei con "gas price below minimum"). Commit `df9169a`.
- PENDIENTE verificar tras el deploy de `df9169a`: que un anclaje real pase a CONFIRMADO con txHash.

## ✨ MARKETPLACE P2P — mejoras Nivel 2 + re-deploy (2026-10-20)
Front `pages/blockchain/` ampliado para quedar "muy completo" y re-desplegado a Vercel:
- **Persistencia** del libro de órdenes y de los contratos en `localStorage`
  (`voltera.mp.ordenes.v1`, `voltera.mp.contratos.v1`) → sobreviven al recargar.
- **Auto-refresco on-chain** (polling 10 s, toggle en la barra de red): los anclajes
  PENDIENTE pasan a CONFIRMADO solos sin recargar.
- **Timeline de hitos** por contrato (casado → anclado → confirmado) con tooltips de fecha +
  marca de verificación de integridad (✓/✗).
- **Casación parcial**: si venta/compra no son iguales, reduce la orden restante en el libro
  (usa `pendienteVentaKwh/pendienteCompraKwh` de la TransaccionP2P).
- **Filtros** de la tabla (Todos / On-chain / Pendientes / Sin anclar), botón quitar orden,
  botón reiniciar, y 6 métricas (añadidas Pendientes y Precio medio /kWh).
- Verificado: `tsc --noEmit` OK, `ng build --configuration production` OK
  (blockchain-component 29.12 kB). Re-deploy Vercel OK → https://voltera-frontend.vercel.app
  (200 en `/` y `/blockchain`).
> Nota: mientras el gateway NO esté en una PaaS, la barra dirá "modo demo" y `listar/red/verificar`
> no alcanzarán la cadena. El marketplace funciona (libro, casar, persistencia) pero el anclaje
> real requiere desplegar el gateway (paso siguiente).

## 🟢 CONTRATO DESPLEGADO EN POLYGON AMOY (2026-10-20)
- **Wallet de prueba (DESECHABLE, nunca fondos reales):** `0xa0A18C1D64272f9a6a248Deb5106994F5D8AFDf2`
  - Clave privada quedó visible en el chat → wallet comprometida a propósito, solo PoC.
  - POL recibido del faucet oficial (faucet.polygon.technology): 0.1 POL. Tras deploy: ~0.078 POL.
- **Contrato `LiquidacionP2PAnchor` DESPLEGADO:**
  - Dirección: **`0xd0Ef1686fcAF3f026134DE4188bd977c4EBcf530`**
  - Explorer: https://amoy.polygonscan.com/address/0xd0Ef1686fcAF3f026134DE4188bd977c4EBcf530
  - Verificado on-chain con `eth_getCode` → tiene bytecode real. `deployments/amoy.json` guardado.
- `blockchain/.env` creado con RPC `https://polygon-amoy.drpc.org` + clave + dirección.
  Confirmado que git lo IGNORA (`git check-ignore` OK) → la clave no se sube al repo.

### Pasos que SIGUEN (ahora que el contrato está en Amoy)
1. Desplegar el gateway en PaaS (Fly/Render/Railway) con 3 secrets:
   `VOLTERA_BLOCKCHAIN_RPC_URL=https://polygon-amoy.drpc.org`
   `VOLTERA_BLOCKCHAIN_PRIVATE_KEY=0x...` (la del .env)
   `VOLTERA_BLOCKCHAIN_CONTRACT_ADDRESS=0xd0Ef1686fcAF3f026134DE4188bd977c4EBcf530`
2. Publicar API en WSO2: `BACKEND=<url-gateway> ./publish-blockchain-api.sh`.
3. Conectar `liquidacion-p2p-service`: `VOLTERA_BLOCKCHAIN_GATEWAY_URL=<url-gateway>`.

## ✅ Pipeline validado END-TO-END contra una cadena real (2026-10-20)
Antes de pedir tus credenciales de Amoy, se validó TODO el flujo de despliegue en local
(nodo Hardhat + gateway real), para garantizar que con tu wallet funcionará igual:
- Nodo Hardhat local (`npx hardhat node`, chainId 31337) + `deploy.js` → contrato desplegado
  OK en `0x5FbDB2315678afecb367f032d93F642f64180aa3` (guardado en `deployments/localhost.json`).
- `blockchain-gateway-service` arrancado real apuntando a esa cadena
  (`VOLTERA_BLOCKCHAIN_RPC_URL=http://127.0.0.1:8545`, KAFKA_ENABLED=false). Arrancó en :8101,
  `/actuator/health`=200, `GET /api/v1/anclajes/red` → `disponible:true, configurada:true`.
  (El único error en logs era Zipkin/tracing hacia `zipkin.istio-system` — inofensivo fuera del cluster.)
- **Anclaje real**: `POST /api/v1/anclajes` → estado CONFIRMADO + `txHash` real minado.
- **Integridad (gate 4)**: `POST /verificar` mismos datos → `integro:true`; datos alterados → `integro:false`.
- **Idempotencia**: re-anclar misma transacción no duplica (lista sigue en 1, mismo txHash).
- Nombres EXACTOS del DTO de anclaje (para Postman/front): `transaccionId, vendedorId, compradorId,
  energiaWh (long>0), valorTotal, precioPorKwh, liquidadaEn (Instant ISO-8601)`.
- Procesos de prueba cerrados al terminar (puertos 8545/8101 liberados).
> Conclusión: el código de despliegue está probado contra una cadena de verdad. Lo único que
> falta es repetir `deploy:amoy` con TU wallet de prueba (no se puede automatizar: la clave privada
> la debes generar/controlar tú en MetaMask).

## ⏳ A medias (retomar aquí)
- **(RESUELTO 2026-10-20)** Deploy frontend a Vercel: HECHO. Ver "Deploy Vercel — COMPLETADO" arriba.
  Ya no queda nada a medias en el frontend.

## ❌ Falta (requiere credenciales del usuario — ver GUIA_DESPLIEGUE_BLOCKCHAIN.md)
1. Crear wallet de prueba (MetaMask) + pedir POL gratis en faucet de Amoy.
2. Desplegar el contrato: `cd blockchain && cp .env.example .env` (poner RPC+clave) →
   `npm run deploy:amoy` → copiar la dirección del contrato.
3. Desplegar el gateway en Fly/Render/Railway (free tier) con los 3 secrets de cadena.
4. Publicar la API en WSO2: `BACKEND=<url-gateway> ./publish-blockchain-api.sh`.
5. Conectar el server: `kubectl set env deploy/liquidacion-p2p-service VOLTERA_BLOCKCHAIN_GATEWAY_URL=<url>`.
6. Deploy frontend a Vercel.

## Notas técnicas importantes
- **git bloqueado por licencia Xcode**: usar el git de Command Line Tools:
  `export PATH="/Library/Developer/CommandLineTools/usr/bin:$PATH"` antes de cualquier `git`.
  (El `/usr/bin/git` da el error de licencia; el de CLT funciona.)
- **Puertos**: el gateway usa **8101** (8081–8100 ocupados; cobros=8100, habilitacion=8095, etc.).
- **Red del server**: LAN privada (192.168.3.x); Kafka NO alcanzable desde la nube → el gateway
  en PaaS corre en **modo solo-REST** (`KAFKA_ENABLED=false`); comunicación por API/WSO2.
- **Decisión de arquitectura**: caso = liquidación P2P; red = consorcio PoA en prod, pero para
  la PoC se usa Polygon Amoy (pública) anclando SOLO hashes (gate 8), así no se exponen datos.

## Verificación rápida al volver
```bash
export PATH="/Library/Developer/CommandLineTools/usr/bin:$PATH"
cd /Users/vimapeco/Downloads/ArquitectutaNuevaGenegeracion
git log --oneline -1          # debe mostrar 2086dd7 (o posterior)
git status --short            # limpio salvo material ignorado
```
