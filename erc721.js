import env from 'dotenv';
import ethers from 'ethers';
import {RateLimit} from "async-sema";
import MetadataErc721 from "./src/metadataErc721.js";
import {hideBin} from "yargs/helpers";
import Yargs from "yargs";
import {createHash} from "crypto";
import * as fs from "fs";
import inquirer from "inquirer";
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
        default: '15',
        description: 'Offer expiration in minutes'
    })
    .option('prefetchMetadata', {
        type: 'boolean',
        requiresArg: false,
        description: 'Prefetches metadata and stores it into cache file'
    })
    .option('dryRun', {
        type: 'boolean',
        requiresArg: false,
        description: 'Dry run'
    })
    .option('trait', {
        type: 'string',
        implies: 'trait-value',
        description: 'Filter assets by trait'
    })
    .option('trait-value', {
        type: 'string',
        implies: 'trait',
        description: 'Filter assets by trait value'
    })
;

const ipfsHosts = process.env.IPFS_HOSTS.split(' ');
const ethersProvider = new ethers.providers.JsonRpcProvider(process.env.PROVIDER, 'mainnet');
const metadata = new MetadataErc721(ethersProvider, ipfsHosts);

let contractAddress = yargs.argv.contract;

try {
    contractAddress = ethers.utils.getAddress(contractAddress);
} catch (e) {
    throw {message: 'Invalid contract address', contract: contractAddress};
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

try {
    await contract.tokenURI(startingTokenId);
} catch (e) {
    startingTokenId += 1;
    await contract.tokenURI(startingTokenId);
}

const cacheHash = createHash('sha256').update(contractAddress+totalSupply.toString()).digest('hex');
const cacheFileName = 'cache/'+cacheHash+'.json';
const existsFile = fs.existsSync(cacheFileName);

let cacheFile;

if (existsFile) {
    if (yargs.argv.prefetchMetadata) {
        const result = await inquirer
            .prompt([{type: 'confirm', 'name': 'prefetchMetadata', 'message': 'Are you sure that you want to overwrite existing metadata and fetch everything again?', default: false}])
        ;

        if (result.prefetchMetadata === false) {
            cacheFile = fs.readFileSync(cacheFileName);
        }
    } else {
        cacheFile = fs.readFileSync(cacheFileName);
    }
}

class Asset {
    constructor(tokenId, contractAddress, metadata) {
        this.tokenId = tokenId;
        this.contractAddress = contractAddress;
        this.attributes = metadata.attributes;
    }
}

const metadataRateLimit = new RateLimit(parseInt(process.env.PROVIDER_RATELIMIT_SEC));

const metadataCalls = [];
let assets = [];

const shouldFilterForMetadata = (yargs.argv.trait !== undefined && yargs.argv.traitValue !== undefined) || yargs.argv.prefetchMetadata;

// iterate over all possible token ids and create assets with metadata
for (let i = startingTokenId; i < totalSupply && !existsFile; i++) {
    if (shouldFilterForMetadata) {
        await metadataRateLimit();

        let call = metadata.getMetadata(contractAddress, i);

        call
            .then(async function (tokenId, contractAddress, metadata) {
                assets.push(new Asset(tokenId, contractAddress, metadata));
                console.log('[DEBUG]', new Date(), 'Fetched metadata', contractAddress, tokenId);
            }.bind(null, i, contractAddress))
            .catch(function (tokenId, contractAddress, error) {
                if (error.error !== undefined && error.error.reason !== undefined && process.env.ALLOWED_ERRORS.split(";").indexOf(error.error.reason) !== -1) {
                    return;
                }

                console.log('[ERROR]', new Date(), 'Error while fetching metadata', contractAddress, tokenId, JSON.stringify(error));
            }.bind(null, i, contractAddress));

        metadataCalls.push(call);
    }

    if (!shouldFilterForMetadata) {
        assets.push(new Asset(i, contractAddress, []));
    }
}

await Promise.allSettled(metadataCalls);

if (shouldFilterForMetadata) {
    assets.filter(function (asset) {
        return asset.attributes.findIndex(attribute => attribute.trait_type === yargs.argv.trait && attribute.trait_type === yargs.argv.traitValue) !== -1;
    });
}

if (existsFile) {
    console.log('[DEBUG]', new Date(), 'Loading assets from cache file');

    assets = JSON.parse(cacheFile.toString());
}

console.log(assets.length);
fs.writeFileSync(cacheFileName, JSON.stringify(assets));

if (yargs.argv.dryRun) {
    console.log('Dry run, not executing bids');
    process.exit();
}

const wallet = new HDWalletProvider(process.env.PRIVATE_KEY, process.env.PROVIDER);
const walletAddress = await wallet.getAddress();

const ratelimitOpensea = new RateLimit(parseInt(process.env.OPENSEA_RATELIMIT_MIN), {timeUnit: 60000, uniformDistribution: true});

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

    offerCall
        .then(function (offer) {
            console.log('[DEBUG]', new Date(), `Offer placed, expires in ${yargs.argv.offerExpiration}min`, offer.hash, offer.metadata.asset);
        })
        .catch(function (error) {
            console.log('[ERROR]', new Date(), 'Offer failed', error);
        })
    ;
}

await Promise.allSettled(offerCalls);

function exitHandler() {
    console.log(new Date(), 'Exit handler called', arguments);
    process.exit();
}

//do something when app is closing
process.on('exit', exitHandler);

//catches ctrl+c event
process.on('SIGINT', exitHandler);

// catches "kill pid" (for example: nodemon restart)
process.on('SIGUSR1', exitHandler);
process.on('SIGUSR2', exitHandler);

//catches uncaught exceptions
process.on('uncaughtException', exitHandler);

process.exit();