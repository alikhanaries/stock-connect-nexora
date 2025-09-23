import nodemailer from 'nodemailer';
import { config } from '#config/config.js';
const { MAIL_HOST, MAIL_PORT, MAIL_USER, MAIL_PASS, FROM_ADDRESS } = config;

export const transporter = nodemailer.createTransport({
  host: MAIL_HOST,
  port: MAIL_PORT,
  secure: false, // true for 465, false for 587
  auth: {
    user: MAIL_USER,
    pass: MAIL_PASS,
  },
});

export const defaultMailOptions = {
  from: FROM_ADDRESS,
  replyTo: FROM_ADDRESS,
};
