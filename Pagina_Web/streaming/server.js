require('dotenv').config();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const express = require('express');
const session = require('express-session');
const axios = require('axios');

const app = express();
const API = process.env.API_URL;

// Configuración de Express
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 1000 * 60 * 60 * 4} // 4 horas para la sesión
}));

// Crear carpeta uploads
const uploadsDir = path.join(__dirname, 'public', 'uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadsDir),
    filename:    (req, file, cb) => {
        const unique = Date.now() + '-' + Math.round(Math.random() * 1e9);
        cb(null, unique + path.extname(file.originalname));
    }
});
const upload = multer({
    storage,
    limits: { fileSize: 5 * 1024 * 1024 }, // 5MB máx
    fileFilter: (req, file, cb) => {
        const allowed = /jpeg|jpg|png|gif|webp/;
        cb(null, allowed.test(path.extname(file.originalname).toLowerCase()));
    }
});

//Middleware: proteger rutas
function auth(req, res, next) {
    if (!req.session.usuario) return res.redirect('/login');
    next();
}

//Generar clave aleatoria para nuevo usuario
function generarClave() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    return Array.from({ length: 7 }, () =>
        chars[Math.floor(Math.random() * chars.length)]
    ).join('');
}

//Login y logout

app.get('/', (req, res) => res.redirect('/login'));

app.get('/login', (req, res) => {
    if (req.session.usuario) return res.redirect('/peliculas/registrar');
    res.render('login', { error: null });
});

app.post('/login', async (req, res) => {
    const { correo, clave } = req.body;
    try {
        const { data } = await axios.post(`${API}/api/login`, { correo, clave });

        if (data.usuario.tipo_usuario !== 'administrador') {
            return res.render('login', { error: 'Acceso denegado: solo administradores.' });
        }

        req.session.usuario = data.usuario;
        res.redirect('/peliculas/registrar');
    } catch (err) {
        const msg = err.response?.data?.mensaje || 'Correo o contraseña incorrectos.';
        res.render('login', { error: msg });
    }
});

app.get('/logout', (req, res) => {
    req.session.destroy();
    res.redirect('/login');
});

//Películas

app.get('/peliculas/registrar', auth, async (req, res) => {
    try {
        const { data: generos } = await axios.get(`${API}/api/generos`);
        res.render('peliculas-registrar', {
            usuario: req.session.usuario,
            generos,
            success: null,
            error: null
        });
    } catch {
        res.render('peliculas-registrar', {
            usuario: req.session.usuario,
            generos: [],
            success: null,
            error: 'Error al cargar géneros.'
        });
    }
});

app.post('/peliculas/registrar', auth, upload.single('imagenArchivo'), async (req, res) => {
    const { nombre, genero, link, descripcion } = req.body;
    const imagen = req.file ? `/uploads/${req.file.filename}` : (req.body.imagen || '');
    let success = null, error = null;

    try {
        await axios.post(`${API}/api/peliculas`, { nombre, genero, link, imagen, descripcion });
        success = 'Película registrada exitosamente.';
    } catch {
        error = 'Error al registrar la película.';
    }

    const { data: generos } = await axios.get(`${API}/api/generos`).catch(() => ({ data: [] }));
    res.render('peliculas-registrar', { usuario: req.session.usuario, generos, success, error });
});

app.get('/peliculas/consultar', auth, async (req, res) => {
    try {
        const { data: peliculas } = await axios.get(`${API}/api/peliculas`);
        res.render('peliculas-consultar', {
            usuario: req.session.usuario,
            peliculas,
            success: null,
            error: null
        });
    } catch {
        res.render('peliculas-consultar', {
            usuario: req.session.usuario,
            peliculas: [],
            success: null,
            error: 'Error al cargar películas.'
        });
    }
});

app.post('/peliculas/:id/activar', auth, async (req, res) => {
    await axios.patch(`${API}/api/peliculas/${req.params.id}/estado`, { activo: 1 }).catch(() => {});
    res.redirect('/peliculas/consultar');
});

app.post('/peliculas/:id/inactivar', auth, async (req, res) => {
    await axios.patch(`${API}/api/peliculas/${req.params.id}/estado`, { activo: 0 }).catch(() => {});
    res.redirect('/peliculas/consultar');
});

app.get('/peliculas/:id/modificar', auth, async (req, res) => {
    try {
        const [{ data: peliculas }, { data: generos }] = await Promise.all([
            axios.get(`${API}/api/peliculas`),
            axios.get(`${API}/api/generos`)
        ]);
        const pelicula = peliculas.find(p => p.id == req.params.id) || {};
        res.render('peliculas-modificar', { usuario: req.session.usuario, pelicula, generos, error: null });
    } catch {
        res.redirect('/peliculas/consultar');
    }
});

