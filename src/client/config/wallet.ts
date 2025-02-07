import { http } from 'wagmi';
import { optimism, base } from 'wagmi/chains';
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
const chains = [optimism, base] as const;

// Create wagmi config with RainbowKit
export const config = getDefaultConfig({
  appName: 'Fillanthropist',
  projectId,
  chains,
  transports: {
    [optimism.id]: http(),
    [base.id]: http(),
  },
});

// Export components and configuration
export { RainbowKitProvider, darkTheme, ConnectButton, chains };
