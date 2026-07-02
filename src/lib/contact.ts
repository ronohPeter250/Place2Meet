import { Alert, Linking } from 'react-native';

// Support contact WhatsApp number in international format (digits only).
// Israeli number 053-550-6565 → drop the leading 0, prefix country code 972.
export const SUPPORT_WHATSAPP = '972535506565';

/**
 * Open a WhatsApp chat with the given number (international format, digits only),
 * optionally pre-filling a message. Uses the https://wa.me deep link: WhatsApp
 * registers this domain, so on a device with WhatsApp installed it opens the app
 * directly; otherwise it opens the wa.me web page. The Hebrew alert only fires if
 * the link genuinely can't be opened (e.g. no browser/handler at all).
 */
export async function openWhatsApp(
  phone: string = SUPPORT_WHATSAPP,
  message?: string,
): Promise<void> {
  const url = `https://wa.me/${phone}${message ? `?text=${encodeURIComponent(message)}` : ''}`;
  try {
    await Linking.openURL(url);
  } catch {
    Alert.alert('שגיאה', 'לא ניתן לפתוח את וואטסאפ כרגע. נסה שוב.');
  }
}
