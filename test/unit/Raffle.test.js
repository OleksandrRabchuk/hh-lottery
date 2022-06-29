const {developmentChains, networkConfig}  = require("../../helper-config")
const {network, getNamedAccounts, deployments, ethers} = require("hardhat");
const { assert, expect, } = require("chai")


!developmentChains.includes(network.name) ?
    describe.skip :
    describe("Raffle Unit Test", async () => {
        let raffle, vrfCoordinatorV2Mock, entranceFee, deployer, interval, accounts, raffleContract, player
        const chainId = network.config.chainId
        beforeEach( async () => {
            accounts = await ethers.getSigners()
            player = accounts[1]
            deployer  = (await getNamedAccounts()).deployer
            await deployments.fixture(["all"])
            raffleContract = await ethers.getContract("Raffle")
            raffle = raffleContract.connect(accounts[1])
            vrfCoordinatorV2Mock = await ethers.getContract("VRFCoordinatorV2Mock")
            entranceFee = await raffle.getEntranceFee()
            interval = await raffle.getInterval()

        })

        describe("constructor", () => {
            it("initialize the raffle correctly", async () => {
                const raffleState = await raffle.getRaffleState()
                const interval = await raffle.getInterval()
                assert.equal(raffleState.toString(), "0")
                assert.equal(interval.toString(), networkConfig[chainId].interval)
            })
        })

        describe("Enter Raffle", () => {

            it("revert when not enough payment", async () => {
                await expect(raffle.enterRaffle()).to.be.revertedWith("Raffle_NotEnoughETHEntered")
            })

            it("records players when they enter", async () => {
                await raffle.enterRaffle({value: entranceFee})
                const contractPlayer = await raffle.getPlayer(0)
                assert.equal(player.address, contractPlayer)
            })

            it("emmits event on enter raffle", async () => {
                await expect(raffle.enterRaffle({value: entranceFee})).to.emit(raffle, "RaffleEnter")
            })

            it("doesn't allow to enter when calculating", async () => {
                await raffle.enterRaffle({value: entranceFee})
                await network.provider.send("evm_increaseTime", [interval.toNumber() + 1])
                await network.provider.send("evm_mine", [])

                await raffle.performUpkeep([])

                await expect(raffle.enterRaffle({value:entranceFee})).to.be.revertedWith("Raffle_NotOpen")
            })
        })

        describe("checkUpkeep",()=>{
            it("returns false if people haven't sent any eth", async () => {
                await network.provider.send("evm_increaseTime", [interval.toNumber() + 1])
                await network.provider.send("evm_mine", [])
                const {upkeepNeeded} = await raffle.callStatic.checkUpkeep([])
                assert(!upkeepNeeded)
            })
            it("returns false if people raffle isn't open", async () => {
                await raffle.enterRaffle({value: entranceFee})
                await network.provider.send("evm_increaseTime", [interval.toNumber() + 1])
                await network.provider.send("evm_mine", [])
                await raffle.performUpkeep([])
                const raffleState = await raffle.getRaffleState()
                const {upkeepNeeded} = await raffle.callStatic.checkUpkeep([])

                assert.equal(raffleState.toString(),"1")
                assert.equal(upkeepNeeded,false)
            })
            it("returns false if enough time hasn't passed", async () => {
                await raffle.enterRaffle({ value: entranceFee })
                await network.provider.send("evm_increaseTime", [interval.toNumber() - 1])
                await network.provider.request({ method: "evm_mine", params: [] })
                const { upkeepNeeded } = await raffle.callStatic.checkUpkeep("0x")
                assert.equal(!upkeepNeeded, false)
            })
            it("returns true if enough time has passed, has players, eth, and is open", async () => {
                await raffle.enterRaffle({ value: entranceFee })
                await network.provider.send("evm_increaseTime", [interval.toNumber() + 1])
                await network.provider.request({ method: "evm_mine", params: [] })
                const { upkeepNeeded } = await raffle.callStatic.checkUpkeep("0x")
                assert(upkeepNeeded)
            })
        })

        describe("performUpkeep", () => {
            it("it can only run if checkupkep is true", async () => {
                await raffle.enterRaffle({ value: entranceFee })
                await network.provider.send("evm_increaseTime", [interval.toNumber() + 1])
                await network.provider.request({ method: "evm_mine", params: [] })
                const tx = await raffle.performUpkeep([])
                assert(tx)
            })

            it("reverts if checkup is false", async () => {
                await expect(raffle.performUpkeep("0x")).to.be.revertedWith(
                    "Raffle_UpkeepNotNeeded(0, 0, 0)"
                )
            })

            it("updates the raffle state, emits and event and calls the vrf coordinator", async () => {
                await raffle.enterRaffle({ value: entranceFee })
                await network.provider.send("evm_increaseTime", [interval.toNumber() + 1])
                await network.provider.request({ method: "evm_mine", params: [] })
                const txResponse = await raffle.performUpkeep([])
                const txReceipt = await txResponse.wait(1)
                const requestId = txReceipt.events[1].args.requestId // because native performUpkeep has an event
                const raffleState = await raffle.getRaffleState()
                assert(requestId.toNumber() > 0)
                assert(raffleState.toString() == '1')
            })
        })

        describe("fullfillRandomWords", () => {
            beforeEach(async()=> {
                await raffle.enterRaffle({ value: entranceFee })
                await network.provider.send("evm_increaseTime", [interval.toNumber() + 1])
                await network.provider.request({ method: "evm_mine", params: [] })
            })
            it("can only be called after performUpkeep", async () => {
                await expect(vrfCoordinatorV2Mock.fulfillRandomWords(0,raffle.address)).to.be.revertedWith('nonexistent request')
            })
            it("picks a winner, resets, and sends money", async () => {
                const additionalEntrances = 3
                const startingIndex = 2
                for (let i = startingIndex; i < startingIndex + additionalEntrances; i++) {
                    raffle = raffleContract.connect(accounts[i])
                    await raffle.enterRaffle({value: entranceFee})
                }
                const startingTimeStamp = await raffle.getLastTimeStamp()

                // This will be more important for our staging tests...
                await new Promise(async (resolve, reject) => {
                    raffle.once("WinnerPicked", async () => {
                        console.log("WinnerPicked event fired!")
                        // assert throws an error if it fails, so we need to wrap
                        // it in a try/catch so that the promise returns event
                        // if it fails.
                        try {
                            // Now lets get the ending values...
                            const recentWinner = await raffle.getRecentWinner()
                            const raffleState = await raffle.getRaffleState()
                            const winnerBalance = await accounts[2].getBalance()
                            const endingTimeStamp = await raffle.getLastTimeStamp()
                            await expect(raffle.getPlayer(0)).to.be.reverted
                            assert.equal(recentWinner.toString(), accounts[2].address)
                            assert.equal(raffleState, 0)
                            assert.equal(
                                winnerBalance.toString(),
                                startingBalance
                                    .add(
                                        entranceFee
                                            .mul(additionalEntrances)
                                            .add(entranceFee)
                                    )
                                    .toString()
                            )
                            assert(endingTimeStamp > startingTimeStamp)
                            resolve()
                        } catch (e) {
                            reject(e)
                        }
                    })

                    const tx = await raffle.performUpkeep("0x")
                    const txReceipt = await tx.wait(1)
                    const startingBalance = await accounts[2].getBalance()
                    await vrfCoordinatorV2Mock.fulfillRandomWords(
                        txReceipt.events[1].args.requestId,
                        raffle.address
                    )
                })
            })
        })
    })