/**
 * Treasury Dashboard Page
 * BDP Phase 1: Display satoshi-level transaction fees (Craig Wright aligned)
 */

import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { treasuryApi } from '../api';
import { useTenant } from '@/contexts/TenantContext';
import { Coins, TrendingUp, Activity, Check, Clock, AlertCircle } from 'lucide-react';

const BSV_PRICE = 47; // Current BSV price in USD

const Treasury: React.FC = () => {
  const { settings } = useTenant();
  const showBlockchainDetails = settings?.enableBlockchainPayments || false;

  // Fetch treasury statistics
  const { data: stats, isLoading, error } = useQuery({
    queryKey: ['treasury', 'statistics'],
    queryFn: () => treasuryApi.getStatistics(),
  });

  // Fetch recent transactions
  const { data: transactions } = useQuery({
    queryKey: ['treasury', 'transactions'],
    queryFn: () => treasuryApi.getRecentTransactions(50),
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
        Error loading treasury data. Please try again.
      </div>
    );
  }

  const balance = stats?.data?.balance;
  const statistics = stats?.data?.statistics;

  // Calculate satoshi totals
  const totalSatoshis = transactions?.data?.reduce((sum, tx) => sum + (tx.bsv_satoshis || 0), 0) || 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Treasury Dashboard</h1>
          {showBlockchainDetails && (
            <p className="text-gray-600 mt-1">
              Satoshi-level transaction fees • Craig Wright aligned
            </p>
          )}
          {!showBlockchainDetails && (
            <p className="text-gray-600 mt-1">
              Platform fee collection and financial overview
            </p>
          )}
        </div>
        {showBlockchainDetails && (
          <div className="flex items-center space-x-2 bg-green-50 px-4 py-2 rounded-lg border border-green-200">
            <Check className="h-5 w-5 text-green-600" />
            <span className="text-sm font-medium text-green-900">Wright-Aligned</span>
          </div>
        )}
      </div>

      {/* Wright Philosophy Banner */}
      {showBlockchainDetails && (
        <div className="bg-blue-50 border-l-4 border-blue-500 p-4 rounded">
          <div className="flex">
            <div className="flex-shrink-0">
              <Coins className="h-5 w-5 text-blue-500" />
            </div>
            <div className="ml-3">
              <h3 className="text-sm font-medium text-blue-900">Cost-Based Satoshi Fees</h3>
              <p className="mt-2 text-sm text-blue-700">
                <strong>NOT percentage extraction.</strong> Each transaction pays a fixed satoshi fee
                based on computational cost (5 sats = ~$0.000002). Providers get 99.999996% of transaction
                value. Scales profitably at volume: 100M bookings = 5 BSV = ~$235 USD passive income.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {/* Current Balance */}
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Treasury Balance</p>
              {showBlockchainDetails ? (
                <>
                  <p className="text-2xl font-bold text-gray-900 mt-2">
                    {balance?.bsv_wallet_balance_satoshis || 0} sats
                  </p>
                  <p className="text-xs text-gray-500 mt-1">
                    ≈ {treasuryApi.formatCurrency(treasuryApi.satoshisToUSD(balance?.bsv_wallet_balance_satoshis || 0, BSV_PRICE))}
                  </p>
                </>
              ) : (
                <>
                  <p className="text-2xl font-bold text-gray-900 mt-2">
                    {treasuryApi.formatCurrency(treasuryApi.satoshisToUSD(balance?.bsv_wallet_balance_satoshis || 0, BSV_PRICE))}
                  </p>
                  <p className="text-xs text-gray-500 mt-1">
                    Total collected fees
                  </p>
                </>
              )}
            </div>
            <div className="h-12 w-12 bg-blue-100 rounded-full flex items-center justify-center">
              <Coins className="h-6 w-6 text-blue-600" />
            </div>
          </div>
        </div>

        {/* Transaction Count */}
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Total Transactions</p>
              <p className="text-2xl font-bold text-gray-900 mt-2">
                {balance?.transaction_count || 0}
              </p>
              <p className="text-xs text-gray-500 mt-1">
                {showBlockchainDetails ? `${totalSatoshis} sats collected` : 'Fee transactions recorded'}
              </p>
            </div>
            <div className="h-12 w-12 bg-green-100 rounded-full flex items-center justify-center">
              <Activity className="h-6 w-6 text-green-600" />
            </div>
          </div>
        </div>

        {/* Total Gross Volume */}
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Gross Volume</p>
              <p className="text-2xl font-bold text-gray-900 mt-2">
                ${statistics?.total_gross?.toLocaleString() || '0'}
              </p>
              <p className="text-xs text-gray-500 mt-1">
                Total transaction volume
              </p>
            </div>
            <div className="h-12 w-12 bg-purple-100 rounded-full flex items-center justify-center">
              <TrendingUp className="h-6 w-6 text-purple-600" />
            </div>
          </div>
        </div>

        {/* Provider Share */}
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Provider Share</p>
              <p className="text-2xl font-bold text-gray-900 mt-2">99.999996%</p>
              <p className="text-xs text-gray-500 mt-1">
                ${statistics?.total_provider?.toLocaleString() || '0'}
              </p>
            </div>
            <div className="h-12 w-12 bg-yellow-100 rounded-full flex items-center justify-center">
              <Check className="h-6 w-6 text-yellow-600" />
            </div>
          </div>
        </div>
      </div>

      {/* Recent Transactions */}
      <div className="overflow-hidden rounded-lg bg-white shadow">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Date
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  {showBlockchainDetails ? 'BDP Action' : 'Action'}
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Source
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Gross Amount
                </th>
                {showBlockchainDetails && (
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Fee (Sats)
                  </th>
                )}
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  {showBlockchainDetails ? 'Fee (USD)' : 'Fee'}
                </th>
                <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Status
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {transactions?.data && transactions.data.length > 0 ? (
                transactions.data.map((tx) => (
                  <tr key={tx.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {new Date(tx.created_at).toLocaleDateString()}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                        {tx.bsv_action}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                      {tx.source_type.replace('_', ' ')}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-right text-gray-900">
                      ${tx.gross_amount.toFixed(2)}
                    </td>
                    {showBlockchainDetails && (
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-right font-mono text-blue-600">
                        {tx.bsv_satoshis} sats
                      </td>
                    )}
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-right text-gray-600">
                      {treasuryApi.formatCurrency(treasuryApi.satoshisToUSD(tx.bsv_satoshis, BSV_PRICE))}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-center">
                      {tx.bsv_status === 'pending' && (
                        <span className="inline-flex items-center text-yellow-600">
                          <Clock className="h-4 w-4" />
                        </span>
                      )}
                      {tx.bsv_status === 'confirmed' && (
                        <span className="inline-flex items-center text-green-600">
                          <Check className="h-4 w-4" />
                        </span>
                      )}
                      {tx.bsv_status === 'failed' && (
                        <span className="inline-flex items-center text-red-600">
                          <AlertCircle className="h-4 w-4" />
                        </span>
                      )}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={showBlockchainDetails ? 7 : 6} className="px-6 py-12 text-center text-gray-500">
                    No transactions yet. Treasury fees will appear here when lessons are booked.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Wright Alignment Checklist */}
      {showBlockchainDetails && (
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Craig Wright Philosophy Alignment</h3>
          <div className="space-y-3">
            <div className="flex items-start">
              <Check className="h-5 w-5 text-green-600 mr-3 flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-medium text-gray-900">Cost-Based Fees</p>
                <p className="text-sm text-gray-600">5 sats per booking reflects computational cost, NOT arbitrary percentage</p>
              </div>
            </div>
            <div className="flex items-start">
              <Check className="h-5 w-5 text-green-600 mr-3 flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-medium text-gray-900">Fixed Fees</p>
                <p className="text-sm text-gray-600">NOT percentage-based extraction that punishes higher-value transactions</p>
              </div>
            </div>
            <div className="flex items-start">
              <Check className="h-5 w-5 text-green-600 mr-3 flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-medium text-gray-900">Scales at Volume</p>
                <p className="text-sm text-gray-600">Profitable at millions of transactions, not through rent-seeking</p>
              </div>
            </div>
            <div className="flex items-start">
              <Check className="h-5 w-5 text-green-600 mr-3 flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-medium text-gray-900">No Rent-Seeking</p>
                <p className="text-sm text-gray-600">Honest money principle - providers keep 99.999996% of value</p>
              </div>
            </div>
            <div className="flex items-start">
              <Check className="h-5 w-5 text-green-600 mr-3 flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-medium text-gray-900">Satoshi-Denominated</p>
                <p className="text-sm text-gray-600">Bitcoin-native pricing in satoshis, not fiat percentages</p>
              </div>
            </div>
            <div className="flex items-start">
              <Check className="h-5 w-5 text-green-600 mr-3 flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-medium text-gray-900">Transparent</p>
                <p className="text-sm text-gray-600">All fees documented and logged on-chain (Phase 3)</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* BSV Blockchain Info */}
      {showBlockchainDetails && (
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-2">Blockchain Integration Status</h3>
          <p className="text-sm text-gray-600 mb-4">
            <strong>Phase 1 (Current):</strong> Treasury fees recorded in PostgreSQL database. BSV blockchain disabled for pilot testing.
          </p>
          <p className="text-sm text-gray-600">
            <strong>Phase 3 (Q1 2026):</strong> All treasury transactions will be written to BSV blockchain for permanent,
            immutable record-keeping. Current pending status will become confirmed on-chain.
          </p>
        </div>
      )}
    </div>
  );
};

export default Treasury;
