const MIN_SESSION_SECRET_LENGTH = 32;
const MIN_ADMIN_PASSWORD_LENGTH = 12;

function isPlaceholderSecret(value) {
  return /^(replace-with|change-me|changeme|your-secret|your-admin)/i.test(String(value || "").trim());
}

function env() {
  return {
    PORT: Number(process.env.API_PORT || process.env.PORT || 8787),
    HOST: process.env.API_HOST || "127.0.0.1",
    JWT_SECRET: process.env.JWT_SECRET || "",
    BACKEND_STORE: String(process.env.BACKEND_STORE || "").trim().toLowerCase(),
    DATABASE_URL: process.env.DATABASE_URL || "",
    STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY || "",
    STRIPE_WEBHOOK_SECRET: process.env.STRIPE_WEBHOOK_SECRET || "",
    ADMIN_EMAIL: process.env.ADMIN_EMAIL || "admin@example.com",
    ADMIN_PASSWORD: process.env.ADMIN_PASSWORD || "",
    TRELLO_APP_KEY: process.env.TRELLO_APP_KEY || "",
    TRELLO_APP_NAME: process.env.TRELLO_APP_NAME || "Summarize This",
    PROXY_ENDPOINT: process.env.PROXY_ENDPOINT || "",
    HAI_CONNECTOR_ENABLED: String(process.env.HAI_CONNECTOR_ENABLED || "false").toLowerCase() === "true",
    BACKEND_ALLOWED_ORIGINS: process.env.BACKEND_ALLOWED_ORIGINS || "http://127.0.0.1:17117,http://localhost:17117",
    OPENAI_API_KEY: process.env.OPENAI_API_KEY || "",
    ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY || "",
    GOOGLE_API_KEY: process.env.GOOGLE_API_KEY || ""
  };
}

function allowedBackendOrigins() {
  return String(env().BACKEND_ALLOWED_ORIGINS || "")
    .split(",")
    .map((origin) => origin.trim().replace(/\/$/, ""))
    .filter((origin) => /^https?:\/\/[^/]+$/i.test(origin));
}

function isAllowedBackendOrigin(origin) {
  const normalized = String(origin || "").trim().replace(/\/$/, "");
  return Boolean(normalized) && allowedBackendOrigins().includes(normalized);
}

function missingEnvForBackend() {
  const current = env();
  const missing = [];
  if (String(current.JWT_SECRET).length < MIN_SESSION_SECRET_LENGTH || isPlaceholderSecret(current.JWT_SECRET)) {
    missing.push(`JWT_SECRET (minimum ${MIN_SESSION_SECRET_LENGTH} characters, non-placeholder)`);
  }
  if (String(current.ADMIN_PASSWORD).length < MIN_ADMIN_PASSWORD_LENGTH || isPlaceholderSecret(current.ADMIN_PASSWORD)) {
    missing.push(`ADMIN_PASSWORD (minimum ${MIN_ADMIN_PASSWORD_LENGTH} characters, non-placeholder)`);
  }
  if (current.BACKEND_STORE && !["local", "postgres"].includes(current.BACKEND_STORE)) {
    missing.push("BACKEND_STORE (must be local or postgres)");
  }
  if (current.BACKEND_STORE === "postgres" && !String(current.DATABASE_URL).trim()) {
    missing.push("DATABASE_URL (required when BACKEND_STORE=postgres)");
  }
  return missing;
}

function backendReadiness() {
  const current = env();
  const missing = missingEnvForBackend();
  return {
    ok: missing.length === 0,
    missing,
    optional: {
      DATABASE_URL: Boolean(current.DATABASE_URL),
      STRIPE_SECRET_KEY: Boolean(current.STRIPE_SECRET_KEY),
      STRIPE_WEBHOOK_SECRET: Boolean(current.STRIPE_WEBHOOK_SECRET),
      PROXY_ENDPOINT: Boolean(current.PROXY_ENDPOINT),
      HAI_CONNECTOR_ENABLED: current.HAI_CONNECTOR_ENABLED,
      directProviderKey: Boolean(current.OPENAI_API_KEY || current.ANTHROPIC_API_KEY || current.GOOGLE_API_KEY)
    }
  };
}

function powerUpReadiness() {
  const current = env();
  return {
    trelloKeyConfigured: Boolean(current.TRELLO_APP_KEY),
    trelloNameConfigured: Boolean(current.TRELLO_APP_NAME)
  };
}

function publicConfig() {
  const current = env();
  return {
    host: current.HOST,
    port: current.PORT,
    version: require("./package.json").version,
    storage: current.BACKEND_STORE || (current.DATABASE_URL ? "postgres" : "local"),
    trello: {
      appKeyConfigured: Boolean(current.TRELLO_APP_KEY),
      appName: current.TRELLO_APP_NAME
    },
    backend: backendReadiness()
  };
}

const exported = {
  env,
  get PORT() {
    return env().PORT;
  },
  get HOST() {
    return env().HOST;
  },
  get JWT_SECRET() {
    return env().JWT_SECRET;
  },
  get DATABASE_URL() {
    return env().DATABASE_URL;
  },
  get BACKEND_STORE() {
    return env().BACKEND_STORE;
  },
  get STRIPE_SECRET_KEY() {
    return env().STRIPE_SECRET_KEY;
  },
  get STRIPE_WEBHOOK_SECRET() {
    return env().STRIPE_WEBHOOK_SECRET;
  },
  get ADMIN_EMAIL() {
    return env().ADMIN_EMAIL;
  },
  get ADMIN_PASSWORD() {
    return env().ADMIN_PASSWORD;
  },
  get TRELLO_APP_KEY() {
    return env().TRELLO_APP_KEY;
  },
  get TRELLO_APP_NAME() {
    return env().TRELLO_APP_NAME;
  },
  get PROXY_ENDPOINT() {
    return env().PROXY_ENDPOINT;
  },
  get HAI_CONNECTOR_ENABLED() {
    return env().HAI_CONNECTOR_ENABLED;
  },
  allowedBackendOrigins,
  isAllowedBackendOrigin,
  get OPENAI_API_KEY() {
    return env().OPENAI_API_KEY;
  },
  get ANTHROPIC_API_KEY() {
    return env().ANTHROPIC_API_KEY;
  },
  get GOOGLE_API_KEY() {
    return env().GOOGLE_API_KEY;
  },
  MIN_SESSION_SECRET_LENGTH,
  MIN_ADMIN_PASSWORD_LENGTH,
  isPlaceholderSecret,
  missingEnvForBackend,
  backendReadiness,
  powerUpReadiness,
  publicConfig
};

module.exports = exported;
