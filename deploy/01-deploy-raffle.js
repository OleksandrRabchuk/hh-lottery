const {deployments, getNamedAccounts, network, ethers} = require("hardhat");
const {developmentChains, networkConfig} = require("../helper-config");
const { verify } = require("../utils/verify");

const VRF_SUB_FUND_AMOUNT = ethers.utils.parseEther('10')

module.exports = async () => {
    const { deploy, log } = deployments
    const { deployer } = await getNamedAccounts()
    let VRFCoordinatorV2Address, subscriptionId;
    const chainId = network.config.chainId

    if(developmentChains.includes(network.name)){
        const vrfCoordinatorV2Mock = await ethers.getContract("VRFCoordinatorV2Mock")
        VRFCoordinatorV2Address = vrfCoordinatorV2Mock.address
        const transactionRequest = await vrfCoordinatorV2Mock.createSubscription()
        const transactionReceipt = await transactionRequest.wait(1)
        subscriptionId = transactionReceipt.events[0].args.subId
        await vrfCoordinatorV2Mock.fundSubscription(subscriptionId, VRF_SUB_FUND_AMOUNT)
    } else {
        VRFCoordinatorV2Address = networkConfig[chainId].vrfCoordinatorV2
        subscriptionId = networkConfig[chainId].subscriptionId
    }



    const args = [VRFCoordinatorV2Address, networkConfig[chainId]["entranceFee"], networkConfig[chainId]["gasLane"], subscriptionId, networkConfig[chainId]["callbackGasLimit"], networkConfig[chainId]["interval"]]

    const raffle = await deploy("Raffle", {
        from: deployer,
        args: args,
        log: true,
        waitConfirmations: network.config.blockConfirmations || 1
    })

    if (!developmentChains.includes(network.name) && process.env.ETHERSCAN_API_KEY) {
        log("Verifying...")
        await verify(raffle.address, arguments)
    }
    log( " -------------------------------- ")
}

module.exports.tags = ["all", "raffle"]