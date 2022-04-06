import env from 'dotenv';
import ethers from 'ethers';
import { RateLimit } from "async-sema";
import { hideBin } from "yargs/helpers";
import Yargs from "yargs";
import { OpenSeaPort, Network } from 'opensea-js';
import HDWalletProvider from "@truffle/hdwallet-provider";

env.config();

const yargs = Yargs(hideBin(process.argv))
    .command('mint-bot', 'start mint bot')
    .option('contract', {
        alias: 'c',
        type: 'string',
        demandOption: true,
        requireArg: true,
        description: 'Contract address'
    })
    .option('bid', {
        type: 'string',
        demandOption: true,
        requiresArg: true,
        description: 'Amount in WETH you would like to bid'
    })
    .option('offerExpiration', {
        type: 'string',
        demandOption: true,
        requiresArg: true,
        default: '1440',
        description: 'Offer expiration in minutes'
    })
    .option('dryRun', {
        type: 'boolean',
        requiresArg: false,
        description: 'Dry run'
    });

const ethersProvider = new ethers.providers.JsonRpcProvider(process.env.PROVIDER, 'mainnet');

let contractAddress = process.env.NFT_CONTRACT_ADDRESS; //yargs.argv.contract;

try {
    contractAddress = ethers.utils.getAddress(contractAddress);
} catch (e) {
    throw { message: 'Invalid contract address', contract: contractAddress };
}

let contract = new ethers.Contract(
    contractAddress,
    [
        'function totalSupply() external view returns (uint256)',
        'function tokenURI(uint256 tokenId) external view returns (string memory)'
    ],
    ethersProvider
);

let totalSupply = await contract.totalSupply();

let startingTokenId = 0;

class Asset {
    constructor(tokenId, contractAddress) {
        this.tokenId = tokenId;
        this.contractAddress = contractAddress;
    }
}

let assets = [];
const ParseResponse = async (response) => {
    try {
        if (response && response.assets) {
            for (var i = 0; i < response.assets.length; i++) {
                const innerI = i;
                const currentAsset = response.assets[innerI];
                //console.log(currentAsset.sell_orders);
                if (!currentAsset.sell_orders) {
                    //console.warn('Not for sale: ' + currentAsset.token_id)
                    continue;
                }
                assets.push(new Asset(currentAsset.token_id, contractAddress));
            }
        }
    } catch (ex) { }
}

async function GetListings(offset) {
    const options = {
        method: 'GET',
        headers: { Accept: 'application/json', 'X-API-KEY': process.env.OPENSEA_API_KEY }
    };

    if (offset === 1) {
        offset = 0;
    }
    var API_URL = 'https://api.opensea.io/api/v1/assets?order_direction=desc&include_orders=true&asset_contract_address=' + contractAddress + '&limit=50&offset=' + offset;
    //console.log(API_URL);
    await fetch(API_URL, options)
        .then(response => response.json())
        .then(response => ParseResponse(response))
        .catch(err => console.error(err));

    await new Promise(r => setTimeout(r, 50));
}

async function RunBidder() {
    // iterate over all possible token ids and create assets
    for (let i = startingTokenId; i < totalSupply; i = i + 50) {
        console.log('Current starting id ' + i);
        await GetListings(i);
        await new Promise(r => setTimeout(r, 50));
    }

    await new Promise(r => setTimeout(r, 50));
    console.log('Tokens for sale ' + assets.length);

    if (yargs.argv.dryRun) {
        console.log('Dry run, not executing bids');
        process.exit();
    }

    const wallet = new HDWalletProvider(process.env.PRIVATE_KEY, process.env.PROVIDER);
    const walletAddress = await wallet.getAddress();

    const ratelimitOpensea = new RateLimit(parseInt(process.env.OPENSEA_RATELIMIT_MIN), { timeUnit: 60000, uniformDistribution: true });

    const seaport = new OpenSeaPort(wallet, {
        networkName: Network.Main,
        apiKey: process.env.OPENSEA_API_KEY
    }, (arg) => console.log('[DEBUG]', new Date(), arg));

    const offerCalls = [];

    for (const nft of assets) {
        const tokenId = nft.tokenId;
        const contractAddress = nft.contractAddress;
        const schema = 'ERC721';

        await ratelimitOpensea();

        const offerCall = seaport.createBuyOrder({
            asset: {
                tokenId: tokenId,
                tokenAddress: contractAddress,
                schemaName: schema
            },
            accountAddress: walletAddress,
            // Value of the offer, in units of the payment token (or wrapped ETH if none is specified):
            startAmount: parseFloat(yargs.argv.bid),
            expirationTime: Math.round(Date.now() / 1000 + 60 * parseInt(yargs.argv.offerExpiration)) // 15 minute from now
        });

        offerCalls.push(offerCall);

        await offerCall
            .then(function (offer) {
                console.log('[DEBUG]', new Date(), `Offer placed, expires in ${yargs.argv.offerExpiration}min`, offer.hash, offer.metadata.asset);
            })
            .catch(function (error) {
                console.log('[ERROR]', new Date(), 'Offer failed', error);
            });
    }

    await new Promise(r => setTimeout(r, 1000));
    console.log('Done. Offers made: ' + offerCalls.length);
}

await RunBidder().catch(console.dir);

