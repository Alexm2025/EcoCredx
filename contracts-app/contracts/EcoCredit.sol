// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {ERC1155} from "@openzeppelin/contracts/token/ERC1155/ERC1155.sol";
import {ERC1155Pausable} from "@openzeppelin/contracts/token/ERC1155/extensions/ERC1155Pausable.sol";
import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";

/**
 * @title EcoCredit
 * @notice Environmental credits as ERC-1155 tokens. Each token id is one credit
 *         type (carbon, water, renewable energy, waste, biodiversity) and one
 *         token is one whole credit.
 *
 * Credits are only ever created through the claim flow:
 *   1. anyone submits an eco-friendly activity with a fingerprint of its evidence
 *   2. an independent verifier approves (credits are minted) or rejects it
 *   3. the holder can transfer, sell, or permanently retire the credits
 *
 * Double counting is prevented in two places: the same evidence fingerprint can
 * never back two live claims, and retired credits are burned so they cannot be
 * sold or retired again.
 *
 * In an emergency the admin can pause the contract, which freezes new claims,
 * minting, transfers and retirements until it is unpaused. Pausing never moves
 * or destroys credits.
 */
contract EcoCredit is ERC1155Pausable, AccessControl {
    string public constant name = "EcoCredx Environmental Credit";
    string public constant symbol = "ECOX";

    bytes32 public constant VERIFIER_ROLE = keccak256("VERIFIER_ROLE");

    uint256 public constant CARBON = 0;
    uint256 public constant WATER = 1;
    uint256 public constant RENEWABLE_ENERGY = 2;
    uint256 public constant WASTE = 3;
    uint256 public constant BIODIVERSITY = 4;
    uint256 public constant CREDIT_TYPE_COUNT = 5;

    enum Status {
        Pending,
        Approved,
        Rejected
    }

    struct Activity {
        uint256 id;
        address claimant;
        uint256 creditType;
        uint256 amountRequested;
        uint256 amountApproved;
        bytes32 evidenceHash;
        string description;
        string evidenceURI;
        Status status;
        address verifier;
        string reviewNote;
        uint64 submittedAt;
        uint64 reviewedAt;
    }

    struct Retirement {
        uint256 id;
        address account;
        uint256 creditType;
        uint256 amount;
        string reason;
        uint64 retiredAt;
    }

    Activity[] private _activities;
    Retirement[] private _retirements;

    /// @notice evidence fingerprint => activity id + 1 (0 means the evidence is unclaimed)
    mapping(bytes32 => uint256) public evidenceClaim;

    mapping(uint256 => uint256) public totalIssued;
    mapping(uint256 => uint256) public totalRetired;
    mapping(address => mapping(uint256 => uint256)) public retiredBy;

    event ActivitySubmitted(
        uint256 indexed id,
        address indexed claimant,
        uint256 indexed creditType,
        uint256 amount,
        bytes32 evidenceHash
    );
    event ActivityApproved(
        uint256 indexed id,
        address indexed verifier,
        address indexed claimant,
        uint256 creditType,
        uint256 amount
    );
    event ActivityRejected(uint256 indexed id, address indexed verifier, string note);
    event CreditsRetired(
        uint256 indexed id,
        address indexed account,
        uint256 indexed creditType,
        uint256 amount,
        string reason
    );

    constructor(address admin) ERC1155("") {
        require(admin != address(0), "EcoCredit: admin is zero address");
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(VERIFIER_ROLE, admin);
    }

    // ---------------------------------------------------------------- earning

    /// @notice Claim credits for an eco-friendly activity. Stays pending until a verifier reviews it.
    function submitActivity(
        uint256 creditType,
        uint256 amount,
        bytes32 evidenceHash,
        string calldata description,
        string calldata evidenceURI
    ) external whenNotPaused returns (uint256 id) {
        require(creditType < CREDIT_TYPE_COUNT, "EcoCredit: unknown credit type");
        require(amount > 0, "EcoCredit: amount is zero");
        require(evidenceHash != bytes32(0), "EcoCredit: evidence required");
        require(bytes(description).length > 0, "EcoCredit: description required");
        require(evidenceClaim[evidenceHash] == 0, "EcoCredit: evidence already claimed");

        id = _activities.length;
        evidenceClaim[evidenceHash] = id + 1;
        _activities.push(
            Activity({
                id: id,
                claimant: msg.sender,
                creditType: creditType,
                amountRequested: amount,
                amountApproved: 0,
                evidenceHash: evidenceHash,
                description: description,
                evidenceURI: evidenceURI,
                status: Status.Pending,
                verifier: address(0),
                reviewNote: "",
                submittedAt: uint64(block.timestamp),
                reviewedAt: 0
            })
        );

        emit ActivitySubmitted(id, msg.sender, creditType, amount, evidenceHash);
    }

    /// @notice Approve a pending claim and mint the credits. The verifier may grant less than requested.
    function approveActivity(uint256 id, uint256 amount, string calldata note) external onlyRole(VERIFIER_ROLE) {
        Activity storage a = _pending(id);
        require(amount > 0 && amount <= a.amountRequested, "EcoCredit: invalid approved amount");

        a.status = Status.Approved;
        a.amountApproved = amount;
        a.verifier = msg.sender;
        a.reviewNote = note;
        a.reviewedAt = uint64(block.timestamp);
        totalIssued[a.creditType] += amount;

        emit ActivityApproved(id, msg.sender, a.claimant, a.creditType, amount);
        _mint(a.claimant, a.creditType, amount, "");
    }

    /// @notice Reject a pending claim. The evidence is released so a corrected claim can be filed.
    function rejectActivity(uint256 id, string calldata note) external onlyRole(VERIFIER_ROLE) {
        Activity storage a = _pending(id);

        a.status = Status.Rejected;
        a.verifier = msg.sender;
        a.reviewNote = note;
        a.reviewedAt = uint64(block.timestamp);
        delete evidenceClaim[a.evidenceHash];

        emit ActivityRejected(id, msg.sender, note);
    }

    function _pending(uint256 id) private view returns (Activity storage a) {
        require(id < _activities.length, "EcoCredit: unknown activity");
        a = _activities[id];
        require(a.status == Status.Pending, "EcoCredit: already reviewed");
        require(a.claimant != msg.sender, "EcoCredit: cannot review own claim");
    }

    // --------------------------------------------------------------- retiring

    /// @notice Permanently burn credits to claim their environmental benefit.
    function retire(uint256 creditType, uint256 amount, string calldata reason) external returns (uint256 id) {
        require(amount > 0, "EcoCredit: amount is zero");

        _burn(msg.sender, creditType, amount);
        totalRetired[creditType] += amount;
        retiredBy[msg.sender][creditType] += amount;

        id = _retirements.length;
        _retirements.push(
            Retirement({
                id: id,
                account: msg.sender,
                creditType: creditType,
                amount: amount,
                reason: reason,
                retiredAt: uint64(block.timestamp)
            })
        );

        emit CreditsRetired(id, msg.sender, creditType, amount, reason);
    }

    // ------------------------------------------------------------------ admin

    /// @notice Freeze claims, minting, transfers and retirements.
    function pause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _pause();
    }

    function unpause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _unpause();
    }

    // ------------------------------------------------------------------ views

    function activityCount() external view returns (uint256) {
        return _activities.length;
    }

    function getActivity(uint256 id) external view returns (Activity memory) {
        require(id < _activities.length, "EcoCredit: unknown activity");
        return _activities[id];
    }

    /// @notice Page through activities, oldest first.
    function getActivities(uint256 offset, uint256 limit) external view returns (Activity[] memory page) {
        uint256 end = _pageEnd(_activities.length, offset, limit);
        page = new Activity[](end - offset);
        for (uint256 i = offset; i < end; i++) {
            page[i - offset] = _activities[i];
        }
    }

    function retirementCount() external view returns (uint256) {
        return _retirements.length;
    }

    /// @notice Page through retirements, oldest first.
    function getRetirements(uint256 offset, uint256 limit) external view returns (Retirement[] memory page) {
        uint256 end = _pageEnd(_retirements.length, offset, limit);
        page = new Retirement[](end - offset);
        for (uint256 i = offset; i < end; i++) {
            page[i - offset] = _retirements[i];
        }
    }

    /// @notice Balances of every credit type for one account.
    function balancesOf(address account) external view returns (uint256[] memory balances) {
        balances = new uint256[](CREDIT_TYPE_COUNT);
        for (uint256 i = 0; i < CREDIT_TYPE_COUNT; i++) {
            balances[i] = balanceOf(account, i);
        }
    }

    /// @notice Issued and retired totals for every credit type.
    function supplyStats() external view returns (uint256[] memory issued, uint256[] memory retired) {
        issued = new uint256[](CREDIT_TYPE_COUNT);
        retired = new uint256[](CREDIT_TYPE_COUNT);
        for (uint256 i = 0; i < CREDIT_TYPE_COUNT; i++) {
            issued[i] = totalIssued[i];
            retired[i] = totalRetired[i];
        }
    }

    function _pageEnd(uint256 length, uint256 offset, uint256 limit) private pure returns (uint256 end) {
        require(offset <= length, "EcoCredit: offset out of range");
        end = offset + limit;
        if (end > length) end = length;
    }

    function supportsInterface(bytes4 interfaceId) public view override(ERC1155, AccessControl) returns (bool) {
        return super.supportsInterface(interfaceId);
    }
}
