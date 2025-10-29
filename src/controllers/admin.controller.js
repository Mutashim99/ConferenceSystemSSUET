import prisma from '../libs/prisma.js';
import { hashPassword } from '../utils/auth.js';
import { validationResult } from 'express-validator';
import { randomBytes } from 'crypto';
import { sendEmail } from '../utils/mail.js';
import { v2 as cloudinary } from 'cloudinary';

// Configure Cloudinary (needed for deleting files)
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

/**
 * Register a new REVIEWER (by Admin).
 * @route POST /api/admin/register-reviewer
 */
export const registerReviewer = async (req, res) => {
  // 1. Validate request body
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const { firstName, middleName, lastName, affiliation, email } = req.body;

  try {
    // 2. Check if user already exists
    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser) {
      return res.status(400).json({ message: 'User already exists with this email' });
    }

    // 3. Generate a temporary random password
    const tempPassword = randomBytes(8).toString('hex');
    const hashedPassword = await hashPassword(tempPassword);

    // 4. Create the new user with REVIEWER role
    const user = await prisma.user.create({
      data: {
        firstName,
        middleName,
        lastName,
        affiliation,
        email,
        password: hashedPassword,
        role: 'REVIEWER',
      },
      select: { // Select data to return (exclude password)
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
      },
    });

    // 5. Send registration email with credentials
    const loginUrl = 'http://localhost:3000/login'; // Your frontend login URL
    await sendEmail({
      to: user.email,
      subject: 'You have been registered as a reviewer',
      text: `Hello ${user.firstName},\n\nYou have been registered as a reviewer for our conference.\n\nYour login credentials are:\nEmail: ${user.email}\nPassword: ${tempPassword}\n\nPlease login at: ${loginUrl}\n\nThank you!`,
      html: `<p>Hello ${user.firstName},</p>
             <p>You have been registered as a reviewer for our conference.</p>
             <p>Your login credentials are:</p>
             <ul>
               <li>Email: ${user.email}</li>
               <li>Password: <strong>${tempPassword}</strong></li>
             </ul>
             <p>Please <a href="${loginUrl}">login here</a> to access your dashboard.</p>
             <p>Thank you!</p>`,
    });

    // 6. Send response
    res.status(201).json({
      message: 'Reviewer registered successfully. An email has been sent with credentials.',
      user,
    });
  } catch (error) {
    console.error('Reviewer registration error:', error);
    res.status(500).json({ message: 'Server error during reviewer registration' });
  }
};

/**
 * Get all submitted papers.
 * @route GET /api/admin/papers
 */
export const getAllPapers = async (req, res) => {
  try {
    const papers = await prisma.paper.findMany({
      include: {
        author: {
          select: {
            firstName: true,
            lastName: true,
            email: true,
          },
        },
        coAuthors: true,
      },
      orderBy: {
        submittedAt: 'desc',
      },
    });
    res.status(200).json(papers);
  } catch (error) {
    console.error('Error fetching all papers:', error);
    res.status(500).json({ message: 'Server error fetching papers' });
  }
};

/**
 * Get a single paper by ID (for details).
 * @route GET /api/admin/papers/:id
 */
