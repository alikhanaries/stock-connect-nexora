import { z } from 'zod';

/**
 *  MongoDB ObjectId validator
 * Enforces string type, non-empty, and valid 24-char hex pattern.
 */
export const mongoIdField = (fieldName, { required = true } = {}) =>
  z.preprocess(
    (val) => {
      if (val === null || val === undefined || val === '') {
        if (required) throw new Error(`${fieldName} is required`);
        return val;
      }
      if (typeof val !== 'string') {
        throw new Error(`${fieldName} is allowed only string`);
      }
      if (!/^[0-9a-fA-F]{24}$/.test(val)) {
        throw new Error(`${fieldName} must be a valid MongoDB ObjectId`);
      }
      return val;
    },
    z
      .string({
        required_error: `${fieldName} is required`,
        invalid_type_error: `${fieldName} must be a string`,
      })
      .nonempty({ message: `${fieldName} is required` })
  );

/**
 *  Safe number validator
 * Supports required + default value
 */
export const safeNumber = (fieldName, defaultValue = 0, { required = false } = {}) =>
  z.preprocess(
    (val) => {
      if (val === null) throw new Error(`${fieldName} is not allowed to be null`);

      if (val === undefined || val === '') {
        if (required) throw new Error(`${fieldName} is required`);
        return defaultValue;
      }

      if (typeof val !== 'number') {
        throw new Error(`${fieldName} is allowed only number`);
      }

      return val;
    },
    z
      .number({
        invalid_type_error: `${fieldName} must be a number`,
        required_error: `${fieldName} is required`,
      })
      .min(0, { message: `${fieldName} must be a positive number` })
      .default(defaultValue)
  );

/**
 *  Safe string validator (handles null, number, undefined)
 */
export const notNullString = (fieldName, defaultValue = '', { required = false } = {}) =>
  z.preprocess(
    (val) => {
      if (val === null) throw new Error(`${fieldName} is not allowed to be null`);

      if (val === undefined || val === '') {
        if (required) throw new Error(`${fieldName} is required`);
        return defaultValue;
      }

      if (typeof val !== 'string') {
        throw new Error(`${fieldName} is allowed only string`);
      }

      return val;
    },
    z
      .string({
        required_error: `${fieldName} is required`,
        invalid_type_error: `${fieldName} must be a string`,
      })
      .nonempty({ message: `${fieldName} is required` })
      .default(defaultValue)
  );

/**
 *  Safe boolean validator
 * Handles null, undefined, and wrong types gracefully
 */
export const notNullBoolean = (fieldName, defaultValue = false, { required = false } = {}) =>
  z.preprocess(
    (val) => {
      if (val === null) throw new Error(`${fieldName} is not allowed to be null`);

      if (val === undefined) {
        if (required) throw new Error(`${fieldName} is required`);
        return defaultValue;
      }

      if (typeof val !== 'boolean') {
        throw new Error(`${fieldName} is allowed only boolean`);
      }

      return val;
    },
    z
      .boolean({
        required_error: `${fieldName} is required`,
        invalid_type_error: `${fieldName} must be a boolean`,
      })
      .default(defaultValue)
  );
