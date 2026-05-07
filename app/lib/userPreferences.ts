export const userPreferencesEvent = "smart-ats-user-preferences-change";

export type UserPreferences = {
  autoProcessAiQueue: boolean;
  compactMode: boolean;
  showAiQueueBar: boolean;
  showImportProgressBar: boolean;
};

const storageKey = "smart-ats-user-preferences";

export const defaultUserPreferences: UserPreferences = {
  autoProcessAiQueue: true,
  compactMode: false,
  showAiQueueBar: true,
  showImportProgressBar: true,
};

const emitPreferencesChange = () => {
  window.dispatchEvent(new CustomEvent(userPreferencesEvent));
};

export const getUserPreferences = (): UserPreferences => {
  if (typeof window === "undefined") return defaultUserPreferences;

  try {
    const rawPreferences = window.localStorage.getItem(storageKey);
    if (!rawPreferences) return defaultUserPreferences;
    const parsed = JSON.parse(rawPreferences) as Partial<UserPreferences>;
    return {
      ...defaultUserPreferences,
      ...parsed,
    };
  } catch (_error) {
    return defaultUserPreferences;
  }
};

export const applyUserPreferences = (preferences = getUserPreferences()) => {
  if (typeof document === "undefined") return;

  document.documentElement.dataset.density = preferences.compactMode
    ? "compact"
    : "comfortable";
};

export const setUserPreferences = (preferences: UserPreferences) => {
  window.localStorage.setItem(storageKey, JSON.stringify(preferences));
  applyUserPreferences(preferences);
  emitPreferencesChange();
};

export const updateUserPreference = <Key extends keyof UserPreferences>(
  key: Key,
  value: UserPreferences[Key],
) => {
  setUserPreferences({
    ...getUserPreferences(),
    [key]: value,
  });
};

export const resetUserPreferences = () => {
  window.localStorage.removeItem(storageKey);
  applyUserPreferences(defaultUserPreferences);
  emitPreferencesChange();
};
