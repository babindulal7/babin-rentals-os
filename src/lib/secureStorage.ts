/**
 * Secure Auth Storage Adapter for Supabase.
 *
 * Security Mandate (PLAN.md §10, src/lib/supabase.ts:17-20):
 *   "Tokens must not sit in localStorage inside a native shell (Capacitor / Tauri);
 *    that path uses Keychain / Keystore / Stronghold instead."
 *
 * This adapter implements the Supabase SupportedStorage interface:
 *   - In Capacitor Android: Delegates to hardware Keystore / EncryptedSharedPreferences plugin.
 *   - In Tauri Desktop: Delegates to Tauri Stronghold plugin (AES-256-GCM vault).
 *   - In Browser / PWA: Uses standard window.localStorage (with in-memory fallback if restricted).
 *
 * CRITICAL: In native shells, plain unencrypted localStorage is STRICTLY REFUSED
 * to protect refresh tokens and session secrets from file-level inspection.
 */

export interface SupportedStorage {
  getItem(key: string): string | null | Promise<string | null>;
  setItem(key: string, value: string): void | Promise<void>;
  removeItem(key: string): void | Promise<void>;
}

export type PlatformType = 'capacitor' | 'tauri' | 'electron' | 'web';

/**
 * Purge any auth, token, or supabase session keys from window.localStorage.
 * In native and secure environments (or on secure adapter initialization),
 * sensitive session tokens must NEVER linger in plaintext localStorage.
 */
export function purgeRendererLocalStorageTokens(): string[] {
  if (typeof window === 'undefined' || !window.localStorage) return [];
  const purged: string[] = [];
  try {
    const keysToRemove: string[] = [];
    for (let i = 0; i < window.localStorage.length; i++) {
      const key = window.localStorage.key(i);
      if (key && (key.includes('auth') || key.includes('sb-') || key.includes('token'))) {
        keysToRemove.push(key);
      }
    }
    for (const key of keysToRemove) {
      window.localStorage.removeItem(key);
      purged.push(key);
    }
  } catch {
    // Storage restricted
  }
  return purged;
}

/** Allowed key regex pattern for secure token persistence. */
const ALLOWED_SECURE_KEY_REGEX = /^(sb-[a-zA-Z0-9_.-]+-(?:auth-token|token)|supabase\.auth\.[a-zA-Z0-9_.-]+|app\.[a-zA-Z0-9_.-]+|br\.[a-zA-Z0-9_.-]+)$/;

export function isAuthorizedSecureKey(key: string): boolean {
  if (typeof key !== 'string') return false;
  if (key.length === 0 || key.length > 256) return false;
  if (key.startsWith('__') || key.includes('..') || key.includes('/') || key.includes('\\')) {
    return false;
  }
  return ALLOWED_SECURE_KEY_REGEX.test(key);
}

/** Detect the current runtime environment. */
export function detectPlatform(): PlatformType {
  if (typeof window === 'undefined') return 'web';

  const win = window as unknown as {
    Capacitor?: {
      isNativePlatform?: () => boolean;
      getPlatform?: () => string;
    };
    __TAURI__?: unknown;
    __TAURI_INTERNALS__?: unknown;
    electronAPI?: {
      isElectron?: boolean;
    };
    electron?: {
      isElectron?: boolean;
    };
  };

  if (win.Capacitor?.isNativePlatform?.() || (win.Capacitor?.getPlatform && win.Capacitor.getPlatform() !== 'web')) {
    return 'capacitor';
  }

  if (win.__TAURI__ !== undefined || win.__TAURI_INTERNALS__ !== undefined) {
    return 'tauri';
  }

  if (win.electronAPI?.isElectron || win.electron?.isElectron) {
    return 'electron';
  }

  return 'web';
}

/** Web / PWA storage adapter backed by localStorage with memory fallback. */
export class WebLocalStorageAdapter implements SupportedStorage {
  // Failed writes must override readable but stale persistent values. A null
  // tombstone also prevents a failed removal from restoring a signed-out session.
  private pending = new Map<string, string | null>();

  getItem(key: string): string | null {
    if (this.pending.has(key)) return this.pending.get(key) ?? null;
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        return window.localStorage.getItem(key);
      }
    } catch {
      // Storage restricted / private mode
    }
    return null;
  }

  setItem(key: string, value: string): void {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.setItem(key, value);
        this.pending.delete(key);
        return;
      }
    } catch {
      // Storage quota exceeded or disabled
    }
    this.pending.set(key, value);
  }

  removeItem(key: string): void {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.removeItem(key);
        this.pending.delete(key);
        return;
      }
    } catch {
      // Ignore
    }
    this.pending.set(key, null);
  }
}

