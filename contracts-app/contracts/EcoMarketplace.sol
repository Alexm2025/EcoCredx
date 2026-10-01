// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {IERC1155} from "@openzeppelin/contracts/token/ERC1155/IERC1155.sol";
import {ERC1155Holder} from "@openzeppelin/contracts/token/ERC1155/utils/ERC1155Holder.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title EcoMarketplace
 * @notice Peer-to-peer marketplace for EcoCredit tokens, priced in the chain's
 *         native currency. Listed credits are held in escrow by this contract,
 *         so a listing can always be filled and the same credits cannot be
 *         listed twice. Payment goes straight to the seller; there is no
 *         intermediary and no platform fee.
 */
contract EcoMarketplace is ERC1155Holder, ReentrancyGuard {
    struct Listing {
        uint256 id;
        address seller;
        uint256 creditType;
        uint256 amount; // credits still for sale
        uint256 pricePerCredit; // in wei
        bool active;
        uint64 createdAt;
    }

    IERC1155 public immutable credit;

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
        uint256 totalPrice
    );

    constructor(IERC1155 credit_) {
        require(address(credit_) != address(0), "EcoMarketplace: credit is zero address");
        credit = credit_;
    }

    /// @notice Put credits up for sale. The seller must first approve this contract on EcoCredit.
    function createListing(uint256 creditType, uint256 amount, uint256 pricePerCredit) external nonReentrant returns (uint256 id) {
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
                createdAt: uint64(block.timestamp)
            })
        );

        emit ListingCreated(id, msg.sender, creditType, amount, pricePerCredit);
        credit.safeTransferFrom(msg.sender, address(this), creditType, amount, "");
    }

    /// @notice Buy some or all of a listing. Must send exactly amount * pricePerCredit.
    function buy(uint256 id, uint256 amount) external payable nonReentrant {
        Listing storage l = _active(id);
        require(msg.sender != l.seller, "EcoMarketplace: cannot buy own listing");
        require(amount > 0 && amount <= l.amount, "EcoMarketplace: invalid amount");

        uint256 totalPrice = amount * l.pricePerCredit;
        require(msg.value == totalPrice, "EcoMarketplace: wrong payment");

        l.amount -= amount;
        if (l.amount == 0) l.active = false;

        emit CreditsPurchased(id, msg.sender, l.seller, l.creditType, amount, totalPrice);
        credit.safeTransferFrom(address(this), msg.sender, l.creditType, amount, "");

        (bool paid, ) = l.seller.call{value: totalPrice}("");
        require(paid, "EcoMarketplace: payment to seller failed");
    }

    function updatePrice(uint256 id, uint256 pricePerCredit) external {
        Listing storage l = _active(id);
        require(msg.sender == l.seller, "EcoMarketplace: not the seller");
        require(pricePerCredit > 0, "EcoMarketplace: price is zero");

        l.pricePerCredit = pricePerCredit;
        emit ListingPriceUpdated(id, pricePerCredit);
    }

    /// @notice Close a listing and return the unsold credits to the seller.
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
