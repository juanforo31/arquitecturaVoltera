import { Component, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { BlockchainService } from '../../services/blockchain.service';
import { CertificadoService } from '../../services/certificado.service';
import { ToastService } from '../../core/toast.service';
import { AnclarRequest, RedInfo } from '../../core/models';

/** Un criterio medible del experimento (lámina 06). */
interface Criterio {
  texto: string;
  estado: 'pendiente' | 'ok' | 'fail' | 'corriendo';
  evidencia?: string;
}

/**
 * Lámina 06 · Experimento de validación (30% de la nota).
 * Ejecuta DESDE LA UI los dos experimentos y muestra cada criterio ✓/✗ con su
 * evidencia, incluida la PRUEBA DE INTEGRIDAD (la cadena detecta la manipulación).
 */
@Component({
  selector: 'app-experimento-validacion',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './experimento-validacion.component.html',
  styleUrl: '../blockchain/marketplace.scss',
})
export class ExperimentoValidacionComponent implements OnInit {
  private bc = inject(BlockchainService);
  private cert = inject(CertificadoService);
  private toast = inject(ToastService);

  corriendo1 = false;
  corriendo2 = false;

  /** Estado de la red/contrato on-chain (panel de contexto para la demo). */
  red?: RedInfo;
  redCargando = true;
  /** Marca de tiempo de la última corrida (para la evidencia). */
  ejecutadoEn?: string;

  ngOnInit(): void {
    // Carga el contexto on-chain al abrir: red, chainId, contrato, disponibilidad.
    this.bc.red().subscribe({
      next: (r) => { this.red = r; this.redCargando = false; },
      error: () => { this.redCargando = false; },
    });
  }

  // Experimento 1 · Oráculo + prueba de integridad
  exp1: Criterio[] = [
    { texto: 'Medición anclada con evidencia verificable (hash on-chain)', estado: 'pendiente' },
    { texto: 'Publicación de evidencia en ≤ 60 s', estado: 'pendiente' },
    { texto: 'Datos originales → integro:true (coincidencia original == verificado)', estado: 'pendiente' },
    { texto: 'PRUEBA DE INTEGRIDAD: datos alterados → integro:false (manipulación DETECTADA)', estado: 'pendiente' },
  ];

  // Experimento 2 · NFT ERC-721
  exp2: Criterio[] = [
    { texto: 'Token emitido con identificador único (tokenId)', estado: 'pendiente' },
    { texto: 'Confirmación de transacción en ≤ 60 s', estado: 'pendiente' },
    { texto: 'Transferencia trazable (billetera → billetera)', estado: 'pendiente' },
    { texto: '0 duplicados: emisión duplicada (mismo medidor+periodo) RECHAZADA', estado: 'pendiente' },
  ];

  private reset(c: Criterio[]): void { c.forEach((x) => { x.estado = 'pendiente'; x.evidencia = undefined; }); }

  // ---------------- Experimento 1 ----------------
  async correrExp1(): Promise<void> {
    this.corriendo1 = true;
    if (!this.ejecutadoEn) this.ejecutadoEn = new Date().toISOString();
    this.reset(this.exp1);
    const txId = 'EXP06-' + Date.now().toString(36).toUpperCase();
    const body: AnclarRequest = {
      transaccionId: txId,
      vendedorId: '0x1111111111111111111111111111111111111111',
      compradorId: '0x2222222222222222222222222222222222222222',
      energiaWh: 1_000_000,
      precioPorKwh: '450',
      valorTotal: '450000',
      liquidadaEn: new Date().toISOString(),
      comunidadId: 'COMUNIDAD-SOLAR-01',
    };
    const t0 = Date.now();
    try {
      const a = await this.bc.anclar(body).toPromise();
      const dur = Math.round((Date.now() - t0) / 1000);
      this.set(this.exp1[0], !!a?.hashCasacion, `hash ${this.corto(a?.hashCasacion)}`);
      this.set(this.exp1[1], dur <= 60, `t=${dur}s`);

      const verOk = await this.bc.verificar(body).toPromise();
      this.set(this.exp1[2], verOk?.integro === true, `integro=${verOk?.integro}`);

      // Prueba de integridad: alteramos energiaWh y verificamos -> debe ser false
      const alterado: AnclarRequest = { ...body, energiaWh: 999_999 };
      const verAlt = await this.bc.verificar(alterado).toPromise();
      this.set(this.exp1[3], verAlt?.integro === false, `datos alterados → integro=${verAlt?.integro}`);

      this.toast.success('Experimento 1 completado', 'Oráculo + prueba de integridad');
    } catch (e) {
      this.exp1.forEach((c) => { if (c.estado === 'pendiente') c.estado = 'fail'; });
      this.toast.error('Experimento 1', 'El gateway no respondió (¿modo demo / cold start?).');
    } finally {
      this.corriendo1 = false;
    }
  }

  // ---------------- Experimento 2 ----------------
  async correrExp2(): Promise<void> {
    this.corriendo2 = true;
    this.reset(this.exp2);
    const medidor = 'MEDIDOR-EXP06-' + Date.now().toString(36).toUpperCase();
    const periodo = 202610;
    const t0 = Date.now();
    try {
      const c = await this.cert.emitir({
        emisor: '0xA0A18C1D64272f9a6a248Deb5106994F5D8AFDf2',
        propietario: '0x1111111111111111111111111111111111111111',
        idMedidor: medidor, consumoNetoMensualWh: 120000, periodo,
      } as any).toPromise();
      const dur = Math.round((Date.now() - t0) / 1000);
      this.set(this.exp2[0], !!c?.tokenId, `tokenId=${c?.tokenId}`);
      this.set(this.exp2[1], dur <= 60, `t=${dur}s`);

      if (c?.tokenId) {
        const t = await this.cert.transferir(c.tokenId, '0x2222222222222222222222222222222222222222').toPromise();
        this.set(this.exp2[2], (t as any)?.propietario?.toLowerCase() === '0x2222222222222222222222222222222222222222', 'propiedad movida');
      }

      // Prueba de unicidad: emisión duplicada (mismo medidor+periodo) debe fallar.
      try {
        await this.cert.emitir({
          emisor: '0xA0A18C1D64272f9a6a248Deb5106994F5D8AFDf2',
          propietario: '0x3333333333333333333333333333333333333333',
          idMedidor: medidor, consumoNetoMensualWh: 99999, periodo,
        } as any).toPromise();
        this.set(this.exp2[3], false, 'se permitió un duplicado (mal)');
      } catch {
        this.set(this.exp2[3], true, 'duplicado rechazado (HTTP 4xx)');
      }
      this.toast.success('Experimento 2 completado', 'NFT único + rechazo de duplicados');
    } catch (e) {
      this.exp2.forEach((c) => { if (c.estado === 'pendiente') c.estado = 'fail'; });
      this.toast.error('Experimento 2', 'El gateway no respondió (¿modo demo / cold start?).');
    } finally {
      this.corriendo2 = false;
    }
  }

  private set(c: Criterio, ok: boolean, evidencia?: string): void {
    c.estado = ok ? 'ok' : 'fail';
    c.evidencia = evidencia;
  }

  get resumen1(): string { return this.conteo(this.exp1); }
  get resumen2(): string { return this.conteo(this.exp2); }
  private conteo(c: Criterio[]): string {
    const ok = c.filter((x) => x.estado === 'ok').length;
    return `${ok}/${c.length}`;
  }

  /** Resumen global de ambos experimentos (p. ej. "8/8"). */
  get resumenGlobal(): string {
    const ok = [...this.exp1, ...this.exp2].filter((x) => x.estado === 'ok').length;
    const total = this.exp1.length + this.exp2.length;
    return `${ok}/${total}`;
  }

  /** ¿Se corrieron ya los dos experimentos? (habilita exportar evidencia). */
  get hayResultados(): boolean {
    return [...this.exp1, ...this.exp2].some((c) => c.estado === 'ok' || c.estado === 'fail');
  }

  /** Enlace al contrato en el explorador (PolygonScan Amoy). */
  get explorerContrato(): string | null {
    if (!this.red?.explorer || !this.red?.contrato) return null;
    return `${this.red.explorer.replace(/\/$/, '')}/address/${this.red.contrato}`;
  }

  /** Corre ambos experimentos en secuencia (botón "Ejecutar todo" para la demo). */
  async correrTodo(): Promise<void> {
    this.ejecutadoEn = new Date().toISOString();
    await this.correrExp1();
    await this.correrExp2();
  }

  /** Descarga la evidencia de la corrida como JSON (para adjuntar a la entrega). */
  exportarEvidencia(): void {
    const evidencia = {
      proyecto: 'Voltera · ARTI4208 · Módulo 4',
      experimento: 'Lámina 06 — Validación blockchain',
      ejecutadoEn: this.ejecutadoEn ?? new Date().toISOString(),
      red: this.red ?? null,
      resumenGlobal: this.resumenGlobal,
      experimento1: {
        titulo: 'Supervisión de telemetría vía oráculo (prueba de integridad)',
        resultado: this.resumen1,
        criterios: this.exp1,
      },
      experimento2: {
        titulo: 'Generación de NFT ERC-721 (unicidad)',
        resultado: this.resumen2,
        criterios: this.exp2,
      },
    };
    const blob = new Blob([JSON.stringify(evidencia, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const sello = (this.ejecutadoEn ?? new Date().toISOString()).replace(/[:.]/g, '-');
    a.href = url;
    a.download = `evidencia-experimento-${sello}.json`;
    a.click();
    URL.revokeObjectURL(url);
    this.toast.success('Evidencia exportada', 'Se descargó el JSON de la corrida.');
  }

  corto(h?: string | null): string {
    if (!h) return '—';
    return h.length > 16 ? `${h.slice(0, 10)}…${h.slice(-6)}` : h;
  }
}
