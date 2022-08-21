# NFT Bidding Bot
Automated mass bidding on opensea and looksrare collections.

Features included:
- Bidding on ERC721/ERC1155 assets with WETH
- Custom expiration time 
- Filter bids based on traits
## Install
### NVM aka Node Version Manager
Windows: https://github.com/coreybutler/nvm-windows

Linux/MacOS: https://github.com/nvm-sh/nvm

Supported Node versions due OS are v16.13.*
### Bidding Bot
After node is installed, run `npm install --global yarn`
To then install the bot, run `yarn install`
## Configuration
Copy **.env.dist** and add missing values

### Mandatory

**PROVIDER**: your rpc provider url, such as moralis.io, infura.io etc.

**PRIVATE_KEY**: Private key of wallet that should be used for bidding

**ALCHEMY_API_KEY**: API key for the alchemy sdk, create one [here](https://auth.alchemyapi.io/signup)

### Optional
Depending on which marketplaces you would like to use

**OPENSEA_API_KEY**: Opensea api key, either ask in their discord or retrieve one [here](https://docs.opensea.io/reference/request-an-api-key)

**OPENSEA_RATELIMIT_MIN**: Rate limit per minute for your opensea api key, usually between 30 - 60

**LOOKSRARE_API_KEY**: Looksrare api key, ask in their discord [here](https://discord.gg/LooksRareDevelopers)

**LOOKSRARE_RATELIMIT_MIN**: Rate limit per minute for your opensea api key, usually between 30 - 60
## Examples ERC721
### Run without execution: Bid 0.1 WETH on all assets of given contract, which expire in 15min
```shell
 node src/index.js --contract "0x9ca8887d13bc4591ae36972702fdf9de2c97957f" --bid "0.1" --dry-run
```
### Bid 0.1 WETH on all assets of given contract, on multiple marketplaces, which expire in 15min
```shell
 node src/index.js --contract "0x9ca8887d13bc4591ae36972702fdf9de2c97957f" --bid "0.1" --marketplace Opensea --marketplace Looksrare
```
### Bid 0.1 WETH on all assets of given contract, which expire in 15min
```shell
 node src/index.js --contract "0x9ca8887d13bc4591ae36972702fdf9de2c97957f" --bid "0.1"
```
### Bid 0.1 WETH on all assets of given contract, which expire in 30min
```shell
 node src/index.js --contract "0x9ca8887d13bc4591ae36972702fdf9de2c97957f" --bid "0.1" --offer-expiration "30"
```
### Prefetch metadata for given contract
```shell
 node src/index.js --contract "0x9ca8887d13bc4591ae36972702fdf9de2c97957f" --prefetch
```
### Filter before bidding
```shell
 node src/index.js --contract "0x9ca8887d13bc4591ae36972702fdf9de2c97957f" --bid "0.1" --trait "Issue Number" --trait-value "Issue 1"
```
## Upcoming features
- Percentage bid based on floor price
- Bidding with other ERC-20 tokens
- Leveraging Looksrare collection/trait based orders
## Support
For any questions feel free to contact me on [twitter](https://twitter.com/bavragor94)
## Donations
For supporting my projects and keep them running, feel free to tip **tony-stark.eth**