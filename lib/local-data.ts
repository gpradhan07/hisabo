/** Browser-storage keys that hold one user's data, so they can be cleared when someone else signs in. */
export const CACHE_KEY = "hisabo:cache";
export const PROMPTED_KEY = "hisabo:profile-prompted";

/** Forget the cached dashboard of whoever used this browser last (on sign-in and sign-out). */
export function forgetCachedData() {
  try {
    localStorage.removeItem(CACHE_KEY);
    localStorage.removeItem(PROMPTED_KEY);
  } catch {
    // storage blocked: nothing cached
  }
}
