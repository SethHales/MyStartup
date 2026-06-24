export const AUTH_EXPIRED_EVENT = "quicksets:auth-expired";

export async function apiFetch(input, init) {
  const response = await fetch(input, init);

  if (response.status === 401 && shouldRedirectOnUnauthorized(input, init)) {
    window.dispatchEvent(new CustomEvent(AUTH_EXPIRED_EVENT));
  }

  return response;
}

function shouldRedirectOnUnauthorized(input, init = {}) {
  const url = typeof input === "string" ? input : input?.url || "";
  const method = (init?.method || "GET").toUpperCase();

  if (url.includes("/api/auth/")) {
    return false;
  }

  if (url.includes("/api/user/me") && method === "GET") {
    return false;
  }

  return true;
}
