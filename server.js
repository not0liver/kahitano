import express from "express";
import bodyParser from "body-parser";
import mongoose from "mongoose";
import session from "express-session";
import path from "path";
import bcrypt from "bcrypt";
import dotenv from "dotenv";
import Brevo from "@getbrevo/brevo";
import { fileURLToPath } from "url";
import Appointment from "./models/Appointment.js";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log("✅ MongoDB connected"))
  .catch(err => console.error("❌ MongoDB connection error:", err));

// ----------------- USER MODEL -----------------
const userSchema = new mongoose.Schema({
  email: { type: String, unique: true, required: true },
  password: { type: String, required: true },
  verified: { type: Boolean, default: false },
  verificationCode: { type: String }
});

const User = mongoose.model("User", userSchema);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, "public")));
app.use(
  session({
    secret: process.env.SESSION_SECRET || "supersecretkey",
    resave: false,
    saveUninitialized: false,
    cookie: { secure: false },
  })
);

// ----------------- BREVO SETUP -----------------
const brevoClient = Brevo.ApiClient.instance;
const apiKey = brevoClient.authentications["api-key"];
apiKey.apiKey = process.env.BREVO_API_KEY;

const brevo = new Brevo.TransactionalEmailsApi();

// ----------------- ROUTES -----------------
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "login.html"));
});

app.post("/signup", async (req, res) => {
  const { email, password } = req.body;
  try {
    const existing = await User.findOne({ email });
    if (existing) {
      return res.send("<script>alert('Email already registered.'); window.location.href='/'</script>");
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const code = Math.floor(100000 + Math.random() * 900000).toString();

    await User.create({
      email,
      password: hashedPassword,
      verificationCode: code,
    });

    await brevo.sendTransacEmail({
      sender: { email: "youremail@gmail.com", name: "Auth App" },
      to: [{ email }],
      subject: "Verify your email address",
      htmlContent: `<h2>Verify Your Email</h2><p>Your code is <b>${code}</b></p>`,
    });

    req.session.pendingUser = email;
    res.redirect("/verify.html");
  } catch (err) {
    console.error("Signup error:", err);
    res.status(500).send("Error creating account.");
  }
});

app.post("/verify", async (req, res) => {
  const { code } = req.body;
  const email = req.session.pendingUser;
  if (!email) return res.redirect("/");

  try {
    const user = await User.findOne({ email });
    if (user && user.verificationCode === code) {
      user.verified = true;
      user.verificationCode = null;
      await user.save();

      req.session.user = user.email;
      delete req.session.pendingUser;
      res.redirect("/home");
    } else {
      res.send("<script>alert('Invalid verification code'); window.location.href='/verify.html'</script>");
    }
  } catch (err) {
    console.error("Verification error:", err);
    res.status(500).send("Verification failed.");
  }
});

app.post("/login", async (req, res) => {
  const { email, password } = req.body;
  try {
    const user = await User.findOne({ email });
    if (!user) {
      return res.send("<script>alert('Invalid email or password'); window.location.href='/'</script>");
    }

    if (!user.verified) {
      return res.send("<script>alert('Please verify your email before logging in'); window.location.href='/'</script>");
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.send("<script>alert('Invalid email or password'); window.location.href='/'</script>");
    }

    req.session.user = user.email;
    res.redirect("/home");
  } catch (err) {
    console.error("Login error:", err);
    res.status(500).send("Error logging in.");
  }
});

app.get("/logout", (req, res) => {
  req.session.destroy(() => res.redirect("/"));
});

app.get("/home", (req, res) => {
  if (!req.session.user) return res.redirect("/");
  res.sendFile(path.join(__dirname, "protected", "home.html"));
});

app.post("/api/appointments", async (req, res) => {
  if (!req.session.user) return res.status(401).json({ error: "Unauthorized" });

  try {
    const { type, date, time } = req.body;
    if (!type || !date || !time) return res.status(400).json({ error: "Missing fields" });

    const appointment = await Appointment.create({
      userEmail: req.session.user,
      type,
      date,
      time,
    });

    res.status(201).json(appointment);
  } catch (err) {
    console.error("Error creating appointment:", err);
    res.status(500).json({ error: "Server error" });
  }
});

app.get("/api/appointments", async (req, res) => {
  if (!req.session.user) return res.status(401).json({ error: "Unauthorized" });

  try {
    const appointments = await Appointment.find({ userEmail: req.session.user });
    res.json(appointments);
  } catch (err) {
    console.error("Error fetching appointments:", err);
    res.status(500).json({ error: "Server error" });
  }
});

app.patch("/api/appointments/:id/accept", async (req, res) => {
  if (!req.session.user) return res.status(401).json({ error: "Unauthorized" });

  try {
    const { id } = req.params;
    const updated = await Appointment.findOneAndUpdate(
      { _id: id, userEmail: req.session.user },
      { status: "Confirmed" },
      { new: true }
    );

    if (!updated) return res.status(404).json({ error: "Appointment not found or unauthorized" });

    await brevo.sendTransacEmail({
      sender: { email: "youremail@gmail.com", name: "Appointment Portal" },
      to: [{ email: updated.userEmail }],
      subject: "Appointment Confirmed ✅",
      htmlContent: `
        <h2>Appointment Confirmed</h2>
        <p>Your appointment has been confirmed.</p>
        <ul>
          <li><b>Type:</b> ${updated.type}</li>
          <li><b>Date:</b> ${updated.date}</li>
          <li><b>Time:</b> ${updated.time}</li>
        </ul>
      `,
    });

    res.json({ message: "Appointment accepted and email sent.", appointment: updated });
  } catch (err) {
    console.error("Error accepting appointment:", err);
    res.status(500).json({ error: "Server error" });
  }
});

app.patch("/api/appointments/:id/cancel", async (req, res) => {
  if (!req.session.user) return res.status(401).json({ error: "Unauthorized" });

  try {
    const { id } = req.params;
    const updated = await Appointment.findOneAndUpdate(
      { _id: id, userEmail: req.session.user },
      { status: "Cancelled" },
      { new: true }
    );

    if (!updated) return res.status(404).json({ error: "Appointment not found or unauthorized" });

    await brevo.sendTransacEmail({
      sender: { email: "youremail@gmail.com", name: "Appointment System" },
      to: [{ email: updated.userEmail }],
      subject: "Appointment Cancelled ❌",
      htmlContent: `
        <h2>Appointment Cancelled</h2>
        <p>Your appointment for <b>${updated.type}</b> on <b>${updated.date}</b> at <b>${updated.time}</b> has been cancelled.</p>
      `,
    });

    res.json({ message: "Appointment cancelled and email sent.", appointment: updated });
  } catch (err) {
    console.error("Error canceling appointment:", err);
    res.status(500).json({ error: "Server error" });
  }
});

app.listen(PORT, () => console.log(`✅ Server running at http://localhost:${PORT}`));
