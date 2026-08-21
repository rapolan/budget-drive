import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// Item 5 (BSV forward-compatibility): an enrollment's completion is a
// point-in-time attestation - the natural unit for future on-chain
// anchoring per docs/MISSION.md's decision framework. completion_hash is
// computed and stored by ordinary application code (Node's built-in
// crypto); ledger_txid stays permanently null this session. All future
// anchoring must route through the LedgerService seam - business logic,
// including enrollmentService itself, must never import walletService or
// treasuryService directly (mirrors CLAUDE.md's BSV/Ledger rule and the
// existing fee_flags structural-isolation test's technique: static source
// scan, not runtime behavior).
describe('Constraint (Item 5) - enrollment completion is BSV-forward-compatible without any blockchain code', () => {
  const enrollmentServiceSource = readFileSync(
    resolve(__dirname, '../services/enrollmentService.ts'),
    'utf8'
  );

  it('enrollmentService never imports walletService, treasuryService, or the Ledger seam', () => {
    expect(enrollmentServiceSource).not.toMatch(/from ['"].*walletService['"]/);
    expect(enrollmentServiceSource).not.toMatch(/from ['"].*treasuryService['"]/);
    expect(enrollmentServiceSource).not.toMatch(/from ['"].*\/Ledger['"]/);
    expect(enrollmentServiceSource).not.toMatch(/require\(['"].*(?:walletService|treasuryService|\/Ledger)['"]\)/);
  });

  it('enrollmentService never writes ledger_txid - it stays null until a future session wires real anchoring', () => {
    expect(enrollmentServiceSource).not.toMatch(/ledger_txid\s*=/);
    // The word may appear in comments explaining the deferral - that's
    // fine; only an assignment (a write) is disallowed.
  });

  it('markEnrollmentCompleted computes completion_hash using only Node\'s built-in crypto module', () => {
    expect(enrollmentServiceSource).toMatch(/^import crypto from ['"]crypto['"];?$/m);
    expect(enrollmentServiceSource).toMatch(/completion_hash\s*=\s*\$/); // written via a parameterized UPDATE
  });
});
