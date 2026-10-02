import { handleEmails } from '../server/emails.mjs';
export default function handler(req,res) { return handleEmails(req,res); }
export const config = { maxDuration: 60 };