/**
 * Capacitor Android / iOS hardware Keystore / Keychain adapter.
 * Uses Capacitor SecureStoragePlugin or Android Keystore bridge.
 * Refuses unencrypted localStorage.
 */
export class CapacitorKeystoreAdapter implements SupportedStorage {
  // Failed writes must override readable but stale persistent values. A null
  // tombstone also prevents a failed removal from restoring a signed-out session.
  private pending = new Map<string, string | null>();

  constructor() {
    purgeRendererLocalStorageTokens();
  }

  private getPlugin(): {
    get: (opts: { key: string }) => Promise<{ value: string | null }>;
    set: (opts: { key: string; value: string }) => Promise<void>;
    remove: (opts: { key: string }) => Promise<void>;
  } | null {
    if (typeof window === 'undefined') return null;
    const win = window as unknown as {
      Capacitor?: {
        Plugins?: {
          SecureStoragePlugin?: {
            get: (opts: { key: string }) => Promise<{ value: string | null }>;
            set: (opts: { key: string; value: string }) => Promise<void>;
            remove: (opts: { key: string }) => Promise<void>;
          };
        };
      };
    };
    return win.Capacitor?.Plugins?.SecureStoragePlugin ?? null;
  }

  async getItem(key: string): Promise<string | null> {
    if (this.pending.has(key)) return this.pending.get(key) ?? null;
    const plugin = this.getPlugin();
    if (plugin) {
      try {
        const res = await plugin.get({ key });
        return res.value ?? null;
      } catch {
        return null;
      }
    }
    // Secure in-memory fallback in native shell when plugin is not linked yet;
    // NEVER reads unencrypted localStorage in native shell.
    return null;
  }

  async setItem(key: string, value: string): Promise<void> {
    const plugin = this.getPlugin();
    if (plugin) {
      try {
        await plugin.set({ key, value });
        this.pending.delete(key);
        return;
      } catch (err) {
        console.error('[CapacitorKeystoreAdapter] Failed to store in hardware keystore:', err);
      }
    }
    // Secure in-memory fallback
    this.pending.set(key, value);
  }

  async removeItem(key: string): Promise<void> {
    const plugin = this.getPlugin();
    if (plugin) {
      try {
        await plugin.remove({ key });
        this.pending.delete(key);
        return;
      } catch (err) {
        console.error('[CapacitorKeystoreAdapter] Failed to remove from hardware keystore:', err);
      }
    }
    this.pending.set(key, null);
  }
}

/**
 * Tauri Desktop Stronghold adapter.
 * Uses Tauri Stronghold AES-256-GCM encrypted vault plugin.
 * Refuses unencrypted localStorage.
 */
export class TauriStrongholdAdapter implements SupportedStorage {
  // Failed writes must override readable but stale persistent values. A null
  // tombstone also prevents a failed removal from restoring a signed-out session.
  private pending = new Map<string, string | null>();

  constructor() {
    purgeRendererLocalStorageTokens();
  }

  private getTauriInvoke(): ((cmd: string, args?: Record<string, unknown>) => Promise<unknown>) | null {
    if (typeof window === 'undefined') return null;
    const win = window as unknown as {
      __TAURI__?: {
        core?: {
          invoke: (cmd: string, args?: Record<string, unknown>) => Promise<unknown>;
        };
      };
      __TAURI_INTERNALS__?: {
        invoke: (cmd: string, args?: Record<string, unknown>) => Promise<unknown>;
      };
    };
    return win.__TAURI__?.core?.invoke ?? win.__TAURI_INTERNALS__?.invoke ?? null;
  }

  async getItem(key: string): Promise<string | null> {
    if (this.pending.has(key)) return this.pending.get(key) ?? null;
    const invoke = this.getTauriInvoke();
    if (invoke) {
      try {
        const res = (await invoke('plugin:stronghold|get_record', { key })) as { value?: string } | null;
        return res?.value ?? null;
      } catch {
        return null;
      }
    }
    return null;
  }

