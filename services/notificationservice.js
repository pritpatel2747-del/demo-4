const Notification = require("../models/notification");

// Save notification to database
const notificationService = async (userId, type, message) => {
  try {
    if (!userId || !type || !message) {
      console.warn("Invalid notification params:", { userId, type, message });
      return null;
    }
    
      const notification = await Notification.create({
        userId,
        type,
        message,
        createdAt: new Date()
      });
      return notification


    ;
  } catch (error) {
    console.error("Error saving notification:", error);
    return null;
  }
};

exports.notificationService = notificationService;