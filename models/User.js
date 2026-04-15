const { DataTypes } = require("sequelize");
const sequelize = require("../config/database");
const bcrypt = require("bcryptjs");

const User = sequelize.define(
  "User",
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    name: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    email: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true,
      validate: {
        isEmail: true,
      },
    },
    password: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    role: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: "user",
    },
    status: {
      type: DataTypes.ENUM("pending", "success", "rejected"),
      defaultValue: "pending",
      allowNull: false,
    },
    phone_number: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    address: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    work_title: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    work_place: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    company: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    profile_image: {
      type: DataTypes.STRING,
      allowNull: true,
      defaultValue: null,
    },
    createdAt: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
      allowNull: false,
    },
  },
  {
    timestamps: false,
    tableName: "users",
    hooks: {
      beforeCreate: async (user) => {
        if (user.password) {
          const salt = await bcrypt.genSalt(10);
          user.password = await bcrypt.hash(user.password, salt);
        }
      },
      beforeUpdate: async (user) => {
        if (user.changed("password") && user.password) {
          const salt = await bcrypt.genSalt(10);
          user.password = await bcrypt.hash(user.password, salt);
        }
      },
    },
  },
);

// Instance method to compare passwords
User.prototype.validatePassword = async function (password) {
  return await bcrypt.compare(password, this.password);
};

module.exports = User;
