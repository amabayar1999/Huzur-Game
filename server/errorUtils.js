// Error payload helper - converts any error into JSON-safe data
function toErrorPayload(err, extra = {}) {
  if (!err) return { message: 'Unknown error', ...extra };

  // Pull common fields off Error (including non-enumerables)
  const base = {
    name: err.name || 'Error',
    message: err.message || 'Unknown error',
    code: err.code,         // custom codes if you use them
    type: err.type,         // optional
    status: err.status,     // optional (HTTP-ish)
    ...extra,
  };

  // Include stack in development only (avoid leaking internals in prod)
  if (process.env.NODE_ENV !== 'production' && err.stack) {
    base.stack = err.stack;
  }

  // Copy any enumerable custom props (e.g. err.details)
  for (const k in err) {
    if (base[k] == null) base[k] = err[k];
  }

  return base;
}

// Helper to emit server errors consistently
function emitServerError(socket, err, context = 'unknown', extra = {}) {
  const payload = toErrorPayload(err, { context, ...extra });
  console.error(`❌ Server error [${context}]:`, payload);
  socket.emit('server_error', payload);
}

// Helper for ACK responses
function createAckResponse(success, data = null, error = null) {
  if (success) {
    return { ok: true, data };
  } else {
    return { 
      ok: false, 
      error: error ? toErrorPayload(error) : { message: 'Unknown error' }
    };
  }
}

module.exports = {
  toErrorPayload,
  emitServerError,
  createAckResponse
};
