# OpenSea NFT Bidding Bot
Automated mass bidding on opensea collections.

Features included:
- Bidding on ERC721 assets with WETH
- Custom expiration time 
- Filter bids based on traits
## Install
### NVM aka Node Version Manager
Windows: https://github.com/coreybutler/nvm-windows

Linux/MacOS: https://github.com/nvm-sh/nvm

Supported Node versions due OS are v16.13.*
### Bidding Bot
After node is installed, run `npm install`
## Configuration
Copy **.env.dist** and add missing values

**PROVIDER**: your rpc provider url, such as moralis.io, infura.io etc.

**PROVIDER_RATELIMIT_SEC**: rate limit per seconds for your provider

**OPENSEA_API_KEY**: Opensea api key, either ask in their discord or retrieve one [here](https://docs.opensea.io/reference/request-an-api-key)

**OPENSEA_RATELIMIT_MIN**: Rate limit per minute for your opensea api key, usually between 30 - 60

**PRIVATE_KEY**: Private key of wallet that should be used for bidding

**IPFS_HOSTS**: IPFS hosts for retrieving metadata, such as https://gateway.pinata.cloud https://gateway.ipfs.io

**ALLOWED_ERRORS**: Allowed errors when retrieving metadata, e.g. *UT: invalid token* for Huxley
## Examples ERC721
### Run without execution: Bid 0.1 WETH on all assets of given contract, which expire in 15min
```shell
 node erc721.js --contract "0x9ca8887d13bc4591ae36972702fdf9de2c97957f" --bid "0.1" --dry-run
```
### Bid 0.1 WETH on all assets of given contract, which expire in 15min
```shell
 node erc721.js --contract "0x9ca8887d13bc4591ae36972702fdf9de2c97957f" --bid "0.1"
```
### Bid 0.1 WETH on all assets of given contract, which expire in 30min
```shell
 node erc721.js --contract "0x9ca8887d13bc4591ae36972702fdf9de2c97957f" --bid "0.1" --offer-expiration "30"
```
### Prefetch metadata for given contract
```shell
 node erc721.js --contract "0x9ca8887d13bc4591ae36972702fdf9de2c97957f" --prefetch-metadata
```
### Filter before bidding
```shell
 node erc721.js --contract "0x9ca8887d13bc4591ae36972702fdf9de2c97957f" --bid "0.1" --trait "Issue Number" --trait-value "Issue 1"
```
## Upcoming features
- ERC1155 support
- Percentage bid based on floor price
- Bidding with other ERC-20 tokens
## Support
For any questions feel free to join the [discord](https://discord.gg/PFYzMfqVfk)
## Donations
For supporting my projects and keep them running, feel free to tip **tony-stark.eth**