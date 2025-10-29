import { Router } from 'express';
import {
  registerReviewer,
  getAllPapers,
  getPaperById,
  deletePaper,
  getAllReviewers,
  assignReviewersToPaper,
} from '../controllers/admin.controller.js';
import { protect, isAdmin } from '../middlewares/auth.middleware.js';
import { body } from 'express-validator';

const router = Router();

// @route   POST /api/admin/register-reviewer
// @desc    Admin creates a new reviewer profile
// @access  Private (Admin only)
router.post(
  '/register-reviewer',
  [
    // Middlewares are executed in order:
    // 1. protect: Checks for valid token
    // 2. isAdmin: Checks if user role is ADMIN
    // 3. Validation checks
    protect,
    isAdmin,
    body('email', 'Please include a valid email').isEmail(),
    body('firstName', 'First name is required').not().isEmpty(),
    body('lastName', 'Last name is required').not().isEmpty(),
  ],
  registerReviewer
);

// --- Paper Management ---

// @route   GET /api/admin/papers
// @desc    Admin gets all submitted papers
// @access  Private (Admin only)
router.get(
  '/papers',
  [protect, isAdmin],
  getAllPapers
);

// @route   GET /api/admin/papers/:id
// @desc    Admin gets a single paper by ID
// @access  Private (Admin only)
router.get(
  '/papers/:id',
  [protect, isAdmin],
  getPaperById
);

// @route   DELETE /api/admin/papers/:id
// @desc    Admin deletes a paper
// @access  Private (Admin only)
router.delete(
  '/papers/:id',
  [protect, isAdmin],
  deletePaper
);

// --- Reviewer Management ---

// @route   GET /api/admin/reviewers
// @desc    Admin gets a list of all users with REVIEWER role
// @access  Private (Admin only)
router.get(
  '/reviewers',
  [protect, isAdmin],
  getAllReviewers
);

// @route   POST /api/admin/papers/:id/assign
// @desc    Admin assigns reviewers to a paper
// @access  Private (Admin only)
router.post(
  '/papers/:id/assign',
  [
    protect,
    isAdmin,
    body('reviewerIds', 'Reviewer IDs must be an array').isArray({ min: 1 }),
  ],
  assignReviewersToPaper
);

export default router;

