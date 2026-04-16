const express = require("express");
const router = express.Router();
const jwt = require("jsonwebtoken");
const User = require("../models/User");
const Invitation = require("../models/Invitation");
const Notification = require("../models/notification");
const PushSubscription = require("../models/PushSubscription");
const { sendInvitationEmail } = require("../services/emailService");
const { verifyToken } = require("../middleware/auth");
const upload = require("../middleware/multer");
const { where, Op } = require("sequelize");
const webpush = require("web-push");
require("dotenv").config();
const { notificationService } = require("../services/notificationservice");

// Configure web-push with VAPID keys
webpush.setVapidDetails(
  process.env.VAPID_EMAIL || "mailto:yatin.patel@plusinfosys.com",
  process.env.VAPID_PUBLIC_KEY,
  process.env.VAPID_PRIVATE_KEY
);

// GET /api/user-schema?type=signin|signup|additional|invite - Returns metadata-driven field definitions
router.get("/user-schema", async (req, res) => {
  try {
    const { type = "invite" } = req.query;

    const schemas = {
      signin: [
        {
          name: "email",
          label: "Email Address",
          type: "email",
          placeholder: "e.g., john@example.com",
          isServerField: true,
          required: true,
        },
        {
          name: "password",
          label: "Password",
          type: "password",
          placeholder: "Enter your password",
          isServerField: true,
          required: true,
        },
      ],
      signup: [
        {
          name: "name",
          label: "Full Name",
          type: "text",
          placeholder: "e.g., John Doe",
          isServerField: true,
          required: true,
        },
        {
          name: "email",
          label: "Email Address",
          type: "email",
          placeholder: "e.g., john@example.com",
          isServerField: true,
          required: true,
        },
        {
          name: "password",
          label: "Password",
          type: "password",
          placeholder: "Enter a secure password",
          isServerField: true,
          required: true,
        }
      ],
      additional: [
        {
          name: "phone_number",
          label: "Phone Number",
          type: "tel",
          placeholder: "e.g., +1 (555) 123-4567",
          isServerField: true,
          required: true,
        },
        {
          name: "address",
          label: "Address",
          type: "text",
          placeholder: "e.g., 123 Main St, City, State",
          isServerField: true,
          required: true,
        },
        {
          name: "work_title",
          label: "Work Title",
          type: "text",
          placeholder: "e.g., Software Engineer",
          isServerField: true,
          required: true,
        },
        {
          name: "work_place",
          label: "Work Place",
          type: "text",
          placeholder: "e.g., Office Location or Remote",
          isServerField: true,
          required: true,
        },
        {
          name: "company",
          label: "Company",
          type: "text",
          placeholder: "e.g., Acme Corporation",
          isServerField: true,
          required: true,
        }
      ],
      invite: [
        {
          name: "name",
          label: "Full Name",
          type: "text",
          placeholder: "e.g., John Doe",
          section: "credentials",
          isServerField: true,
          required: true,
        },
        {
          name: "email",
          label: "Email Address",
          type: "email",
          placeholder: "e.g., john@example.com",
          section: "credentials",
          isServerField: true,
          required: true,
        },
        {
          name: "password",
          label: "Password",
          type: "password",
          placeholder: "Enter a secure password",
          section: "credentials",
          isServerField: true,
          required: true,
        },
        {
          name: "confirmPassword",
          label: "Confirm Password",
          type: "password",
          placeholder: "Confirm the password",
          section: "credentials",
          isServerField: false,
          required: true,
        },
        {
          name: "role",
          label: "Role",
          type: "select",
          section: "credentials",
          isServerField: true,
          options: [
            { value: "user", label: "User" },
            { value: "admin", label: "Admin" },
            { value: "manager", label: "Manager" },
          ],
          required: true,
        },
        {
          name: "phone_number",
          label: "Phone Number",
          type: "tel",
          placeholder: "e.g., +1 (555) 123-4567",
          section: "additional",
          isServerField: true,
          required: false,
        },
        {
          name: "address",
          label: "Address",
          type: "text",
          placeholder: "e.g., 123 Main St, City, State",
          section: "additional",
          isServerField: true,
          required: false,
        },
        {
          name: "work_title",
          label: "Work Title",
          type: "text",
          placeholder: "e.g., Software Engineer",
          section: "additional",
          isServerField: true,
          required: false,
        },
        {
          name: "work_place",
          label: "Work Place",
          type: "text",
          placeholder: "e.g., Office Location or Remote",
          section: "additional",
          isServerField: true,
          required: false,
        },
        {
          name: "company",
          label: "Company",
          type: "text",
          placeholder: "e.g., Acme Corporation",
          section: "additional",
          isServerField: true,
          required: false,
        },
      ],
    };

    const selectedSchema = schemas[type] || schemas.invite;
    res.json(selectedSchema);
  } catch (error) {
    console.error("Error fetching user schema:", error);
    res.status(500).json({ error: "Failed to fetch user schema" });
  }
});

