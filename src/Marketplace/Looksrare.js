import HDWalletProvider from "@truffle/hdwallet-provider";
import {MakerOrder, SupportedChainId, addressesByNetwork, generateMakerOrderTypedData} from "@looksrare/sdk";
import {utils, Wallet, providers} from "ethers";
import {RateLimit} from "async-sema";

const apiHost = 'https://api.looksrare.org/api/v1';

const fetchNonce = async function(address) {
  const response = await fetch(`${apiHost}/orders/nonce?address=${address}`);
  const data = await response.json();

  return data.data;
};

/**
 * @param {MakerOrder} order
 * @param {string} signature
 */
const postOrder = async function(order, signature) {
    const response = await fetch(
        `${apiHost}/orders`,
        {
            method: 'POST',
            body: JSON.stringify({...order, ...{signature: signature}}),
            headers: {'X-Looks-Api-Key': process.env.LOOKSRARE_API_KEY}
        }
    )

    const data = await response.json();

    if (data.success === false) {
        throw new Error(data.name)
    }

    return data.data;
}

/**
 * @typedef Nft
 * @type {object}
 * @property {string} title
 * @property {string} tokenId
 * @property {string} schema
 * @property {Array<Record<string, any>>} attributes
 */

/**
 * @param {HDWalletProvider} wallet
 * @param {string} walletAddress
 * @param {string} contractAddress
 * @param {float} bidAmount
 * @param {number} quantity
 * @param {number} offerExpiration
 * @param {Nft[]} assets
 */
export const bid = async function (wallet, walletAddress, contractAddress, bidAmount, quantity, offerExpiration, assets) {
    const chainId = SupportedChainId.MAINNET;
    const addresses = addressesByNetwork[chainId];
    const now = Math.floor(Date.now() / 1000);

    /**
     * @type {MakerOrder}
     */
    const order = {
        isOrderAsk: false,
        signer: walletAddress,
        collection: contractAddress,
        price: utils.parseEther(bidAmount.toString()),
        strategy: addresses.STRATEGY_STANDARD_SALE,
        currency: addresses.WETH,
        startTime: now,
        endTime: now + (60 * offerExpiration),
        minPercentageToAsk: 8500
    };

    const provider = new providers.JsonRpcProvider(process.env.PROVIDER);
    const signer = new Wallet(process.env.PRIVATE_KEY, provider);

    const ratelimit = new RateLimit(parseInt(process.env.LOOKSRARE_RATELIMIT_MIN), {timeUnit: 60000, uniformDistribution: true});

    const offerCalls = [];

    for (const nft of assets) {
        await ratelimit();

        /** @type {MakerOrder} */
        const makerOrder = {...{
            tokenId: nft.tokenId,
            amount: quantity.toString(),
            nonce: await fetchNonce(walletAddress)
        }, ...order};

        const { domain, value, type } = generateMakerOrderTypedData(walletAddress, chainId, makerOrder);
        const signature = await signer._signTypedData(domain, type, value);

        const offerCall = postOrder(makerOrder, signature);

        offerCalls.push(offerCall);

        offerCall
            .then(function (offer) {
                console.log('[DEBUG]', new Date(), `Offer placed, expires in ${offerExpiration}min`, offer.hash, nft);
            })
            .catch(function (error) {
                console.log('[ERROR]', new Date(), 'Offer failed', error);
            })
        ;
    }

    await Promise.allSettled(offerCalls);
};