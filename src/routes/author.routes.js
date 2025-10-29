import { Router } from "express";
import { body } from "express-validator";
import { protect, isAuthor } from "../middlewares/auth.middleware.js";
import upload from "../utils/cloudinary.js";
import {
  submitPaper,
  getMySubmittedPapers,
} from "../controllers/author.controller.js";

const router = Router();

// @route   POST /api/author/submit-paper
// @desc    Submit a new conference paper
// @access  Private (Author only)
router.post(
  "/submit-paper",
  [
    protect,
    isAuthor,
    // This 'upload.single' middleware handles the file upload to Cloudinary
    // It must come before the validation checks for req.body
    upload.single("paperFile"), // 'paperFile' is the name of the form field
    // Validation for text fields
    body("title", "Title is required").not().isEmpty(),
    body("abstract", "Abstract is required").not().isEmpty(),
    // Optional fields can be checked with .optional()
    body("coAuthors")
      .optional()
      .isArray()
      .withMessage("Co-authors must be an array of objects"),
  ],
  submitPaper
);

// @route   GET /api/author/my-papers
// @desc    Get all papers submitted by the current author
// @access  Private (Author only)
router.get("/my-papers", [protect, isAuthor], getMySubmittedPapers);

export default router;
