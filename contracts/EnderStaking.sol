// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";

import "./interfaces/IEndToken.sol";

error ZeroAddress();
error InvalidAmount();

contract EnderStaking is Initializable, OwnableUpgradeable {
    mapping(address => UserInfo) public userInfo;
    struct UserInfo {
        uint256 amount;
        uint256 pending;
        uint256 lastBlock;
    }

    uint256 public percentPerBlock;

    uint256 public stakingApy;

    address public endToken;

    event PercentUpdated(uint256 percent);
    event AddressUpdated(address indexed addr);
    event StakingApyUpdated(uint256 stakingApy);
    event Stake(address indexed account, uint256 stakeAmt);
    event Harvest(address indexed account, uint256 harvestAmt);
    event Withdraw(address indexed account, uint256 withdrawAmt);

    /**
     * @notice Initialize function
     * @param _end  address of END token contract
     */
    function initialize(address _end) external initializer {
        __Ownable_init();

        setAddress(_end);
    }

    /**
     * @notice Update the END token address
     * @param _addr The new address
     */
    function setAddress(address _addr) public onlyOwner {
        if (_addr == address(0)) revert ZeroAddress();

        endToken = _addr;

        emit AddressUpdated(_addr);
    }

    /**
     * @notice Update reward per block
     * @param percent New reward percent per block
     */
    function setReward(uint256 percent) external onlyOwner {
        if (percent == 0) revert InvalidAmount();

        percentPerBlock = percent;

        emit PercentUpdated(percentPerBlock);
    }

    /**
     * @notice Update staking APY
     * @param _stakingApy Staking APY which is set manually for now
     */
    function setStakingApy(uint256 _stakingApy) external onlyOwner {
        if (_stakingApy == 0) revert InvalidAmount();

        stakingApy = _stakingApy;

        emit StakingApyUpdated(_stakingApy);
    }

    /**
     * @notice View function to get pending reward
     * @param account  user wallet address
     */
    function pendingReward(address account) public view returns (uint256 pending) {
        UserInfo storage userItem = userInfo[account];

        pending = userItem.pending + ((block.number - userItem.lastBlock) * percentPerBlock * userItem.amount) / 1e5;
    }

    /**
     * @notice Users do stake
     * @param amount  stake amount
     */
    function stake(uint256 amount) external {
        if (amount == 0) revert InvalidAmount();

        // transfer tokens
        IERC20(endToken).transferFrom(msg.sender, address(this), amount);

        // update user info
        UserInfo storage userItem = userInfo[msg.sender];
        if (userItem.amount != 0) {
            // update pending
            userItem.pending = pendingReward(msg.sender);
        }

        userItem.amount += amount;
        userItem.lastBlock = block.number;

        emit Stake(msg.sender, amount);
    }

    /**
     * @notice Users can withdraw
     * @param amount  withdraw amount
     */
    function withdraw(uint256 amount) external {
        if (amount == 0) revert InvalidAmount();

        UserInfo storage userItem = userInfo[msg.sender];
        if (amount > userItem.amount) amount = userItem.amount;

        // add reward
        uint256 pending = pendingReward(msg.sender);

        // update userinfo
        unchecked {
            if (amount == userItem.amount) delete userInfo[msg.sender];
            else {
                userItem.pending = 0;
                userItem.amount -= amount;
            }
        }

        // mint reward token
        if (pending != 0) IEndToken(endToken).mint(address(this), pending);

        // transfer token
        IERC20(endToken).transfer(msg.sender, amount + pending);

        emit Withdraw(msg.sender, amount);
    }

    /**
     * @notice Harvest only the rewards
     */
    function harvest() external {
        uint256 pending = pendingReward(msg.sender);

        if (pending != 0) {
            // update userinfo
            unchecked {
                UserInfo storage userItem = userInfo[msg.sender];
                userItem.pending = 0;
                userItem.lastBlock = block.number;
            }

            // mint reward token to user
            IEndToken(endToken).mint(msg.sender, pending);

            emit Harvest(msg.sender, pending);
        }
    }
}
