// index.js
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const http = require('http');
const { Server } = require('socket.io');
const rateLimit = require("express-rate-limit");
const authRoutes = require('./routes/auth');
const eventRoutes = require('./routes/events');
const cubiculoRoutes = require('./routes/cubiculos');
const profesorRoutes = require('./routes/profesores');
const socketManager = require('./ws/socket.js');

const app = express();
const server = http.createServer(app);
const PORT = process.env.PORT || 3000;

app.set('trust proxy', 1);
app.use(express.json());

// Rate limit global
const globalLimiter = rateLimit({
  windowMs: 20 * 60 * 1000,
  max: 100,                
  message: { error: "Demasiadas peticiones" }
});

app.use(globalLimiter);

const allowedOrigins = [
  'https://localhost',
  'http://localhost',
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
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error("Not allowed"));
      }
    },
    methods: ["GET", "POST"],
    credentials: true
  }
});


// Iniciar socket
socketManager(io);

// Rutas
app.use('/auth', authRoutes);
app.use('/events', eventRoutes(io));
app.use('/cubiculos', cubiculoRoutes(io));
app.use('/profesores', profesorRoutes(io));

server.listen(PORT, () => {
  console.log(`Servidor corriendo en puerto ${PORT}`);
});
