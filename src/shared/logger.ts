type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LEVEL_ORDER: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };

/**
 * Production builds drop `debug` and `info` entirely: an ad blocker sees every page the
 * user visits, so console noise is both a performance cost and a privacy leak.
 */
const MIN_LEVEL: LogLevel = __DEV__ ? 'debug' : 'warn';

function emit(level: LogLevel, scope: string, args: unknown[]): void {
  if (LEVEL_ORDER[level] < LEVEL_ORDER[MIN_LEVEL]) return;
  const prefix = `[ClearBlock:${scope}]`;
  switch (level) {
    case 'debug':
    case 'info':
      console.log(prefix, ...args);
      break;
    case 'warn':
      console.warn(prefix, ...args);
      break;
    case 'error':
      console.error(prefix, ...args);
      break;
  }
}

export type Logger = {
  debug: (...args: unknown[]) => void;
  info: (...args: unknown[]) => void;
  warn: (...args: unknown[]) => void;
  error: (...args: unknown[]) => void;
};

export function createLogger(scope: string): Logger {
  return {
    debug: (...args) => emit('debug', scope, args),
    info: (...args) => emit('info', scope, args),
    warn: (...args) => emit('warn', scope, args),
    error: (...args) => emit('error', scope, args),
  };
}

/**
 * Never log a full URL: it is browsing history. Callers that need context log the
 * registrable-ish hostname only, and only in development.
 */
export function safeUrlLabel(url: string | undefined): string {
  if (!url) return '<none>';
  try {
    return new URL(url).hostname || '<opaque>';
  } catch {
    return '<invalid>';
  }
}
