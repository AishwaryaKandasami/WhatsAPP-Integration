/**
 * Shared prospect-facing config for the marketing surfaces (landing page + demo).
 * This number opens a WhatsApp chat with the agency/founder — NOT the configured
 * seller's number. Update WHATSAPP_CTA_NUMBER here in one place if it changes.
 */
export const WHATSAPP_CTA_NUMBER = "919442708293";

export const WHATSAPP_CTA_MESSAGE =
  "Hi, I'd like to get this WhatsApp AI ordering bot for my food business";

export function whatsappCtaUrl(message: string = WHATSAPP_CTA_MESSAGE): string {
  return `https://wa.me/${WHATSAPP_CTA_NUMBER}?text=${encodeURIComponent(message)}`;
}
