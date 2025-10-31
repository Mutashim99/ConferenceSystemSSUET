import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';

// Get the JWT secret from environment variables
const JWT_SECRET = process.env.JWT_SECRET || 'your-super-secret-key-fallback';
const JWT_EXPIRES_IN = '7d';

/**
 * Hashes a plaintext password.
 * @param {string} password - The plaintext password to hash.
 * @returns {Promise<string>} - The hashed password.
 */
export const hashPassword = async (password) => {
  const salt = await bcrypt.genSalt(10);
  return bcrypt.hash(password, salt);
};

/**
 * Compares a plaintext password with a hashed password.
 * @param {string} plainPassword - The plaintext password.
 * @param {string} hashedPassword - The hashed password from the database.
 * @returns {Promise<boolean>} - True if the passwords match, false otherwise.
 */
export const comparePassword = async (plainPassword, hashedPassword) => {
  return bcrypt.compare(plainPassword, hashedPassword);
};

/**
 * Generates a JWT for a given user ID and role.
 * @param {string} userId - The user's ID.
 * @param {string} role - The user's role (e.g., 'AUTHOR', 'ADMIN').
 * @returns {string} - The generated JWT.
 */
export const generateToken = (userId, role) => {
  return jwt.sign({ id: userId, role }, JWT_SECRET, {
    expiresIn: JWT_EXPIRES_IN,
  });
};

/**
 * Verifies a JWT.
 * @param {string} token - The JWT to verify.
 * @returns {object | null} - The decoded payload if valid, null otherwise.
 */
export const verifyToken = (token) => {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch (error) {
    return null;
  }
};

/**
 * Sets the authentication token as an HTTP-only cookie.
 * @param {import('express').Response} res - The Express response object.
 * @param {string} token - The JWT to set in the cookie.
 */
export const setTokenCookie = (res, token) => {
  res.cookie("token", token, {
    httpOnly: true,
    secure: true, // MUST be true for cross-domain
    sameSite: "none", // MUST be 'none' for cross-domain
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
  });
};