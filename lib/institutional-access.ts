const INTELI_DOMAINS = ["inteli.edu.br", "inteli.edu"] as const;

export function normalizedEmailDomain(email: string | null | undefined) {
  const normalized = email?.trim().toLowerCase();
  if (!normalized) return null;
  const at = normalized.lastIndexOf("@");
  if (at <= 0 || at === normalized.length - 1) return null;
  return normalized.slice(at + 1);
}

export function isInteliInstitutionalEmail(email: string | null | undefined) {
  const domain = normalizedEmailDomain(email);
  if (!domain) return false;
  return INTELI_DOMAINS.some((root) => domain === root || domain.endsWith(`.${root}`));
}

export const inteliInstitutionalAccessDescription = "@inteli.edu.br e subdomínios, como @sou.inteli.edu.br";
