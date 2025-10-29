import { Router } from 'express';
import { body } from 'express-validator';
import {
  registerReviewer,
  getAllPapers,
  getPaperById,
  deletePaper,
  approvePaper,
  updatePaperStatus,
  getAllReviewers,
  assignReviewersToPaper,
} from '../controllers/admin.controller.js';
// UPDATED IMPORT:
import { protect, isAdmin } from '../middlewares/auth.middleware.js';

const router = Router();

// All routes in this file are protected and require an ADMIN role
// UPDATED USAGE:
router.use(protect, isAdmin);

// --- User Management ---

// POST /api/admin/register-reviewer
router.post(
  '/register-reviewer',
  [
    body('email', 'Please include a valid email').isEmail(),
    body('firstName', 'First name is required').not().isEmpty(),
    body('lastName', 'Last name is required').not().isEmpty(),
  ],
  registerReviewer
);

// GET /api/admin/reviewers
router.get('/reviewers', getAllReviewers);

// --- Paper Management ---

// GET /api/admin/papers
router.get('/papers', getAllPapers);

// GET /api/admin/papers/:id
router.get('/papers/:id', getPaperById);

// DELETE /api/admin/papers/:id
router.delete('/papers/:id', deletePaper);

// PATCH /api/admin/papers/:id/approve
router.patch('/papers/:id/approve', approvePaper);

// PATCH /api/admin/papers/:id/status
router.patch(
  '/papers/:id/status',
  [body('status', 'Status is required').not().isEmpty()],
  updatePaperStatus
);

// POST /api/admin/papers/:id/assign
router.post(
  '/papers/:id/assign',
  [body('reviewerIds', 'Reviewer IDs must be an array').isArray({ min: 1 })],
  assignReviewersToPaper
);

export default router;

