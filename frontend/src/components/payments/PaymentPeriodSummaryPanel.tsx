import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { DollarSign, Undo2, TrendingUp, CreditCard, Wallet } from 'lucide-react';
import { paymentsApi } from '@/api';
import { DateRangeFilter } from '@/components/common';
import type { DateRangeValue } from '@/components/common';
import { useTenant } from '@/contexts/TenantContext';
import { formatMoney } from '@/utils/moneyFormat';

interface PaymentPeriodSummaryPanelProps {
  range: DateRangeValue;
  onRangeChange: (range: DateRangeValue) => void;
}

const METHOD_LABELS: Record<string, string> = {
  cash: 'Cash',
  credit: 'Card',
  debit: 'Card (debit)',
  stripe_card: 'Card (Stripe)',
  check: 'Check',
  paypal: 'PayPal',
  venmo: 'Venmo',
  zelle: 'Zelle',
  bsv: 'BSV',
  mnee: 'MNEE',
};

/**
 * Period summary - chips (Today/This Week/This Month/Custom, reusing the
 * existing DateRangeFilter, which is already tenant-timezone-aware - never
 * the browser clock) plus Collected/Refunded/Net/Outstanding/Paid-not-yet-
 * scheduled cards and a "Collected by method" bar breakdown for the
 * selected period.
 *
 * DateRangeFilter's "All Time" preset has no bounded start/end, but the
 * period-summary endpoint requires both - "All Time" (or a custom range
 * with one/both dates still empty) falls back to "This Month" for the
 * actual API call, while the chip itself still shows whatever the caller
 * selected (Payments.tsx owns `range` as shared state with the rest of
 * the page, so this panel doesn't silently overwrite the caller's own
 * selection, just substitutes a sensible default for its own query).
 */
export const PaymentPeriodSummaryPanel: React.FC<PaymentPeriodSummaryPanelProps> = ({
  range,
  onRangeChange,
}) => {
  const { tenantNow } = useTenant();

  const effectiveStart = range.start || tenantNow?.monthBoundaries.start || '';
  const effectiveEnd = range.end || tenantNow?.monthBoundaries.end || '';

  const { data, isLoading } = useQuery({
    queryKey: ['payments', 'period-summary', effectiveStart, effectiveEnd],
    queryFn: () => paymentsApi.getPeriodSummary(effectiveStart, effectiveEnd),
    enabled: !!effectiveStart && !!effectiveEnd,
  });

  const summary = data?.data;

  return (
    <div className="space-y-4">
      {tenantNow && (
        <DateRangeFilter
          value={range}
          onChange={onRangeChange}
          tenantToday={tenantNow.today}
          tenantWeekStart={tenantNow.weekStart}
          tenantWeekEnd={tenantNow.weekEnd}
          tenantMonthStart={tenantNow.monthBoundaries.start}
          tenantMonthEnd={tenantNow.monthBoundaries.end}
        />
      )}

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <div className="bg-surface rounded-xl shadow-sm border border-edge p-4">
          <div className="p-2 bg-status-success-bg rounded-lg w-fit">
            <DollarSign className="h-5 w-5 text-status-success-text" />
          </div>
          <div className="mt-3">
            <p className="text-2xl font-bold text-status-success-text">
              {isLoading ? '—' : formatMoney(summary?.collected.amount ?? 0)}
            </p>
            <p className="text-sm text-tx-muted">
              Collected {summary && `(${summary.collected.count})`}
            </p>
          </div>
        </div>

        <div className="bg-surface rounded-xl shadow-sm border border-edge p-4">
          <div className="p-2 bg-status-warning-bg rounded-lg w-fit">
            <Undo2 className="h-5 w-5 text-status-warning-text" />
          </div>
          <div className="mt-3">
            <p className="text-2xl font-bold text-status-warning-text">
              {isLoading ? '—' : formatMoney(summary?.refunded.amount ?? 0)}
            </p>
            <p className="text-sm text-tx-muted">
              Refunded {summary && `(${summary.refunded.count})`}
            </p>
          </div>
        </div>

        <div className="bg-surface rounded-xl shadow-sm border border-edge p-4">
          <div className="p-2 bg-status-info-bg rounded-lg w-fit">
            <TrendingUp className="h-5 w-5 text-primary" />
          </div>
          <div className="mt-3">
            <p className="text-2xl font-bold text-tx-primary">
              {isLoading ? '—' : formatMoney(summary?.net ?? 0)}
            </p>
            <p className="text-sm text-tx-muted">Net</p>
          </div>
        </div>

        <div className="bg-surface rounded-xl shadow-sm border border-edge p-4">
          <div className="p-2 bg-status-danger-bg rounded-lg w-fit">
            <CreditCard className="h-5 w-5 text-status-danger-text" />
          </div>
          <div className="mt-3">
            <p className="text-2xl font-bold text-status-danger-text">
              {isLoading ? '—' : formatMoney(summary?.outstanding ?? 0)}
            </p>
            <p className="text-sm text-tx-muted">Outstanding</p>
          </div>
        </div>

        <div className="bg-surface rounded-xl shadow-sm border border-edge p-4">
          <div className="p-2 bg-status-info-bg rounded-lg w-fit">
            <Wallet className="h-5 w-5 text-primary" />
          </div>
          <div className="mt-3">
            <p className="text-2xl font-bold text-tx-primary">
              {isLoading ? '—' : formatMoney(summary?.paidNotYetScheduled ?? 0)}
            </p>
            <p className="text-sm text-tx-muted">Paid, Not Yet Scheduled</p>
          </div>
        </div>
      </div>

      {/* Collected by method - simple proportional bars, period-scoped. */}
      {summary && summary.collectedByMethod.length > 0 && (
        <div className="bg-surface rounded-xl shadow-sm border border-edge p-4">
          <h3 className="text-sm font-semibold text-tx-primary mb-3">Collected by Method</h3>
          <div className="space-y-2">
            {summary.collectedByMethod.map((row) => {
              const maxAmount = Math.max(...summary.collectedByMethod.map((r) => r.amount), 1);
              const widthPercent = (row.amount / maxAmount) * 100;
              return (
                <div key={row.paymentMethod} className="flex items-center gap-3 text-sm">
                  <span className="w-28 flex-shrink-0 text-tx-secondary truncate">
                    {METHOD_LABELS[row.paymentMethod] || row.paymentMethod}
                  </span>
                  <div className="flex-1 h-5 bg-surface2 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-primary rounded-full transition-all"
                      style={{ width: `${widthPercent}%` }}
                    />
                  </div>
                  <span className="w-28 flex-shrink-0 text-right font-medium text-tx-primary">
                    {formatMoney(row.amount)} ({row.count})
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
