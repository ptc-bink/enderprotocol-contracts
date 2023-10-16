// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts-upgradeable/token/ERC20/ERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";

// Interfaces
import "../interfaces/IEndToken.sol";

error ZeroAddress();
error InvalidParam();

/**
 * @title EndToken contract
 * @notice Implements Ender Protocol's rebasing token - END
 */
contract EndToken is IEndToken, ERC20Upgradeable, AccessControlUpgradeable {
    address public treasury;

    uint256 public refractionFee;

    uint256 public prevAmount;

    uint256 public todayAmount;

    uint256 private lastTransfer;

    // minter role hash
    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");

    mapping(address => bool) public excludeWallets;

    event TreasuryContractChanged(address indexed newTreasury);
    event FeeUpdated(uint256 fee);
    event DayfeeUpdated(uint256 amount, uint256 updateTime);

    /**
     * @notice Initializes the EndToken contract
     * @param fee  Refraction fee
     */
    function initialize(uint256 fee) external initializer {
        __ERC20_init("End Token", "END");

        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);

        // set fee
        setFee(fee);

        // add exclude wallets
        excludeWallets[address(this)] = true;
        excludeWallets[msg.sender] = true;

        unchecked {
            lastTransfer = block.timestamp - (block.timestamp % 1 days);
        }

        // this is only for testing
        _mint(msg.sender, 1e13);
    }

    /**
     * @notice Returns the number of decimals
     * @return uint8 The number of decimal places the token uses
     */
    function decimals() public view virtual override returns (uint8) {
        return 9;
    }

    function setFee(uint256 fee) public onlyRole(DEFAULT_ADMIN_ROLE) {
        if (fee == 0) revert InvalidParam();

        refractionFee = fee;

        emit FeeUpdated(fee);
    }

    function setExclude(address[] calldata addrs, bool flag) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (addrs.length == 0) revert InvalidParam();

        unchecked {
            for (uint8 i; i < addrs.length; ++i) excludeWallets[addrs[i]] = flag;
        }
    }

    /**
     * @notice Sets the treasury contract address
     * @param treasury_ The new treasury contract address
     */
    function setTreasury(address treasury_) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (treasury_ == address(0)) revert ZeroAddress();

        treasury = treasury_;

        emit TreasuryContractChanged(treasury_);
    }

    /**
     * @notice Mints a specified amount of tokens to the treasury
     * @param amount The amount of tokens to mint
     */
    function mint(address to, uint256 amount) external onlyRole(MINTER_ROLE) {
        if (to == address(0)) revert ZeroAddress();

        _mint(to, amount);
    }

    function _transfer(address from, address to, uint256 amount) internal override {
        if (excludeWallets[from] || excludeWallets[to]) super._transfer(from, to, amount);
        else {
            uint256 fee = (amount * refractionFee) / 1e2;

            if (fee != 0) {
                unchecked {
                    if (block.timestamp >= lastTransfer + 1 days) {
                        lastTransfer -= block.timestamp % 1 days;
                        prevAmount = todayAmount;
                        todayAmount = fee;

                        emit DayfeeUpdated(prevAmount, block.timestamp);
                    } else todayAmount += fee;
                }

                super._transfer(from, treasury, fee);
            }

            super._transfer(from, to, amount - fee);
        }
    }
}
