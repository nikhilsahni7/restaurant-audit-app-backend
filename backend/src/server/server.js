import express from 'express';
import connectDb from './config/dbconnection.js';
import cors from 'cors';
import uploadKeRoutes from './routes/uploadRoutes.js';
import auditKeRoutes from './routes/auditRoutes.js';
import userKeRoutes from './routes/userRoutes.js';
import AdminJS from 'adminjs';
import AdminJSExpress from '@adminjs/express';
import { Database, Resource } from '@adminjs/mongoose'; // Correct named import
import User from './models/UserModel.js';
import Audit from './models/TaskModel.js';

// Initialize AdminJS with Mongoose adapter
AdminJS.registerAdapter({ Database, Resource });

// Configure AdminJS
const adminJs = new AdminJS({
  resources: [
    {
      resource: User,
      options: {
        // Custom options for the User resource if needed
      },
    },
    {
      resource: Audit,
      options: {
        // Custom options for the Audit resource if needed
      },
    }
  ],
  rootPath: '/api/admin', // Path where AdminJS will be available
});

// Build and use AdminJS router
const adminRouter = AdminJSExpress.buildRouter(adminJs);

// Initialize Express app
const app = express();
const port = process.env.PORT || 3002;

// Connect to MongoDB
connectDb();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(
  cors({
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    credentials: true,
    allowedHeaders: ['Content-Type', 'Authorization'],
  })
);

// Add AdminJS routes
app.use('/api/admin', adminRouter);

app.use('/api/image', uploadKeRoutes);
app.use('/api/admin', auditKeRoutes);
app.use('/api/user', userKeRoutes);

app.get('/', (req, res) => {
  res.send('Server is working');
});

app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
