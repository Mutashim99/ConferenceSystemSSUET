import prisma from "../libs/prisma.js";
import { validationResult } from "express-validator";
import { v2 as cloudinary } from "cloudinary";
import { sendEmail } from "../utils/mail.js";
import bcrypt from "bcrypt";

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
  // --- FIX #1: Added logging to find the *original* error ---
  console.log("--- SUBMIT PAPER CONTROLLER HIT ---");
  console.log("req.user (should be populated):", req.user);
  console.log("req.file (should be populated):", req.file);
  console.log("req.body (should have all fields):", req.body);
  // --- END LOGGING ---

  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  if (!req.file) {
    return res.status(400).json({ message: "Paper file is required" });
  }

  const { title, abstract, keywords, topicArea, authors } = req.body;
  const authorId = req.user.id; // This is the submitter

  try {
    const newPaper = await prisma.paper.create({
      data: {
        title,
        abstract,
        fileUrl: req.file.path, // URL from Cloudinary
        keywords,
        topicArea,
        authorId: authorId,
        authors: authors
          ? {
              create: JSON.parse(authors).map((author) => ({
                salutation: author.salutation,
                name: author.name,
                email: author.email,
                institute: author.institute,
                isCorresponding: author.isCorresponding || false,
              })),
            }
          : undefined,
      },
      include: {
        authors: true, // Need this for the email logic
      },
    });

    // --- Create accounts for corresponding authors ---

    const correspondingAuthors = newPaper.authors.filter(
      (a) => a.isCorresponding && a.email
    );

    const dashboardUrl =
      process.env.DASHBOARD_URL || "https://icisct.com/login";

    for (const author of correspondingAuthors) {
      if (author.email === req.user.email) {
        continue;
      }

      const existingUser = await prisma.user.findUnique({
        where: { email: author.email },
      });

      if (!existingUser) {
        const tempPassword = Math.random().toString(36).slice(-8);
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(tempPassword, salt);

        const nameParts = author.name.split(" ");
        const firstName = nameParts[0];
        const lastName =
          nameParts.length > 1 ? nameParts.slice(1).join(" ") : "(No Last Name)";

        try {
          await prisma.user.create({
            data: {
              firstName,
              lastName,
              email: author.email,
              affiliation: author.institute,
              password: hashedPassword,
              role: "AUTHOR",
            },
          });

          // Send "Welcome" email with credentials
          const mailSubject = "Your Account for the Conference Portal";
          const mailText = `
            Hello ${author.salutation || ""} ${author.name},
            
            An account has been created for you on our conference portal because you were listed as a corresponding author for the paper:
            "${newPaper.title}" (ID: ${newPaper.id})
            
            You can log in to view the paper's status using these credentials:
            
            Email: ${author.email}
            Password: ${tempPassword}
            URL: ${dashboardUrl}
            
            Please change your password after your first login.
            
            Best regards,
            Conference Admin Team
          `;
          sendEmail({
            to: author.email,
            subject: mailSubject,
            text: mailText,
          }).catch(console.error);
        } catch (createUserError) {
          console.error(
            `Failed to create user account for ${author.email}:`,
            createUserError
          );
        }
      } else {
        // --- User ALREADY exists: Send a simple notification ---
        const mailSubject = "You are listed as a Corresponding Author";
        const mailText = `
          Hello ${author.salutation || ""} ${author.name},
          
          You have been listed as a corresponding author for a new paper submission:
          "${newPaper.title}" (ID: ${newPaper.id})
          
          This paper has been added to your dashboard. You can log in to your existing account to view it:
          URL: ${dashboardUrl}
          
          Best regards,
          Conference Admin Team
        `;
        sendEmail({
          to: author.email,
          subject: mailSubject,
          text: mailText,
        }).catch(console.error);
      }
    }

    // --- Notify all Admins about the new submission ---
    try {
      const submitter = await prisma.user.findUnique({
        where: { id: authorId },
        select: { email: true, firstName: true, lastName: true },
      });

      const admins = await prisma.user.findMany({
        where: { role: "ADMIN" },
        select: { email: true, firstName: true },
      });

      const paperUrl = `${
        process.env.DASHBOARD_URL || "https://icisct.com/"
      }/admin/papers/${newPaper.id}`;

      for (const admin of admins) {
        sendEmail({
          to: admin.email,
          subject: `[New Submission] Paper "${newPaper.title}" is awaiting approval`,
          text: `
            Hello ${admin.firstName || "Admin"},
            
            A new paper has been submitted and is awaiting your approval.
            
            Paper Title: ${newPaper.title}
            Paper ID: ${newPaper.id}
            Submitted By: ${submitter.firstName} ${submitter.lastName} (${
            submitter.email
          })
            
            You can review the paper here:
            ${paperUrl}
            
            Please log in to the admin dashboard to process this submission.
            
            Best regards,
            Conference System
          `,
        }).catch(console.error);
      }
    } catch (adminEmailError) {
      console.error("Failed to send email to admins:", adminEmailError);
    }

    res
      .status(201)
      .json({ message: "Paper submitted successfully", paper: newPaper });
  } catch (error) {
    // --- FIX #2: The error handling block is now safe ---
    console.error("--- ORIGINAL ERROR (from prisma.create) ---:", error);

    // Try to delete the file from Cloudinary, but don't crash if it fails
    if (req.file) {
      try {
        // `req.file.filename` *is* the public_id (e.g., "conference_papers/my-file-123")
        // No need to build the path manually.
        const publicId = req.file.filename;
        console.log(`Attempting to delete orphaned file: ${publicId}`);
        await cloudinary.uploader.destroy(publicId, { resource_type: "raw" });
      } catch (cleanupError) {
        console.error("--- CLEANUP FAILED ---");
        console.error(
          `Failed to delete file ${req.file.filename} from Cloudinary:`,
          cleanupError
        );
      }
    }

    // Send the *original* error message to the client
    res
      .status(500)
      .json({ message: "Server error", details: error.message });
  }
};
/**
 * Get all papers submitted by the logged-in author.
 * @route GET /api/author/papers
 */
