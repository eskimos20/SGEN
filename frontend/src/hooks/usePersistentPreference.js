import { useEffect, useState } from 'react';
import { Preferences } from '@capacitor/preferences';
import { isCapacitor } from '../config/api.config';

/**
 * Persist a small UI preference in native Preferences on Capacitor and
 * localStorage on web. Existing localStorage values are migrated on native.
 */
export const usePersistentPreference = (key, defaultValue) => {
  const [value, setValue] = useState(() => {
    if (isCapacitor) return defaultValue;
    const stored = localStorage.getItem(key);
    return stored === null ? defaultValue : stored;
  });
  const [ready, setReady] = useState(!isCapacitor);

  useEffect(() => {
    if (!isCapacitor) return undefined;
    let cancelled = false;

    const loadPreference = async () => {
      try {
        const { value: stored } = await Preferences.get({ key });
        if (cancelled) return;

        if (stored !== null) {
          setValue(stored);
        } else {
          const legacyValue = localStorage.getItem(key);
          if (legacyValue !== null) {
            setValue(legacyValue);
            await Preferences.set({ key, value: legacyValue });
          }
        }
      } catch (error) {
        console.warn(`Could not load preference "${key}" from native storage:`, error);
        if (!cancelled) {
          const legacyValue = localStorage.getItem(key);
          if (legacyValue !== null) setValue(legacyValue);
        }
      } finally {
        if (!cancelled) setReady(true);
      }
    };

    loadPreference();
    return () => { cancelled = true; };
  }, [key]);

  useEffect(() => {
    if (!ready) return;
    const stored = String(value);
    try {
      localStorage.setItem(key, stored);
    } catch (error) {
      console.warn(`Could not save preference "${key}" to localStorage:`, error);
    }
    if (isCapacitor) {
      Preferences.set({ key, value: stored }).catch((error) => {
        console.warn(`Could not save preference "${key}" to native storage:`, error);
      });
    }
  }, [key, ready, value]);

  return [value, setValue, ready];
};
