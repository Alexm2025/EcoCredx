// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {IERC1155} from "@openzeppelin/contracts/token/ERC1155/IERC1155.sol";
import {ERC1155Holder} from "@openzeppelin/contracts/token/ERC1155/utils/ERC1155Holder.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {Ownable, Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";

/**
 * @title EcoMarketplace
 * @notice Peer-to-peer marketplace for EcoCredit tokens, priced in the chain's
 *         native currency. Listed credits are held in escrow by this contract,
 *         so a listing can always be filled and the same credits cannot be
 *         listed twice. The buyer pays the listed price; the seller receives it
 *         minus the platform fee that was in force when the listing was made.
 *
 * The owner can change the fee (never above MAX_FEE_BPS), collect the fees, and
 * pause new listings and purchases in an emergency. The owner can never touch
 * escrowed credits: sellers can always cancel and take their credits back.
 */
contract EcoMarketplace is ERC1155Holder, ReentrancyGuard, Pausable, Ownable2Step {
    struct Listing {
        uint256 id;
        address seller;
        uint256 creditType;
        uint256 amount; // credits still for sale
        uint256 pricePerCredit; // in wei
        bool active;
        uint64 createdAt;
        uint256 feeBps; // platform fee locked in when the listing was created
    }

    /// @notice Hard ceiling on the platform fee: 10%.
    uint256 public constant MAX_FEE_BPS = 1000;
    uint256 private constant BPS = 10_000;

    IERC1155 public immutable credit;

    /// @notice Platform fee applied to new listings, in basis points (100 = 1%).
    uint256 public feeBps;
    /// @notice Where collected fees are sent.
    address public treasury;
    /// @notice Fees collected and not yet withdrawn, in wei.
    uint256 public accruedFees;

    Listing[] private _listings;

    event ListingCreated(
        uint256 indexed id,
        address indexed seller,
        uint256 indexed creditType,
        uint256 amount,
        uint256 pricePerCredit
    );
    event ListingPriceUpdated(uint256 indexed id, uint256 pricePerCredit);
    event ListingCancelled(uint256 indexed id, address indexed seller, uint256 amountReturned);
    event CreditsPurchased(
        uint256 indexed id,
        address indexed buyer,
        address indexed seller,
        uint256 creditType,
        uint256 amount,
        uint256 totalPrice,
        uint256 fee
    );
    event FeeUpdated(uint256 feeBps);
    event TreasuryUpdated(address indexed treasury);
    event FeesWithdrawn(address indexed treasury, uint256 amount);

    constructor(IERC1155 credit_, address owner_, uint256 feeBps_) Ownable(owner_) {
        require(address(credit_) != address(0), "EcoMarketplace: credit is zero address");
        require(feeBps_ <= MAX_FEE_BPS, "EcoMarketplace: fee too high");
        credit = credit_;
        feeBps = feeBps_;
        treasury = owner_;
    }

    // ---------------------------------------------------------------- trading

    /// @notice Put credits up for sale. The seller must first approve this contract on EcoCredit.
    function createListing(
        uint256 creditType,
        uint256 amount,
        uint256 pricePerCredit
    ) external nonReentrant whenNotPaused returns (uint256 id) {
        require(amount > 0, "EcoMarketplace: amount is zero");
        require(pricePerCredit > 0, "EcoMarketplace: price is zero");

        id = _listings.length;
        _listings.push(
            Listing({
                id: id,
                seller: msg.sender,
                creditType: creditType,
                amount: amount,
                pricePerCredit: pricePerCredit,
                active: true,
                createdAt: uint64(block.timestamp),
                feeBps: feeBps
            })
        );

        emit ListingCreated(id, msg.sender, creditType, amount, pricePerCredit);
        credit.safeTransferFrom(msg.sender, address(this), creditType, amount, "");
    }

    /// @notice Buy some or all of a listing. Must send exactly amount * pricePerCredit.
    function buy(uint256 id, uint256 amount) external payable nonReentrant whenNotPaused {
        Listing storage l = _active(id);
        require(msg.sender != l.seller, "EcoMarketplace: cannot buy own listing");
        require(amount > 0 && amount <= l.amount, "EcoMarketplace: invalid amount");

        uint256 totalPrice = amount * l.pricePerCredit;
        require(msg.value == totalPrice, "EcoMarketplace: wrong payment");
        uint256 fee = (totalPrice * l.feeBps) / BPS;

        l.amount -= amount;
        if (l.amount == 0) l.active = false;
        accruedFees += fee;

        emit CreditsPurchased(id, msg.sender, l.seller, l.creditType, amount, totalPrice, fee);
        credit.safeTransferFrom(address(this), msg.sender, l.creditType, amount, "");

        (bool paid, ) = l.seller.call{value: totalPrice - fee}("");
        require(paid, "EcoMarketplace: payment to seller failed");
    }

    function updatePrice(uint256 id, uint256 pricePerCredit) external {
        Listing storage l = _active(id);
        require(msg.sender == l.seller, "EcoMarketplace: not the seller");
        require(pricePerCredit > 0, "EcoMarketplace: price is zero");

        l.pricePerCredit = pricePerCredit;
        emit ListingPriceUpdated(id, pricePerCredit);
    }

    /// @notice Close a listing and return the unsold credits to the seller. Works even while paused.
    function cancelListing(uint256 id) external nonReentrant {
        Listing storage l = _active(id);
        require(msg.sender == l.seller, "EcoMarketplace: not the seller");

        uint256 remaining = l.amount;
        l.amount = 0;
        l.active = false;

        emit ListingCancelled(id, msg.sender, remaining);
        credit.safeTransferFrom(address(this), msg.sender, l.creditType, remaining, "");
    }

    function _active(uint256 id) private view returns (Listing storage l) {
        require(id < _listings.length, "EcoMarketplace: unknown listing");
        l = _listings[id];
        require(l.active, "EcoMarketplace: listing not active");
    }

    // ------------------------------------------------------------------ owner

    /// @notice Change the fee charged on listings created from now on.
    function setFee(uint256 feeBps_) external onlyOwner {
        require(feeBps_ <= MAX_FEE_BPS, "EcoMarketplace: fee too high");
        feeBps = feeBps_;
        emit FeeUpdated(feeBps_);
    }

    function setTreasury(address treasury_) external onlyOwner {
        require(treasury_ != address(0), "EcoMarketplace: treasury is zero address");
        treasury = treasury_;
        emit TreasuryUpdated(treasury_);
    }

    /// @notice Send all collected fees to the treasury.
    function withdrawFees() external onlyOwner nonReentrant {
        uint256 amount = accruedFees;
        require(amount > 0, "EcoMarketplace: no fees to withdraw");
        accruedFees = 0;

        emit FeesWithdrawn(treasury, amount);
        (bool sent, ) = treasury.call{value: amount}("");
        require(sent, "EcoMarketplace: withdrawal failed");
    }

    /// @notice Stop new listings and purchases. Sellers can still cancel.
    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    // ------------------------------------------------------------------ views

    function listingCount() external view returns (uint256) {
        return _listings.length;
    }

    function getListing(uint256 id) external view returns (Listing memory) {
        require(id < _listings.length, "EcoMarketplace: unknown listing");
        return _listings[id];
    }

    /// @notice Page through listings, oldest first. Includes sold-out and cancelled listings.
    function getListings(uint256 offset, uint256 limit) external view returns (Listing[] memory page) {
        uint256 length = _listings.length;
        require(offset <= length, "EcoMarketplace: offset out of range");
        uint256 end = offset + limit;
        if (end > length) end = length;

        page = new Listing[](end - offset);
        for (uint256 i = offset; i < end; i++) {
            page[i - offset] = _listings[i];
        }
    }
}