// POST /api/invite - Send invitation to email with expanded fields
router.post("/invite", async (req, res) => {
  try {
    const io = req.app.get("io");

    // ✅ Extract and verify token safely
    const token = req.headers.authorization?.split(" ")[1];
    if (!token) {
      return res.status(401).json({ error: "Authorization token required" });
    }

    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET);
    } catch (error) {
      console.error("JWT verification failed:", error.message);
      return res.status(401).json({ error: "Invalid or expired token" });
    }

    const loggedInUserId = decoded.id;
    // Define server-field allowlist based on isServerField metadata
    const serverOnlyFields = [
      "name",
      "email",
      "password",
      "role",
      "phone_number",
      "address",
      "work_title",
      "work_place",
      "company",
      "bio"
    ];

    // Dynamically extract only server fields from request body
    const invitationData = {};
    serverOnlyFields.forEach((field) => {
      if (req.body[field] !== undefined) {
        invitationData[field] = req.body[field];
      }
    });

    const { name, email, password } = invitationData;

    if (!email || !name || !password) {
      return res.status(400).json({ error: "Email, name, and password are required" });
    }

    // Check if email already exists in User table
    const existingUser = await User.findOne({ where: { email, status: "success" } });
    if (existingUser) {
      return res.status(400).json({ error: "Email already exists" });
    }
    const existingPendingInvitation = await Invitation.findOne({ where: { email, status: "pending" } });
    if (existingPendingInvitation) {
      return res.status(400).json({ error: "An invitation for this email is already pending" })
    }
    // Delete any existing pending invitations for this email
    await Invitation.destroy({ where: { email, status: "pending" } });

    // Create invitation with token and 15-minute expiration
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000);
    console.log("Creating invitation with expiresAt:", expiresAt);
    const invitation = await Invitation.create({
      ...invitationData,
      expiresAt,
    });

    // Generate invite link
    const inviteLink = `${process.env.FRONTEND_URL}/verify/${invitation.token}`;

    // Send email
    await sendInvitationEmail(email, inviteLink);

    if (io) {
      const message = `Invitation sent to ${email}`;
      console.log(`\n[INVITE] User ${loggedInUserId} sent invitation to ${email}`);
      
      // 🍞 Toast to actor (who sent the invite)
      io.to(String(loggedInUserId)).emit("toast", {
        id: `invite-${invitation.id}`,
        type: "invitation_sent",
        message: message,
        timestamp: new Date(),
        status: "success"
      });
      console.log(`✅ [EMIT] Toast emitted to room: ${loggedInUserId}`);

      // Save to database for actor
      await notificationService(loggedInUserId, "invitation_sent", message);

      // 📢 Notification to all other users
      const allUsers = await User.findAll();
      for (const u of allUsers) {
        if (u.id !== loggedInUserId) {
          io.to(String(u.id)).emit("notification", {
            id: `invite-${invitation.id}`,
            type: "invitation_sent",
            message: message,
            timestamp: new Date(),
            status: "success"
          });
          await notificationService(u.id, "invitation_sent", message);
          console.log(`📢 [EMIT] Notification sent to room: ${u.id}`);
        }
      }
    }


    res.status(201).json({
      message: "Invitation sent successfully",
      token: invitation.token,
    });
  } catch (error) {
    console.error("Error creating invitation:", error);
    res.status(500).json({ error: "Failed to create invitation" });
  }
});

