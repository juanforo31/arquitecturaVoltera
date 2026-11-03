// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";

/**
 * @title ComunidadEnergeticaRegistry
 * @notice Registro inmutable de COMUNIDADES ENERGETICAS de Voltera y de la
 *         membresia de sus prosumidores. Complementa a LiquidacionP2PAnchor:
 *         mientras ese ancla cada casacion, este fija QUIEN pertenece a cada
 *         comunidad (padron) — base para auditar que una casacion P2P ocurrio
 *         entre miembros de la misma comunidad.
 *
 * Alineado con el arbol de decision (ver BLOCKCHAIN_VOLTERA.md):
 *  - Gate 1 (multiples partes): prosumidores, operador de la comunidad y regulador.
 *  - Gate 4 (no repudio): alta/baja de miembros quedan registradas con evento y
 *    marca temporal; el padron no se puede reescribir silenciosamente.
 *  - Gate 7 (admin descentralizable): el rol de operador de comunidad es delegable.
 *  - Patron Embedded Permission (Zero Trust): solo OPERADOR_ROLE gestiona el padron.
 *  - Gate 8 (off-chain storage): on-chain van IDs/hashes, no datos personales (KYC
 *    vive off-chain en los microservicios). El prosumidor se identifica por bytes32
 *    (p. ej. keccak256 de su id de dominio), no por su nombre real.
 */
contract ComunidadEnergeticaRegistry is AccessControl, Pausable {
    /// @dev Rol que administra el padron de comunidades (operador de la comunidad).
    bytes32 public constant OPERADOR_ROLE = keccak256("OPERADOR_ROLE");

    struct Comunidad {
        bytes32 nombreHash;   // keccak256 del nombre canonico (off-chain el texto)
        uint64  creadaEn;     // epoch seconds del bloque de alta
        uint32  totalMiembros;// miembros activos
        bool    existe;
    }

    /// @notice comunidadId (bytes32) => comunidad.
    mapping(bytes32 => Comunidad) private _comunidades;

    /// @notice comunidadId => (prosumidorId => es miembro activo).
    mapping(bytes32 => mapping(bytes32 => bool)) private _miembros;

    /// @notice total de comunidades registradas (contador monotono).
    uint256 public totalComunidades;

    event ComunidadRegistrada(
        bytes32 indexed comunidadId, bytes32 nombreHash, uint64 creadaEn, address indexed operador
    );
    event MiembroAgregado(
        bytes32 indexed comunidadId, bytes32 indexed prosumidorId, uint64 en, address indexed operador
    );
    event MiembroRemovido(
        bytes32 indexed comunidadId, bytes32 indexed prosumidorId, uint64 en, address indexed operador
    );

    error ComunidadIdVacio();
    error ComunidadYaExiste(bytes32 comunidadId);
    error ComunidadNoExiste(bytes32 comunidadId);
    error ProsumidorIdVacio();
    error YaEsMiembro(bytes32 comunidadId, bytes32 prosumidorId);
    error NoEsMiembro(bytes32 comunidadId, bytes32 prosumidorId);

    constructor(address adminInicial) {
        require(adminInicial != address(0), "admin invalido");
        _grantRole(DEFAULT_ADMIN_ROLE, adminInicial);
        _grantRole(OPERADOR_ROLE, adminInicial);
    }

    /**
     * @notice Registra una nueva comunidad energetica.
     * @param comunidadId identificador (bytes32) de la comunidad.
     * @param nombreHash  keccak256 del nombre canonico (el texto vive off-chain).
     */
    function registrarComunidad(bytes32 comunidadId, bytes32 nombreHash)
        external
        onlyRole(OPERADOR_ROLE)
        whenNotPaused
    {
        if (comunidadId == bytes32(0)) revert ComunidadIdVacio();
        if (_comunidades[comunidadId].existe) revert ComunidadYaExiste(comunidadId);

        uint64 ahora = uint64(block.timestamp);
        _comunidades[comunidadId] = Comunidad({
            nombreHash: nombreHash,
            creadaEn: ahora,
            totalMiembros: 0,
            existe: true
        });
        totalComunidades += 1;
        emit ComunidadRegistrada(comunidadId, nombreHash, ahora, msg.sender);
    }

    /// @notice Agrega un prosumidor al padron de la comunidad.
    function agregarMiembro(bytes32 comunidadId, bytes32 prosumidorId)
        external
        onlyRole(OPERADOR_ROLE)
        whenNotPaused
    {
        Comunidad storage c = _comunidades[comunidadId];
        if (!c.existe) revert ComunidadNoExiste(comunidadId);
        if (prosumidorId == bytes32(0)) revert ProsumidorIdVacio();
        if (_miembros[comunidadId][prosumidorId]) revert YaEsMiembro(comunidadId, prosumidorId);

        _miembros[comunidadId][prosumidorId] = true;
        c.totalMiembros += 1;
        emit MiembroAgregado(comunidadId, prosumidorId, uint64(block.timestamp), msg.sender);
    }

    /// @notice Remueve un prosumidor del padron (baja). Queda registrado por evento.
    function removerMiembro(bytes32 comunidadId, bytes32 prosumidorId)
        external
        onlyRole(OPERADOR_ROLE)
        whenNotPaused
    {
        Comunidad storage c = _comunidades[comunidadId];
        if (!c.existe) revert ComunidadNoExiste(comunidadId);
        if (!_miembros[comunidadId][prosumidorId]) revert NoEsMiembro(comunidadId, prosumidorId);

        _miembros[comunidadId][prosumidorId] = false;
        c.totalMiembros -= 1;
        emit MiembroRemovido(comunidadId, prosumidorId, uint64(block.timestamp), msg.sender);
    }

    // ── Lecturas (para auditor / indexador) ─────────────────────────────────

    function existeComunidad(bytes32 comunidadId) external view returns (bool) {
        return _comunidades[comunidadId].existe;
    }

    function obtenerComunidad(bytes32 comunidadId) external view returns (Comunidad memory) {
        return _comunidades[comunidadId];
    }

    function esMiembro(bytes32 comunidadId, bytes32 prosumidorId) external view returns (bool) {
        return _miembros[comunidadId][prosumidorId];
    }

    /**
     * @notice ¿Pueden casar estos dos prosumidores? Regla de dominio: ambos deben
     *         ser miembros activos de la MISMA comunidad energetica.
     */
    function puedenCasar(bytes32 comunidadId, bytes32 vendedorId, bytes32 compradorId)
        external
        view
        returns (bool)
    {
        return _comunidades[comunidadId].existe
            && _miembros[comunidadId][vendedorId]
            && _miembros[comunidadId][compradorId]
            && vendedorId != compradorId;
    }

    // ── Operacion (solo admin) ──────────────────────────────────────────────

    function pausar() external onlyRole(DEFAULT_ADMIN_ROLE) { _pause(); }
    function reanudar() external onlyRole(DEFAULT_ADMIN_ROLE) { _unpause(); }

    function autorizarOperador(address cuenta) external onlyRole(DEFAULT_ADMIN_ROLE) {
        _grantRole(OPERADOR_ROLE, cuenta);
    }

    function revocarOperador(address cuenta) external onlyRole(DEFAULT_ADMIN_ROLE) {
        _revokeRole(OPERADOR_ROLE, cuenta);
    }
}
