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
    folder: 'conference_papers',
    resource_type: 'raw', 
    allowed_formats: ['pdf', 'doc', 'docx'],
    
    // --- THE FIX IS HERE ---
    public_id: (req, file) => {
      // 1. Get the filename without extension
      const nameWithoutExt = file.originalname.split('.').slice(0, -1).join('.');
      
      // 2. SANITIZE: Replace any character that is NOT a letter, number, dash, or underscore with "_"
      // This strips out =, &, ?, spaces, and other "unsafe" characters that crash Cloudinary
      const sanitizedName = nameWithoutExt.replace(/[^a-zA-Z0-9-_]/g, '_');

      // 3. Get the actual extension (e.g., 'pdf')
      const extension = file.originalname.split('.').pop();

      // 4. Return: SanitizedName + Timestamp + DOT + Extension
      // Example result: "edusmartz_ssuet_edu_pk_StudentPortal_...-1764447840038.pdf"
      return `${sanitizedName}-${Date.now()}.${extension}`;
    },
  },
});

// Create the multer upload middleware
const upload = multer({
  storage: storage,
  fileFilter: (req, file, cb) => {
    if (!file.mimetype.match(/pdf|doc|docx|application\/pdf|application\/msword|application\/vnd\.openxmlformats-officedocument\.wordprocessingml\.document/)) {
      cb(new Error('File format not supported. Please upload a PDF, DOC, or DOCX.'), false);
      return;
    }
    cb(null, true);
  },
  limits: {
    fileSize: 1024 * 1024 * 20 // 20MB file size limit
  }
});

export default upload;