// POST /api/login - User login with JWT token
router.post("/login", async (req, res) => {
  try {
    const io = req.app.get("io");
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: "Email and password are required" });
    }

    // Find user by email with success status only
    const user = await User.findOne({
      where: { email, status: "success" }
    });

    if (!user) {
      return res.status(401).json({ error: "Invalid email or password" });
    }

    // Compare passwords
    const isPasswordValid = await user.validatePassword(password);
    if (!isPasswordValid) {
      return res.status(401).json({ error: "Invalid email or password" });
    }

    // Generate JWT token
    const token = jwt.sign(
      {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role
      },
      process.env.JWT_SECRET || "your-secret-key",
      { expiresIn: "7d" }
    );

    // Emit login notification
    if (io) {
      const message = `Welcome back, ${user.name}!`;
      console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
      console.log(`[LOGIN] User ${user.id} (${user.name}) logged in - sending notifications`);
      console.log(`[DEBUG] Attempting to get Socket.io adapter...`);
      
      // Show current room status
      try {
        const rooms = io.sockets.adapter.rooms;
        console.log(`[DEBUG] Rooms in adapter:`, Array.from(rooms.keys()));
        console.log(`[DEBUG] Room ${user.id} members:`, rooms.has(String(user.id)) ? "EXISTS" : "DOES NOT EXIST");
      } catch(e) {
        console.error(`[DEBUG] Error checking rooms:`, e.message);
      }
      
      // 🍞 Toast to actor (who logged in)
      console.log(`[EMIT] SENDING TOAST to room ${user.id} (${user.name})`);
      io.to(String(user.id)).emit("toast", {
        id: `login-${user.id}-${Date.now()}`,
        type: "user_login",
        message: message,
        timestamp: new Date(),
        status: "success"
      });
      console.log(`✅ [EMIT] Toast emitted to room: ${user.id}, message: "${message}"`);

      // Save to database for actor
      await notificationService(user.id, "user_login", message);

      // 📢 Notification to all other users
      const allUsers = await User.findAll();
      console.log(`[DEBUG] Total users in database: ${allUsers.length}`);
      console.log(`[DEBUG] Sending notifications to all except user ${user.id} (${user.name})`);
      
      let notificationCount = 0;
      for (const u of allUsers) {
        if (u.id !== user.id) {
          console.log(`\n[EMIT] SENDING NOTIFICATION to room ${u.id} (${u.name})`);
          io.to(String(u.id)).emit("notification", {
            id: `login-${user.id}-${Date.now()}`,
            type: "user_login",
            message: `${user.name} has logged in`,
            timestamp: new Date(),
            status: "success"
          });
          await notificationService(u.id, "user_login", `${user.name} has logged in`);
          console.log(`✅ [EMIT] Notification sent to room: ${u.id} (${u.name})`);
          notificationCount++;
        }
      }
      console.log(`[LOGIN] Finished - sent ${notificationCount} notifications`);
      console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);
    }

    res.status(200).json({
      message: "Login successful",
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        status: user.status,
      },
    });
  } catch (error) {
    console.error("Error logging in:", error);
    res.status(500).json({ error: "Failed to login" });
  }
});

// GET /api/profile - Get logged-in user's profile (JWT protected)
router.get("/profile", verifyToken, async (req, res) => {
  try {
    const userId = req.user.id;


    const user = await User.findByPk(userId, {
      attributes: {
        exclude: ['password']
      }
    });
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }
    res.status(200).json({
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        phone_number: user.phone_number,
        address: user.address,
        work_title: user.work_title,
        work_place: user.work_place,
        company: user.company,
        profile_image: user.profile_image,
        role: user.role,
        status: user.status,
      }
    });
  } catch (error) {
    console.error("Error fetching profile:", error);
    res.status(500).json({ error: "Failed to fetch profile" });
  }
});

// POST /api/upload-profile - Upload profile image (JWT protected)
router.post("/upload-profile", verifyToken, upload.single("profileImage"), async (req, res) => {
  try {
    const userId = req.user.id;

    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded" });
    }
    const imageUrl = `/uploads/${req.file.filename}`;
    // Update user with profile image path
    await User.update(
      { profile_image: imageUrl },
      { where: { id: userId } }
    );

    const io = req.app.get("io");

    const token = req.headers.authorization?.split(" ")[1];
    if (!token) {
      return res.status(401).json({ error: "Authorization token required" });
    }

    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET);
    } catch (error) {
      console.error("JWT verification failed:", error.message);
      return res.status(401).json({ error: "Invalid or expired token" });
    }

    const loggedInUserId = decoded.id;
    if (io) {
      const message = "Profile image uploaded successfully";
      console.log(`\n[PROFILE] User ${userId} uploaded profile image`);
      
      // 🍞 Toast to actor (who uploaded profile)
      io.to(String(userId)).emit("toast", {
        id: `profile-upload-${userId}-${Date.now()}`,
        type: "profile_image_updated",
        message: message,
        timestamp: new Date(),
        status: "success"
      });
      console.log(`✅ [EMIT] Toast emitted to room: ${userId}`);

      // Save to database for actor
      await notificationService(userId, "profile_image_updated", message);

      // 📢 Notification to all other users
      const allUsers = await User.findAll();
      for (const u of allUsers) {
        if (u.id !== userId) {
          io.to(String(u.id)).emit("notification", {
            id: `profile-upload-${userId}-${Date.now()}`,
            type: "profile_image_updated",
            message: `${decoded.name || 'User'} updated their profile image`,
            timestamp: new Date(),
            status: "success"
          });
          await notificationService(u.id, "profile_image_updated", `${decoded.name || 'User'} updated their profile image`);
          console.log(`📢 [EMIT] Notification sent to room: ${u.id}`);
        }
      }
    }

    res.status(200).json({
      message: "Profile image uploaded successfully",
      imageUrl: imageUrl
    });
  } catch (error) {
    console.error("Error uploading profile image:", error);
    res.status(500).json({ error: "Failed to upload profile image" });
  }
});

