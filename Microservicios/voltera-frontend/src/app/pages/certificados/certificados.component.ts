import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { ToastService } from '../../core/toast.service';
import { CertificadoService } from '../../services/certificado.service';
import { describeHttpError } from '../../core/http-error';
import { CertificadoNft, MovimientoNft } from '../../core/models';

const LS_CERTS = 'voltera.nft.certificados.v1';
const LS_WALLETS = 'voltera.nft.wallets.v1';
const ZERO = '0x0000000000000000000000000000000000000000';

/** Billetera conocida con una etiqueta legible. */
interface Billetera {
  address: string;
  etiqueta: string;
}

/**
 * Certificados de Origen Renovable como NFT (ERC-721 NO fungible).
 * Implementa la lámina 05/06 (Módulo 4): emisión de un token único por
 * (medidor, periodo) y TRANSFERENCIA trazable DE una billetera A otra.
 *
 * El contrato `CertificadoOrigenNFT.sol` está escrito y probado; mientras no
 * esté desplegado en Amoy (gas del faucet) esta página modela el ciclo de vida
 * del lado del cliente con las MISMAS reglas del contrato (unicidad por
 * medidor+periodo, solo-emisor, quema) y persiste el libro mayor billetera→
 * billetera. Cuando el gateway exponga el NFT, se conecta sin cambiar la UI.
 */
@Component({
  selector: 'app-certificados',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, FormsModule],
  templateUrl: './certificados.component.html',
  styleUrl: '../blockchain/marketplace.scss',
})
export class CertificadosComponent implements OnInit {
  private fb = inject(FormBuilder);
  private toast = inject(ToastService);
  private api = inject(CertificadoService);

  // Estado de la conexión con el backend NFT.
  backendOk = false;
  redInfo?: { red: string; chainId: number; contrato: string; tipo: string; disponible: boolean };

  // Catálogo de billeteras (demo + las que vaya creando el usuario).
  billeteras: Billetera[] = [];

  // Certificados tokenizados.
  certificados: CertificadoNft[] = [];
  detalle?: CertificadoNft;

  // Filtros
  filtroPropietario = '';     // '' = todas las billeteras
  filtroTexto = '';

  // Formulario de EMISIÓN (billetera emisora → billetera propietaria)
  formEmitir: FormGroup = this.fb.group({
    emisor: [ZERO, Validators.required],
    propietario: [ZERO, Validators.required],
    idMedidor: ['MEDIDOR-IOT-0001', Validators.required],
    consumoNetoMensualWh: [120000, [Validators.required, Validators.min(1)]],
    periodo: [this.periodoActual(), [Validators.required, Validators.min(200001)]],
  });

  // Formulario de TRANSFERENCIA (de una billetera a otra)
  formTransferir: FormGroup = this.fb.group({
    tokenId: [null as number | null, Validators.required],
    hacia: [ZERO, Validators.required],
  });

  ngOnInit(): void {
    this.restaurar();
    if (!this.billeteras.length) this.sembrarBilleteras();
    this.cargarRed();
    this.cargarDesdeBackend();
  }

  // ---------------- Red / contrato ----------------
  private cargarRed(): void {
    this.api.red().subscribe({
      next: (r) => { this.redInfo = r; this.backendOk = true; },
      error: () => { this.redInfo = undefined; this.backendOk = false; },
    });
  }

  /** Carga los certificados reales del gateway; si no responde, usa el modo demo local. */
  private cargarDesdeBackend(): void {
    this.api.listar().subscribe({
      next: (lista) => {
        this.backendOk = true;
        if (lista && lista.length) {
          this.certificados = lista.map((c) => ({ ...c, historial: Array.isArray(c.historial) ? c.historial : [] }));
          this.persistir();
        } else if (!this.certificados.length) {
          this.sembrarDemo();
        }
      },
      error: () => {
        this.backendOk = false;
        if (!this.certificados.length) this.sembrarDemo();
      },
    });
  }

