// Sensitive Data Minimization & Masking Utilities

export class MaskingUtil {
  /**
   * Masks university registration numbers, e.g. "2024ABCD9842" -> "2024••••9842"
   */
  public static maskRegistration(regNumber: string): string {
    if (!regNumber || regNumber.length <= 4) {
      return '••••';
    }
    const prefix = regNumber.slice(0, 4);
    const suffix = regNumber.slice(-4);
    return `${prefix}••••${suffix}`;
  }

  /**
   * Masks phone numbers, e.g. "+919876543210" -> "+91 ••••• 3210"
   */
  public static maskPhoneNumber(phone: string): string {
    if (!phone || phone.length < 4) {
      return '+91 ••••• ••••';
    }
    const lastFour = phone.slice(-4);
    return `+91 ••••• ${lastFour}`;
  }

  /**
   * Masks UPI Virtual Payment Address (VPA), e.g. "student.name@okaxis" -> "st•••@okaxis"
   */
  public static maskUpi(vpa: string): string {
    if (!vpa || !vpa.includes('@')) {
      return '••••@upi';
    }
    const [user, domain] = vpa.split('@');
    const visiblePrefix = user.slice(0, 2);
    return `${visiblePrefix}•••@${domain}`;
  }

  /**
   * Masks email address, e.g. "john.doe@campus.edu" -> "j••••e@campus.edu"
   */
  public static maskEmail(email: string): string {
    if (!email || !email.includes('@')) {
      return '••••@••••';
    }
    const [local, domain] = email.split('@');
    if (local.length <= 2) {
      return `${local[0]}•@${domain}`;
    }
    return `${local[0]}••••${local.slice(-1)}@${domain}`;
  }
}
