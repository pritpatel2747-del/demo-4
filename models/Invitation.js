const { DataTypes } = require("sequelize");
const sequelize = require("../config/database");
const { v4: uuidv4 } = require("uuid");

const generateToken = () => {
  return uuidv4().replace(/-/g, "").substring(0, 32);
};

const Invitation = sequelize.define(
  "Invitation",
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
    token: {
      type: DataTypes.STRING(32),
      allowNull: false,
      unique: true,
      defaultValue: generateToken,
    },
    expiresAt: {
      type: DataTypes.DATE,
      allowNull: false,
    },
    status: {
      type: DataTypes.ENUM("pending", "accepted", "rejected"),
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
  },
  {
    timestamps: false,
    tableName: "invitations",
  },
);

module.exports = Invitation;
