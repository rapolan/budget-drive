import React from 'react';

interface AuthPageShellProps {
  children: React.ReactNode;
  maxWidth?: string;
  /** Rendered below the glass card, inside the same centered column (e.g. a "finish later" link). */
  footer?: React.ReactNode;
  /** Short headline for the left branded panel (desktop only). When omitted, the panel is skipped and the card is centered alone (e.g. the onboarding wizard, which already has its own in-card heading/stepper). */
  headline?: string;
  /** 2-3 short benefit lines under the headline. */
  benefits?: string[];
}

/**
 * Shared page background + glass card for the signup/login/onboarding
 * surface - the one part of the app with no AppLayout chrome around it.
 *
 * Two-column on desktop when `headline` is given (Signup/Login: a
 * branded gradient panel on the left, the form card on the right) -
 * single centered card otherwise (the wizard, which has its own in-card
 * header). Collapses to a single centered card on mobile either way.
 *
 * The background is a full, clearly-colorful gradient (tenant primary +
 * two complementary hues) with blurred color blobs behind the content -
 * a first attempt at this used a near-invisible 8-12% tint, which a real
 * person testing it in a browser correctly called "a flat white page";
 * this is the corrected version, verified by eye (screenshots), not just
 * by an automated contrast check (which a too-subtle background can
 * still pass while still looking wrong).
 *
 * The card itself (bg-surface/50 backdrop-blur-2xl, a light 1px border,
 * an inner top highlight, a soft shadow) is still built only from
 * existing semantic tokens (bg-surface, border-edge-glass, the tenant's
 * own --color-primary-rgb) - no new tokens added to index.css/tailwind
 * config, per the explicit constraint.
 */
export const AuthPageShell: React.FC<AuthPageShellProps> = ({
  children,
  maxWidth = 'max-w-md',
  footer,
  headline,
  benefits,
}) => {
  const card = (
    <div className="w-full">
      <div
        className="relative rounded-3xl bg-surface/50 backdrop-blur-2xl shadow-[0_8px_60px_-12px_rgba(0,0,0,0.35)] border border-white/30 dark:border-white/10 p-8 overflow-hidden"
      >
        {/* Inner top highlight - a thin light gradient hugging the top
            edge, the detail that reads as "glass" rather than just
            "translucent panel" (catches light like a real glossy surface). */}
        <div
          className="pointer-events-none absolute inset-x-0 top-0 h-24 rounded-t-3xl"
          style={{ background: 'linear-gradient(to bottom, rgb(255 255 255 / 0.25), transparent)' }}
          aria-hidden="true"
        />
        <div className="relative">{children}</div>
      </div>
      {footer}
    </div>
  );

  return (
    <div className="min-h-screen relative overflow-hidden bg-appbg">
      {/* Full-bleed colorful gradient wash, tenant-brand-driven. */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'linear-gradient(135deg, ' +
            'rgb(var(--color-primary-rgb) / 0.55) 0%, ' +
            'rgb(var(--color-primary-rgb) / 0.25) 35%, ' +
            'rgb(var(--bg-base-rgb)) 70%)',
        }}
        aria-hidden="true"
      />
      {/* Large blurred color blobs behind everything - the actual "glow"
          a glass surface needs something vivid to sit on top of. */}
      <div
        className="pointer-events-none absolute -top-32 -left-32 w-[32rem] h-[32rem] rounded-full blur-3xl opacity-40 dark:opacity-50"
        style={{ background: 'rgb(var(--color-primary-rgb))' }}
        aria-hidden="true"
      />
      <div
        className="pointer-events-none absolute top-1/3 -right-40 w-[36rem] h-[36rem] rounded-full blur-3xl opacity-30 dark:opacity-40"
        style={{ background: 'rgb(var(--color-primary-rgb) / 0.8)', filter: 'hue-rotate(35deg)' }}
        aria-hidden="true"
      />
      <div
        className="pointer-events-none absolute -bottom-40 left-1/4 w-[28rem] h-[28rem] rounded-full blur-3xl opacity-30 dark:opacity-40"
        style={{ background: 'rgb(var(--color-primary-rgb))', filter: 'hue-rotate(-30deg)' }}
        aria-hidden="true"
      />

      <div className="relative min-h-screen flex items-center justify-center p-4 py-10">
        {headline ? (
          <div className="w-full max-w-5xl grid lg:grid-cols-2 gap-8 lg:gap-12 items-center">
            {/* Left branded panel - desktop only. Styled as a heading but
                deliberately a <p>, not an <h1> - the card's own <h1>
                (inside children) is this page's one real heading; a
                second <h1> here would be both an a11y issue (two
                top-level headings) and ambiguous for anything that
                queries "the page heading" by role. Still readable by
                assistive tech, just not announced as a heading. */}
            <div className="hidden lg:flex flex-col justify-center px-4">
              <p className="text-4xl font-bold tracking-tight text-tx-primary leading-tight">
                {headline}
              </p>
              {benefits && benefits.length > 0 && (
                <ul className="mt-6 space-y-3">
                  {benefits.map((b) => (
                    <li key={b} className="flex items-start gap-3 text-tx-secondary">
                      <span
                        className="mt-1.5 h-1.5 w-1.5 rounded-full flex-shrink-0"
                        style={{ background: 'rgb(var(--color-primary-rgb))' }}
                      />
                      <span className="text-base">{b}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div className={`w-full ${maxWidth} mx-auto lg:mx-0`}>{card}</div>
          </div>
        ) : (
          <div className={`w-full ${maxWidth}`}>{card}</div>
        )}
      </div>
    </div>
  );
};