// GET /api/verify/:token - Verify invitation token
router.get("/verify/:token", async (req, res) => {
  try {
    const { token } = req.params;
    const invitation = await Invitation.findOne({ where: { token } });

    if (!invitation) {
      return res.status(400).json({ error: "Invitation not found" });
    }

    // Check if expired
    if (new Date() > invitation.expiresAt) {
      return res.status(400).json({ error: "Invitation has expired" });
    }

    res.status(200).json({
      name: invitation.name,
      email: invitation.email,
      role: invitation.role,
      token: invitation.token
    });
  } catch (error) {
    console.error("Error verifying token:", error);
    res.status(500).json({ error: "Failed to verify token" });
  }
});

// POST /api/respond-invite - Accept or reject invitation with new fields
router.post("/respond-invite", async (req, res) => {
  try {
    const io = req.app.get("io");

    const {
      token,
      action,
      phone_number,
      address,
      work_title,
      work_place,
      company
    } = req.body;

    if (!token || !action) {
      return res.status(400).json({ error: "Token and action are required" });
    }

    const invitation = await Invitation.findOne({ where: { token } });

    if (!invitation) {
      return res.status(400).json({ error: "Invitation not found" });
    }

    if (action === "accept") {
      // Create user with success status and new fields
      const newUserInstant = await User.findAll();
      let newUser = null;
      try {
        console.log("creating the user in users table")
        newUser = await User.create({
          name: invitation.name,
          email: invitation.email,
          password: invitation.password,
          role: invitation.role,
          status: "success",
          phone_number: invitation.phone_number || null,
          address: invitation.address || null,
          work_title: invitation.work_title || null,
          work_place: invitation.work_place || null,
          company: invitation.company || null,
        });
        console.log("New user created:", (newUserInstant.concat(newUser)));
        if (io) {
          io.emit("user-list", newUserInstant.concat(newUser));
        }
      } catch (error) {
        if (error.name === "SequelizeUniqueConstraintError") {
          // User already exists, update status to success and new fields
          await User.update(
            {
              status: "success",
              phone_number: invitation.phone_number || null,
              address: invitation.address || null,
              work_title: invitation.work_title || null,
              work_place: invitation.work_place || null,
              company: invitation.company || null,
            },
            { where: { email: invitation.email } },
          );
          newUser = await User.findOne({ where: { email: invitation.email } });
        } else {
          throw error;
        }
      }
      // Update invitation status
      await invitation.update({ status: "accepted" });

      // Emit notifications to all connected users
      if (io && newUser) {
        console.log(`\n[INVITE_ACCEPT] User ${newUser.id} accepted invitation`);
        
        // 🍞 Toast to actor (new user who accepted invitation)
        const actorMessage = `${newUser.name}, welcome! You've successfully joined the team.`;
        io.to(String(newUser.id)).emit("toast", {
          id: `invitation-accept-${newUser.id}-${Date.now()}`,
          type: "invitation_accepted",
          message: actorMessage,
          timestamp: new Date(),
          status: "success"
        });
        console.log(`✅ [EMIT] Toast emitted to room: ${newUser.id}`);

        // Save to database for actor
        await notificationService(newUser.id, "invitation_accepted", actorMessage);

        // 📢 Notification to all other users
        const otherMessage = `${newUser.name} has joined! Welcome to the team.`;
        const allUsers = await User.findAll();
        for (const u of allUsers) {
          if (u.id !== newUser.id) {
            io.to(String(u.id)).emit("notification", {
              id: `invitation-accept-${newUser.id}-${Date.now()}`,
              type: "invitation_accepted",
              message: otherMessage,
              timestamp: new Date(),
              status: "success"
            });
            await notificationService(u.id, "invitation_accepted", otherMessage);
            console.log(`📢 [EMIT] Notification sent to room: ${u.id}`);
          }
        }

        // Emit user joined event for list update
        io.emit("user_joined", {
          id: newUser.id,
          name: newUser.name,
          email: newUser.email,
          role: newUser.role
        });
      }
    } else if (action === "reject") {
      // Update invitation status
      await invitation.update({ status: "rejected" });
      if (io) {
        const message = `Invitation for ${invitation.email} was rejected.`;

        // If there's an authenticated user (actor who rejected)
        if (req.user) {
          console.log(`\n[INVITE_REJECT] User ${req.user.id} rejected invitation for ${invitation.email}`);
          
          // 🍞 Toast to actor (who rejected)
          io.to(String(req.user.id)).emit("toast", {
            id: `invitation-reject-${invitation.id}-${Date.now()}`,
            type: "invitation_rejected",
            message: message,
            timestamp: new Date(),
            status: "info"
          });
          console.log(`✅ [EMIT] Toast emitted to room: ${req.user.id}`);

          // Save to database for actor
          await notificationService(req.user.id, "invitation_rejected", message);

          // 📢 Notification to all other users
          const allUsers = await User.findAll();
          for (const u of allUsers) {
            if (u.id !== req.user.id) {
              io.to(String(u.id)).emit("notification", {
                id: `invitation-reject-${invitation.id}-${Date.now()}`,
                type: "invitation_rejected",
                message: message,
                timestamp: new Date(),
                status: "info"
              });
              await notificationService(u.id, "invitation_rejected", message);
              console.log(`📢 [EMIT] Notification sent to room: ${u.id}`);
            }
          }
        }
      }
    } else {
      return res.status(400).json({ error: "Invalid action" });
    }

    // Delete invitation after responding
    await invitation.destroy();

    res.status(200).json({ message: `Invitation ${action} successfully` });
  } catch (error) {
    console.error("Error responding to invitation:", error);
    res.status(500).json({ error: "Failed to respond to invitation" });
  }
});

