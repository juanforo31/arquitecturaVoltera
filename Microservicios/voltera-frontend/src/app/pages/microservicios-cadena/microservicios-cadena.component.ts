import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { ToastService } from '../../core/toast.service';
import { describeHttpError } from '../../core/http-error';
import { CertificacionGeneracionService } from '../../services/certificacion-generacion.service';
import { CertificadosRenovablesService, GatewayEstado } from '../../services/certificados-renovables.service';
import { BalanceGeneracion, CertificadoRenovable, SolicitudCertificacion } from '../../core/models';

/**
 * Lámina 04 · Nuevos microservicios alrededor de la cadena.
 *
 * Muestra el flujo DDD completo de los DOS microservicios nuevos y, sobre todo,
 * QUIÉN TOCA LA CADENA y quién no:
 *   1. Certificación de Generación (8102, NO toca la cadena): registra generación
 *      de Telemetría, reserva bloques de 1 MWh sin reutilizar mediciones y reúne
 *      el doble aval (Voltera + certificadora).
 *   2. Certificados Renovables (8103, usa el GATEWAY): emite/transfiere/retira el
 *      certificado pidiéndole al gateway que acuñe/mueva el NFT.
 *   3. Gateway (único que habla con la cadena) → NFT ERC-721 en Polygon.
 */
@Component({
  selector: 'app-microservicios-cadena',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, FormsModule],
  templateUrl: './microservicios-cadena.component.html',
  styleUrl: '../blockchain/marketplace.scss',
})
export class MicroserviciosCadenaComponent implements OnInit {
  private fb = inject(FormBuilder);
  private toast = inject(ToastService);
  private certGen = inject(CertificacionGeneracionService);
  private certRen = inject(CertificadosRenovablesService);

  backendOk = false;
  gatewayEstado?: GatewayEstado;

  balances: BalanceGeneracion[] = [];
  solicitudes: SolicitudCertificacion[] = [];
  certificados: CertificadoRenovable[] = [];
  detalle?: CertificadoRenovable;

  // Formularios
  formGen: FormGroup = this.fb.group({
    medidorId: ['MEDIDOR-IOT-0001', Validators.required],
    medicionId: ['', Validators.required],
    wh: [600000, [Validators.required, Validators.min(1)]],
  });
  formSol: FormGroup = this.fb.group({
    medidorId: ['MEDIDOR-IOT-0001', Validators.required],
    propietario: ['0x1111111111111111111111111111111111111111', Validators.required],
    periodo: [this.periodoActual(), [Validators.required, Validators.min(200001)]],
  });
  formTransf: FormGroup = this.fb.group({
    id: ['', Validators.required],
    hacia: ['0x2222222222222222222222222222222222222222', Validators.required],
  });

  ngOnInit(): void {
    this.cargarTodo();
    this.certRen.gateway().subscribe({
      next: (g) => { this.gatewayEstado = g; this.backendOk = true; },
      error: () => { this.backendOk = false; },
    });
  }

  private cargarTodo(): void {
    this.certGen.balances().subscribe({ next: (b) => { this.balances = b; this.backendOk = true; }, error: () => {} });
    this.certGen.solicitudes().subscribe({ next: (s) => (this.solicitudes = s), error: () => {} });
    this.certRen.listar().subscribe({ next: (c) => (this.certificados = c), error: () => {} });
  }

  // ---------------- Métricas ----------------
  get totalBloques(): number { return this.balances.reduce((s, b) => s + b.bloquesReservados, 0); }
  get solPendientes(): number { return this.solicitudes.filter((s) => s.estado === 'PENDIENTE').length; }
  get solAprobadas(): number { return this.solicitudes.filter((s) => s.estado === 'APROBADA').length; }
  get certActivos(): number { return this.certificados.filter((c) => c.estadoDominio === 'EMITIDO').length; }
  get transferencias(): number {
    return this.certificados.reduce((s, c) => s + c.historial.filter((h) => h.tipo === 'TRANSFERENCIA').length, 0);
  }

