const { expect } = require("chai");
const { ethers, upgrades } = require("hardhat");

const { EigenLayerStrategyManagerAddress } = require('../utils/common')
const signature = "0xA2fFDf332d92715e88a958A705948ADF75d07d01";

describe("EnderBond", function () {
  let owner, wallet1;
  let endTokenAddress, enderBondAddress, enderTreasuryAddress, enderELStrategyAddress;
  let endToken, enderBond, enderTreasury, enderELStrategy;

  before(async function () {
    // Deploy EndToken
    const EndToken = await ethers.getContractFactory("EndToken");
    endToken = await upgrades.deployProxy(EndToken, [100], {
      initializer: "initialize",
    });
    await endToken.waitForDeployment();
    endTokenAddress = await endToken.getAddress();

    // Deploy EnderBond
    const EnderBond = await ethers.getContractFactory("EnderBond");
    enderBond = await upgrades.deployProxy(EnderBond, [endTokenAddress, signature], {
      initializer: "initialize",
    });
    await enderBond.waitForDeployment();
    enderBondAddress = await enderBond.getAddress();

    // Deploy EnderTreasury
    const EnderTreasury = await ethers.getContractFactory("EnderTreasury");
    enderTreasury = await upgrades.deployProxy(EnderTreasury, [enderBondAddress, enderBondAddress], {
      initializer: "initialize",
    });
    await enderTreasury.waitForDeployment();
    enderTreasuryAddress = await enderTreasury.getAddress();

    // Deploy EnderELStrategy
    const EnderELStrategy = await ethers.getContractFactory("EnderELStrategy");
    enderELStrategy = await upgrades.deployProxy(EnderELStrategy, [enderTreasuryAddress, EigenLayerStrategyManagerAddress], {
      initializer: "initialize",
    });
    await enderELStrategy.waitForDeployment();
    enderELStrategyAddress = await enderELStrategy.getAddress();

    // add strategy in treasury
    await enderTreasury.setStrategy([enderELStrategyAddress], true);

    [owner, wallet1] = await ethers.getSigners();
  });

  describe("initialize", function () {
    it("Should set the right owner", async function () {
      expect(await enderBond.owner()).to.equal(owner.address);
    });

    it("Should set the correct end token", async function () {
      expect(await enderBond.endToken()).to.equal(endTokenAddress);
    });
  });

  describe("setTreasury", function () {
    it("Should allow owner to set treasury", async function () {
      await enderBond.connect(owner).setAddress(enderTreasuryAddress, 0);
      expect(await enderBond.endTreasury()).to.equal(enderTreasuryAddress);
    });

    it("Should not allow non-owner to set treasury", async function () {
      await expect(enderBond.connect(wallet1).setAddress(enderTreasuryAddress, 0))
        .to.be.revertedWith('Ownable: caller is not the owner');
    });

    it("Should not allow setting zero address as treasury", async function () {
      await expect(enderBond.connect(owner).setAddress(ethers.ZeroAddress, 0))
        .to.be.revertedWithCustomError(enderBond, 'ZeroAddress()');
    });
  });

  describe("Check set END token", function () {
    it("Should allow owner to set end token", async function () {
      await enderBond.connect(owner).setAddress(endTokenAddress, 1);
      expect(await enderBond.endToken()).to.equal(endTokenAddress);
    });

    it("Should not allow non-owner to set end token", async function () {
      await expect(enderBond.connect(wallet1).setAddress(endTokenAddress, 1))
        .to.be.revertedWith('Ownable: caller is not the owner');
    });

    it("Should not allow setting zero address as end token", async function () {
      await expect(enderBond.connect(owner).setAddress(ethers.ZeroAddress, 1))
        .to.be.revertedWithCustomError(enderBond, 'ZeroAddress()');
    });
  });

  describe("setBondableTokens", function () {
    it("Should allow owner to set bondable tokens", async function () {
      await enderBond.connect(owner).setBondableTokens([endTokenAddress], true);
      expect(await enderBond.bondableTokens(endTokenAddress)).to.equal(true);
    });

    it("Should not allow non-owner to set bondable tokens", async function () {
      await expect(enderBond.connect(wallet1).setBondableTokens([endTokenAddress], true))
        .to.be.revertedWith('Ownable: caller is not the owner');
    });

    it("Should allow owner to unset bondable tokens", async function () {
      await enderBond.connect(owner).setBondableTokens([endTokenAddress], true);
      await enderBond.connect(owner).setBondableTokens([endTokenAddress], false);
      expect(await enderBond.bondableTokens(endTokenAddress)).to.equal(false);
    });
  });

  describe("setInterestRates", function () {
    it("Should allow owner to set interest rates", async function () {
      const maturities = [30 * 24 * 60 * 60, 60 * 24 * 60 * 60]; // 30 and 60 days
      const interestRates = [500, 1000]; // 5% and 10% interest rates
      await enderBond.connect(owner).setInterestRates(maturities, interestRates);
      expect(await enderBond.interestRates(maturities[0])).to.equal(ethers.toBigInt(interestRates[0]));
      expect(await enderBond.interestRates(maturities[1])).to.equal(ethers.toBigInt(interestRates[1]));
    });

    it("Should not allow non-owner to set interest rates", async function () {
      const maturities = [30 * 24 * 60 * 60, 60 * 24 * 60 * 60]; // 30 and 60 days
      const interestRates = [500, 1000]; // 5% and 10% interest rates
      await expect(enderBond.connect(wallet1).setInterestRates(maturities, interestRates))
        .to.be.revertedWith('Ownable: caller is not the owner');
    });

    it("Should not allow setting interest rates with mismatched array lengths", async function () {
      const maturities = [30 * 24 * 60 * 60]; // 30 days
      const interestRates = [500, 1000]; // 5% and 10% interest rates
      await expect(enderBond.connect(owner).setInterestRates(maturities, interestRates))
        .to.be.revertedWithCustomError(enderBond, "InvalidArrayLength()");
    });

    it("Should delete interest rate when maturity is zero", async function () {
      const maturities = [30 * 24 * 60 * 60, 0]; // 30 days and 0 days
      const interestRates = [500, 1000]; // 5% and 10% interest rates
      await enderBond.connect(owner).setInterestRates(maturities, interestRates);
      expect(await enderBond.interestRates(0)).to.equal(ethers.toBigInt(0));
    });
  });
});
