import { http } from 'wagmi';
import type { Chain } from 'viem';
import { optimism, base } from 'wagmi/chains';

// Define Unichain
const unichain = {
  id: 130,
  name: 'Unichain',
  nativeCurrency: {
    decimals: 18,
    name: 'UNI',
    symbol: 'UNI',
  },
  rpcUrls: {
    default: { http: [import.meta.env.VITE_UNICHAIN_RPC_URL || 'https://mainnet.unichain.org'] },
    public: { http: [import.meta.env.VITE_UNICHAIN_RPC_URL || 'https://mainnet.unichain.org'] },
  },
  blockExplorers: {
    default: { name: 'Uniscan', url: 'https://uniscan.xyz' },
  },
} as const satisfies Chain;
import {
  getDefaultConfig,
  RainbowKitProvider,
  darkTheme,
  ConnectButton,
} from '@rainbow-me/rainbowkit';
import '@rainbow-me/rainbowkit/styles.css';

// Get project ID from environment variable
const projectId = import.meta.env.VITE_WALLETCONNECT_PROJECT_ID;
if (!projectId) {
  throw new Error('VITE_WALLETCONNECT_PROJECT_ID is not defined');
}

// Configure supported chains
const chains = [optimism, base, unichain] as const;

// Create wagmi config with RainbowKit
export const config = getDefaultConfig({
  appName: 'Fillanthropist',
  projectId,
  chains,
  transports: {
    [optimism.id]: http(),
    [base.id]: http(),
    [unichain.id]: http(),
  },
});

// Export components and configuration
export { RainbowKitProvider, darkTheme, ConnectButton, chains };
