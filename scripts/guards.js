// Type guards that narrow parsed JSON, which is `unknown` until checked

/**
 * @param {unknown} value Parsed JSON
 * @returns {value is Record<string, unknown>} true for an object or an array
 */
export const isObject = (value) => value instanceof Object;

/**
 * @param {unknown} value Parsed JSON
 * @returns {value is string} true for a string
 */
export const isString = (value) => String(value) === value;
