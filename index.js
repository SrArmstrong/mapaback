/*
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
  'http://localhost',
  //'http://localhost:5173',
  //'https://localhost:5173',
  //'capacitor://localhost',
  //'ionic://localhost',
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


// Inicializa WebSockets
socketManager(io);

// Rutas
app.use('/auth', authRoutes);
app.use('/events', eventRoutes(io));

server.listen(PORT, () => {
  console.log(`Servidor corriendo en puerto ${PORT}`);
});
*/
// index.js
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

// Lista de orígenes permitidos (solo web)
const allowedOrigins = [
  'http://localhost',
  'https://localhost:5173',
  'https://geolocalizaci-n-escolar.vercel.app'
];

// Configuración global de CORS (solo orígenes permitidos)
const globalCors = cors({
  origin: function (origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('No accesible'));
    }
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  credentials: true
});


// Configuración especial para /events (acepta !origin)
const eventsCors = cors({
  origin: function (origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('No accesible'));
    }
  },
  methods: ['GET'],
  credentials: true
});

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


// Inicializa WebSockets
socketManager(io);

// Rutas
app.use('/auth', globalCors, authRoutes);   // aplica CORS global
app.use('/events', eventsCors, eventRoutes(io)); // aplica CORS especial

console.log("🔎 Origin recibido:", origin);

server.listen(PORT, () => {
  console.log(`Servidor corriendo en puerto ${PORT}`);
});
