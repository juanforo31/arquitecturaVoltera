// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";

/**
 * @title CesionCertificadoMultisig
 * @notice Implementa el patron MULTIPLE AUTHORIZATION (familia SEGURIDAD) para la
 *         cesion de certificados de origen renovable entre participantes de Voltera.
 *
 * Patron (ver slide 05 "Patrones de blockchain" y BLOCKCHAIN_VOLTERA.md):
 *  - PROBLEMA: una cesion de certificado (quien cede, a quien, que certificado)
 *    es un acto de alto valor; dejar que UNA sola cuenta lo registre por si sola
 *    crea un punto unico de fraude/error. Si el oraculo se equivoca o es
 *    comprometido, podria ceder certificados indebidamente.
 *  - SOLUCION: separar "proponer" de "confirmar". La cesion solo queda REGISTRADA
 *    (surte efecto on-chain) cuando DOS cuentas FIRMANTES DISTINTAS la han
 *    aprobado. Es un M-de-N simplificado con umbral 2 (dos firmas antes de
 *    registrar), el patron "Multiple Authorization" del material del curso.
 *  - CONSECUENCIAS:
 *      Se GANA: tolerancia a un firmante malicioso o equivocado (no basta uno);
 *               trazabilidad de quien propuso y quien confirmo (no repudio).
 *      Se PAGA: mayor latencia (dos transacciones en vez de una) y mas gas;
 *               complejidad operativa (hay que custodiar >= 2 llaves activas).
 *  - FAMILIA: SEGURIDAD (junto con X-confirmation y Embedded Permission).
 *
 * Complementa a LiquidacionP2PAnchor (anclaje de hash, patron off-chain storage)
 * y a ComunidadEnergeticaRegistry (padron). Aqui el acto sensible es la CESION.
 *
 * Alineado con el arbol de decision: on-chain va solo el hash del certificado y
 * los IDs (bytes32), nunca datos personales (gate 8); el acto queda inmutable y
 * con no repudio (gate 4); roles via AccessControl = Embedded Permission (Zero Trust).
 */
