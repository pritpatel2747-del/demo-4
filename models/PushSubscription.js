const { DataTypes } = require("sequelize");
const sequelize = require("../config/database");

const PushSubscription = sequelize.define(
  "PushSubscription",
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    userId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: "users",
        key: "id",
      },
      onDelete: "CASCADE",
    },
    endpoint: {
      type: DataTypes.STRING(500),
      allowNull: false,
    },
    p256dh: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    auth: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    createdAt: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
      allowNull: false,
    },
  },
  {
    timestamps: false,
    tableName: "push_subscriptions",
  }
);

module.exports = PushSubscription;
