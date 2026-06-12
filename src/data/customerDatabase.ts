import { randomBytes, randomUUID, pbkdf2Sync, timingSafeEqual } from "node:crypto";

const defaultFirebaseDatabaseUrl =
  process.env.WHITEBLUE_FIREBASE_DATABASE_URL ?? "https://whiteblue-6edb5-default-rtdb.firebaseio.com";
const firebaseAuthToken = process.env.WHITEBLUE_FIREBASE_AUTH_TOKEN;
const passwordIterations = 120_000;
const passwordKeyLength = 32;
const passwordDigest = "sha256";

export type RegisterCustomerInput = {
  tenantKey: string;
  tenantName?: string;
  username: string;
  password: string;
  fullName: string;
  email?: string;
};

export type LoginCustomerInput = {
  tenantKey: string;
  username: string;
  password: string;
};

export type AuthenticatedCustomer = {
  customerId: string;
  tenantId: string;
  tenantKey: string;
  tenantName: string;
  username: string;
  fullName: string;
  email?: string;
};

type CustomerCredentialRecord = AuthenticatedCustomer & {
  passwordHash: string;
  passwordSalt: string;
};

type TenantRecord = {
  tenantId: string;
  tenantKey: string;
  tenantName: string;
  createdAt: string;
};

type FirebaseHttpClient = typeof fetch;

export class CustomerDatabase {
  private readonly databaseUrl: string;

  constructor(
    databaseUrl = defaultFirebaseDatabaseUrl,
    private readonly httpClient: FirebaseHttpClient = fetch
  ) {
    this.databaseUrl = databaseUrl.replace(/\/+$/, "");
  }

  async registerCustomer(input: RegisterCustomerInput): Promise<AuthenticatedCustomer> {
    const normalized = normalizeRegistration(input);
    const tenant = await this.ensureTenant(normalized.tenantKey, normalized.tenantName);
    const existing = await this.findCustomerCredentials(tenant.tenantKey, normalized.username);

    if (existing) {
      await this.recordAuthEvent(tenant.tenantKey, tenant.tenantId, existing.customerId, "register", false, "Username already exists");
      throw new CustomerAuthError("Username already exists for this tenant");
    }

    const customerId = randomUUID();
    const salt = randomBytes(16).toString("hex");
    const passwordHash = hashPassword(normalized.password, salt);
    const customer: CustomerCredentialRecord = {
      customerId,
      tenantId: tenant.tenantId,
      tenantKey: tenant.tenantKey,
      tenantName: tenant.tenantName,
      username: normalized.username,
      fullName: normalized.fullName,
      email: normalized.email,
      passwordHash,
      passwordSalt: salt
    };

    await this.put(`customers/${tenant.tenantKey}/${customerKey(normalized.username)}`, {
      ...customer,
      createdAt: new Date().toISOString()
    });
    await this.recordAuthEvent(tenant.tenantKey, tenant.tenantId, customerId, "register", true);

    return stripCredentials(customer);
  }

  async validateLogin(input: LoginCustomerInput): Promise<AuthenticatedCustomer> {
    const tenantKey = normalizeTenantKey(input.tenantKey);
    const username = normalizeUsername(input.username);
    const tenant = await this.findTenant(tenantKey);

    if (!tenant) {
      throw new CustomerAuthError("Invalid username or password");
    }

    const customer = await this.findCustomerCredentials(tenant.tenantKey, username);
    if (!customer || !verifyPassword(input.password, customer.passwordSalt, customer.passwordHash)) {
      await this.recordAuthEvent(tenant.tenantKey, tenant.tenantId, customer?.customerId, "login", false, "Invalid credentials");
      throw new CustomerAuthError("Invalid username or password");
    }

    await this.recordAuthEvent(tenant.tenantKey, tenant.tenantId, customer.customerId, "login", true);

    return stripCredentials(customer);
  }

  async findCustomerByUsername(tenantKey: string, username: string): Promise<AuthenticatedCustomer | undefined> {
    const normalizedTenantKey = normalizeTenantKey(tenantKey);
    const tenant = await this.findTenant(normalizedTenantKey);
    if (!tenant) return undefined;

    const customer = await this.findCustomerCredentials(tenant.tenantKey, normalizeUsername(username));
    return customer ? stripCredentials(customer) : undefined;
  }

