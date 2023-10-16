const { expect } = require("chai");
const { ethers, upgrades } = require("hardhat");

const { eth, goerli, unlockAccount } = require('../utils/common')

const addrs = process.env.ENVIORNMENT === 'prod' ? eth : goerli
const signature = "0xA2fFDf332d92715e88a958A705948ADF75d07d01";

describe("Ender EigenLayer Bond Flow", function () {
  let whale, owner, alice, bob;
  let endTokenAddress, enderBondAddress, enderTreasuryAddress, enderStrategyAddress, enderOracleAddress;
  let stEthToken, endToken, enderBond, bondNFT, enderTreasury, enderStrategy, enderOracle;

  const principal = ethers.parseEther("1");

  const interestRates = [500, 1000];
  const maturities = [30 * 24 * 60 * 60, 60 * 24 * 60 * 60];

  before("deploy contracts", async function () {
    [owner, alice, bob] = await ethers.getSigners();
    whale = await unlockAccount(addrs.stETHWhale)

    stEthToken = await ethers.getContractAt("IERC20", addrs.stETHTokenAddr);

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

    // Deploy BondNFT
    const BondNFT = await ethers.getContractFactory("BondNFT");
    bondNFT = await upgrades.deployProxy(BondNFT, [enderBondAddress, ""], {
      initializer: "initialize",
    });
    await bondNFT.waitForDeployment();
    const bondNFTAddress = await bondNFT.getAddress()

    // Deploy EnderTreasury
    const EnderTreasury = await ethers.getContractFactory("EnderTreasury");
    enderTreasury = await upgrades.deployProxy(EnderTreasury, [endTokenAddress, enderBondAddress], {
      initializer: "initialize",
    });
    await enderTreasury.waitForDeployment();
    enderTreasuryAddress = await enderTreasury.getAddress();

    // Deploy enderStrategy
    const EnderStrategy = await ethers.getContractFactory("EnderELStrategy");
    enderStrategy = await upgrades.deployProxy(EnderStrategy, [enderTreasuryAddress, addrs.ELStrategyManager], {
      initializer: "initialize",
    });
    await enderStrategy.waitForDeployment();
    enderStrategyAddress = await enderStrategy.getAddress();

    // Deploy EnderOracle
    const EnderOracle = await ethers.getContractFactory("EnderOracle");
    enderOracle = await upgrades.deployProxy(EnderOracle, [], {
      initializer: "initialize",
    });
    await enderOracle.waitForDeployment();
    enderOracleAddress = await enderOracle.getAddress();

    // set EL manager contract
    await enderStrategy.setTokenStrategy(addrs.ELstETHStrategy)

    // add ender strategy in treasury
    await enderTreasury.setStrategy([enderStrategyAddress], true);

    // set treasury in bond
    await enderBond.connect(owner).setAddress(enderTreasuryAddress, 0)

    // set interest rates
    await enderBond.connect(owner).setInterestRates(maturities, interestRates);
    await enderBond.connect(owner).setBondableTokens([endTokenAddress], false);

    // set oracle in treasury
    await enderTreasury.setAddress(enderOracleAddress, 2)

    // set price feed in oracle
    await enderOracle.setFeeds([addrs.stETHTokenAddr], ["0xD4a33860578De61DBAbDc8BFdb98FD742fA7028e"])

    // set treasury in endtoken
    await endToken.setTreasury(enderTreasuryAddress);

    // set BondNFT in bond
    await enderBond.setAddress(bondNFTAddress, 2)

    // send some stETH to Alice and Bob
    const sendAmt = ethers.parseEther("100")
    await stEthToken.connect(whale).transfer(alice.address, sendAmt)
    await stEthToken.connect(whale).transfer(bob.address, sendAmt)

    console.log(`End token deployed address: ${endTokenAddress}`)
    console.log(`End bond nft address: ${bondNFTAddress}`)
    console.log(`Ender bond address: ${enderBondAddress}`)
    console.log(`Ender treasury address: ${enderTreasuryAddress}`)
    console.log(`ELStrategy address: ${enderStrategyAddress}`)
    console.log(`Ender oracle address: ${enderOracleAddress}`)
  });

  describe("1. deposit function test", function () {
    it("Should not allow depositing with non-existent maturity", async function () {
      await expect(enderBond.deposit(principal, maturities[1] + 1, endTokenAddress, alice.address))
        .to.be.revertedWithCustomError(enderBond, "MaturityNotExist()");
    });

    it("Should not allow depositing non-bondable tokens", async function () {
      await expect(enderBond.deposit(principal, maturities[0], enderTreasuryAddress, enderStrategyAddress))
        .to.be.revertedWithCustomError(enderBond, "NotBondableToken()");

      // set stETH as bondable token
      await enderBond.connect(owner).setBondableTokens([addrs.stETHTokenAddr], true);
    });

    it("Should not deposit without token allowance", async function () {
      await expect(enderBond.connect(alice).deposit(principal, maturities[0], addrs.stETHTokenAddr, enderStrategyAddress))
        .to.be.revertedWith("ALLOWANCE_EXCEEDED");

      await expect(enderBond.connect(bob).deposit(principal, maturities[0], addrs.stETHTokenAddr, enderStrategyAddress))
        .to.be.revertedWith("ALLOWANCE_EXCEEDED");
    });

    it("Should successfully deposit and mint a bond NFT to Alice", async function () {
      const depositAmt = ethers.parseEther("10") // 10 ETH

      // approve tokens
      await stEthToken.connect(alice).approve(enderBondAddress, depositAmt);

      // test do deposit
      await enderBond.connect(alice).deposit(depositAmt, maturities[0], addrs.stETHTokenAddr, enderStrategyAddress);

      // check bond nft info
      const bondInfo = await enderBond.bonds(1)
      expect(bondInfo[0]).to.be.eq(false)
      expect(bondInfo[1]).to.be.eq(depositAmt.toString())
      expect(bondInfo[2]).to.gt(0)
      expect(bondInfo[3]).to.gt(0)
      expect(bondInfo[4]).to.gt(0)
      expect(bondInfo[5]).to.be.eq(maturities[0])
      expect(bondInfo[6]).to.be.eq(interestRates[0])
      expect(bondInfo[7]).to.be.eq(enderStrategyAddress)
      expect(bondInfo[8]).to.be.eq(addrs.stETHTokenAddr)

      // check nft owner
      const tokenOwner = await bondNFT.ownerOf(1)
      expect(tokenOwner).to.be.eq(alice.address)
    });

    it("Should successfully deposit and mint a bond NFT to Bob", async function () {
      const depositAmt = ethers.parseEther("20") // 20 ETH

      // approve tokens
      await stEthToken.connect(bob).approve(enderBondAddress, depositAmt);

      // test do deposit
      await enderBond.connect(bob).deposit(depositAmt, maturities[1], addrs.stETHTokenAddr, enderStrategyAddress);

      // check bond nft info
      const bondInfo = await enderBond.bonds(2)
      expect(bondInfo[0]).to.be.eq(false)
      expect(bondInfo[1]).to.be.eq(depositAmt.toString())
      expect(bondInfo[2]).to.gt(0)
      expect(bondInfo[3]).to.gt(0)
      expect(bondInfo[4]).to.gt(0)
      expect(bondInfo[5]).to.be.eq(maturities[1])
      expect(bondInfo[6]).to.be.eq(interestRates[1])
      expect(bondInfo[7]).to.be.eq(enderStrategyAddress)
      expect(bondInfo[8]).to.be.eq(addrs.stETHTokenAddr)

      // check nft owner
      const tokenOwner = await bondNFT.ownerOf(2)
      expect(tokenOwner).to.be.eq(bob.address)
    });
  });

  describe("2. withdrawRequest", function () {
    it("Only BondNFT owner can request", async function () {
      await expect(
        enderBond.connect(alice).withdrawRequest(2)
      ).to.be.revertedWithCustomError(enderBond, "NotBondUser()");
    })

    it("Bond not exist test", async function () {
      await expect(
        enderBond.connect(alice).withdrawRequest(3)
      ).to.be.revertedWith("ERC721: invalid token ID")
    })

    it("Can not make request before maturity expired", async function () {
      await expect(
        enderBond.connect(alice).withdrawRequest(1)
      ).to.be.revertedWithCustomError(enderBond, "BondNotMatured()");
    })

    it("Pass maturity[0] time", async function () {
      await ethers.provider.send("evm_increaseTime", [maturities[0]]);
      await ethers.provider.send("evm_mine");
    })

    it("Alice can create withdraw request", async function () {
      await enderBond.connect(alice).withdrawRequest(1);

      // check withdraw request
    })

    it("Bob still can not create withdraw request", async function () {
      await expect(
        enderBond.connect(bob).withdrawRequest(2)
      ).to.be.revertedWithCustomError(enderBond, "BondNotMatured()");
    })

    it("Alice can not create withdraw request again", async function () {
      await expect(enderBond.connect(alice).withdrawRequest(1)).to.be.revertedWithCustomError(enderStrategy, "AlreadyRequested()");
    })

    it("Alice created request but can not withdraw yet", async function () {
      await expect(enderBond.connect(alice).withdraw(1)).to.be.reverted;
    })

    it("Pass maturity[1] time", async function () {
      await ethers.provider.send("evm_increaseTime", [maturities[1]]);
      await ethers.provider.send("evm_mine");
    })

    it("Bob can create withdraw request now", async function () {
      await enderBond.connect(bob).withdrawRequest(2);

      // check nft token balance

    })

    it("Bob can not create withdraw request again", async function () {
      await expect(enderBond.connect(bob).withdrawRequest(2)).to.be.revertedWithCustomError(enderStrategy, "AlreadyRequested()");
    })
  });

  describe("3. withdraw", function () {
    it("Pass 7 days", async function () {
      await ethers.provider.send("evm_increaseTime", [7 * 24 * 60 * 60]);

      // send 50 blocks
      for (let i = 0; i < 50; ++i) await ethers.provider.send("evm_mine");
    })

    it("do finalization", async function () {
      await enderBond.connect(alice).withdraw(1)

      // check eth balance
    })
  });
});
