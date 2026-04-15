const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Notification = sequelize.define('Notification', {
  // Primary Key
  id: {
    type: DataTypes.INTEGER,
    autoIncrement: true,
    primaryKey: true
  },
  // Notification type (e.g., 'user_login', 'user_signup', 'invite_sent', etc.)
  type: {
    type: DataTypes.STRING,
    allowNull: true
  },
  // Notification message content
  message: {
    type: DataTypes.STRING,
    allowNull: true
  },
  // User ID - which user received this notification
  userId: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: {
      model: 'users',
      key: 'id'
    },
    onDelete: 'Set Null',
  },
  // Timestamp when notification was created
  createdAt: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW,
    allowNull: true
  }
}, {
  tableName: 'notifications',
  timestamps: false
});

Notification.sync();
module.exports = Notification;
