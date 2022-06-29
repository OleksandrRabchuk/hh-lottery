const {network, ethers,deployments,getNamedAccounts} = require("hardhat");
const {developmentChains, networkConfig} = require("../helper-config")

const BASE_FEE = ethers.utils.parseEther("0.25")
const GAS_PRICE_LINK = 1e9

module.exports = async () => {
    const { deploy, log } = deployments
    const { deployer } = await getNamedAccounts()
    const args = [BASE_FEE, GAS_PRICE_LINK]

    if(developmentChains.includes(network.name)){
        log("Deploying mocks")
        await deploy("VRFCoordinatorV2Mock",{
            from: deployer,
            log: true,
            args: args
        })
    }

}

module.exports.tags = ["all", "mocks"]