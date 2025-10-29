import { Router } from 'express';
import { body } from 'express-validator';
import {
  registerAuthor,
  loginUser,
  logoutUser,
  getMyProfile,
} from '../controllers/auth.controller.js';
import { protect } from '../middlewares/auth.middleware.js';

const router = Router();

// @route   POST /api/auth/register
// @desc    Register a new author
// @access  Public
router.post(
  '/register',
  [
    // Validation middleware
    body('email', 'Please include a valid email').isEmail(),
    body('password', 'Password must be 6 or more characters').isLength({ min: 6 }),
    body('firstName', 'First name is required').not().isEmpty(),
    body('lastName', 'Last name is required').not().isEmpty(),
  ],
  registerAuthor
);

// @route   POST /api/auth/login
// @desc    Login a user (author, reviewer, or admin)
// @access  Public
router.post(
  '/login',
  [
    body('email', 'Please include a valid email').isEmail(),
    body('password', 'Password is required').exists(),
  ],
  loginUser
);

// @route   POST /api/auth/logout
// @desc    Logout a user
// @access  Private (requires user to be logged in)
router.post('/logout', logoutUser);

// @route   GET /api/auth/me
// @desc    Get current user's profile
// @access  Private
router.get('/me', protect, getMyProfile);

export default router;
