import { Router } from 'express';
import { body } from 'express-validator';
import { protect, isAuthor } from '../middlewares/auth.middleware.js';
import {
  submitPaper,
  getSubmittedPapers, // <-- Fix: Was 'getMySubmittedPapers'
  getAuthorPaperById, // New
  submitFeedback,     // New
  resubmitPaper,      // New
  uploadCameraReady
} from '../controllers/author.controller.js';
import  upload  from '../utils/cloudinary.js';

const router = Router();

// Apply 'protect' and 'isAuthor' middleware to all routes in this file
router.use(protect, isAuthor);

// @route   POST /api/author/papers/submit
// @desc    Submit a new paper
// @access  Private (Author only)
router.post(
  '/papers/submit',
  upload.single('paper'), // 'paper' is the field name for the file
  [
    body('title', 'Title is required').not().isEmpty(),
    body('abstract', 'Abstract is required').not().isEmpty(),
    // Add more validation as needed
  ],
  submitPaper
);

// @route   GET /api/author/papers
// @desc    Get all papers for the logged-in author
// @access  Private (Author only)
router.get('/papers', getSubmittedPapers);

// @route   GET /api/author/papers/:paperId
// @desc    Get details for a single paper (to see reviews/feedback)
// @access  Private (Author only)
router.get('/papers/:paperId', getAuthorPaperById);

// @route   POST /api/author/papers/:paperId/feedback
// @desc    Post a feedback message (part of the conversation)
// @access  Private (Author only)
router.post(
  '/papers/:paperId/feedback',
  [body('message', 'Message cannot be empty').not().isEmpty()],
  submitFeedback
);

// @route   POST /api/author/papers/:paperId/resubmit
// @desc    Resubmit a paper with revisions (uploads new file)
// @access  Private (Author only)
router.post(
  '/papers/:paperId/resubmit',
  upload.single('paper'), // Use multer for the new file upload
  resubmitPaper
);

// --- NEW ROUTE: Upload Camera Ready Paper ---
// @route   POST /api/author/papers/:paperId/camera-ready
// @desc    Upload the final version after acceptance
router.post(
  '/papers/:paperId/camera-ready',
  upload.single('cameraReady'), // <--- NOTE: Field name is 'cameraReady'
  uploadCameraReady
);

export default router;