// GET /api/users - Get all users with success status
router.get("/users", async (req, res) => {
  try {
    const io = req.app.get("io");
    const users = await User.findAll({ where: { status: "success" }, attributes: { exclude: ['password'] } });

    const pendingCount = await User.count({ where: { status: "pending" } });
    res.status(200).json({ users, pendingCount });
  } catch (error) {
    console.error("Error fetching users:", error);
    res.status(500).json({ error: "Failed to fetch users" });
  }
});

// DELETE /api/users/:id - Delete a user
router.delete("/users/:id", async (req, res) => {
  try {
    const io = req.app.get("io");

    const token = req.headers.authorization?.split(" ")[1];

    if (!token) {
      return res.status(401).json({ error: "Authorization token required" });
    }

    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET);
    } catch (error) {
      console.error("JWT verification failed:", error.message);
      return res.status(401).json({ error: "Invalid or expired token" });
    }

    const loggedInUserId = decoded.id;
    console.log("login user : "+ loggedInUserId);
    const { id } = req.params;
    const user = await User.findByPk(id);
    console.log("id for deleted user : " + id);
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    // // ✅ SEND PUSH NOTIFICATION TO DELETED USER (even if tab is closed)
    // const userSubscription = await PushSubscription.findOne({ where: { userId: id } });
    // if (userSubscription) {
    //   const pushSubscription = {
    //     endpoint: userSubscription.endpoint,
    //     keys: {
    //       p256dh: userSubscription.p256dh,
    //       auth: userSubscription.auth
    //     }
    //   };


    const subscriptions = await PushSubscription.findAll();

for (const sub of subscriptions) {
  const pushSubscription = {
    endpoint: sub.endpoint,
    keys: {
      p256dh: sub.p256dh,
      auth: sub.auth
    }
  };
    console.log(`Found push subscription for user ${id}, sending account deletion notification...`+sub.endpoint);
      const notificationOptions = {
        title: "Account Deleted",
        body: "Your account has been deleted by an administrator. You will be logged out.",
        icon: "/logo192.png",
        badge: "/logo192.png",
        tag: "account-deleted",
        requireInteraction: true,
        data: {
          type: "account_deleted",
          redirect: "/authentication/sign-in"
        }
      };

      try {
        await webpush.sendNotification(pushSubscription, JSON.stringify(notificationOptions),{ TTL: 60,              // message valid for 60 sec
  urgency: "high"  });
        console.log(`✅ [PUSH] Account deletion notification sent to user ${id}`);
      } catch (pushError) {
        console.error(`⚠️ [PUSH] Failed to send push notification to user ${id}:`, pushError.message);
        if (pushError.statusCode === 410) {
          // Subscription expired, delete it
          await PushSubscription.destroy({ where: { id: userSubscription.id } });
        }
      }
    }

    // Emit socket event to deleted user (if online)
    io.to(String(id)).emit("deleted_user", {
      id: `account-deleted-${id}`,
      type: "account_deleted",
      message: "Your account has been deleted",
      timestamp: new Date(),
      status: "error"
    });
    console.log(`[EMIT] Account deletion message sent to user ${id}`);

    const message = `User "${user.name}" has been deleted successfully`;
    await user.destroy();
    if (io) {
      console.log(`\n[USER_DELETE] User ${loggedInUserId} deleted user ${id}`);
      
      // Save to database for actor
      await notificationService(loggedInUserId, "user_deleted", message);

      console.log("Deleted the user");
      // 📢 Send NOTIFICATION to all OTHER users (not the actor)
      const allUsers = await User.findAll({});
      for (const u of allUsers) {
        if (u.id !== loggedInUserId) {
          io.to(String(u.id)).emit("notification", {
            id: `user-deleted-${id}`,
            type: "user_deleted",
            message: message,
            timestamp: new Date(),
            status: "info"
          });
          // Save to database for each user
          await notificationService(u.id, "user_deleted", message);
          console.log(`📢 [EMIT] Notification sent to room: ${u.id}`);
        }
      }

      // Emit user list update to all
      const userdata = await User.findAll({});
      io.emit("user-list", userdata);
    }

    res.status(200).json({ message: "User deleted successfully" });
  } catch (error) {
    console.error("Error deleting user:", error);
    res.status(500).json({ error: "Failed to delete user" });
  }
});

