const fs = require("fs");
const path = require("path");
const bcrypt = require("bcryptjs");

const USERS_FILE = path.join(__dirname, "..", "data", "users.json");
const MOBILE_REGEX = /^[6-9]\d{9}$/; // Indian 10-digit mobile numbers

function loadUsers() {
  if (!fs.existsSync(USERS_FILE)) return [];
  return JSON.parse(fs.readFileSync(USERS_FILE, "utf-8"));
}

function saveUsers(users) {
  fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
}

function findUser(username) {
  return loadUsers().find((u) => u.username.toLowerCase() === username.toLowerCase());
}

function findUserByMobile(mobile) {
  return loadUsers().find((u) => u.mobile === mobile);
}

// Accepts either a username or a 10-digit mobile number as the login identifier.
function findUserByIdentifier(identifier) {
  const id = (identifier || "").trim();
  if (MOBILE_REGEX.test(id)) return findUserByMobile(id);
  return findUser(id);
}

function createUser(username, mobile, password) {
  if (!MOBILE_REGEX.test(mobile || "")) {
    throw new Error("Please enter a valid 10-digit Indian mobile number.");
  }
  const users = loadUsers();
  if (findUser(username)) {
    throw new Error("A user with that username already exists.");
  }
  if (findUserByMobile(mobile)) {
    throw new Error("That mobile number is already registered.");
  }
  const passwordHash = bcrypt.hashSync(password, 10);
  const user = { username, mobile, passwordHash, createdAt: new Date().toISOString() };
  users.push(user);
  saveUsers(users);
  return { username: user.username, mobile: user.mobile };
}

function verifyUser(identifier, password) {
  const user = findUserByIdentifier(identifier);
  if (!user) return null;
  const ok = bcrypt.compareSync(password, user.passwordHash);
  return ok ? { username: user.username, mobile: user.mobile } : null;
}

module.exports = { createUser, verifyUser, findUser, findUserByMobile };
