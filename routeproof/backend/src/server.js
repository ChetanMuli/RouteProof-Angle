require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const app = express();
app.use(cors());
app.use(express.json({ limit: '1mb' }));
app.use('/uploads', express.static(path.join(__dirname, '..', 'uploads')));

app.get('/api/health', (req, res) => res.json({ ok: true }));
app.use('/api', require('./routes/auth'));
app.use('/api', require('./routes/driver'));
app.use('/api', require('./routes/visits'));
app.use('/api', require('./routes/reports'));
app.use('/api', require('./routes/admin'));

// Optional: serve the built React app from the same server (npm run build in /frontend)
const dist = path.join(__dirname, '..', '..', 'frontend', 'dist');
if (fs.existsSync(dist)) {
  app.use(express.static(dist));
  app.get(/^\/(?!api|uploads).*/, (req, res) => res.sendFile(path.join(dist, 'index.html')));
}

app.use('/api', (req, res) => res.status(404).json({ error: 'Not found' }));
app.use((err, req, res, next) => {
  if (err.code === 'LIMIT_FILE_SIZE') return res.status(413).json({ error: 'File is too large (max 10 MB)' });
  console.error(err);
  res.status(err.status || 500).json({ error: err.status ? err.message : (err.message && err.message.startsWith('Only image') ? err.message : 'Something went wrong. Please try again.') });
});

const port = process.env.PORT || 5000;
app.listen(port, () => console.log(`RouteProof API running on http://localhost:${port}`));
