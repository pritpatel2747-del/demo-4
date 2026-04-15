const express = require("express");
const http = require("http");
const cors = require("cors");
const path = require("path");
const sequelize = require("./config/database");
const apiRoutes = require("./routes/api");
const cron = require("node-cron");
const Invitation = require("./models/Invitation");
const User = require("./models/User");
const Notification = require("./models/notification");
const { Op } = require("sequelize");
const jwt = require("jsonwebtoken");
const socketIO = require("socket.io");
require("dotenv").config();
const { v4: uuidv4 } = require('uuid');
const app = express();

// Create HTTP server
const server = http.createServer(app);

// Initialize Socket.io with CORS support
const io = socketIO(server, {
  cors: {
    origin: process.env.FRONTEND_URL || "http://localhost:3000",
    methods: ["GET", "POST"],
    credentials: true
  }
});

// Attach io to app for use in routes
app.set("io", io);

// Middleware
app.use(cors());
app.use(express.json());

app.use("/uploads", express.static(path.join(__dirname, "uploads")));
app.use("/api", apiRoutes);

const userSocketMap = {};

io.on("connection", (socket) => {

  console.log(`\n New connection: ${socket.id}`);
  const token = socket.handshake.auth.token;
  if (!token) {
    console.error("❌ [AUTH] No token provided - authentication failed");
    socket.emit("auth_failed", { error: "No authentication token provided" });
    socket.disconnect(true);
    return;
  }
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const userId = decoded.id;

    if (!userId) {
      throw new Error("Token missing userId");
    }

    console.log(`✅ [AUTH] Token valid - User ID: ${userId}, Name: ${decoded.name}`);

    userSocketMap[userId] = socket.id;

    socket.join(String(userId));
    console.log(`✅ [ROOM] User ${userId} (${decoded.name}) joined room: ${userId}`);
    console.log(`[ONLINE] Active users map:`, userSocketMap);
    console.log(`[ONLINE] Active socket rooms:`, Array.from(io.sockets.adapter.rooms.keys()));
    console.log(`[ONLINE] Total connections: ${Object.keys(userSocketMap).length}\n`);

  } catch (err) {
    console.error(`❌ [AUTH] Token verification failed: ${err.message}`);
    socket.emit("auth_failed", { error: "Invalid or expired token" });
    socket.disconnect(true);
    return;
  }

  socket.on("disconnect", () => {
    console.log(`\n❌ [SOCKET] Disconnected: ${socket.id}`);

    for (const userId in userSocketMap) {
      if (userSocketMap[userId] === socket.id) {
        console.log(`[OFFLINE] User ${userId} disconnected`);
        console.log(`[ONLINE] Active users BEFORE removal:`, userSocketMap);
        delete userSocketMap[userId];
        console.log(`[ONLINE] Active users AFTER removal:`, userSocketMap);
        break;
      }
    }
    console.log(`[ONLINE] Remaining connections: ${Object.keys(userSocketMap).length}\n`);
  });
});

// Sync database and start server
const startServer = async () => {
  try {
    await sequelize.authenticate();
    console.log("✅ Database connected successfully");
    await sequelize.sync({ alter: false });
    console.log("✅ Models synchronized with database");
    const PORT = process.env.PORT || 19099;

    // Enable SO_REUSEADDR to reuse port immediately
    server.setsockopt = true;
    app.get("/"  , (req, res) => {
      res.send("Server is running");
    });

    server.listen(PORT, () => {
      console.log(`✅ Server is running on http://localhost:${PORT}`);
      console.log(`✅ Socket.io ready for connections`);
    });

    // Handle server errors
    server.on("error", (error) => {
      if (error.code === "EADDRINUSE") {
        console.error(`❌ Port ${PORT} is already in use. Trying alternative port...`);
        // Try next port
        const newPort = PORT + 1;
        server.listen(newPort, () => {
          console.log(`✅ Server is running on http://localhost:${newPort}`);
          console.log(`✅ Socket.io ready for connections`);
        });
      } else {
        console.error("❌ Server error:", error);
      }
    });
  } catch (error) {
    console.error("Unable to connect to the database:", error);
    process.exit(1);
  }
};

startServer();
