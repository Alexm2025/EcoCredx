import { expect } from "chai";
import { network } from "hardhat";

const { ethers, networkHelpers } = await network.getOrCreate();

const CARBON = 0n;
const WATER = 1n;
const PENDING = 0n;
const APPROVED = 1n;
const REJECTED = 2n;

const evidence = (text) => ethers.id(text);
const price = ethers.parseEther("0.01");
const FEE_BPS = 200n; // 2%
const feeOf = (total) => (total * FEE_BPS) / 10_000n;

async function deployFixture() {
  const [admin, verifier, alice, bob, carol] = await ethers.getSigners();

  const credit = await ethers.deployContract("EcoCredit", [admin.address]);
  const market = await ethers.deployContract("EcoMarketplace", [await credit.getAddress(), admin.address, FEE_BPS]);

  await credit.grantRole(await credit.VERIFIER_ROLE(), verifier.address);

  return { credit, market, admin, verifier, alice, bob, carol };
}

// Alice holds 100 approved carbon credits and has approved the marketplace.
async function fundedFixture() {
  const ctx = await deployFixture();
  const { credit, market, verifier, alice } = ctx;

  await credit.connect(alice).submitActivity(CARBON, 100, evidence("solar-farm"), "Solar farm", "");
  await credit.connect(verifier).approveActivity(0, 100, "ok");
  await credit.connect(alice).setApprovalForAll(await market.getAddress(), true);

  return ctx;
}

