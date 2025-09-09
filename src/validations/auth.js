import { z } from 'zod';
import { USER_ROLES } from '#constants/common.js';

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
  role: z.enum(USER_ROLES),
  active: z.boolean().optional(),
});
