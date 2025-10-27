// Client-side error handling utilities
export function toDebug(e) {
  if (e instanceof Error) {
    return {
      name: e.name,
      message: e.message,
      stack: e.stack,
      code: e.code,
      ...Object.fromEntries(Object.entries(e)), // pick up any enumerable props
    };
  }
  try {
    return typeof e === 'object' ? JSON.parse(JSON.stringify(e)) : String(e);
  } catch {
    return String(e);
  }
}

export function handleServerError(data, setError) {
  const payload = toDebug(data);
  console.error('❌ Server error:', payload);

  // Defensive UI handling
  if (!payload || (typeof payload === 'object' && Object.keys(payload).length === 0)) {
    // Show a generic toast/snackbar
    setError('Something went wrong. Please try again.');
    return;
  }

  // Prefer specific messaging if available
  setError(payload.message || 'Unexpected server error');
}

export function handleConnectError(err) {
  const debug = toDebug(err);
  console.error('🔌 connect_error:', debug);
  return debug;
}