describe("EcoCredit", function () {
  describe("roles", function () {
    it("makes the deployer admin and verifier", async function () {
      const { credit, admin } = await networkHelpers.loadFixture(deployFixture);

      expect(await credit.hasRole(await credit.DEFAULT_ADMIN_ROLE(), admin.address)).to.equal(true);
      expect(await credit.hasRole(await credit.VERIFIER_ROLE(), admin.address)).to.equal(true);
    });

    it("only lets the admin appoint verifiers", async function () {
      const { credit, alice, bob } = await networkHelpers.loadFixture(deployFixture);

      await expect(
        credit.connect(alice).grantRole(await credit.VERIFIER_ROLE(), bob.address),
      ).to.be.revertedWithCustomError(credit, "AccessControlUnauthorizedAccount");
    });
  });

  describe("submitting activities", function () {
    it("records a pending claim without minting anything", async function () {
      const { credit, alice } = await networkHelpers.loadFixture(deployFixture);

      await expect(
        credit.connect(alice).submitActivity(CARBON, 50, evidence("trees"), "Planted 200 trees", "https://example.org/trees"),
      )
        .to.emit(credit, "ActivitySubmitted")
        .withArgs(0, alice.address, CARBON, 50, evidence("trees"));

      const activity = await credit.getActivity(0);
      expect(activity.claimant).to.equal(alice.address);
      expect(activity.amountRequested).to.equal(50n);
      expect(activity.status).to.equal(PENDING);
      expect(await credit.balanceOf(alice.address, CARBON)).to.equal(0n);
      expect(await credit.activityCount()).to.equal(1n);
    });

    it("rejects the same evidence being claimed twice", async function () {
      const { credit, alice, bob } = await networkHelpers.loadFixture(deployFixture);

      await credit.connect(alice).submitActivity(CARBON, 50, evidence("trees"), "Planted trees", "");

      await expect(
        credit.connect(bob).submitActivity(WATER, 10, evidence("trees"), "Same evidence", ""),
      ).to.be.revertedWith("EcoCredit: evidence already claimed");
    });

    it("validates the claim", async function () {
      const { credit, alice } = await networkHelpers.loadFixture(deployFixture);
      const c = credit.connect(alice);

      await expect(c.submitActivity(5, 1, evidence("a"), "x", "")).to.be.revertedWith("EcoCredit: unknown credit type");
      await expect(c.submitActivity(CARBON, 0, evidence("a"), "x", "")).to.be.revertedWith("EcoCredit: amount is zero");
      await expect(c.submitActivity(CARBON, 1, ethers.ZeroHash, "x", "")).to.be.revertedWith("EcoCredit: evidence required");
      await expect(c.submitActivity(CARBON, 1, evidence("a"), "", "")).to.be.revertedWith("EcoCredit: description required");
    });
  });

  describe("verification", function () {
    it("mints credits to the claimant on approval", async function () {
      const { credit, verifier, alice } = await networkHelpers.loadFixture(deployFixture);
      await credit.connect(alice).submitActivity(CARBON, 50, evidence("trees"), "Planted trees", "");

      await expect(credit.connect(verifier).approveActivity(0, 50, "Site visit done"))
        .to.emit(credit, "ActivityApproved")
        .withArgs(0, verifier.address, alice.address, CARBON, 50);

      const activity = await credit.getActivity(0);
      expect(activity.status).to.equal(APPROVED);
      expect(activity.amountApproved).to.equal(50n);
      expect(activity.verifier).to.equal(verifier.address);
      expect(await credit.balanceOf(alice.address, CARBON)).to.equal(50n);
      expect(await credit.totalIssued(CARBON)).to.equal(50n);
    });

    it("lets the verifier grant less than requested, but not more", async function () {
      const { credit, verifier, alice } = await networkHelpers.loadFixture(deployFixture);
      await credit.connect(alice).submitActivity(CARBON, 50, evidence("trees"), "Planted trees", "");

      await expect(credit.connect(verifier).approveActivity(0, 51, "")).to.be.revertedWith(
        "EcoCredit: invalid approved amount",
      );
      await expect(credit.connect(verifier).approveActivity(0, 0, "")).to.be.revertedWith(
        "EcoCredit: invalid approved amount",
      );

      await credit.connect(verifier).approveActivity(0, 30, "Only 30 verified");
      expect(await credit.balanceOf(alice.address, CARBON)).to.equal(30n);
    });

    it("blocks non-verifiers, self-review and double review", async function () {
      const { credit, admin, verifier, alice, bob } = await networkHelpers.loadFixture(deployFixture);
      await credit.connect(alice).submitActivity(CARBON, 50, evidence("trees"), "Planted trees", "");
      await credit.connect(verifier).submitActivity(CARBON, 5, evidence("own"), "Verifier's own claim", "");

      await expect(credit.connect(bob).approveActivity(0, 50, "")).to.be.revertedWithCustomError(
        credit,
        "AccessControlUnauthorizedAccount",
      );
      await expect(credit.connect(verifier).approveActivity(1, 5, "")).to.be.revertedWith(
        "EcoCredit: cannot review own claim",
      );

      await credit.connect(verifier).approveActivity(0, 50, "");
      await expect(credit.connect(admin).approveActivity(0, 50, "")).to.be.revertedWith("EcoCredit: already reviewed");
      await expect(credit.connect(admin).rejectActivity(0, "")).to.be.revertedWith("EcoCredit: already reviewed");
      await expect(credit.connect(admin).approveActivity(99, 1, "")).to.be.revertedWith("EcoCredit: unknown activity");
    });

    it("rejects a claim without minting and frees the evidence", async function () {
      const { credit, verifier, alice } = await networkHelpers.loadFixture(deployFixture);
      await credit.connect(alice).submitActivity(CARBON, 50, evidence("trees"), "Planted trees", "");

      await expect(credit.connect(verifier).rejectActivity(0, "Photos unclear"))
        .to.emit(credit, "ActivityRejected")
        .withArgs(0, verifier.address, "Photos unclear");

      const activity = await credit.getActivity(0);
      expect(activity.status).to.equal(REJECTED);
      expect(activity.reviewNote).to.equal("Photos unclear");
      expect(await credit.balanceOf(alice.address, CARBON)).to.equal(0n);

      // corrected claim with the same evidence is allowed again
      await credit.connect(alice).submitActivity(CARBON, 40, evidence("trees"), "Planted trees (corrected)", "");
      expect(await credit.activityCount()).to.equal(2n);
    });

    it("keeps approved evidence locked forever", async function () {
      const { credit, verifier, alice } = await networkHelpers.loadFixture(deployFixture);
      await credit.connect(alice).submitActivity(CARBON, 50, evidence("trees"), "Planted trees", "");
      await credit.connect(verifier).approveActivity(0, 50, "");

      await expect(
        credit.connect(alice).submitActivity(CARBON, 50, evidence("trees"), "Again", ""),
      ).to.be.revertedWith("EcoCredit: evidence already claimed");
    });
  });

  describe("retiring", function () {
    it("burns the credits and records the retirement", async function () {
      const { credit, alice } = await networkHelpers.loadFixture(fundedFixture);

      await expect(credit.connect(alice).retire(CARBON, 40, "Offset 2026 office emissions"))
        .to.emit(credit, "CreditsRetired")
        .withArgs(0, alice.address, CARBON, 40, "Offset 2026 office emissions");

      expect(await credit.balanceOf(alice.address, CARBON)).to.equal(60n);
      expect(await credit.totalRetired(CARBON)).to.equal(40n);
      expect(await credit.retiredBy(alice.address, CARBON)).to.equal(40n);

      const [retirement] = await credit.getRetirements(0, 10);
      expect(retirement.account).to.equal(alice.address);
      expect(retirement.amount).to.equal(40n);
      expect(retirement.reason).to.equal("Offset 2026 office emissions");
    });

    it("cannot retire more than the balance", async function () {
      const { credit, alice } = await networkHelpers.loadFixture(fundedFixture);

      await expect(credit.connect(alice).retire(CARBON, 101, "")).to.be.revertedWithCustomError(
        credit,
        "ERC1155InsufficientBalance",
      );
    });
  });

  describe("views", function () {
    it("reports balances, supply and pages", async function () {
      const { credit, verifier, alice, bob } = await networkHelpers.loadFixture(fundedFixture);
      await credit.connect(bob).submitActivity(WATER, 7, evidence("rainwater"), "Rainwater harvesting", "");
      await credit.connect(verifier).approveActivity(1, 7, "");
      await credit.connect(alice).retire(CARBON, 10, "");

      expect(await credit.balancesOf(alice.address)).to.deep.equal([90n, 0n, 0n, 0n, 0n]);
      const [issued, retired] = await credit.supplyStats();
      expect(issued).to.deep.equal([100n, 7n, 0n, 0n, 0n]);
      expect(retired).to.deep.equal([10n, 0n, 0n, 0n, 0n]);

      expect((await credit.getActivities(0, 1)).length).to.equal(1);
      expect((await credit.getActivities(1, 50)).length).to.equal(1);
      expect((await credit.getActivities(2, 50)).length).to.equal(0);
      await expect(credit.getActivities(3, 1)).to.be.revertedWith("EcoCredit: offset out of range");
    });
  });
});

