export function safeRequestPath(path: string): string {
  const [pathname = path] = path.split("?", 1);
  return pathname.replace(
    /\/api\/v1\/friend-invitations\/[^/?]+/g,
    "/api/v1/friend-invitations/:token",
  );
}
