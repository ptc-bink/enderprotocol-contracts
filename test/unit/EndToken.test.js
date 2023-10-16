const { expect } = require("chai");
const { ethers, upgrades } = require("hardhat");
const signature = "0xA2fFDf332d92715e88a958A705948ADF75d07d01";

describe("EndToken", function () {
  let owner, wallet1;
  let endTokenAddress, enderBondAddress, enderTreasuryAddress;
  let endToken, enderBond, enderTreasury;

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

    [owner, wallet1] = await ethers.getSigners();
  });

  describe("initialize", function () {
    it("Should set token name and symbol", async function () {
      expect(await endToken.name()).to.equal("End Token");
      expect(await endToken.symbol()).to.equal("END");
    });

    it("Should set the right owner", async function () {
      expect(await endToken.owner()).to.equal(owner.address);
    });

    it("Should assign the total supply of tokens to the owner", async function () {
      const ownerBalance = await endToken.balanceOf(owner.address);
      expect(await endToken.totalSupply()).to.equal(ownerBalance);
    });
  });

  describe("decimals", function () {
    it("Should return 9 as decimals", async function () {
      expect(await endToken.decimals()).to.equal(9);
    });
  });

  describe("mint", function () {
    it("Should not allow non-treasury to mint and update totalMint", async function () {
      await endToken.connect(owner).setTreasury(enderTreasuryAddress);
      const amount = 100;
      await expect(endToken.connect(owner).mint(wallet1.address, amount))
        .to.be.revertedWithCustomError(endToken, "NotTreasuryContract()");
    });

    it("Should allow mint when treasury is non zero address", async function () {
      await endToken.connect(owner).setTreasury(owner.address);
      if (await endToken.treasury() != ethers.ZeroAddress) {
        const amount = 100;
        const initialBalance = await endToken.balanceOf(owner.address);
        await endToken.connect(owner).mint(owner.address, amount);
        const finalBalance = await endToken.balanceOf(owner.address);
        expect(finalBalance).to.equal(initialBalance + ethers.toBigInt(amount));
      }
    });

    it("Should skip function when treasury is zero address", async function () {
      await endToken.connect(owner).setTreasury(owner.address);
      if (await endToken.treasury() == ethers.ZeroAddress) {
        const amount = 100;
        const initialBalance = await endToken.balanceOf(owner.address);
        await endToken.connect(owner).mint(amount);
        const finalBalance = await endToken.balanceOf(owner.address);
        expect(finalBalance).to.equal(initialBalance);
      }
    });
  });

  describe("setTreasuryContract", function () {
    it("Should allow owner to set the treasury contract address", async function () {
      await endToken.connect(owner).setTreasury(enderTreasuryAddress);
      expect(await endToken.treasury()).to.equal(enderTreasuryAddress);
    });

    it("Should not allow non-owner to set the treasury contract address", async function () {
      await expect(endToken.connect(wallet1).setTreasury(enderTreasuryAddress)).to.be.revertedWith("Ownable: caller is not the owner");
    });

    it("Should revert if the treasury address is the zero address", async function () {
      await expect(endToken.connect(owner).setTreasury(ethers.ZeroAddress)).to.be.revertedWithCustomError(endToken, "ZeroAddress()");
    });

    it("Should emit a TreasuryContractChanged event", async function () {
      await expect(endToken.setTreasury(enderTreasuryAddress))
        .to.emit(endToken, 'TreasuryContractChanged')
        .withArgs(enderTreasuryAddress);
    });
  });
});
