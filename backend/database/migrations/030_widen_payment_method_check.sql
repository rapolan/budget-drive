-- Additive widening of payments_payment_method_check: adds 'venmo' and
-- 'zelle' as genuinely new, real payment_method values (the Add Payment
-- modal's method-chip redesign needs to record what actually happened -
-- a Venmo transfer is not a PayPal transfer, even though both are P2P
-- apps - rather than forcing either one into an existing enum value that
-- would misdescribe the real payment record). Every existing value
-- (bsv, mnee, stripe_card, paypal, cash, check, debit, credit) is kept
-- completely unchanged - this only ADDS to the allowed set, so no
-- existing row or code path is affected.
ALTER TABLE public.payments DROP CONSTRAINT payments_payment_method_check;

ALTER TABLE public.payments
  ADD CONSTRAINT payments_payment_method_check
  CHECK (payment_method = ANY (ARRAY[
    'bsv'::text, 'mnee'::text, 'stripe_card'::text, 'paypal'::text,
    'cash'::text, 'check'::text, 'debit'::text, 'credit'::text,
    'venmo'::text, 'zelle'::text
  ]));