  // ---------------- Métricas ----------------
  get totalEmitidos(): number { return this.certificados.length; }
  get totalActivos(): number { return this.certificados.filter((c) => !c.quemado).length; }
  get totalTransferencias(): number {
    return this.certificados.reduce((s, c) => s + c.historial.filter((h) => h.tipo === 'TRANSFERENCIA').length, 0);
  }
  get consumoTotalWh(): number {
    return this.certificados.filter((c) => !c.quemado).reduce((s, c) => s + Number(c.consumoNetoMensualWh || 0), 0);
  }

  /** Todos los movimientos de todas las billeteras, del más reciente al más antiguo. */
  get libroMayor(): MovimientoNft[] {
    return this.certificados
      .flatMap((c) => c.historial)
      .sort((a, b) => (a.ts < b.ts ? 1 : -1));
  }

  get certificadosFiltrados(): CertificadoNft[] {
    let base = this.certificados;
    if (this.filtroPropietario) base = base.filter((c) => c.propietario === this.filtroPropietario);
    const q = this.filtroTexto.trim().toLowerCase();
    if (q) {
      base = base.filter((c) =>
        c.idMedidor.toLowerCase().includes(q) ||
        String(c.tokenId) === q ||
        String(c.periodo).includes(q) ||
        c.propietario.toLowerCase().includes(q),
      );
    }
    return base;
  }

  // ---------------- Billeteras ----------------
  etiquetaDe(address?: string | null): string {
    if (!address) return '—';
    if (address === ZERO) return '0x000…0000 (red)';
    const b = this.billeteras.find((x) => x.address.toLowerCase() === address.toLowerCase());
    return b ? `${b.etiqueta} · ${this.cortoAddr(address)}` : this.cortoAddr(address);
  }

  cortoAddr(a?: string | null): string {
    if (!a) return '—';
    return a.length > 12 ? `${a.slice(0, 6)}…${a.slice(-4)}` : a;
  }

  nuevaBilletera(): void {
    const address = this.generarAddress();
    const etiqueta = `Billetera ${this.billeteras.length + 1}`;
    this.billeteras = [...this.billeteras, { address, etiqueta }];
    this.persistir();
    this.toast.success('Billetera creada', `${etiqueta} · ${this.cortoAddr(address)}`);
  }

  private generarAddress(): string {
    const hex = '0123456789abcdef';
    let a = '0x';
    for (let i = 0; i < 40; i++) a += hex[Math.floor(Math.random() * 16)];
    return a;
  }

  // ---------------- EMISIÓN ----------------
  emitir(): void {
    if (this.formEmitir.invalid) { this.formEmitir.markAllAsTouched(); return; }
    const v = this.formEmitir.value;
    const idMedidor = String(v.idMedidor).trim();
    const periodo = Number(v.periodo);

    // Regla del contrato: 0 duplicados para el mismo (medidor, periodo).
    const dup = this.certificados.find((c) => c.idMedidor === idMedidor && c.periodo === periodo && !c.quemado);
    if (dup) {
      this.toast.error('Emisión duplicada rechazada', `Ya existe el certificado #${dup.tokenId} para ${idMedidor} / ${periodo}.`);
      return;
    }

    // Camino BACKEND: el gateway emite (on-chain o demo) y devuelve el certificado real.
    if (this.backendOk) {
      this.api.emitir({
        emisor: v.emisor,
        propietario: v.propietario,
        idMedidor,
        consumoNetoMensualWh: Number(v.consumoNetoMensualWh),
        periodo,
      }).subscribe({
        next: (cert) => {
          this.certificados = [{ ...cert, historial: cert.historial || [] }, ...this.certificados];
          this.formTransferir.patchValue({ tokenId: cert.tokenId });
          this.persistir();
          this.toast.success('Certificado emitido', `NFT #${cert.tokenId} → ${this.etiquetaDe(v.propietario)}`);
        },
        error: (e) => this.toast.error('No se pudo emitir', this.msg(e)),
      });
      return;
    }

    // Camino DEMO (sin backend): modela el mint del lado del cliente.
    const tokenId = this.siguienteTokenId();
    const ahora = new Date().toISOString();
    const hashDetalle = this.hashSimulado(`${idMedidor}|${periodo}|${v.consumoNetoMensualWh}`);
    const cert: CertificadoNft = {
      tokenId,
      idMedidor,
      propietario: v.propietario,
      emisor: v.emisor,
      consumoNetoMensualWh: Number(v.consumoNetoMensualWh),
      periodo,
      tokenUri: `ipfs://voltera/certificado/${tokenId}`,
      hashDetalle,
      emitidoEn: ahora,
      quemado: false,
      historial: [{
        id: `MOV-${Date.now().toString(36).toUpperCase()}`,
        tokenId,
        tipo: 'EMISION',
        desde: ZERO,              // una emisión ERC-721 nace desde la dirección cero
        hacia: v.propietario,
        ejecutadoPor: v.emisor,
        ts: ahora,
        txHash: this.txHashSimulado(),
        nota: 'Acuñación (mint) del certificado de origen',
      }],
    };
    this.certificados = [cert, ...this.certificados];
    this.formTransferir.patchValue({ tokenId });
    this.persistir();
    this.toast.success('Certificado emitido (demo)', `NFT #${tokenId} → ${this.etiquetaDe(v.propietario)}`);
  }

