export function selectedContactEmails(
  contacts: Array<{ email?: string[] }>,
): string[] {
  return [
    ...new Set(
      contacts
        .flatMap((contact) => contact.email ?? [])
        .map((email) => email.trim().toLowerCase())
        .filter(Boolean),
    ),
  ].slice(0, 20);
}
