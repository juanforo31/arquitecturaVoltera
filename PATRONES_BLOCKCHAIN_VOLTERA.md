# 05 · Patrones de blockchain — Voltera

> Entregable del slide **05 · Patrones de blockchain** (ARTI-4208, Módulo 4).
> Responde: ¿qué patrones resuelven qué? Para cada patrón: **problema** que resuelve,
> **solución**, **consecuencias** (qué se gana / qué se paga) y **familia**
> (exterior · datos · seguridad · control).
>
> Regla del enunciado: *"Un patrón sin costo declarado es un patrón que no se entendió."*
> Por eso cada ficha declara explícitamente el costo.
>
> Caso de Voltera = **liquidación del mercado energético P2P** + **certificados de origen**
> (traducción del ejemplo Solventa del curso). Ver `BLOCKCHAIN_VOLTERA.md` para el árbol de decisión.

---

## Mapa rápido (patrón → familia → dónde vive en Voltera)

### Tabla oficial de la lámina 05 (los 4 patrones del enunciado)

| # | Patrón | Problema en su caso | Consecuencias (qué se paga) | Familia |
|---|---|---|---|---|
| 1 | **Off-chain · Telemetría** | Las mediciones IoT generan grandes volúmenes de datos que no es eficiente almacenar directamente en Polygon. | Mayor complejidad de integración, almacenamiento externo y necesidad de garantizar integridad y sincronización de datos. | Gestión de datos / Off-chain |
| 2 | **Off-chain · Servicios de Oráculo** | Los datos del gemelo digital y las mediciones requieren procesamiento y almacenamiento externo antes de incorporarse a Blockchain. | Dependencia de AWS Lambda, RDS y API Gateway; costos operativos y riesgo de inconsistencias entre datos externos y Blockchain. | Gestión de datos / Off-chain |
| 3 | **Oracle (Oráculo · Chainlink)** | Los Smart Contracts no pueden consultar directamente las mediciones externas para verificar la generación y el consumo de energía. | Dependencia de Chainlink y de la calidad de los datos externos; mayor latencia, costos de integración y riesgo de información incorrecta. | Integración Blockchain / Oráculos |
| 4 | **Token · NFT ERC-721** | Voltera necesita representar certificados de origen renovable únicos, con identificación del medidor, propietario, emisor y consumo energético. | Costos de gas por emisión y transferencia, complejidad de contratos inteligentes y gestión del ciclo de vida de los NFT. | Tokenización / Activos digitales |

### Validación OFF-CHAIN vs ON-CHAIN (separación de responsabilidades)

| Capa | Qué vive ahí | Por qué |
|---|---|---|
| **OFF-CHAIN** | Ingesta de telemetría · Gemelo Digital (AWS Lambda) · BD (Amazon RDS) · Amazon API Gateway · colas (AWS SQS / Amazon MQ) · metadata del certificado (IPFS/URL del `tokenURI`) · servicios de negocio/transversales | Datos voluminosos o privados; costo de gas acotado; alto throughput. |
| **ON-CHAIN** (Polygon Amoy) | Nodo Polygon · contrato ERC-721 `CertificadoOrigenNFT` · atributos del token (ID medidor, propietario, emisor, consumo neto, periodo) · propiedad y transferencias billetera→billetera · hash de integridad (`keccak256`) · regla de unicidad (medidor, periodo) · contrato `LiquidacionP2PAnchor` | Necesita ser verificable, único, trazable e inmutable por terceros. |
| **Puente** | Oráculo tipo **Chainlink** (único cruce de la frontera, controlado) | Lleva las mediciones firmadas del mundo off-chain a la cadena. |

### Dónde está implementado cada patrón en el repo

| # | Patrón (lámina) | Familia | Implementado en |
|---|---|---|---|
| 1 | **Off-chain storage** | Datos | `LiquidacionP2PAnchor.sol` (solo el hash on-chain) · `CertificadoOrigenNFT` (tokenURI off-chain) |
| 2 | **Off-chain · Oráculo/Gemelo** | Datos | `blockchain-gateway-service` (procesa fuera de la cadena antes de anclar) |
| 3 | **Oráculo** (Chainlink) | Interacción exterior | `blockchain-gateway-service` (web3j como puente) + EDA Kafka `topic.blockchain.anclada` |
| 4 | **Tokenización** (ERC-721 **NO fungible**) | Datos | `CertificadoOrigenNFT.sol` (OpenZeppelin ERC-721) + gateway `/api/v1/certificados` + front `/certificados` |

