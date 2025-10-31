import prisma from "../libs/prisma.js";
import { validationResult } from "express-validator";
import bcrypt from "bcrypt";
import { sendEmail } from "../utils/mail.js";
import { v2 as cloudinary } from "cloudinary";

// Configure Cloudinary (needed for deleting files)
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

/**
 * Register a new user with the REVIEWER role.
 * @route POST /api/admin/register-reviewer
 */
export const registerReviewer = async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const { firstName, middleName, lastName, affiliation, email } = req.body;

  try {
    // Check if user already exists
    let user = await prisma.user.findUnique({ where: { email } });
    if (user) {
      return res
        .status(400)
        .json({ message: "User with this email already exists" });
    }

    // Generate a random password (e.g., 8 characters)
    const tempPassword = Math.random().toString(36).slice(-8);
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(tempPassword, salt);

    // Create the new reviewer user
    user = await prisma.user.create({
      data: {
        firstName,
        middleName,
        lastName,
        affiliation,
        email,
        password: hashedPassword,
        role: "REVIEWER",
      },
    });

    // Send email to the new reviewer
    const mailSubject = "You are invited as a Reviewer";
    const mailText = `
      Hello ${firstName},
      
      You have been registered as a reviewer for our conference system.
      You can log in using the following credentials:
      
      Email: ${email}
      Password: ${tempPassword}
      
      Please change your password after your first login.
      
      Best regards,
      Conference Admin Team
    `;

    await sendEmail({
      to: email,
      subject: mailSubject,
      text: mailText,
    });

    res.status(201).json({
      message: "Reviewer registered successfully. Credentials sent via email.",
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
      },
    });
  } catch (error) {
    console.error("Error registering reviewer:", error);
    res.status(500).json({ message: "Server error" });
  }
};

/**
 * Get all papers (for admin dashboard).
 * @route GET /api/admin/papers
 */
export const getAllPapers = async (req, res) => {
  try {
    const papers = await prisma.paper.findMany({
      include: {
        author: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
        _count: {
          select: { reviews: true, assignments: true },
        },
      },
      orderBy: {
        submittedAt: "desc",
      },
    });

    res.status(200).json(papers);
  } catch (error) {
    console.error("Error fetching all papers:", error);
    res.status(500).json({ message: "Server error" });
  }
};

/**
 * Get a single paper by ID (for admin).
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
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            affiliation: true,
          },
        },
        coAuthors: true,
        // Include reviews and the reviewer's info
        reviews: {
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
        // Include the full feedback thread
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
            sentAt: "asc",
          },
        },
        assignments: {
          include: {
            reviewer: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
              },
            },
          },
        },
      },
    });

    if (!paper) {
      return res.status(404).json({ message: "Paper not found" });
    }

    res.status(200).json(paper);
  } catch (error) {
    console.error("Error fetching paper details:", error);
    res.status(500).json({ message: "Server error" });
  }
};

/**
 * Delete a paper (if inappropriate).
 * @route DELETE /api/admin/papers/:id
 */
export const deletePaper = async (req, res) => {
  const { id } = req.params;

  try {
    const paper = await prisma.paper.findUnique({
      where: { id: parseInt(id) },
    });

    if (!paper) {
      return res.status(404).json({ message: "Paper not found" });
    }

    // 1. Delete the file from Cloudinary
    if (paper.fileUrl) {
      try {
        const urlParts = paper.fileUrl.split("/");
        const publicId = urlParts
          .slice(urlParts.indexOf("conference_papers"))
          .join("/")
          .split(".")[0];
        await cloudinary.uploader.destroy(publicId, { resource_type: "raw" });
      } catch (cloudinaryError) {
        console.warn(
          "Could not delete file from Cloudinary:",
          cloudinaryError.message
        );
        // We don't stop the process, just log a warning.
      }
    }

    // 2. Delete the paper from the database
    // Prisma cascading delete (if set up) should handle related reviews, assignments, etc.
    // If not, you must delete related records manually in a transaction.
    // Assuming `onDelete: Cascade` is set or you handle it.
    // Let's do it manually just in case, in a transaction.

    await prisma.$transaction([
      prisma.feedback.deleteMany({ where: { paperId: parseInt(id) } }),
      prisma.review.deleteMany({ where: { paperId: parseInt(id) } }),
      prisma.reviewerAssignment.deleteMany({
        where: { paperId: parseInt(id) },
      }),
      prisma.coAuthor.deleteMany({ where: { paperId: parseInt(id) } }),
      prisma.paper.delete({ where: { id: parseInt(id) } }),
    ]);

    res.status(200).json({ message: "Paper deleted successfully" });
  } catch (error) {
    console.error("Error deleting paper:", error);
    res.status(500).json({ message: "Server error" });
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
      return res.status(404).json({ message: "Paper not found" });
    }

    if (paper.status !== "PENDING_APPROVAL") {
      return res.status(400).json({
        message: `Paper is already ${paper.status} and cannot be approved.`,
      });
    }

    const updatedPaper = await prisma.paper.update({
      where: { id: parseInt(id) },
      data: {
        status: "PENDING_REVIEW",
      },
    });

    res
      .status(200)
      .json({ message: "Paper approved successfully", paper: updatedPaper });
  } catch (error) {
    console.error("Error approving paper:", error);
    res.status(500).json({ message: "Server error" });
  }
};