contract CesionCertificadoMultisig is AccessControl, Pausable {
    /// @dev Rol de quienes pueden proponer y confirmar cesiones (los firmantes).
    bytes32 public constant FIRMANTE_ROLE = keccak256("FIRMANTE_ROLE");

    /// @dev Numero de firmas distintas requeridas para registrar (umbral = 2).
    uint8 public constant FIRMAS_REQUERIDAS = 2;

    enum Estado {
        INEXISTENTE, // 0 — nunca propuesta
        PENDIENTE,   // 1 — propuesta, esperando la 2a firma
        REGISTRADA   // 2 — aprobada por >= 2 firmantes distintos; surte efecto
    }

    struct Cesion {
        bytes32 certificadoId;  // id del certificado de origen (bytes32)
        bytes32 cedenteId;      // quien cede (hash del id de dominio)
        bytes32 cesionarioId;   // quien recibe (hash del id de dominio)
        bytes32 hashDetalle;    // keccak256 del documento canonico (off-chain)
        uint32  aprobaciones;   // numero de firmas distintas recogidas
        uint64  propuestaEn;    // epoch seconds de la propuesta
        uint64  registradaEn;   // epoch seconds al alcanzar el umbral (0 si pendiente)
        Estado  estado;
    }

    /// @notice cesionId => cesion.
    mapping(bytes32 => Cesion) private _cesiones;

    /// @notice cesionId => (firmante => ya firmo). Evita doble firma del mismo.
    mapping(bytes32 => mapping(address => bool)) private _haFirmado;

    /// @notice total de cesiones efectivamente REGISTRADAS (contador monotono).
    uint256 public totalRegistradas;

    event CesionPropuesta(
        bytes32 indexed cesionId,
        bytes32 indexed certificadoId,
        bytes32 cedenteId,
        bytes32 cesionarioId,
        bytes32 hashDetalle,
        address indexed proponente,
        uint64  propuestaEn
    );
    event CesionFirmada(
        bytes32 indexed cesionId,
        address indexed firmante,
        uint32  aprobaciones
    );
    event CesionRegistrada(
        bytes32 indexed cesionId,
        bytes32 indexed certificadoId,
        uint32  aprobaciones,
        uint64  registradaEn
    );

    error CesionIdVacio();
    error DatoVacio();
    error CesionYaExiste(bytes32 cesionId);
    error CesionNoExiste(bytes32 cesionId);
    error YaRegistrada(bytes32 cesionId);
    error FirmanteDuplicado(bytes32 cesionId, address firmante);

    /**
     * @param adminInicial recibe DEFAULT_ADMIN_ROLE y la 1a cuenta FIRMANTE_ROLE.
     *        OJO: para que una cesion se registre hacen falta DOS firmantes
     *        distintos, asi que el admin debe autorizar al menos un firmante mas
     *        con autorizarFirmante(...). Con un solo firmante nada se registra.
     */
    constructor(address adminInicial) {
        require(adminInicial != address(0), "admin invalido");
        _grantRole(DEFAULT_ADMIN_ROLE, adminInicial);
        _grantRole(FIRMANTE_ROLE, adminInicial);
    }

    /**
     * @notice 1er paso: un firmante PROPONE una cesion. Cuenta como su firma (1/2).
     *         No surte efecto todavia: queda PENDIENTE hasta la 2a firma distinta.
     */
    function proponerCesion(
        bytes32 cesionId,
        bytes32 certificadoId,
        bytes32 cedenteId,
        bytes32 cesionarioId,
        bytes32 hashDetalle
    ) external onlyRole(FIRMANTE_ROLE) whenNotPaused {
        if (cesionId == bytes32(0)) revert CesionIdVacio();
        if (certificadoId == bytes32(0) || cedenteId == bytes32(0)
            || cesionarioId == bytes32(0) || hashDetalle == bytes32(0)) revert DatoVacio();
        if (_cesiones[cesionId].estado != Estado.INEXISTENTE) revert CesionYaExiste(cesionId);

        uint64 ahora = uint64(block.timestamp);
        _cesiones[cesionId] = Cesion({
            certificadoId: certificadoId,
            cedenteId: cedenteId,
            cesionarioId: cesionarioId,
            hashDetalle: hashDetalle,
            aprobaciones: 1,
            propuestaEn: ahora,
            registradaEn: 0,
            estado: Estado.PENDIENTE
        });
        _haFirmado[cesionId][msg.sender] = true;

        emit CesionPropuesta(
            cesionId, certificadoId, cedenteId, cesionarioId, hashDetalle, msg.sender, ahora
        );
        emit CesionFirmada(cesionId, msg.sender, 1);
    }

    /**
     * @notice 2o paso: OTRO firmante distinto CONFIRMA la cesion. Al alcanzar
     *         FIRMAS_REQUERIDAS (2) la cesion pasa a REGISTRADA y surte efecto.
     *         Un mismo firmante no puede firmar dos veces (FirmanteDuplicado).
     */
    function confirmarCesion(bytes32 cesionId)
        external
        onlyRole(FIRMANTE_ROLE)
        whenNotPaused
    {
        Cesion storage c = _cesiones[cesionId];
        if (c.estado == Estado.INEXISTENTE) revert CesionNoExiste(cesionId);
        if (c.estado == Estado.REGISTRADA) revert YaRegistrada(cesionId);
        if (_haFirmado[cesionId][msg.sender]) revert FirmanteDuplicado(cesionId, msg.sender);

        _haFirmado[cesionId][msg.sender] = true;
        c.aprobaciones += 1;
        emit CesionFirmada(cesionId, msg.sender, c.aprobaciones);

        if (c.aprobaciones >= FIRMAS_REQUERIDAS) {
            uint64 ahora = uint64(block.timestamp);
            c.estado = Estado.REGISTRADA;
            c.registradaEn = ahora;
            totalRegistradas += 1;
            emit CesionRegistrada(cesionId, c.certificadoId, c.aprobaciones, ahora);
        }
    }

    // ── Lecturas (auditor / indexador) ──────────────────────────────────────

    function obtenerCesion(bytes32 cesionId) external view returns (Cesion memory) {
        return _cesiones[cesionId];
    }

    function estaRegistrada(bytes32 cesionId) external view returns (bool) {
        return _cesiones[cesionId].estado == Estado.REGISTRADA;
    }

    function haFirmado(bytes32 cesionId, address firmante) external view returns (bool) {
        return _haFirmado[cesionId][firmante];
    }

    // ── Operacion (solo admin) ──────────────────────────────────────────────

    function pausar() external onlyRole(DEFAULT_ADMIN_ROLE) { _pause(); }
    function reanudar() external onlyRole(DEFAULT_ADMIN_ROLE) { _unpause(); }

    function autorizarFirmante(address cuenta) external onlyRole(DEFAULT_ADMIN_ROLE) {
        _grantRole(FIRMANTE_ROLE, cuenta);
    }

    function revocarFirmante(address cuenta) external onlyRole(DEFAULT_ADMIN_ROLE) {
        _revokeRole(FIRMANTE_ROLE, cuenta);
    }
}