// POST /api/signup - Self-registration with invitation (similar to /invite)
router.post("/signup", async (req, res) => {
  try {
    const {
      name,
      email,
      password
    } = req.body;

    if (!email || !name || !password) {
      return res.status(400).json({ error: "Email, name, and password are required" });
    }

    // Check if email already exists in User table with success status
    const existingUser = await User.findOne({ where: { email, status: "success" } });
    if (existingUser) {
      return res.status(400).json({ error: "Email already exists" });
    }

    // Check if pending invitation exists
    const existingPendingInvitation = await Invitation.findOne({ where: { email, status: "pending" } });
    if (existingPendingInvitation) {
      return res.status(400).json({ error: "An invitation for this email is already pending" });
    }

    // Delete any existing pending invitations for this email
    await Invitation.destroy({ where: { email, status: "pending" } });

    // Create invitation with token and 15-minute expiration
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000);
    const invitation = await Invitation.create({
      name,
      email,
      password,
      role: "user",
      expiresAt,
      phone_number: null,
      address: null,
      work_title: null,
      work_place: null,
      company: null,
    });

    // Generate verify link
    const verifyLink = `${process.env.FRONTEND_URL}/verify/${invitation.token}`;

    // Send verification email
    await sendInvitationEmail(email, verifyLink);

    // Emit notification
    const io = req.app.get("io");
    if (io) {
      console.log(`\n[SIGNUP] New signup: ${email}`);
      const message = `Welcome ${name}! Please check your email to verify your account.`;

      // 📢 Notification to all existing users (signup is public, no actor socket yet)
      const allUsers = await User.findAll();
      for (const u of allUsers) {
        io.to(String(u.id)).emit("notification", {
          id: `signup-${email}-${Date.now()}`,
          type: "user_signup",
          message: `New signup: ${email}`,
          timestamp: new Date(),
          status: "success"
        });
        await notificationService(u.id, "user_signup", `New signup: ${email}`);
        console.log(`📢 [EMIT] Notification sent to room: ${u.id}`);
      }

      // Note: Save will happen after user accepts the invitation in respond-invite
      // For now, we store in invitation pending state
      // The notification will be saved to database once user is created (in respond-invite)
    }

    res.status(201).json({
      message: "Signup successful! Please check your email to verify your account.",
      token: invitation.token,
    });
  } catch (error) {
    console.error("Error during signup:", error);
    res.status(500).json({ error: "Failed to complete signup" });
  }
});