  async setItem(key: string, value: string): Promise<void> {
    const invoke = this.getTauriInvoke();
    if (invoke) {
      try {
        await invoke('plugin:stronghold|set_record', { key, value });
        this.pending.delete(key);
        return;
      } catch (err) {
        console.error('[TauriStrongholdAdapter] Failed to store in Stronghold vault:', err);
      }
    }
    this.pending.set(key, value);
  }

  async removeItem(key: string): Promise<void> {
    const invoke = this.getTauriInvoke();
    if (invoke) {
      try {
        await invoke('plugin:stronghold|remove_record', { key });
        this.pending.delete(key);
        return;
      } catch (err) {
        console.error('[TauriStrongholdAdapter] Failed to remove from Stronghold vault:', err);
      }
    }
    this.pending.set(key, null);
  }
}

/**
 * Electron Desktop OS-protected secure storage adapter.
 * Uses Electron IPC bridge backed by safeStorage (Windows DPAPI / macOS Keychain / Linux Secret Service).
 * Refuses unencrypted localStorage for secrets.
 */
export class ElectronSafeStorageAdapter implements SupportedStorage {
  private pending = new Map<string, string | null>();

  constructor() {
    purgeRendererLocalStorageTokens();
  }

  private getElectronStorage(): {
    getItem: (key: string) => Promise<string | null>;
    setItem: (key: string, value: string) => Promise<boolean>;
    removeItem: (key: string) => Promise<boolean>;
  } | null {
    if (typeof window === 'undefined') return null;
    const win = window as unknown as {
      electronAPI?: {
        secureStorage?: {
          getItem: (key: string) => Promise<string | null>;
          setItem: (key: string, value: string) => Promise<boolean>;
          removeItem: (key: string) => Promise<boolean>;
        };
      };
      electron?: {
        secureStorage?: {
          getItem: (key: string) => Promise<string | null>;
          setItem: (key: string, value: string) => Promise<boolean>;
          removeItem: (key: string) => Promise<boolean>;
        };
      };
    };
    return win.electronAPI?.secureStorage ?? win.electron?.secureStorage ?? null;
  }

  async getItem(key: string): Promise<string | null> {
    if (!isAuthorizedSecureKey(key)) {
      return Promise.reject(new Error(`[SecureStorage] Access to unauthorized key denied: ${key}`));
    }
    if (this.pending.has(key)) return this.pending.get(key) ?? null;
    const storage = this.getElectronStorage();
    if (storage) {
      try {
        const val = await storage.getItem(key);
        purgeRendererLocalStorageTokens();
        return val ?? null;
      } catch (err) {
        console.error('[ElectronSafeStorageAdapter] Failed to read from safeStorage:', err);
        return null;
      }
    }
    return null;
  }

  async setItem(key: string, value: string): Promise<void> {
    if (!isAuthorizedSecureKey(key)) {
      return Promise.reject(new Error(`[SecureStorage] Access to unauthorized key denied: ${key}`));
    }
    const storage = this.getElectronStorage();
    if (storage) {
      try {
        const ok = await storage.setItem(key, value);
        if (ok) {
          this.pending.delete(key);
          purgeRendererLocalStorageTokens();
          return;
        }
      } catch (err) {
        console.error('[ElectronSafeStorageAdapter] Failed to store in safeStorage:', err);
      }
    }
    this.pending.set(key, value);
    purgeRendererLocalStorageTokens();
  }

  async removeItem(key: string): Promise<void> {
    if (!isAuthorizedSecureKey(key)) {
      return Promise.reject(new Error(`[SecureStorage] Access to unauthorized key denied: ${key}`));
    }
    const storage = this.getElectronStorage();
    if (storage) {
      try {
        await storage.removeItem(key);
        this.pending.delete(key);
        purgeRendererLocalStorageTokens();
        return;
      } catch (err) {
        console.error('[ElectronSafeStorageAdapter] Failed to remove from safeStorage:', err);
      }
    }
    this.pending.set(key, null);
    purgeRendererLocalStorageTokens();
  }
}

/** Factory: returns the appropriate secure storage adapter for the runtime environment. */
export function getSecureAuthStorage(): SupportedStorage {
  const platform = detectPlatform();
  switch (platform) {
    case 'capacitor':
      return new CapacitorKeystoreAdapter();
    case 'tauri':
      return new TauriStrongholdAdapter();
    case 'electron':
      return new ElectronSafeStorageAdapter();
    case 'web':
    default:
      return new WebLocalStorageAdapter();
  }
}
