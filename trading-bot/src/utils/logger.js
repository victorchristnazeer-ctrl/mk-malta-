/**
 * Simple structured logger with level filtering.
 */
const LEVELS = { debug: 0, info: 1, warn: 2, error: 3 };

class Logger {
  constructor(level = 'info') {
    this.level = LEVELS[level] ?? 1;
  }

  _log(lvl, msg, data) {
    if (LEVELS[lvl] < this.level) return;
    const ts = new Date().toISOString();
    const prefix = `[${ts}] [${lvl.toUpperCase()}]`;
    if (data !== undefined) {
      console.log(`${prefix} ${msg}`, typeof data === 'object' ? JSON.stringify(data) : data);
    } else {
      console.log(`${prefix} ${msg}`);
    }
  }

  debug(msg, data) { this._log('debug', msg, data); }
  info(msg, data)  { this._log('info', msg, data); }
  warn(msg, data)  { this._log('warn', msg, data); }
  error(msg, data) { this._log('error', msg, data); }
}

module.exports = Logger;
