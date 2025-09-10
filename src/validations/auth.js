import { z } from 'zod';
import { USER_ROLES } from '#constants/common.js';
const allowedRoles = Object.values(USER_ROLES);

export const loginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().nonempty('Password is required').min(6, 'Invalid Password'),
});

export const registerSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().nonempty('Password is required').min(6, 'Password must be at least 6 characters long'),
  firstName: z.string().min(1, 'First name is required'),
  lastName: z.string().min(1, 'Last name is required'),
  phoneNumber: z.string().min(1, 'Phone number is required'),
  role: z.enum(allowedRoles, {
    message: `Invalid role. Please select one of: ${allowedRoles.join(', ')}`,
  }),
  active: z.boolean().optional(),
});