  private async ensureTenant(tenantKey: string, tenantName = tenantKey): Promise<TenantRecord> {
    const normalizedKey = normalizeTenantKey(tenantKey);
    const existing = await this.findTenant(normalizedKey);
    if (existing) return existing;

    const tenant: TenantRecord = {
      tenantId: randomUUID(),
      tenantKey: normalizedKey,
      tenantName: tenantName.trim() || normalizedKey,
      createdAt: new Date().toISOString()
    };

    await this.put(`tenants/${normalizedKey}`, tenant);
    return tenant;
  }

  private async findTenant(tenantKey: string): Promise<TenantRecord | undefined> {
    return this.get<TenantRecord>(`tenants/${tenantKey}`);
  }

  private async findCustomerCredentials(tenantKey: string, username: string): Promise<CustomerCredentialRecord | undefined> {
    return this.get<CustomerCredentialRecord>(`customers/${tenantKey}/${customerKey(username)}`);
  }

  private async recordAuthEvent(
    tenantKey: string,
    tenantId: string,
    customerId: string | undefined,
    eventType: "register" | "login",
    success: boolean,
    reason?: string
  ): Promise<void> {
    await this.post(`authEvents/${tenantKey}`, {
      eventId: randomUUID(),
      tenantId,
      customerId: customerId ?? null,
      eventType,
      success,
      reason: reason ?? null,
      createdAt: new Date().toISOString()
    });
  }

  private async get<T>(path: string): Promise<T | undefined> {
    const response = await this.request(path, { method: "GET" });
    const data = (await response.json()) as T | null;
    return data ?? undefined;
  }

  private async put(path: string, body: unknown): Promise<void> {
    await this.request(path, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body)
    });
  }

  private async post(path: string, body: unknown): Promise<void> {
    await this.request(path, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body)
    });
  }

  private async request(path: string, init: RequestInit): Promise<Response> {
    const response = await this.httpClient(firebaseUrl(this.databaseUrl, path), init);
    if (!response.ok) {
      throw new CustomerAuthError(`Firebase request failed with status ${response.status}`);
    }
    return response;
  }
}

export class CustomerAuthError extends Error {}

function normalizeRegistration(input: RegisterCustomerInput): RegisterCustomerInput {
  const tenantKey = normalizeTenantKey(input.tenantKey);
  const username = normalizeUsername(input.username);
  const fullName = input.fullName.trim();
  const password = input.password;
  const email = input.email?.trim() || undefined;

  if (!fullName) throw new CustomerAuthError("Full name is required");
  if (password.length < 8) throw new CustomerAuthError("Password must be at least 8 characters");

  return {
    tenantKey,
    tenantName: input.tenantName?.trim() || tenantKey,
    username,
    password,
    fullName,
    email
  };
}

function normalizeTenantKey(tenantKey: string): string {
  const normalized = tenantKey.trim().toLowerCase().replace(/[^a-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "");
  if (!normalized) throw new CustomerAuthError("Tenant is required");
  return normalized;
}

function normalizeUsername(username: string): string {
  const normalized = username.trim().toLowerCase();
  if (!/^[a-z0-9._-]{3,40}$/.test(normalized)) {
    throw new CustomerAuthError("Username must be 3-40 characters and use letters, numbers, dots, underscores, or hyphens");
  }
  return normalized;
}

function hashPassword(password: string, salt: string): string {
  return pbkdf2Sync(password, salt, passwordIterations, passwordKeyLength, passwordDigest).toString("hex");
}

function verifyPassword(password: string, salt: string, expectedHash: string): boolean {
  const actual = Buffer.from(hashPassword(password, salt), "hex");
  const expected = Buffer.from(expectedHash, "hex");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

function stripCredentials(customer: CustomerCredentialRecord): AuthenticatedCustomer {
  return {
    customerId: customer.customerId,
    tenantId: customer.tenantId,
    tenantKey: customer.tenantKey,
    tenantName: customer.tenantName,
    username: customer.username,
    fullName: customer.fullName,
    email: customer.email
  };
}

function customerKey(username: string): string {
  return Buffer.from(username).toString("base64url");
}

function firebaseUrl(databaseUrl: string, path: string): string {
  const url = new URL(`${databaseUrl}/${path}.json`);
  if (firebaseAuthToken) url.searchParams.set("auth", firebaseAuthToken);
  return url.toString();
}
