import { Fragment, ReactNode, useState, useEffect, useCallback } from 'react';
import { getBlockExplorerTxUrl } from '../utils/chains';
import { Transition } from '@headlessui/react';
import {
  CheckCircleIcon,
  XCircleIcon,
  ClockIcon,
} from '@heroicons/react/24/outline';
import { XMarkIcon } from '@heroicons/react/20/solid';
import { NotificationContext } from './notification-context';

interface Notification {
  id: string;
  type: 'success' | 'error' | 'warning' | 'info';
  title: string;
  message: string;
  timestamp: number;
  stage?: 'initiated' | 'submitted' | 'confirmed';
  txHash?: string;
  chainId?: number | string;
  autoHide?: boolean;
}

export function NotificationProvider({ children }: { children: ReactNode }) {
  const [notifications, setNotifications] = useState<Notification[]>([]);

  const showNotification = useCallback(
    (notification: {
      type: 'success' | 'error' | 'warning' | 'info';
      title: string;
      message: string;
      stage?: 'initiated' | 'submitted' | 'confirmed';
      txHash?: string;
      chainId?: number | string;
      autoHide?: boolean;
    }) => {
      const timestamp = Date.now();
      const id = `${timestamp}-${Math.random().toString(36).slice(2, 7)}`;

      setNotifications((prev) => {
        // Remove previous notifications for the same transaction
        const filtered = prev.filter((n) => {
          if (notification.stage) {
            const currentTxHash = notification.txHash || '';
            const prevTxHash = n.txHash || '';

            const isRelatedTx =
              currentTxHash === prevTxHash ||
              (currentTxHash.startsWith('pending-') &&
                !prevTxHash.startsWith('pending-')) ||
              (!currentTxHash.startsWith('pending-') &&
                prevTxHash.startsWith('pending-'));

            if (isRelatedTx) return false;
            if (n.stage) return false;
          }

          return !notification.txHash || n.txHash !== notification.txHash;
        });

        return [...filtered, { ...notification, id, timestamp }];
      });
    },
    []
  );

  // Remove notifications after 10 seconds if autoHide is true
  useEffect(() => {
    const timer = setInterval(() => {
      setNotifications((prev) => {
        const now = Date.now();
        return prev.filter(
          (notification) =>
            notification.autoHide === false ||
            now - notification.timestamp < 10000
        );
      });
    }, 100);

    return () => clearInterval(timer);
  }, []);

  const getIcon = (notification: Notification) => {
    if (
      notification.stage === 'initiated' ||
      notification.stage === 'submitted'
    ) {
      return (
        <ClockIcon
          className="h-6 w-6 text-yellow-400 animate-spin"
          aria-hidden="true"
        />
      );
    }

    switch (notification.type) {
      case 'success':
        return (
          <CheckCircleIcon
            className="h-6 w-6 text-[#00ff00]"
            aria-hidden="true"
          />
        );
      case 'error':
        return (
          <XCircleIcon className="h-6 w-6 text-red-400" aria-hidden="true" />
        );
      case 'warning':
        return (
          <XCircleIcon className="h-6 w-6 text-yellow-400" aria-hidden="true" />
        );
      default:
        return (
          <CheckCircleIcon
            className="h-6 w-6 text-blue-400"
            aria-hidden="true"
          />
        );
    }
  };

  const renderTransactionHash = (notification: Notification) => {
    if (!notification.txHash || !notification.txHash.startsWith('0x')) {
      return null;
    }

    const shortHash = `${notification.txHash.slice(0, 6)}...${notification.txHash.slice(-4)}`;
    const blockExplorerUrl = notification.chainId 
      ? getBlockExplorerTxUrl(notification.chainId, notification.txHash)
      : null;

    return (
      <p className="mt-1 text-sm text-gray-500">
        Transaction:{' '}
        {blockExplorerUrl ? (
          <a
            href={blockExplorerUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[#00ff00] hover:text-[#33ff33] transition-colors duration-200"
          >
            {shortHash}
          </a>
        ) : (
          <span className="text-[#00ff00]">{shortHash}</span>
        )}
      </p>
    );
  };

  return (
    <NotificationContext.Provider value={{ showNotification }}>
      {children}
      <div
        aria-live="assertive"
        className="pointer-events-none fixed inset-0 flex items-end px-4 py-6 sm:items-start sm:p-6 mt-[72px]"
      >
        <div className="flex w-full flex-col items-center space-y-4 sm:items-end">
          {notifications.map((notification) => (
            <Transition
              key={notification.id}
              show={true}
              as={Fragment}
              enter="transform ease-out duration-300 transition"
              enterFrom="translate-y-2 opacity-0 sm:translate-y-0 sm:translate-x-2"
              enterTo="translate-y-0 opacity-100 sm:translate-x-0"
              leave="transition ease-in duration-100"
              leaveFrom="opacity-100"
              leaveTo="opacity-0"
            >
              <div className="pointer-events-auto w-full max-w-sm overflow-hidden rounded-lg bg-[#0a0a0a] shadow-lg ring-1 ring-gray-800">
                <div className="p-4">
                  <div className="flex items-start">
                    <div className="flex-shrink-0">{getIcon(notification)}</div>
                    <div className="ml-3 w-0 flex-1 pt-0.5">
                      <p className="text-sm font-medium text-gray-100">
                        {notification.title}
                      </p>
                      <p className="mt-1 text-sm text-gray-400">
                        {notification.message}
                      </p>
                      {renderTransactionHash(notification)}
                    </div>
                    <div className="ml-4 flex flex-shrink-0">
                      <button
                        type="button"
                        className="inline-flex rounded-md bg-[#0a0a0a] text-gray-500 hover:text-gray-400 focus:outline-none focus:ring-2 focus:ring-[#00ff00] focus:ring-offset-2 focus:ring-offset-[#0a0a0a]"
                        onClick={() => {
                          setNotifications((prev) =>
                            prev.filter((n) => n.id !== notification.id)
                          );
                        }}
                      >
                        <span className="sr-only">Close</span>
                        <XMarkIcon className="h-5 w-5" aria-hidden="true" />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </Transition>
          ))}
        </div>
      </div>
    </NotificationContext.Provider>
  );
}
