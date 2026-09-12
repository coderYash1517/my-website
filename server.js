const express = require("express");
const path = require("path");
const Database = require("better-sqlite3");

const app = express();
const PORT = process.env.PORT || 3000;
const db = new Database("travel10.db");

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  phone TEXT NOT NULL UNIQUE,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS rides (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  booking_code TEXT NOT NULL UNIQUE,
  user_id INTEGER,
  vehicle TEXT NOT NULL,
  pickup TEXT NOT NULL,
  destination TEXT NOT NULL,
  pickup_lat REAL NOT NULL,
  pickup_lng REAL NOT NULL,
  drop_lat REAL NOT NULL,
  drop_lng REAL NOT NULL,
  distance_km REAL NOT NULL,
  fare REAL NOT NULL,
  status TEXT NOT NULL DEFAULT 'searching',
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(user_id) REFERENCES users(id)
);
`);

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

app.post("/api/users", (req, res) => {
  const { name, phone } = req.body;
  if (!name || !phone) return res.status(400).json({error:"Name and phone are required."});

  let user = db.prepare("SELECT * FROM users WHERE phone=?").get(phone);
  if (!user) {
    const result = db.prepare("INSERT INTO users (name, phone) VALUES (?, ?)").run(name.trim(), phone.trim());
    user = db.prepare("SELECT * FROM users WHERE id=?").get(result.lastInsertRowid);
  } else if (name.trim() && user.name !== name.trim()) {
    db.prepare("UPDATE users SET name=? WHERE id=?").run(name.trim(), user.id);
    user = db.prepare("SELECT * FROM users WHERE id=?").get(user.id);
  }
  res.json(user);
});

app.post("/api/rides", (req, res) => {
  const {
    userId, vehicle, pickup, destination,
    pickupLat, pickupLng, dropLat, dropLng, distanceKm, fare
  } = req.body;

  if (!pickup || !destination || !vehicle ||
      !Number.isFinite(pickupLat) || !Number.isFinite(pickupLng) ||
      !Number.isFinite(dropLat) || !Number.isFinite(dropLng) ||
      !Number.isFinite(distanceKm) || !Number.isFinite(fare)) {
    return res.status(400).json({error:"Missing or invalid booking details."});
  }

  const bookingCode = "T10-" + Math.floor(100000 + Math.random() * 900000);
  const result = db.prepare(`
    INSERT INTO rides
    (booking_code,user_id,vehicle,pickup,destination,pickup_lat,pickup_lng,drop_lat,drop_lng,distance_km,fare)
    VALUES (?,?,?,?,?,?,?,?,?,?,?)
  `).run(
    bookingCode, userId || null, vehicle, pickup, destination,
    pickupLat, pickupLng, dropLat, dropLng,
    Number(distanceKm.toFixed(2)), Math.round(fare)
  );

  const ride = db.prepare("SELECT * FROM rides WHERE id=?").get(result.lastInsertRowid);
  res.status(201).json(ride);
});

app.get("/api/rides/:code", (req, res) => {
  const ride = db.prepare("SELECT * FROM rides WHERE booking_code=?").get(req.params.code);
  if (!ride) return res.status(404).json({error:"Booking not found."});
  res.json(ride);
});

app.get("/api/rides", (req, res) => {
  const rides = db.prepare("SELECT * FROM rides ORDER BY id DESC LIMIT 50").all();
  res.json(rides);
});

app.patch("/api/rides/:code/status", (req, res) => {
  const allowed = ["searching","accepted","arriving","started","completed","cancelled"];
  const { status } = req.body;
  if (!allowed.includes(status)) return res.status(400).json({error:"Invalid status."});
  const result = db.prepare("UPDATE rides SET status=? WHERE booking_code=?").run(status, req.params.code);
  if (!result.changes) return res.status(404).json({error:"Booking not found."});
  res.json(db.prepare("SELECT * FROM rides WHERE booking_code=?").get(req.params.code));
});

app.use((req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Travel10 running at http://localhost:${PORT}`);
});