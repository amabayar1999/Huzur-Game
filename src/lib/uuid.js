/**
 * Generate a UUID v4
 * Falls back to a custom implementation if crypto.randomUUID is not available
 * This ensures compatibility with older mobile browsers (Safari < 15.4, older Android)
 */
export function generateUUID() {
  // Check if crypto.randomUUID is available and is a function (modern browsers)
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    try {
      return crypto.randomUUID();
    } catch (e) {
      // If it throws an error, fall through to fallback
    }
  }
  
  // Fallback for older browsers
  // Generate UUID v4 format: xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