app.post('/peliculas/:id/modificar', auth, upload.single('imagenArchivo'), async (req, res) => {
    const { nombre, genero, link, descripcion } = req.body;
    const imagen = req.file ? `/uploads/${req.file.filename}` : (req.body.imagen || '');
    await axios.put(`${API}/api/peliculas/${req.params.id}`,
        { nombre, genero, link, imagen, descripcion }).catch(() => {});
    res.redirect('/peliculas/consultar');
});

//Usuarios
app.get('/usuarios', auth, async (req, res) => {
    const { filtroTipo } = req.query;
    const url = filtroTipo ? `${API}/api/usuarios?tipo=${filtroTipo}` : `${API}/api/usuarios`;
    try {
        const { data: usuarios } = await axios.get(url);
        res.render('usuarios-registro', {
            usuario: req.session.usuario,
            usuarios,
            filtroTipo: filtroTipo || '',
            claveGenerada: generarClave(),
            success: null,
            error: null
        });
    } catch {
        res.render('usuarios-registro', {
            usuario: req.session.usuario,
            usuarios: [],
            filtroTipo: '',
            claveGenerada: generarClave(),
            success: null,
            error: 'Error al cargar usuarios.'
        });
    }
});

app.post('/usuarios/registrar', auth, async (req, res) => {
    const { nombre, apellido_paterno, apellido_materno, correo, tipo_usuario, claveGenerada } = req.body;
    let success = null, error = null;

    try {
        await axios.post(`${API}/api/usuarios`, {
            nombre, apellido_paterno, apellido_materno,
            correo, clave: claveGenerada, tipo_usuario
        });
        success = `Usuario registrado. Clave asignada: ${claveGenerada}`;
    } catch (err) {
        error = err.response?.data?.error || 'Error al registrar usuario.';
    }

    const { data: usuarios } = await axios.get(`${API}/api/usuarios`).catch(() => ({ data: [] }));
    res.render('usuarios-registro', {
        usuario: req.session.usuario,
        usuarios,
        filtroTipo: '',
        claveGenerada: generarClave(),
        success,
        error
    });
});

app.get('/usuarios/:id/modificar', auth, async (req, res) => {
    try {
        const { data: usuarios } = await axios.get(`${API}/api/usuarios`);
        const usuarioEdit = usuarios.find(u => u.id == req.params.id) || {};
        res.render('usuarios-modificar', {
            usuario: req.session.usuario,
            usuarioEdit,
            error: null,
            success: null
        });
    } catch {
        res.redirect('/usuarios');
    }
});

app.post('/usuarios/:id/modificar', auth, async (req, res) => {
    const { nombre, apellido_paterno, apellido_materno, correo, clave } = req.body;
    const payload = { nombre, apellido_paterno, apellido_materno, correo };
    if (clave && clave.trim() !== '') payload.clave = clave.trim();

    try {
        await axios.put(`${API}/api/usuarios/${req.params.id}`, payload);
        res.redirect('/usuarios');
    } catch {
        const { data: usuarios } = await axios.get(`${API}/api/usuarios`).catch(() => ({ data: [] }));
        const usuarioEdit = usuarios.find(u => u.id == req.params.id) || {};
        res.render('usuarios-modificar', {
            usuario: req.session.usuario,
            usuarioEdit,
            error: 'Error al actualizar el usuario.',
            success: null
        });
    }
});

app.post('/usuarios/:id/activar', auth, async (req, res) => {
    await axios.patch(`${API}/api/usuarios/${req.params.id}/estado`, { activo: 1 }).catch(() => {});
    res.redirect('/usuarios');
});

app.post('/usuarios/:id/inactivar', auth, async (req, res) => {
    await axios.patch(`${API}/api/usuarios/${req.params.id}/estado`, { activo: 0 }).catch(() => {});
    res.redirect('/usuarios');
});

app.get('/registro', (req, res) => {
    // Si hay sesión activa de admin, destruirla
    if (req.session.usuario) {
        req.session.destroy(() => {
            res.render('registro', { error: null, success: null });
        });
        return;
    }
    res.render('registro', { error: null, success: null });
});

//Registro de clientes (sin autenticación)
app.post('/registro', async (req, res) => {
    const { nombre, apellido_paterno, apellido_materno, correo } = req.body;
    const clave = generarClave();
    try {
        await axios.post(`${API}/api/usuarios`, {
            nombre, apellido_paterno, apellido_materno,
            correo, clave, tipo_usuario: 'cliente'
        });
        res.render('registro', {
            error: null,
            success: `Cuenta creada. Tu clave de acceso es: ${clave}`
        });
    } catch (err) {
        const msg = err.response?.data?.error || 'Error al registrar. Intenta de nuevo.';
        res.render('registro', { error: msg, success: null });
    }
});

//Endpoint para subir imágenes de películas
app.post('/peliculas/imagen', auth, upload.single('imagen'), (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'No se subió ninguna imagen.' });
    res.json({ url: `/uploads/${req.file.filename}` });
});
//Iniciar servidor
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`✓ Servidor corriendo en http://localhost:${PORT}`);
});