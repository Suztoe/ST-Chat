import bcryptjs from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import { getDatabase } from './database';

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-key';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';

export interface UserPayload {
  id: string;
  username: string;
  email: string;
}

export async function hashPassword(password: string): Promise<string> {
  const salt = await bcryptjs.genSalt(10);
  return bcryptjs.hash(password, salt);
}

export async function comparePassword(password: string, hash: string): Promise<boolean> {
  return bcryptjs.compare(password, hash);
}

export function generateToken(user: UserPayload): string {
  return jwt.sign(user, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
}

export function verifyToken(token: string): UserPayload {
  return jwt.verify(token, JWT_SECRET) as UserPayload;
}

export function generateVerificationToken(): string {
  return uuidv4();
}

export function validateEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

export function validatePassword(password: string): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (password.length < 8) {
    errors.push('Password must be at least 8 characters long');
  }
  if (!/[A-Z]/.test(password)) {
    errors.push('Password must contain at least one uppercase letter');
  }
  if (!/[0-9]/.test(password)) {
    errors.push('Password must contain at least one number');
  }
  if (!/[!@#$%^&*]/.test(password)) {
    errors.push('Password must contain at least one special character (!@#$%^&*)');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

export async function registerUser(
  username: string,
  email: string,
  password: string
): Promise<{ user: UserPayload; token: string; verificationToken: string }> {
  const db = getDatabase();

  // Validate email
  if (!validateEmail(email)) {
    throw new Error('Invalid email format');
  }

  // Validate password
  const passwordValidation = validatePassword(password);
  if (!passwordValidation.valid) {
    throw new Error(passwordValidation.errors.join(', '));
  }

  // Check if user exists
  const existingUser = await db.get(
    'SELECT id FROM users WHERE email = ? OR username = ?',
    [email, username]
  );

  if (existingUser) {
    throw new Error('Email or username already exists');
  }

  // Hash password
  const passwordHash = await hashPassword(password);
  const userId = uuidv4();
  const verificationToken = generateVerificationToken();

  // Create user
  await db.run(
    `INSERT INTO users (id, username, email, password_hash, verification_token)
     VALUES (?, ?, ?, ?, ?)`,
    [userId, username, email, passwordHash, verificationToken]
  );

  const user: UserPayload = { id: userId, username, email };
  const token = generateToken(user);

  return { user, token, verificationToken };
}

export async function loginUser(
  email: string,
  password: string
): Promise<{ user: UserPayload; token: string }> {
  const db = getDatabase();

  const user = await db.get('SELECT * FROM users WHERE email = ?', [email]);

  if (!user) {
    throw new Error('Invalid email or password');
  }

  const isPasswordValid = await comparePassword(password, user.password_hash);
  if (!isPasswordValid) {
    throw new Error('Invalid email or password');
  }

  const userPayload: UserPayload = {
    id: user.id,
    username: user.username,
    email: user.email,
  };

  const token = generateToken(userPayload);

  return { user: userPayload, token };
}

export async function verifyEmail(token: string): Promise<void> {
  const db = getDatabase();

  const user = await db.get('SELECT * FROM users WHERE verification_token = ?', [token]);

  if (!user) {
    throw new Error('Invalid verification token');
  }

  await db.run('UPDATE users SET email_verified = 1, verification_token = NULL WHERE id = ?', [
    user.id,
  ]);
}

export async function updateTheme(userId: string, theme: 'dark' | 'light'): Promise<void> {
  const db = getDatabase();

  await db.run('UPDATE users SET theme = ? WHERE id = ?', [theme, userId]);
}