// POST /api/update-user-info - Update additional user information (JWT protected)
router.post("/update-user-info", async (req, res) => {
  try {
    const io = req.app.get("io");
    const userId = req.user.id;

    const token = req.headers.authorization?.split(" ")[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    const loggedInUserId = decoded.id;

    console.log("Updating user info for userId:", userId);
    console.log("Received data for update:", req.body);
    const {
      phone_number,
      address,
      work_title,
      work_place,
      company
    } = req.body;
    const user = await User.findByPk(userId);

    await User.update(
      {
        phone_number: phone_number || null,
        address: address || null,
        work_title: work_title || null,
        work_place: work_place || null,
        company: company || null,
      },
      { where: { id: userId } }
    )

    // Fetch updated user
    const updatedUser = await User.findByPk(userId, {
      attributes: {
        exclude: ['password']
      }
    });

    // Emit notification to all users
    if (io) {
      console.log(`\n[USER_UPDATE] User ${loggedInUserId} updated profile info`);
      const message = "Your profile has been updated successfully";
      
      // 🍞 Toast to actor (who updated profile)
      io.to(String(loggedInUserId)).emit("toast", {
        id: `profile-updated-${userId}`,
        type: "profile_updated",
        message: message,
        timestamp: new Date(),
        status: "success"
      });
      console.log(` Toast emitted to room: ${loggedInUserId}`);

      // Save to database for actor
      await notificationService(userId, "profile_updated", message);

      const allUsers = await User.findAll();
      for (const u of allUsers) {
        if (u.id !== loggedInUserId) {
          io.to(String(u.id)).emit("notification", {
            id: `profile-updated-${userId}`,
            type: "profile_updated",
            message: `${user.name} has updated their profile`,
            timestamp: new Date(),
            status: "success"
          });
          await notificationService(u.id, "profile_updated", `${user.name} has updated their profile`);
          console.log(`[EMIT] Notification sent to room: ${u.id}`);
        }
      }
    }

    res.status(200).json({
      message: "User information updated successfully",
      user: updatedUser
    });
  } catch (error) {
    console.error("Error updating user information:", error);
    res.status(500).json({ error: "Failed to update user information" });
  }
});

// GET /api/check-incomplete-profile - Check if user needs to complete additional info (JWT protected)
router.get("/check-incomplete-profile/:id", async (req, res) => {
  try {
    const userId = req.params.id;
    const io = req.app.get("io");

    const user = await User.findByPk(userId, {
      attributes: {
        exclude: ['password']
      }
    });
   console.log("Checking incomplete profile for userId:", userId);
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    // Check if user has incomplete profile (missing additional fields)
    const isIncomplete = !user.phone_number || !user.address || !user.work_title || !user.work_place || !user.company;

    res.status(200).json({
      isIncomplete,
      user
    });
  } catch (error) {
    console.error("Error checking profile:", error);
    res.status(500).json({ error: "Failed to check profile" });
  }
});

// GET /api/data-upload/:id - Verify user exists and return current data
router.get("/data-upload/:id", async (req, res) => {
  try {
    const { id } = req.params;
    console.log("Verifying user existence for ID:", id);
    const token = req.headers.authorization?.split(" ")[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    const loggedInUserId = decoded.id;


    const user = await User.findByPk(id, {
      attributes: {
        exclude: ['password']
      }
    });

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    res.status(200).json({
      success: true,
      message: "User verified successfully",
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        phone_number: user.phone_number,
        address: user.address,
        work_title: user.work_title,
        work_place: user.work_place,
        company: user.company,
        profile_image: user.profile_image,
        role: user.role,
        status: user.status,
      }
    });
  } catch (err) {
    console.error("Error verifying user:", err);
    res.status(500).json({ error: "Failed to verify user" });
  }
});

// PUT /api/data-upload/:id - Save additional user information
router.put("/data-upload/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const {
      phone_number,
      address,
      work_title,
      work_place,
      company
    } = req.body;

    console.log("Updating additional info for user ID:", id);
    console.log("Update data:", { phone_number, address, work_title, work_place, company });
    if (!phone_number && !address && !work_title && !work_place && !company) {
      console.log("required all fields");
      return res.status(200).json({ message: "required all field" });
    }

    // Verify user exists
    const user = await User.findByPk(id);
    if (!user) {
      return res.status(404).json({
        success: false,
        error: "User not found"
      });
    }

    // Update user with additional information
    const updatedUser = await User.update(
      {
        phone_number: phone_number || null,
        address: address || null,
        work_title: work_title || null,
        work_place: work_place || null,
        company: company || null,
      },
      {
        where: { id },
        returning: true,
        plain: true
      }
    );

    // Fetch updated user data
    const userData = await User.findByPk(id, {
      attributes: {
        exclude: ['password']
      }
    });

    console.log("Updated user data:", userData);

    // Emit notification
    const io = req.app.get("io");
    const updatedInfo = await User.findAll({ where: { id: id } });

    const token = req.headers.authorization?.split(" ")[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    const loggedInUserId = decoded.id;

    if (io) {
      io.to(String(loggedInUserId)).emit("update-user-info", { updatedInfo });
      console.log(`[EMIT] Update-user-info event sent to room: ${loggedInUserId}`);
    }

    if (io) {
      console.log(`\n[DATA_UPLOAD] User ${loggedInUserId} updated profile data for user ${id}`);
      const message = "Profile information has been updated successfully";
      
      // 🍞 Toast to actor (who is updating)
      io.to(String(loggedInUserId)).emit("toast", {
        id: `user-info-update-${id}-${Date.now()}`,
        type: "user_info_updated",
        message: message,
        timestamp: new Date(),
        status: "success"
      });
      console.log(`✅ [EMIT] Toast emitted to room: ${loggedInUserId}`);

      // Save to database for actor
      await notificationService(loggedInUserId, "user_info_updated", message);

      // 📢 Notification to all other users
      const allUsers = await User.findAll();
      for (const u of allUsers) {
        if (u.id !== loggedInUserId) {
          io.to(String(u.id)).emit("notification", {
            id: `user-info-update-${id}-${Date.now()}`,
            type: "user_info_updated",
            message: `${decoded.name || 'User'} has updated their profile information`,
            timestamp: new Date(),
            status: "success"
          });
          await notificationService(u.id, "user_info_updated", `${decoded.name || 'User'} has updated their profile information`);
          console.log(`📢 [EMIT] Notification sent to room: ${u.id}`);
        }
      }
    }

    res.status(200).json({
      success: true,
      message: "Additional information saved successfully",
      user: {
        id: userData.id,
        name: userData.name,
        email: userData.email,
        phone_number: userData.phone_number,
        address: userData.address,
        work_title: userData.work_title,
        work_place: userData.work_place,
        company: userData.company,
        profile_image: userData.profile_image,
        role: userData.role,
        status: userData.status,
      }
    });
  } catch (err) {
    console.error("Error updating additional info:", err);
    res.status(500).json({
      success: false,
      error: "Failed to save additional information"
    });
  }
});