export const getSubmittedPapers = async (req, res) => {
  const authorId = req.user.id;
  const authorEmail = req.user.email; // <-- FIX: Get email from authenticated user

  try {
    const papers = await prisma.paper.findMany({
      // <-- FIX: Show papers if user is submitter OR listed as an author
      where: {
        OR: [
          { authorId: authorId },
          {
            authors: {
              some: {
                email: authorEmail,
              },
            },
          },
        ],
      },
      include: {
        authors: true,
        _count: {
          select: { reviews: true },
        },
      },
      orderBy: {
        submittedAt: "desc",
      },
    });

    res.status(200).json(papers);
  } catch (error) {
    console.error("Error fetching submitted papers:", error);
    res.status(500).json({ message: "Server error" });
  }
};

/**
 * Get a single submitted paper by ID (for the author).
 * @route GET /api/author/papers/:paperId
 */
export const getAuthorPaperById = async (req, res) => {
  const authorId = req.user.id;
  const authorEmail = req.user.email; // <-- FIX: Get email from authenticated user
  const { paperId } = req.params;

  try {
    const paper = await prisma.paper.findFirst({
      // <-- FIX: Allow access if user is submitter OR listed as an author
      where: {
        id: parseInt(paperId),
        OR: [
          { authorId: authorId },
          {
            authors: {
              some: {
                email: authorEmail,
              },
            },
          },
        ],
      },
      include: {
        authors: true,
        reviews: {
          select: {
            id: true,
            comments: true,
            recommendation: true,
            reviewedAt: true,
          },
        },
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
      },
    });

    if (!paper) {
      return res
        .status(404)
        .json({ message: "Paper not found or you do not have access." });
    }

    res.status(200).json(paper);
  } catch (error) {
    console.error("Error fetching paper details:", error);
    res.status(500).json({ message: "Server error" });
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
  const senderEmail = req.user.email; // <-- FIX: Get email from authenticated user
  const { paperId } = req.params;
  const { message } = req.body;

  try {
    // <-- FIX: Check if user is the submitter OR listed as an author
    const paper = await prisma.paper.findFirst({
      where: {
        id: parseInt(paperId),
        OR: [
          { authorId: senderId },
          {
            authors: {
              some: {
                email: senderEmail,
              },
            },
          },
        ],
      },
    });

    if (!paper) {
      return res
        .status(403)
        .json({
          message: "You do not have permission to comment on this paper.",
        });
    }

    // 2. Create the feedback message
    const feedback = await prisma.feedback.create({
      data: {
        paperId: parseInt(paperId),
        senderId: senderId,
        message: message,
      },
    });

    res.status(201).json({ message: "Feedback sent", feedback });
  } catch (error) {
    console.error("Error submitting feedback:", error);
    res.status(500).json({ message: "Server error" });
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
    return res
      .status(400)
      .json({ message: "A revised paper file is required" });
  }

  try {
    // 1. Find the original paper and check ownership
    const paper = await prisma.paper.findFirst({
      where: {
        id: parseInt(paperId),
        authorId: authorId,
        // NOTE: We only allow the *original submitter* to resubmit
        // This is a business logic choice to avoid conflicts.
      },
    });

    if (!paper) {
      return res.status(404).json({
        message: "Paper not found or you are not the primary author.",
      });
    }

    if (paper.status !== "REVISION_REQUIRED") {
      const publicId = `conference_papers/${req.file.filename.split(".")[0]}`;
      await cloudinary.uploader.destroy(publicId, { resource_type: "raw" });
      return res.status(400).json({
        message: `Paper cannot be resubmitted with status: ${paper.status}`,
      });
    }

    const oldFileUrl = paper.fileUrl;

    const updatedPaper = await prisma.paper.update({
      where: {
        id: parseInt(paperId),
      },
      data: {
        fileUrl: req.file.path,
        status: "RESUBMITTED",
      },
    });

    // 5. Delete the *old* file from Cloudinary
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
          "Could not delete old file from Cloudinary:",
          cloudinaryError.message
        );
      }
    }

    // <-- FIX: Notify all Admins about the resubmission -->
    try {
      const submitter = await prisma.user.findUnique({
        where: { id: authorId },
        select: { email: true, firstName: true, lastName: true },
      });

      const admins = await prisma.user.findMany({
        where: { role: "ADMIN" },
        select: { email: true, firstName: true },
      });

      const paperUrl = `${
        process.env.DASHBOARD_URL || "https://icisct.com"
      }/admin/papers/${updatedPaper.id}`;

      for (const admin of admins) {
        sendEmail({
          to: admin.email,
          subject: `[Resubmission] Paper "${updatedPaper.title}" is ready for review`,
          text: `
            Hello ${admin.firstName || "Admin"},
            
            A paper has been resubmitted after revisions and is awaiting your review.
            
            Paper Title: ${updatedPaper.title}
            Paper ID: ${updatedPaper.id}
            Submitted By: ${submitter.firstName} ${submitter.lastName} (${
            submitter.email
          })
            
            You can review the updated paper here:
            ${paperUrl}
            
            Please log in to the admin dashboard to assign this paper to reviewers.
            
            Best regards,
            Conference System
          `,
        }).catch(console.error);
      }
    } catch (adminEmailError) {
      console.error("Failed to send email to admins:", adminEmailError);
    }

    // <-- NEW: Notify all ASSIGNED REVIEWERS about the resubmission -->
    try {
      const assignments = await prisma.reviewerAssignment.findMany({
        where: { paperId: updatedPaper.id },
        include: {
          reviewer: {
            select: { email: true, firstName: true },
          },
        },
      });

      const paperUrl = `${
        process.env.DASHBOARD_URL || "https://icisct.com"
      }/reviewer/papers/${updatedPaper.id}`; // URL for reviewers

      for (const assignment of assignments) {
        if (assignment.reviewer) {
          sendEmail({
            to: assignment.reviewer.email,
            subject: `[Resubmission] Paper "${updatedPaper.title}" has been resubmitted`,
            text: `
              Hello ${assignment.reviewer.firstName || "Reviewer"},
              
              A paper you previously reviewed, "${updatedPaper.title}" (ID: ${
              updatedPaper.id
            }), has been resubmitted by the author after revisions.
              
              It is now ready for your review again.
              
              You can review the updated paper here:
              ${paperUrl}
              
              Best regards,
              Conference System
            `,
          }).catch(console.error);
        }
      }
    } catch (reviewerEmailError) {
      console.error(
        "Failed to send email to assigned reviewers:",
        reviewerEmailError
      );
    }

    res
      .status(200)
      .json({ message: "Paper resubmitted successfully", paper: updatedPaper });
  } catch (error) {
    console.error("Error resubmitting paper:", error);
    res.status(500).json({ message: "Server error" });
  }
};
