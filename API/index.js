const express = require('express');
const cors = require('cors');
const pool = require('./db');
require('dotenv').config();

const app = express();

// Middlewares
app.use(cors());
app.use(express.json()); // Para recibir JSON en los body requests

// ==========================================
// 1. INICIO DE SESIÓN (LOGIN) - Web y Móvil
// ==========================================
app.post('/api/login', async (req, res) => {
    const { correo, clave } = req.body;
    try {
        const [rows] = await pool.query(
            'SELECT id, nombre, apellido_paterno, correo, activo, tipo_usuario FROM usuarios WHERE correo = ? AND clave = ?',
            [correo, clave]
        );

        if (rows.length > 0) {
            const usuario = rows[0];
            if (usuario.activo === 0) {
                return res.status(403).json({ mensaje: 'Usuario inactivo. Contacte al administrador.' });
            }
            res.json({ mensaje: 'Login exitoso', usuario });
        } else {
            res.status(401).json({ mensaje: 'Correo o contraseña incorrectos' });
        }
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ==========================================
// 2. GESTIÓN DE PELÍCULAS
// ==========================================

// Obtener todas las películas (Para la tabla web y app móvil)
app.get('/api/peliculas', async (req, res) => {
    const { activa } = req.query; // Si mandas ?activa=1 solo trae las activas (ideal para la app móvil)
    try {
        let query = `
            SELECT p.id, p.nombre, p.imagen, p.link, p.descripcion, p.activo, g.nombre as genero 
            FROM peliculas p 
            JOIN generos g ON p.genero = g.id
        `;
        if (activa === '1') query += ' WHERE p.activo = 1';

        const [rows] = await pool.query(query);
        res.json(rows);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Registrar una nueva película
app.post('/api/peliculas', async (req, res) => {
    // Nota: Para subir la imagen real necesitarías Multer, aquí guardamos el nombre/ruta
    const { nombre, genero, imagen, link, descripcion } = req.body;
    try {
        const [result] = await pool.query(
            'INSERT INTO peliculas (nombre, genero, imagen, link, descripcion) VALUES (?, ?, ?, ?, ?)',
            [nombre, genero, imagen, link, descripcion]
        );
        res.json({ mensaje: 'Película registrada con éxito', id: result.insertId });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Modificar película
app.put('/api/peliculas/:id', async (req, res) => {
    const { id } = req.params;
    const { nombre, genero, imagen, link, descripcion } = req.body;
    try {
        await pool.query(
            'UPDATE peliculas SET nombre = ?, genero = ?, imagen = ?, link = ?, descripcion = ? WHERE id = ?',
            [nombre, genero, imagen, link, descripcion, id]
        );
        res.json({ mensaje: 'Película actualizada' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Activar/Inactivar Película (Botones rojo y azul de la tabla)
app.patch('/api/peliculas/:id/estado', async (req, res) => {
    const { id } = req.params;
    const { activo } = req.body; // 1 para activar, 0 para inactivar
    try {
        await pool.query('UPDATE peliculas SET activo = ? WHERE id = ?', [activo, id]);
        res.json({ mensaje: `Película ${activo ? 'activada' : 'inactivada'}` });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ==========================================
// 3. GESTIÓN DE USUARIOS Y CLIENTES
// ==========================================

// Obtener usuarios (puedes filtrar por tipo_usuario: ?tipo=cliente o ?tipo=administrador)
app.get('/api/usuarios', async (req, res) => {
    const { tipo } = req.query;
    try {
        let query = 'SELECT id, nombre, apellido_paterno, apellido_materno, correo, fecha_registro, activo, tipo_usuario FROM usuarios';
        const params = [];
        
        if (tipo) {
            query += ' WHERE tipo_usuario = ?';
            params.push(tipo);
        }

        const [rows] = await pool.query(query, params);
        res.json(rows);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Registrar un nuevo usuario (sirve para clientes o administradores)
app.post('/api/usuarios', async (req, res) => {
    const { nombre, apellido_paterno, apellido_materno, correo, clave, tipo_usuario } = req.body;
    try {
        const [result] = await pool.query(
            'INSERT INTO usuarios (nombre, apellido_paterno, apellido_materno, correo, clave, tipo_usuario) VALUES (?, ?, ?, ?, ?, ?)',
            [nombre, apellido_paterno, apellido_materno, correo, clave, tipo_usuario || 'cliente']
        );
        res.json({ mensaje: 'Usuario registrado con éxito', id: result.insertId });
    } catch (error) {
        // Código de error 1062 es duplicado (ej: correo ya existe)
        if (error.code === 'ER_DUP_ENTRY') {
            return res.status(400).json({ error: 'El correo ya está registrado' });
        }
        res.status(500).json({ error: error.message });
    }
});

// Actualizar usuario (Botón amarillo)
app.put('/api/usuarios/:id', async (req, res) => {
    const { id } = req.params;
    const { nombre, apellido_paterno, apellido_materno, correo, clave } = req.body;
    try {
        await pool.query(
            'UPDATE usuarios SET nombre = ?, apellido_paterno = ?, apellido_materno = ?, correo = ?, clave = ? WHERE id = ?',
            [nombre, apellido_paterno, apellido_materno, correo, clave, id]
        );
        res.json({ mensaje: 'Usuario actualizado' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Activar/Inactivar o Eliminar usuario
// Activar/Inactivar (Botón azul)
app.patch('/api/usuarios/:id/estado', async (req, res) => {
    const { id } = req.params;
    const { activo } = req.body;
    try {
        await pool.query('UPDATE usuarios SET activo = ? WHERE id = ?', [activo, id]);
        res.json({ mensaje: `Usuario ${activo ? 'activado' : 'inactivado'}` });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Eliminar usuario (Botón rojo - Soft delete o Hard delete según prefieras. Aquí es hard delete)
app.delete('/api/usuarios/:id', async (req, res) => {
    const { id } = req.params;
    try {
        await pool.query('DELETE FROM usuarios WHERE id = ?', [id]);
        res.json({ mensaje: 'Usuario eliminado permanentemente' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ==========================================
// 4. OTROS (Géneros para el combo box)
// ==========================================
app.get('/api/generos', async (req, res) => {
    try {
        const [rows] = await pool.query('SELECT * FROM generos');
        res.json(rows);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Arrancar el servidor
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Servidor de Streaming corriendo en el puerto ${PORT}`);
});