describe("EcoMarketplace", function () {
  it("escrows credits when a listing is created", async function () {
    const { credit, market, alice } = await networkHelpers.loadFixture(fundedFixture);

    await expect(market.connect(alice).createListing(CARBON, 60, price))
      .to.emit(market, "ListingCreated")
      .withArgs(0, alice.address, CARBON, 60, price);

    expect(await credit.balanceOf(alice.address, CARBON)).to.equal(40n);
    expect(await credit.balanceOf(await market.getAddress(), CARBON)).to.equal(60n);

    const listing = await market.getListing(0);
    expect(listing.seller).to.equal(alice.address);
    expect(listing.amount).to.equal(60n);
    expect(listing.active).to.equal(true);
  });

  it("cannot list credits the seller does not have or has not approved", async function () {
    const { credit, market, alice, bob } = await networkHelpers.loadFixture(fundedFixture);

    await expect(market.connect(alice).createListing(CARBON, 101, price)).to.be.revertedWithCustomError(
      credit,
      "ERC1155InsufficientBalance",
    );
    await expect(market.connect(bob).createListing(CARBON, 1, price)).to.be.revertedWithCustomError(
      credit,
      "ERC1155MissingApprovalForAll",
    );
    await expect(market.connect(alice).createListing(CARBON, 0, price)).to.be.revertedWith(
      "EcoMarketplace: amount is zero",
    );
    await expect(market.connect(alice).createListing(CARBON, 1, 0)).to.be.revertedWith("EcoMarketplace: price is zero");
  });

  it("sells part of a listing, pays the seller and keeps the platform fee", async function () {
    const { credit, market, alice, bob } = await networkHelpers.loadFixture(fundedFixture);
    await market.connect(alice).createListing(CARBON, 60, price);

    const buyTx = market.connect(bob).buy(0, 25, { value: price * 25n });
    await expect(buyTx)
      .to.emit(market, "CreditsPurchased")
      .withArgs(0, bob.address, alice.address, CARBON, 25, price * 25n, feeOf(price * 25n));
    await expect(buyTx).to.changeEtherBalances(
      ethers,
      [bob, alice, market],
      [-(price * 25n), price * 25n - feeOf(price * 25n), feeOf(price * 25n)],
    );
    expect(await market.accruedFees()).to.equal(feeOf(price * 25n));

    expect(await credit.balanceOf(bob.address, CARBON)).to.equal(25n);
    const listing = await market.getListing(0);
    expect(listing.amount).to.equal(35n);
    expect(listing.active).to.equal(true);
  });

  it("closes the listing when it sells out", async function () {
    const { market, alice, bob, carol } = await networkHelpers.loadFixture(fundedFixture);
    await market.connect(alice).createListing(CARBON, 10, price);

    await market.connect(bob).buy(0, 10, { value: price * 10n });

    expect((await market.getListing(0)).active).to.equal(false);
    await expect(market.connect(carol).buy(0, 1, { value: price })).to.be.revertedWith(
      "EcoMarketplace: listing not active",
    );
  });

  it("rejects bad purchases", async function () {
    const { market, alice, bob } = await networkHelpers.loadFixture(fundedFixture);
    await market.connect(alice).createListing(CARBON, 10, price);

    await expect(market.connect(bob).buy(0, 5, { value: price * 4n })).to.be.revertedWith(
      "EcoMarketplace: wrong payment",
    );
    await expect(market.connect(bob).buy(0, 5, { value: price * 6n })).to.be.revertedWith(
      "EcoMarketplace: wrong payment",
    );
    await expect(market.connect(bob).buy(0, 11, { value: price * 11n })).to.be.revertedWith(
      "EcoMarketplace: invalid amount",
    );
    await expect(market.connect(bob).buy(0, 0)).to.be.revertedWith("EcoMarketplace: invalid amount");
    await expect(market.connect(alice).buy(0, 1, { value: price })).to.be.revertedWith(
      "EcoMarketplace: cannot buy own listing",
    );
    await expect(market.connect(bob).buy(7, 1, { value: price })).to.be.revertedWith(
      "EcoMarketplace: unknown listing",
    );
  });

  it("lets only the seller change the price", async function () {
    const { market, alice, bob } = await networkHelpers.loadFixture(fundedFixture);
    await market.connect(alice).createListing(CARBON, 10, price);

    await expect(market.connect(bob).updatePrice(0, 1)).to.be.revertedWith("EcoMarketplace: not the seller");
    await expect(market.connect(alice).updatePrice(0, price * 2n))
      .to.emit(market, "ListingPriceUpdated")
      .withArgs(0, price * 2n);

    await expect(market.connect(bob).buy(0, 1, { value: price })).to.be.revertedWith("EcoMarketplace: wrong payment");
    await market.connect(bob).buy(0, 1, { value: price * 2n });
  });

  it("returns unsold credits when the seller cancels", async function () {
    const { credit, market, alice, bob } = await networkHelpers.loadFixture(fundedFixture);
    await market.connect(alice).createListing(CARBON, 60, price);
    await market.connect(bob).buy(0, 20, { value: price * 20n });

    await expect(market.connect(bob).cancelListing(0)).to.be.revertedWith("EcoMarketplace: not the seller");
    await expect(market.connect(alice).cancelListing(0))
      .to.emit(market, "ListingCancelled")
      .withArgs(0, alice.address, 40);

    expect(await credit.balanceOf(alice.address, CARBON)).to.equal(80n);
    expect(await credit.balanceOf(await market.getAddress(), CARBON)).to.equal(0n);
    await expect(market.connect(alice).cancelListing(0)).to.be.revertedWith("EcoMarketplace: listing not active");
  });

  it("lets a buyer retire purchased credits so they cannot be resold", async function () {
    const { credit, market, alice, bob } = await networkHelpers.loadFixture(fundedFixture);
    await market.connect(alice).createListing(CARBON, 10, price);
    await market.connect(bob).buy(0, 10, { value: price * 10n });

    await credit.connect(bob).retire(CARBON, 10, "Company offset");
    await credit.connect(bob).setApprovalForAll(await market.getAddress(), true);

    await expect(market.connect(bob).createListing(CARBON, 1, price)).to.be.revertedWithCustomError(
      credit,
      "ERC1155InsufficientBalance",
    );
  });
});

