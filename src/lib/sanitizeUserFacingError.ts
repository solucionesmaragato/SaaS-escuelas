export function sanitizeUserFacingError(message: string): string {
  return message.replace(/korefactu/gi, "Verifactu");
}