/**
 * Update a paper's final status.
 * @route PATCH /api/admin/papers/:id/status
 */
export const updatePaperStatus = async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;

  // Validate the status
  const allowedStatuses = ["ACCEPTED", "REJECTED", "REVISION_REQUIRED"];
  if (!status || !allowedStatuses.includes(status)) {
    return res.status(400).json({
      message:
        "Invalid or missing status. Must be one of: ACCEPTED, REJECTED, REVISION_REQUIRED",
    });
  }

  try {
    const paper = await prisma.paper.findUnique({
      where: { id: parseInt(id) },
    });

    if (!paper) {
      return res.status(404).json({ message: "Paper not found" });
    }

    const updatedPaper = await prisma.paper.update({
      where: { id: parseInt(id) },
      data: {
        status: status,
      },
    });

    // TODO: Notify author via email about the decision
    // (We can add this later, but the status update is done)

    res.status(200).json({
      message: `Paper status updated to ${status}`,
      paper: updatedPaper,
    });
  } catch (error) {
    console.error("Error updating paper status:", error);
    res.status(500).json({ message: "Server error" });
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
        role: "REVIEWER",
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        affiliation: true,
        _count: {
          select: { assignments: true, reviews: true },
        },
      },
    });
    res.status(200).json(reviewers);
  } catch (error) {
    console.error("Error fetching reviewers:", error);
    res.status(500).json({ message: "Server error" });
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
    return res
      .status(400)
      .json({ message: "Reviewer IDs must be a non-empty array" });
  }

  try {
    const paper = await prisma.paper.findUnique({
      where: { id: parseInt(id) },
      include: {
        author: true, // Need author's email for notification
      },
    });

    if (!paper) {
      return res.status(404).json({ message: "Paper not found" });
    }

    // 1. Create the assignments in the database
    const assignments = reviewerIds.map((reviewerId) => ({
      paperId: parseInt(id),
      reviewerId: reviewerId,
    }));

    await prisma.reviewerAssignment.createMany({
      data: assignments,
      skipDuplicates: true, // Don't crash if an assignment already exists
    });

    // 2. Update paper status
    if (paper.status === "PENDING_REVIEW") {
      await prisma.paper.update({
        where: { id: parseInt(id) },
        data: { status: "UNDER_REVIEW" },
      });
    }

    // 3. Send emails to the assigned reviewers (async, don't block response)
    const reviewers = await prisma.user.findMany({
      where: {
        id: { in: reviewerIds },
      },
    });

    for (const reviewer of reviewers) {
      const mailSubject = "New Paper Assignment for Review";
      const mailText = `
        Hello ${reviewer.firstName},
        
        You have been assigned to review a new paper titled: "${paper.title}".
        Please log in to your reviewer dashboard to view the paper and submit your review.
        
        Best regards,
        Conference Admin Team
      `;
      sendEmail({
        to: reviewer.email,
        subject: mailSubject,
        text: mailText,
      }).catch(console.error);
    }

    res.status(200).json({ message: "Reviewers assigned successfully" });
  } catch (error) {
    console.error("Error assigning reviewers:", error);
    res.status(500).json({ message: "Server error" });
  }
};
