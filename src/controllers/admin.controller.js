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
        authors: true, // Updated from coAuthors
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
    // <-- NEW: Find paper and corresponding authors *before* deleting
    const paper = await prisma.paper.findUnique({
      where: { id: parseInt(id) },
      include: {
        authors: {
          where: { isCorresponding: true, email: { not: null } },
          select: { email: true, name: true, salutation: true },
        },
      },
    });

    if (!paper) {
      return res.status(404).json({ message: "Paper not found" });
    }

    const authorsToNotify = paper.authors;
    const paperTitle = paper.title;
    const oldFileUrl = paper.fileUrl;

    // 1. Delete the file from Cloudinary
    if (oldFileUrl) {
      try {
        const urlParts = oldFileUrl.split("/");
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
      }
    }

    // 2. Delete the paper from the database
    await prisma.$transaction([
      prisma.feedback.deleteMany({ where: { paperId: parseInt(id) } }),
      prisma.review.deleteMany({ where: { paperId: parseInt(id) } }),
      prisma.reviewerAssignment.deleteMany({
        where: { paperId: parseInt(id) },
      }),
      prisma.author.deleteMany({ where: { paperId: parseInt(id) } }), // Updated from coAuthor
      prisma.paper.delete({ where: { id: parseInt(id) } }),
    ]);

    // <-- NEW: Send notification email to corresponding authors
    for (const author of authorsToNotify) {
      sendEmail({
        to: author.email,
        subject: `[Notification] Your paper "${paperTitle}" has been deleted`,
        text: `
          Hello ${author.salutation || ""} ${author.name},
          
          We are writing to inform you that your paper submission, "${paperTitle}" (ID: ${id}), has been deleted from the conference system by an administrator.
          
          If you believe this was in error, please contact the conference organizers.
          
          Best regards,
          Conference Admin Team
        `,
      }).catch(console.error);
    }

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

    // <-- NEW: Send notification email to corresponding authors
    const correspondingAuthors = await prisma.author.findMany({
      where: {
        paperId: updatedPaper.id,
        isCorresponding: true,
        email: { not: null },
      },
    });

    for (const author of correspondingAuthors) {
      sendEmail({
        to: author.email,
        subject: `[Update] Your paper "${updatedPaper.title}" has been approved`,
        text: `
          Hello ${author.salutation || ""} ${author.name},
          
          Good news! Your paper submission, "${
            updatedPaper.title
          }" (ID: ${updatedPaper.id}), has been approved by the administrators.
          
          It is now in the queue for reviewer assignment. You will be notified when its status changes.
          
          Best regards,
          Conference Admin Team
        `,
      }).catch(console.error);
    }

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

    // <-- NEW: Notify corresponding authors about the final decision
    const correspondingAuthors = await prisma.author.findMany({
      where: {
        paperId: updatedPaper.id,
        isCorresponding: true,
        email: { not: null },
      },
    });

    const decision = status.replace("_", " "); // e.g., "REVISION REQUIRED"

    for (const author of correspondingAuthors) {
      sendEmail({
        to: author.email,
        subject: `[Decision] Your paper "${updatedPaper.title}" has been ${decision}`,
        text: `
          Hello ${author.salutation || ""} ${author.name},
          
          A final decision has been made for your paper, "${
            updatedPaper.title
          }" (ID: ${updatedPaper.id}).
          
          The final status is: ${decision}
          
          You can log in to the portal to view all reviews and feedback.
          
          Best regards,
          Conference Admin Team
        `,
      }).catch(console.error);
    }

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
    if (
      paper.status === "PENDING_REVIEW" ||
      paper.status === "RESUBMITTED"
    ) {
      await prisma.paper.update({
        where: { id: parseInt(id) },
        data: { status: "UNDER_REVIEW" },
      });

      // <-- NEW: Notify corresponding authors that the paper is now under review
      const correspondingAuthors = await prisma.author.findMany({
        where: {
          paperId: paper.id,
          isCorresponding: true,
          email: { not: null },
        },
      });

      for (const author of correspondingAuthors) {
        sendEmail({
          to: author.email,
          subject: `[Update] Your paper "${paper.title}" is now Under Review`,
          text: `
            Hello ${author.salutation || ""} ${author.name},
            
            Your paper, "${
              paper.title
            }" (ID: ${
            paper.id
          }), has been assigned to reviewers and is now officially UNDER REVIEW.
            
            You will be notified once the reviews are complete.
            
            Best regards,
            Conference Admin Team
          `,
        }).catch(console.error);
      }
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