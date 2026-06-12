import { randomBytes, randomUUID, pbkdf2Sync, timingSafeEqual } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import initSqlJs, { type Database, type SqlJsStatic } from "sql.js";

const defaultDatabasePath = resolve(process.cwd(), "runtime", "whiteblue-customers.sqlite");
const defaultTenantKey = "whiteblue";
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

let sqlModulePromise: Promise<SqlJsStatic> | undefined;

export class CustomerDatabase {
  private dbPromise: Promise<Database> | undefined;

  constructor(private readonly databasePath = process.env.WHITEBLUE_SQLITE_PATH ?? defaultDatabasePath) {}

  async registerCustomer(input: RegisterCustomerInput): Promise<AuthenticatedCustomer> {
    const db = await this.open();
    const normalized = normalizeRegistration(input);
    const tenant = this.ensureTenant(db, normalized.tenantKey, normalized.tenantName);
    const existing = this.findCustomerCredentials(db, tenant.tenantId, normalized.username);

    if (existing) {
      this.recordAuthEvent(db, tenant.tenantId, existing.customerId, "register", false, "Username already exists");
      this.persist(db);
      throw new CustomerAuthError("Username already exists for this tenant");
    }

    const customerId = randomUUID();
    const salt = randomBytes(16).toString("hex");
    const passwordHash = hashPassword(normalized.password, salt);
    const createdAt = new Date().toISOString();

    db.run(
      `INSERT INTO customers (id, tenant_id, username, password_hash, password_salt, full_name, email, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [customerId, tenant.tenantId, normalized.username, passwordHash, salt, normalized.fullName, normalized.email ?? null, createdAt]
    );

    this.recordAuthEvent(db, tenant.tenantId, customerId, "register", true);
    this.persist(db);

    return {
      customerId,
      tenantId: tenant.tenantId,
      tenantKey: tenant.tenantKey,
      tenantName: tenant.tenantName,
      username: normalized.username,
      fullName: normalized.fullName,
      email: normalized.email
    };
  }

  async validateLogin(input: LoginCustomerInput): Promise<AuthenticatedCustomer> {
    const db = await this.open();
    const tenantKey = normalizeTenantKey(input.tenantKey);
    const username = normalizeUsername(input.username);
    const tenant = this.findTenant(db, tenantKey);

    if (!tenant) {
      this.persist(db);
      throw new CustomerAuthError("Invalid username or password");
    }

    const customer = this.findCustomerCredentials(db, tenant.tenantId, username);
    if (!customer || !verifyPassword(input.password, customer.passwordSalt, customer.passwordHash)) {
      this.recordAuthEvent(db, tenant.tenantId, customer?.customerId, "login", false, "Invalid credentials");
      this.persist(db);
      throw new CustomerAuthError("Invalid username or password");
    }

    this.recordAuthEvent(db, tenant.tenantId, customer.customerId, "login", true);
    this.persist(db);

    return stripCredentials(customer);
  }

  async findCustomerByUsername(tenantKey: string, username: string): Promise<AuthenticatedCustomer | undefined> {
    const db = await this.open();
    const tenant = this.findTenant(db, normalizeTenantKey(tenantKey));
    if (!tenant) return undefined;

    const customer = this.findCustomerCredentials(db, tenant.tenantId, normalizeUsername(username));
    return customer ? stripCredentials(customer) : undefined;
  }

  private async open(): Promise<Database> {
    this.dbPromise ??= this.createDatabase();
    return this.dbPromise;
  }

  private async createDatabase(): Promise<Database> {
    const SQL = await getSqlModule();
    mkdirSync(dirname(this.databasePath), { recursive: true });
    const db = existsSync(this.databasePath) ? new SQL.Database(readFileSync(this.databasePath)) : new SQL.Database();
    this.ensureSchema(db);
    this.persist(db);
    return db;
  }

  private ensureSchema(db: Database): void {
    db.run(`
      CREATE TABLE IF NOT EXISTS tenants (
        id TEXT PRIMARY KEY,
        tenant_key TEXT NOT NULL UNIQUE,
        name TEXT NOT NULL,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS customers (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL,
        username TEXT NOT NULL,
        password_hash TEXT NOT NULL,
        password_salt TEXT NOT NULL,
        full_name TEXT NOT NULL,
        email TEXT,
        created_at TEXT NOT NULL,
        FOREIGN KEY (tenant_id) REFERENCES tenants(id),
        UNIQUE (tenant_id, username)
      );

      CREATE TABLE IF NOT EXISTS auth_events (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL,
        customer_id TEXT,
        event_type TEXT NOT NULL,
        success INTEGER NOT NULL,
        reason TEXT,
        created_at TEXT NOT NULL,
        FOREIGN KEY (tenant_id) REFERENCES tenants(id),
        FOREIGN KEY (customer_id) REFERENCES customers(id)
      );
    `);

    this.ensureTenant(db, defaultTenantKey, "WhiteBlue");
  }

  private ensureTenant(db: Database, tenantKey: string, tenantName = tenantKey): { tenantId: string; tenantKey: string; tenantName: string } {
    const normalizedKey = normalizeTenantKey(tenantKey);
    const existing = this.findTenant(db, normalizedKey);
    if (existing) return existing;

    const tenantId = randomUUID();
    const createdAt = new Date().toISOString();
    db.run("INSERT INTO tenants (id, tenant_key, name, created_at) VALUES (?, ?, ?, ?)", [
      tenantId,
      normalizedKey,
      tenantName.trim() || normalizedKey,
      createdAt
    ]);

    return { tenantId, tenantKey: normalizedKey, tenantName: tenantName.trim() || normalizedKey };
  }

  private findTenant(db: Database, tenantKey: string): { tenantId: string; tenantKey: string; tenantName: string } | undefined {
    const rows = db.exec("SELECT id, tenant_key, name FROM tenants WHERE tenant_key = ?", [tenantKey]);
    const values = rows[0]?.values[0];
    if (!values) return undefined;

    return {
      tenantId: String(values[0]),
      tenantKey: String(values[1]),
      tenantName: String(values[2])
    };
  }

  private findCustomerCredentials(db: Database, tenantId: string, username: string): CustomerCredentialRecord | undefined {
    const rows = db.exec(
      `SELECT c.id, t.id, t.tenant_key, t.name, c.username, c.full_name, c.email, c.password_hash, c.password_salt
       FROM customers c
       JOIN tenants t ON t.id = c.tenant_id
       WHERE c.tenant_id = ? AND c.username = ?`,
      [tenantId, username]
    );
    const values = rows[0]?.values[0];
    if (!values) return undefined;

    return {
      customerId: String(values[0]),
      tenantId: String(values[1]),
      tenantKey: String(values[2]),
      tenantName: String(values[3]),
      username: String(values[4]),
      fullName: String(values[5]),
      email: values[6] === null ? undefined : String(values[6]),
      passwordHash: String(values[7]),
      passwordSalt: String(values[8])
    };
  }

  private recordAuthEvent(
    db: Database,
    tenantId: string,
    customerId: string | undefined,
    eventType: "register" | "login",
    success: boolean,
    reason?: string
  ): void {
    db.run(
      `INSERT INTO auth_events (id, tenant_id, customer_id, event_type, success, reason, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [randomUUID(), tenantId, customerId ?? null, eventType, success ? 1 : 0, reason ?? null, new Date().toISOString()]
    );
  }

  private persist(db: Database): void {
    writeFileSync(this.databasePath, Buffer.from(db.export()));
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

function getSqlModule(): Promise<SqlJsStatic> {
  sqlModulePromise ??= initSqlJs({
    locateFile: (file) => resolve(process.cwd(), "node_modules", "sql.js", "dist", file)
  });
  return sqlModulePromise;
}
