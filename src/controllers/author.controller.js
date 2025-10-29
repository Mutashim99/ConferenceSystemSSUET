import prisma from '../libs/prisma.js';
import { validationResult } from 'express-validator';
import { v2 as cloudinary } from 'cloudinary';

// Configure Cloudinary (needed for deleting files)
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

/**
 * Submit a new paper.
 * @route POST /api/author/papers/submit
 */
export const submitPaper = async (req, res) => {
  // ... (existing submitPaper function from our previous discussion) ...
  // This function is unchanged.
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  if (!req.file) {
    return res.status(400).json({ message: 'Paper file is required' });
  }

  const { title, abstract, keywords, topicArea, coAuthors } = req.body;
  const authorId = req.user.id;

  try {
    const newPaper = await prisma.paper.create({
      data: {
        title,
        abstract,
        fileUrl: req.file.path, // URL from Cloudinary
        keywords,
        topicArea,
        authorId: authorId,
        // Create co-authors in the same transaction
        coAuthors: coAuthors
          ? {
              create: JSON.parse(coAuthors).map((coAuthor) => ({
                name: coAuthor.name,
                email: coAuthor.email,
                affiliation: coAuthor.affiliation,
              })),
            }
          : undefined,
      },
      include: {
        coAuthors: true,
      },
    });

    res.status(201).json({ message: 'Paper submitted successfully', paper: newPaper });
  } catch (error) {
    console.error('Error submitting paper:', error);
    // If paper creation fails, delete the uploaded file from Cloudinary
    if (req.file) {
      const publicId = `conference_papers/${req.file.filename.split('.')[0]}`;
      await cloudinary.uploader.destroy(publicId, { resource_type: 'raw' });
    }
    res.status(500).json({ message: 'Server error' });
  }
};


/**
 * Get all papers submitted by the logged-in author.
 * @route GET /api/author/papers
 */
export const getSubmittedPapers = async (req, res) => {
  // ... (existing getSubmittedPapers function from our previous discussion) ...
  // This function is unchanged.
  const authorId = req.user.id;

  try {
    const papers = await prisma.paper.findMany({
      where: {
        authorId: authorId,
      },
      include: {
        coAuthors: true,
        _count: {
          select: { reviews: true },
        },
      },
      orderBy: {
        submittedAt: 'desc',
      },
    });

    res.status(200).json(papers);
  } catch (error) {
    console.error('Error fetching submitted papers:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

/**
 * Get a single submitted paper by ID (for the author).
 * @route GET /api/author/papers/:paperId
 */
export const getAuthorPaperById = async (req, res) => {
  const authorId = req.user.id;
  const { paperId } = req.params;

  try {
    const paper = await prisma.paper.findFirst({
      where: {
        id: parseInt(paperId),
        authorId: authorId, // Ensure author can only see their own paper
      },
      include: {
        coAuthors: true,
        // Show reviews (they are "blind" by default, as reviewer info isn't attached)
        reviews: {
          select: {
            id: true,
            comments: true,
            rating: true,
            recommendation: true,
            reviewedAt: true,
          },
        },
        // Show the full feedback/conversation thread
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
      return res.status(404).json({ message: 'Paper not found or you are not the author.' });
    }

    res.status(200).json(paper);
  } catch (error) {
    console.error('Error fetching paper details:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

/**
 * Submit a feedback message for a paper (Author's reply).
 * @route POST /api/author/papers/:paperId/feedback
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
    // 1. Check if author owns this paper
    const paper = await prisma.paper.findFirst({
      where: {
        id: parseInt(paperId),
        authorId: senderId,
      },
    });

    if (!paper) {
      return res.status(403).json({ message: 'You are not the author of this paper.' });
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

/**
 * Resubmit a paper with revisions.
 * @route POST /api/author/papers/:paperId/resubmit
 */
export const resubmitPaper = async (req, res) => {
  const { paperId } = req.params;
  const authorId = req.user.id;

  if (!req.file) {
    return res.status(400).json({ message: 'A revised paper file is required' });
  }

  try {
    // 1. Find the original paper and check ownership
    const paper = await prisma.paper.findFirst({
      where: {
        id: parseInt(paperId),
        authorId: authorId,
      },
    });

    if (!paper) {
      return res.status(404).json({ message: 'Paper not found or you are not the author.' });
    }

    // 2. Check if the paper is in a state that allows resubmission
    if (paper.status !== 'REVISION_REQUIRED') {
      // Clean up the newly uploaded file if not needed
      const publicId = `conference_papers/${req.file.filename.split('.')[0]}`;
      await cloudinary.uploader.destroy(publicId, { resource_type: 'raw' });
      return res.status(400).json({ message: `Paper cannot be resubmitted with status: ${paper.status}` });
    }

    // 3. Store the old file URL
    const oldFileUrl = paper.fileUrl;

    // 4. Update the paper with new file and set status to RESUBMITTED
    const updatedPaper = await prisma.paper.update({
      where: {
        id: parseInt(paperId),
      },
      data: {
        fileUrl: req.file.path, // The new file URL from Cloudinary
        status: 'RESUBMITTED', // Let admin know it's ready for another look
      },
    });

    // 5. Delete the *old* file from Cloudinary
    if (oldFileUrl) {
      try {
        const urlParts = oldFileUrl.split('/');
        const publicId = urlParts.slice(urlParts.indexOf('conference_papers')).join('/').split('.')[0];
        await cloudinary.uploader.destroy(publicId, { resource_type: 'raw' });
      } catch (cloudinaryError) {
        console.warn('Could not delete old file from Cloudinary:', cloudinaryError.message);
      }
    }

    res.status(200).json({ message: 'Paper resubmitted successfully', paper: updatedPaper });
  } catch (error) {
    console.error('Error resubmitting paper:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

