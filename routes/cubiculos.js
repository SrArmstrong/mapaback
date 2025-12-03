const express = require('express');
const db = require('../config/db');
const authenticateToken = require('../middleware/auth'); 

module.exports = function (io) {
  const router = express.Router();

  // Nuevo cubículo
  router.post('/', authenticateToken, async (req, res) => {
    try {
      const { 
        edificio, 
        numeroCubiculo, 
        planta, 
        profesorId 
      } = req.body;

      // Validaciones
      if (!edificio || !numeroCubiculo || !planta) {
        return res.status(400).json({ 
          error: 'Faltan campos requeridos: edificio, numeroCubiculo, planta' 
        });
      }

      let codigo = req.body.codigo;
      if (!codigo) {
        codigo = `${edificio}-${numeroCubiculo}-${planta}`.replace(/\s+/g, '_').toUpperCase();
      }

      // Código del cubiculo
      const existingDoc = await db.collection('cubiculos').doc(codigo).get();
      if (existingDoc.exists) {
        return res.status(400).json({ 
          error: 'Ya existe un cubículo con este código' 
        });
      }

      // Verificar existencia del profesor
      if (profesorId) {
        const profesorDoc = await db.collection('profesores').doc(profesorId).get();
        if (!profesorDoc.exists) {
          return res.status(404).json({
            error: 'El profesor especificado no existe'
          });
        }

        // Verificar si ya está asignado a otro cubículo
        const cubiculoExistente = await db.collection('cubiculos')
          .where('profesorId', '==', profesorId)
          .get();

        if (!cubiculoExistente.empty) {
          return res.status(400).json({
            error: 'Este profesor ya tiene un cubículo asignado'
          });
        }
      }


      const nuevoCubiculo = {
        codigo,
        edificio,
        numeroCubiculo,
        planta,
        profesorId: profesorId || null,
        createdAt: new Date().toISOString(),
        createdBy: req.user.email
      };

      await db.collection('cubiculos').doc(codigo).set(nuevoCubiculo);

      // Conexión Socket
      io.emit('cubiculo.created', nuevoCubiculo);

      res.status(201).json({ 
        message: 'Cubículo creado correctamente',
        data: nuevoCubiculo
      });
    } catch (err) {
      console.error('Error al crear cubículo:', err);
      res.status(500).json({ error: 'Error al crear cubículo' });
    }
  });

  // Mostrar cubículos
  router.get('/', async (req, res) => {
    try {
      const snapshot = await db.collection('cubiculos').get();
      
      // Combinar datos de profesor si existe
      const cubiculos = await Promise.all(
        snapshot.docs.map(async (doc) => {
          const cubiculoData = doc.data();
          
          // Obtener datos del profesor si existe
          if (cubiculoData.profesorId) {
            const profesorDoc = await db.collection('profesores').doc(cubiculoData.profesorId).get();
            if (profesorDoc.exists) {
              const profesorData = profesorDoc.data();
              return {
                ...cubiculoData,
                profesorNombre: profesorData.nombre,
                profesorTurno: profesorData.turno
              };
            }
          }
          
          return cubiculoData;
        })
      );

      res.json(cubiculos);
    } catch (err) {
      console.error('Error al obtener cubículos:', err);
      res.status(500).json({ error: 'Error al obtener cubículos' });
    }
  });

  // Obtener cubículo especifico
  router.get('/:codigo', authenticateToken, async (req, res) => {
    try {
      const doc = await db.collection('cubiculos').doc(req.params.codigo).get();
      
      if (!doc.exists) {
        return res.status(404).json({ error: 'Cubículo no encontrado' });
      }

      const cubiculoData = doc.data();
      
      // Si tiene profesor asignado, obtener sus datos
      if (cubiculoData.profesorId) {
        const profesorDoc = await db.collection('profesores').doc(cubiculoData.profesorId).get();
        if (profesorDoc.exists) {
          const profesorData = profesorDoc.data();
          cubiculoData.profesorNombre = profesorData.nombre;
          cubiculoData.profesorTurno = profesorData.turno;
        }
      }

      res.json(cubiculoData);
    } catch (err) {
      console.error('Error al obtener cubículo:', err);
      res.status(500).json({ error: 'Error al obtener cubículo' });
    }
  });

  // Actualizar cubículo
  router.put('/:codigo', authenticateToken, async (req, res) => {
    try {
      const { codigo } = req.params;
      const updateData = req.body;

      // Verificar que el cubículo exista
      const cubiculoDoc = await db.collection('cubiculos').doc(codigo).get();
      if (!cubiculoDoc.exists) {
        return res.status(404).json({ error: 'Cubículo no encontrado' });
      }

      // Si se cambia el profesorId, verificar que exista
      if (updateData.profesorId !== undefined) {
        if (updateData.profesorId) {
          const profesorDoc = await db.collection('profesores').doc(updateData.profesorId).get();
          if (!profesorDoc.exists) {
            return res.status(404).json({ 
              error: 'El profesor especificado no existe' 
            });
          }
        }
      }

      // Añadir timestamp y usuario que actualiza
      updateData.updatedAt = new Date().toISOString();
      updateData.updatedBy = req.user.email;

      await db.collection('cubiculos').doc(codigo).update(updateData);

      const updatedCubiculo = { codigo, ...updateData };
      io.emit('cubiculo.updated', updatedCubiculo);

      res.json({ 
        message: 'Cubículo actualizado correctamente',
        data: updatedCubiculo
      });
    } catch (err) {
      console.error('Error al actualizar cubículo:', err);
      res.status(500).json({ error: 'Error al actualizar cubículo' });
    }
  });

  // Eliminar cubículo
  router.delete('/:codigo', authenticateToken, async (req, res) => {
    try {
      const { codigo } = req.params;

      // Verificar que el cubículo exista
      const cubiculoDoc = await db.collection('cubiculos').doc(codigo).get();
      if (!cubiculoDoc.exists) {
        return res.status(404).json({ error: 'Cubículo no encontrado' });
      }

      await db.collection('cubiculos').doc(codigo).delete();

      io.emit('cubiculo.deleted', { codigo });

      res.json({ message: 'Cubículo eliminado correctamente' });
    } catch (err) {
      console.error('Error al eliminar cubículo:', err);
      res.status(500).json({ error: 'Error al eliminar cubículo' });
    }
  });

  // Buscar cubículos por edificio o planta (Prueba por aplicar)
  router.get('/buscar/filtros', authenticateToken, async (req, res) => {
    try {
      const { edificio, planta } = req.query;
      let query = db.collection('cubiculos');

      if (edificio) {
        query = query.where('edificio', '==', edificio);
      }
      if (planta) {
        query = query.where('planta', '==', planta);
      }

      const snapshot = await query.get();
      const cubiculos = snapshot.docs.map(doc => doc.data());
      res.json(cubiculos);
    } catch (err) {
      console.error('Error al buscar cubículos:', err);
      res.status(500).json({ error: 'Error al buscar cubículos' });
    }
  });

  // Obtener cubículos disponibles (sin profesor asignado)
  router.get('/disponibles', authenticateToken, async (req, res) => {
    try {
      const snapshot = await db.collection('cubiculos')
        .where('profesorId', '==', null)
        .get();
      
      const cubiculos = snapshot.docs.map(doc => doc.data());
      res.json(cubiculos);
    } catch (err) {
      console.error('Error al obtener cubículos disponibles:', err);
      res.status(500).json({ error: 'Error al obtener cubículos disponibles' });
    }
  });

  return router;
};