import prisma from '../libs/prisma.js';
import { validationResult } from 'express-validator';

/**
 * Get all papers assigned to the logged-in reviewer.
 * @route GET /api/reviewer/papers
 */
export const getAssignedPapers = async (req, res) => {
  const reviewerId = req.user.id;

  try {
    // Find all papers where the reviewer has an assignment
    const papers = await prisma.paper.findMany({
      where: {
        assignments: {
          some: {
            reviewerId: reviewerId,
          },
        },
      },
      include: {
        // Include basic info for the list view
        author: {
          select: {
            firstName: true,
            lastName: true,
          },
        },
        // Check if the reviewer has already submitted a review
        reviews: {
          where: {
            reviewerId: reviewerId,
          },
          select: {
            id: true, // Just need to know if it exists
          },
        },
      },
      orderBy: {
        submittedAt: 'desc',
      },
    });

    // Clean up the response to be more useful
    const response = papers.map(paper => ({
      ...paper,
      // Add a boolean to tell the frontend if a review is done
      hasReviewed: paper.reviews.length > 0,
    }));

    res.status(200).json(response);
  } catch (error) {
    console.error('Error fetching assigned papers:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

/**
 * Get a single assigned paper by ID with all details.
 * @route GET /api/reviewer/papers/:paperId
 */
export const getAssignedPaperById = async (req, res) => {
  const reviewerId = req.user.id;
  const { paperId } = req.params;

  try {
    // Find the paper IF the reviewer is assigned to it
    const paper = await prisma.paper.findFirst({
      where: {
        id: parseInt(paperId),
        assignments: {
          some: {
            reviewerId: reviewerId,
          },
        },
      },
      include: {
        author: {
          select: {
            firstName: true,
            lastName: true,
            affiliation: true,
          },
        },
        coAuthors: true,
        // Get all reviews, but hide who wrote them (blind review)
        reviews: {
          select: {
            id: true,
            comments: true,
            rating: true,
            recommendation: true,
            reviewedAt: true,
            reviewerId:true
          },
        },
        // Get the full feedback/conversation thread
        feedbacks: {
          include: {
            sender: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                role: true,
              },
            },
          },
          orderBy: {
            sentAt: 'asc',
          },
        },
      },
    });

    if (!paper) {
      return res.status(404).json({ message: 'Paper not found or you are not assigned to it.' });
    }

    res.status(200).json(paper);
  } catch (error) {
    console.error('Error fetching paper details:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

/**
 * Submit or update a review for a paper.
 * @route POST /api/reviewer/papers/:paperId/review
 */
export const submitReview = async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const reviewerId = req.user.id;
  const { paperId } = req.params;
  const { comments, rating, recommendation } = req.body;

  try {
    // 1. Check if reviewer is actually assigned to this paper
    const assignment = await prisma.reviewerAssignment.findUnique({
      where: {
        reviewerId_paperId: {
          reviewerId: reviewerId,
          paperId: parseInt(paperId),
        },
      },
    });

    if (!assignment) {
      return res.status(403).json({ message: 'You are not assigned to review this paper.' });
    }

    // 2. Use upsert: create review if it doesn't exist, update it if it does
    const review = await prisma.review.upsert({
      where: {
        paperId_reviewerId: {
          paperId: parseInt(paperId),
          reviewerId: reviewerId,
        },
      },
      // What to create if it doesn't exist
      create: {
        paperId: parseInt(paperId),
        reviewerId: reviewerId,
        comments,
        rating: parseInt(rating),
        recommendation, // e.g., 'ACCEPT', 'REJECT', etc.
      },
      // What to update if it does exist
      update: {
        comments,
        rating: parseInt(rating),
        recommendation,
        reviewedAt: new Date(), // Update the timestamp
      },
    });

    // Optionally, update paper status if this is the first review
    // (This could also be a job for the admin later)
    await prisma.paper.updateMany({
      where: {
        id: parseInt(paperId),
        status: 'PENDING_REVIEW' // Only update if it's pending
      },
      data: {
        status: 'UNDER_REVIEW' // Mark as in progress
      }
    });

    res.status(201).json({ message: 'Review submitted successfully', review });
  } catch (error) {
    console.error('Error submitting review:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

/**
 * Submit a feedback message for a paper.
 * @route POST /api/reviewer/papers/:paperId/feedback
 */
export const submitFeedback = async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const senderId = req.user.id;
  const { paperId } = req.params;
  const { message } = req.body;

  try {
    // 1. Check if reviewer is assigned (only assigned reviewers can comment)
    const assignment = await prisma.reviewerAssignment.findUnique({
      where: {
        reviewerId_paperId: {
          reviewerId: senderId,
          paperId: parseInt(paperId),
        },
      },
    });

    if (!assignment) {
      return res.status(403).json({ message: 'You are not assigned to this paper.' });
    }

    // 2. Create the feedback message
    const feedback = await prisma.feedback.create({
      data: {
        paperId: parseInt(paperId),
        senderId: senderId,
        message: message,
      },
    });

    res.status(201).json({ message: 'Feedback sent', feedback });
  } catch (error) {
    console.error('Error submitting feedback:', error);
    res.status(500).json({ message: 'Server error' });
  }
};
