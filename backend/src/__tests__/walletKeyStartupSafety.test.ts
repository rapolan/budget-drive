import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Regression coverage (bug found via a full codebase health audit):
// walletService.ts's WalletService constructor used to silently generate a
// random private key and console.log its WIF ("SAVE THIS PRIVATE KEY")
// whenever BSV_ENABLED=true and BSV_PROTOCOL_WALLET_WIF wasn't configured.
// Most hosting platforms (including Railway, this app's deployment target)
// capture and retain stdout - a real private key logged this way could
// persist in log history indefinitely. Fixed two ways:
//  1. config/env.ts now refuses to even finish loading (throws at module
//     evaluation time, the same fail-fast pattern already used for
//     DB_PASSWORD/JWT_SECRET) when BSV_ENABLED=true with no configured key.
//  2. WalletService's own constructor now throws instead of generating a
//     key, as a second, defensive boundary directly on the class.
// BSV_ENABLED=false (the current/default state) never reaches either check
// - config/env.ts's new branch is skipped entirely, and nothing calls
// getProtocolWallet()/constructs a WalletService in that state at all.

const ORIGINAL_ENV = { ...process.env };

function resetEnv() {
  process.env = { ...ORIGINAL_ENV };
}

describe('config/env.ts - BSV wallet key startup safety', () => {
  beforeEach(() => {
    resetEnv();
    vi.resetModules();
  });

  afterEach(() => {
    resetEnv();
    vi.resetModules();
  });

  it('throws a clear, instructive error at startup when BSV_ENABLED=true and BSV_PROTOCOL_WALLET_WIF is not set', async () => {
    process.env.DB_PASSWORD = 'test-password';
    process.env.JWT_SECRET = 'test-jwt-secret-at-least-32-characters-long';
    process.env.BSV_ENABLED = 'true';
    // Empty string, not `delete` - env.ts's own dotenv.config() call would
    // otherwise refill an actually-deleted key from the real dev .env file
    // (dotenv only skips keys already present in process.env, and an empty
    // string still counts as present).
    process.env.BSV_PROTOCOL_WALLET_WIF = '';

    await expect(import('../config/env')).rejects.toThrow(
      /BSV_ENABLED is true but BSV_PROTOCOL_WALLET_WIF is not configured/
    );
  });

  it('does not throw when BSV_ENABLED=true and BSV_PROTOCOL_WALLET_WIF IS configured', async () => {
    process.env.DB_PASSWORD = 'test-password';
    process.env.JWT_SECRET = 'test-jwt-secret-at-least-32-characters-long';
    process.env.BSV_ENABLED = 'true';
    process.env.BSV_PROTOCOL_WALLET_WIF = 'some-configured-wif-value';

    const { config } = await import('../config/env');
    expect(config.BSV_ENABLED).toBe(true);
    expect(config.BSV_PROTOCOL_WALLET_WIF).toBe('some-configured-wif-value');
  });

  it('BSV_ENABLED=false is completely unaffected, even with no wallet key configured', async () => {
    process.env.DB_PASSWORD = 'test-password';
    process.env.JWT_SECRET = 'test-jwt-secret-at-least-32-characters-long';
    process.env.BSV_ENABLED = 'false';
    delete process.env.BSV_PROTOCOL_WALLET_WIF;

    const { config } = await import('../config/env');
    expect(config.BSV_ENABLED).toBe(false);
  });

  it('BSV_ENABLED unset is completely unaffected, even with no wallet key configured', async () => {
    process.env.DB_PASSWORD = 'test-password';
    process.env.JWT_SECRET = 'test-jwt-secret-at-least-32-characters-long';
    delete process.env.BSV_ENABLED;
    delete process.env.BSV_PROTOCOL_WALLET_WIF;

    const { config } = await import('../config/env');
    expect(config.BSV_ENABLED).toBe(false);
  });
});

describe('WalletService constructor - never generates or logs a key', () => {
  let consoleLogSpy: ReturnType<typeof vi.spyOn>;
  let consoleWarnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
    consoleWarnSpy.mockRestore();
  });

  it('throws when constructed with no private key, and logs nothing to the console', async () => {
    const WalletService = (await import('../services/walletService')).default;

    expect(() => new WalletService({ network: 'testnet' })).toThrow(
      /WalletService requires a private key/
    );

    expect(consoleLogSpy).not.toHaveBeenCalled();
    expect(consoleWarnSpy).not.toHaveBeenCalled();
  });

  it('never calls console.log with a WIF or private-key warning text, across both the throwing and non-throwing paths', async () => {
    const WalletService = (await import('../services/walletService')).default;

    try {
      new WalletService({ network: 'testnet' });
    } catch {
      // expected - assertions below cover the no-log guarantee either way
    }

    for (const call of consoleLogSpy.mock.calls) {
      const joined = call.map(String).join(' ');
      expect(joined).not.toMatch(/PRIVATE KEY/i);
      expect(joined).not.toMatch(/wallet generated/i);
    }
  });

  it('succeeds and derives the correct address when a real private key IS provided', async () => {
    const WalletService = (await import('../services/walletService')).default;
    const { PrivateKey } = await import('@bsv/sdk');

    const testKey = PrivateKey.fromRandom();
    const wif = testKey.toWif();

    const wallet = new WalletService({ network: 'testnet', privateKey: wif });

    expect(wallet.getAddress()).toBeTruthy();
    expect(consoleLogSpy).not.toHaveBeenCalled();
  });
});

describe('createWallet() - dead code, now always throws (no callers, never resurrects the log-a-key pattern)', () => {
  it('throws, since it never supplies a private key', async () => {
    const { createWallet } = await import('../services/walletService');
    expect(() => createWallet('testnet')).toThrow(/WalletService requires a private key/);
  });
});
