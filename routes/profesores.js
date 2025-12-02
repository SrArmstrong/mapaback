const express = require('express');
const db = require('../config/db');
const jwt = require('jsonwebtoken');

module.exports = function (io) {
  const router = express.Router();

  // 🔐 Middleware de autenticación
  function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) return res.status(401).json({ error: 'Permiso denegado' });

    jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
      if (err) return res.status(403).json({ error: 'Token inválido o expirado' });
      req.user = user;
      next();
    });
  }

  // 📌 Crear un nuevo profesor
  router.post('/', authenticateToken, async (req, res) => {
    try {
      const { nombre, turno } = req.body;

      // Validaciones
      if (!nombre || !turno) {
        return res.status(400).json({ 
          error: 'Faltan campos requeridos: nombre, turno' 
        });
      }

      if (!['Matutino', 'Vespertino', 'Ambos'].includes(turno)) {
        return res.status(400).json({ 
          error: 'Turno no válido. Debe ser: Matutino, Vespertino o Ambos' 
        });
      }

      // Generar código único si no se proporciona
      let codigo = req.body.codigo;
      if (!codigo) {
        // Crear código a partir del nombre: "Juan Pérez" -> "JUAN-PEREZ"
        codigo = nombre
          .toUpperCase()
          .normalize("NFD").replace(/[\u0300-\u036f]/g, "") // Eliminar acentos
          .replace(/[^A-Z\s]/g, "") // Solo letras y espacios
          .replace(/\s+/g, '-'); // Espacios por guiones
      }

      // Verificar si ya existe un profesor con el mismo código
      const existingDoc = await db.collection('profesores').doc(codigo).get();
      if (existingDoc.exists) {
        // Si existe, añadir sufijo numérico
        let counter = 1;
        let newCodigo = codigo;
        while (true) {
          const checkDoc = await db.collection('profesores').doc(`${codigo}-${counter}`).get();
          if (!checkDoc.exists) {
            newCodigo = `${codigo}-${counter}`;
            break;
          }
          counter++;
        }
        codigo = newCodigo;
      }

      const nuevoProfesor = {
        codigo,
        nombre,
        turno,
        createdAt: new Date().toISOString(),
        createdBy: req.user.email
      };

      await db.collection('profesores').doc(codigo).set(nuevoProfesor);

      // 🔥 Emitir en tiempo real
      io.emit('profesor.created', nuevoProfesor);

      res.status(201).json({ 
        message: 'Profesor creado correctamente',
        data: nuevoProfesor
      });
    } catch (err) {
      console.error('Error al crear profesor:', err);
      res.status(500).json({ error: 'Error al crear profesor' });
    }
  });

  // 📌 Obtener todos los profesores
  router.get('/', authenticateToken, async (req, res) => {
    try {
      const snapshot = await db.collection('profesores').get();
      const profesores = snapshot.docs.map(doc => doc.data());
      res.json(profesores);
    } catch (err) {
      console.error('Error al obtener profesores:', err);
      res.status(500).json({ error: 'Error al obtener profesores' });
    }
  });

  // 📌 Obtener profesor por código
  router.get('/:codigo', authenticateToken, async (req, res) => {
    try {
      const doc = await db.collection('profesores').doc(req.params.codigo).get();
      
      if (!doc.exists) {
        return res.status(404).json({ error: 'Profesor no encontrado' });
      }

      const profesorData = doc.data();

      // Obtener cubículos asignados a este profesor
      const cubiculosSnapshot = await db.collection('cubiculos')
        .where('profesorId', '==', req.params.codigo)
        .get();
      
      const cubiculosAsignados = cubiculosSnapshot.docs.map(doc => {
        const cubiculo = doc.data();
        return {
          codigo: cubiculo.codigo,
          edificio: cubiculo.edificio,
          numeroCubiculo: cubiculo.numeroCubiculo,
          planta: cubiculo.planta
        };
      });

      profesorData.cubiculosAsignados = cubiculosAsignados;

      res.json(profesorData);
    } catch (err) {
      console.error('Error al obtener profesor:', err);
      res.status(500).json({ error: 'Error al obtener profesor' });
    }
  });

  // 📌 Actualizar profesor
  router.put('/:codigo', authenticateToken, async (req, res) => {
    try {
      const { codigo } = req.params;
      const updateData = req.body;

      // Verificar que el profesor exista
      const profesorDoc = await db.collection('profesores').doc(codigo).get();
      if (!profesorDoc.exists) {
        return res.status(404).json({ error: 'Profesor no encontrado' });
      }

      // Validar turno si se actualiza
      if (updateData.turno && !['Matutino', 'Vespertino', 'Ambos'].includes(updateData.turno)) {
        return res.status(400).json({ 
          error: 'Turno no válido. Debe ser: Matutino, Vespertino o Ambos' 
        });
      }

      // Añadir timestamp de actualización
      updateData.updatedAt = new Date().toISOString();
      updateData.updatedBy = req.user.email;

      await db.collection('profesores').doc(codigo).update(updateData);

      // 🔥 Emitir en tiempo real
      const updatedProfesor = { codigo, ...updateData };
      io.emit('profesor.updated', updatedProfesor);

      // Si se cambia el código del profesor, actualizar los cubículos asignados
      if (updateData.codigo && updateData.codigo !== codigo) {
        // Actualizar referencia en cubículos
        const cubiculosSnapshot = await db.collection('cubiculos')
          .where('profesorId', '==', codigo)
          .get();
        
        const updatePromises = cubiculosSnapshot.docs.map(doc => 
          doc.ref.update({ profesorId: updateData.codigo })
        );
        
        await Promise.all(updatePromises);
      }

      res.json({ 
        message: 'Profesor actualizado correctamente',
        data: updatedProfesor
      });
    } catch (err) {
      console.error('Error al actualizar profesor:', err);
      res.status(500).json({ error: 'Error al actualizar profesor' });
    }
  });

  // 📌 Eliminar profesor
  router.delete('/:codigo', authenticateToken, async (req, res) => {
    try {
      const { codigo } = req.params;

      // Verificar que el profesor exista
      const profesorDoc = await db.collection('profesores').doc(codigo).get();
      if (!profesorDoc.exists) {
        return res.status(404).json({ error: 'Profesor no encontrado' });
      }

      // Verificar si tiene cubículos asignados
      const cubiculosSnapshot = await db.collection('cubiculos')
        .where('profesorId', '==', codigo)
        .get();
      
      if (!cubiculosSnapshot.empty) {
        // Desasignar cubículos
        const updatePromises = cubiculosSnapshot.docs.map(doc => 
          doc.ref.update({ profesorId: null })
        );
        await Promise.all(updatePromises);
      }

      await db.collection('profesores').doc(codigo).delete();

      // 🔥 Emitir en tiempo real
      io.emit('profesor.deleted', { codigo });

      res.json({ 
        message: 'Profesor eliminado correctamente. Los cubículos asignados han sido liberados.'
      });
    } catch (err) {
      console.error('Error al eliminar profesor:', err);
      res.status(500).json({ error: 'Error al eliminar profesor' });
    }
  });

  // 📌 Buscar profesores por nombre o turno
  router.get('/buscar/filtros', authenticateToken, async (req, res) => {
    try {
      const { nombre, turno } = req.query;
      
      // Esta es una búsqueda básica. Para búsquedas más complejas,
      // necesitarías un índice o buscar en memoria
      let query = db.collection('profesores');
      
      const snapshot = await query.get();
      let profesores = snapshot.docs.map(doc => doc.data());
      
      // Filtrar en memoria (Firestore no soporta búsqueda por subcadena fácilmente)
      if (nombre) {
        const nombreLower = nombre.toLowerCase();
        profesores = profesores.filter(p => 
          p.nombre.toLowerCase().includes(nombreLower)
        );
      }
      
      if (turno) {
        profesores = profesores.filter(p => p.turno === turno);
      }
      
      res.json(profesores);
    } catch (err) {
      console.error('Error al buscar profesores:', err);
      res.status(500).json({ error: 'Error al buscar profesores' });
    }
  });

  // 📌 Obtener profesores sin cubículo asignado
  router.get('/sin-cubiculo', authenticateToken, async (req, res) => {
    try {
      const profesoresSnapshot = await db.collection('profesores').get();
      const cubiculosSnapshot = await db.collection('cubiculos').get();
      
      // Crear conjunto de códigos de profesores con cubículo
      const profesoresConCubiculo = new Set();
      cubiculosSnapshot.docs.forEach(doc => {
        const cubiculo = doc.data();
        if (cubiculo.profesorId) {
          profesoresConCubiculo.add(cubiculo.profesorId);
        }
      });
      
      // Filtrar profesores sin cubículo
      const profesoresSinCubiculo = profesoresSnapshot.docs
        .map(doc => doc.data())
        .filter(profesor => !profesoresConCubiculo.has(profesor.codigo));
      
      res.json(profesoresSinCubiculo);
    } catch (err) {
      console.error('Error al obtener profesores sin cubículo:', err);
      res.status(500).json({ error: 'Error al obtener profesores sin cubículo' });
    }
  });

  return router;
};