// GET /api/notifications - Fetch user's notifications (JWT protected)
router.get("/notifications", verifyToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const limit = req.query.limit || 50;

    const notifications = await Notification.findAll({
      // where:{
      //   userId :{
      //     [Op.ne]:loggedInUserId
      //   }
      // },
      order: [["createdAt", "DESC"]],
      limit: parseInt(limit)
    });

    res.status(200).json({
      success: true,
      notifications: notifications
    });
  } catch (error) {
    console.error("Error fetching notifications:", error);
    res.status(500).json({
      success: false,
      error: "Failed to fetch notifications"
    });
  }
});

router.delete("/notifications/:id", async (req, res) => {
  const { id } = req.params;
  try {
    const notification = await Notification.findByPk(id);
    if (!notification) {
      return res.status(404).json({ error: "Notification not found" });
    }
    await notification.destroy();
    res.status(200).json({ message: "Notification deleted successfully" });
  } catch (error) {
    console.error("Error deleting notification:", error);
    res.status(500).json({ error: "Failed to delete notification" });
  }
});

// ================================================================
// PUSH NOTIFICATIONS API ENDPOINTS
// ================================================================

// GET /api/vapid-public-key - Return VAPID public key for client
router.get("/vapid-public-key", (req, res) => {
  try {
    res.status(200).json({
      publicKey: process.env.VAPID_PUBLIC_KEY
    });
  } catch (error) {
    console.error("Error fetching VAPID public key:", error);
    res.status(500).json({ error: "Failed to fetch VAPID public key" });
  }
});

// POST /api/subscribe - Save user push subscription
router.post("/subscribe", verifyToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const { subscription } = req.body;

    if (!subscription || !subscription.endpoint) {
      return res.status(400).json({ error: "Valid subscription object required" });
    }

    // Extract subscription details
    const { endpoint, keys } = subscription;
    const { p256dh, auth } = keys;

    if (!endpoint || !p256dh || !auth) {
      return res.status(400).json({ error: "Missing required subscription keys" });
    }

    // Delete any existing subscription for this user
    await PushSubscription.destroy({ where: { userId } });

    // Save new subscription
    const pushSub = await PushSubscription.create({
      userId,
      endpoint,
      p256dh,
      auth
    });

    console.log(`✅ [PUSH] User ${userId} subscribed to push notifications`);
    res.status(201).json({
      message: "Subscribed to push notifications",
      subscriptionId: pushSub.id
    });
  } catch (error) {
    console.error("Error subscribing to push notifications:", error);
    res.status(500).json({ error: "Failed to subscribe to push notifications" });
  }
});

// POST /api/send-push-notification - For testing push notifications
router.post("/send-push-notification", verifyToken, async (req, res) => {
  try {
    const { userId, title, message } = req.body;

    if (!userId || !title || !message) {
      return res.status(400).json({ error: "userId, title, and message are required" });
    }

    const subscription = await PushSubscription.findOne({ where: { userId } });

    if (!subscription) {
      return res.status(404).json({ error: "User has no push subscription" });
    }

    const pushSubscription = {
      endpoint: subscription.endpoint,
      keys: {
        p256dh: subscription.p256dh,
        auth: subscription.auth
      }
    };

    const options = {
      title: title,
      body: message,
      icon: "/logo192.png",
      badge: "/logo192.png",
      tag: "notification",
      requireInteraction: true
    };

    try {
      await webpush.sendNotification(pushSubscription, JSON.stringify(options),{ TTL: 60,              // message valid for 60 sec
  urgency: "high"  });
      console.log(`✅ [PUSH] Push notification sent to user ${userId}`);
      res.status(200).json({ message: "Push notification sent successfully" });
    } catch (error) {
      if (error.statusCode === 410) {
        // Subscription has expired, delete it
        await PushSubscription.destroy({ where: { id: subscription.id } });
        console.log(`⚠️ [PUSH] Subscription expired and removed for user ${userId}`);
      }
      throw error;
    }
  } catch (error) {
    console.error("Error sending push notification:", error);
    res.status(500).json({ error: "Failed to send push notification" });
  }
});

module.exports = router;