  // ---------------- Acciones · Certificación de Generación ----------------
  registrarGeneracion(): void {
    if (this.formGen.invalid) { this.formGen.markAllAsTouched(); return; }
    const v = this.formGen.value;
    const medicionId = v.medicionId?.trim() || `m-${Date.now().toString(36)}`;
    this.certGen.registrarGeneracion({ medidorId: v.medidorId, medicionId, wh: Number(v.wh) }).subscribe({
      next: () => { this.toast.success('Generación registrada', `${v.wh} Wh en ${v.medidorId}`); this.formGen.patchValue({ medicionId: '' }); this.cargarTodo(); },
      error: (e) => this.toast.error('No se pudo registrar', this.msg(e)),
    });
  }
  solicitar(): void {
    if (this.formSol.invalid) { this.formSol.markAllAsTouched(); return; }
    const v = this.formSol.value;
    this.certGen.solicitar({ medidorId: v.medidorId, propietario: v.propietario, periodo: Number(v.periodo) }).subscribe({
      next: (s) => { this.toast.success('Solicitud creada', `${s.id} · bloque ${s.energiaWh} Wh`); this.cargarTodo(); },
      error: (e) => this.toast.error('No se pudo solicitar', this.msg(e)),
    });
  }
  avalarVoltera(s: SolicitudCertificacion): void {
    this.certGen.avalarVoltera(s.id).subscribe({ next: () => { this.toast.success('Aval Voltera', s.id); this.cargarTodo(); }, error: (e) => this.toast.error('Error', this.msg(e)) });
  }
  avalarCertificadora(s: SolicitudCertificacion): void {
    this.certGen.avalarCertificadora(s.id).subscribe({ next: () => { this.toast.success('Aval certificadora', s.id); this.cargarTodo(); }, error: (e) => this.toast.error('Error', this.msg(e)) });
  }
  rechazar(s: SolicitudCertificacion): void {
    this.certGen.rechazar(s.id, 'medición sospechosa').subscribe({ next: () => { this.toast.success('Rechazada', s.id); this.cargarTodo(); }, error: (e) => this.toast.error('Error', this.msg(e)) });
  }

  /** Emite el certificado renovable (NFT vía gateway) a partir de una solicitud APROBADA. */
  emitirDesde(s: SolicitudCertificacion): void {
    if (s.estado !== 'APROBADA') { this.toast.error('No aprobada', `La solicitud ${s.id} aún no tiene los dos avales.`); return; }
    this.certRen.emitir({
      idMedidor: s.medidorId, emisor: '0xB7aCd8EEeE86Be961EAf832657b3B6807220fbCf',
      titular: s.propietario, consumoNetoMensualWh: s.energiaWh, periodo: s.periodo,
      solicitudCertificacionId: s.id,
    }).subscribe({
      next: (c) => { this.toast.success('Certificado emitido (NFT vía gateway)', `${c.id} · token ${c.tokenId ?? '—'}`); this.formTransf.patchValue({ id: c.id }); this.cargarTodo(); },
      error: (e) => this.toast.error('No se pudo emitir', this.msg(e)),
    });
  }

  // ---------------- Acciones · Certificados Renovables ----------------
  transferir(): void {
    if (this.formTransf.invalid) { this.formTransf.markAllAsTouched(); return; }
    const v = this.formTransf.value;
    this.certRen.transferir(v.id, v.hacia).subscribe({
      next: (c) => { this.toast.success('Transferido', `${c.id} → ${this.corto(v.hacia)}`); this.cargarTodo(); },
      error: (e) => this.toast.error('No se pudo transferir', this.msg(e)),
    });
  }
  retirar(c: CertificadoRenovable): void {
    this.certRen.retirar(c.id).subscribe({
      next: () => { this.toast.success('Retirado', c.id); this.cargarTodo(); },
      error: (e) => this.toast.error('No se pudo retirar', this.msg(e)),
    });
  }

  abrirDetalle(c: CertificadoRenovable): void { this.detalle = c; }
  cerrarDetalle(): void { this.detalle = undefined; }

  copiar(valor?: string | null, etiqueta = 'Valor'): void {
    if (!valor) return;
    const done = () => this.toast.success('Copiado', `${etiqueta} copiado.`);
    if (navigator.clipboard?.writeText) navigator.clipboard.writeText(valor).then(done, () => {});
    else done();
  }

  corto(a?: string | null): string {
    if (!a) return '—';
    return a.length > 14 ? `${a.slice(0, 7)}…${a.slice(-5)}` : a;
  }
  badgeSol(estado: string): string {
    if (estado === 'APROBADA') return 'pill-ok';
    if (estado === 'RECHAZADA') return 'pill-warn';
    return 'pill-info';
  }
  badgeCadena(estado: string): string {
    if (estado === 'CONFIRMADO') return 'pill-ok';
    if (estado === 'FALLIDO') return 'pill-warn';
    return 'pill-info';
  }

  private periodoActual(): number {
    const d = new Date();
    return d.getFullYear() * 100 + (d.getMonth() + 1);
  }
  private msg(e: any): string { return describeHttpError(e); }
}
