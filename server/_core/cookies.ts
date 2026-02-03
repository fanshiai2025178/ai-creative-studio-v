import type { CookieOptions, Request } from "express";

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);

function isIpAddress(host: string) {
  // Basic IPv4 check and IPv6 presence detection.
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) return true;
  return host.includes(":");
}

function isSecureRequest(req: Request) {
  if (req.protocol === "https") return true;

  const forwardedProto = req.headers["x-forwarded-proto"];
  if (!forwardedProto) return false;

  const protoList = Array.isArray(forwardedProto)
    ? forwardedProto
    : forwardedProto.split(",");

  return protoList.some(proto => proto.trim().toLowerCase() === "https");
}

export function getSessionCookieOptions(
  req: Request
): Pick<CookieOptions, "domain" | "httpOnly" | "path" | "sameSite" | "secure" | "maxAge"> {
  const hostname = req.hostname;
  const isLocalhost = LOCAL_HOSTS.has(hostname);
  const isSecure = isSecureRequest(req);

  // 对于本地开发环境（非 HTTPS），使用 sameSite: "lax"
  // 对于生产环境（HTTPS），使用 sameSite: "none" + secure: true
  return {
    httpOnly: true,
    path: "/",
    sameSite: isSecure ? "none" : "lax",  // 本地 HTTP 用 lax，生产 HTTPS 用 none
    secure: isSecure,
    maxAge: 30 * 24 * 60 * 60 * 1000,  // 30天
  };
}
