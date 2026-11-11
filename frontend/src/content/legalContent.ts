/**
 * Terms of Service and Privacy Policy content, kept here as plain data
 * so replacing it later is a one-file change - no markdown pipeline,
 * no new dependency (confirmed no markdown-rendering library is a
 * dependency of this app today).
 *
 * CURRENT_TERMS_VERSION is sent by the signup form as the termsVersion
 * it records acceptance against - bump this string whenever the content
 * below changes meaningfully, so a future audit of terms_acceptances
 * can tell which version a given signup actually saw and agreed to.
 */

export const CURRENT_TERMS_VERSION = '2026-11-09-draft';

export interface LegalSection {
  heading: string;
  body: string;
}

export const TERMS_CONTENT: LegalSection[] = [
  {
    heading: 'DRAFT — Placeholder Terms of Service',
    body:
      'This is placeholder content for development and early customers. It has not been reviewed by a lawyer and does not constitute a binding legal agreement. Replace this content with your actual Terms of Service before relying on it for any real legal purpose.',
  },
  {
    heading: 'Using this software',
    body:
      'By creating an account, you agree to use this software to operate your driving school in accordance with applicable law. You are responsible for the accuracy of the information you and your staff enter.',
  },
  {
    heading: 'Your data',
    body:
      'Your school\'s records belong to your school. We do not sell your data. Operational details on how your data is stored and handled are in the Privacy Policy.',
  },
  {
    heading: 'Account responsibility',
    body:
      'You are responsible for keeping your account credentials confidential and for all activity that occurs under your account.',
  },
];

export const PRIVACY_CONTENT: LegalSection[] = [
  {
    heading: 'DRAFT — Placeholder Privacy Policy',
    body:
      'This is placeholder content for development and early customers. It has not been reviewed by a lawyer and does not constitute a binding legal agreement or a statement of regulatory compliance. Replace this content with your actual Privacy Policy before relying on it for any real legal purpose.',
  },
  {
    heading: 'What we collect',
    body:
      'We collect the information you and your staff enter to operate your driving school: student, instructor, vehicle, lesson, and payment records, plus basic account information for the people who log in.',
  },
  {
    heading: 'How we use it',
    body:
      'Your data is used only to provide this software to your school. It is not sold or shared with third parties for marketing purposes.',
  },
  {
    heading: 'Data retention and deletion',
    body:
      'Your records are retained for as long as your account is active, or as required by applicable record-keeping law. Contact us if you need to discuss deletion of specific records.',
  },
];
