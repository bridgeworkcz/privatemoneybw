const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const app = express();
const JWT_SECRET = 'super-secret-key-change-it';

// Налаштування завантаження файлів
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const dir = './uploads';
        if (!fs.existsSync(dir)) fs.mkdirSync(dir);
        cb(null, dir);
    },
    filename: (req, file, cb) => {
        cb(null, Date.now() + '-' + file.originalname);
    }
});
const upload = multer({ storage });

app.use(express.json());
app.use(express.static('public'));
app.use('/uploads', express.static('uploads'));

// Ініціалізація БД
const db = new sqlite3.Database('./database.sqlite');

db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email TEXT UNIQUE,
        password TEXT,
        role TEXT DEFAULT 'client',
        name TEXT
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS applications (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER,
        title TEXT,
        status TEXT DEFAULT 'Pending',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS files (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        application_id INTEGER,
        filename TEXT,
        filepath TEXT
    )`);

    db.run(`INSERT OR IGNORE INTO settings (key, value) VALUES 
        ('phone', '+380000000000'),
        ('email', 'info@site.com'),
        ('crypto_wallet', '0x1234567890abcdef')`);
    
    const adminHash = bcrypt.hashSync('admin123', 10);
    db.run(`INSERT OR IGNORE INTO users (email, password, role, name) VALUES 
        ('admin@site.com', '${adminHash}', 'admin', 'System Admin')`);
});

// Middleware авторизації
const authenticate = (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(401).json({ error: 'Unauthorised' });
    const token = authHeader.split(' ')[1];
    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) return res.status(403).json({ error: 'Forbidden' });
        req.user = user;
        next();
    });
};

const requireAdmin = (req, res, next) => {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin access required' });
    next();
};

// API
app.post('/api/register', (req, res) => {
    const { email, password, name } = req.body;
    const hash = bcrypt.hashSync(password, 10);
    db.run(`INSERT INTO users (email, password, name) VALUES (?, ?, ?)`, [email, hash, name], function(err) {
        if (err) return res.status(400).json({ error: 'User already exists' });
        res.json({ success: true, userId: this.lastID });
    });
});

app.post('/api/login', (req, res) => {
    const { email, password } = req.body;
    db.get(`SELECT * FROM users WHERE email = ?`, [email], (err, user) => {
        if (err || !user || !bcrypt.compareSync(password, user.password)) {
            return res.status(400).json({ error: 'Invalid credentials' });
        }
        const token = jwt.sign({ id: user.id, role: user.role, email: user.email, name: user.name }, JWT_SECRET);
        res.json({ token, role: user.role, name: user.name });
    });
});

app.get('/api/settings', (req, res) => {
    db.all(`SELECT * FROM settings`, [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        const settings = {};
        rows.forEach(r => settings[r.key] = r.value);
        res.json(settings);
    });
});

app.post('/api/settings', authenticate, requireAdmin, (req, res) => {
    const { phone, email, crypto_wallet } = req.body;
    db.serialize(() => {
        if (phone) db.run(`INSERT OR REPLACE INTO settings (key, value) VALUES ('phone', ?)`, [phone]);
        if (email) db.run(`INSERT OR REPLACE INTO settings (key, value) VALUES ('email', ?)`, [email]);
        if (crypto_wallet) db.run(`INSERT OR REPLACE INTO settings (key, value) VALUES ('crypto_wallet', ?)`, [crypto_wallet]);
        res.json({ success: true, message: 'Settings updated' });
    });
});

app.post('/api/applications', authenticate, upload.single('file'), (req, res) => {
    const { title } = req.body;
    db.run(`INSERT INTO applications (user_id, title) VALUES (?, ?)`, [req.user.id, title], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        const appId = this.lastID;
        if (req.file) {
            db.run(`INSERT INTO files (application_id, filename, filepath) VALUES (?, ?, ?)`, 
                [appId, req.file.originalname, req.file.path]);
        }
        res.json({ success: true, applicationId: appId });
    });
});

app.get('/api/my-applications', authenticate, (req, res) => {
    const query = `
        SELECT a.*, f.filepath, f.filename 
        FROM applications a 
        LEFT JOIN files f ON a.id = f.application_id 
        WHERE a.user_id = ?`;
    db.all(query, [req.user.id], (err, rows) => {
        res.json(rows);
    });
});

app.get('/api/admin/applications', authenticate, requireAdmin, (req, res) => {
    const query = `
        SELECT a.*, u.email, u.name as client_name, f.filepath, f.filename 
        FROM applications a 
        JOIN users u ON a.user_id = u.id 
        LEFT JOIN files f ON a.id = f.application_id`;
    db.all(query, [], (err, rows) => {
        res.json(rows);
    });
});

app.patch('/api/admin/applications/:id/status', authenticate, requireAdmin, (req, res) => {
    const { status } = req.body;
    db.run(`UPDATE applications SET status = ? WHERE id = ?`, [status, req.params.id], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true });
    });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
