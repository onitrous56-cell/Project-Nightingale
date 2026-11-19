export interface CaregiverAlertInput {
  patientName?: string;
  caregiverName?: string;
  caregiverPhone?: string;
  alertEmail?: string;
  reason?: string;
  lat: number;
  lng: number;
  remoteAccessCode?: string;
}

export interface CaregiverAlertLinks {
  patientName: string;
  caregiverName: string;
  caregiverPhone: string;
  alertEmail: string;
  cleanDigits: string;
  hasValidPhone: boolean;
  hasValidEmail: boolean;
  telUrl: string | null;
  smsUrl: string | null;
  mailtoUrl: string | null;
  mapsLink: string;
  bodyText: string;
  subject: string;
}

export function buildCaregiverAlertLinks(input: CaregiverAlertInput): CaregiverAlertLinks {
  const patientName = (input.patientName || 'Patient').trim() || 'Patient';
  const caregiverName = (input.caregiverName || 'Caregiver').trim() || 'Caregiver';
  const caregiverPhone = (input.caregiverPhone || '').trim();
  const alertEmail = (input.alertEmail || '').trim();
  const reason = (input.reason || 'Immediate Caregiver Call / Emergency Alert').trim();
  const lat = Number.isFinite(input.lat) ? input.lat : 37.7793;
  const lng = Number.isFinite(input.lng) ? input.lng : -122.4193;
  const code = (input.remoteAccessCode || '').trim();

  const cleanDigits = caregiverPhone.replace(/[^\d+]/g, '');
  const hasValidPhone = cleanDigits.replace(/\+/g, '').length >= 3;
  const hasValidEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(alertEmail);

  const mapsLink = `https://maps.google.com/?q=${lat.toFixed(5)},${lng.toFixed(5)}`;
  const bodyText = [
    `ABLEBRIDGE CAREGIVER ALERT for ${patientName}`,
    `Alert Reason: ${reason}`,
    `Caregiver Contact: ${caregiverName} (${caregiverPhone || 'Not set'})`,
    `GPS Coordinates: ${lat.toFixed(5)}, ${lng.toFixed(5)}`,
    `Map Link: ${mapsLink}`,
    code ? `Remote Portal Code: ${code}` : '',
    `Sent: ${new Date().toISOString()}`,
  ]
    .filter(Boolean)
    .join('\n');

  const subject = `[AbleBridge Alert] ${patientName}: ${reason}`;
  const telUrl = hasValidPhone ? `tel:${cleanDigits}` : null;
  // Standard RFC 5724 sms: URI syntax without extraneous '?&'
  const smsUrl = hasValidPhone ? `sms:${cleanDigits}?body=${encodeURIComponent(bodyText)}` : null;
  const mailtoUrl = hasValidEmail
    ? `mailto:${encodeURIComponent(alertEmail)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(bodyText)}`
    : null;

  return {
    patientName,
    caregiverName,
    caregiverPhone,
    alertEmail,
    cleanDigits,
    hasValidPhone,
    hasValidEmail,
    telUrl,
    smsUrl,
    mailtoUrl,
    mapsLink,
    bodyText,
    subject,
  };
}
