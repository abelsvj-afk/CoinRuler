/**
 * Morpho Protocol API Client
 * Fetches collateral and loan data from Morpho via The Graph subgraph
 */

import { getLogger } from '@coinruler/shared';

const logger = getLogger({ svc: 'morpho' });

// Morpho Blue subgraph endpoint (Base network)
const MORPHO_SUBGRAPH_URL = process.env.MORPHO_SUBGRAPH_URL || 'https://api.studio.thegraph.com/query/57079/morpho-blue-base/version/latest';

export interface MorphoCollateral {
  asset: string;
  collateralBalance: number;
  borrowBalance: number;
  ltv: number;
  walletAddress: string;
}

/**
 * Fetch user's collateral positions from Morpho
 */
export async function getMorphoCollateral(walletAddress: string): Promise<MorphoCollateral[]> {
  if (!walletAddress) {
    logger.warn('No wallet address provided for Morpho query');
    return [];
  }

  const query = `
    query GetUserPosition($userAddress: String!) {
      account(id: $userAddress) {
        id
        positions {
          market {
            loanAsset {
              symbol
              decimals
            }
            collateralAsset {
              symbol
              decimals
            }
            lltv
          }
          collateral
          supplyShares
          borrowShares
        }
      }
    }
  `;

  try {
    const response = await fetch(MORPHO_SUBGRAPH_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        query,
        variables: {
          userAddress: walletAddress.toLowerCase(),
        },
      }),
    });

    if (!response.ok) {
      throw new Error(`Morpho API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();

    if (data.errors) {
      logger.error({ errors: data.errors }, 'Morpho GraphQL errors');
      return [];
    }

    const account = data.data?.account;
    if (!account || !account.positions || account.positions.length === 0) {
      logger.info('No Morpho positions found for wallet');
      return [];
    }

    // Parse positions into collateral data
    const collaterals: MorphoCollateral[] = [];
    for (const pos of account.positions) {
      const collateralAsset = pos.market?.collateralAsset?.symbol || 'UNKNOWN';
      const collateralDecimals = pos.market?.collateralAsset?.decimals || 18;
      const collateralRaw = BigInt(pos.collateral || 0);
      const collateralBalance = Number(collateralRaw) / Math.pow(10, collateralDecimals);

      const borrowDecimals = pos.market?.loanAsset?.decimals || 18;
      const borrowRaw = BigInt(pos.borrowShares || 0);
      const borrowBalance = Number(borrowRaw) / Math.pow(10, borrowDecimals);

      const ltv = pos.market?.lltv ? Number(pos.market.lltv) / 1e18 : 0;

      if (collateralBalance > 0) {
        collaterals.push({
          asset: collateralAsset,
          collateralBalance,
          borrowBalance,
          ltv,
          walletAddress,
        });
      }
    }

    logger.info({ count: collaterals.length }, 'Fetched Morpho collateral positions');
    return collaterals;
  } catch (err: any) {
    logger.error({ err: err.message }, 'Failed to fetch Morpho collateral');
    return [];
  }
}

/**
 * Get total BTC locked in Morpho (collateral + supplied)
 */
export async function getMorphoBTC(walletAddress: string): Promise<number> {
  const collaterals = await getMorphoCollateral(walletAddress);
  const btcPositions = collaterals.filter(c => c.asset.toUpperCase() === 'WBTC' || c.asset.toUpperCase() === 'BTC');
  return btcPositions.reduce((sum, pos) => sum + pos.collateralBalance, 0);
}
