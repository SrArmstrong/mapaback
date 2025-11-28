// routes/auth.js
const express = require('express');
const bcrypt = require('bcrypt');
const speakeasy = require('speakeasy');
const db = require('../config/db');
require('dotenv').config();

const jwt = require('jsonwebtoken');

const router = express.Router();

const rateLimit = require("express-rate-limit");

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 3,
  message: { error: "Demasiados intentos, intenta más tarde" }
});

function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // "Bearer <token>"

  if (!token) return res.status(401).json({ error: 'Permiso denegado' });

  jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
    if (err) return res.status(403).json({ error: 'Invalido/Expirado' });

    req.user = user; // Guardamos info del usuario en la request
    next(); // Continuamos al siguiente middleware/endpoint
  });
}

router.post('/register', authenticateToken, async (req, res) => {
  try {
    const { email, password } = req.body;

    // Verificar si ya existe el usuario
    const userRef = db.collection('users').doc(email);
    const userDoc = await userRef.get();

    if (userDoc.exists) {
      return res.status(400).json({ message: 'El email ya está registrado' });
    }

    // Encriptar contraseña
    const passwordHash = await bcrypt.hash(password, 10);

    // Generar secreto TOTP
    const totpSecret = speakeasy.generateSecret({ length: 20 });

    // Guardar en Firestore
    await userRef.set({
      email,
      passwordHash,
      totpSecret: totpSecret.base32
    });

    res.json({
      message: 'Usuario registrado',
      totpSecret: totpSecret.otpauth_url
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Error al registrar usuario' });
  }
});


router.post('/login', loginLimiter, async (req, res) => {
  const { email, password, token } = req.body;

  const userDoc = await db.collection('users').doc(email).get();
  if (!userDoc.exists) return res.status(404).json({ error: 'Usuario no encontrado' });

  const user = userDoc.data();

  // Validar contraseña
  const validPassword = await bcrypt.compare(password, user.passwordHash);
  if (!validPassword) return res.status(401).json({ error: 'Contraseña incorrecta' });

  // Validar TOTP
  const validToken = speakeasy.totp.verify({
    secret: user.totpSecret,
    encoding: 'base32',
    token
  });

  if (!validToken) return res.status(401).json({ error: 'Código TOTP inválido' });

  // Generar token
  const bearerToken = jwt.sign(
    { email: user.email }, 
    process.env.JWT_SECRET, 
    { expiresIn: '15m' }
  );

  res.json({
    message: 'Inicio de sesión exitoso',
    token: bearerToken
  });
});


module.exports = router;
