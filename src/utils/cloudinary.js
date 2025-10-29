import { v2 as cloudinary } from 'cloudinary';
import { CloudinaryStorage } from 'multer-storage-cloudinary';
import multer from 'multer';

// Configure Cloudinary using your environment variables
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// Configure multer storage for Cloudinary
const storage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: 'conference_papers', // A folder in Cloudinary to store papers
    resource_type: 'raw', // We are uploading files, not just images
    allowed_formats: ['pdf', 'doc', 'docx'],
    // Use the original filename
    public_id: (req, file) => {
      // Create a unique-ish file name
      const fileName = file.originalname.split('.').slice(0, -1).join('.');
      return `${fileName}-${Date.now()}`;
    },
  },
});

// Create the multer upload middleware
const upload = multer({
  storage: storage,
  fileFilter: (req, file, cb) => {
    // Basic validation for file types
    if (!file.mimetype.match(/pdf|doc|docx|application\/pdf|application\/msword|application\/vnd\.openxmlformats-officedocument\.wordprocessingml\.document/)) {
      cb(new Error('File format not supported. Please upload a PDF, DOC, or DOCX.'), false);
      return;
    }
    cb(null, true);
  },
  limits: {
    fileSize: 1024 * 1024 * 10 // 10MB file size limit
  }
});

export default upload;
