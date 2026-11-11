import React from 'react';
import { Link } from 'react-router-dom';
import { Car, ArrowLeft } from 'lucide-react';
import { TERMS_CONTENT } from '@/content/legalContent';

export const TermsPage: React.FC = () => {
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 py-12 px-4">
      <div className="w-full max-w-2xl mx-auto">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-primary rounded-2xl shadow-lg mb-4">
            <Car className="h-8 w-8 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-tx-primary">Terms of Service</h1>
        </div>

        <div className="bg-surface rounded-2xl shadow-xl p-8 space-y-6">
          {TERMS_CONTENT.map((section, index) => (
            <div key={index}>
              <h2 className="text-sm font-semibold text-tx-primary mb-1">{section.heading}</h2>
              <p className="text-sm text-tx-secondary leading-relaxed">{section.body}</p>
            </div>
          ))}
        </div>

        <div className="mt-6 text-center">
          <Link to="/signup" className="inline-flex items-center gap-1 text-sm text-primary hover:text-primary font-medium">
            <ArrowLeft className="h-4 w-4" />
            Back to signup
          </Link>
        </div>

        <p className="text-center text-sm text-tx-muted mt-8">Budget Drive Protocol</p>
      </div>
    </div>
  );
};

export default TermsPage;