describe("Platform fee and controls", function () {
  it("starts with the deployer as owner and treasury", async function () {
    const { market, admin } = await networkHelpers.loadFixture(deployFixture);

    expect(await market.owner()).to.equal(admin.address);
    expect(await market.treasury()).to.equal(admin.address);
    expect(await market.feeBps()).to.equal(FEE_BPS);
  });

  it("only lets the owner change the fee, and never above the cap", async function () {
    const { market, alice } = await networkHelpers.loadFixture(deployFixture);

    await expect(market.connect(alice).setFee(100)).to.be.revertedWithCustomError(market, "OwnableUnauthorizedAccount");
    await expect(market.setFee(1001)).to.be.revertedWith("EcoMarketplace: fee too high");
    await expect(market.setFee(500)).to.emit(market, "FeeUpdated").withArgs(500);
    expect(await market.feeBps()).to.equal(500n);
  });

  it("keeps the fee a listing was created with", async function () {
    const { market, alice, bob } = await networkHelpers.loadFixture(fundedFixture);
    await market.connect(alice).createListing(CARBON, 10, price);
    await market.setFee(1000);
    await market.connect(alice).createListing(CARBON, 10, price);

    await expect(market.connect(bob).buy(0, 10, { value: price * 10n })).to.changeEtherBalances(
      ethers,
      [alice],
      [(price * 10n * 98n) / 100n],
    );
    await expect(market.connect(bob).buy(1, 10, { value: price * 10n })).to.changeEtherBalances(
      ethers,
      [alice],
      [(price * 10n * 90n) / 100n],
    );
  });

  it("charges nothing when the fee is zero", async function () {
    const { market, alice, bob } = await networkHelpers.loadFixture(fundedFixture);
    await market.setFee(0);
    await market.connect(alice).createListing(CARBON, 10, price);

    await expect(market.connect(bob).buy(0, 10, { value: price * 10n })).to.changeEtherBalances(
      ethers,
      [alice, market],
      [price * 10n, 0n],
    );
  });

  it("sends collected fees to the treasury", async function () {
    const { market, alice, bob, carol } = await networkHelpers.loadFixture(fundedFixture);
    await market.connect(alice).createListing(CARBON, 50, price);
    await market.connect(bob).buy(0, 50, { value: price * 50n });
    const fees = feeOf(price * 50n);

    await expect(market.connect(alice).withdrawFees()).to.be.revertedWithCustomError(market, "OwnableUnauthorizedAccount");
    await expect(market.setTreasury(ethers.ZeroAddress)).to.be.revertedWith("EcoMarketplace: treasury is zero address");
    await market.setTreasury(carol.address);

    const withdrawal = market.withdrawFees();
    await expect(withdrawal).to.emit(market, "FeesWithdrawn").withArgs(carol.address, fees);
    await expect(withdrawal).to.changeEtherBalances(ethers, [carol, market], [fees, -fees]);
    expect(await market.accruedFees()).to.equal(0n);
    await expect(market.withdrawFees()).to.be.revertedWith("EcoMarketplace: no fees to withdraw");
  });

  it("hands over ownership in two steps", async function () {
    const { market, admin, alice } = await networkHelpers.loadFixture(deployFixture);

    await market.transferOwnership(alice.address);
    expect(await market.owner()).to.equal(admin.address);
    await market.connect(alice).acceptOwnership();
    expect(await market.owner()).to.equal(alice.address);
  });

  it("pausing the marketplace stops trading but not cancelling", async function () {
    const { credit, market, alice, bob } = await networkHelpers.loadFixture(fundedFixture);
    await market.connect(alice).createListing(CARBON, 10, price);

    await expect(market.connect(alice).pause()).to.be.revertedWithCustomError(market, "OwnableUnauthorizedAccount");
    await market.pause();

    await expect(market.connect(bob).buy(0, 1, { value: price })).to.be.revertedWithCustomError(market, "EnforcedPause");
    await expect(market.connect(alice).createListing(CARBON, 1, price)).to.be.revertedWithCustomError(
      market,
      "EnforcedPause",
    );
    await market.connect(alice).cancelListing(0);
    expect(await credit.balanceOf(alice.address, CARBON)).to.equal(100n);

    await market.unpause();
    await market.connect(alice).createListing(CARBON, 1, price);
  });

  it("pausing the credit token freezes claims, minting, transfers and retirement", async function () {
    const { credit, verifier, alice, bob } = await networkHelpers.loadFixture(fundedFixture);
    await credit.connect(bob).submitActivity(WATER, 5, evidence("pending"), "Pending claim", "");

    await expect(credit.connect(alice).pause()).to.be.revertedWithCustomError(credit, "AccessControlUnauthorizedAccount");
    await credit.pause();

    await expect(
      credit.connect(alice).submitActivity(CARBON, 1, evidence("new"), "New", ""),
    ).to.be.revertedWithCustomError(credit, "EnforcedPause");
    await expect(credit.connect(verifier).approveActivity(1, 5, "")).to.be.revertedWithCustomError(credit, "EnforcedPause");
    await expect(
      credit.connect(alice).safeTransferFrom(alice.address, bob.address, CARBON, 1, "0x"),
    ).to.be.revertedWithCustomError(credit, "EnforcedPause");
    await expect(credit.connect(alice).retire(CARBON, 1, "")).to.be.revertedWithCustomError(credit, "EnforcedPause");
    expect(await credit.balanceOf(alice.address, CARBON)).to.equal(100n);

    await credit.unpause();
    await credit.connect(verifier).approveActivity(1, 5, "");
    await credit.connect(alice).retire(CARBON, 1, "");
  });

  it("exposes a name and symbol for wallets and explorers", async function () {
    const { credit } = await networkHelpers.loadFixture(deployFixture);

    expect(await credit.name()).to.equal("EcoCredx Environmental Credit");
    expect(await credit.symbol()).to.equal("ECOX");
  });
});
