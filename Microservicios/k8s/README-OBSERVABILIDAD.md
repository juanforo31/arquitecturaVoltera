# Observabilidad Voltera — que Grafana registre TODO

> Implementado 2026-10-27. Problema: Grafana solo veía métricas de Istio
> (tráfico/latencia del mesh), **no** las métricas de aplicación de los
> microservicios, porque `/actuator/prometheus` no existía (faltaba la
> dependencia del registro Micrometer→Prometheus en todos los servicios).

## Qué se cambió en el repo (ya hecho)

1. **Código (19 servicios):** añadida la dependencia
   `io.micrometer:micrometer-registry-prometheus` (scope runtime) a cada
   `pom.xml`. Verificado localmente en `liquidacion-p2p-service`:
   `/actuator/prometheus` responde con 65+ series (JVM, HTTP server, threads,
   CPU). El `application.yml` ya exponía `prometheus` en
   `management.endpoints.web.exposure.include`, por eso solo faltaba el jar.

2. **Scrape (manifiestos):** anotaciones en cada `Deployment.template.metadata`:
   ```yaml
   annotations:
     prometheus.io/scrape: "true"
     prometheus.io/path: "/actuator/prometheus"
     prometheus.io/port: "<puerto real del servicio>"
   ```
   en `voltera-services.yaml`, `voltera-eda.yaml`, `voltera-negocio-eda.yaml`,
   `voltera-cobros.yaml`, `voltera-blockchain.yaml`, `voltera-certificados.yaml`.

3. **mTLS:** `voltera-observabilidad.yaml` pone los puertos de métricas en
   PERMISSIVE (mantiene STRICT para el negocio) por si el Prometheus del clúster
   está fuera de la malla.

## Pasos para aplicarlo en el clúster (requiere ruta a la LAN 192.168.3.x)

```bash
# 1) Rebuild + push de las imágenes con la nueva métrica (desde la Mac con Docker).
#    Reconstruye los 19; o al menos los que quieras ver primero.
cd Microservicios/k8s
./build-push-all.sh            # amd64 -> Harbor 192.168.3.13/app-voltaire

# 2) Aplicar anotaciones de scrape (re-apply de los manifiestos ya anotados).
kubectl -n voltera-app apply -f voltera-services.yaml -f voltera-eda.yaml \
  -f voltera-negocio-eda.yaml -f voltera-cobros.yaml \
  -f voltera-blockchain.yaml -f voltera-certificados.yaml

# 3) mTLS: permitir scrape de los puertos de métricas (si Prometheus NO está en la malla).
kubectl -n voltera-app apply -f voltera-observabilidad.yaml

# 4) Rollout para tomar la imagen nueva (de uno en uno; ver DESPLIEGUE-SEGURO.md).
for s in liquidacion-p2p-service facturacion-service telemetria-core-service ...; do
  kubectl -n voltera-app rollout restart deploy/$s
  kubectl -n voltera-app rollout status deploy/$s --timeout=120s
done

# 5) Importar/overwrite los dashboards de Grafana.
GRAFANA_URL=http://192.168.3.11:<nodePortGrafana> GRAFANA_USER=admin GRAFANA_PASS=admin \
  ./grafana-import-dashboards.sh
```

## Verificación (qué mirar para decir "Grafana registra todo")

```bash
# a) El endpoint existe en el pod:
kubectl -n voltera-app exec deploy/liquidacion-p2p-service -c liquidacion-p2p-service \
  -- wget -qO- http://localhost:8081/actuator/prometheus | grep -E "jvm_memory_used_bytes|http_server_requests_seconds_count" | head

# b) Prometheus tiene los 19 targets UP (puerto <appPort>, path /actuator/prometheus):
#    Prometheus UI -> Status -> Targets -> job kubernetes-pods -> voltera-app.

# c) En Grafana, además del dashboard de mesh (istio_requests_total), ahora hay
#    series de aplicación: jvm_memory_used_bytes, jvm_threads_live_threads,
#    http_server_requests_seconds_*, process_cpu_usage, system_cpu_usage, etc.
#    filtrables por {namespace="voltera-app", app="<servicio>"}.
```

## Capas de observabilidad (estado)

| Capa | Fuente | Estado |
|---|---|---|
| Tráfico/latencia por salto | Istio (`istio_requests_total`, `istio_request_duration…`) | ya operaba (sidecar) |
| Grafo de servicios | Kiali (lee Prometheus de Istio) | ya operaba |
| Trazas distribuidas | brave→Zipkin/Jaeger (`micrometer-tracing-bridge-brave` en todos) | dep ya presente; requiere extensionProvider otel en meshConfig (ver mesh/03) |
| **Métricas de aplicación** | **Micrometer→Prometheus (`/actuator/prometheus`)** | **IMPLEMENTADO ahora** (faltaba el jar) |
| Pods/ready/restarts | kube-state-metrics | ya operaba |

> Pendiente opcional (trazas end-to-end sin cortes): que las apps propaguen
> b3/traceparent entre saltos (la dep brave ya está; falta validar propagación
> en llamadas REST salientes). La latencia por salto NO lo necesita.