  // ---------------- TRANSFERENCIA (billetera → billetera) ----------------
  transferir(): void {
    if (this.formTransferir.invalid) { this.formTransferir.markAllAsTouched(); return; }
    const tokenId = Number(this.formTransferir.value.tokenId);
    const hacia = String(this.formTransferir.value.hacia);
    const cert = this.certificados.find((c) => c.tokenId === tokenId);
    if (!cert) { this.toast.error('Token inexistente', `No existe el NFT #${tokenId}.`); return; }
    if (cert.quemado) { this.toast.error('Certificado retirado', `El NFT #${tokenId} fue quemado.`); return; }
    if (hacia === ZERO) { this.toast.error('Destino inválido', 'Elige una billetera destino válida.'); return; }
    if (hacia.toLowerCase() === cert.propietario.toLowerCase()) {
      this.toast.error('Sin cambio', 'El destino ya es el propietario actual.');
      return;
    }
    const desde = cert.propietario;

    // Camino BACKEND.
    if (this.backendOk) {
      this.api.transferir(tokenId, hacia).subscribe({
        next: (actualizado) => {
          this.reemplazar(actualizado);
          this.toast.success('Transferencia registrada', `NFT #${tokenId}: ${this.etiquetaDe(desde)} → ${this.etiquetaDe(hacia)}`);
        },
        error: (e) => this.toast.error('No se pudo transferir', this.msg(e)),
      });
      return;
    }

    // Camino DEMO.
    const ahora = new Date().toISOString();
    cert.historial = [...cert.historial, {
      id: `MOV-${Date.now().toString(36).toUpperCase()}`,
      tokenId,
      tipo: 'TRANSFERENCIA',
      desde,
      hacia,
      ejecutadoPor: desde,       // el propietario firma su propia transferencia
      ts: ahora,
      txHash: this.txHashSimulado(),
      nota: 'Transferencia de propiedad del certificado',
    }];
    cert.propietario = hacia;
    this.certificados = [...this.certificados];
    this.persistir();
    this.toast.success('Transferencia registrada (demo)', `NFT #${tokenId}: ${this.etiquetaDe(desde)} → ${this.etiquetaDe(hacia)}`);
  }