> El enunciado pide **al menos dos**. La lámina lista **cuatro**; además documentamos abajo dos
> patrones de **seguridad** extra (Multiple Authorization y Embedded Permission) que el proyecto
> también implementa en Solidity.

---

## Patrón 1 · Off-chain storage  (familia: DATOS)

**Problema.** La liquidación P2P contiene datos sensibles (consumo por hogar, identidad de
las partes, precios) y es de alta frecuencia. Escribir todo eso en una cadena pública
(Polygon Amoy) expondría información privada y costaría mucho gas por el volumen.

**Solución.** On-chain va **solo el `keccak256`** del registro canónico de la liquidación
(partes, kWh, precio, intervalo) más metadatos mínimos no sensibles (`energiaWh`, timestamp).
El dato crudo vive **off-chain** en los microservicios Spring Boot. La cadena guarda la
**prueba de integridad**, no el documento.

**Consecuencias.**
- *Se gana:* integridad verificable y no repudio sin exponer datos personales; la red puede ser
  pública sin violar privacidad; coste de gas acotado (un hash es tamaño fijo).
- *Se paga:* **complejidad de mantener la correspondencia** hash↔documento. Si se pierde el
  documento off-chain, el hash on-chain solo prueba que "algo existió", no *qué*. Hay que
  recomputar el hash con el mismo algoritmo canónico para verificar (acoplamiento de formato).

**Dónde.** `LiquidacionP2PAnchor.anclar(txId, hashCasacion, energiaWh, liquidadaEn)`; verificación
con `verificar(txId, hashEsperado)`. Contrato desplegado en Amoy `0x5996…C828000`.

---

## Patrón 2 · Oráculo  (familia: INTERACCIÓN EXTERIOR)

**Problema.** El contrato en la cadena **no puede, por sí solo**, enterarse de que ocurrió una
casación P2P en los microservicios (la cadena no llama APIs externas ni consulta bases de datos).
Y a la inversa: el resto del sistema necesita enterarse de que un anclaje quedó confirmado
on-chain sin bloquear el camino crítico.

**Solución.** Un servicio de borde, el **`blockchain-gateway`**, actúa como **oráculo**:
- *Hacia la cadena:* recibe el evento/petición de liquidación y empuja el hash llamando
  `anclar(...)` vía JSON-RPC (web3j) a través de un RPC de un tercero (dRPC/Amoy).
- *Desde la cadena:* indexa el evento `LiquidacionAnclada` y **republica** la confirmación como
  evento de dominio en Kafka/Redpanda (`topic.blockchain.anclada`) — patrón *confirmación por
  evento*, que saca la cadena del camino crítico (gate 6 del árbol de decisión).

**Consecuencias.**
- *Se gana:* la cadena se integra con el mundo real (EDA) sin estar en línea con cada request;
  latencia de usuario independiente de la confirmación on-chain; reintentos vía Outbox.
- *Se paga:* el oráculo es un **punto de confianza** (problema del oráculo): si miente o cae, el
  anclaje se detiene. Se mitiga con el rol `ORACULO_ROLE` revocable y el patrón Outbox
  (reintento idempotente), pero sigue siendo infraestructura extra a operar y asegurar.

**Dónde.** `blockchain-gateway-service` (`Web3jCadenaAdapter`, `OutboxRelay`,
`LiquidacionCalculadaListener`). LIVE en Render.

---

## Patrón 3 · Multiple Authorization  (familia: SEGURIDAD)

**Problema.** La **cesión de un certificado de origen** (quién cede, a quién, qué certificado) es
un acto de alto valor. Si una sola cuenta puede registrarlo, esa cuenta es un **punto único de
fraude o error**: basta comprometer una llave (o un fallo del oráculo) para ceder certificados
indebidamente.

