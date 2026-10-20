/**
 * HTTP client for the equipment-hire API.
 *
 * The access token lives in memory only — never localStorage, where any XSS
 * payload could read it. A page reload loses it, so boot calls `restore()`,
 * which trades the httpOnly refresh cookie for a fresh token.
 *
 * Refresh is single-flight: when several requests hit a 401 at once, they all
 * wait on one refresh call. Without that, each would rotate the refresh token,
 * the second rotation would present an already-used token, and the server's
 * reuse detection would (correctly) revoke the whole session.
 */

export class ApiError extends Error {
  /**
   * @param {{status: number, code: string, message: string, details?: unknown, requestId?: string}} p
   */
  constructor({ status, code, message, details, requestId }) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.details = details;
    this.requestId = requestId;
  }

  /** Field errors from a 422, keyed by dotted path. */
  get fieldErrors() {
    const out = {};
    const issues = Array.isArray(this.details)
      ? this.details
      : (this.details?.issues ?? []);
    for (const issue of issues) {
      const key = Array.isArray(issue.path)
        ? issue.path.join(".")
        : (issue.path ?? issue.field);
      if (key && !out[key]) out[key] = issue.message;
    }
    return out;
  }
}

/**
 * @param {{app: 'web'|'admin', baseUrl?: string}} opts
 */
export function createApiClient({ app, baseUrl = "/api/v1" }) {
  const authBase = app === "admin" ? "/admin/auth" : "/auth";
  let accessToken = null;
  let session = null; // { user, permissions }
  let refreshing = null;
  const listeners = new Set();

  const emit = () => listeners.forEach((fn) => fn(session));

  function setSession(data) {
    accessToken = data?.accessToken ?? null;
    session = data
      ? { user: data.user, permissions: data.permissions ?? [] }
      : null;
    emit();
  }

  async function raw(
    path,
    { method = "GET", body, query, headers = {}, auth = true } = {},
  ) {
    let url = baseUrl + path;
    if (query) {
      const qs = new URLSearchParams();
      for (const [k, v] of Object.entries(query)) {
        if (v === undefined || v === null || v === "") continue;
        if (Array.isArray(v)) v.forEach((x) => qs.append(k, x));
        else qs.set(k, String(v));
      }
      const s = qs.toString();
      if (s) url += `?${s}`;
    }
    const init = {
      method,
      credentials: "include",
      headers: { Accept: "application/json", ...headers },
    };
    if (body !== undefined) {
      init.headers["Content-Type"] = "application/json";
      init.body = JSON.stringify(body);
    }
    if (auth && accessToken)
      init.headers.Authorization = `Bearer ${accessToken}`;

    let res;
    try {
      res = await fetch(url, init);
    } catch {
      throw new ApiError({
        status: 0,
        code: "NETWORK",
        message:
          "We could not reach the server. Check your connection and try again.",
      });
    }
    if (res.status === 204) return { status: 204, json: null };
    const json = await res.json().catch(() => null);
    if (!res.ok) {
      const e = json?.error ?? {};
      throw new ApiError({
        status: res.status,
        code: e.code ?? "HTTP_" + res.status,
        message: e.message ?? "Something went wrong. Please try again.",
        details: e.details,
        requestId: e.requestId ?? res.headers.get("X-Request-Id") ?? undefined,
      });
    }
    return { status: res.status, json };
  }

  async function refresh() {
    refreshing ??= raw(`${authBase}/refresh`, { method: "POST", auth: false })
      .then(({ json }) => {
        setSession(json.data);
        return true;
      })
      .catch(() => {
        setSession(null);
        return false;
      })
      .finally(() => {
        refreshing = null;
      });
    return refreshing;
  }

  /**
   * Request returning the full envelope ({data, meta}). Retries once after a
   * transparent refresh when the access token has expired.
   */
  async function envelope(path, opts = {}) {
    try {
      return (await raw(path, opts)).json;
    } catch (err) {
      const isAuthCall = path.startsWith(authBase);
      if (
        err instanceof ApiError &&
        err.status === 401 &&
        !isAuthCall &&
        opts.auth !== false
      ) {
        if (await refresh()) return (await raw(path, opts)).json;
      }
      throw err;
    }
  }

  const request = async (path, opts) => (await envelope(path, opts))?.data;

  return {
    app,
    request,
    envelope,
    get: (path, query) => request(path, { query }),
    list: (path, query) => envelope(path, { query }),
    post: (path, body) => request(path, { method: "POST", body: body ?? {} }),
    put: (path, body) => request(path, { method: "PUT", body }),
    patch: (path, body) => request(path, { method: "PATCH", body }),
    del: (path) => request(path, { method: "DELETE" }),

    get session() {
      return session;
    },
    hasPermission(code) {
      const p = session?.permissions ?? [];
      return p.includes("*") || p.includes(code);
    },
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },

    /** Restore a session from the refresh cookie. Resolves false when signed out. */
    restore: () => refresh(),

    async login(email, password) {
      const data = await request(`${authBase}/login`, {
        method: "POST",
        body: { email, password },
        auth: false,
      });
      setSession(data);
      return data;
    },

    async register(input) {
      const { status, json } = await raw(`${authBase}/register`, {
        method: "POST",
        body: input,
        auth: false,
      });
      if (status === 201) setSession(json.data);
      return { created: status === 201, ...json.data };
    },

    async logout() {
      try {
        await raw(`${authBase}/logout`, { method: "POST", auth: false });
      } finally {
        setSession(null);
      }
    },

    /** Replace the cached user after a profile edit. */
    updateUser(user) {
      if (session) {
        session = { ...session, user: { ...session.user, ...user } };
        emit();
      }
    },
  };
}
