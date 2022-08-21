import env from 'dotenv';
import ethers from 'ethers';
import {RateLimit} from "async-sema";
import {hideBin} from "yargs/helpers";
import Yargs from "yargs";
import {createHash} from "crypto";
import * as fs from "fs";
import inquirer from "inquirer";
import { OpenSeaSDK, Network } from 'opensea-js';
import HDWalletProvider from "@truffle/hdwallet-provider";
import {Alchemy, Network as AlchemyNetwork} from "alchemy-sdk";

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
    .option('quantity', {
        type: 'string',
        demandOption: false,
        requiresArg: true,
        default: '1',
        description: 'Quantity to buy (ERC721: 1, ERC1155: *)'
    })
    .option('offerExpiration', {
        type: 'string',
        demandOption: true,
        requiresArg: true,
        default: '15',
        description: 'Offer expiration in minutes'
    })
    .option('prefetch', {
        type: 'boolean',
        requiresArg: false,
        description: 'Prefetches data and stores it into cache file'
    })
    .option('dryRun', {
        type: 'boolean',
        requiresArg: false,
        default: true,
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
    .option('marketplace', {
        type: 'string',
        array: true,
        choices: ['Opensea', 'Looksrare'],
        default: ['Opensea'],
        description: 'Marketplaces for bidding'
    })
;

let contractAddress = yargs.argv.contract;

try {
    contractAddress = ethers.utils.getAddress(contractAddress);
} catch (e) {
    throw {message: 'Invalid contract address', contract: contractAddress};
}

const alchemy = new Alchemy({apiKey: process.env.ALCHEMY_API_KEY, network: AlchemyNetwork.ETH_MAINNET, maxRetries: 3});

const contractMetadata = await alchemy.nft.getContractMetadata(contractAddress);

if (contractMetadata.totalSupply === undefined) {
    const refreshStatus = await alchemy.nft.refreshContract(contractAddress);

    console.log('[ERROR]', new Date(), 'Alchemy is indexing the contract', refreshStatus);
    process.exit();
}

const cacheHash = createHash('sha256').update(contractAddress+contractMetadata.totalSupply.toString()).digest('hex');
const cacheFileName = 'cache/'+cacheHash+'.json';
let existsFile = fs.existsSync(cacheFileName);

let cacheFile;

if (existsFile) {
    if (yargs.argv.prefetch) {
        const result = await inquirer
            .prompt([{type: 'confirm', 'name': 'prefetch', 'message': 'Are you sure that you want to overwrite existing data and fetch everything again?', default: false}])
        ;

        if (result.prefetch === false) {
            cacheFile = fs.readFileSync(cacheFileName);
        } else {
            existsFile = false;
        }
    } else {
        cacheFile = fs.readFileSync(cacheFileName);
    }
}

const shouldFilterForMetadata = yargs.argv.trait !== undefined && yargs.argv.traitValue !== undefined;

/**
 * @typedef Nft
 * @type {object}
 * @property {string} title
 * @property {string} tokenId
 * @property {string} schema
 * @property {Array<Record<string, any>>} attributes
 */

/** @type {Nft[]} */
let assets = [];

if (existsFile && cacheFile) {
    console.log('[DEBUG]', new Date(), 'Loading assets from cache file');

    assets = JSON.parse(cacheFile.toString());
}

if (!existsFile) {
    for await (const nft of alchemy.nft.getNftsForContractIterator(contractAddress)) {
        if (nft.rawMetadata.attributes === undefined) {
            continue;
        }

        console.log('[DEBUG]', new Date(), nft.title);
        assets.push({
            title: nft.title,
            tokenId: nft.tokenId,
            schema: nft.tokenType.toString(),
            attributes: nft.rawMetadata.attributes
        });
    }

    fs.writeFileSync(cacheFileName, JSON.stringify(assets));
}

if (shouldFilterForMetadata) {
    assets = assets.filter(function (asset) {
        return asset.attributes.findIndex(function (attribute) {
            return attribute.trait_type === yargs.argv.trait && attribute.value === yargs.argv.traitValue;
        }) !== -1;
    });
}

console.log('[DEBUG]', new Date(), 'Processing total of ' + assets.length);

if (yargs.argv.dryRun) {
    console.log('[DEBUG]', new Date(), 'Dry run, not executing bids');
    process.exit();
}

const wallet = new HDWalletProvider(process.env.PRIVATE_KEY, process.env.PROVIDER);
const walletAddress = await wallet.getAddress();

const bidArgs = [wallet, walletAddress, contractAddress, parseFloat(yargs.argv.bid), parseInt(yargs.argv.quantity), parseInt(yargs.argv.offerExpiration), assets];

const marketplaces = [];

for (const marketplace of yargs.argv.marketplace) {
    marketplaces.push(await import(`src/Marketplace/${marketplace}.js`).bid(...bidArgs));
}

await Promise.all(marketplaces);

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