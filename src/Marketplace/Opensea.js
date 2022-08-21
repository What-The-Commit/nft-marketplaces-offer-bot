import {RateLimit} from "async-sema";
import {Network, OpenSeaSDK} from "opensea-js";
import HDWalletProvider from "@truffle/hdwallet-provider";

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
    const offerCalls = [];

    const ratelimitOpensea = new RateLimit(parseInt(process.env.OPENSEA_RATELIMIT_MIN), {timeUnit: 60000, uniformDistribution: true});

    const seaport = new OpenSeaSDK(wallet, {
        networkName: Network.Main,
        apiKey: process.env.OPENSEA_API_KEY
    }, (arg) => console.log('[DEBUG]', new Date(), arg));

    for (const nft of assets) {
        const tokenId = nft.tokenId;
        const schema = nft.schema;

        await ratelimitOpensea();

        const offerCall = seaport.createBuyOrder({
            asset: {
                tokenId: tokenId,
                tokenAddress: contractAddress,
                schemaName: schema
            },
            accountAddress: walletAddress,
            // Value of the offer, in units of the payment token (or wrapped ETH if none is specified):
            startAmount: bidAmount,
            expirationTime: Math.round(Date.now() / 1000 + 60 * offerExpiration) // 15 minute from now
        });

        offerCalls.push(offerCall);

        offerCall
            .then(function (offer) {
                console.log('[DEBUG]', new Date(), `Offer placed, expires in ${offerExpiration}min`, offer.orderHash, nft);
            })
            .catch(function (error) {
                console.log('[ERROR]', new Date(), 'Offer failed', error);
            })
        ;
    }

    await Promise.allSettled(offerCalls);
};