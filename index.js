// index.js
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const http = require('http');
const { Server } = require('socket.io');

const authRoutes = require('./routes/auth');
const eventRoutes = require('./routes/events');
const socketManager = require('./ws/socket.js');

const app = express();
const server = http.createServer(app);
const PORT = process.env.PORT || 3000;

app.set('trust proxy', 1);
app.use(express.json());

const allowedOrigins = [
  'https://localhost:5173',
  'https://geolocalizaci-n-escolar.vercel.app'   
];

app.use(cors({
  origin: function (origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('No accesible'));
    }
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  credentials: true
}));

// WebSockets
const io = new Server(server, {
  cors: {
    origin: allowedOrigins,
    methods: ["GET", "POST"]
  }
});

// Inicializa WebSockets
socketManager(io);

// Rutas
app.use('/auth', authRoutes);
app.use('/events', eventRoutes(io));

server.listen(PORT, () => {
  console.log(`Servidor corriendo en puerto ${PORT}`);
});
