const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const mongoose = require('mongoose');
const { connectAngelOne } = require('./services/angelone');
const positionsRoute = require('./routes/positions');
const monitorRoute = require('./routes/monitor');

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

// Connect to MongoDB
mongoose.connect(process.env.MONGODB_URI)
  .then(() => console.log('MongoDB connected successfully!'))
  .catch((err) => console.log('MongoDB connection error:', err));

// Connect to Angel One
connectAngelOne();

// Routes
app.use('/api/positions', positionsRoute);
app.use('/api/monitor', monitorRoute);

app.get('/', (req, res) => {
  res.send('Trading App Backend is running!');
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});