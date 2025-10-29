import prisma from '../libs/prisma.js';
import { verifyToken } from '../utils/auth.js';

/**
 * Middleware to protect routes.
 * Checks for a valid JWT in the 'token' cookie.
 * If valid, attaches the user to req.user.
 */
export const protect = async (req, res, next) => {
  const token = req.cookies.token;

  if (!token) {
    return res.status(401).json({ message: 'Not authorized, no token' });
  }

  const decoded = verifyToken(token);

  if (!decoded) {
    return res.status(401).json({ message: 'Not authorized, token failed' });
  }

  try {
    // Find user by ID from the token and attach it to the request
    // Exclude the password from the user object
    const user = await prisma.user.findUnique({
      where: { id: decoded.id },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        affiliation: true,
        createdAt: true,
      },
    });

    if (!user) {
      return res.status(401).json({ message: 'Not authorized, user not found' });
    }

    req.user = user;
    next();
  } catch (error) {
    console.error('Auth middleware error:', error);
    res.status(401).json({ message: 'Not authorized, token failed' });
  }
};

/**
 * Middleware to check if the user is an ADMIN.
 * Must be used *after* the protect middleware.
 */
export const isAdmin = (req, res, next) => {
  if (req.user && req.user.role === 'ADMIN') {
    next();
  } else {
    res.status(403).json({ message: 'Not authorized, admin role required' });
  }
};

/**
 * Middleware to check if the user is a REVIEWER.
 * Must be used *after* the protect middleware.
 */
export const isReviewer = (req, res, next) => {
  if (req.user && req.user.role === 'REVIEWER') {
    next();
  } else {
    res.status(403).json({ message: 'Not authorized, reviewer role required' });
  }
};

/**
 * Middleware to check if the user is an AUTHOR.
 * Must be used *after* the protect middleware.
 */
export const isAuthor = (req, res, next) => {
  if (req.user && req.user.role === 'AUTHOR') {
    next();
  } else {
    res.status(403).json({ message: 'Not authorized, author role required' });
  }
};