**Solución.** Separar **proponer** de **confirmar**: la cesión solo queda **REGISTRADA** (surte
efecto) cuando **dos firmantes distintos** la han aprobado (umbral M-de-N con M=2 — *"dos firmas
antes de registrar"*). El mismo firmante no puede firmar dos veces. Es el patrón
*Multiple Authorization* del material.

**Consecuencias.**
- *Se gana:* tolerancia a **un** firmante malicioso o equivocado (uno solo no puede registrar
  nada); trazabilidad de quién propuso y quién confirmó (no repudio reforzado).
- *Se paga:* **mayor latencia** (dos transacciones en vez de una) y **más gas**; complejidad
  operativa de custodiar ≥2 llaves activas. Si solo hay un firmante disponible, el flujo se
  **bloquea** (es el precio de la seguridad).

**Dónde.** `CesionCertificadoMultisig.sol`: `proponerCesion(...)` (1ª firma) →
`confirmarCesion(cesionId)` (2ª firma distinta) → `CesionRegistrada`. Escrito y probado
(11 tests); **pendiente de desplegar a Amoy** (necesita wallet con POL).

---

## Patrón 4 · Embedded Permission / Zero Trust on-chain  (familia: SEGURIDAD)

**Problema.** Sin control de acceso, **cualquier** cuenta podría llamar funciones sensibles de los
contratos (anclar, registrar comunidades, pausar). On-chain no hay un "admin de servidor" que lo
impida: la autorización debe vivir **dentro del contrato**.

**Solución.** Cada contrato embebe sus permisos con `AccessControl` de OpenZeppelin y roles por
función: `ORACULO_ROLE` (anclar), `OPERADOR_ROLE` (padrón de comunidades), `FIRMANTE_ROLE`
(cesiones). `DEFAULT_ADMIN_ROLE` otorga/revoca. Es Zero Trust: se verifica el permiso en cada
llamada, no se confía en el emisor por defecto.

**Consecuencias.**
- *Se gana:* autorización descentralizada e inmutable, delegable y revocable sin redeploy; defensa
  en profundidad combinada con los otros patrones.
- *Se paga:* un pequeño coste de gas por la verificación de rol en cada llamada; y la gestión de
  llaves/roles se vuelve responsabilidad crítica (perder el admin = perder el gobierno del contrato).

**Dónde.** Los tres contratos de dominio (`LiquidacionP2PAnchor`, `ComunidadEnergeticaRegistry`,
`CesionCertificadoMultisig`) y el NFT (`CertificadoOrigenNFT`), más `Pausable` como parada de emergencia.

---

## Patrón 5 · Tokenización — ERC-721 NO fungible  (familia: DATOS)

**Problema.** Un **certificado de origen renovable** representa una propiedad única (una generación
concreta: tecnología, planta, periodo, MWh) que debe poder **poseerse y transferirse** de forma
verificable entre partes, con trazabilidad de la cadena de custodia. Un registro off-chain no da
propiedad verificable ni interoperabilidad con wallets/marketplaces.

**Solución.** Representar cada certificado como un **token** on-chain usando las implementaciones de
especificaciones de **OpenZeppelin**:

| Estándar | Fungibilidad | Implementación OZ | ¿Se usa aquí? |
|---|---|---|---|
| **ERC-20** | **Fungible** (unidades intercambiables 1:1, como una moneda) | `ERC20` | No |
| **ERC-721** | **NO fungible** (cada token es único) | `ERC721` + `ERC721URIStorage` + `ERC721Burnable` | **Sí** |
| ERC-1155 | Semi-fungible (lotes por tipo) | `ERC1155` | No (descartado) |

**Decisión: TOKEN NO FUNGIBLE (ERC-721).** Cada certificado es único e irrepetible, no
intercambiable 1:1 como lo serían unidades de una moneda; por eso **no** se modela con ERC-20
(fungible) sino con **ERC-721** (no fungible). ERC-1155 (semi-fungible) se descartó porque aquí
prima la unicidad, no los lotes fungibles por tipo.

Implementaciones de OpenZeppelin usadas en `CertificadoOrigenNFT.sol`:
- `ERC721` — estándar base no fungible (EIP-721).
- `ERC721URIStorage` — `tokenURI` por token: la metadata/documento del certificado vive **off-chain**
  (IPFS/URL); on-chain solo el URI + el hash (encaja con off-chain storage, gate 8).
- `ERC721Burnable` — permite "retirar"/cancelar un certificado (quema del token).
- `AccessControl` — solo `EMISOR_ROLE` puede acuñar (Embedded Permission).

**Consecuencias.**
- *Se gana:* propiedad y transferencia verificables on-chain; trazabilidad de la custodia;
  interoperabilidad con cualquier wallet/marketplace que entienda ERC-721.
- *Se paga:* gas por acuñar/transferir; la unicidad obliga a gestionar `tokenId`s y la
  correspondencia token↔certificado real (hash) con cuidado; más superficie de contrato que un
  simple anclaje de hash.

**Dónde.** `CertificadoOrigenNFT.sol`: `emitirCertificado(propietario, uri, idMedidor,
consumoNetoMensual, periodo, hashDetalle)` → acuña un NFT único con los **4 atributos de la
lámina** (ID medidor, propietario, emisor, consumo neto mensual) + periodo para impedir duplicados.
Backend: `blockchain-gateway-service` expone `/api/v1/certificados` (emitir / transferir
billetera→billetera / quemar / listar). Front: página `/certificados` con libro mayor
billetera→billetera y panel off-chain/on-chain. Probado: **9 tests** de contrato (incluye
`supportsInterface(0x80ac58cd)` y el rechazo de duplicados) + **7 tests** del gateway. **Pendiente
de desplegar a Amoy** (requiere recargar gas del faucet); mientras tanto el gateway opera en modo
demo (txHash simulado, estado en memoria) y el circuito es completo end-to-end.

---

## Checklist del enunciado ("LISTO CUANDO")

- [x] Hay **al menos dos** patrones (aquí cinco).
- [x] Cada uno declara **problema**, **solución** y **consecuencias**.
- [x] Cada uno declara **qué se gana y qué se paga** (costo explícito).
- [x] Cada uno indica su **familia** (exterior / datos / seguridad / control).
- [x] Se especifica el **tipo de token**: certificados = **ERC-721 NO fungible** (OpenZeppelin);
      ERC-20 (fungible) y ERC-1155 (semi-fungible) descartados con justificación.
- [x] Todos están **implementados en código** (Solidity + gateway) y probados (**36 tests**).

---

## Lámina 04 · Nuevos microservicios (DDD) — ¿quién toca la cadena?

Entregable del slide **04 · Nuevos microservicios**. Dos microservicios nuevos identificados con
DDD, acotados para que **solo los servicios de borde toquen la cadena**.

| Microservicio nuevo | BC / Agregados | ¿Toca la cadena? | Qué hace | Puerto |
|---|---|---|---|---|
| **Certificación de Generación** | BC *Certificación de generación*. Agregados `BalanceGeneracionCertificable`, `SolicitudCertificacion` | **No** | Consume la generación de Telemetría, reserva bloques de 1 MWh **sin reutilizar mediciones** y reúne el **doble aval** (Voltera + certificadora externa) | 8102 |
| **Certificados Renovables** | BC *Certificados renovables*. Agregado `CertificadoRenovable` | **No directamente. Usa el gateway** | Gestiona emisión, titularidad, **transferencia billetera→billetera** y retiro. Solicita las operaciones al gateway (ACL) y actualiza su estado tras la confirmación | 8103 |
| *(ya existía)* **blockchain-gateway** | adaptador de cadena + oráculo | **Sí (único)** | Habla web3j con Polygon; acuña/mueve el NFT ERC-721 | 8101 |

**Elementos DDD aplicados:** *aggregate* (`BalanceGeneracionCertificable`, `SolicitudCertificacion`,
`CertificadoRenovable`), *bounded context* (Certificación de generación vs Certificados renovables),
*oráculo* y *adaptador de cadena* (el gateway), y **anticorruption layer** (el adaptador
`RestGatewayCadenaAdapter` del servicio de Certificados Renovables traduce su dominio al contrato
REST del gateway, sin acoplarse a web3j/Solidity).

**Dónde queda registrado el on-chain y el off-chain:**
- **OFF-CHAIN:** el estado de dominio vive en cada microservicio (repos in-memory): el balance y las
  solicitudes en `certificacion-generacion-service`; el agregado `CertificadoRenovable`
  (titular, historial, estado) en `certificados-renovables-service`. Ninguno escribe en la cadena.
- **ON-CHAIN:** solo el `blockchain-gateway-service` escribe en Polygon (contrato ERC-721). El
  servicio de Certificados Renovables guarda el reflejo (`tokenId`, `txHash`, `estadoCadena`) tras
  recibir la confirmación del gateway.

**LISTO CUANDO** (checklist del enunciado): ✅ los servicios que tocan la cadena están acotados y
aislados — solo el gateway habla con blockchain; el resto de la arquitectura no se entera.

**Front:** página `/microservicios-cadena` (enlazada desde `/blockchain`) muestra el flujo completo
y rotula explícitamente quién toca la cadena y quién no. Backend probado: **5 + 5 tests** verdes.
