import { Router } from 'express';
import { body } from 'express-validator';
import { protect, isReviewer } from '../middlewares/auth.middleware.js';
import {
  getAssignedPapers,
  getAssignedPaperById,
  submitReview,
  submitFeedback,
} from '../controllers/reviewer.controller.js';

const router = Router();

// Apply 'protect' and 'isReviewer' middleware to all routes in this file
router.use(protect, isReviewer);

// @route   GET /api/reviewer/papers
// @desc    Get all papers assigned to this reviewer
// @access  Private (Reviewer only)
router.get('/papers', getAssignedPapers);

// @route   GET /api/reviewer/papers/:paperId
// @desc    Get a single assigned paper by ID
// @access  Private (Reviewer only)
router.get('/papers/:paperId', getAssignedPaperById);

// @route   POST /api/reviewer/papers/:paperId/review
// @desc    Submit or update a review for a paper
// @access  Private (Reviewer only)
router.post(
  '/papers/:paperId/review',
  [
    body('comments', 'Comments are required').not().isEmpty(),
    body('rating', 'Rating must be a number between 1 and 5').isInt({ min: 1, max: 5 }),
    body('recommendation', 'A valid recommendation is required').isIn([
      'ACCEPT',
      'REJECT',
      'MINOR_REVISION',
      'MAJOR_REVISION',
    ]),
  ],
  submitReview
);

// @route   POST /api/reviewer/papers/:paperId/feedback
// @desc    Send a feedback message (part of the conversation)
// @access  Private (Reviewer only)
router.post(
  '/papers/:paperId/feedback',
  [body('message', 'Message cannot be empty').not().isEmpty()],
  submitFeedback
);

export default router;
