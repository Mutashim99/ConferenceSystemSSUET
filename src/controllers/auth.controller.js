import prisma from '../libs/prisma.js';
import {
  hashPassword,
  comparePassword,
  generateToken,
  setTokenCookie,
} from '../utils/auth.js';
import { validationResult } from 'express-validator';

/**
 * Register a new user (AUTHOR).
 * @route POST /api/auth/register
 */
export const registerAuthor = async (req, res) => {
  // 1. Validate request body
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const { firstName, middleName, lastName, affiliation, email, password } = req.body;

  try {
    // 2. Check if user already exists
    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser) {
      return res.status(400).json({ message: 'User already exists with this email' });
    }

    // 3. Hash the password
    const hashedPassword = await hashPassword(password);

    // 4. Create the new user with AUTHOR role
    const user = await prisma.user.create({
      data: {
        firstName,
        middleName,
        lastName,
        affiliation,
        email,
        password: hashedPassword,
        role: 'AUTHOR', // Default role for public registration
      },
      select: { // Select the data to return (exclude password)
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        affiliation: true,
        createdAt: true,
      },
    });

    // 5. Generate JWT
    const token = generateToken(user.id, user.role);

    // 6. Set token in cookie
    setTokenCookie(res, token);

    // 7. Send response
    res.status(201).json({
      message: 'User registered successfully',
      user,
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ message: 'Server error during registration' });
  }
};

/**
 * Login a user.
 * @route POST /api/auth/login
 */
export const loginUser = async (req, res) => {
  // 1. Validate request body
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const { email, password } = req.body;

  try {
    // 2. Find user by email
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    // 3. Compare passwords
    const isMatch = await comparePassword(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    // 4. Generate JWT
    const token = generateToken(user.id, user.role);

    // 5. Set token in cookie
    setTokenCookie(res, token);
    
    // 6. Send response (excluding password)
    const { password: _, ...userWithoutPassword } = user;

    res.status(200).json({
      message: 'Logged in successfully',
      user: userWithoutPassword,
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ message: 'Server error during login' });
  }
};

/**
 * Logout a user.
 * @route POST /api/auth/logout
 */
export const logoutUser = (req, res) => {
  // Clear the cookie by setting an empty token and new expiry date
  res.cookie('token', '', {
    httpOnly: true,
    secure: false,
    sameSite: 'none',
    expires: new Date(0), // Set to a past date
  });
  res.status(200).json({ message: 'Logged out successfully' });
};

/**
 * Get the currently authenticated user's profile.
 * @route GET /api/auth/me
 */
export const getMyProfile = async (req, res) => {
  // The 'protect' middleware already attached 'req.user'
  // req.user contains the safe user object (without password)
  res.status(200).json(req.user);
};

/**
 * @desc    Get the logged in user's data
 * @route   GET /api/auth/me
 * @access  Private
 */
export const getMe = (req, res) => {
  // req.user is attached by the 'protect' middleware
  res.status(200).json(req.user);
};