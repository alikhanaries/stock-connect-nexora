import nodemailer from 'nodemailer';
import { config } from '#config/config.js';

export const transporter = nodemailer.createTransport({
  host: config.MAIL_HOST,
  port: config.MAIL_PORT,
  secure: false, // true for 465, false for 587
  auth: {
    user: process.env.MAIL_USER,
    pass: process.env.MAIL_PASS,
  },
});

export const defaultMailOptions = {
  from: `"StockConnect" <cs@alhome.com>`, // must be verified in SES
};
