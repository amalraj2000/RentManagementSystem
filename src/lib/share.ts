import { randomInt } from "node:crypto";

// No look-alike characters (0/O, 1/l/I) so it's easy to type from a WhatsApp message.
const ALPHABET = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export function generateTempPassword(length = 10) {
  return Array.from({ length }, () => ALPHABET[randomInt(ALPHABET.length)]).join("");
}

/** wa.me wants country code + digits, no "+". A bare 10-digit Indian number gets 91. */
export function whatsappNumber(phone: string, defaultCountry = "91") {
  let d = phone.replace(/\D/g, "");
  if (d.startsWith("00")) d = d.slice(2);
  else if (d.length === 11 && d.startsWith("0")) d = defaultCountry + d.slice(1);
  else if (d.length === 10) d = defaultCountry + d;
  return d.length >= 11 && d.length <= 15 ? d : null;
}

export function loginMessage(o: { name: string; url: string; email: string; password: string }) {
  return `Hi ${o.name}, here is your Loveshore login.\n\nLogin link: ${o.url}\nUsername: ${o.email}\nTemporary password: ${o.password}\n\nPlease login and change your password right away. Don't share this message.`;
}

export function whatsappLink(phone: string, text: string) {
  const n = whatsappNumber(phone);
  return `https://wa.me/${n ?? ""}?text=${encodeURIComponent(text)}`;
}
