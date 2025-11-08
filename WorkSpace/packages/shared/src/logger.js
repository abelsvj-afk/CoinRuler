"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getLogger = getLogger;
function isObject(v) {
    return v && typeof v === 'object';
}
function consoleLogger(scope) {
    const prefix = scope ? `[${Object.entries(scope).map(([k, v]) => `${k}=${v}`).join(' ')}] ` : '';
    const fmt = (objOrMsg, msg) => {
        if (msg !== undefined)
            return prefix + msg + ' ' + JSON.stringify(objOrMsg);
        if (isObject(objOrMsg))
            return prefix + JSON.stringify(objOrMsg);
        return prefix + String(objOrMsg);
    };
    return {
        info: (o, m) => console.log(fmt(o, m)),
        warn: (o, m) => console.warn(fmt(o, m)),
        error: (o, m) => console.error(fmt(o, m)),
        debug: (o, m) => console.debug(fmt(o, m)),
        child: (bindings) => consoleLogger({ ...(scope || {}), ...(bindings || {}) }),
    };
}
let loggerImpl = null;
function getLogger(bindings) {
    if (!loggerImpl) {
        try {
            // Dynamically import pino if present
            // eslint-disable-next-line @typescript-eslint/no-var-requires
            const pino = require('pino');
            const base = pino({ level: process.env.LOG_LEVEL || 'info' });
            loggerImpl = {
                info: (o, m) => (m !== undefined ? base.info(o, m) : base.info(o)),
                warn: (o, m) => (m !== undefined ? base.warn(o, m) : base.warn(o)),
                error: (o, m) => (m !== undefined ? base.error(o, m) : base.error(o)),
                debug: (o, m) => (m !== undefined ? base.debug(o, m) : base.debug(o)),
                child: (b) => getLogger(b),
            };
        }
        catch {
            // Fallback to console
            loggerImpl = consoleLogger();
        }
    }
    return bindings ? loggerImpl.child(bindings) : loggerImpl;
}
