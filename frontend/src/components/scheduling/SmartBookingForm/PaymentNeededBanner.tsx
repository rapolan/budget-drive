import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, Handshake } from 'lucide-react';
import { Student } from '@/types';
import { enrollmentsApi } from '@/api';
import { Button } from '@/components/common';
import { PaymentModal } from '@/components/payments/PaymentModal';

interface PaymentNeededBannerProps {
  student: Student;
  lessonCost: number;
}

/**
 * "Payment needed" banner (payment-before-booking) - shown in
 * ConfirmStep BEFORE submit, via the same read-only
 * GET /enrollments/:id/booking-eligibility the server's own create-path
 * check is built on (never a second, divergent definition of "eligible").
 * Omitted entirely (not rendered) when: the tenant setting is off (the
 * caller never mounts this component in that case - see ConfirmStep.tsx),
 * there's no active enrollment to check, the enrollment has enough
 * credit, or this is a reschedule (ConfirmStep never renders this for
 * `isReschedule` - skipping on reschedule is enforced by the CALLER not
 * mounting this component, not by any logic inside it).
 *
 * "Book lesson" itself stays enabled regardless of this banner's state -
 * the real enforcement is server-side (409 PAYMENT_REQUIRED), this is
 * purely an advance warning so the user isn't surprised by a submit-time
 * rejection. No dollar amounts are shown anywhere in this banner, by
 * design (matching the server's own error message, which also never
 * states a balance).
 */
export const PaymentNeededBanner: React.FC<PaymentNeededBannerProps> = ({ student, lessonCost }) => {
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const enrollmentId = student.activeEnrollment?.id;

  const { data, refetch } = useQuery({
    queryKey: ['booking-eligibility', enrollmentId, lessonCost],
    queryFn: () => enrollmentsApi.getBookingEligibility(enrollmentId!, lessonCost),
    enabled: Boolean(enrollmentId) && lessonCost > 0,
  });

  if (!enrollmentId) return null;

  const eligibility = data?.data;
  if (!eligibility) return null;

  if (eligibility.hasPaymentArrangement) {
    return (
      <div className="flex items-start gap-2 p-3 bg-status-info-bg border border-status-info-border rounded-lg">
        <Handshake className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" />
        <div className="text-sm text-primary">
          Payment arrangement on file. No payment is needed to book.
        </div>
      </div>
    );
  }

  if (eligibility.allowed) return null;

  return (
    <>
      <div className="flex items-start gap-3 p-4 bg-status-warning-bg border border-status-warning-border rounded-lg">
        <AlertTriangle className="h-5 w-5 text-status-warning-text mt-0.5 flex-shrink-0" />
        <div className="flex-1">
          <h4 className="text-sm font-semibold text-status-warning-text">Payment needed</h4>
          <p className="mt-1 text-sm text-status-warning-text">
            Record a payment to book this lesson.
          </p>
        </div>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={() => setIsPaymentModalOpen(true)}
          className="flex-shrink-0"
        >
          Record payment
        </Button>
      </div>

      <PaymentModal
        isOpen={isPaymentModalOpen}
        onClose={() => {
          setIsPaymentModalOpen(false);
          // Re-run the check whether the payment was actually saved or
          // the modal was just cancelled - cheap, idempotent, and the
          // only way to clear the banner without PaymentModal needing its
          // own "did it save" signal threaded back out.
          refetch();
        }}
        student={student}
      />
    </>
  );
};