  // ---------------- QUEMA / retiro ----------------
  quemar(cert: CertificadoNft): void {
    if (cert.quemado) return;

    // Camino BACKEND.
    if (this.backendOk) {
      this.api.quemar(cert.tokenId).subscribe({
        next: (actualizado) => {
          this.reemplazar(actualizado);
          this.toast.success('Certificado retirado', `NFT #${cert.tokenId} quemado.`);
        },
        error: (e) => this.toast.error('No se pudo quemar', this.msg(e)),
      });
      return;
    }

    // Camino DEMO.
    const ahora = new Date().toISOString();
    cert.historial = [...cert.historial, {
      id: `MOV-${Date.now().toString(36).toUpperCase()}`,
      tokenId: cert.tokenId,
      tipo: 'QUEMA',
      desde: cert.propietario,
      hacia: ZERO,
      ejecutadoPor: cert.propietario,
      ts: ahora,
      txHash: this.txHashSimulado(),
      nota: 'Retiro (burn) del certificado',
    }];
    cert.quemado = true;
    this.certificados = [...this.certificados];
    this.persistir();
    this.toast.success('Certificado retirado (demo)', `NFT #${cert.tokenId} quemado.`);
  }

  /** Reemplaza un certificado en la lista por su versión actualizada del backend. */
  private reemplazar(actualizado: CertificadoNft): void {
    const norm = { ...actualizado, historial: actualizado.historial || [] };
    this.certificados = this.certificados.map((c) => (c.tokenId === norm.tokenId ? norm : c));
    if (this.detalle?.tokenId === norm.tokenId) this.detalle = norm;
    this.persistir();
  }

  // ---------------- Detalle ----------------
  abrirDetalle(c: CertificadoNft): void { this.detalle = c; }
  cerrarDetalle(): void { this.detalle = undefined; }
  filtrarPropietario(address: string): void {
    this.filtroPropietario = this.filtroPropietario === address ? '' : address;
  }

