import express from "express";
import connectDb from "./config/dbconnection.js";
import cors from "cors";
import uploadKeRoutes from "./routes/uploadRoutes.js";
import auditKeRoutes from "./routes/auditRoutes.js";
import userKeRoutes from "./routes/userRoutes.js";
import AdminJS from "adminjs";
import AdminJSExpress from "@adminjs/express";
import { Database, Resource } from "@adminjs/mongoose";
import User from "./models/UserModel.js";
import Audit from "./models/TaskModel.js";
import AuditVersion from "./models/PdfModel.js";
import https from "https";
import dotenv from "dotenv";

// Load environment variables
dotenv.config();

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
    },
    {
      resource: AuditVersion,
      options: {
        // Custom options for the AuditVersion resource if needed
      },
    },
  ],
  rootPath: "/api/admin", // admin panel will be available at /api/admin
});

// Build and use AdminJS router
const adminRouter = AdminJSExpress.buildRouter(adminJs);

// Initialize Express app
const app = express();
const port = process.env.PORT || 3002;

// Connect to MongoDB
connectDb();

// Middleware
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true, limit: "50mb" }));
app.use(
  cors({
    origin: "*",
    methods: ["GET", "POST", "PUT", "DELETE"],
    credentials: true,
    allowedHeaders: ["Content-Type"],
  })
);

// Admin routes
app.use("/api/admin", adminRouter);

// API routes
app.use("/api/image", uploadKeRoutes);
app.use("/api/admin", auditKeRoutes);
app.use("/api/user", userKeRoutes);

// Ping route
app.get("/ping", (req, res) => {
  res.status(200).send("pong");
});

// Root route
app.get("/", (req, res) => {
  res.send("Server is working");
});

// Start server
const server = app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
  // Start the self-pinging mechanism
  keepServerAlive();
});

function keepServerAlive() {
  const pingInterval = 10 * 1000; // 10 seconds
  const appUrl =
    process.env.APP_URL ||
    "https://restaurant-audit-app-backend-1.onrender.com";

  setInterval(() => {
    https
      .get(`${appUrl}/ping`, (resp) => {
        if (resp.statusCode === 200) {
          console.log("Server pinged successfully");
        } else {
          console.log("Failed to ping server");
        }
      })
      .on("error", (err) => {
        console.log("Error pinging server: " + err.message);
      });
  }, pingInterval);
}
