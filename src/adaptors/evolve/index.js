const utils = require('../utils');
const sdk = require('@defillama/sdk');

const DECIMALS = { eusd: 18 };

const EUSD_CONTRACTS = {
  sei: "0xf2282e641cd3ceeafd4e24663d409fcb68edc1df",
};

const UNDERLYING_TOKENS = {
  sei: {
    USDC: 'coingecko:usd-coin',
  },
};

const SUPPORTED_CHAINS = Object.keys(EUSD_CONTRACTS);

const ABIS = {
  totalSupply: 'function totalSupply() view returns (uint256)'
};

const fetchLatestAPY = async () => {
  try {
    const response = await fetch('https://gw.goevolve.xyz/vault/api/public/vaults/eusd?chainId=1329');
    const data = await response.json();
    const apy = data?.apy ?? data?.metrics?.apy ?? 0;
    return typeof apy === 'number' ? parseFloat((apy * 100).toFixed(2)) : 0;
  } catch (error) {
    return 0;
  }
};

const getTVL = async (tokenAddress, chain, decimals = DECIMALS.eusd) => {
  try {
    const [supplyResponse, priceData] = await Promise.all([
      sdk.api.abi.call({
        chain: chain,
        abi: ABIS.totalSupply,
        target: tokenAddress
      }),
      utils.getPrices([tokenAddress], chain)
    ]);

    const totalSupply = supplyResponse.output / (10 ** decimals);
    const tokenPrice = priceData.pricesByAddress[tokenAddress.toLowerCase()] || 0;
    const tvlUsd = totalSupply * tokenPrice;
    return parseFloat(tvlUsd.toFixed(2));
  } catch (error) {
    console.error(`Error getting TVL for ${tokenAddress} on ${chain}:`, error);
    return 0;
  }
};

const getUnderlying = (symbol, chain) => {
  const chainTokens = UNDERLYING_TOKENS[chain];
  if (!chainTokens) return null;
  const lowerSymbol = symbol.toLowerCase();
  if (lowerSymbol.includes('usd')) return chainTokens.USDC;
  return null;
};

const BASE_URL = 'https://evolve.fi';

const createPool = (tokenAddress, symbol, chain, tvl, apy) => {
  const underlying = getUnderlying(symbol, chain);
  const vaultSlug = symbol.toLowerCase();
  return {
    pool: `${tokenAddress}-${chain}`,
    chain: chain,
    project: 'evolve',
    symbol: utils.formatSymbol(symbol),
    tvlUsd: tvl,
    apyBase: apy,
    url: `${BASE_URL}/vaults/${vaultSlug}`,
    ...(underlying && { underlyingTokens: [underlying] }),
  };
};

const processToken = async (tokenAddress, symbol, chain) => {
  try {
    const [tvl, apy] = await Promise.all([
      getTVL(tokenAddress, chain),
      fetchLatestAPY()
    ]);

    return createPool(tokenAddress, symbol, chain, tvl, apy);
  } catch (error) {
    console.error(`Error processing ${symbol} on ${chain}:`, error);
    return null;
  }
};

const poolsFunction = async () => {
  const allPools = [];

  const chainPromises = SUPPORTED_CHAINS.map(async (chain) => {
    const tokenPromises = [
      processToken(EUSD_CONTRACTS[chain], 'eusd', chain),
    ];
    const pools = await Promise.all(tokenPromises);
    return pools.filter(Boolean);
  });

  const chainResults = await Promise.all(chainPromises);
  chainResults.forEach(pools => {
    allPools.push(...pools);
  });

  return allPools;
};

module.exports = {
  timetravel: false,
  apy: poolsFunction,
  url: BASE_URL + '/',
};