  copiar(valor?: string | null, etiqueta = 'Valor'): void {
    if (!valor) return;
    const done = () => this.toast.success('Copiado', `${etiqueta} copiado al portapapeles.`);
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(valor).then(done, () => this.toast.error('No se pudo copiar', valor));
    } else { done(); }
  }

  // ---------------- Exportar evidencia ----------------
  exportarJson(): void {
    const data = this.certificadosFiltrados.map((c) => ({
      tokenId: c.tokenId,
      idMedidor: c.idMedidor,
      emisor: c.emisor,
      propietario: c.propietario,
      consumoNetoMensualWh: c.consumoNetoMensualWh,
      periodo: c.periodo,
      tokenUri: c.tokenUri,
      hashDetalle: c.hashDetalle,
      quemado: c.quemado,
      transferencias: c.historial.map((h) => ({ tipo: h.tipo, desde: h.desde, hacia: h.hacia, ts: h.ts, txHash: h.txHash })),
    }));
    this.descargar(JSON.stringify(data, null, 2), 'voltera-certificados-nft.json', 'application/json');
  }

  exportarCsv(): void {
    const cols = ['tokenId', 'tipo', 'desde', 'hacia', 'ejecutadoPor', 'ts', 'txHash'];
    const esc = (v: any) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const filas = this.libroMayor.map((h) =>
      [h.tokenId, h.tipo, h.desde, h.hacia, h.ejecutadoPor, h.ts, h.txHash || ''].map(esc).join(','));
    this.descargar([cols.join(','), ...filas].join('\n'), 'voltera-libro-mayor-nft.csv', 'text/csv');
  }

  private descargar(contenido: string, nombre: string, tipo: string): void {
    const blob = new Blob([contenido], { type: tipo });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = nombre; a.click();
    URL.revokeObjectURL(url);
    this.toast.success('Evidencia exportada', nombre);
  }

  reiniciar(): void {
    this.certificados = [];
    this.billeteras = [];
    this.sembrarBilleteras();
    this.sembrarDemo();
    this.persistir();
    this.toast.success('Reiniciado', 'Se restauraron los datos de demostración.');
  }

  // ---------------- Persistencia ----------------
  private persistir(): void {
    try {
      localStorage.setItem(LS_CERTS, JSON.stringify(this.certificados));
      localStorage.setItem(LS_WALLETS, JSON.stringify(this.billeteras));
    } catch { /* almacenamiento no disponible */ }
  }

  private restaurar(): void {
    try {
      const c = localStorage.getItem(LS_CERTS);
      if (c) {
        const parsed = JSON.parse(c);
        this.certificados = Array.isArray(parsed)
          ? parsed.map((x: any) => ({ ...x, historial: Array.isArray(x.historial) ? x.historial : [] }))
          : [];
      }
      const w = localStorage.getItem(LS_WALLETS);
      if (w) {
        const parsed = JSON.parse(w);
        this.billeteras = Array.isArray(parsed) ? parsed : [];
      }
    } catch { /* datos corruptos: empezar limpio */ }
  }

  // ---------------- Semillas / helpers ----------------
  private sembrarBilleteras(): void {
    this.billeteras = [
      { address: '0xB7aCd8EEeE86Be961EAf832657b3B6807220fbCf', etiqueta: 'Operador/Emisor' },
      { address: '0x1111111111111111111111111111111111111111', etiqueta: 'Prosumidor Solar' },
      { address: '0x2222222222222222222222222222222222222222', etiqueta: 'Comercializadora' },
      { address: '0x3333333333333333333333333333333333333333', etiqueta: 'Prosumidor Eólico' },
    ];
    // Deja seleccionadas emisor/propietario por defecto.
    this.formEmitir.patchValue({ emisor: this.billeteras[0].address, propietario: this.billeteras[1].address });
    this.formTransferir.patchValue({ hacia: this.billeteras[2].address });
  }

  private sembrarDemo(): void {
    if (this.billeteras.length < 2) return;
    const emisor = this.billeteras[0].address;
    const prop = this.billeteras[1].address;
    const comercializadora = this.billeteras[2].address;
    const t0 = new Date(Date.now() - 86400000).toISOString();
    const t1 = new Date(Date.now() - 3600000).toISOString();
    const cert: CertificadoNft = {
      tokenId: 1,
      idMedidor: 'MEDIDOR-IOT-0001',
      propietario: comercializadora,
      emisor,
      consumoNetoMensualWh: 120000,
      periodo: this.periodoActual(),
      tokenUri: 'ipfs://voltera/certificado/1',
      hashDetalle: this.hashSimulado('MEDIDOR-IOT-0001|demo'),
      emitidoEn: t0,
      quemado: false,
      historial: [
        { id: 'MOV-DEMO-1', tokenId: 1, tipo: 'EMISION', desde: ZERO, hacia: prop, ejecutadoPor: emisor, ts: t0, txHash: this.txHashSimulado(), nota: 'Acuñación del certificado' },
        { id: 'MOV-DEMO-2', tokenId: 1, tipo: 'TRANSFERENCIA', desde: prop, hacia: comercializadora, ejecutadoPor: prop, ts: t1, txHash: this.txHashSimulado(), nota: 'Venta del certificado a la comercializadora' },
      ],
    };
    this.certificados = [cert];
  }

  private siguienteTokenId(): number {
    return this.certificados.reduce((m, c) => Math.max(m, c.tokenId), 0) + 1;
  }

  private periodoActual(): number {
    const d = new Date();
    return d.getFullYear() * 100 + (d.getMonth() + 1);
  }

  private hashSimulado(semilla: string): string {
    // Hash determinista simple (NO criptográfico): solo para evidencia visual
    // mientras el contrato no está desplegado. On-chain sería keccak256 real.
    let h = 0;
    for (let i = 0; i < semilla.length; i++) h = (h * 31 + semilla.charCodeAt(i)) >>> 0;
    const hex = h.toString(16).padStart(8, '0');
    return `0x${hex.repeat(8).slice(0, 64)}`;
  }

  private txHashSimulado(): string {
    const hex = '0123456789abcdef';
    let a = '0x';
    for (let i = 0; i < 64; i++) a += hex[Math.floor(Math.random() * 16)];
    return a;
  }

  private msg(e: any): string { return describeHttpError(e); }
}
