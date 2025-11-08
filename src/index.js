import 'dotenv/config';
import express from 'express';
import cookieParser from 'cookie-parser';
import cors from 'cors';

// Import your routes
import authRoutes from './routes/auth.routes.js';
import adminRoutes from './routes/admin.routes.js';
import authorRoutes from './routes/author.routes.js';
import reviewerRoutes from './routes/reviewer.routes.js'; // The new module

// import reviewerRoutes from './routes/reviewer.routes.js'; // Future

// --- Main App Setup ---
const app = express();

// --- Middleware ---
// CORS setup to allow credentials (cookies)
app.use(
  cors({
    origin: ["https://localhost:5173","https://conferencesystem.vercel.app"],
    credentials: true,
  })
);

// Standard middleware
app.use(express.json()); // To parse JSON request bodies
app.use(express.urlencoded({ extended: true })); // To parse URL-encoded bodies
app.use(cookieParser()); // To parse cookies (for auth)

// --- API Routes ---
app.use('/api/auth', authRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/author', authorRoutes);
app.use('/api/reviewer', reviewerRoutes); // Add the new reviewer routes

// --- Health Check Route ---
app.get('/api/health', (req, res) => {
  res.status(200).json({ status: 'UP', message: 'Server is running' });
});

// --- Start Server ---
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

export default app;