export const getPaperById = async (req, res) => {
  const { id } = req.params;

  try {
    const paper = await prisma.paper.findUnique({
      where: { id: parseInt(id) },
      include: {
        author: {
          select: {
            firstName: true,
            lastName: true,
            email: true,
            affiliation: true,
          },
        },
        coAuthors: true,
        assignments: {
          include: {
            reviewer: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true,
              },
            },
          },
        },
        reviews: true,
      },
    });

    if (!paper) {
      return res.status(404).json({ message: 'Paper not found' });
    }

    res.status(200).json(paper);
  } catch (error) {
    console.error('Error fetching paper by ID:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

/**
 * Delete a paper (if inappropriate).
 * @route DELETE /api/admin/papers/:id
 */
export const deletePaper = async (req, res) => {
  const { id } = req.params;

  try {
    // 1. Find the paper to get its fileUrl
    const paper = await prisma.paper.findUnique({
      where: { id: parseInt(id) },
      select: { fileUrl: true },
    });

    if (!paper) {
      return res.status(404).json({ message: 'Paper not found' });
    }

    // 2. Delete the file from Cloudinary
    if (paper.fileUrl) {
      try {
        // Extract public_id from the URL
        // Example URL: http://res.cloudinary.com/cloud_name/raw/upload/v12345/folder/file-123.pdf
        const urlParts = paper.fileUrl.split('/');
        // The public_id is 'folder/file-123'
        const publicId = urlParts.slice(urlParts.indexOf('conference_papers')).join('/').split('.')[0];
        
        await cloudinary.uploader.destroy(publicId, {
          resource_type: 'raw',
        });
      } catch (cloudinaryError) {
        console.warn('Could not delete file from Cloudinary:', cloudinaryError.message);
        // We'll proceed with deleting from the DB anyway.
      }
    }

    // 3. Delete the paper from the database (this will cascade)
    // Deleting the paper will also delete related CoAuthors, Reviews, Feedbacks, and Assignments
    // because of the relations defined in your schema.
    await prisma.paper.delete({
      where: { id: parseInt(id) },
    });

    res.status(200).json({ message: 'Paper deleted successfully' });
  } catch (error) {
    console.error('Error deleting paper:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

/**
 * Approve a paper.
 * @route PATCH /api/admin/papers/:id/approve
 */
export const approvePaper = async (req, res) => {
  const { id } = req.params;

  try {
    const paper = await prisma.paper.findUnique({
      where: { id: parseInt(id) },
    });

    if (!paper) {
      return res.status(404).json({ message: 'Paper not found' });
    }

    if (paper.status !== 'PENDING_APPROVAL') {
      return res.status(400).json({ message: `Paper is already ${paper.status} and cannot be approved.` });
    }

    const updatedPaper = await prisma.paper.update({
      where: { id: parseInt(id) },
      data: {
        status: 'PENDING_REVIEW',
      },
    });

    res.status(200).json({ message: 'Paper approved successfully', paper: updatedPaper });
  } catch (error) {
    console.error('Error approving paper:', error);
    res.status(500).json({ message: 'Server error' });
  }
};


/**
 * Get all users with the REVIEWER role.
 * @route GET /api/admin/reviewers
 */
export const getAllReviewers = async (req, res) => {
  try {
    const reviewers = await prisma.user.findMany({
      where: {
        role: 'REVIEWER',
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        affiliation: true,
      },
      orderBy: {
        lastName: 'asc',
      },
    });
    res.status(200).json(reviewers);
  } catch (error) {
    console.error('Error fetching reviewers:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

/**
 * Assign one or more reviewers to a paper.
 * @route POST /api/admin/papers/:id/assign
 */
export const assignReviewersToPaper = async (req, res) => {
  const { id } = req.params;
  const { reviewerIds } = req.body; // Expect an array of reviewer IDs: [1, 2, 3]

  if (!reviewerIds || !Array.isArray(reviewerIds) || reviewerIds.length === 0) {
    return res.status(400).json({ message: 'Reviewer IDs must be a non-empty array' });
  }

  try {
    const paperIdInt = parseInt(id);

    // 1. Prepare data for ReviewerAssignment
    const assignmentData = reviewerIds.map((reviewerId) => ({
      paperId: paperIdInt,
      reviewerId: reviewerId,
    }));

    // 2. Create the assignments
    // 'skipDuplicates: true' will ignore any assignments that already exist
    await prisma.reviewerAssignment.createMany({
      data: assignmentData,
      skipDuplicates: true,
    });

    // 3. Update the paper status to UNDER_REVIEW
    await prisma.paper.update({
      where: { id: paperIdInt },
      data: {
        status: 'UNDER_REVIEW',
      },
    });

    // 4. (Optional but recommended) Send emails to assigned reviewers
    const reviewers = await prisma.user.findMany({
      where: {
        id: { in: reviewerIds },
      },
    });

    const paper = await prisma.paper.findUnique({ where: { id: paperIdInt }, select: { title: true }});

    for (const reviewer of reviewers) {
      const dashboardUrl = 'http://localhost:3000/reviewer/dashboard'; // Your frontend URL
      await sendEmail({
        to: reviewer.email,
        subject: 'New Paper Assigned for Review',
        text: `Hello ${reviewer.firstName},\n\nA new paper, "${paper.title}", has been assigned to you for review.\n\nPlease login to your dashboard to view the paper and submit your review: ${dashboardUrl}\n\nThank you!`,
        html: `<p>Hello ${reviewer.firstName},</p>
               <p>A new paper, "<strong>${paper.title}</strong>", has been assigned to you for review.</p>
               <p>Please <a href="${dashboardUrl}">login to your dashboard</a> to view the paper and submit your review.</p>
               <p>Thank you!</p>`,
      });
    }

    res.status(201).json({ message: 'Reviewers assigned successfully' });
  } catch (error) {
    console.error('Error assigning reviewers:', error);
    if (error.code === 'P2003') { // Foreign key constraint failed
      return res.status(404).json({ message: 'One or more reviewers or the paper do not exist.' });
    }
    res.status(500).json({ message: 'Server error' });
  }
};


